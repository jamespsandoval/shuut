import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  accountBlocksTable,
  foundersTable,
  postsTable,
  postReshuutsTable,
  usersTable,
  accountSanctionsTable,
  type FounderRow,
} from "@workspace/db";
import { canDistributePost, isFounderDistributable } from "./moderation";

const DISTRIBUTABLE_RESHUUT_STATUSES = ["approved", "unreviewed", "pending", "processing", "failed"];
export const MAX_RESHUUT_ANCESTRY = 8;

type ReshuutRow = typeof postReshuutsTable.$inferSelect;
type Chain = { rows: ReshuutRow[]; authors: Map<number, FounderRow> };

// At most MAX_RESHUUT_ANCESTRY ancestor reads, regardless of the number of
// events on a page. Reuse shared parents rather than walking each event alone.
export async function distributableReshuutChains(
  reshuutIds: number[],
  viewerFounderId?: number | null,
): Promise<Map<number, Chain>> {
  const starts = [...new Set(reshuutIds)];
  const rowsById = new Map<number, ReshuutRow>();
  let frontier = starts;
  for (let depth = 0; depth < MAX_RESHUUT_ANCESTRY && frontier.length; depth++) {
    const missing = frontier.filter((id) => !rowsById.has(id));
    const rows = missing.length
      ? await db.select().from(postReshuutsTable).where(inArray(postReshuutsTable.id, missing))
      : [];
    for (const row of rows) rowsById.set(row.id, row);
    frontier = [...new Set(frontier.flatMap((id) => {
      const parent = rowsById.get(id)?.parentReshuutId;
      return parent === null || parent === undefined ? [] : [parent];
    }))];
  }

  const candidates = new Map<number, ReshuutRow[]>();
  for (const id of starts) {
    const chain: ReshuutRow[] = [];
    const seen = new Set<number>();
    let current: number | null = id;
    while (current !== null && chain.length < MAX_RESHUUT_ANCESTRY && !seen.has(current)) {
      seen.add(current);
      const row: ReshuutRow | undefined = rowsById.get(current);
      if (!row) break;
      chain.push(row);
      current = row.parentReshuutId;
    }
    if (current !== null || !chain.length ||
        chain.some((row) => row.postId !== chain[0]!.postId || row.deletionStatus !== "active" ||
          (row.audioUrl && (row.transcriptionStatus !== "ready" || row.moderationStatus !== "approved")) ||
          (row.founderId === viewerFounderId
            ? ["removed", "quarantined"].includes(row.moderationStatus)
            : !DISTRIBUTABLE_RESHUUT_STATUSES.includes(row.moderationStatus)))) continue;
    candidates.set(id, chain);
  }
  if (!candidates.size) return new Map();

  const allRows = [...new Map([...candidates.values()].flat().map((row) => [row.id, row])).values()];
  const authorIds = [...new Set(allRows.map((row) => row.founderId))];
  const postIds = [...new Set([...candidates.values()].map((chain) => chain[0]!.postId))];
  const [founders, posts] = await Promise.all([
    db.select().from(foundersTable).where(inArray(foundersTable.id, authorIds)),
    db.select().from(postsTable).where(inArray(postsTable.id, postIds)),
  ]);
  const authorById = new Map(founders.map((founder) => [founder.id, founder]));
  const postById = new Map(posts.map((post) => [post.id, post]));
  const missingOriginalAuthors = [...new Set(posts.map((post) => post.authorId))]
    .filter((id) => !authorById.has(id));
  if (missingOriginalAuthors.length) {
    const originalAuthors = await db.select().from(foundersTable)
      .where(inArray(foundersTable.id, missingOriginalAuthors));
    for (const author of originalAuthors) authorById.set(author.id, author);
  }
  const participantIds = [...new Set([...authorIds, ...posts.map((post) => post.authorId), ...(viewerFounderId ? [viewerFounderId] : [])])];
  const userIds = [...new Set([...authorById.values()].flatMap((founder) => founder.userId ? [founder.userId] : []))];
  const now = new Date();
  const [users, sanctions, blocks] = await Promise.all([
    userIds.length ? db.select({ id: usersTable.id, deletionStatus: usersTable.deletionStatus })
      .from(usersTable).where(inArray(usersTable.id, userIds)) : [],
    userIds.length ? db.select().from(accountSanctionsTable).where(and(
      inArray(accountSanctionsTable.userId, userIds),
      eq(accountSanctionsTable.status, "active"),
      or(isNull(accountSanctionsTable.expiresAt), gt(accountSanctionsTable.expiresAt, now)),
    )).orderBy(desc(accountSanctionsTable.createdAt)) : [],
    db.select({
      blockerFounderId: accountBlocksTable.blockerFounderId,
      blockedFounderId: accountBlocksTable.blockedFounderId,
    }).from(accountBlocksTable).where(and(
      inArray(accountBlocksTable.blockerFounderId, participantIds),
      inArray(accountBlocksTable.blockedFounderId, participantIds),
    )),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const latestSanction = new Map<string, string>();
  for (const sanction of sanctions) {
    if (sanction.userId && !latestSanction.has(sanction.userId)) latestSanction.set(sanction.userId, sanction.type);
  }
  const activeAuthor = (id: number) => {
    const author = authorById.get(id);
    if (!author) return false;
    const userId = author.userId;
    return !userId || (userById.get(userId)?.deletionStatus === "active" &&
      !["ban", "suspend"].includes(latestSanction.get(userId) ?? ""));
  };
  const visible = new Map<number, Chain>();
  for (const [id, chain] of candidates) {
    const post = postById.get(chain[0]!.postId);
    if (!post || post.deletionStatus !== "active" || post.transcriptionStatus !== "ready" ||
        !DISTRIBUTABLE_RESHUUT_STATUSES.includes(post.moderationStatus)) continue;
    const members = new Set([...chain.map((row) => row.founderId), post.authorId]);
    if ([...members].some((member) => !activeAuthor(member)) ||
        blocks.some((block) => members.has(block.blockerFounderId) && members.has(block.blockedFounderId) ||
          Boolean(viewerFounderId && (
            block.blockerFounderId === viewerFounderId && members.has(block.blockedFounderId) ||
            block.blockedFounderId === viewerFounderId && members.has(block.blockerFounderId)
          )))) continue;
    visible.set(id, { rows: chain, authors: authorById });
  }
  return visible;
}

export async function distributableReshuutChain(
  reshuutId: number,
  viewerFounderId?: number | null,
): Promise<{ rows: Array<typeof postReshuutsTable.$inferSelect>; authors: Map<number, FounderRow> } | null> {
  const rows: Array<typeof postReshuutsTable.$inferSelect> = [];
  const seen = new Set<number>();
  let currentId: number | null = reshuutId;
  while (currentId !== null && rows.length < MAX_RESHUUT_ANCESTRY) {
    if (seen.has(currentId)) return null;
    seen.add(currentId);
    const [row] = await db.select().from(postReshuutsTable).where(and(
      eq(postReshuutsTable.id, currentId),
      eq(postReshuutsTable.deletionStatus, "active"),
    )).limit(1);
    const ownerPreview = row?.founderId === viewerFounderId;
    const unapprovedAudio = Boolean(row?.audioUrl) &&
      (row?.transcriptionStatus !== "ready" || row?.moderationStatus !== "approved");
    if (!row || unapprovedAudio || (ownerPreview
      ? ["removed", "quarantined"].includes(row.moderationStatus)
      : !DISTRIBUTABLE_RESHUUT_STATUSES.includes(row.moderationStatus) ||
        (row.audioUrl && row.transcriptionStatus !== "ready"))) return null;
    rows.push(row);
    currentId = row.parentReshuutId;
  }
  if (currentId !== null) return null;
  const postId = rows[0]?.postId;
  if (rows.some((row) => row.postId !== postId)) return null;
  if (!postId || !(await canDistributePost(postId))) return null;
  const [post] = await db.select({ authorId: postsTable.authorId }).from(postsTable)
    .where(eq(postsTable.id, postId)).limit(1);
  if (!post) return null;
  const authorIds = [...new Set(rows.map((row) => row.founderId))];
  const authors = await db.select().from(foundersTable).where(inArray(foundersTable.id, authorIds));
  const byId = new Map(authors.map((author) => [author.id, author]));
  for (const authorId of authorIds) {
    if (!byId.has(authorId) || !(await isFounderDistributable(authorId))) return null;
  }
  const participantIds = [...new Set([...authorIds, post.authorId])];
  if (participantIds.length > 1) {
    const [blockedPair] = await db.select({ id: accountBlocksTable.id }).from(accountBlocksTable).where(and(
      inArray(accountBlocksTable.blockerFounderId, participantIds),
      inArray(accountBlocksTable.blockedFounderId, participantIds),
    )).limit(1);
    if (blockedPair) return null;
  }
  return { rows, authors: byId };
}
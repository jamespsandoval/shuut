import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  accountBlocksTable,
  foundersTable,
  postsTable,
  postReshuutsTable,
  type FounderRow,
} from "@workspace/db";
import { canDistributePost, isFounderDistributable } from "./moderation";

const DISTRIBUTABLE_RESHUUT_STATUSES = ["approved", "unreviewed", "pending", "processing", "failed"];
export const MAX_RESHUUT_ANCESTRY = 8;

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
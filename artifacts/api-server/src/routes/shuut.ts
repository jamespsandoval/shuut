import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { and, asc, desc, eq, ilike, inArray, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import {
  AskFounderBody,
  AskFounderParams,
  AskFounderResponse,
  CreatePostBody,
  CreatePostResponse,
  DeletePostParams,
  DeletePostResponse,
  DeleteAccountResponse,
  GetFeedQueryParams,
  GetFeedResponse,
  GetPostParams,
  GetPostResponse,
  GetProfileParams,
  GetProfileResponse,
  ReshuutPostParams,
  ReshuutPostResponse,
  SetReactionBody,
  SetReactionParams,
  SetReactionResponse,
  ToggleFollowParams,
  ToggleFollowResponse,
  UpdateProfileBody,
  UpdateProfileParams,
  UpdateProfileResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  TranscribeAudioBody,
  TranscribeAudioResponse,
  UpdatePostBody,
  UpdatePostParams,
  UpdatePostResponse,
  CreatePostShareLinkParams,
  CreatePostShareLinkResponse,
  CreatePostCommentBody,
  CreatePostCommentParams,
  CreatePostCommentResponse,
  GetPostCommentsParams,
  GetPostCommentsResponse,
  GetCommentAudioParams,
  GetNotificationsResponse,
  SearchProfilesQueryParams,
  SearchProfilesResponse,
  CreateReportBody,
  CreateReportResponse,
  BlockAccountParams,
  BlockAccountResponse,
  ListBlockedAccountsResponse,
} from "@workspace/api-zod";
import {
  db,
  foundersTable,
  postsTable,
  postReactionsTable,
  postReshuutsTable,
  commentsTable,
  notificationsTable,
  postMentionsTable,
  profileImageUploadsTable,
  usersTable,
  objectCleanupJobsTable,
  accountBlocksTable,
  accountReportsTable,
  accountFollowsTable,
  type FounderRow,
  type PostRow,
  type CommentRow,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { SIGNED_UPLOAD_TTL_MS } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import {
  clearSessionCookie,
  getAuthenticatedUserId,
} from "../middlewares/sessionAuth";
import { auditSecurityEvent, consumeRateLimit, privacyHash } from "../lib/security";
import { createPostShareToken } from "../lib/postShareToken";
import { queueExpiredPrivateUploads } from "../lib/privateObjectCleanup";
import { requireCurrentLegalPolicyConsent } from "../lib/legalPolicy";

const router: IRouter = Router();
const ASK_MINIMUM_POSTS = 5;
const objectStorage = new ObjectStorageService();
const POST_EDIT_WINDOW_MS = 30 * 1000;
const CLEANUP_RETRY_BASE_MS = 5_000;
const SIGNED_UPLOAD_EXPIRY_SAFETY_MS = 5_000;
class AudioVerificationError extends Error {}

type CleanupScope = { type: "post" | "account" | "orphan"; id: string };

function cleanupBackoff(attempts: number) {
  return Math.min(60 * 60 * 1000, CLEANUP_RETRY_BASE_MS * 2 ** Math.min(attempts, 9));
}

async function finalizeCleanupScope(scope: CleanupScope) {
  const remaining = await db.select({ id: objectCleanupJobsTable.id })
    .from(objectCleanupJobsTable)
    .where(and(
      eq(objectCleanupJobsTable.scopeType, scope.type),
      eq(objectCleanupJobsTable.scopeId, scope.id),
      ne(objectCleanupJobsTable.status, "completed"),
    ))
    .limit(1);
  if (remaining.length) return false;

  await db.transaction(async (tx) => {
    if (scope.type === "post") {
      await tx.delete(postsTable).where(eq(postsTable.id, Number(scope.id)));
    } else if (scope.type === "account") {
      await tx.execute(sql`select id from shuut_users where id = ${scope.id} for update`);
      const [founder] = await tx.select({ id: foundersTable.id })
        .from(foundersTable)
        .where(eq(foundersTable.userId, scope.id))
        .limit(1);
      if (founder) {
        await tx.delete(accountFollowsTable).where(or(
          eq(accountFollowsTable.followerFounderId, founder.id),
          eq(accountFollowsTable.followedFounderId, founder.id),
        ));
        await tx.delete(accountBlocksTable).where(or(
          eq(accountBlocksTable.blockerFounderId, founder.id),
          eq(accountBlocksTable.blockedFounderId, founder.id),
        ));
        await tx.update(accountReportsTable).set({
          reporterFounderId: null,
          targetAuthorId: null,
        }).where(or(
          eq(accountReportsTable.reporterFounderId, founder.id),
          eq(accountReportsTable.targetAuthorId, founder.id),
        ));
        const reactions = await tx.select().from(postReactionsTable)
          .where(eq(postReactionsTable.founderId, founder.id));
        const authoredPosts = await tx.select({ id: postsTable.id })
          .from(postsTable)
          .where(eq(postsTable.authorId, founder.id));
        const postIdsToLock = [...new Set([
          ...reactions.map((reaction) => reaction.postId),
          ...authoredPosts.map((post) => post.id),
        ])].sort((left, right) => left - right);
        for (const postId of postIdsToLock) {
          await tx.execute(sql`select id from shuut_posts where id = ${postId} for update`);
        }
        for (const reaction of reactions) {
          if (reaction.emojiType === "rocket") {
            await tx.update(postsTable)
              .set({ rocket: sql`greatest(0, ${postsTable.rocket} - 1)` })
              .where(eq(postsTable.id, reaction.postId));
          } else if (reaction.emojiType === "laughing") {
            await tx.update(postsTable)
              .set({ laughing: sql`greatest(0, ${postsTable.laughing} - 1)` })
              .where(eq(postsTable.id, reaction.postId));
          } else if (reaction.emojiType === "thumbsDown") {
            await tx.update(postsTable)
              .set({ thumbsDown: sql`greatest(0, ${postsTable.thumbsDown} - 1)` })
              .where(eq(postsTable.id, reaction.postId));
          }
        }
        await tx.delete(foundersTable).where(eq(foundersTable.id, founder.id));
      }
      await tx.delete(profileImageUploadsTable).where(eq(profileImageUploadsTable.userId, scope.id));
      await tx.delete(usersTable).where(eq(usersTable.id, scope.id));
    }
    await tx.delete(objectCleanupJobsTable).where(and(
      eq(objectCleanupJobsTable.scopeType, scope.type),
      eq(objectCleanupJobsTable.scopeId, scope.id),
    ));
  });
  return true;
}

async function processCleanupScope(
  scope: CleanupScope,
  log?: { error: (details: object, message: string) => unknown },
) {
  const jobs = await db.select().from(objectCleanupJobsTable).where(and(
    eq(objectCleanupJobsTable.scopeType, scope.type),
    eq(objectCleanupJobsTable.scopeId, scope.id),
    ne(objectCleanupJobsTable.status, "completed"),
    lte(objectCleanupJobsTable.nextAttemptAt, new Date()),
  ));
  let failed = false;
  for (const job of jobs) {
    try {
      await objectStorage.deleteObject(job.objectPath);
      await db.update(objectCleanupJobsTable).set({
        status: "completed",
        attempts: job.attempts + 1,
        lastError: null,
        updatedAt: new Date(),
      }).where(eq(objectCleanupJobsTable.id, job.id));
    } catch (error) {
      failed = true;
      log?.error({ err: error, cleanupJobId: job.id }, "Object cleanup attempt failed");
      await db.update(objectCleanupJobsTable).set({
        status: "failed",
        attempts: job.attempts + 1,
        lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown storage error",
        nextAttemptAt: new Date(Date.now() + cleanupBackoff(job.attempts + 1)),
        updatedAt: new Date(),
      }).where(eq(objectCleanupJobsTable.id, job.id));
    }
  }
  const completed = await finalizeCleanupScope(scope);
  return completed ? "completed" as const : failed ? "failed" as const : "pending" as const;
}

export async function retryDueCleanupJobs() {
  const due = await db.select({
    type: objectCleanupJobsTable.scopeType,
    id: objectCleanupJobsTable.scopeId,
  }).from(objectCleanupJobsTable).where(and(
    ne(objectCleanupJobsTable.status, "completed"),
    lte(objectCleanupJobsTable.nextAttemptAt, new Date()),
  )).limit(25);
  const deletingPosts = await db.select({ id: postsTable.id })
    .from(postsTable)
    .where(eq(postsTable.deletionStatus, "deleting"))
    .limit(25);
  const deletingUsers = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.deletionStatus, "deleting"))
    .limit(25);
  const scopes = new Map(due.map((row) => [`${row.type}:${row.id}`, {
    type: row.type as CleanupScope["type"],
    id: row.id,
  }]));
  for (const post of deletingPosts) {
    scopes.set(`post:${post.id}`, { type: "post", id: String(post.id) });
  }
  for (const user of deletingUsers) {
    scopes.set(`account:${user.id}`, { type: "account", id: user.id });
  }
  for (const scope of scopes.values()) {
    try {
      await processCleanupScope(scope);
    } catch (error) {
      logger.error({ err: error, scopeType: scope.type, scopeId: scope.id }, "Cleanup scope retry failed");
    }
  }
}

function scheduleCleanupSweep() {
  void retryDueCleanupJobs().catch((error) => {
    logger.error({ err: error }, "Cleanup retry sweep failed");
  });
}

const cleanupTimer = setInterval(scheduleCleanupSweep, 15_000);
cleanupTimer.unref();
scheduleCleanupSweep();

async function currentFounder(userId: string) {
  const [user] = await db.select({ deletionStatus: usersTable.deletionStatus })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.deletionStatus !== "active") return null;
  const [linked] = await db.select().from(foundersTable).where(eq(foundersTable.userId, userId));
  return linked ?? null;
}

async function foundersBlocked(leftId: number, rightId: number) {
  const [row] = await db.select({ id: accountBlocksTable.id })
    .from(accountBlocksTable)
    .where(or(
      and(eq(accountBlocksTable.blockerFounderId, leftId), eq(accountBlocksTable.blockedFounderId, rightId)),
      and(eq(accountBlocksTable.blockerFounderId, rightId), eq(accountBlocksTable.blockedFounderId, leftId)),
    ))
    .limit(1);
  return Boolean(row);
}

async function lockFounderPair(tx: any, leftId: number, rightId: number) {
  const low = Math.min(leftId, rightId);
  const high = Math.max(leftId, rightId);
  await tx.execute(sql`select pg_advisory_xact_lock(${low}::bigint * 1000000 + ${high}::bigint)`);
}

async function visibleToViewer(viewerId: number | null | undefined, authorId: number) {
  return !viewerId || !(await foundersBlocked(viewerId, authorId));
}

async function requireViewer(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const founder = await currentFounder(userId);
  if (!founder) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return { userId, founder };
}

let syntheticProfilesCleaned = false;
async function ensureSeeded(): Promise<void> {
  if (syntheticProfilesCleaned) return;
  await db.delete(foundersTable).where(and(
    isNull(foundersTable.userId),
    or(
      and(eq(foundersTable.handle, "maya"), eq(foundersTable.name, "Maya Okafor")),
      and(eq(foundersTable.handle, "alextan"), eq(foundersTable.name, "Alex Tan")),
      and(eq(foundersTable.handle, "priyashah"), eq(foundersTable.name, "Priya Shah")),
    ),
  ));
  await db.update(postsTable)
    .set({ viewerReaction: null })
    .where(inArray(postsTable.viewerReaction, ["goat", "confused"]));
  syntheticProfilesCleaned = true;
}

function founderJson(founder: FounderRow, isFollowing = founder.isFollowing) {
  const storedAvatar = founder.avatarObjectPath;
  const avatarUrl = storedAvatar?.startsWith("/objects/uploads/")
    ? `/api/storage${storedAvatar}`
    : storedAvatar?.startsWith("data:image/")
      ? storedAvatar
      : null;
  return {
    id: founder.id,
    name: founder.name,
    handle: founder.handle,
    bio: founder.bio,
    avatarColor: founder.avatarColor,
    avatarUrl,
    location: founder.location,
    website: founder.website,
    isFollowing,
    previewTranscript: founder.previewTranscript,
  };
}

function postJson(
  post: PostRow,
  author: FounderRow,
  viewerFounderId?: number | null,
  viewerReaction?: string | null,
  viewerReshuuted = false,
) {
  const storedAudio = post.audioUrl;
  const audioUrl = storedAudio?.startsWith("/objects/uploads/")
    ? `/api/posts/${post.id}/audio`
    : null;
  return {
    id: post.id,
    author: founderJson(author),
    transcript: post.transcript,
    transcriptionStatus: post.transcriptionStatus,
    audioUrl,
    durationSeconds: post.durationSeconds,
    createdAt: post.createdAt,
    reactions: {
      rocket: post.rocket,
      laughing: post.laughing,
      thumbsDown: post.thumbsDown,
    },
    viewerReaction: ["rocket", "laughing", "thumbsDown"].includes(viewerReaction ?? "")
      ? viewerReaction as "rocket" | "laughing" | "thumbsDown"
      : null,
    isReshuuted: viewerReshuuted,
    reshuutedBy: viewerReshuuted ? "You" : null,
    canEdit:
      post.transcriptionStatus === "ready" &&
      viewerFounderId === post.authorId &&
      Date.now() <= post.createdAt.getTime() + POST_EDIT_WINDOW_MS,
    canDelete: viewerFounderId === post.authorId,
    editableUntil:
      viewerFounderId === post.authorId
        ? new Date(post.createdAt.getTime() + POST_EDIT_WINDOW_MS)
        : null,
  };
}

function commentJson(comment: CommentRow, author: FounderRow) {
  return {
    id: comment.id,
    author: founderJson(author),
    transcript: comment.transcript,
    audioUrl: `/api/comments/${comment.id}/audio`,
    durationSeconds: comment.durationSeconds,
    createdAt: comment.createdAt,
  };
}

async function recordNotification(input: {
  actorId: number;
  recipientId: number;
  postId: number;
  eventType: "reaction" | "reshuut" | "comment" | "mention";
  reactionType?: string | null;
  commentId?: number | null;
}) {
  if (input.actorId === input.recipientId) return;
  await db.transaction(async (tx) => {
    await lockFounderPair(tx, input.actorId, input.recipientId);
    if (await foundersBlocked(input.actorId, input.recipientId)) return;
    await tx.insert(notificationsTable).values({
      actorId: input.actorId,
      recipientId: input.recipientId,
      postId: input.postId,
      eventType: input.eventType,
      reactionType: input.reactionType ?? null,
      commentId: input.commentId ?? null,
      dedupeKey: input.eventType === "comment"
        ? `comment:${input.commentId}`
        : `${input.eventType}:${input.actorId}:${input.postId}:${input.reactionType ?? ""}`,
    }).onConflictDoNothing({ target: notificationsTable.dedupeKey });
  });
}

async function activeFounders(founders: FounderRow[]) {
  const userIds = founders.flatMap((founder) => founder.userId ? [founder.userId] : []);
  if (!userIds.length) return founders;
  const activeUsers = await db.select({ id: usersTable.id }).from(usersTable).where(and(
    inArray(usersTable.id, userIds),
    eq(usersTable.deletionStatus, "active"),
  ));
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  return founders.filter((founder) => !founder.userId || activeUserIds.has(founder.userId));
}

async function isFounderActive(founder: FounderRow | undefined) {
  return Boolean(founder && (await activeFounders([founder])).length);
}

async function hydratePosts(rows: PostRow[], viewerFounderId?: number | null) {
  if (!rows.length) return [];
  const founders = await activeFounders(await db
    .select()
    .from(foundersTable)
    .where(inArray(foundersTable.id, [...new Set(rows.map((row) => row.authorId))])));
  const byId = new Map(founders.map((founder) => [founder.id, founder]));
  const viewerReactions = viewerFounderId
    ? await db.select().from(postReactionsTable).where(and(
        eq(postReactionsTable.founderId, viewerFounderId),
        inArray(postReactionsTable.postId, rows.map((row) => row.id)),
      ))
    : [];
  const reactionByPostId = new Map(viewerReactions.map((reaction) => [reaction.postId, reaction.emojiType]));
  const follows = viewerFounderId
    ? await db.select({ followedFounderId: accountFollowsTable.followedFounderId }).from(accountFollowsTable)
      .where(and(
        eq(accountFollowsTable.followerFounderId, viewerFounderId),
        inArray(accountFollowsTable.followedFounderId, founders.map((founder) => founder.id)),
      ))
    : [];
  const followedIds = new Set(follows.map((row) => row.followedFounderId));
  const viewerReshuuts = viewerFounderId
    ? await db.select({ postId: postReshuutsTable.postId }).from(postReshuutsTable).where(and(
        eq(postReshuutsTable.founderId, viewerFounderId),
        inArray(postReshuutsTable.postId, rows.map((row) => row.id)),
      ))
    : [];
  const reshuutedPostIds = new Set(viewerReshuuts.map((reshuut) => reshuut.postId));
  return rows.flatMap((row) => {
    const author = byId.get(row.authorId);
    return author ? [postJson(
      row,
      { ...author, isFollowing: followedIds.has(author.id) },
      viewerFounderId,
      reactionByPostId.get(row.id),
      reshuutedPostIds.has(row.id),
    )] : [];
  });
}

async function viewerReactionFor(postId: number, viewerFounderId?: number | null) {
  if (!viewerFounderId) return null;
  const [reaction] = await db.select({ emojiType: postReactionsTable.emojiType })
    .from(postReactionsTable)
    .where(and(
      eq(postReactionsTable.postId, postId),
      eq(postReactionsTable.founderId, viewerFounderId),
    ))
    .limit(1);
  return reaction?.emojiType ?? null;
}

async function viewerReshuutedPost(postId: number, viewerFounderId?: number | null) {
  if (!viewerFounderId) return false;
  const [reshuut] = await db.select({ id: postReshuutsTable.id })
    .from(postReshuutsTable)
    .where(and(
      eq(postReshuutsTable.postId, postId),
      eq(postReshuutsTable.founderId, viewerFounderId),
    ))
    .limit(1);
  return Boolean(reshuut);
}

router.get("/feed", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetFeedQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const all = (await db.select().from(postsTable).orderBy(desc(postsTable.createdAt)))
    .filter((post) => post.transcriptionStatus === "ready" && post.deletionStatus === "active");
  const userId = getAuthenticatedUserId(req);
  const viewer = await currentFounder(userId ?? "");
  let rows = all;
  if (viewer) {
    const visible: PostRow[] = [];
    for (const post of rows) if (await visibleToViewer(viewer.id, post.authorId)) visible.push(post);
    rows = visible;
  }
  if (params.data.view === "following") {
    if (!viewer) {
      rows = [];
    } else {
      const followed = await db.select({ id: accountFollowsTable.followedFounderId })
        .from(accountFollowsTable)
        .where(eq(accountFollowsTable.followerFounderId, viewer.id));
      const followedIds = new Set(followed.map((row) => row.id));
      rows = rows.filter((post) => followedIds.has(post.authorId));
    }
  }
  res.json(GetFeedResponse.parse(await hydratePosts(rows, viewer?.id)));
});

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const viewer = await currentFounder(userId);
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db.select({
    notification: notificationsTable,
    actor: foundersTable,
    post: postsTable,
  }).from(notificationsTable)
    .innerJoin(foundersTable, eq(foundersTable.id, notificationsTable.actorId))
    .innerJoin(postsTable, eq(postsTable.id, notificationsTable.postId))
    .where(and(
      eq(notificationsTable.recipientId, viewer.id),
      eq(postsTable.deletionStatus, "active"),
      eq(postsTable.transcriptionStatus, "ready"),
    ))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  const active = await activeFounders(rows.map((row) => row.actor));
  const activeIds = new Set(active.map((founder) => founder.id));
  const blockedActorIds = new Set(viewer
    ? (await Promise.all(active.map(async (actor) =>
      await foundersBlocked(viewer.id, actor.id) ? actor.id : null))).filter(
        (id): id is number => id !== null,
      )
    : []);
  res.json(GetNotificationsResponse.parse(rows
    .filter((row) => activeIds.has(row.actor.id) && !blockedActorIds.has(row.actor.id))
    .map((row) => ({
      id: row.notification.id,
      eventType: row.notification.eventType,
      reactionType: row.notification.reactionType,
      commentId: row.notification.commentId,
      createdAt: row.notification.createdAt,
      actor: founderJson(row.actor),
      post: {
        id: row.post.id,
        transcript: row.post.transcript,
        createdAt: row.post.createdAt,
      },
    }))));
});

router.get("/profiles/search", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const params = SearchProfilesQueryParams.safeParse(req.query);
  if (!userId || !params.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid search" : "Unauthorized" });
    return;
  }
  const query = params.data.q.trim();
  const matches = await db.select().from(foundersTable)
    .where(or(
      ilike(foundersTable.handle, `%${query}%`),
      ilike(foundersTable.name, `%${query}%`),
    ))
    .limit(12);
  const active = (await activeFounders(matches)).slice(0, 8);
  const viewer = await currentFounder(userId);
  const visible = viewer
    ? (await Promise.all(active.map(async (founder) =>
      await visibleToViewer(viewer.id, founder.id) ? founder : null))).filter(
        (founder): founder is FounderRow => Boolean(founder),
      )
    : active;
  const followedSearchIds = viewer
    ? new Set((await db.select({ followedFounderId: accountFollowsTable.followedFounderId })
      .from(accountFollowsTable).where(and(
        eq(accountFollowsTable.followerFounderId, viewer.id),
        inArray(accountFollowsTable.followedFounderId, visible.map((founder) => founder.id)),
      ))).map((row) => row.followedFounderId))
    : new Set<number>();
  res.json(SearchProfilesResponse.parse(visible.map((founder) =>
    founderJson(founder, followedSearchIds.has(founder.id)))));
});

router.post("/reports", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const viewer = await requireViewer(req, res);
  if (!viewer) return;
  const body = CreateReportBody.safeParse(req.body);
  if (!body.success || (body.data.details !== undefined && !body.data.details.trim())) {
    res.status(400).json({ error: "Invalid report" });
    return;
  }
  const { targetType } = body.data;
  const targetNumericId = body.data.targetId;
  const targetId = String(targetNumericId);
  let author: FounderRow | undefined;
  let contentSnapshot: string | null = null;
  let profileSnapshot: string | null = null;
  let sourceCreatedAt: Date | null = null;
  let sourceAudioObjectPath: string | null = null;
  let evidenceAudioObjectPath: string | null = null;
  if (targetType === "profile") {
    [author] = await db.select().from(foundersTable)
      .where(eq(foundersTable.id, targetNumericId)).limit(1);
    if (!author || !(await isFounderActive(author))) {
      res.status(404).json({ error: "Report target not found" });
      return;
    }
    profileSnapshot = JSON.stringify(founderJson(author));
  } else if (targetType === "post") {
    const [post] = await db.select().from(postsTable)
      .where(and(eq(postsTable.id, targetNumericId), eq(postsTable.deletionStatus, "active"))).limit(1);
    if (!post) {
      res.status(404).json({ error: "Report target not found" });
      return;
    }
    [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, post.authorId)).limit(1);
    if (!author || !(await isFounderActive(author))) {
      res.status(404).json({ error: "Report target not found" });
      return;
    }
    contentSnapshot = post.transcript;
    sourceCreatedAt = post.createdAt;
    sourceAudioObjectPath = post.audioUrl;
  } else {
    const [comment] = await db.select().from(commentsTable)
      .where(eq(commentsTable.id, targetNumericId)).limit(1);
    if (!comment) {
      res.status(404).json({ error: "Report target not found" });
      return;
    }
    [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, comment.authorId)).limit(1);
    if (!author || !(await isFounderActive(author))) {
      res.status(404).json({ error: "Report target not found" });
      return;
    }
    contentSnapshot = comment.transcript;
    sourceCreatedAt = comment.createdAt;
    const [parent] = await db.select({ deletionStatus: postsTable.deletionStatus })
      .from(postsTable).where(eq(postsTable.id, comment.postId)).limit(1);
    if (!parent || parent.deletionStatus !== "active") {
      res.status(404).json({ error: "Report target not found" });
      return;
    }
    sourceAudioObjectPath = comment.audioUrl;
  }
  if (author.id === viewer.founder.id) {
    res.status(400).json({ error: "You cannot report yourself", code: "SELF_REPORT" });
    return;
  }
  const existing = await db.select({ id: accountReportsTable.id })
    .from(accountReportsTable)
    .where(and(
      eq(accountReportsTable.reporterUserId, viewer.userId),
      eq(accountReportsTable.targetType, targetType),
      eq(accountReportsTable.targetId, targetId),
    )).limit(1);
  if (existing.length) {
    res.status(200).json(CreateReportResponse.parse({ id: existing[0].id, status: "received" }));
    return;
  }
  const limit = await consumeRateLimit(`report:${viewer.userId}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    res.setHeader("Retry-After", limit.retryAfter);
    res.status(429).json({ error: "Too many reports", code: "RATE_LIMITED" });
    return;
  }
  if (sourceAudioObjectPath) {
    try {
      evidenceAudioObjectPath = await objectStorage.copyToEvidence(sourceAudioObjectPath);
    } catch {
      res.status(502).json({ error: "Report evidence could not be preserved", code: "EVIDENCE_PRESERVATION_FAILED" });
      return;
    }
  }
  const [report] = await db.insert(accountReportsTable).values({
    reporterUserId: viewer.userId,
    reporterFounderId: viewer.founder.id,
    targetType,
    targetId,
    reason: body.data.reason,
    details: body.data.details?.trim() || null,
    targetAuthorId: author.id,
    targetAuthorHandle: author.handle,
    contentSnapshot,
    profileSnapshot,
    evidenceAudioObjectPath,
    sourceCreatedAt,
  }).onConflictDoNothing({
    target: [
      accountReportsTable.reporterUserId,
      accountReportsTable.targetType,
      accountReportsTable.targetId,
    ],
  }).returning({ id: accountReportsTable.id }).catch(async (error) => {
    if (evidenceAudioObjectPath) await objectStorage.deleteEvidence(evidenceAudioObjectPath).catch(() => undefined);
    throw error;
  });
  if (!report) {
    const [duplicate] = await db.select({ id: accountReportsTable.id })
      .from(accountReportsTable).where(and(
        eq(accountReportsTable.reporterUserId, viewer.userId),
        eq(accountReportsTable.targetType, targetType),
        eq(accountReportsTable.targetId, targetId),
      )).limit(1);
    if (duplicate) {
      if (evidenceAudioObjectPath) await objectStorage.deleteEvidence(evidenceAudioObjectPath).catch(() => undefined);
      res.status(200).json(CreateReportResponse.parse({ id: duplicate.id, status: "received" }));
      return;
    }
    if (evidenceAudioObjectPath) await objectStorage.deleteEvidence(evidenceAudioObjectPath).catch(() => undefined);
    res.status(409).json({ error: "Report could not be recorded", code: "REPORT_CONFLICT" });
    return;
  }
  await auditSecurityEvent(req, "account_report_created", viewer.userId, { targetType, targetId });
  res.status(201).json(CreateReportResponse.parse({ id: report.id, status: "received" }));
});

router.get("/account/blocks", async (req, res): Promise<void> => {
  const viewer = await requireViewer(req, res);
  if (!viewer) return;
  const rows = await db.select({ founder: foundersTable, block: accountBlocksTable })
    .from(accountBlocksTable)
    .innerJoin(foundersTable, eq(foundersTable.id, accountBlocksTable.blockedFounderId))
    .where(eq(accountBlocksTable.blockerFounderId, viewer.founder.id))
    .orderBy(desc(accountBlocksTable.createdAt));
  res.json(ListBlockedAccountsResponse.parse(rows.map(({ founder, block }) => ({
    id: founder.id, handle: founder.handle, name: founder.name, createdAt: block.createdAt,
  }))));
});

router.put("/profiles/:handle/block", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const viewer = await requireViewer(req, res);
  if (!viewer) return;
  const params = BlockAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid profile" }); return; }
  const [target] = await db.select().from(foundersTable)
    .where(eq(foundersTable.handle, params.data.handle)).limit(1);
  if (!target || !(await isFounderActive(target))) { res.status(404).json({ error: "Profile not found" }); return; }
  if (target.id === viewer.founder.id) { res.status(400).json({ error: "You cannot block yourself", code: "SELF_BLOCK" }); return; }
  await db.transaction(async (tx) => {
    await lockFounderPair(tx, viewer.founder.id, target.id);
    await tx.insert(accountBlocksTable).values({
      blockerFounderId: viewer.founder.id, blockedFounderId: target.id,
    }).onConflictDoNothing();
    await tx.delete(accountFollowsTable).where(or(
      and(eq(accountFollowsTable.followerFounderId, viewer.founder.id), eq(accountFollowsTable.followedFounderId, target.id)),
      and(eq(accountFollowsTable.followerFounderId, target.id), eq(accountFollowsTable.followedFounderId, viewer.founder.id)),
    ));
  });
  await auditSecurityEvent(req, "account_block_created", viewer.userId, { targetFounderId: target.id });
  res.json(BlockAccountResponse.parse({ blocked: true, handle: target.handle }));
});

router.delete("/profiles/:handle/block", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const viewer = await requireViewer(req, res);
  if (!viewer) return;
  const params = BlockAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid profile" }); return; }
  const [target] = await db.select().from(foundersTable).where(eq(foundersTable.handle, params.data.handle)).limit(1);
  if (!target) { res.status(404).json({ error: "Profile not found" }); return; }
  await db.delete(accountBlocksTable).where(and(
    eq(accountBlocksTable.blockerFounderId, viewer.founder.id),
    eq(accountBlocksTable.blockedFounderId, target.id),
  ));
  await auditSecurityEvent(req, "account_block_removed", viewer.userId, { targetFounderId: target.id });
  res.json(BlockAccountResponse.parse({ blocked: false, handle: target.handle }));
});

router.get("/profiles/:handle/block", async (req, res): Promise<void> => {
  const viewer = await requireViewer(req, res);
  if (!viewer) return;
  const params = BlockAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid profile" }); return; }
  const [target] = await db.select({ id: foundersTable.id, handle: foundersTable.handle })
    .from(foundersTable).where(eq(foundersTable.handle, params.data.handle)).limit(1);
  if (!target) { res.status(404).json({ error: "Profile not found" }); return; }
  res.json(BlockAccountResponse.parse({
    blocked: await foundersBlocked(viewer.founder.id, target.id),
    handle: target.handle,
  }));
});

router.get("/profiles/:handle", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  let founder;
  if (params.data.handle === "me") {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to view your profile" });
      return;
    }
    founder = await currentFounder(userId);
  } else {
    [founder] = await db.select().from(foundersTable).where(eq(foundersTable.handle, params.data.handle));
    if (!(await isFounderActive(founder))) founder = undefined;
  }
  if (!founder) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const viewerForVisibility = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (viewerForVisibility && !(await visibleToViewer(viewerForVisibility.id, founder.id))) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const rows = (await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt)))
    .filter((post) => post.transcriptionStatus === "ready" && post.deletionStatus === "active");
  const userId = getAuthenticatedUserId(req);
  const viewer = await currentFounder(userId ?? "");
  const [{ followerCount }] = await db.select({ followerCount: sql<number>`count(*)` })
    .from(accountFollowsTable).where(eq(accountFollowsTable.followedFounderId, founder.id));
  const [{ followingCount }] = await db.select({ followingCount: sql<number>`count(*)` })
    .from(accountFollowsTable).where(eq(accountFollowsTable.followerFounderId, founder.id));
  res.json(
    GetProfileResponse.parse({
      founder: {
        ...founderJson(founder),
        isFollowing: viewer
          ? Boolean((await db.select({ id: accountFollowsTable.id }).from(accountFollowsTable).where(and(
            eq(accountFollowsTable.followerFounderId, viewer.id),
            eq(accountFollowsTable.followedFounderId, founder.id),
          )).limit(1))[0])
          : false,
      },
      followerCount: Number(followerCount),
      followingCount: Number(followingCount),
      postCount: rows.length,
      posts: await hydratePosts(rows, viewer?.id),
      suggestedQuestions: [
        `What is ${founder.name.split(" ")[0]} learning right now?`,
        `What does ${founder.name.split(" ")[0]} believe about building teams?`,
        `What recent idea keeps coming up?`,
      ],
    }),
  );
});

router.patch("/profiles/:handle", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  await ensureSeeded();
  const params = UpdateProfileParams.safeParse(req.params);
  const body = UpdateProfileBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid profile details" });
    return;
  }
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const existing = await currentFounder(userId);
  if (!existing) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  if (body.data.avatarObjectPath && body.data.avatarObjectPath !== existing.avatarObjectPath) {
    const [pendingUpload] = await db
      .select()
      .from(profileImageUploadsTable)
      .where(and(
        eq(profileImageUploadsTable.objectPath, body.data.avatarObjectPath),
        eq(profileImageUploadsTable.userId, userId),
      ));
    if (!pendingUpload) {
      res.status(403).json({ error: "This headshot upload does not belong to you" });
      return;
    }
    try {
      await objectStorage.setAcl(body.data.avatarObjectPath, {
        owner: userId,
        visibility: "public",
      });
    } catch {
      res.status(400).json({ error: "The uploaded headshot could not be verified" });
      return;
    }
  }
  const [founder] = await db
    .update(foundersTable)
    .set({
      name: body.data.name,
      handle: body.data.handle,
      bio: body.data.bio,
      location: body.data.location || null,
      website: body.data.website || null,
      avatarObjectPath: body.data.avatarObjectPath ?? existing.avatarObjectPath,
      previewTranscript: body.data.previewTranscript ?? existing.previewTranscript,
    })
    .where(eq(foundersTable.id, existing.id))
    .returning();
  if (body.data.avatarObjectPath) {
    await db.delete(profileImageUploadsTable).where(and(
      eq(profileImageUploadsTable.objectPath, body.data.avatarObjectPath),
      eq(profileImageUploadsTable.userId, userId),
    ));
    if (
      existing.avatarObjectPath &&
      existing.avatarObjectPath !== body.data.avatarObjectPath
    ) {
      try {
        await objectStorage.deleteObject(existing.avatarObjectPath);
      } catch (error) {
        req.log.warn({ err: error }, "Could not remove replaced account headshot");
      }
    }
  }
  const rows = (await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt)))
    .filter((post) => post.transcriptionStatus === "ready");
  const [{ followerCount }] = await db.select({ followerCount: sql<number>`count(*)` })
    .from(accountFollowsTable).where(eq(accountFollowsTable.followedFounderId, founder.id));
  const [{ followingCount }] = await db.select({ followingCount: sql<number>`count(*)` })
    .from(accountFollowsTable).where(eq(accountFollowsTable.followerFounderId, founder.id));
  res.json(
    UpdateProfileResponse.parse({
      founder: { ...founderJson(founder), isFollowing: false },
      followerCount: Number(followerCount),
      followingCount: Number(followingCount),
      postCount: rows.length,
      posts: await hydratePosts(rows, founder.id),
      suggestedQuestions: [
        `What is ${founder.name.split(" ")[0]} learning right now?`,
        `What does ${founder.name.split(" ")[0]} believe about building teams?`,
        `What recent idea keeps coming up?`,
      ],
    }),
  );
});

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = RequestUploadUrlBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a supported image or audio file under 15MB" });
    return;
  }
  try {
    await queueExpiredPrivateUploads();
    const upload = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from shuut_users where id = ${userId} for update`);
      const [user] = await tx.select({ deletionStatus: usersTable.deletionStatus })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (user?.deletionStatus !== "active") return null;
      const created = await objectStorage.createUpload(body.data.size, body.data.contentType);
      await tx.insert(profileImageUploadsTable).values({
        objectPath: created.objectPath,
        userId,
      });
      return created;
    });
    if (!upload) {
      res.status(409).json({ error: "Account deletion is already in progress" });
      return;
    }
    res.json(RequestUploadUrlResponse.parse(upload));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create upload");
    res.status(500).json({ error: "Could not start the upload" });
  }
});

router.get("/posts/:postId/audio", async (req, res): Promise<void> => {
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db.select({
    audioUrl: postsTable.audioUrl,
    authorId: postsTable.authorId,
  })
    .from(postsTable)
    .where(and(
      eq(postsTable.id, params.data.postId),
      eq(postsTable.deletionStatus, "active"),
    ))
    .limit(1);
  const [author] = post
    ? await db.select().from(foundersTable).where(eq(foundersTable.id, post.authorId)).limit(1)
    : [];
  if (!post?.audioUrl?.startsWith("/objects/uploads/") || !(await isFounderActive(author))) {
    await auditSecurityEvent(req, "audio_denial", getAuthenticatedUserId(req));
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  const audioViewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (audioViewer && !(await visibleToViewer(audioViewer.id, post.authorId))) {
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  try {
    const metadata = await objectStorage.streamPrivate(post.audioUrl);
    const rangeHeader = req.headers.range;
    let range: { start: number; end: number } | undefined;
    if (rangeHeader && metadata.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      const requestedStart = match[1] ? Number(match[1]) : undefined;
      const requestedEnd = match[2] ? Number(match[2]) : undefined;
      const start = requestedStart ?? Math.max(0, metadata.size - (requestedEnd ?? 0));
      const end = Math.min(requestedEnd ?? metadata.size - 1, metadata.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= metadata.size) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      range = { start, end };
    }
    const object = range
      ? await objectStorage.streamPrivate(post.audioUrl, range)
      : metadata;
    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
      res.setHeader("Content-Length", range.end - range.start + 1);
    } else if (object.size) {
      res.setHeader("Content-Length", object.size);
    }
    Readable.fromWeb(object.body as ReadableStream<Uint8Array>).pipe(res);
  } catch {
    await auditSecurityEvent(req, "audio_denial", getAuthenticatedUserId(req), { postId: params.data.postId });
    res.status(404).json({ error: "Audio not found" });
  }
});

router.post("/transcriptions", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const userId = getAuthenticatedUserId(req);
  const body = TranscribeAudioBody.safeParse(req.body);
  if (!userId || !body.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid voice recording" : "Unauthorized" });
    return;
  }

  const [pendingUpload] = await db
    .select()
    .from(profileImageUploadsTable)
    .where(and(
      eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
      eq(profileImageUploadsTable.userId, userId),
    ))
    .limit(1);
  if (!pendingUpload) {
    await auditSecurityEvent(req, "audio_denial", userId);
    res.status(403).json({ error: "This voice recording does not belong to you" });
    return;
  }

  try {
    const transcript = await transcribeRecording(body.data.audioObjectPath);
    res.json(TranscribeAudioResponse.parse({ transcript }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to transcribe voice recording");
    res.status(502).json({ error: "We could not transcribe this recording. Please try again." });
  }
});

async function transcribeRecording(audioObjectPath: string): Promise<string> {
    const audio = await objectStorage.readAudio(audioObjectPath);
    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("language_code", "eng");
    form.append(
      "file",
      new Blob([Uint8Array.from(audio.data)], { type: audio.contentType }),
      "shuut-recording",
    );
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs rejected transcription (${response.status})`);
    }
    const result = await response.json() as { text?: string };
    const transcript = result.text?.trim() ?? "";
    if (!transcript) throw new Error("Transcription was empty");
    return transcript;
}

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  try {
    const raw = req.params.path;
    const path = Array.isArray(raw) ? raw.join("/") : raw;
    const metadata = await objectStorage.stream(`/objects/${path}`);
    const rangeHeader = req.headers.range;
    let range: { start: number; end: number } | undefined;
    if (rangeHeader && metadata.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      const requestedStart = match[1] ? Number(match[1]) : undefined;
      const requestedEnd = match[2] ? Number(match[2]) : undefined;
      const start = requestedStart ?? Math.max(0, metadata.size - (requestedEnd ?? 0));
      const end = Math.min(requestedEnd ?? metadata.size - 1, metadata.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= metadata.size) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      range = { start, end };
    }
    const object = range ? await objectStorage.stream(`/objects/${path}`, range) : metadata;
    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
      res.setHeader("Content-Length", range.end - range.start + 1);
    } else if (object.size) {
      res.setHeader("Content-Length", object.size);
    }
    Readable.fromWeb(object.body as ReadableStream<Uint8Array>).pipe(res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.post("/posts", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  await ensureSeeded();
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = CreatePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [activeUser] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
    eq(usersTable.id, userId),
    eq(usersTable.deletionStatus, "active"),
  )).limit(1);
  const author = activeUser ? await currentFounder(userId) : null;
  if (!author) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const requestedMentionIds = body.data.mentionedFounderIds ?? [];
  const mentionCandidates = requestedMentionIds.length
    ? await db.select().from(foundersTable).where(inArray(foundersTable.id, requestedMentionIds))
    : [];
  const mentionedFounders = (await activeFounders(mentionCandidates))
    .filter((founder) => founder.id !== author.id);
  if (mentionedFounders.length !== requestedMentionIds.filter((id) => id !== author.id).length) {
    res.status(400).json({ error: "One or more tagged accounts are unavailable" });
    return;
  }
  const blockedMention = (await Promise.all(mentionedFounders.map(async (founder) =>
    await foundersBlocked(author.id, founder.id) ? founder : null))).find(Boolean);
  if (blockedMention) {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  if (!body.data.audioObjectPath) {
    await auditSecurityEvent(req, "publish_denied", userId, { reason: "missing_audio" });
    res.status(400).json({ error: "An audio recording is required to publish." });
    return;
  }
  let publication:
    | { status: "created"; created: PostRow }
    | { status: "upload_missing" }
    | { status: "account_deleting" }
    | { status: "blocked" };
  try {
    publication = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from shuut_users where id = ${userId} for update`);
      const [user] = await tx.select({ deletionStatus: usersTable.deletionStatus })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (user?.deletionStatus !== "active") return { status: "account_deleting" as const };
      const mentionPairs = [...mentionedFounders].sort((left, right) => left.id - right.id);
      for (const mentioned of mentionPairs) {
        await lockFounderPair(tx, author.id, mentioned.id);
        if (await foundersBlocked(author.id, mentioned.id)) return { status: "blocked" as const };
      }
      const [claimedUpload] = await tx.delete(profileImageUploadsTable).where(and(
        eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
        eq(profileImageUploadsTable.userId, userId),
      )).returning({ objectPath: profileImageUploadsTable.objectPath });
      if (!claimedUpload) return { status: "upload_missing" as const };
      try {
        await objectStorage.publishAudio(claimedUpload.objectPath, userId);
      } catch (error) {
        throw new AudioVerificationError("The voice recording could not be verified", { cause: error });
      }
      const [created] = await tx.insert(postsTable).values({
        authorId: author.id,
        transcript: body.data.transcript ?? "",
        transcriptionStatus: body.data.transcript ? "ready" : "processing",
        durationSeconds: body.data.durationSeconds,
        audioUrl: claimedUpload.objectPath,
      }).returning();
      if (mentionedFounders.length) {
        await tx.insert(postMentionsTable).values(
          mentionedFounders.map((founder) => ({ postId: created.id, founderId: founder.id })),
        );
      }
      return { status: "created" as const, created };
    });
  } catch (error) {
    if (error instanceof AudioVerificationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (publication.status === "account_deleting") {
    res.status(409).json({ error: "Account deletion is already in progress" });
    return;
  }
  if (publication.status === "upload_missing") {
    await auditSecurityEvent(req, "audio_denial", userId, { reason: "upload_not_owned" });
    res.status(403).json({ error: "This voice recording does not belong to you" });
    return;
  }
  if (publication.status === "blocked") {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const { created } = publication;
  const audioObjectPath = created.audioUrl;
  await auditSecurityEvent(req, "publish", userId, { postId: created.id });
  for (const mentioned of mentionedFounders) {
    await recordNotification({
      actorId: author.id,
      recipientId: mentioned.id,
      postId: created.id,
      eventType: "mention",
    });
  }
  res.status(201).json(CreatePostResponse.parse(postJson(created, author, author.id)));
  if (!body.data.transcript && audioObjectPath) {
    void transcribeRecording(audioObjectPath)
      .then(async (transcript) => {
        await db.update(postsTable)
          .set({ transcript, transcriptionStatus: "ready" })
          .where(eq(postsTable.id, created.id));
      })
      .catch(async (error) => {
        req.log.error({ err: error, postId: created.id }, "Background transcription failed");
        await db.update(postsTable)
          .set({ transcriptionStatus: "failed" })
          .where(eq(postsTable.id, created.id));
      });
  }
});

router.get("/posts/:postId", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db.select().from(postsTable).where(and(
    eq(postsTable.id, params.data.postId),
    eq(postsTable.deletionStatus, "active"),
  ));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, post.authorId));
  if (!(await isFounderActive(author))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (viewer && !(await visibleToViewer(viewer.id, author.id))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(GetPostResponse.parse(postJson(
    post,
    author,
    viewer?.id,
    await viewerReactionFor(post.id, viewer?.id),
    await viewerReshuutedPost(post.id, viewer?.id),
  )));
});

router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  const params = GetPostCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [parent] = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(and(
    eq(postsTable.id, params.data.postId),
    eq(postsTable.deletionStatus, "active"),
  )).limit(1);
  const [parentAuthor] = parent
    ? await db.select().from(foundersTable).where(eq(foundersTable.id, parent.authorId)).limit(1)
    : [];
  if (!parent || !(await isFounderActive(parentAuthor))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (viewer && !(await visibleToViewer(viewer.id, parent.authorId))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const rows = await db.select().from(commentsTable)
    .where(and(
      eq(commentsTable.postId, params.data.postId),
      eq(commentsTable.transcriptionStatus, "ready"),
    ))
    .orderBy(asc(commentsTable.createdAt));
  const authors = rows.length
    ? await activeFounders(await db.select().from(foundersTable)
      .where(inArray(foundersTable.id, [...new Set(rows.map((row) => row.authorId))])))
    : [];
  const byId = new Map(authors.map((author) => [author.id, author]));
  const blockedAuthorIds = new Set(viewer
    ? (await Promise.all(authors.map(async (author) =>
      await foundersBlocked(viewer.id, author.id) ? author.id : null))).filter(
        (id): id is number => id !== null,
      )
    : []);
  res.json(GetPostCommentsResponse.parse(
    rows.flatMap((row) => {
      const author = byId.get(row.authorId);
      return author && !blockedAuthorIds.has(author.id) ? [commentJson(row, author)] : [];
    }),
  ));
});

router.post("/posts/:postId/comments", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const userId = getAuthenticatedUserId(req);
  const params = CreatePostCommentParams.safeParse(req.params);
  const body = CreatePostCommentBody.safeParse(req.body);
  if (!userId || !params.success || !body.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid voice comment" : "Unauthorized" });
    return;
  }
  const limit = await consumeRateLimit(
    `voice-comment:${privacyHash(userId)}`,
    20,
    60 * 60 * 1000,
  );
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.status(429).json({ error: "Too many voice comments. Please try again later." });
    return;
  }
  const author = await currentFounder(userId);
  const [post] = await db.select().from(postsTable)
    .where(and(
      eq(postsTable.id, params.data.postId),
      eq(postsTable.transcriptionStatus, "ready"),
      eq(postsTable.deletionStatus, "active"),
    )).limit(1);
  if (!author || !post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (await foundersBlocked(author.id, post.authorId)) {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  let publication:
    | { status: "created"; created: CommentRow }
    | { status: "upload_missing" }
    | { status: "author_or_post_missing" }
    | { status: "blocked" };
  try {
    publication = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from shuut_users where id = ${userId} for update`);
      await tx.execute(sql`select id from shuut_posts where id = ${post.id} for update`);
      const [activeUser] = await tx.select({ id: usersTable.id }).from(usersTable).where(and(
        eq(usersTable.id, userId),
        eq(usersTable.deletionStatus, "active"),
      )).limit(1);
      const [activePost] = await tx.select({ id: postsTable.id }).from(postsTable).where(and(
        eq(postsTable.id, post.id),
        eq(postsTable.deletionStatus, "active"),
      )).limit(1);
      if (!activeUser || !activePost) {
        return { status: "author_or_post_missing" as const };
      }
      await lockFounderPair(tx, author.id, post.authorId);
      if (await foundersBlocked(author.id, post.authorId)) {
        return { status: "blocked" as const };
      }
      const [claimedUpload] = await tx.delete(profileImageUploadsTable).where(and(
        eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
        eq(profileImageUploadsTable.userId, userId),
      )).returning({ objectPath: profileImageUploadsTable.objectPath });
      if (!claimedUpload) return { status: "upload_missing" as const };
      try {
        await objectStorage.publishAudio(claimedUpload.objectPath, userId);
      } catch (error) {
        throw new AudioVerificationError("The voice recording could not be verified", { cause: error });
      }
      const [created] = await tx.insert(commentsTable).values({
        postId: post.id,
        authorId: author.id,
        audioUrl: claimedUpload.objectPath,
        durationSeconds: body.data.durationSeconds,
      }).returning();
      return { status: "created" as const, created };
    });
  } catch (error) {
    if (error instanceof AudioVerificationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (publication.status === "author_or_post_missing") {
    res.status(409).json({ error: "This post or account is being deleted" });
    return;
  }
  if (publication.status === "upload_missing") {
    await auditSecurityEvent(req, "audio_denial", userId, { reason: "comment_upload_not_owned" });
    res.status(403).json({ error: "This voice recording does not belong to you" });
    return;
  }
  if (publication.status === "blocked") {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const { created } = publication;
  await recordNotification({
    actorId: author.id,
    recipientId: post.authorId,
    postId: post.id,
    eventType: "comment",
    commentId: created.id,
  });
  await auditSecurityEvent(req, "voice_comment_created", userId, {
    postId: post.id,
    commentId: created.id,
  });
  res.status(202).json(CreatePostCommentResponse.parse({ id: created.id, status: "processing" }));
  void transcribeRecording(created.audioUrl)
    .then(async (transcript) => {
      await db.update(commentsTable)
        .set({ transcript, transcriptionStatus: "ready" })
        .where(eq(commentsTable.id, created.id));
    })
    .catch(async (error) => {
      req.log.error({ err: error, commentId: created.id }, "Background comment transcription failed");
      const orphanScope: CleanupScope = { type: "orphan", id: created.audioUrl };
      await db.transaction(async (tx) => {
        await tx.insert(objectCleanupJobsTable).values({
          objectPath: created.audioUrl,
          scopeType: orphanScope.type,
          scopeId: orphanScope.id,
        }).onConflictDoNothing();
        await tx.delete(commentsTable).where(eq(commentsTable.id, created.id));
      });
      await processCleanupScope(orphanScope, req.log);
    });
});

router.get("/comments/:commentId/audio", async (req, res): Promise<void> => {
  const params = GetCommentAudioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [comment] = await db.select().from(commentsTable)
    .where(and(
      eq(commentsTable.id, params.data.commentId),
      eq(commentsTable.transcriptionStatus, "ready"),
    ))
    .limit(1);
  if (!comment) {
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  const [parent] = await db.select().from(postsTable).where(and(
    eq(postsTable.id, comment.postId),
    eq(postsTable.deletionStatus, "active"),
  )).limit(1);
  const expectedAuthorIds = parent
    ? [...new Set([parent.authorId, comment.authorId])]
    : [];
  const authors = parent
    ? await db.select().from(foundersTable).where(inArray(
      foundersTable.id,
      expectedAuthorIds,
    ))
    : [];
  const visibleAuthors = await activeFounders(authors);
  if (!parent
    || authors.length !== expectedAuthorIds.length
    || visibleAuthors.length !== authors.length) {
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  const commentAudioViewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (commentAudioViewer && (
    !(await visibleToViewer(commentAudioViewer.id, parent.authorId))
    || !(await visibleToViewer(commentAudioViewer.id, comment.authorId))
  )) {
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  try {
    const metadata = await objectStorage.streamPrivate(comment.audioUrl);
    res.setHeader("Content-Type", metadata.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Accept-Ranges", "bytes");
    if (metadata.size) res.setHeader("Content-Length", metadata.size);
    Readable.fromWeb(metadata.body as ReadableStream<Uint8Array>).pipe(res);
  } catch {
    res.status(404).json({ error: "Audio not found" });
  }
});

router.post("/posts/:postId/share-link", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const params = CreatePostShareLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      transcriptionStatus: postsTable.transcriptionStatus,
    })
    .from(postsTable)
    .where(and(
      eq(postsTable.id, params.data.postId),
      eq(postsTable.deletionStatus, "active"),
    ))
    .limit(1);
  const [author] = post
    ? await db.select().from(foundersTable).where(eq(foundersTable.id, post.authorId)).limit(1)
    : [];
  if (!post || post.transcriptionStatus !== "ready" || !(await isFounderActive(author))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const shareViewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (shareViewer && !(await visibleToViewer(shareViewer.id, post.authorId))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const token = createPostShareToken(post.id);
  res.json(
    CreatePostShareLinkResponse.parse({
      url: `https://shuut.me/p/${post.id}?t=${encodeURIComponent(token)}`,
    }),
  );
});

router.patch("/posts/:postId", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const userId = getAuthenticatedUserId(req);
  const params = UpdatePostParams.safeParse(req.params);
  const body = UpdatePostBody.safeParse(req.body);
  if (!userId || !params.success || !body.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid post edit" : "Unauthorized" });
    return;
  }
  const founder = await currentFounder(userId);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!founder || post.authorId !== founder.id) {
    res.status(403).json({ error: "You can only edit your own posts" });
    return;
  }
  if (Date.now() > post.createdAt.getTime() + POST_EDIT_WINDOW_MS) {
    res.status(409).json({ error: "The 30-second editing window has closed" });
    return;
  }
  const [updated] = await db.update(postsTable)
    .set({ transcript: body.data.transcript.trim() })
    .where(eq(postsTable.id, post.id))
    .returning();
  res.json(UpdatePostResponse.parse(postJson(
    updated,
    founder,
    founder.id,
    await viewerReactionFor(updated.id, founder.id),
    await viewerReshuutedPost(updated.id, founder.id),
  )));
});

router.delete("/posts/:postId", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const founder = await currentFounder(userId);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!founder || post.authorId !== founder.id) {
    res.status(403).json({ error: "You can only delete your own posts" });
    return;
  }
  const scope: CleanupScope = { type: "post", id: String(post.id) };
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from shuut_posts where id = ${post.id} for update`);
    await tx.update(postsTable).set({ deletionStatus: "deleting" }).where(eq(postsTable.id, post.id));
    const commentRecordings = await tx.select({ objectPath: commentsTable.audioUrl })
      .from(commentsTable).where(eq(commentsTable.postId, post.id));
    const paths = [
      ...(post.audioUrl?.startsWith("/objects/uploads/") ? [post.audioUrl] : []),
      ...commentRecordings.map((recording) => recording.objectPath),
    ];
    if (paths.length) {
      await tx.insert(objectCleanupJobsTable).values(
        [...new Set(paths)].map((objectPath) => ({
          objectPath,
          scopeType: scope.type,
          scopeId: scope.id,
        })),
      ).onConflictDoNothing();
    }
  });
  const status = await processCleanupScope(scope, req.log);
  res.json(DeletePostResponse.parse({ status }));
});

router.put("/posts/:postId/reaction", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const params = SetReactionParams.safeParse(req.params);
  const body = SetReactionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid reaction" });
    return;
  }
  const userId = getAuthenticatedUserId(req);
  const viewer = await currentFounder(userId ?? "");
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [targetPost] = await db.select({ authorId: postsTable.authorId }).from(postsTable)
    .where(eq(postsTable.id, params.data.postId)).limit(1);
  if (targetPost && await foundersBlocked(viewer.id, targetPost.authorId)) {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from shuut_users where id = ${userId} for update`);
    const [activeUser] = await tx.select({ deletionStatus: usersTable.deletionStatus })
      .from(usersTable)
      .where(eq(usersTable.id, userId!))
      .limit(1);
    if (activeUser?.deletionStatus !== "active") {
      return { status: "account_deleting" as const };
    }
    await tx.execute(sql`select id from shuut_posts where id = ${params.data.postId} for update`);
    const [current] = await tx.select().from(postsTable).where(and(
      eq(postsTable.id, params.data.postId),
      eq(postsTable.deletionStatus, "active"),
    ));
    if (!current) return { status: "post_missing" as const };
    await lockFounderPair(tx, viewer.id, current.authorId);
    if (await foundersBlocked(viewer.id, current.authorId)) return { status: "blocked" as const };

    const [existingReaction] = await tx.select().from(postReactionsTable).where(and(
      eq(postReactionsTable.postId, current.id),
      eq(postReactionsTable.founderId, viewer.id),
    )).limit(1);
    const counts = {
      rocket: current.rocket,
      laughing: current.laughing,
      thumbsDown: current.thumbsDown,
    };
    const key = body.data.emojiType;
    const old = existingReaction?.emojiType && existingReaction.emojiType in counts
      ? existingReaction.emojiType as keyof typeof counts
      : null;
    if (old) counts[old] = Math.max(0, counts[old] - 1);
    const nextReaction = old === key ? null : key;
    if (nextReaction) counts[nextReaction] += 1;

    if (existingReaction) {
      await tx.delete(postReactionsTable).where(eq(postReactionsTable.id, existingReaction.id));
    }
    if (nextReaction) {
      await tx.insert(postReactionsTable).values({
        postId: current.id,
        founderId: viewer.id,
        emojiType: nextReaction,
      });
    }
    const [updated] = await tx.update(postsTable)
      .set(counts)
      .where(eq(postsTable.id, current.id))
      .returning();
    return { status: "updated" as const, updated, nextReaction };
  });
  if (result.status === "account_deleting") {
    res.status(409).json({ error: "Account deletion is already in progress" });
    return;
  }
  if (result.status === "post_missing") {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (result.status === "blocked") {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const { updated, nextReaction } = result;
  const [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, updated.authorId));
  if (nextReaction) {
    await recordNotification({
      actorId: viewer.id,
      recipientId: updated.authorId,
      postId: updated.id,
      eventType: "reaction",
      reactionType: nextReaction,
    });
  }
  res.json(SetReactionResponse.parse(postJson(updated, author, viewer.id, nextReaction)));
});

router.post("/posts/:postId/reshuut", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const params = ReshuutPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = getAuthenticatedUserId(req);
  const viewer = await currentFounder(userId ?? "");
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from shuut_users where id = ${userId} for update`);
    const [activeUser] = await tx.select({ deletionStatus: usersTable.deletionStatus })
      .from(usersTable).where(eq(usersTable.id, userId!)).limit(1);
    if (activeUser?.deletionStatus !== "active") return { status: "account_deleting" as const };
    await tx.execute(sql`select id from shuut_posts where id = ${params.data.postId} for update`);
    const [post] = await tx.select().from(postsTable).where(and(
      eq(postsTable.id, params.data.postId),
      eq(postsTable.deletionStatus, "active"),
    ));
    if (!post) return { status: "post_missing" as const };
    await lockFounderPair(tx, viewer.id, post.authorId);
    if (await foundersBlocked(viewer.id, post.authorId)) {
      return { status: "blocked" as const };
    }
    const [existing] = await tx.select().from(postReshuutsTable).where(and(
      eq(postReshuutsTable.postId, post.id),
      eq(postReshuutsTable.founderId, viewer.id),
    )).limit(1);
    if (existing) {
      await tx.delete(postReshuutsTable).where(eq(postReshuutsTable.id, existing.id));
      return { status: "updated" as const, updated: post, isReshuuted: false };
    }
    await tx.insert(postReshuutsTable).values({ postId: post.id, founderId: viewer.id });
    return { status: "updated" as const, updated: post, isReshuuted: true };
  });
  if (result.status === "account_deleting") {
    res.status(409).json({ error: "Account deletion is already in progress" });
    return;
  }
  if (result.status === "post_missing") {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (result.status === "blocked") {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const { updated, isReshuuted } = result;
  const [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, updated.authorId));
  if (isReshuuted) {
    await recordNotification({
      actorId: viewer.id,
      recipientId: updated.authorId,
      postId: updated.id,
      eventType: "reshuut",
    });
  }
  res.json(ReshuutPostResponse.parse(postJson(
    updated,
    author,
    viewer.id,
    await viewerReactionFor(updated.id, viewer.id),
    isReshuuted,
  )));
});

router.put("/profiles/:handle/follow", async (req, res): Promise<void> => {
  if (!(await requireCurrentLegalPolicyConsent(req, res))) return;
  const params = ToggleFollowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [founder] = await db
    .select()
    .from(foundersTable)
    .where(eq(foundersTable.handle, params.data.handle));
  if (!founder) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (founder.id === viewer.id) {
    res.status(400).json({ error: "You cannot follow yourself" });
    return;
  }
  if (await foundersBlocked(viewer.id, founder.id)) {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const isFollowing = await db.transaction(async (tx) => {
    await lockFounderPair(tx, viewer.id, founder.id);
    if (await foundersBlocked(viewer.id, founder.id)) {
      throw new Error("BLOCKED_RELATIONSHIP");
    }
    const [existingFollow] = await tx.select({ id: accountFollowsTable.id })
      .from(accountFollowsTable).where(and(
        eq(accountFollowsTable.followerFounderId, viewer.id),
        eq(accountFollowsTable.followedFounderId, founder.id),
      )).limit(1);
    if (existingFollow) {
      await tx.delete(accountFollowsTable).where(eq(accountFollowsTable.id, existingFollow.id));
      return false;
    }
    await tx.insert(accountFollowsTable).values({
      followerFounderId: viewer.id,
      followedFounderId: founder.id,
    }).onConflictDoNothing();
    return true;
  }).catch((error) => {
    if (error instanceof Error && error.message === "BLOCKED_RELATIONSHIP") return null;
    throw error;
  });
  if (isFollowing === null) {
    res.status(403).json({ error: "Blocked relationship", code: "BLOCKED_RELATIONSHIP" });
    return;
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(accountFollowsTable).where(eq(accountFollowsTable.followedFounderId, founder.id));
  const followerCount = Number(count);
  res.json(ToggleFollowResponse.parse({ isFollowing, followerCount }));
});

router.post("/profiles/:handle/ask", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = AskFounderParams.safeParse(req.params);
  const body = AskFounderBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid question" });
    return;
  }
  const [founder] = await db
    .select()
    .from(foundersTable)
    .where(eq(foundersTable.handle, params.data.handle));
  if (!founder) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const askViewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  const posts = await db.transaction(async (tx) => {
    if (askViewer) {
      await lockFounderPair(tx, askViewer.id, founder.id);
      if (await foundersBlocked(askViewer.id, founder.id)) return null;
    }
    return tx.select()
      .from(postsTable)
      .where(and(
        eq(postsTable.authorId, founder.id),
        eq(postsTable.transcriptionStatus, "ready"),
        eq(postsTable.deletionStatus, "active"),
      ))
      .orderBy(desc(postsTable.createdAt))
      .limit(ASK_MINIMUM_POSTS);
  });
  if (!posts) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  if (posts.length < ASK_MINIMUM_POSTS) {
    res.status(403).json({ error: `Ask Me unlocks after ${ASK_MINIMUM_POSTS} published SHÜÜTs.` });
    return;
  }
  const hasEnoughContext = true;
  const answer = `${founder.name.split(" ")[0]} tends to favour learning in public and turning observations into concrete next steps. In the posts available here, the recurring theme is to stay curious, make assumptions explicit, and use customer or team feedback to decide what changes next.`;
  res.json(
    AskFounderResponse.parse({
      answer,
      hasEnoughContext,
      sources: posts.slice(0, 2).map((post) => ({
        postId: post.id,
        excerpt: post.transcript.slice(0, 120),
        createdAt: post.createdAt,
      })),
    }),
  );
});

router.delete("/account", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const scope: CleanupScope = { type: "account", id: userId };
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from shuut_users where id = ${userId} for update`);
    await tx.update(usersTable).set({ deletionStatus: "deleting" }).where(eq(usersTable.id, userId));
    const [founder] = await tx.select().from(foundersTable).where(eq(foundersTable.userId, userId)).limit(1);
    const posts = founder
      ? await tx
        .select({ id: postsTable.id, objectPath: postsTable.audioUrl })
        .from(postsTable)
        .where(eq(postsTable.authorId, founder.id))
      : [];
    const commentRecordings = founder
      ? await tx
        .select({ objectPath: commentsTable.audioUrl })
        .from(commentsTable)
        .where(or(
          eq(commentsTable.authorId, founder.id),
          ...(posts.length ? [inArray(commentsTable.postId, posts.map((post) => post.id))] : []),
        ))
      : [];
    const pendingUploads = await tx
      .select({
        objectPath: profileImageUploadsTable.objectPath,
        createdAt: profileImageUploadsTable.createdAt,
      })
      .from(profileImageUploadsTable)
      .where(eq(profileImageUploadsTable.userId, userId));
    const cleanupTimes = new Map<string, Date>();
    const addObject = (objectPath: string, nextAttemptAt = new Date()) => {
      const existing = cleanupTimes.get(objectPath);
      if (!existing || existing < nextAttemptAt) cleanupTimes.set(objectPath, nextAttemptAt);
    };
    if (founder?.avatarObjectPath) addObject(founder.avatarObjectPath);
    for (const recording of [...posts, ...commentRecordings]) {
      if (recording.objectPath?.startsWith("/objects/uploads/")) addObject(recording.objectPath);
    }
    for (const upload of pendingUploads) {
      addObject(
        upload.objectPath,
        new Date(upload.createdAt.getTime() + SIGNED_UPLOAD_TTL_MS + SIGNED_UPLOAD_EXPIRY_SAFETY_MS),
      );
    }
    if (cleanupTimes.size) {
      await tx.insert(objectCleanupJobsTable).values(
        [...cleanupTimes].map(([objectPath, nextAttemptAt]) => ({
          objectPath,
          scopeType: scope.type,
          scopeId: scope.id,
          nextAttemptAt,
        })),
      ).onConflictDoNothing();
    }
  });
  const status = await processCleanupScope(scope, req.log);
  if (status === "completed") clearSessionCookie(res);
  res.json(DeleteAccountResponse.parse({ status }));
});

export default router;

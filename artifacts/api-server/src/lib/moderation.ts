import { createHash, randomUUID } from "crypto";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import {
  accountReportsTable,
  accountSanctionsTable,
  commentsTable,
  foundersTable,
  accountBlocksTable,
  notificationsTable,
  objectCleanupJobsTable,
  postMentionsTable,
  db,
  moderationCasesTable,
  moderationAppealsTable,
  moderationCaseSignalsTable,
  moderationJobsTable,
  moderationSubjectsTable,
  postsTable,
  postReshuutsTable,
  usersTable,
} from "@workspace/db";
import { hasCurrentVoiceAiConsent } from "./voiceAiConsent";

export const MODERATION_POLICY_VERSION = "voice-text-v1";
const MODEL = "gpt-5-mini";
const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

export type ModerationCategory = "harassment" | "hate" | "sexual" | "violence" | "self_harm" | "illegal" | "spam" | "other";
export type ModerationDecision = {
  categories: ModerationCategory[];
  riskScore: number;
};

export async function activeSanctionForUser(userId: string) {
  const [row] = await db.select().from(accountSanctionsTable).where(and(
    eq(accountSanctionsTable.userId, userId),
    eq(accountSanctionsTable.status, "active"),
    or(isNull(accountSanctionsTable.expiresAt), gt(accountSanctionsTable.expiresAt, new Date())),
  )).orderBy(desc(accountSanctionsTable.createdAt)).limit(1);
  return row?.type === "suspend" || row?.type === "ban" ? row : null;
}

export async function activeSanctionForFounder(founderId: number) {
  const [founder] = await db.select({ userId: foundersTable.userId }).from(foundersTable).where(eq(foundersTable.id, founderId));
  return founder?.userId ? activeSanctionForUser(founder.userId) : null;
}

export async function assertCanParticipate(userId: string) {
  const sanction = await activeSanctionForUser(userId);
  if (sanction) {
    const error = new Error("Account is restricted");
    (error as Error & { code?: string }).code = sanction.type === "ban" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED";
    throw error;
  }
}

export async function canDistributePost(postId: number) {
  const [post] = await db.select({
    status: postsTable.moderationStatus,
    deletion: postsTable.deletionStatus,
    transcription: postsTable.transcriptionStatus,
    authorId: postsTable.authorId,
  }).from(postsTable).where(eq(postsTable.id, postId));
  if (!post || post.status !== "approved" || post.deletion !== "active" || post.transcription !== "ready") return false;
  const [author] = await db.select({ userId: foundersTable.userId }).from(foundersTable)
    .where(eq(foundersTable.id, post.authorId)).limit(1);
  if (!author) return false;
  if (author.userId) {
    const [user] = await db.select({ deletionStatus: usersTable.deletionStatus }).from(usersTable)
      .where(eq(usersTable.id, author.userId)).limit(1);
    if (!user || user.deletionStatus !== "active") return false;
  }
  return !(await activeSanctionForFounder(post.authorId));
}

export async function canDistributeComment(commentId: number) {
  const [comment] = await db.select({
    status: commentsTable.moderationStatus,
    transcription: commentsTable.transcriptionStatus,
    authorId: commentsTable.authorId,
    postId: commentsTable.postId,
  }).from(commentsTable).where(eq(commentsTable.id, commentId));
  if (!comment || comment.status !== "approved" || comment.transcription !== "ready") return false;
  if (!(await canDistributePost(comment.postId))) return false;
  return !(await activeSanctionForFounder(comment.authorId));
}

export async function isFounderDistributable(founderId: number) {
  const [founder] = await db.select({ userId: foundersTable.userId }).from(foundersTable)
    .where(eq(foundersTable.id, founderId)).limit(1);
  if (!founder) return false;
  if (founder.userId) {
    const [user] = await db.select({ deletionStatus: usersTable.deletionStatus }).from(usersTable)
      .where(eq(usersTable.id, founder.userId)).limit(1);
    if (!user || user.deletionStatus !== "active") return false;
  }
  return !(await activeSanctionForFounder(founderId));
}

export async function canOwnerViewPending(userId: string, targetType: "post" | "comment", targetId: number) {
  const [founder] = await db.select({ id: foundersTable.id }).from(foundersTable).where(eq(foundersTable.userId, userId));
  if (!founder) return false;
  const [row] = targetType === "post"
    ? await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, targetId))
    : await db.select({ authorId: commentsTable.authorId }).from(commentsTable).where(eq(commentsTable.id, targetId));
  return row?.authorId === founder.id;
}

export async function emitApprovalNotifications(postId: number) {
  const [post] = await db.select({ actorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, postId));
  if (!post) return;
  if (!(await canDistributePost(postId))) return;
  const mentions = await db.select({ founderId: postMentionsTable.founderId }).from(postMentionsTable).where(eq(postMentionsTable.postId, postId));
  for (const mention of mentions) {
    if (mention.founderId === post.actorId) continue;
    const blocked = await db.select({ id: accountBlocksTable.id }).from(accountBlocksTable).where(or(
      and(eq(accountBlocksTable.blockerFounderId, post.actorId), eq(accountBlocksTable.blockedFounderId, mention.founderId)),
      and(eq(accountBlocksTable.blockerFounderId, mention.founderId), eq(accountBlocksTable.blockedFounderId, post.actorId)),
    )).limit(1);
    if (blocked.length) continue;
    await db.insert(notificationsTable).values({
      actorId: post.actorId, recipientId: mention.founderId, postId,
      eventType: "mention", dedupeKey: `mention:${postId}:${mention.founderId}`,
    }).onConflictDoNothing({ target: notificationsTable.dedupeKey });
  }
  const comments = await db.select({ id: commentsTable.id, authorId: commentsTable.authorId }).from(commentsTable).where(and(
    eq(commentsTable.postId, postId),
    eq(commentsTable.moderationStatus, "approved"),
    eq(commentsTable.transcriptionStatus, "ready"),
  ));
  for (const comment of comments) {
    if (comment.authorId === post.actorId) continue;
    if (!(await isFounderDistributable(comment.authorId))) continue;
    const blocked = await db.select({ id: accountBlocksTable.id }).from(accountBlocksTable).where(or(
      and(eq(accountBlocksTable.blockerFounderId, comment.authorId), eq(accountBlocksTable.blockedFounderId, post.actorId)),
      and(eq(accountBlocksTable.blockerFounderId, post.actorId), eq(accountBlocksTable.blockedFounderId, comment.authorId)),
    )).limit(1);
    if (blocked.length) continue;
    await db.insert(notificationsTable).values({
      actorId: comment.authorId, recipientId: post.actorId, postId, commentId: comment.id,
      eventType: "comment", dedupeKey: `comment:${comment.id}`,
    }).onConflictDoNothing({ target: notificationsTable.dedupeKey });
  }
}

export interface TextModerationProvider {
  classify(text: string): Promise<ModerationDecision>;
}

function safeDecision(value: unknown): ModerationDecision {
  if (!value || typeof value !== "object") throw new Error("provider_invalid_json");
  const raw = value as { categories?: unknown; riskScore?: unknown };
  const riskScore = raw.riskScore;
  if (!Array.isArray(raw.categories) || !Number.isInteger(riskScore) || (riskScore as number) < 0 || (riskScore as number) > 100) {
    throw new Error("provider_invalid_json");
  }
  const allowed = new Set<ModerationCategory>(["harassment", "hate", "sexual", "violence", "self_harm", "illegal", "spam", "other"]);
  const categories = [...new Set(raw.categories.filter((category): category is ModerationCategory =>
    typeof category === "string" && allowed.has(category as ModerationCategory),
  ))];
  if (categories.length !== raw.categories.length) throw new Error("provider_invalid_category");
  return { categories, riskScore: riskScore as number };
}

export class OpenAITextModerationProvider implements TextModerationProvider {
  async classify(text: string): Promise<ModerationDecision> {
    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!baseUrl || !apiKey) throw new Error("provider_not_configured");
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Classify user voice transcript safety. Return JSON only: {"categories":[],"riskScore":0}. Categories must be from harassment,hate,sexual,violence,self_harm,illegal,spam,other. riskScore integer 0-100. Never include explanations.` },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("provider_empty");
    try {
      return safeDecision(JSON.parse(content));
    } catch {
      throw new Error("provider_invalid_json");
    }
  }
}

let provider: TextModerationProvider = new OpenAITextModerationProvider();
export function setModerationProviderForTests(next: TextModerationProvider): TextModerationProvider {
  const previous = provider;
  provider = next;
  return previous;
}

function contentHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

async function targetText(targetType: string, targetId: number) {
  if (targetType === "post") {
    const [post] = await db.select({ transcript: postsTable.transcript }).from(postsTable).where(eq(postsTable.id, targetId));
    return post?.transcript ?? null;
  }
  if (targetType === "reshuut") {
    const [reshuut] = await db.select({ transcript: postReshuutsTable.transcript }).from(postReshuutsTable).where(eq(postReshuutsTable.id, targetId));
    return reshuut?.transcript ?? null;
  }
  const [comment] = await db.select({ transcript: commentsTable.transcript }).from(commentsTable).where(eq(commentsTable.id, targetId));
  return comment?.transcript ?? null;
}

async function targetOwnerUserId(targetType: string, targetId: number) {
  const founderId = targetType === "post"
    ? (await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, targetId)).limit(1))[0]?.authorId
    : targetType === "reshuut"
      ? (await db.select({ founderId: postReshuutsTable.founderId }).from(postReshuutsTable).where(eq(postReshuutsTable.id, targetId)).limit(1))[0]?.founderId
      : (await db.select({ authorId: commentsTable.authorId }).from(commentsTable).where(eq(commentsTable.id, targetId)).limit(1))[0]?.authorId;
  if (!founderId) return null;
  return (await db.select({ userId: foundersTable.userId }).from(foundersTable).where(eq(foundersTable.id, founderId)).limit(1))[0]?.userId ?? null;
}

export async function enqueueModeration(targetType: "post" | "comment" | "reshuut", targetId: number, transcript: string, revision = 1) {
  const hash = contentHash(transcript);
  const [subject] = await db.insert(moderationSubjectsTable).values({
    targetType, targetId, revision, contentHash: hash, status: "pending",
    policyVersion: MODERATION_POLICY_VERSION,
  }).onConflictDoUpdate({
    target: [moderationSubjectsTable.targetType, moderationSubjectsTable.targetId, moderationSubjectsTable.revision],
    set: { contentHash: hash, status: "pending", errorCode: null, updatedAt: new Date() },
  }).returning({ id: moderationSubjectsTable.id });
  await db.insert(moderationJobsTable).values({
    targetType, targetId, revision, contentHash: hash, status: "pending",
  }).onConflictDoNothing({ target: [moderationJobsTable.targetType, moderationJobsTable.targetId, moderationJobsTable.revision] });
  return subject.id;
}

// Posts created before moderation jobs existed must go through the same
// consent-checked, fail-closed review path as newly published posts.
export async function enqueueUnreviewedPosts(limit = 25) {
  const result = await db.execute(sql`
    select p.id, p.transcript, p.moderation_revision as revision
    from shuut_posts p
    where p.moderation_status = 'pending'
      and p.transcription_status = 'ready'
      and p.deletion_status = 'active'
      and p.transcript <> ''
      and not exists (
        select 1 from shuut_moderation_jobs j
        where j.target_type = 'post'
          and j.target_id = p.id
          and j.revision = p.moderation_revision
      )
    order by p.created_at asc
    limit ${limit}
  `) as unknown as { rows: Array<{ id: number; transcript: string; revision: number }> };
  for (const post of result.rows) {
    await enqueueModeration("post", post.id, post.transcript, post.revision);
  }
  return result.rows.length;
}

export async function ensureModerationCase(
  targetType: string,
  targetId: number,
  priority: string,
  signalType: string,
  subjectId?: number,
  executor: any = db,
) {
  const dueAt = new Date(Date.now() + 24 * 60 * 60_000);
  const [created] = await executor.insert(moderationCasesTable).values({
    targetType, targetId, priority, dueAt,
  }).onConflictDoNothing({ target: [moderationCasesTable.targetType, moderationCasesTable.targetId] }).returning({ id: moderationCasesTable.id });
  const [caseRow] = created
    ? [{ id: created.id }]
    : await executor.select({ id: moderationCasesTable.id }).from(moderationCasesTable)
      .where(and(eq(moderationCasesTable.targetType, targetType), eq(moderationCasesTable.targetId, targetId))).limit(1);
  if (!caseRow) throw new Error("moderation_case_missing");
  await executor.update(moderationCasesTable).set({
    status: "open", resolution: null, resolvedAt: null,
    version: sql`${moderationCasesTable.version} + 1`, dueAt,
    updatedAt: new Date(),
  }).where(and(
    eq(moderationCasesTable.id, caseRow.id),
    eq(moderationCasesTable.status, "resolved"),
  ));
  await executor.insert(moderationCaseSignalsTable).values({ caseId: caseRow.id, signalType, subjectId });
  return caseRow.id;
}

function isHighRisk(result: ModerationDecision) {
  return result.riskScore >= 70 || result.categories.some((category) =>
    ["hate", "sexual", "violence", "self_harm", "illegal"].includes(category),
  );
}

async function applyResult(job: { id: number; targetType: string; targetId: number; revision: number; contentHash: string; leaseToken: string }, result: ModerationDecision) {
  const liveText = await targetText(job.targetType, job.targetId);
  const [liveRevision] = job.targetType === "post"
    ? await db.select({ revision: postsTable.moderationRevision }).from(postsTable).where(eq(postsTable.id, job.targetId))
    : job.targetType === "reshuut"
      ? await db.select({ revision: postReshuutsTable.moderationRevision }).from(postReshuutsTable).where(eq(postReshuutsTable.id, job.targetId))
      : await db.select({ revision: commentsTable.moderationRevision }).from(commentsTable).where(eq(commentsTable.id, job.targetId));
  if (liveText === null || !liveRevision || liveRevision.revision !== job.revision || contentHash(liveText) !== job.contentHash) {
    await db.update(moderationJobsTable).set(({ status: "completed", leaseUntil: null, leaseToken: null, lastErrorCode: "superseded_revision", updatedAt: new Date() }) as any).where(and(
      eq(moderationJobsTable.id, job.id),
      eq(moderationJobsTable.status, "processing"),
      eq((moderationJobsTable as any).leaseToken, job.leaseToken),
    ));
    return;
  }
  const status = isHighRisk(result) ? "quarantined" : "approved";
  const owned = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(moderationJobsTable).set(({ status: "applying", updatedAt: new Date() }) as any)
      .where(and(
        eq(moderationJobsTable.id, job.id),
        eq(moderationJobsTable.status, "processing"),
        eq((moderationJobsTable as any).leaseToken, job.leaseToken),
      )).returning({ id: moderationJobsTable.id });
    if (!claimed) return false;
    await tx.update(moderationSubjectsTable).set({
      status, categoryCodes: JSON.stringify(result.categories), riskScore: result.riskScore,
      provider: "openai", policyVersion: MODERATION_POLICY_VERSION, moderatedAt: new Date(), updatedAt: new Date(),
    }).where(and(
      eq(moderationSubjectsTable.targetType, job.targetType),
      eq(moderationSubjectsTable.targetId, job.targetId),
      eq(moderationSubjectsTable.revision, job.revision),
    ));
    if (job.targetType === "post") {
      await tx.update(postsTable).set({
        moderationStatus: status, moderationRiskScore: result.riskScore,
        moderationCategories: JSON.stringify(result.categories), moderationErrorCode: null,
      }).where(and(eq(postsTable.id, job.targetId), eq(postsTable.moderationRevision, job.revision)));
    } else if (job.targetType === "reshuut") {
      await tx.update(postReshuutsTable).set({
        moderationStatus: status,
      }).where(and(eq(postReshuutsTable.id, job.targetId), eq(postReshuutsTable.moderationRevision, job.revision)));
    } else {
      await tx.update(commentsTable).set({
        moderationStatus: status, moderationRiskScore: result.riskScore,
        moderationCategories: JSON.stringify(result.categories), moderationErrorCode: null,
      }).where(and(eq(commentsTable.id, job.targetId), eq(commentsTable.moderationRevision, job.revision)));
    }
    await tx.update(moderationJobsTable).set(({ status: "completed", leaseUntil: null, leaseToken: null, updatedAt: new Date() }) as any).where(and(
      eq(moderationJobsTable.id, job.id),
      eq(moderationJobsTable.status, "applying"),
      eq((moderationJobsTable as any).leaseToken, job.leaseToken),
    ));
    return true;
  });
  if (!owned) return;
  if (status === "quarantined") await ensureModerationCase(job.targetType, job.targetId, "high", "automated_flag");
  if (status === "approved") {
    const [target] = job.targetType === "post"
      ? [{ postId: job.targetId }]
      : await db.select({ postId: commentsTable.postId }).from(commentsTable).where(eq(commentsTable.id, job.targetId));
    if (target) await emitApprovalNotifications(target.postId);
  }
}

async function failJob(job: { id: number; targetType: string; targetId: number; attempts: number; leaseToken: string }, errorCode: string) {
  const attempts = job.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const next = new Date(Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** Math.min(attempts, 9)));
  const matched = await db.transaction(async (tx) => tx.update(moderationJobsTable).set(({
    status: exhausted ? "failed" : "pending", attempts, nextAttemptAt: next, leaseUntil: null, leaseToken: null,
    lastErrorCode: errorCode.slice(0, 80), updatedAt: new Date(),
  }) as any).where(and(
    eq(moderationJobsTable.id, job.id),
    eq(moderationJobsTable.status, "processing"),
    eq((moderationJobsTable as any).leaseToken, job.leaseToken),
  )).returning({ id: moderationJobsTable.id }));
  if (exhausted && matched.length) {
    await ensureModerationCase(job.targetType, job.targetId, "high", "moderation_failure");
    if (job.targetType === "post") {
      await db.update(postsTable).set({ moderationStatus: "failed", moderationErrorCode: errorCode.slice(0, 80) }).where(eq(postsTable.id, job.targetId));
    } else if (job.targetType === "reshuut") {
      await db.update(postReshuutsTable).set({ moderationStatus: "failed" }).where(eq(postReshuutsTable.id, job.targetId));
    } else {
      await db.update(commentsTable).set({ moderationStatus: "failed", moderationErrorCode: errorCode.slice(0, 80) }).where(eq(commentsTable.id, job.targetId));
    }
  }
}

export async function runModerationSweep(limit = 10) {
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      select id, target_type as "targetType", target_id as "targetId", revision, content_hash as "contentHash", attempts
      from shuut_moderation_jobs
      where (status = 'pending' and next_attempt_at <= now())
         or (status = 'processing' and lease_until < now())
      order by next_attempt_at asc
      limit ${limit}
      for update skip locked
    `) as unknown as { rows: Array<{ id: number; targetType: string; targetId: number; revision: number; contentHash: string; attempts: number }> };
    const leased = rows.rows.map((row) => ({ ...row, leaseToken: randomUUID() }));
    for (const row of leased) {
      await tx.update(moderationJobsTable).set(({
        status: "processing", leaseUntil: new Date(Date.now() + LEASE_MS), leaseToken: row.leaseToken, updatedAt: new Date(),
      }) as any).where(eq(moderationJobsTable.id, row.id));
    }
    return leased;
  });
  for (const job of claimed) {
    const text = await targetText(job.targetType, job.targetId);
    if (text === null) {
      await db.update(moderationJobsTable).set(({ status: "completed", leaseUntil: null, leaseToken: null, updatedAt: new Date() }) as any).where(and(
        eq(moderationJobsTable.id, job.id),
        eq(moderationJobsTable.status, "processing"),
        eq((moderationJobsTable as any).leaseToken, job.leaseToken),
      ));
      continue;
    }
    try {
      // Voice transcripts are sent to the managed moderation provider. A
      // revocation can occur while a job is queued, so this check must be
      // immediately before dispatch and failure must remain moderation-safe:
      // failJob retries and eventually opens a high-priority moderation case.
      const ownerUserId = await targetOwnerUserId(job.targetType, job.targetId);
      if (!ownerUserId || !(await hasCurrentVoiceAiConsent(ownerUserId))) {
        throw new Error("VOICE_AI_CONSENT_REQUIRED");
      }
      await applyResult(job, await provider.classify(text));
    } catch (error) {
      await failJob(job, error instanceof Error ? error.message : "provider_error");
    }
  }
  return claimed.length;
}

export async function sweepModerationRetention(now = new Date()) {
  const rows = await db.select().from(moderationCasesTable).where(and(
    eq(moderationCasesTable.resolution, "remove"),
    lte(moderationCasesTable.appealDeadlineAt, now),
    isNull(moderationCasesTable.sourceCleanupQueuedAt),
  ));
  for (const row of rows) {
    await db.transaction(async (tx) => {
      const [lockedId] = await tx.select({ id: moderationCasesTable.id }).from(moderationCasesTable)
        .where(eq(moderationCasesTable.id, row.id)).for("update").limit(1);
      if (!lockedId) return;
      const [current] = await tx.select().from(moderationCasesTable)
        .where(eq(moderationCasesTable.id, row.id)).limit(1);
      if (!current || current.resolution !== "remove" || !current.appealDeadlineAt || current.appealDeadlineAt > now || current.sourceCleanupQueuedAt) return;
      const [openAppeal] = await tx.select({ id: moderationAppealsTable.id }).from(moderationAppealsTable)
        .where(and(eq(moderationAppealsTable.caseId, row.id), eq(moderationAppealsTable.status, "open"))).limit(1);
      if (openAppeal) return;
      const [locked] = await tx.update(moderationCasesTable).set({ sourceCleanupQueuedAt: now })
        .where(and(eq(moderationCasesTable.id, current.id), isNull(moderationCasesTable.sourceCleanupQueuedAt))).returning();
      if (!locked) return;
      const [target] = current.targetType === "post"
        ? await tx.select({ audioUrl: postsTable.audioUrl }).from(postsTable).where(eq(postsTable.id, current.targetId))
        : await tx.select({ audioUrl: commentsTable.audioUrl }).from(commentsTable).where(eq(commentsTable.id, current.targetId));
      if (target?.audioUrl) await tx.insert(objectCleanupJobsTable).values({
        objectPath: target.audioUrl, scopeType: "moderation", scopeId: String(row.id),
      }).onConflictDoNothing();
    });
  }
  return rows.length;
}

export function startModerationWorker() {
  const sweep = async () => {
    await enqueueUnreviewedPosts();
    await runModerationSweep();
  };
  const timer = setInterval(() => void sweep().catch(() => undefined), 5_000);
  timer.unref();
  void sweep().catch(() => undefined);
  return timer;
}
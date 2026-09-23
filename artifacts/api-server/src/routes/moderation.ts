import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import {
  db,
  moderationActionsTable,
  moderationAppealsTable,
  moderationCasesTable,
  moderationCaseSignalsTable,
  moderationSubjectsTable,
  operatorGrantsTable,
  accountReportsTable,
  accountSanctionsTable,
  postsTable,
  commentsTable,
  foundersTable,
  objectCleanupJobsTable,
} from "@workspace/db";
import {
  ClaimModerationCaseParams,
  CreateModerationAppealBody,
  CreateModerationAppealParams,
  CreateModerationSanctionBody,
  CreateModerationSanctionParams,
  DecideModerationAppealBody,
  DecideModerationAppealParams,
  DecideModerationCaseBody,
  DecideModerationCaseParams,
  GetModerationAppealParams,
  GetModerationCaseParams,
  ListModerationCasesQueryParams,
  ListCaseAppealsParams,
  RevokeModerationSanctionParams,
  ClaimModerationCaseResponse,
  ListModerationCasesResponse,
  GetModerationCaseResponse,
  DecideModerationCaseResponse,
  ListCaseAppealsResponse,
  ListModerationAppealsResponse,
  ListMyModerationAppealsResponse,
  GetModerationAppealResponse,
  DecideModerationAppealResponse,
  RevokeModerationSanctionResponse,
  ListEligibleModerationAppealsResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUserId } from "../middlewares/sessionAuth";
import { emitApprovalNotifications } from "../lib/moderation";

const router: IRouter = Router();
const SLA_HOURS = 24;
const operatorRoles = new Set(["reviewer", "admin"]);

async function requireOperator(req: Request, minimum: "reviewer" | "admin" = "reviewer") {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return { error: 401 as const };
  const [grant] = await db.select().from(operatorGrantsTable).where(and(
    eq(operatorGrantsTable.userId, userId),
    eq(operatorGrantsTable.active, true),
  )).limit(1);
  if (!grant || !operatorRoles.has(grant.role) || (minimum === "admin" && grant.role !== "admin")) {
    return { error: 403 as const };
  }
  return { userId, grant };
}

function caseIdOf(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function caseJson(row: typeof moderationCasesTable.$inferSelect) {
  const ageHours = Math.max(0, (Date.now() - row.createdAt.getTime()) / 3_600_000);
  return {
    id: row.id,
    targetType: row.targetType as "post" | "comment" | "profile",
    targetId: row.targetId,
    status: row.status as "open" | "in_review" | "escalated" | "resolved" | "appealed",
    priority: row.priority as "normal" | "high",
    dueAt: row.dueAt,
    assignedOperatorId: row.assignedOperatorId,
    version: row.version,
    resolution: row.resolution,
    ageHours,
    slaHours: SLA_HOURS,
    overdue: row.dueAt.getTime() <= Date.now(),
  };
}

async function sendAuthError(res: Parameters<IRouter["get"]>[1] extends never ? never : any, error: 401 | 403) {
  res.status(error).json({ error: error === 401 ? "Authentication required" : "Operator access required" });
}

async function caseOwner(caseRow: typeof moderationCasesTable.$inferSelect) {
  if (caseRow.targetType === "post") {
    const [row] = await db.select({ userId: foundersTable.userId, founderId: foundersTable.id })
      .from(postsTable).innerJoin(foundersTable, eq(foundersTable.id, postsTable.authorId))
      .where(eq(postsTable.id, caseRow.targetId)).limit(1);
    return row ?? null;
  }
  if (caseRow.targetType === "profile") {
    const [row] = await db.select({ userId: foundersTable.userId, founderId: foundersTable.id })
      .from(foundersTable).where(eq(foundersTable.id, caseRow.targetId)).limit(1);
    return row ?? null;
  }
  const [row] = await db.select({ userId: foundersTable.userId, founderId: foundersTable.id })
    .from(commentsTable).innerJoin(foundersTable, eq(foundersTable.id, commentsTable.authorId))
    .where(eq(commentsTable.id, caseRow.targetId)).limit(1);
  return row ?? null;
}

async function findCase(caseId: number) {
  const [row] = await db.select().from(moderationCasesTable).where(eq(moderationCasesTable.id, caseId)).limit(1);
  return row ?? null;
}

function appealJson(row: typeof moderationAppealsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

function memberAppealJson(row: Pick<typeof moderationAppealsTable.$inferSelect, "id" | "caseId" | "statement" | "status" | "decision" | "createdAt" | "decidedAt">) {
  return {
    id: row.id,
    caseId: row.caseId,
    statement: row.statement,
    status: row.status,
    decision: row.decision,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

async function caseIsAppealable(row: typeof moderationCasesTable.$inferSelect, userId: string) {
  const [sanction] = await db.select({ id: accountSanctionsTable.id })
    .from(accountSanctionsTable)
    .where(and(
      eq(accountSanctionsTable.caseId, row.id),
      eq(accountSanctionsTable.userId, userId),
      eq(accountSanctionsTable.status, "active"),
      or(isNull(accountSanctionsTable.expiresAt), gte(accountSanctionsTable.expiresAt, new Date())),
    )).limit(1);
  if (sanction) return true;
  if (row.targetType === "post") {
    const [post] = await db.select({ moderationStatus: postsTable.moderationStatus })
      .from(postsTable).where(eq(postsTable.id, row.targetId)).limit(1);
    return post?.moderationStatus === "quarantined" || post?.moderationStatus === "removed";
  }
  if (row.targetType === "profile") return Boolean(sanction);
  const [comment] = await db.select({ moderationStatus: commentsTable.moderationStatus })
    .from(commentsTable).where(eq(commentsTable.id, row.targetId)).limit(1);
  return comment?.moderationStatus === "quarantined" || comment?.moderationStatus === "removed";
}

router.get("/moderation/cases", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const parsed = ListModerationCasesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.status) filters.push(eq(moderationCasesTable.status, parsed.data.status));
  if (parsed.data.priority) filters.push(eq(moderationCasesTable.priority, parsed.data.priority));
  if (parsed.data.overdue) filters.push(lte(moderationCasesTable.dueAt, new Date()));
  if (parsed.data.minAgeHours !== undefined) {
    filters.push(lte(moderationCasesTable.createdAt, new Date(Date.now() - parsed.data.minAgeHours * 3_600_000)));
  }
  const rows = await db.select().from(moderationCasesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(moderationCasesTable.createdAt)).limit(100);
  res.json(ListModerationCasesResponse.parse({ cases: rows.map(caseJson) }));
});

router.get("/moderation/cases/:caseId", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const parsed = GetModerationCaseParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const row = await findCase(parsed.data.caseId);
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }
  const [signals, actions] = await Promise.all([
    db.select({
      id: moderationCaseSignalsTable.id,
      signalType: moderationCaseSignalsTable.signalType,
      subjectId: moderationCaseSignalsTable.subjectId,
      reportId: moderationCaseSignalsTable.reportId,
      createdAt: moderationCaseSignalsTable.createdAt,
    }).from(moderationCaseSignalsTable).where(eq(moderationCaseSignalsTable.caseId, row.id)),
    db.select({
      id: moderationActionsTable.id,
      caseId: moderationActionsTable.caseId,
      actorUserId: moderationActionsTable.actorUserId,
      action: moderationActionsTable.action,
      reason: moderationActionsTable.reason,
      beforeState: moderationActionsTable.beforeState,
      afterState: moderationActionsTable.afterState,
      createdAt: moderationActionsTable.createdAt,
    }).from(moderationActionsTable).where(eq(moderationActionsTable.caseId, row.id))
      .orderBy(desc(moderationActionsTable.createdAt)),
  ]);
  const reports = await db.select({
    id: accountReportsTable.id,
    reason: accountReportsTable.reason,
    details: accountReportsTable.details,
    contentSnapshot: accountReportsTable.contentSnapshot,
    profileSnapshot: accountReportsTable.profileSnapshot,
    sourceCreatedAt: accountReportsTable.sourceCreatedAt,
    createdAt: accountReportsTable.createdAt,
    evidenceAvailable: isNotNull(accountReportsTable.evidenceAudioObjectPath),
  }).from(accountReportsTable).where(eq(accountReportsTable.moderationCaseId, row.id));
  const [subject] = await db.select({
    status: moderationSubjectsTable.status,
    categoryCodes: moderationSubjectsTable.categoryCodes,
    riskScore: moderationSubjectsTable.riskScore,
    policyVersion: moderationSubjectsTable.policyVersion,
    provider: moderationSubjectsTable.provider,
    moderatedAt: moderationSubjectsTable.moderatedAt,
    errorCode: moderationSubjectsTable.errorCode,
  }).from(moderationSubjectsTable).where(and(
    eq(moderationSubjectsTable.targetType, row.targetType),
    eq(moderationSubjectsTable.targetId, row.targetId),
  )).orderBy(desc(moderationSubjectsTable.revision)).limit(1);
  res.json(GetModerationCaseResponse.parse({
    case: caseJson(row),
    signals,
    reports,
    subject: subject ?? {},
    actions,
  }));
});

router.post("/moderation/cases/:caseId/claim", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const parsed = ClaimModerationCaseParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(moderationCasesTable)
      .where(eq(moderationCasesTable.id, parsed.data.caseId)).limit(1);
    if (!current) return { kind: "missing" as const };
    if (current.assignedOperatorId && current.assignedOperatorId !== access.userId) return { kind: "conflict" as const };
    const [next] = await tx.update(moderationCasesTable).set({
      assignedOperatorId: access.userId,
      status: current.status === "open" ? "in_review" : current.status,
      version: current.version + 1,
      updatedAt: new Date(),
    }).where(and(eq(moderationCasesTable.id, current.id), eq(moderationCasesTable.version, current.version))).returning();
    if (!next) return { kind: "conflict" as const };
    await tx.insert(moderationActionsTable).values({
      caseId: current.id, actorUserId: access.userId, action: "claim",
      beforeState: JSON.stringify({ status: current.status, assignedOperatorId: current.assignedOperatorId }),
      afterState: JSON.stringify({ status: next.status, assignedOperatorId: access.userId }),
    });
    return { kind: "ok" as const, row: next };
  });
  if (updated.kind === "missing") { res.status(404).json({ error: "Case not found" }); return; }
  if (updated.kind === "conflict") { res.status(409).json({ error: "Case is already claimed or changed" }); return; }
  res.json(ClaimModerationCaseResponse.parse({ case: caseJson(updated.row) }));
});

router.post("/moderation/cases/:caseId/decision", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const params = DecideModerationCaseParams.safeParse(req.params);
  const body = DecideModerationCaseBody.strict().safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid case decision" }); return; }
  const { version, decision, reason } = body.data;
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(moderationCasesTable)
      .where(eq(moderationCasesTable.id, params.data.caseId)).limit(1);
    if (!current) return { kind: "missing" as const };
    if (current.version !== version) return { kind: "conflict" as const };
    const before = { status: current.status, resolution: current.resolution };
    const nextStatus = decision === "escalate" ? "escalated" : decision === "quarantine" ? "in_review" : "resolved";
    const [next] = await tx.update(moderationCasesTable).set({
      status: nextStatus, resolution: decision, version: version + 1,
      resolvedAt: nextStatus === "resolved" ? new Date() : null, updatedAt: new Date(),
    }).where(and(eq(moderationCasesTable.id, current.id), eq(moderationCasesTable.version, version))).returning();
    if (!next) return { kind: "conflict" as const };
    if (current.targetType === "post") {
      if (decision === "remove") {
        await tx.update(postsTable).set({ moderationStatus: "removed" }).where(eq(postsTable.id, current.targetId));
        await tx.update(moderationCasesTable).set({ appealDeadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) })
          .where(eq(moderationCasesTable.id, current.id));
      } else if (decision === "approve" || decision === "dismiss") {
        await tx.update(postsTable).set({ moderationStatus: "approved" }).where(and(eq(postsTable.id, current.targetId), ne(postsTable.deletionStatus, "deleting")));
      } else if (decision === "quarantine") {
        await tx.update(postsTable).set({ moderationStatus: "quarantined" }).where(eq(postsTable.id, current.targetId));
      }
    } else if (current.targetType === "profile") {
      // Profile reports are account-level cases. They do not have a voice
      // subject to mutate; resolve/escalate/dismiss only updates the case.
    } else if (decision === "remove") {
      await tx.update(commentsTable).set({ moderationStatus: "removed" }).where(eq(commentsTable.id, current.targetId));
      await tx.update(moderationCasesTable).set({ appealDeadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) })
        .where(eq(moderationCasesTable.id, current.id));
    } else if (decision === "approve" || decision === "dismiss") {
      await tx.update(commentsTable).set({ moderationStatus: "approved" }).where(eq(commentsTable.id, current.targetId));
    } else if (decision === "quarantine") {
      await tx.update(commentsTable).set({ moderationStatus: "quarantined" }).where(eq(commentsTable.id, current.targetId));
    }
    await tx.insert(moderationActionsTable).values({
      caseId: current.id, actorUserId: access.userId, action: decision, reason: reason ?? null,
      beforeState: JSON.stringify(before), afterState: JSON.stringify({ status: nextStatus, decision }),
    });
    return { kind: "ok" as const, row: next, notify: decision === "approve" || decision === "dismiss" };
  });
  if (updated.kind === "missing") { res.status(404).json({ error: "Case not found" }); return; }
  if (updated.kind === "conflict") { res.status(409).json({ error: "Case changed; reload before deciding" }); return; }
  if (updated.notify) {
    if (updated.row.targetType === "post") await emitApprovalNotifications(updated.row.targetId);
    else {
      const [comment] = await db.select({ postId: commentsTable.postId }).from(commentsTable).where(eq(commentsTable.id, updated.row.targetId)).limit(1);
      if (comment) await emitApprovalNotifications(comment.postId);
    }
  }
  res.json(DecideModerationCaseResponse.parse(caseJson(updated.row)));
});

// OpenAPI's generated operation uses the canonical case path. Keep the
// historical /decision endpoint as a compatibility alias below.
router.post("/moderation/cases/:caseId", async (req, res, next) => {
  const handler = router.stack.find((layer) =>
    layer.route?.path === "/moderation/cases/:caseId/decision" &&
    (layer as any).route.methods.post,
  )?.route?.stack?.[0]?.handle;
  if (handler) return handler(req, res, next);
  res.status(500).json({ error: "Moderation decision route unavailable" });
});

router.post("/moderation/cases/:caseId/sanctions", async (req, res): Promise<void> => {
  const access = await requireOperator(req, "admin");
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const params = CreateModerationSanctionParams.safeParse(req.params);
  const body = CreateModerationSanctionBody.strict().safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid sanction" }); return; }
  const row = await findCase(params.data.caseId);
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }
  const owner = await caseOwner(row);
  if (!owner?.userId) { res.status(404).json({ error: "Target account not found" }); return; }
  const [sanction] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(accountSanctionsTable).values({
      userId: owner.userId!, caseId: row.id, type: body.data.type,
      reason: body.data.reason ?? null, expiresAt: body.data.expiresAt ?? null,
    }).returning();
    await tx.insert(moderationActionsTable).values({
      caseId: row.id, actorUserId: access.userId, action: "sanction",
      reason: body.data.reason ?? null, afterState: JSON.stringify({ type: body.data.type, expiresAt: body.data.expiresAt }),
    });
    return [created];
  });
  res.status(201).json({ sanction: { id: sanction.id, type: sanction.type, status: sanction.status, expiresAt: sanction.expiresAt } });
});

router.post("/moderation/sanctions/:sanctionId/revoke", async (req, res): Promise<void> => {
  const access = await requireOperator(req, "admin");
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const params = RevokeModerationSanctionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid sanction" }); return; }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(accountSanctionsTable).where(eq(accountSanctionsTable.id, params.data.sanctionId)).limit(1);
    if (!current) return "missing" as const;
    if (current.status !== "active") return "conflict" as const;
    const [row] = await tx.update(accountSanctionsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(accountSanctionsTable.id, current.id), eq(accountSanctionsTable.status, "active"))).returning();
    if (!row) return "conflict" as const;
    if (current.caseId) await tx.insert(moderationActionsTable).values({ caseId: current.caseId, actorUserId: access.userId, action: "revoke_sanction", beforeState: JSON.stringify({ status: "active" }), afterState: JSON.stringify({ status: "revoked" }) });
    return row;
  });
  if (result === "missing") { res.status(404).json({ error: "Sanction not found" }); return; }
  if (result === "conflict") { res.status(409).json({ error: "Sanction is no longer active" }); return; }
  res.json(RevokeModerationSanctionResponse.parse({
    sanction: { id: result.id, status: result.status, revokedAt: result.revokedAt },
  }));
});

router.get("/moderation/cases/:caseId/appeals", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const params = ListCaseAppealsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid case" }); return; }
  if (!(await findCase(params.data.caseId))) { res.status(404).json({ error: "Case not found" }); return; }
  const appeals = await db.select({
    id: moderationAppealsTable.id, caseId: moderationAppealsTable.caseId,
    appellantUserId: moderationAppealsTable.appellantUserId, statement: moderationAppealsTable.statement,
    status: moderationAppealsTable.status, decision: moderationAppealsTable.decision,
    decidedBy: moderationAppealsTable.decidedBy,
    decidedAt: moderationAppealsTable.decidedAt, createdAt: moderationAppealsTable.createdAt,
  }).from(moderationAppealsTable).where(eq(moderationAppealsTable.caseId, params.data.caseId));
  res.json(ListCaseAppealsResponse.parse({ appeals: appeals.map(appealJson) }));
});

router.get("/moderation/appeals", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const appeals = await db.select({
    id: moderationAppealsTable.id, caseId: moderationAppealsTable.caseId,
    appellantUserId: moderationAppealsTable.appellantUserId, statement: moderationAppealsTable.statement,
    status: moderationAppealsTable.status, decision: moderationAppealsTable.decision,
    decidedBy: moderationAppealsTable.decidedBy,
    createdAt: moderationAppealsTable.createdAt, decidedAt: moderationAppealsTable.decidedAt,
  }).from(moderationAppealsTable).where(eq(moderationAppealsTable.status, "open")).orderBy(desc(moderationAppealsTable.createdAt));
  res.json(ListModerationAppealsResponse.parse({ appeals: appeals.map(appealJson) }));
});

router.get("/moderation/appeals/eligible", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const rows = await db.select().from(moderationCasesTable)
    .orderBy(desc(moderationCasesTable.updatedAt)).limit(100);
  const eligible = [];
  for (const row of rows) {
    const [sanction] = await db.select({
      type: accountSanctionsTable.type,
      reason: accountSanctionsTable.reason,
      status: accountSanctionsTable.status,
    }).from(accountSanctionsTable).where(and(
      eq(accountSanctionsTable.caseId, row.id),
      eq(accountSanctionsTable.userId, userId),
      eq(accountSanctionsTable.status, "active"),
      or(isNull(accountSanctionsTable.expiresAt), gte(accountSanctionsTable.expiresAt, new Date())),
    )).limit(1);
    const owner = await caseOwner(row);
    if (!sanction && (!owner?.userId || owner.userId !== userId)) continue;
    let contentExcerpt: string | null = null;
    let contentCreatedAt: Date | null = null;
    let contentStatus: string | null = null;
    if (row.targetType === "post") {
      const [post] = await db.select({
        transcript: postsTable.transcript,
        createdAt: postsTable.createdAt,
        moderationStatus: postsTable.moderationStatus,
      }).from(postsTable).where(eq(postsTable.id, row.targetId)).limit(1);
      contentExcerpt = post?.transcript.slice(0, 280) ?? null;
      contentCreatedAt = post?.createdAt ?? null;
      contentStatus = post?.moderationStatus ?? null;
    } else if (row.targetType === "comment") {
      const [comment] = await db.select({
        transcript: commentsTable.transcript,
        createdAt: commentsTable.createdAt,
        moderationStatus: commentsTable.moderationStatus,
      }).from(commentsTable).where(eq(commentsTable.id, row.targetId)).limit(1);
      contentExcerpt = comment?.transcript.slice(0, 280) ?? null;
      contentCreatedAt = comment?.createdAt ?? null;
      contentStatus = comment?.moderationStatus ?? null;
    }
    const contentEligible = contentStatus === "quarantined" || contentStatus === "removed";
    if (!contentEligible && !sanction) continue;
    const [existingAppeal] = await db.select({ id: moderationAppealsTable.id })
      .from(moderationAppealsTable).where(and(
        eq(moderationAppealsTable.caseId, row.id),
        eq(moderationAppealsTable.appellantUserId, userId),
      )).limit(1);
    eligible.push({
      caseId: row.id,
      targetType: row.targetType as "post" | "comment" | "profile",
      targetId: row.targetId,
      contentExcerpt,
      contentCreatedAt: contentCreatedAt?.toISOString() ?? null,
      reason: sanction && !contentEligible
        ? (sanction.reason ?? `sanction:${sanction.type}`)
        : (row.resolution ?? contentStatus ?? "moderation"),
      status: sanction && !contentEligible ? sanction.status : contentStatus!,
      alreadyAppealed: Boolean(existingAppeal),
    });
  }
  res.json(ListEligibleModerationAppealsResponse.parse({ cases: eligible }));
});

router.get("/moderation/appeals/mine", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const appeals = await db.select({
    id: moderationAppealsTable.id, caseId: moderationAppealsTable.caseId,
    statement: moderationAppealsTable.statement, status: moderationAppealsTable.status,
    decision: moderationAppealsTable.decision, createdAt: moderationAppealsTable.createdAt,
    decidedAt: moderationAppealsTable.decidedAt,
  }).from(moderationAppealsTable).where(eq(moderationAppealsTable.appellantUserId, userId)).orderBy(desc(moderationAppealsTable.createdAt));
  res.json(ListMyModerationAppealsResponse.parse({ appeals: appeals.map(memberAppealJson) }));
});

router.get("/moderation/appeals/:appealId", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const params = GetModerationAppealParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid appeal" }); return; }
  const [appeal] = await db.select().from(moderationAppealsTable).where(eq(moderationAppealsTable.id, params.data.appealId)).limit(1);
  if (!appeal) { res.status(404).json({ error: "Appeal not found" }); return; }
  res.json(GetModerationAppealResponse.parse({ appeal: appealJson(appeal) }));
});

router.post("/moderation/appeals/:appealId/decision", async (req, res): Promise<void> => {
  const access = await requireOperator(req);
  if ("error" in access) { await sendAuthError(res, access.error!); return; }
  const params = DecideModerationAppealParams.safeParse(req.params);
  const body = DecideModerationAppealBody.strict().safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid appeal decision" }); return; }
  if (body.data.decision === "revoke_sanction" && access.grant.role !== "admin") {
    res.status(403).json({ error: "Administrator approval is required to revoke sanctions" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [appeal] = await tx.select().from(moderationAppealsTable).where(eq(moderationAppealsTable.id, params.data.appealId)).limit(1);
    if (!appeal) return "missing" as const;
    if (appeal.status !== "open") return "conflict" as const;
    const [caseBefore] = await tx.select().from(moderationCasesTable).where(eq(moderationCasesTable.id, appeal.caseId)).limit(1);
    if (!caseBefore) return "missing" as const;
    if (body.data.decision === "restore" && caseBefore.appealDeadlineAt && caseBefore.appealDeadlineAt <= new Date()) return "conflict" as const;
    const [row] = await tx.update(moderationAppealsTable).set({
      status: body.data.decision === "uphold" ? "upheld" : "decided",
      decision: body.data.decision, decidedBy: access.userId, decidedAt: new Date(),
    }).where(and(eq(moderationAppealsTable.id, appeal.id), eq(moderationAppealsTable.status, "open"))).returning();
    if (!row) return "conflict" as const;
    const [caseRow] = [caseBefore];
    if (caseRow) {
      const retainedRemove = caseRow.resolution === "remove";
      await tx.update(moderationCasesTable).set({ status: "resolved", resolution: retainedRemove ? "remove" : `appeal:${body.data.decision}`, version: caseRow.version + 1, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(moderationCasesTable.id, caseRow.id));
      if (body.data.decision === "restore") {
        if (caseRow.targetType === "post") await tx.update(postsTable).set({ moderationStatus: "approved", deletionStatus: "active" }).where(eq(postsTable.id, caseRow.targetId));
        else await tx.update(commentsTable).set({ moderationStatus: "approved" }).where(eq(commentsTable.id, caseRow.targetId));
        await tx.delete(objectCleanupJobsTable).where(and(eq(objectCleanupJobsTable.scopeType, "moderation"), eq(objectCleanupJobsTable.scopeId, String(caseRow.id)), eq(objectCleanupJobsTable.status, "pending")));
        await tx.update(moderationCasesTable).set({ appealDeadlineAt: null, sourceCleanupQueuedAt: null }).where(eq(moderationCasesTable.id, caseRow.id));
      }
      if (body.data.decision === "revoke_sanction") {
        await tx.update(accountSanctionsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(accountSanctionsTable.caseId, caseRow.id), eq(accountSanctionsTable.status, "active")));
      }
      await tx.insert(moderationActionsTable).values({ caseId: caseRow.id, actorUserId: access.userId, action: "appeal_decision", reason: body.data.reason ?? null, afterState: JSON.stringify({ decision: body.data.decision }) });
    }
    return row;
  });
  if (result === "missing") { res.status(404).json({ error: "Appeal not found" }); return; }
  if (result === "conflict") { res.status(409).json({ error: "Appeal is already decided" }); return; }
  res.json(DecideModerationAppealResponse.parse({ appeal: appealJson(result) }));
});

router.post("/moderation/cases/:caseId/appeals", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const params = CreateModerationAppealParams.safeParse(req.params);
  const body = CreateModerationAppealBody.strict().safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid appeal" }); return; }
  const row = await findCase(params.data.caseId);
  if (!row) { res.status(404).json({ error: "Case not found" }); return; }
  if (row.appealDeadlineAt && row.appealDeadlineAt <= new Date()) { res.status(409).json({ error: "Appeal window has closed" }); return; }
  const owner = await caseOwner(row);
  if (!owner?.userId || owner.userId !== userId) { res.status(403).json({ error: "You may only appeal your own moderation case" }); return; }
  if (!(await caseIsAppealable(row, userId))) { res.status(400).json({ error: "This case is not eligible for appeal" }); return; }
  const [appeal] = await db.transaction(async (tx) => {
    const [lockedCase] = await tx.select().from(moderationCasesTable)
      .where(eq(moderationCasesTable.id, row.id)).for("update").limit(1);
    if (!lockedCase || lockedCase.sourceCleanupQueuedAt || (lockedCase.resolution === "remove" && (!lockedCase.appealDeadlineAt || lockedCase.appealDeadlineAt <= new Date()))) return [];
    const [existing] = await tx.select({ id: moderationAppealsTable.id }).from(moderationAppealsTable).where(and(
      eq(moderationAppealsTable.caseId, lockedCase.id),
      eq(moderationAppealsTable.appellantUserId, userId),
    )).limit(1);
    if (existing) return [];
    const [created] = await tx.insert(moderationAppealsTable).values({ caseId: row.id, appellantUserId: userId, statement: body.data.statement.trim() })
      .onConflictDoNothing({ target: [moderationAppealsTable.caseId, moderationAppealsTable.appellantUserId] }).returning();
    if (!created) return [];
    await tx.update(moderationCasesTable).set({ status: "appealed", version: lockedCase.version + 1, updatedAt: new Date() }).where(eq(moderationCasesTable.id, row.id));
    await tx.insert(moderationActionsTable).values({ caseId: row.id, actorUserId: userId, action: "appeal_submitted" });
    return [created];
  });
  if (!appeal) { res.status(409).json({ error: "An appeal already exists" }); return; }
  res.status(201).json({ appeal: { id: appeal.id, status: appeal.status, createdAt: appeal.createdAt } });
});

export default router;
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./shuut";

export const moderationSubjectsTable = pgTable("shuut_moderation_subjects", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  revision: integer("revision").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("pending"),
  categoryCodes: text("category_codes").notNull().default("[]"),
  riskScore: integer("risk_score"),
  provider: text("provider"),
  policyVersion: text("policy_version"),
  errorCode: text("error_code"),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("shuut_moderation_subject_target_revision_idx").on(table.targetType, table.targetId, table.revision),
  index("shuut_moderation_subject_status_idx").on(table.status),
]);

export const moderationJobsTable = pgTable("shuut_moderation_jobs", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  revision: integer("revision").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseToken: text("lease_token"),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("shuut_moderation_job_target_revision_idx").on(table.targetType, table.targetId, table.revision),
  index("shuut_moderation_job_due_idx").on(table.status, table.nextAttemptAt),
]);

export const operatorGrantsTable = pgTable("shuut_operator_grants", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("reviewer"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationCasesTable = pgTable("shuut_moderation_cases", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  assignedOperatorId: text("assigned_operator_id"),
  version: integer("version").notNull().default(1),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  appealDeadlineAt: timestamp("appeal_deadline_at", { withTimezone: true }),
  sourceCleanupQueuedAt: timestamp("source_cleanup_queued_at", { withTimezone: true }),
  sourceCleanupCompletedAt: timestamp("source_cleanup_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("shuut_moderation_case_target_idx").on(table.targetType, table.targetId),
  index("shuut_moderation_case_queue_idx").on(table.status, table.dueAt),
  index("shuut_moderation_case_assignment_idx").on(table.assignedOperatorId, table.status),
]);

export const moderationCaseSignalsTable = pgTable("shuut_moderation_case_signals", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => moderationCasesTable.id, { onDelete: "cascade" }),
  signalType: text("signal_type").notNull(),
  reportId: integer("report_id"),
  subjectId: integer("subject_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("shuut_moderation_case_signal_case_idx").on(table.caseId),
]);

export const moderationActionsTable = pgTable("shuut_moderation_actions", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => moderationCasesTable.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  reason: text("reason"),
  beforeState: text("before_state"),
  afterState: text("after_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("shuut_moderation_action_case_idx").on(table.caseId)]);

export const accountSanctionsTable = pgTable("shuut_account_sanctions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  caseId: integer("case_id").references(() => moderationCasesTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("active"),
  reason: text("reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("shuut_account_sanction_user_idx").on(table.userId, table.status)]);

export const moderationAppealsTable = pgTable("shuut_moderation_appeals", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => moderationCasesTable.id, { onDelete: "cascade" }),
  appellantUserId: text("appellant_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  statement: text("statement").notNull(),
  status: text("status").notNull().default("open"),
  decision: text("decision"),
  decidedBy: text("decided_by").references(() => usersTable.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("shuut_moderation_appeal_one_per_user_case_idx").on(table.caseId, table.appellantUserId),
  index("shuut_moderation_appeal_status_idx").on(table.status),
  index("shuut_moderation_appeal_case_idx").on(table.caseId, table.status),
]);

export type ModerationSubjectRow = typeof moderationSubjectsTable.$inferSelect;
export type ModerationJobRow = typeof moderationJobsTable.$inferSelect;
export type ModerationCaseRow = typeof moderationCasesTable.$inferSelect;
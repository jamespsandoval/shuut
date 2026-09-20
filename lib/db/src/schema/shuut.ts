import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const foundersTable = pgTable("shuut_founders", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  bio: text("bio").notNull(),
  avatarColor: text("avatar_color").notNull(),
  avatarObjectPath: text("avatar_url"),
  location: text("location"),
  website: text("website"),
  isFollowing: boolean("is_following").notNull().default(false),
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  previewTranscript: boolean("preview_transcript").notNull().default(false),
});

export const postsTable = pgTable("shuut_posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id")
    .notNull()
    .references(() => foundersTable.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull(),
  transcriptionStatus: text("transcription_status").notNull().default("ready"),
  audioUrl: text("audio_url"),
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  goat: integer("goat").notNull().default(0),
  rocket: integer("rocket").notNull().default(0),
  laughing: integer("laughing").notNull().default(0),
  confused: integer("confused").notNull().default(0),
  thumbsDown: integer("thumbs_down").notNull().default(0),
  viewerReaction: text("viewer_reaction"),
  isReshuuted: boolean("is_reshuuted").notNull().default(false),
  reshuutedBy: text("reshuuted_by"),
  deletionStatus: text("deletion_status").notNull().default("active"),
  moderationStatus: text("moderation_status").notNull().default("pending"),
  moderationRevision: integer("moderation_revision").notNull().default(1),
  moderationRiskScore: integer("moderation_risk_score"),
  moderationCategories: text("moderation_categories").notNull().default("[]"),
  moderationErrorCode: text("moderation_error_code"),
});

export const postReactionsTable = pgTable(
  "shuut_post_reactions",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    founderId: integer("founder_id")
      .notNull()
      .references(() => foundersTable.id, { onDelete: "cascade" }),
    emojiType: text("emoji_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shuut_post_reactions_post_founder_idx").on(table.postId, table.founderId),
    index("shuut_post_reactions_founder_idx").on(table.founderId),
  ],
);

export const accountFollowsTable = pgTable(
  "shuut_account_follows",
  {
    id: serial("id").primaryKey(),
    followerFounderId: integer("follower_founder_id").notNull(),
    followedFounderId: integer("followed_founder_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shuut_account_follows_pair_idx").on(table.followerFounderId, table.followedFounderId),
    index("shuut_account_follows_follower_idx").on(table.followerFounderId),
    index("shuut_account_follows_followed_idx").on(table.followedFounderId),
  ],
);

export const postReshuutsTable = pgTable(
  "shuut_post_reshuuts",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    founderId: integer("founder_id")
      .notNull()
      .references(() => foundersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shuut_post_reshuuts_post_founder_idx").on(table.postId, table.founderId),
    index("shuut_post_reshuuts_founder_idx").on(table.founderId),
  ],
);

export const commentsTable = pgTable(
  "shuut_comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => foundersTable.id, { onDelete: "cascade" }),
    transcript: text("transcript").notNull().default(""),
    transcriptionStatus: text("transcription_status").notNull().default("processing"),
    audioUrl: text("audio_url").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    moderationStatus: text("moderation_status").notNull().default("pending"),
    moderationRevision: integer("moderation_revision").notNull().default(1),
    moderationRiskScore: integer("moderation_risk_score"),
    moderationCategories: text("moderation_categories").notNull().default("[]"),
    moderationErrorCode: text("moderation_error_code"),
  },
  (table) => [
    index("shuut_comments_post_created_idx").on(table.postId, table.createdAt),
    index("shuut_comments_author_idx").on(table.authorId),
  ],
);

export const postMentionsTable = pgTable(
  "shuut_post_mentions",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
    founderId: integer("founder_id").notNull().references(() => foundersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shuut_post_mentions_post_founder_idx").on(table.postId, table.founderId),
    index("shuut_post_mentions_founder_idx").on(table.founderId),
  ],
);

export const notificationsTable = pgTable(
  "shuut_notifications",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").notNull().references(() => foundersTable.id, { onDelete: "cascade" }),
    recipientId: integer("recipient_id").notNull().references(() => foundersTable.id, { onDelete: "cascade" }),
    postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    reactionType: text("reaction_type"),
    commentId: integer("comment_id").references(() => commentsTable.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shuut_notifications_recipient_created_idx").on(table.recipientId, table.createdAt),
    index("shuut_notifications_post_idx").on(table.postId),
  ],
);

export const profileImageUploadsTable = pgTable(
  "shuut_profile_image_uploads",
  {
    objectPath: text("object_path").primaryKey(),
    userId: text("user_id").notNull(),
    uploadTokenDigest: text("upload_token_digest"),
    uploadTokenConsumedAt: timestamp("upload_token_consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_profile_image_uploads_user_idx").on(table.userId)],
);

export const privateObjectCleanupTable = pgTable(
  "shuut_private_object_cleanup",
  {
    objectPath: text("object_path").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_private_object_cleanup_due_idx").on(table.nextAttemptAt)],
);

export const usersTable = pgTable("shuut_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletionStatus: text("deletion_status").notNull().default("active"),
  eligibilityStatus: text("eligibility_status").notNull().default("undecided"),
  onboardingFirstName: text("onboarding_first_name"),
  onboardingLastName: text("onboarding_last_name"),
  proposedHandle: text("proposed_handle"),
  eligibilityDecidedAt: timestamp("eligibility_decided_at", { withTimezone: true }),
});

export const legalPolicyAcceptancesTable = pgTable(
  "shuut_legal_policy_acceptances",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    policyKey: text("policy_key").notNull(),
    policyVersion: text("policy_version").notNull(),
    policyContentHash: text("policy_content_hash").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("web"),
  },
  (table) => [
    uniqueIndex("shuut_legal_policy_acceptances_user_policy_version_idx").on(
      table.userId,
      table.policyKey,
      table.policyVersion,
    ),
    index("shuut_legal_policy_acceptances_user_idx").on(table.userId),
  ],
);

export const voiceAiConsentsTable = pgTable(
  "shuut_voice_ai_consents",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    consentVersion: text("consent_version").notNull(),
    consentContentHash: text("consent_content_hash").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    source: text("source").notNull().default("web"),
  },
  (table) => [
    uniqueIndex("shuut_voice_ai_consents_user_version_idx").on(table.userId, table.consentVersion),
    index("shuut_voice_ai_consents_user_idx").on(table.userId),
  ],
);

export const objectCleanupJobsTable = pgTable(
  "shuut_object_cleanup_jobs",
  {
    id: serial("id").primaryKey(),
    objectPath: text("object_path").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shuut_cleanup_jobs_retry_idx").on(table.status, table.nextAttemptAt),
    index("shuut_cleanup_jobs_scope_idx").on(table.scopeType, table.scopeId),
    uniqueIndex("shuut_cleanup_jobs_scope_object_idx").on(
      table.scopeType,
      table.scopeId,
      table.objectPath,
    ),
  ],
);
export const sessionsTable = pgTable(
  "shuut_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    transport: text("transport").notNull().default("browser"),
    deviceHash: text("device_hash"),
    ipPrefix: text("ip_prefix"),
    passkeyVerifiedAt: timestamp("passkey_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_sessions_user_idx").on(table.userId)],
);

export const mobileSessionGrantsTable = pgTable(
  "shuut_mobile_session_grants",
  {
    grantHash: text("grant_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash")
      .notNull()
      .references(() => sessionsTable.tokenHash, { onDelete: "cascade" }),
    browserSessionTokenHash: text("browser_session_token_hash"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shuut_mobile_session_grants_user_idx").on(table.userId),
    index("shuut_mobile_session_grants_expiry_idx").on(table.expiresAt),
  ],
);

export const authCodesTable = pgTable(
  "shuut_auth_codes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_auth_codes_user_purpose_idx").on(table.userId, table.purpose)],
);

export const passkeysTable = pgTable(
  "shuut_passkeys",
  {
    credentialId: text("credential_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports"),
    deviceName: text("device_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [index("shuut_passkeys_user_idx").on(table.userId)],
);

export const passkeyRecoveriesTable = pgTable(
  "shuut_passkey_recoveries",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    confirmationCodeHash: text("confirmation_code_hash"),
    confirmationCodeExpiresAt: timestamp("confirmation_code_expires_at", { withTimezone: true }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_passkey_recoveries_available_idx").on(table.availableAt)],
);

export const webauthnChallengesTable = pgTable(
  "shuut_webauthn_challenges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash")
      .notNull()
      .references(() => sessionsTable.tokenHash, { onDelete: "cascade" }),
    challenge: text("challenge").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_webauthn_challenges_user_idx").on(table.userId)],
);

export const securityRateLimitsTable = pgTable(
  "shuut_security_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
  },
);

export const securityAuditEventsTable = pgTable(
  "shuut_security_audit_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    ipPrefix: text("ip_prefix"),
    deviceHash: text("device_hash"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shuut_security_audit_events_user_idx").on(table.userId),
    index("shuut_security_audit_events_type_idx").on(table.eventType),
  ],
);

/**
 * Account relationships are kept independently from profile rows so a block
 * remains durable while either side is being deleted.  The pair is stored in
 * canonical order, making a block mutual for reads without duplicating rows.
 */
export const accountBlocksTable = pgTable(
  "shuut_account_blocks",
  {
    id: serial("id").primaryKey(),
    blockerFounderId: integer("blocker_founder_id").notNull(),
    blockedFounderId: integer("blocked_founder_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shuut_account_blocks_pair_idx").on(table.blockerFounderId, table.blockedFounderId),
    index("shuut_account_blocks_blocker_idx").on(table.blockerFounderId),
    index("shuut_account_blocks_blocked_idx").on(table.blockedFounderId),
  ],
);

export const accountReportsTable = pgTable(
  "shuut_account_reports",
  {
    id: serial("id").primaryKey(),
    reporterUserId: text("reporter_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    reporterFounderId: integer("reporter_founder_id"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    targetAuthorId: integer("target_author_id"),
    targetAuthorHandle: text("target_author_handle"),
    contentSnapshot: text("content_snapshot"),
    profileSnapshot: text("profile_snapshot"),
    evidenceAudioObjectPath: text("evidence_audio_object_path"),
    contentHash: text("content_hash"),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    moderationCaseId: integer("moderation_case_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shuut_account_reports_reporter_target_idx").on(
      table.reporterUserId,
      table.targetType,
      table.targetId,
    ),
    index("shuut_account_reports_target_idx").on(table.targetType, table.targetId),
  ],
);

export type FounderRow = typeof foundersTable.$inferSelect;
export type PostRow = typeof postsTable.$inferSelect;
export type CommentRow = typeof commentsTable.$inferSelect;
export type NotificationRow = typeof notificationsTable.$inferSelect;
export type AccountBlockRow = typeof accountBlocksTable.$inferSelect;
export type AccountReportRow = typeof accountReportsTable.$inferSelect;

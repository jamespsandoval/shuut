import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const foundersTable = pgTable("shuut_founders", {
  id: serial("id").primaryKey(),
  userId: text("clerk_user_id"),
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
});

export const postsTable = pgTable("shuut_posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id")
    .notNull()
    .references(() => foundersTable.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull(),
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
});

export const profileImageUploadsTable = pgTable(
  "shuut_profile_image_uploads",
  {
    objectPath: text("object_path").primaryKey(),
    userId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_profile_image_uploads_user_idx").on(table.userId)],
);

export const usersTable = pgTable("shuut_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsTable = pgTable(
  "shuut_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shuut_sessions_user_idx").on(table.userId)],
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

export type FounderRow = typeof foundersTable.$inferSelect;
export type PostRow = typeof postsTable.$inferSelect;
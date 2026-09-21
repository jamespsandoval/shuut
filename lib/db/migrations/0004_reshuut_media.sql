ALTER TABLE "shuut_posts" ADD COLUMN IF NOT EXISTS "image_url" text;

ALTER TABLE "shuut_post_reshuuts"
  ADD COLUMN IF NOT EXISTS "transcript" text,
  ADD COLUMN IF NOT EXISTS "transcription_status" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "audio_url" text,
  ADD COLUMN IF NOT EXISTS "image_url" text,
  ADD COLUMN IF NOT EXISTS "duration_seconds" integer,
  ADD COLUMN IF NOT EXISTS "moderation_status" text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "moderation_revision" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "deletion_status" text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "shuut_post_reshuuts_post_created_idx"
  ON "shuut_post_reshuuts" ("post_id", "created_at");
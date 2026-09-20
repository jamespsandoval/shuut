ALTER TABLE "shuut_profile_image_uploads"
  ADD COLUMN IF NOT EXISTS "upload_token_digest" text,
  ADD COLUMN IF NOT EXISTS "upload_token_consumed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "shuut_profile_image_uploads_token_digest_idx"
  ON "shuut_profile_image_uploads" ("upload_token_digest")
  WHERE "upload_token_digest" IS NOT NULL;
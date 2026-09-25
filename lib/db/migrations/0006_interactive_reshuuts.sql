-- Interactive nested reSHÜÜTs are additive; existing root shares remain intact.
ALTER TABLE "shuut_post_reshuuts"
  ADD COLUMN IF NOT EXISTS "parent_reshuut_id" integer,
  ADD COLUMN IF NOT EXISTS "rocket" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "laughing" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "thumbs_down" integer NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "shuut_post_reshuuts_post_founder_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "shuut_post_reshuuts_post_founder_idx"
  ON "shuut_post_reshuuts" ("post_id", "founder_id")
  WHERE "parent_reshuut_id" IS NULL;
CREATE INDEX IF NOT EXISTS "shuut_post_reshuuts_parent_idx"
  ON "shuut_post_reshuuts" ("parent_reshuut_id");
CREATE UNIQUE INDEX IF NOT EXISTS "shuut_post_reshuuts_parent_founder_idx"
  ON "shuut_post_reshuuts" ("parent_reshuut_id", "founder_id")
  WHERE "parent_reshuut_id" IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shuut_post_reshuuts_parent_fk'
      AND conrelid = 'shuut_post_reshuuts'::regclass
  ) THEN
    ALTER TABLE "shuut_post_reshuuts"
      ADD CONSTRAINT "shuut_post_reshuuts_parent_fk"
      FOREIGN KEY ("parent_reshuut_id")
      REFERENCES "shuut_post_reshuuts" ("id")
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "shuut_reshuut_reactions" (
  "id" serial PRIMARY KEY,
  "reshuut_id" integer NOT NULL REFERENCES "shuut_post_reshuuts"("id") ON DELETE CASCADE,
  "founder_id" integer NOT NULL REFERENCES "shuut_founders"("id") ON DELETE CASCADE,
  "emoji_type" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "shuut_reshuut_reactions_reshuut_founder_idx"
  ON "shuut_reshuut_reactions" ("reshuut_id", "founder_id");
CREATE INDEX IF NOT EXISTS "shuut_reshuut_reactions_founder_idx"
  ON "shuut_reshuut_reactions" ("founder_id");

ALTER TABLE "shuut_comments" ADD COLUMN IF NOT EXISTS "reshuut_id" integer;
CREATE INDEX IF NOT EXISTS "shuut_comments_reshuut_created_idx"
  ON "shuut_comments" ("reshuut_id", "created_at");

ALTER TABLE "shuut_notifications"
  ADD COLUMN IF NOT EXISTS "reshuut_id" integer;
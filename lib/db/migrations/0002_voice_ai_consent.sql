CREATE TABLE IF NOT EXISTS shuut_voice_ai_consents (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES shuut_users(id) ON DELETE CASCADE,
  consent_version text NOT NULL,
  consent_content_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  source text NOT NULL DEFAULT 'web'
);
ALTER TABLE shuut_voice_ai_consents
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS consent_content_hash text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'web';
ALTER TABLE shuut_voice_ai_consents
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN consent_version SET NOT NULL,
  ALTER COLUMN consent_content_hash SET NOT NULL,
  ALTER COLUMN accepted_at SET DEFAULT now(),
  ALTER COLUMN accepted_at SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'web',
  ALTER COLUMN source SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shuut_voice_ai_consents_user_version_idx
  ON shuut_voice_ai_consents(user_id, consent_version);
CREATE INDEX IF NOT EXISTS shuut_voice_ai_consents_user_idx
  ON shuut_voice_ai_consents(user_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shuut_voice_ai_consents'::regclass
      AND contype = 'f'
      AND confrelid = 'shuut_users'::regclass
  ) THEN
    ALTER TABLE shuut_voice_ai_consents
      ADD CONSTRAINT shuut_voice_ai_consents_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES shuut_users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shuut_voice_ai_consents'::regclass
      AND conname = 'shuut_voice_ai_consents_source_check'
  ) THEN
    ALTER TABLE shuut_voice_ai_consents
      ADD CONSTRAINT shuut_voice_ai_consents_source_check
      CHECK (source IN ('web','native','ios','android'));
  END IF;
END $$;
DO $$
BEGIN
  IF to_regclass('shuut_voice_ai_consents') IS NULL THEN RAISE EXCEPTION 'missing voice AI consent table'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('id'), ('user_id'), ('consent_version'), ('consent_content_hash'),
      ('accepted_at'), ('revoked_at'), ('source')
    ) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_name = 'shuut_voice_ai_consents'
        AND c.column_name = required.column_name
    )
  ) THEN RAISE EXCEPTION 'missing required consent column'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shuut_voice_ai_consents'
      AND column_name IN ('user_id', 'consent_version', 'consent_content_hash', 'accepted_at', 'source')
      AND is_nullable <> 'NO'
  ) THEN RAISE EXCEPTION 'required consent column is nullable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shuut_voice_ai_consents' AND column_name = 'accepted_at'
      AND column_default LIKE '%now()%'
  ) THEN RAISE EXCEPTION 'accepted_at missing now default'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'shuut_voice_ai_consents' AND constraint_type = 'FOREIGN KEY'
  ) THEN RAISE EXCEPTION 'missing consent user foreign key'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'shuut_voice_ai_consents_user_version_idx') THEN RAISE EXCEPTION 'missing voice AI consent uniqueness'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'shuut_voice_ai_consents_user_idx') THEN RAISE EXCEPTION 'missing voice AI consent user index'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shuut_voice_ai_consents'::regclass
      AND conname = 'shuut_voice_ai_consents_source_check'
  ) THEN RAISE EXCEPTION 'missing source check'; END IF;
END $$;
-- Verification (read-only): all required tables/columns and pending defaults exist.
DO $$
DECLARE missing text; item record; col information_schema.columns%ROWTYPE; def record;
BEGIN
  SELECT string_agg(name, ', ') INTO missing FROM unnest(ARRAY[
  'shuut_moderation_subjects','shuut_moderation_jobs','shuut_moderation_cases',
  'shuut_moderation_case_signals','shuut_moderation_actions',
  'shuut_account_sanctions','shuut_moderation_appeals'
  ]) AS t(name) WHERE to_regclass(name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing moderation tables: %', missing; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_moderation_jobs' AND column_name='lease_token') THEN RAISE EXCEPTION 'lease_token missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_posts' AND column_name='moderation_status' AND column_default LIKE '%pending%') THEN RAISE EXCEPTION 'post pending default missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_comments' AND column_name='moderation_status' AND column_default LIKE '%pending%') THEN RAISE EXCEPTION 'comment pending default missing'; END IF;
  IF to_regclass('shuut_moderation_subject_target_revision_idx') IS NULL OR to_regclass('shuut_moderation_job_target_revision_idx') IS NULL THEN RAISE EXCEPTION 'moderation unique indexes missing'; END IF;
  IF to_regclass('shuut_moderation_job_due_idx') IS NULL OR to_regclass('shuut_moderation_case_queue_idx') IS NULL THEN RAISE EXCEPTION 'moderation queue indexes missing'; END IF;
  FOR item IN SELECT * FROM (VALUES
    ('shuut_moderation_subjects','id'),('shuut_moderation_subjects','target_type'),('shuut_moderation_subjects','target_id'),('shuut_moderation_subjects','revision'),('shuut_moderation_subjects','content_hash'),('shuut_moderation_subjects','status'),('shuut_moderation_subjects','category_codes'),('shuut_moderation_subjects','created_at'),('shuut_moderation_subjects','updated_at'),
    ('shuut_moderation_jobs','id'),('shuut_moderation_jobs','target_type'),('shuut_moderation_jobs','target_id'),('shuut_moderation_jobs','revision'),('shuut_moderation_jobs','content_hash'),('shuut_moderation_jobs','status'),('shuut_moderation_jobs','attempts'),('shuut_moderation_jobs','next_attempt_at'),('shuut_moderation_jobs','created_at'),('shuut_moderation_jobs','updated_at'),
    ('shuut_operator_grants','user_id'),('shuut_operator_grants','role'),('shuut_operator_grants','active'),('shuut_operator_grants','created_at'),
    ('shuut_moderation_cases','id'),('shuut_moderation_cases','target_type'),('shuut_moderation_cases','target_id'),('shuut_moderation_cases','priority'),('shuut_moderation_cases','status'),('shuut_moderation_cases','due_at'),('shuut_moderation_cases','version'),('shuut_moderation_cases','created_at'),('shuut_moderation_cases','updated_at'),
    ('shuut_moderation_case_signals','id'),('shuut_moderation_case_signals','case_id'),('shuut_moderation_case_signals','signal_type'),('shuut_moderation_case_signals','created_at'),
    ('shuut_moderation_actions','id'),('shuut_moderation_actions','case_id'),('shuut_moderation_actions','action'),('shuut_moderation_actions','created_at'),
    ('shuut_account_sanctions','id'),('shuut_account_sanctions','type'),('shuut_account_sanctions','status'),('shuut_account_sanctions','created_at'),
    ('shuut_moderation_appeals','id'),('shuut_moderation_appeals','case_id'),('shuut_moderation_appeals','statement'),('shuut_moderation_appeals','status'),('shuut_moderation_appeals','created_at')
    ,('shuut_posts','moderation_status'),('shuut_posts','moderation_revision'),('shuut_posts','moderation_categories')
    ,('shuut_comments','moderation_status'),('shuut_comments','moderation_revision'),('shuut_comments','moderation_categories')
  ) AS expected(table_name,column_name) LOOP
    SELECT * INTO col FROM information_schema.columns c WHERE c.table_name=item.table_name AND c.column_name=item.column_name;
    IF NOT FOUND OR col.is_nullable <> 'NO' THEN RAISE EXCEPTION 'Missing or nullable required column %.%', item.table_name, item.column_name; END IF;
  END LOOP;
  FOR def IN SELECT * FROM (VALUES
    ('shuut_moderation_subjects','status','pending'),('shuut_moderation_subjects','category_codes','[]'),('shuut_moderation_subjects','created_at','now'),('shuut_moderation_subjects','updated_at','now'),
    ('shuut_moderation_jobs','status','pending'),('shuut_moderation_jobs','attempts','0'),('shuut_moderation_jobs','next_attempt_at','now'),('shuut_moderation_jobs','created_at','now'),('shuut_moderation_jobs','updated_at','now'),
    ('shuut_operator_grants','role','reviewer'),('shuut_operator_grants','active','true'),('shuut_operator_grants','created_at','now'),
    ('shuut_moderation_cases','priority','normal'),('shuut_moderation_cases','status','open'),('shuut_moderation_cases','version','1'),('shuut_moderation_cases','created_at','now'),('shuut_moderation_cases','updated_at','now'),
    ('shuut_moderation_case_signals','created_at','now'),('shuut_moderation_actions','created_at','now'),
    ('shuut_account_sanctions','status','active'),('shuut_account_sanctions','created_at','now'),
    ('shuut_moderation_appeals','status','open'),('shuut_moderation_appeals','created_at','now')
  ) AS defaults(table_name,column_name,needle) LOOP
    SELECT c.column_default INTO col.column_default FROM information_schema.columns c WHERE c.table_name=def.table_name AND c.column_name=def.column_name;
    IF col.column_default IS NULL OR lower(col.column_default) NOT LIKE '%' || lower(def.needle) || '%' THEN RAISE EXCEPTION 'Default invalid %.%', def.table_name, def.column_name; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_posts' AND column_name='moderation_revision' AND is_nullable='NO' AND column_default LIKE '%1%') THEN RAISE EXCEPTION 'post revision invalid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_posts' AND column_name='moderation_categories' AND is_nullable='NO' AND column_default LIKE '%[]%') THEN RAISE EXCEPTION 'post categories invalid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_comments' AND column_name='moderation_revision' AND is_nullable='NO' AND column_default LIKE '%1%') THEN RAISE EXCEPTION 'comment revision invalid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shuut_comments' AND column_name='moderation_categories' AND is_nullable='NO' AND column_default LIKE '%[]%') THEN RAISE EXCEPTION 'comment categories invalid'; END IF;
  IF to_regclass('shuut_moderation_subject_target_revision_idx') IS NULL OR to_regclass('shuut_moderation_subject_status_idx') IS NULL OR to_regclass('shuut_moderation_job_target_revision_idx') IS NULL OR to_regclass('shuut_moderation_job_due_idx') IS NULL OR to_regclass('shuut_moderation_case_target_idx') IS NULL OR to_regclass('shuut_moderation_case_queue_idx') IS NULL OR to_regclass('shuut_moderation_case_assignment_idx') IS NULL OR to_regclass('shuut_moderation_case_signal_case_idx') IS NULL OR to_regclass('shuut_moderation_action_case_idx') IS NULL OR to_regclass('shuut_account_sanction_user_idx') IS NULL OR to_regclass('shuut_moderation_appeal_one_per_user_case_idx') IS NULL OR to_regclass('shuut_moderation_appeal_status_idx') IS NULL OR to_regclass('shuut_moderation_appeal_case_idx') IS NULL THEN RAISE EXCEPTION 'critical moderation index missing'; END IF;
END $$;
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE (table_name, column_name) IN (
  ('shuut_moderation_jobs','lease_token'),
  ('shuut_moderation_cases','appeal_deadline_at'),
  ('shuut_moderation_cases','source_cleanup_queued_at'),
  ('shuut_posts','moderation_status'),
  ('shuut_comments','moderation_status')
)
ORDER BY table_name, column_name;
-- Rollback safety: do not drop moderation tables in production; restore from backup
-- or explicitly remove only newly added columns after all queued jobs complete.
-- Checked, idempotent Task #61 moderation baseline.
-- Apply with psql in a transaction (dev environments may continue using drizzle push).
BEGIN;

CREATE TABLE IF NOT EXISTS shuut_moderation_subjects (
  id serial PRIMARY KEY, target_type text NOT NULL, target_id integer NOT NULL,
  revision integer NOT NULL, content_hash text NOT NULL, status text NOT NULL DEFAULT 'pending',
  category_codes text NOT NULL DEFAULT '[]', risk_score integer, provider text,
  policy_version text, error_code text, moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, revision)
);
CREATE TABLE IF NOT EXISTS shuut_moderation_jobs (
  id serial PRIMARY KEY, target_type text NOT NULL, target_id integer NOT NULL,
  revision integer NOT NULL, content_hash text NOT NULL, status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz, lease_token text, last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, revision)
);
CREATE TABLE IF NOT EXISTS shuut_moderation_cases (
  id serial PRIMARY KEY, target_type text NOT NULL, target_id integer NOT NULL,
  priority text NOT NULL DEFAULT 'normal', status text NOT NULL DEFAULT 'open',
  due_at timestamptz NOT NULL, assigned_operator_id text, version integer NOT NULL DEFAULT 1,
  resolution text, resolved_at timestamptz, appeal_deadline_at timestamptz,
  source_cleanup_queued_at timestamptz, source_cleanup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id)
);
CREATE TABLE IF NOT EXISTS shuut_moderation_case_signals (
  id serial PRIMARY KEY, case_id integer NOT NULL, signal_type text NOT NULL,
  report_id integer, subject_id integer, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shuut_moderation_actions (
  id serial PRIMARY KEY, case_id integer NOT NULL, actor_user_id text,
  action text NOT NULL, reason text, before_state text, after_state text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shuut_account_sanctions (
  id serial PRIMARY KEY, user_id text, case_id integer, type text NOT NULL,
  status text NOT NULL DEFAULT 'active', reason text, expires_at timestamptz,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shuut_moderation_appeals (
  id serial PRIMARY KEY, case_id integer NOT NULL, appellant_user_id text,
  statement text NOT NULL, status text NOT NULL DEFAULT 'open', decision text,
  decided_by text, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, appellant_user_id)
);
CREATE TABLE IF NOT EXISTS shuut_operator_grants (
  user_id text PRIMARY KEY, role text NOT NULL DEFAULT 'reviewer',
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

-- Repair partially-created tables as well as creating missing tables.
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS target_id integer;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS revision integer;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS category_codes text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS risk_score integer;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS policy_version text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_moderation_subjects ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS target_id integer;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS revision integer;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS attempts integer;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS lease_token text;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS active boolean;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS target_id integer;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS assigned_operator_id text;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS version integer;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS appeal_deadline_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS source_cleanup_queued_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS source_cleanup_completed_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE shuut_moderation_case_signals ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_moderation_case_signals ADD COLUMN IF NOT EXISTS case_id integer;
ALTER TABLE shuut_moderation_case_signals ADD COLUMN IF NOT EXISTS signal_type text;
ALTER TABLE shuut_moderation_case_signals ADD COLUMN IF NOT EXISTS report_id integer;
ALTER TABLE shuut_moderation_case_signals ADD COLUMN IF NOT EXISTS subject_id integer;
ALTER TABLE shuut_moderation_case_signals ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS case_id integer;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS actor_user_id text;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS before_state text;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS after_state text;
ALTER TABLE shuut_moderation_actions ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS case_id integer;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE shuut_account_sanctions ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS case_id integer;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS appellant_user_id text;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS statement text;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS decision text;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS decided_by text;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE shuut_moderation_appeals ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS active boolean;
ALTER TABLE shuut_operator_grants ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE shuut_posts ADD COLUMN IF NOT EXISTS moderation_status text;
ALTER TABLE shuut_posts ADD COLUMN IF NOT EXISTS moderation_revision integer;
ALTER TABLE shuut_posts ADD COLUMN IF NOT EXISTS moderation_risk_score integer;
ALTER TABLE shuut_posts ADD COLUMN IF NOT EXISTS moderation_categories text;
ALTER TABLE shuut_posts ADD COLUMN IF NOT EXISTS moderation_error_code text;
ALTER TABLE shuut_comments ADD COLUMN IF NOT EXISTS moderation_status text;
ALTER TABLE shuut_comments ADD COLUMN IF NOT EXISTS moderation_revision integer;
ALTER TABLE shuut_comments ADD COLUMN IF NOT EXISTS moderation_risk_score integer;
ALTER TABLE shuut_comments ADD COLUMN IF NOT EXISTS moderation_categories text;
ALTER TABLE shuut_comments ADD COLUMN IF NOT EXISTS moderation_error_code text;
ALTER TABLE shuut_account_reports ADD COLUMN IF NOT EXISTS moderation_case_id integer;
ALTER TABLE shuut_account_reports ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE shuut_moderation_jobs ADD COLUMN IF NOT EXISTS lease_token text;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS appeal_deadline_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS source_cleanup_queued_at timestamptz;
ALTER TABLE shuut_moderation_cases ADD COLUMN IF NOT EXISTS source_cleanup_completed_at timestamptz;
UPDATE shuut_posts SET moderation_revision = 1 WHERE moderation_revision IS NULL;
UPDATE shuut_posts SET moderation_categories = '[]' WHERE moderation_categories IS NULL;
UPDATE shuut_comments SET moderation_revision = 1 WHERE moderation_revision IS NULL;
UPDATE shuut_comments SET moderation_categories = '[]' WHERE moderation_categories IS NULL;
UPDATE shuut_posts SET moderation_status = 'approved' WHERE moderation_status IS NULL;
UPDATE shuut_comments SET moderation_status = 'approved' WHERE moderation_status IS NULL;
-- Repair-only sentinels for unexpectedly partial legacy tables; normal installs already contain these values.
UPDATE shuut_operator_grants SET role = 'reviewer' WHERE role IS NULL;
UPDATE shuut_operator_grants SET active = true WHERE active IS NULL;
UPDATE shuut_operator_grants SET created_at = now() WHERE created_at IS NULL;
UPDATE shuut_moderation_subjects SET status = 'pending' WHERE status IS NULL;
UPDATE shuut_moderation_subjects SET category_codes = '[]' WHERE category_codes IS NULL;
UPDATE shuut_moderation_subjects SET created_at = now() WHERE created_at IS NULL;
UPDATE shuut_moderation_subjects SET updated_at = now() WHERE updated_at IS NULL;
UPDATE shuut_moderation_jobs SET status = 'pending' WHERE status IS NULL;
UPDATE shuut_moderation_jobs SET attempts = 0 WHERE attempts IS NULL;
UPDATE shuut_moderation_jobs SET next_attempt_at = now() WHERE next_attempt_at IS NULL;
UPDATE shuut_moderation_jobs SET created_at = now() WHERE created_at IS NULL;
UPDATE shuut_moderation_jobs SET updated_at = now() WHERE updated_at IS NULL;
-- Repair-only cleanup of rows that cannot be made referentially valid.
DELETE FROM shuut_operator_grants WHERE user_id IS NULL;
UPDATE shuut_moderation_subjects SET target_type = 'post', target_id = id, revision = 1,
  content_hash = 'legacy-' || id::text WHERE target_type IS NULL OR target_id IS NULL OR revision IS NULL OR content_hash IS NULL;
UPDATE shuut_moderation_cases SET target_type = 'profile', target_id = id, priority = 'normal',
  status = 'open', due_at = now(), version = 1 WHERE target_type IS NULL OR target_id IS NULL OR priority IS NULL OR status IS NULL OR due_at IS NULL OR version IS NULL;
UPDATE shuut_moderation_cases SET created_at = now() WHERE created_at IS NULL;
UPDATE shuut_moderation_cases SET updated_at = now() WHERE updated_at IS NULL;
UPDATE shuut_moderation_jobs SET target_type = 'post', target_id = id, revision = 1,
  content_hash = 'legacy-' || id::text WHERE target_type IS NULL OR target_id IS NULL OR revision IS NULL OR content_hash IS NULL;
UPDATE shuut_moderation_case_signals SET case_id = (SELECT id FROM shuut_moderation_cases ORDER BY id LIMIT 1), signal_type = 'legacy', created_at = now()
 WHERE case_id IS NULL OR signal_type IS NULL OR created_at IS NULL;
UPDATE shuut_moderation_actions SET case_id = (SELECT id FROM shuut_moderation_cases ORDER BY id LIMIT 1), action = 'legacy', created_at = now()
 WHERE case_id IS NULL OR action IS NULL OR created_at IS NULL;
UPDATE shuut_account_sanctions SET type = 'suspend', status = 'active', created_at = now()
 WHERE type IS NULL OR status IS NULL OR created_at IS NULL;
UPDATE shuut_moderation_appeals SET case_id = (SELECT id FROM shuut_moderation_cases ORDER BY id LIMIT 1), statement = 'Legacy appeal', status = 'open', created_at = now()
 WHERE case_id IS NULL OR statement IS NULL OR status IS NULL OR created_at IS NULL;
-- Repair-only orphan removal: rows with no possible case cannot satisfy required case_id constraints.
DELETE FROM shuut_moderation_case_signals WHERE case_id IS NULL;
DELETE FROM shuut_moderation_actions WHERE case_id IS NULL;
DELETE FROM shuut_moderation_appeals WHERE case_id IS NULL;
ALTER TABLE shuut_moderation_subjects ALTER COLUMN target_type SET DEFAULT 'post', ALTER COLUMN target_id SET NOT NULL, ALTER COLUMN revision SET DEFAULT 1, ALTER COLUMN revision SET NOT NULL, ALTER COLUMN content_hash SET NOT NULL, ALTER COLUMN status SET DEFAULT 'pending', ALTER COLUMN status SET NOT NULL, ALTER COLUMN category_codes SET DEFAULT '[]', ALTER COLUMN category_codes SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE shuut_moderation_jobs ALTER COLUMN target_type SET DEFAULT 'post', ALTER COLUMN target_id SET NOT NULL, ALTER COLUMN revision SET DEFAULT 1, ALTER COLUMN revision SET NOT NULL, ALTER COLUMN content_hash SET NOT NULL, ALTER COLUMN status SET DEFAULT 'pending', ALTER COLUMN status SET NOT NULL, ALTER COLUMN attempts SET DEFAULT 0, ALTER COLUMN attempts SET NOT NULL, ALTER COLUMN next_attempt_at SET DEFAULT now(), ALTER COLUMN next_attempt_at SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE shuut_operator_grants ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN role SET DEFAULT 'reviewer', ALTER COLUMN role SET NOT NULL, ALTER COLUMN active SET DEFAULT true, ALTER COLUMN active SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE shuut_moderation_cases ALTER COLUMN target_type SET DEFAULT 'profile', ALTER COLUMN target_type SET NOT NULL, ALTER COLUMN target_id SET NOT NULL, ALTER COLUMN priority SET DEFAULT 'normal', ALTER COLUMN priority SET NOT NULL, ALTER COLUMN status SET DEFAULT 'open', ALTER COLUMN status SET NOT NULL, ALTER COLUMN due_at SET NOT NULL, ALTER COLUMN version SET DEFAULT 1, ALTER COLUMN version SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE shuut_moderation_case_signals ALTER COLUMN case_id SET NOT NULL, ALTER COLUMN signal_type SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE shuut_moderation_actions ALTER COLUMN case_id SET NOT NULL, ALTER COLUMN action SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE shuut_account_sanctions ALTER COLUMN type SET NOT NULL, ALTER COLUMN status SET DEFAULT 'active', ALTER COLUMN status SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE shuut_moderation_appeals ALTER COLUMN case_id SET NOT NULL, ALTER COLUMN statement SET NOT NULL, ALTER COLUMN status SET DEFAULT 'open', ALTER COLUMN status SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE shuut_moderation_subjects ALTER COLUMN target_type SET NOT NULL;
ALTER TABLE shuut_moderation_jobs ALTER COLUMN target_type SET NOT NULL;
ALTER TABLE shuut_posts ALTER COLUMN moderation_revision SET DEFAULT 1;
ALTER TABLE shuut_posts ALTER COLUMN moderation_revision SET NOT NULL;
ALTER TABLE shuut_posts ALTER COLUMN moderation_categories SET DEFAULT '[]';
ALTER TABLE shuut_posts ALTER COLUMN moderation_categories SET NOT NULL;
ALTER TABLE shuut_comments ALTER COLUMN moderation_revision SET DEFAULT 1;
ALTER TABLE shuut_comments ALTER COLUMN moderation_revision SET NOT NULL;
ALTER TABLE shuut_comments ALTER COLUMN moderation_categories SET DEFAULT '[]';
ALTER TABLE shuut_comments ALTER COLUMN moderation_categories SET NOT NULL;
ALTER TABLE shuut_posts ALTER COLUMN moderation_status SET DEFAULT 'pending';
ALTER TABLE shuut_posts ALTER COLUMN moderation_status SET NOT NULL;
ALTER TABLE shuut_comments ALTER COLUMN moderation_status SET DEFAULT 'pending';
ALTER TABLE shuut_comments ALTER COLUMN moderation_status SET NOT NULL;
ALTER TABLE shuut_posts ALTER COLUMN moderation_status SET DEFAULT 'pending';
ALTER TABLE shuut_comments ALTER COLUMN moderation_status SET DEFAULT 'pending';
-- Legacy active, transcript-ready content remains distributable before the new default applies.
UPDATE shuut_posts SET moderation_status = 'approved'
 WHERE moderation_status IS NULL AND deletion_status = 'active' AND transcription_status = 'ready';
UPDATE shuut_comments SET moderation_status = 'approved'
 WHERE moderation_status IS NULL AND transcription_status = 'ready';
CREATE INDEX IF NOT EXISTS shuut_moderation_job_due_idx ON shuut_moderation_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS shuut_moderation_case_queue_idx ON shuut_moderation_cases(status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS shuut_moderation_subject_target_revision_idx ON shuut_moderation_subjects(target_type, target_id, revision);
CREATE INDEX IF NOT EXISTS shuut_moderation_subject_status_idx ON shuut_moderation_subjects(status);
CREATE UNIQUE INDEX IF NOT EXISTS shuut_moderation_job_target_revision_idx ON shuut_moderation_jobs(target_type, target_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS shuut_moderation_case_target_idx ON shuut_moderation_cases(target_type, target_id);
CREATE INDEX IF NOT EXISTS shuut_moderation_case_assignment_idx ON shuut_moderation_cases(assigned_operator_id, status);
CREATE INDEX IF NOT EXISTS shuut_moderation_case_signal_case_idx ON shuut_moderation_case_signals(case_id);
CREATE INDEX IF NOT EXISTS shuut_moderation_action_case_idx ON shuut_moderation_actions(case_id);
CREATE INDEX IF NOT EXISTS shuut_account_sanction_user_idx ON shuut_account_sanctions(user_id, status);
CREATE INDEX IF NOT EXISTS shuut_moderation_appeal_status_idx ON shuut_moderation_appeals(status);
CREATE INDEX IF NOT EXISTS shuut_moderation_appeal_case_idx ON shuut_moderation_appeals(case_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS shuut_moderation_appeal_one_per_user_case_idx ON shuut_moderation_appeals(case_id, appellant_user_id);
COMMIT;

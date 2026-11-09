-- Registro do que a IA fez (no chat ou sozinha), e-mails redigidos por ela.
CREATE TABLE IF NOT EXISTS ai_activity (
  id TEXT NOT NULL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('chat', 'auto')),
  kind TEXT NOT NULL CHECK (kind IN ('action', 'report', 'tip', 'alert', 'error')),
  title TEXT NOT NULL,
  body TEXT,
  details_json TEXT,
  requested_by TEXT,
  client_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_ai_activity_created ON ai_activity(created_at);

CREATE TABLE IF NOT EXISTS ai_emails (
  id TEXT NOT NULL PRIMARY KEY,
  client_id TEXT,
  to_name TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'discarded', 'failed')),
  source TEXT NOT NULL CHECK (source IN ('chat', 'auto')),
  requested_by TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_ai_emails_status ON ai_emails(status, created_at);

CREATE TABLE IF NOT EXISTS ai_task_runs (
  task TEXT NOT NULL PRIMARY KEY,
  last_run_at TEXT NOT NULL
);

-- Notas da IA nas cotações (triagem automática).
ALTER TABLE quote_requests ADD COLUMN ai_notes TEXT;
ALTER TABLE quote_requests ADD COLUMN matched_client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;

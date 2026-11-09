-- Schema SQLite: horários em UTC (CURRENT_TIMESTAMP) e chaves estrangeiras ativas.
CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sessions_user_expiry ON sessions(user_id, expires_at);
CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT NOT NULL PRIMARY KEY,
  contact_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  origin_country TEXT NOT NULL,
  product_summary TEXT NOT NULL,
  estimated_volume TEXT,
  destination TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'contacted', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_quotes_status_created ON quote_requests(status, created_at);
CREATE INDEX IF NOT EXISTS ix_quotes_company ON quote_requests(company_name);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT NOT NULL PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_events(created_at);
CREATE TRIGGER IF NOT EXISTS users_touch_updated_at
AFTER UPDATE OF email, full_name, password_hash, role, is_active ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS quote_requests_touch_updated_at
AFTER UPDATE OF status, contact_name, company_name, email, phone, origin_country,
                product_summary, estimated_volume, destination, details ON quote_requests
BEGIN
  UPDATE quote_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

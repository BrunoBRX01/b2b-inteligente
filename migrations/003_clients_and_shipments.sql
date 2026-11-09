-- Carteira de clientes, contatos e embarques (pedidos de importação).
CREATE TABLE IF NOT EXISTS clients (
  id TEXT NOT NULL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  state_registration TEXT,
  segment TEXT NOT NULL,
  company_size TEXT NOT NULL CHECK (company_size IN ('micro', 'pequena', 'media', 'grande')),
  employees INTEGER,
  annual_revenue_brl REAL,
  credit_limit_brl REAL,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  street TEXT,
  number TEXT,
  district TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  account_manager_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('prospect', 'active', 'inactive', 'blocked')),
  rating TEXT CHECK (rating IN ('A', 'B', 'C', 'D')),
  nps_score INTEGER CHECK (nps_score BETWEEN 0 AND 10),
  lead_source TEXT,
  notes TEXT,
  client_since TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_manager_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS ix_clients_trade_name ON clients(trade_name);
CREATE INDEX IF NOT EXISTS ix_clients_state ON clients(state);

CREATE TABLE IF NOT EXISTS client_contacts (
  id TEXT NOT NULL PRIMARY KEY,
  client_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  birthday TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_contacts_client ON client_contacts(client_id);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT NOT NULL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  origin_country TEXT NOT NULL,
  origin_port TEXT NOT NULL,
  destination_port TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('maritimo', 'aereo', 'rodoviario')),
  incoterm TEXT NOT NULL,
  product_description TEXT NOT NULL,
  ncm TEXT,
  weight_kg REAL,
  volume_m3 REAL,
  containers INTEGER,
  goods_value_usd REAL NOT NULL,
  freight_brl REAL NOT NULL,
  service_fee_brl REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_transit', 'customs', 'delivered', 'delayed', 'cancelled')),
  ordered_at TEXT NOT NULL,
  eta TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_shipments_client ON shipments(client_id);
CREATE INDEX IF NOT EXISTS ix_shipments_ordered ON shipments(ordered_at);
CREATE INDEX IF NOT EXISTS ix_shipments_status ON shipments(status);

CREATE TABLE IF NOT EXISTS client_interactions (
  id TEXT NOT NULL PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('ligacao', 'email', 'reuniao', 'visita', 'whatsapp')),
  summary TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_interactions_client ON client_interactions(client_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS clients_touch_updated_at
AFTER UPDATE OF legal_name, trade_name, status, rating, credit_limit_brl, account_manager_id, notes ON clients
BEGIN
  UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

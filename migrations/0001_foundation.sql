PRAGMA foreign_keys = ON;

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  employee_code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('staff', 'manager', 'owner')),
  pin_salt TEXT,
  pin_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX staff_branch_active_idx ON staff(branch_id, active, name);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_token_idx ON sessions(token_hash);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE auth_attempts (
  staff_id TEXT PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  customer_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  alternate_phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX customers_name_idx ON customers(name);
CREATE INDEX customers_phone_idx ON customers(phone);

CREATE TABLE machine_makes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE machine_models (
  id TEXT PRIMARY KEY,
  make_id TEXT NOT NULL REFERENCES machine_makes(id),
  model_name TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  specifications_json TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE(make_id, model_name)
);

CREATE TABLE catalog_items (
  id TEXT PRIMARY KEY,
  part_number TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('machine', 'accessory', 'part', 'service')),
  hsn_sac TEXT NOT NULL,
  gst_rate REAL NOT NULL CHECK (gst_rate >= 0),
  retail_price REAL,
  mrp REAL,
  details_json TEXT,
  data_source TEXT NOT NULL DEFAULT 'manual' CHECK (data_source IN ('manual', 'imported', 'ai_suggested')),
  review_required INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX catalog_name_idx ON catalog_items(item_name);
CREATE INDEX catalog_type_idx ON catalog_items(item_type, active);
CREATE INDEX catalog_review_idx ON catalog_items(review_required, active);

CREATE TABLE service_job_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  standard_minutes INTEGER,
  default_price REAL,
  hsn_sac TEXT NOT NULL,
  gst_rate REAL NOT NULL CHECK (gst_rate >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE repair_jobs (
  id TEXT PRIMARY KEY,
  work_order TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  machine_model_id TEXT REFERENCES machine_models(id),
  serial_number TEXT,
  reported_problem TEXT NOT NULL,
  opened_by TEXT NOT NULL REFERENCES staff(id),
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX repair_jobs_branch_idx ON repair_jobs(branch_id, opened_at);
CREATE INDEX repair_jobs_customer_idx ON repair_jobs(customer_id, opened_at);

CREATE TABLE job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  server_received_at TEXT NOT NULL
);
CREATE INDEX job_events_timeline_idx ON job_events(job_id, created_at, id);

PRAGMA foreign_keys = ON;

CREATE TABLE customer_machines (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  machine_model_id TEXT REFERENCES machine_models(id),
  display_name TEXT NOT NULL,
  serial_number TEXT,
  notes TEXT,
  provisional INTEGER NOT NULL DEFAULT 0 CHECK (provisional IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX customer_machines_customer_idx
  ON customer_machines(customer_id, active, last_seen_at);
CREATE INDEX customer_machines_serial_idx
  ON customer_machines(serial_number);
CREATE UNIQUE INDEX customer_machines_customer_serial_unique
  ON customer_machines(customer_id, serial_number)
  WHERE serial_number IS NOT NULL AND serial_number <> '';

ALTER TABLE repair_jobs
  ADD COLUMN customer_machine_id TEXT REFERENCES customer_machines(id);
CREATE INDEX repair_jobs_customer_machine_idx
  ON repair_jobs(customer_machine_id, opened_at);

CREATE TABLE job_service_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES repair_jobs(id) ON DELETE CASCADE,
  record_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),
  technician_id TEXT NOT NULL REFERENCES staff(id),
  diagnosis TEXT,
  work_performed TEXT,
  notes TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id),
  updated_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX job_service_records_status_idx
  ON job_service_records(status, updated_at);

CREATE TABLE job_service_items (
  id TEXT PRIMARY KEY,
  service_record_id TEXT NOT NULL REFERENCES job_service_records(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('part', 'service', 'other')),
  part_number TEXT,
  description TEXT NOT NULL,
  hsn_sac TEXT NOT NULL,
  gst_rate REAL NOT NULL CHECK (gst_rate >= 0),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  taxable_amount REAL NOT NULL CHECK (taxable_amount >= 0),
  tax_amount REAL NOT NULL CHECK (tax_amount >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  source TEXT,
  UNIQUE(service_record_id, line_number)
);
CREATE INDEX job_service_items_record_idx
  ON job_service_items(service_record_id, line_number);

CREATE TABLE job_billing_materials (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES repair_jobs(id) ON DELETE CASCADE,
  service_record_id TEXT NOT NULL REFERENCES job_service_records(id),
  billing_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'exported', 'invoiced', 'cancelled')),
  customer_snapshot_json TEXT NOT NULL,
  machine_snapshot_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax_total REAL NOT NULL,
  grand_total REAL NOT NULL,
  generated_by TEXT NOT NULL REFERENCES staff(id),
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX job_billing_materials_status_idx
  ON job_billing_materials(status, generated_at);

CREATE TABLE job_billing_items (
  id TEXT PRIMARY KEY,
  billing_material_id TEXT NOT NULL REFERENCES job_billing_materials(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('part', 'service', 'other')),
  part_number TEXT,
  description TEXT NOT NULL,
  hsn_sac TEXT NOT NULL,
  gst_rate REAL NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  taxable_amount REAL NOT NULL,
  tax_amount REAL NOT NULL,
  line_total REAL NOT NULL,
  UNIQUE(billing_material_id, line_number)
);
CREATE INDEX job_billing_items_material_idx
  ON job_billing_items(billing_material_id, line_number);

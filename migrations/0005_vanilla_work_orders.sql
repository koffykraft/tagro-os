ALTER TABLE customers
  ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'customer'
  CHECK (record_kind IN ('customer', 'system_pending'));

CREATE UNIQUE INDEX customers_pending_branch_unique
  ON customers(created_branch_id, record_kind)
  WHERE record_kind = 'system_pending';

CREATE TABLE work_order_details (
  job_id TEXT PRIMARY KEY REFERENCES repair_jobs(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_place TEXT,
  machine_description TEXT,
  machine_model_id TEXT REFERENCES machine_models(id),
  serial_number TEXT,
  accessories_json TEXT NOT NULL DEFAULT '[]',
  complaint TEXT,
  observation TEXT,
  work_done TEXT,
  assigned_to TEXT REFERENCES staff(id),
  billing_subtotal REAL,
  billing_tax REAL,
  billing_total REAL,
  billing_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES staff(id)
);

CREATE INDEX work_order_details_assigned_idx
  ON work_order_details(assigned_to, updated_at);

CREATE TABLE work_order_parts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  part_number TEXT,
  item_name TEXT,
  quantity REAL,
  unit_price REAL,
  hsn_sac TEXT,
  gst_rate REAL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL
);

CREATE INDEX work_order_parts_job_idx
  ON work_order_parts(job_id, line_number);

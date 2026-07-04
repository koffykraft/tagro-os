PRAGMA foreign_keys = ON;

CREATE TABLE job_estimates (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES repair_jobs(id) ON DELETE CASCADE,
  estimate_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'approved', 'rejected')),
  notes TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES staff(id),
  updated_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX job_estimates_status_idx ON job_estimates(status, updated_at);

CREATE TABLE job_estimate_items (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL REFERENCES job_estimates(id) ON DELETE CASCADE,
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
  UNIQUE(estimate_id, line_number)
);
CREATE INDEX job_estimate_items_estimate_idx
  ON job_estimate_items(estimate_id, line_number);

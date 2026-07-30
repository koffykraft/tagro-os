-- Mobile invoices are operational drafts awaiting the controlled Busy bridge.
CREATE TABLE IF NOT EXISTS mobile_invoices (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  bill_no TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  series TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT 'Cash',
  customer_name TEXT,
  customer_phone TEXT,
  customer_place TEXT,
  machine_model TEXT,
  serial_number TEXT,
  narration TEXT,
  other_amount REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL,
  gst_amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_busy_sync'
    CHECK(status IN ('pending_busy_sync','exported','written_to_busy','cancelled')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  exported_at TEXT,
  UNIQUE(branch_id, bill_no)
);

CREATE TABLE IF NOT EXISTS mobile_invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES mobile_invoices(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  item_code TEXT,
  item_name TEXT NOT NULL,
  item_group TEXT,
  quantity REAL NOT NULL,
  unit_name TEXT NOT NULL,
  unit_rate REAL NOT NULL,
  gst_rate REAL NOT NULL,
  taxable_amount REAL NOT NULL,
  gst_amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  UNIQUE(invoice_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_mobile_invoices_branch_date
ON mobile_invoices(branch_id, invoice_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_invoice_lines_invoice
ON mobile_invoice_lines(invoice_id, line_no);

-- Baseline/reconciliation migration for the mobile counter-sales + BUSY write-back
-- schema. These four tables (mobile_sales_invoices, mobile_sales_invoice_lines,
-- busy_write_queue, busy_write_receipts) and their indexes already exist in
-- production -- they were created directly against D1 at some point before this
-- migration was written, not through the migrations pipeline, so a fresh/staging
-- database built from `migrations/` alone was missing them entirely.
--
-- Uses IF NOT EXISTS throughout so this migration is a safe no-op against
-- production (where everything below already exists) while still giving any
-- fresh database the real, current schema. Column definitions here were read
-- directly from production's sqlite_master, not re-derived from memory.
CREATE TABLE IF NOT EXISTS mobile_sales_invoices (
  id TEXT PRIMARY KEY,
  client_request_id TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  created_by TEXT NOT NULL REFERENCES staff(id),
  business_date TEXT NOT NULL,
  party_name TEXT NOT NULL,
  party_phone TEXT,
  party_gstin TEXT,
  narration TEXT,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash','upi','card','bank','credit','mixed')),
  taxable_total REAL NOT NULL,
  cgst_total REAL NOT NULL,
  sgst_total REAL NOT NULL,
  igst_total REAL NOT NULL,
  round_off REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','processing','written','failed','cancelled')) DEFAULT 'queued',
  busy_company_code TEXT,
  busy_voucher_number TEXT,
  busy_database_fingerprint TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  busy_series TEXT NOT NULL DEFAULT 'CLOUD'
);
CREATE INDEX IF NOT EXISTS mobile_sales_invoices_branch_date_idx
  ON mobile_sales_invoices(branch_id, business_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS mobile_sales_invoices_status_idx
  ON mobile_sales_invoices(status, created_at);
CREATE INDEX IF NOT EXISTS mobile_sales_invoices_series_idx
  ON mobile_sales_invoices(branch_id, busy_series, business_date DESC);

CREATE TABLE IF NOT EXISTS mobile_sales_invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES mobile_sales_invoices(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  part_number TEXT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_rate_before_tax REAL NOT NULL CHECK (unit_rate_before_tax >= 0),
  discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  taxable_amount REAL NOT NULL CHECK (taxable_amount >= 0),
  gst_rate REAL NOT NULL CHECK (gst_rate >= 0),
  cgst_amount REAL NOT NULL DEFAULT 0,
  sgst_amount REAL NOT NULL DEFAULT 0,
  igst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_pack_quantity REAL,
  source_pack_unit TEXT,
  source_pack_price REAL,
  conversion_basis TEXT,
  UNIQUE(invoice_id, line_number)
);

CREATE TABLE IF NOT EXISTS busy_write_queue (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL UNIQUE REFERENCES mobile_sales_invoices(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','leased','completed','failed','held')) DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS busy_write_queue_status_idx
  ON busy_write_queue(status, created_at);

CREATE TABLE IF NOT EXISTS busy_write_receipts (
  id TEXT PRIMARY KEY,
  queue_id TEXT NOT NULL REFERENCES busy_write_queue(id),
  invoice_id TEXT NOT NULL REFERENCES mobile_sales_invoices(id),
  connector_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('copy','live')),
  database_path_hash TEXT NOT NULL,
  busy_voucher_number TEXT,
  verification_json TEXT NOT NULL,
  backup_reference TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS busy_write_receipts_invoice_idx
  ON busy_write_receipts(invoice_id, created_at DESC);

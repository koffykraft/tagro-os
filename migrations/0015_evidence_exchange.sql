-- Reconciliation migration for the evidence-exchange / import pipeline schema.
-- These four tables (import_sources, evidence_records, entity_links, breaker_flags)
-- already exist in production -- applied directly against D1 at some point
-- (recorded there as "0012_evidence_exchange.sql") without ever being committed
-- to this repo, so a fresh/staging database built from `migrations/` alone was
-- missing them entirely.
--
-- Uses IF NOT EXISTS throughout so this migration is a safe no-op against
-- production (where everything below already exists) while giving any fresh
-- database the real, current schema. Definitions read directly from
-- production's sqlite_master on 2026-09-04, not re-derived from memory.

CREATE TABLE IF NOT EXISTS import_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'busy_sales_invoice',
    'busy_purchase_invoice',
    'service_sheet_row',
    'repair_tracker_row',
    'customer_import_row',
    'machine_import_row',
    'parts_catalog_row',
    'whatsapp_message',
    'manual_admin_correction',
    'other'
  )),
  source_name TEXT NOT NULL,
  source_file TEXT,
  source_checksum TEXT,
  branch_id TEXT REFERENCES branches(id),
  period_start TEXT,
  period_end TEXT,
  status TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'processing', 'ready', 'imported', 'blocked', 'archived')),
  notes TEXT,
  created_by TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS import_sources_type_idx
  ON import_sources(source_type, status, created_at);
CREATE INDEX IF NOT EXISTS import_sources_branch_idx
  ON import_sources(branch_id, created_at);

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  import_source_id TEXT REFERENCES import_sources(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'busy_sales_invoice',
    'busy_purchase_invoice',
    'service_sheet_row',
    'repair_tracker_row',
    'customer_import_row',
    'machine_import_row',
    'parts_catalog_row',
    'whatsapp_message',
    'manual_admin_correction',
    'other'
  )),
  source_file TEXT,
  source_sheet TEXT,
  source_row TEXT,
  source_ref TEXT,
  branch_id TEXT REFERENCES branches(id),
  event_date TEXT,
  invoice_number TEXT,
  raw_narration TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  parsed_json TEXT NOT NULL DEFAULT '{}',
  parsed_customer_name TEXT,
  parsed_customer_phone TEXT,
  parsed_customer_place TEXT,
  machine_model TEXT,
  machine_serial TEXT,
  item_name TEXT,
  part_number TEXT,
  amount REAL,
  confidence_status TEXT NOT NULL DEFAULT 'review'
    CHECK (confidence_status IN ('confirmed', 'probable', 'possible', 'review', 'rejected')),
  confidence_score REAL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  review_reason TEXT,
  status TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'linked', 'review', 'rejected', 'ignored')),
  created_by TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_records_source_idx
  ON evidence_records(import_source_id, source_file, source_sheet, source_row);
CREATE INDEX IF NOT EXISTS evidence_records_branch_date_idx
  ON evidence_records(branch_id, event_date);
CREATE INDEX IF NOT EXISTS evidence_records_customer_phone_idx
  ON evidence_records(parsed_customer_phone);
CREATE INDEX IF NOT EXISTS evidence_records_machine_serial_idx
  ON evidence_records(machine_serial);
CREATE INDEX IF NOT EXISTS evidence_records_invoice_idx
  ON evidence_records(branch_id, invoice_number, event_date);
CREATE INDEX IF NOT EXISTS evidence_records_review_idx
  ON evidence_records(status, confidence_status, updated_at);

CREATE TABLE IF NOT EXISTS entity_links (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'customer', 'machine', 'job', 'invoice', 'item', 'part', 'branch', 'staff', 'unknown'
  )),
  entity_id TEXT,
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'mentions', 'matches', 'service_context', 'probable_owner', 'sold_to',
    'serviced_machine', 'used_part', 'generated_job', 'generated_machine',
    'generated_customer', 'corrects', 'duplicates', 'other'
  )),
  confidence_status TEXT NOT NULL DEFAULT 'review'
    CHECK (confidence_status IN ('confirmed', 'probable', 'possible', 'review', 'rejected')),
  confidence_score REAL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  rationale TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entity_links_evidence_idx
  ON entity_links(evidence_id, active);
CREATE INDEX IF NOT EXISTS entity_links_entity_idx
  ON entity_links(entity_type, entity_id, active);
CREATE INDEX IF NOT EXISTS entity_links_review_idx
  ON entity_links(confidence_status, updated_at);

CREATE TABLE IF NOT EXISTS breaker_flags (
  id TEXT PRIMARY KEY,
  import_source_id TEXT REFERENCES import_sources(id) ON DELETE SET NULL,
  evidence_id TEXT REFERENCES evidence_records(id) ON DELETE CASCADE,
  breaker_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'review'
    CHECK (severity IN ('info', 'review', 'warning', 'blocker')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_by TEXT REFERENCES staff(id),
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS breaker_flags_open_idx
  ON breaker_flags(status, severity, created_at);
CREATE INDEX IF NOT EXISTS breaker_flags_evidence_idx
  ON breaker_flags(evidence_id, status);
CREATE INDEX IF NOT EXISTS breaker_flags_source_idx
  ON breaker_flags(import_source_id, status);

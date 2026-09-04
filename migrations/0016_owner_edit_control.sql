-- Reconciliation migration for the owner edit-control / audit schema.
-- These two tables (edit_requests, record_change_audit) already exist in
-- production -- applied directly against D1 at some point (recorded there
-- as "0013_owner_edit_control.sql") without ever being committed to this
-- repo, so a fresh/staging database built from `migrations/` alone was
-- missing them entirely.
--
-- Uses IF NOT EXISTS throughout so this migration is a safe no-op against
-- production (where everything below already exists) while giving any fresh
-- database the real, current schema. Definitions read directly from
-- production's sqlite_master on 2026-09-04, not re-derived from memory.

CREATE TABLE IF NOT EXISTS edit_requests (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  branch_id TEXT REFERENCES branches(id),
  requested_by TEXT NOT NULL REFERENCES staff(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'consumed', 'expired')),
  requested_at TEXT NOT NULL,
  decided_by TEXT REFERENCES staff(id),
  decided_at TEXT,
  permission_expires_at TEXT,
  consumed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS edit_requests_record_idx
  ON edit_requests(record_type, record_id, status, requested_at);
CREATE INDEX IF NOT EXISTS edit_requests_branch_idx
  ON edit_requests(branch_id, status, requested_at);
CREATE INDEX IF NOT EXISTS edit_requests_requester_idx
  ON edit_requests(requested_by, status, requested_at);

CREATE TABLE IF NOT EXISTS record_change_audit (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  branch_id TEXT REFERENCES branches(id),
  action TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES staff(id),
  edit_request_id TEXT REFERENCES edit_requests(id),
  reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS record_change_audit_record_idx
  ON record_change_audit(record_type, record_id, changed_at);
CREATE INDEX IF NOT EXISTS record_change_audit_branch_idx
  ON record_change_audit(branch_id, changed_at);

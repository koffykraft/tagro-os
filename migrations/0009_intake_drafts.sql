CREATE TABLE intake_drafts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  created_by TEXT NOT NULL REFERENCES staff(id),
  assigned_to TEXT REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'needs_review', 'ready', 'completed', 'cancelled')),
  extraction_status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (extraction_status IN ('not_configured', 'pending', 'needs_review', 'ready', 'failed')),
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_place TEXT,
  machine_model_id TEXT REFERENCES machine_models(id),
  machine_description TEXT,
  serial_number TEXT,
  complaint TEXT,
  accessories_json TEXT NOT NULL DEFAULT '[]',
  job_id TEXT UNIQUE REFERENCES repair_jobs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX intake_drafts_branch_status_updated_idx
  ON intake_drafts(branch_id, status, updated_at DESC);

CREATE INDEX intake_drafts_created_by_updated_idx
  ON intake_drafts(created_by, updated_at DESC);

CREATE TABLE intake_photos (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES intake_drafts(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  photo_type TEXT NOT NULL DEFAULT 'other'
    CHECK (photo_type IN ('service_sheet', 'machine', 'serial_plate', 'damage', 'other')),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT NOT NULL,
  r2_etag TEXT,
  uploaded_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX intake_photos_draft_created_idx
  ON intake_photos(draft_id, created_at);

CREATE TABLE intake_draft_completions (
  draft_id TEXT PRIMARY KEY REFERENCES intake_drafts(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL UNIQUE REFERENCES repair_jobs(id) ON DELETE CASCADE,
  completed_by TEXT NOT NULL REFERENCES staff(id),
  completed_at TEXT NOT NULL
);

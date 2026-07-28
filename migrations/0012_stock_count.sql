-- Stock counts are append-only evidence. Corrections are new submissions, never silent rewrites.
CREATE TABLE IF NOT EXISTS stock_count_submissions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  entry_count INTEGER NOT NULL,
  device_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_count_entries (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES stock_count_submissions(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  part_number TEXT,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity REAL NOT NULL CHECK(quantity >= 0),
  entry_source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_count_submissions_branch_date
ON stock_count_submissions(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_count_entries_submission
ON stock_count_entries(submission_id);

CREATE TRIGGER IF NOT EXISTS stock_count_submissions_no_update
BEFORE UPDATE ON stock_count_submissions BEGIN SELECT RAISE(ABORT, 'stock count submissions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS stock_count_submissions_no_delete
BEFORE DELETE ON stock_count_submissions BEGIN SELECT RAISE(ABORT, 'stock count submissions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS stock_count_entries_no_update
BEFORE UPDATE ON stock_count_entries BEGIN SELECT RAISE(ABORT, 'stock count entries are append-only'); END;
CREATE TRIGGER IF NOT EXISTS stock_count_entries_no_delete
BEFORE DELETE ON stock_count_entries BEGIN SELECT RAISE(ABORT, 'stock count entries are append-only'); END;

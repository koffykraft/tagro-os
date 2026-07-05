PRAGMA foreign_keys = ON;

CREATE TABLE machine_ownership_history (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES customer_machines(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  transferred_by TEXT NOT NULL REFERENCES staff(id),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX machine_ownership_history_machine_idx
  ON machine_ownership_history(machine_id, started_at DESC);

CREATE UNIQUE INDEX machine_ownership_history_active_unique
  ON machine_ownership_history(machine_id)
  WHERE ended_at IS NULL;

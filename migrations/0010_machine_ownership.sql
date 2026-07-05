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

INSERT INTO machine_ownership_history
  (id, machine_id, customer_id, started_at, ended_at, transferred_by, note, created_at)
SELECT
  'ownership_' || cm.id,
  cm.id,
  cm.customer_id,
  cm.first_seen_at,
  NULL,
  cm.created_by,
  'Initial owner migrated from customer machine record',
  cm.created_at
FROM customer_machines cm
WHERE cm.active = 1;

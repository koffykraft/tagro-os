ALTER TABLE customers ADD COLUMN created_branch_id TEXT REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN created_by TEXT REFERENCES staff(id);
ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));

CREATE INDEX customers_active_name_idx ON customers(active, name);
CREATE INDEX customers_created_branch_idx ON customers(created_branch_id, created_at);

PRAGMA foreign_keys = ON;

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'exported', 'cancelled')),
  naming_preference TEXT NOT NULL DEFAULT 'tagro'
    CHECK (naming_preference IN ('tagro', 'stihl')),
  supplier_name TEXT NOT NULL DEFAULT 'STIHL',
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES staff(id),
  updated_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX purchase_orders_branch_status_idx
  ON purchase_orders(branch_id, status, updated_at);

CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  canonical_part_number TEXT NOT NULL,
  tagro_name TEXT,
  stihl_name TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'Nos',
  retail_price REAL,
  mrp REAL,
  hsn_sac TEXT,
  gst_rate REAL,
  effective_date TEXT,
  source TEXT NOT NULL DEFAULT 'master_price_list',
  notes TEXT,
  UNIQUE(purchase_order_id, line_number)
);
CREATE INDEX purchase_order_items_po_idx
  ON purchase_order_items(purchase_order_id, line_number);
CREATE INDEX purchase_order_items_part_idx
  ON purchase_order_items(canonical_part_number);

CREATE TABLE purchase_order_exports (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  export_format TEXT NOT NULL CHECK (export_format IN ('tagro', 'stihl')),
  file_name TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  exported_by TEXT NOT NULL REFERENCES staff(id),
  exported_at TEXT NOT NULL
);
CREATE INDEX purchase_order_exports_po_idx
  ON purchase_order_exports(purchase_order_id, exported_at);

CREATE TABLE catalog_name_suggestions (
  id TEXT PRIMARY KEY,
  canonical_part_number TEXT NOT NULL,
  model_key TEXT NOT NULL,
  stihl_name TEXT NOT NULL,
  suggested_tagro_name TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'approved', 'rejected')),
  created_by TEXT NOT NULL REFERENCES staff(id),
  reviewed_by TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(canonical_part_number, model_key, suggested_tagro_name)
);
CREATE INDEX catalog_name_suggestions_status_idx
  ON catalog_name_suggestions(status, model_key, created_at);

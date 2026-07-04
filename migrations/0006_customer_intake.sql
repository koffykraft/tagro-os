PRAGMA foreign_keys = ON;

ALTER TABLE customers
  ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (customer_type IN ('individual', 'business'));

CREATE TABLE customer_identity_keys (
  identity_type TEXT NOT NULL
    CHECK (identity_type IN ('phone', 'email', 'tax_id')),
  identity_value TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (identity_type, identity_value)
);

CREATE INDEX customer_identity_keys_customer_idx
  ON customer_identity_keys(customer_id);

INSERT OR IGNORE INTO customer_identity_keys
  (identity_type, identity_value, customer_id, created_at)
SELECT 'phone', phone, id, created_at
FROM customers
WHERE active = 1
  AND record_kind = 'customer'
  AND phone IS NOT NULL
  AND phone <> '';

INSERT OR IGNORE INTO customer_identity_keys
  (identity_type, identity_value, customer_id, created_at)
SELECT 'phone', alternate_phone, id, created_at
FROM customers
WHERE active = 1
  AND record_kind = 'customer'
  AND alternate_phone IS NOT NULL
  AND alternate_phone <> '';

INSERT OR IGNORE INTO customer_identity_keys
  (identity_type, identity_value, customer_id, created_at)
SELECT 'email', LOWER(email), id, created_at
FROM customers
WHERE active = 1
  AND record_kind = 'customer'
  AND email IS NOT NULL
  AND email <> '';

INSERT OR IGNORE INTO customer_identity_keys
  (identity_type, identity_value, customer_id, created_at)
SELECT 'tax_id', UPPER(tax_id), id, created_at
FROM customers
WHERE active = 1
  AND record_kind = 'customer'
  AND tax_id IS NOT NULL
  AND tax_id <> '';

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('aadhaar', 'pan', 'gst_certificate', 'address_proof', 'other')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT NOT NULL,
  r2_etag TEXT,
  uploaded_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX documents_customer_created_idx
  ON documents(customer_id, created_at DESC);

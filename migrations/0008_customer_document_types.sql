PRAGMA foreign_keys = ON;

ALTER TABLE documents RENAME TO documents_before_0008;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN (
      'aadhaar',
      'pan',
      'gst_certificate',
      'address_proof',
      'bank_document',
      'land_tax_receipt',
      'sale_invoice',
      'payment_receipt',
      'handover_photo',
      'other'
    )),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT NOT NULL,
  r2_etag TEXT,
  uploaded_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

INSERT INTO documents (
  id, customer_id, r2_key, original_filename, doc_type, content_type,
  size_bytes, checksum_sha256, r2_etag, uploaded_by, created_at
)
SELECT
  id, customer_id, r2_key, original_filename, doc_type, content_type,
  size_bytes, checksum_sha256, r2_etag, uploaded_by, created_at
FROM documents_before_0008;

DROP TABLE documents_before_0008;

CREATE INDEX documents_customer_created_idx
  ON documents(customer_id, created_at DESC);

CREATE TABLE customer_credentials (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_label TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX customer_credentials_customer_idx
  ON customer_credentials(customer_id, created_at DESC);

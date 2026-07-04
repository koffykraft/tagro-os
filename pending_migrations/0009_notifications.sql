PRAGMA foreign_keys = ON;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  recipient_phone TEXT NOT NULL,
  template_key TEXT NOT NULL,
  language_code TEXT NOT NULL,
  template_parameters_json TEXT NOT NULL DEFAULT '[]',
  sms_variables_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL
    CHECK (status IN ('suppressed', 'processing', 'accepted', 'sent', 'delivered', 'read', 'failed')),
  final_channel TEXT CHECK (final_channel IN ('whatsapp', 'fast2sms')),
  provider_message_id TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0 CHECK (fallback_used IN (0, 1)),
  last_error TEXT,
  created_by TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX notifications_status_idx ON notifications(status, created_at);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_phone, created_at);
CREATE INDEX notifications_provider_id_idx ON notifications(provider_message_id);

CREATE TABLE notification_attempts (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'fast2sms')),
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'failed', 'timeout', 'skipped')),
  http_status INTEGER,
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(notification_id, channel, attempt_number)
);
CREATE INDEX notification_attempts_channel_idx
  ON notification_attempts(channel, outcome, created_at);

CREATE TABLE notification_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp', 'fast2sms')),
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(provider, provider_event_id)
);

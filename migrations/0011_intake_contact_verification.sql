ALTER TABLE intake_drafts
  ADD COLUMN contact_verification TEXT
  CHECK (contact_verification IS NULL OR contact_verification IN ('customer_confirmed', 'staff_no_contact'));

ALTER TABLE intake_drafts
  ADD COLUMN contact_verification_note TEXT;

ALTER TABLE intake_drafts
  ADD COLUMN contact_verified_by TEXT REFERENCES staff(id);

ALTER TABLE intake_drafts
  ADD COLUMN contact_verified_at TEXT;

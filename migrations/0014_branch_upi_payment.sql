-- Adds optional UPI payment details to branches, so the Sell page can show a
-- real UPI QR code at checkout without staff re-typing the branch's UPI ID
-- every sale. Both columns are nullable/optional: a branch with nothing set
-- here just doesn't get a QR option (the Sell page shows a message pointing
-- to Branches settings instead of a broken/blank QR).
--
-- Deploy order matters here: this migration must be applied BEFORE the worker
-- code that reads/writes these columns is deployed, since the branch list/
-- create/update queries reference them directly. The one endpoint the Sell
-- page itself depends on (GET /api/branches/mine) is written defensively to
-- degrade gracefully if these columns don't exist yet, but the Branches
-- settings page (list/create/update) is not -- run this first.
ALTER TABLE branches ADD COLUMN upi_vpa TEXT;
ALTER TABLE branches ADD COLUMN upi_payee_name TEXT;

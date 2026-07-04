# TAGRO OS checkpoint

Updated: 2 July 2026

## Live production

- URL: https://os.tagro.in
- Worker: `tagro-os-core`
- Worker version: `4acf5d28-daea-46b3-9dc5-88e13ace688b`
- D1 migrations applied through: `0008_customer_document_types.sql`
- `workers.dev` and preview URLs are disabled for the production deployment.
- Pre-migration backup: `backups/tagro-os-before-repair-flow-20260701.sql`

## Customer Intake now available

- Customer type, branch and creating staff are recorded.
- Customer IDs and customer codes use cryptographically secure UUID material.
- Duplicate phone, email and tax identities are guarded in D1.
- Aadhaar, PAN, GST certificate, address proof, bank documents, land-tax receipts,
  sale invoices, receipt copies, handover photos and other documents upload to private R2.
- Complete document metadata and SHA-256 checksums are stored in D1.
- Authenticated document listing and downloads are live.
- `tagro-docs` is connected as the dedicated private document bucket.
- An optional SMAM DBT switch reduces JPEG, PNG and WebP images below 100 KB when possible.
  It does not alter normal uploads. Oversized PDFs are rejected in DBT mode rather than damaged.
- Applicant portal login IDs and passwords are stored only as AES-256-GCM ciphertext.
- The encryption key is a Worker secret and is not stored in D1 or the source code.
- Applicant credentials are restricted to managers and owners; revealing one requires the
  current staff member to re-enter their PIN and is recorded in structured logs.

## Priority parts and pricing data

- Remote KV `parts:master` now contains the 13,121-item June 2026 enriched master.
- TAGRO familiar names and official STIHL names are retained on the same canonical records.
- Price, MRP, HSN, GST and model links are available through the public parts search.
- Catalog version: `v2026-07-02-tagro-1`.
- Structured model catalogs and model price sheets remain in their existing KV keys.
- R2 model lookup now checks the lowercase key layout used by `tagro-manuals`.

## Repair production flow now available

1. Accept a machine and remember it against the customer.
2. Inspect the machine.
3. Prepare an itemised estimate.
4. Record customer approval.
5. Start the repair.
6. Save actual diagnosis, work, labour and parts in a service record.
7. Complete work to automatically prepare structured billing material.
8. Notify the customer and deliver the machine through the existing timeline.

## Verification completed

- Worker and embedded repair-page JavaScript syntax checks passed.
- Local end-to-end API test passed from intake through ready-for-billing.
- Expected test totals: estimate ₹826; actual billing ₹708.
- Production deployment dry run passed.
- Production health and repair page return HTTP 200.
- New production D1 tables are present.
- Repair jobs and billing APIs return HTTP 401 without a login session.
- Mobile login and TAGRO OS app launcher were verified in the in-app browser.

## Next refinement

- Test the complete repair journey with real staff on one real machine.
- Improve alias-driven, word-order-independent part search.
- Add print/share formatting for estimates and billing handoff.
- Connect billing material to the chosen accounting/invoice system.
# 2026-07-02 — Purchase orders and perimeter checkpoint

- Built additive D1 migration `0007_purchase_orders.sql`.
- Built the Purchase Orders module with TAGRO/STIHL naming selector.
- One saved PO produces:
  - TAGRO working workbook with both names, prices, tax and branch metadata.
  - STIHL ERP workbook with only `Material` and `RequestedQuantity`.
- Added duplicate-line, numeric STIHL part-number, quantity, price and status validation.
- Added branch isolation, immutable line snapshots, export audit records and structured logs.
- Added review-only machine-model naming suggestions. Suggestions never overwrite catalog names.
- Added `robots.txt` and no-index response headers.
- Local integration test passed: D1 migration, auth, PO creation, invalid-input rejection,
  two XLSX exports, workbook reopen/structure validation, export audit, and browser UI.
- Production migration `0007` is applied and its four tables were verified remotely.
- The production custom domain is a native Worker binding declared in `wrangler.toml`.
- A manually created proxied CNAME for `os.tagro.in` caused a Cloudflare 522 because it treated
  the `workers.dev` hostname as an origin. That record was removed and replaced by the native
  custom-domain binding. `https://os.tagro.in` then loaded successfully.
- Cloudflare Access application `b580b985-3440-4c17-82c6-c3ee656c3e9a` protects `os.tagro.in`.
- Allow policy `TAGRO OS Admin India OTP`
  (`d882ad16-e390-46b1-9fb1-a950d8000930`) includes only `info@tagro.in` and requires country `IN`.
- Direct-access Bypass policy `Direct access to TAGRO staff PIN login`
  (`ac721260-2ed5-431d-a032-87aa80e6ac53`) now applies to everyone. It takes precedence
  over the email/India Allow policy, so visitors go directly to TAGRO's staff PIN login.
- One-time PIN identity provider `24ccbb84-79fc-43db-a7ae-659268d4892f` is configured.
- The application currently accepts both the One-time PIN and Cloudflare identity providers.
  Narrowing it to OTP-only and enabling instant authentication is still pending.
- The requested emergency Access service token and India-restricted Service Auth policy are
  still pending. Do not replace this with a hardcoded Worker header or query-string backdoor.
- The notifications draft remains outside the active migration directory at
  `pending_migrations/0009_notifications.sql` and is not applied. Messaging routes are not deployed.
- `CUSTOMER_CREDENTIALS_KEY` is now bound to `tagro-os-core` for the encrypted customer vault.
  WhatsApp/Fast2SMS credentials still have not been verified as Worker bindings.

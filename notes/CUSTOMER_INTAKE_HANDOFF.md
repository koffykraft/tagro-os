# Customer Intake Module — AI Agent Handoff

Date: 2026-07-02  
Project: TAGRO OS  
Module: Module 1 — Customer Intake  
Status: Implemented, locally verified, migrated and deployed to production.

## Non-negotiable project direction

- The architecture is approved. Do not redesign or simplify it.
- Preserve the existing folder structure, database schema, HTML/CSS/JS, and Design System.
- Stay focused on Customer Intake. Do not continue to Module 2.
- The active application is in `tagro_os_v1_release`.
- The production frontend is served through the Worker's static-assets binding from `tagros/`.
- Do not replace the existing application with the standalone sample layout described in `stihl/DBT SMAM 2026.docx`.

## Architecture clarification

The attached specification describes:

- `public/intake.html`
- `src/index.js`
- a standalone `schema.sql`
- a D1 binding named `DB`
- an R2 binding named `DOCS`

The existing production application already uses:

- `tagros/app-customers.html`
- `src/worker.js`
- ordered migrations in `migrations/`
- authenticated staff sessions and branch ownership
- Worker static assets
- D1 binding `DB`
- R2 manuals binding `MANUALS`

The implementation therefore preserved the production architecture and added Customer Intake functionality to the existing Customers module. A separate `DOCS` binding and `tagro-docs` bucket were added so private customer documents are not mixed with equipment manuals.

## Implemented changes

### Database

New migration:

- `migrations/0006_customer_intake.sql`

It adds:

- `customers.customer_type`
- `customer_identity_keys` for concurrency-safe duplicate prevention
- `documents` for complete R2 metadata
- indexes and backfill of existing phone, alternate-phone, email, and tax identities

Document metadata includes:

- internal document ID
- customer ID
- R2 key
- original filename
- document type
- detected content type
- byte size
- SHA-256 checksum
- R2 ETag
- uploading staff ID
- creation timestamp

### Worker

Main file:

- `src/worker.js`

Implemented:

- JSON and multipart customer creation
- JSON and multipart customer updates
- cryptographically secure customer IDs using `crypto.randomUUID()`
- customer codes using year plus 48 bits of random UUID material
- duplicate detection for primary phone, alternate phone, email, and GSTIN/tax ID
- database-enforced identity-key uniqueness for concurrent requests
- document upload to R2
- upload rollback when D1 fails
- D1 batch transactions for customer, identity, and document metadata
- Aadhaar, PAN, GST certificate, address proof, and other-document support
- multiple `other_document` uploads
- PDF, JPEG, PNG, and WebP magic-byte validation
- MIME mismatch rejection
- 10 MB individual-file limit
- 25 MB combined-request document limit
- eight-file request limit
- authenticated document metadata listing
- authenticated document download
- private/no-store download headers
- structured JSON logging
- meaningful status codes and response codes

Important API routes:

- `GET /api/customers`
- `POST /api/customers`
- `GET /api/customers/:id`
- `PUT /api/customers/:id`
- `GET /api/customers/:id/documents`
- `GET /api/customers/:id/documents/:documentId/download`

### Frontend

Files:

- `tagros/app-customers.html`
- `tagros/os-core.js`
- `tagros/os-shell.css`

Implemented:

- customer type selector
- upload inputs for every supported document category
- multipart form submission
- document list in customer details
- authenticated download links
- duplicate-response data preserved by the shared API client
- existing Design System retained
- desktop and mobile rendering verified

### Wrangler

File:

- `wrangler.toml`

Changes:

- compatibility date updated to `2026-07-02`
- `nodejs_compat` enabled
- `DOCS` R2 binding added for `tagro-docs`
- Workers logs and traces enabled

## Verification completed

The following passed locally using Wrangler 4.105.0:

- JavaScript syntax checks
- Wrangler deployment dry-run
- generated binding types include `DB`, `DOCS`, `MANUALS`, `ASSETS`, and `CATALOG_KV`
- migration `0006_customer_intake.sql`
- authenticated customer creation
- secure customer-code format
- all five document categories uploaded
- R2 file download for every uploaded document
- D1 metadata for every file
- SHA-256 values are 64 hexadecimal characters
- R2 ETags stored
- branch and staff ownership stored
- duplicate submission returns HTTP 409 and `CUSTOMER_DUPLICATE`
- invalid document returns HTTP 415 and `INVALID_DOCUMENT_TYPE`
- invalid customer data returns HTTP 400
- multipart customer update and additional document upload
- desktop UI flow
- mobile UI layout
- customer details show all uploaded documents

Local verification customer:

- Customer ID: `customer_6591412e-b793-4b32-9ff1-5587b0f61df7`
- Customer code: `CUS-2026-CBA9653992D8`
- Six document records across all five document types

Local preview:

- `http://127.0.0.1:8792/app-customers.html`
- Branch: `KVR`
- Staff: `Local Owner`
- PIN: `1234`

The local preview may need to be restarted if the previous Wrangler process is no longer running:

```powershell
cd "C:\Users\user\Documents\tagro service\tagro_os_v1_release"
.\node_modules\.bin\wrangler.cmd dev --local --port 8792
```

## Current Cloudflare production state

Account:

- Account: `Info@tagro.in's Account`
- Account ID: `c92a3d52fdc33021f324d9c2b05a6ac9`

R2:

- `tagro-docs` was created successfully.
- Region: APAC
- Storage class: Standard
- It is connected to the production Worker as `DOCS`.

D1:

Remote migrations `0005_vanilla_work_orders.sql` and `0006_customer_intake.sql` were applied successfully on 2 July 2026.

Deployment:

- URL: `https://tagro-os-core.icy-fire-d2ac.workers.dev`
- Worker version: `e4bf9de0-262c-455d-8732-555046440fee`
- Customer Intake page and API are live.
- Catalog version: `v2026-07-02-tagro-1`
- Remote `parts:master` was promoted from `backups/parts-master-june-2026-tagro.json`.
- The live public parts API was verified with part `56057504305`, including TAGRO name, STIHL name, retail price, MRP, HSN and GST.

## Deployment sequence for future updates

Before running these commands for a future release, obtain explicit user approval to mutate production D1 and deploy the Worker.

From:

```powershell
cd "C:\Users\user\Documents\tagro service\tagro_os_v1_release"
```

1. Confirm authentication and resources:

```powershell
.\node_modules\.bin\wrangler.cmd whoami
.\node_modules\.bin\wrangler.cmd r2 bucket info tagro-docs
.\node_modules\.bin\wrangler.cmd d1 migrations list tagro-os --remote
```

2. Apply pending production migrations:

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations apply tagro-os --remote
```

3. Confirm no migrations remain:

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations list tagro-os --remote
```

4. Run a final deployment dry-run:

```powershell
.\node_modules\.bin\wrangler.cmd deploy --dry-run
```

5. Deploy:

```powershell
.\node_modules\.bin\wrangler.cmd deploy
```

6. Run production smoke tests:

- Health endpoint returns HTTP 200.
- Existing staff can log in.
- Customer list loads.
- Create one uniquely identified test customer.
- Upload one small allowed document.
- Confirm document metadata in D1.
- Confirm the object exists in `tagro-docs`.
- Download the document through the authenticated API.
- Submit the same phone/email again and confirm HTTP 409.
- Remove or deactivate production test data only with explicit user approval.

## Deployment caution

Migration `0005_vanilla_work_orders.sql` predates this module but is pending remotely. Review it before applying because the migration command will apply both 0005 and 0006 in order.

Do not deploy the new Worker before the migrations are applied. The updated Worker queries:

- `customers.record_kind` from migration 0005
- `customers.customer_type`
- `customer_identity_keys`
- `documents`

Deploying first would cause production database errors.

An attempted full remote D1 export was not performed because it would copy private production data into the local workspace without separate authorization.

## Known non-blocking notes

- Wrangler reported that 4.106.0 is available; the installed 4.105.0 passed all checks.
- The project is JavaScript, so generated TypeScript binding declarations are only a validation artifact.
- The current application uses Worker static assets rather than a separate Cloudflare Pages project. Preserve this unless the user explicitly authorizes an architectural migration.
- No Module 2 work has been started.

## Parts, prices, pictures, and manuals audit

This area is outside Customer Intake, but it must be preserved and addressed by the next agent.

### Official STIHL master

Cloudflare KV contains:

- `parts:master`
- `parts:master:metadata`
- a pre-update backup key
- 37 structured model catalogs under `parts:{MODEL_KEY}`
- 53 model price sheets under `parts-price:{MODEL_KEY}`
- 77 combined model entries

The official June 2026 master contains:

- 13,196 source rows
- 13,121 unique items
- 75 duplicate rows removed
- 22 blank prices
- 174 machines
- 1,013 accessories
- 11,934 spares

The part number is stored as the normalized `id` and `no` field, normally an 11-character STIHL key. Records also contain the official name, HSN, GST, retail price, MRP, unit, group, source, effective date, and model links.

The newer local Worker can query this KV master successfully. For example, normalized part `00009975815` returned:

- STIHL name: `TENSION SPRING`
- HSN: `73209090`
- GST: 18%
- retail: 32
- MRP: 40
- model: MS 460

### TAGRO familiar names

The local enrichment report records:

- 2,022 busy/familiar-name rows
- 1,746 matched
- 276 unmatched
- 3 alternate names
- 1,742 official-master records currently carrying a non-null TAGRO name or alias

Local enriched master:

- `backups/parts-master-june-2026-tagro.json`

Audit report:

- `backups/parts-master-june-2026-tagro-report.json`

The unmatched 276 records require deliberate reconciliation. Do not silently attach a familiar name to the wrong official STIHL part number.

The remote KV master was checked using known local enriched part `56057504305`. The local enriched file contains the TAGRO name `2 in 1 File Holder`, but the remote API currently returned only the STIHL name `2 IN 1 FILE HOLDER` with `tagroName: null`. Therefore the enriched local master has not yet replaced the remote `parts:master`.

### Required name-display preference

The user wants a selectable catalog preference:

- `Use TAGRO familiar names`
- `Use STIHL official names`

Implement this as a display/search preference, not as two separate part catalogs:

- The normalized STIHL part number remains the canonical key.
- Price, MRP, HSN, GST, unit, model links, and stock references remain attached to that one key.
- Search must always match part number, TAGRO name, STIHL name, and aliases regardless of the display preference.
- In TAGRO mode, show `tagroName` as the primary label and the STIHL name as secondary context.
- In STIHL mode, show `stihlName` as the primary label and the TAGRO name as secondary context.
- Fall back to the available name when one side is blank.
- Preserve the selected preference per user/device.
- Upload and verify the enriched master before exposing the TAGRO mode in production.

### Required document naming policy

The parts catalog must support these business documents:

1. Estimates
2. Quotes
3. Purchase orders

Naming depends on the audience:

- Staff-facing search, estimates, and workshop documents should default to TAGRO familiar names for speed and recognition.
- Customer quotes may use the TAGRO familiar name as the primary description, with the official STIHL name available as secondary detail where useful.
- STIHL supplier purchase orders and STIHL export files must always use the official STIHL name and official normalized part number.

The name choice must happen when rendering/exporting a document, not by copying or altering the underlying part record. Each line should retain:

- canonical normalized STIHL part number
- TAGRO familiar name
- STIHL official name
- quantity
- unit price and MRP where applicable
- HSN/SAC
- GST rate
- source and effective date

Recommended output behavior:

- Estimate: `tagroName || stihlName`
- Quote: `tagroName || stihlName`, with optional official-name subtitle
- Internal purchase request: selected staff preference
- STIHL purchase order: `stihlName` only as the supplier description
- STIHL export: normalized STIHL part number plus `stihlName`; never export a TAGRO alias as the official description

Search and selection must match part number, both names, and aliases regardless of the output mode. Saved estimate, quote, and purchase-order lines should keep a snapshot of both names so historical documents do not change when the catalog is updated later.

### STIHL ERP purchase-order workbook contract

User-provided reference:

- `C:\Users\user\Downloads\template.xlsx`

The existing filled part numbers and quantities are examples only and must be ignored.

The workbook contract is:

- sheet name: `Template`
- column A header: `Material`
- column B header: `RequestedQuantity`
- no additional columns
- no formulas
- material and quantity cells are numeric in the reference workbook

The system must generate two separate workbooks for every branch purchase order:

1. `{PO_NUMBER}_STIHL_ERP.xlsx`
   - exact two-column STIHL template
   - official STIHL material number in `Material`
   - requested quantity in `RequestedQuantity`
   - no TAGRO names, notes, prices, formatting additions, or internal metadata
   - intended only for STIHL ERP upload

2. `{PO_NUMBER}_TAGRO_WORKING.xlsx`
   - human-readable branch working copy
   - canonical STIHL part number
   - TAGRO familiar name as the primary description
   - STIHL official name as secondary/reference description
   - requested quantity
   - unit
   - current retail price and MRP when available
   - HSN and GST
   - branch, PO number, creator, creation time, status, and notes
   - intended for understanding, checking, and editing

Do not add TAGRO columns to the STIHL ERP upload file. Extra columns could make the supplier import fail.

The cloud catalog uses normalized 11-character STIHL keys, including left-padded zeros. The supplied ERP workbook shows those left-padded materials as numeric values with leading zeros omitted. The exporter must deliberately convert the canonical key to the ERP representation and verify this behavior with STIHL before production. Do not accidentally lose significant zeros through generic Excel formatting.

Workflow:

1. Staff build and edit the PO using TAGRO familiar names.
2. The saved PO line retains both names and the canonical normalized key.
3. Validation blocks blank/invalid quantities and unresolved part numbers.
4. The TAGRO working workbook is generated for branch review.
5. The STIHL ERP workbook is generated from the same approved line snapshot.
6. Any later edit regenerates both files so they cannot diverge.

### Production integration gap

The data is stored, but it is not fully live in the currently deployed OS:

- Production `catalog_items` in D1 currently has zero active rows.
- The official master and familiar-name enrichment live primarily in KV, not D1.
- The currently deployed Worker returns `API route not found` for `/api/public/parts`.
- The newer local Worker contains the cloud-library routes and UI, but they have not yet been deployed.

The next agent must decide, with user approval, whether KV remains the authoritative large read-only catalog while D1 stores only selected/imported operational items. Do not copy all 13,121 items into D1 without reviewing the approved data architecture.

### R2 pictures and manuals

Remote bucket `tagro-manuals` currently contains:

- 3,745 objects
- 362,878,301 bytes (about 363 MB)
- 3,296 PNG images
- 443 JSON files
- 2 PDF manuals
- 4 folder-marker objects

The content includes 37+ model folders with section JSON and rasterized diagram pages. The two PDFs observed are:

- `stihl/ms-462/MS 462 Parts.pdf`
- `stihl/ms-462/MS 462 Repair Manual.pdf`

There is a current lookup bug:

- R2 object folders are lowercase, such as `stihl/ms250/sections/...`.
- `listKnowledgeAssets()` currently requests uppercase prefixes such as `stihl/MS250/`.
- R2 prefix matching is case-sensitive.
- As a result, the current asset API returns no pictures/manuals even though the objects exist.

Fix the key-normalization mismatch before calling the pictures/manuals feature operational. Also verify repair-manual folders such as `ms462repairmanual` and `fsa30repairmanual2025`, because they do not follow the same model-folder naming pattern as ordinary parts diagrams.

## Recommended next-agent first action

Read these files before changing anything:

1. `stihl/DBT SMAM 2026.docx`
2. `notes/CUSTOMER_INTAKE_HANDOFF.md`
3. `migrations/0005_vanilla_work_orders.sql`
4. `migrations/0006_customer_intake.sql`
5. `src/worker.js`
6. `tagros/app-customers.html`
7. `tagros/os-core.js`
8. `wrangler.toml`

Then ask:

> Do you explicitly approve applying remote D1 migrations 0005 and 0006 and deploying `tagro-os-core` to production now?

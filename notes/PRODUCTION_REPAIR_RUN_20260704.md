# TAGRO production repair run

Run date: 2026-07-04 (Asia/Calcutta)

## Service application

Repository: `https://github.com/koffykraft/tagro-service.git`

Pushed commit: `8c1547150f9c3869faf0bdaeee9f854c714af3b3`

Changed deployable files:

- `app.js`
  - identifies retired browser fixtures only by their exact internal ID, branch, and
    machine-ID shape;
  - writes removed browser fixtures to `tagro_cleanup_backup_v2`;
  - removes jobs only when linked to a fixture actually removed or explicitly marked
    as demo;
  - no longer contains sample customer names, phone numbers, or name/phone deletion.
- `receive.html`
  - provides exactly seven complaint controls: Won't Start, No Power, Chain Problem,
    Fuel Leak, Engine Noise, Service, and Other;
  - shows selected state and `aria-pressed`;
  - supports custom text for Other;
  - saves `customerId` on each received job.
- `sw.js`
  - advances the cache to `tagro-v5` so browsers fetch the repaired files.

Automated verification created and saved one job for each complaint option. A local
browser test selected all seven controls, added custom Other text, selected MS 250,
reviewed the job summary, and opened the receive action.

## OS and catalog

Changed files:

- `src/worker.js`
  - returns `diagramPartNumber`, verified `currentPartNumber`, and `mappingStatus`;
  - never labels a diagram-only number as current.
- `tagros/app-catalog.html`
  - displays TAGRO or official STIHL names from the user preference;
  - displays diagram reference and mapping status;
  - blocks import when a current number is not verified;
  - imports the verified current number, prices, HSN, GST, and mapping notes.
- `tagros/service-core.js`
  - aligns complaint-button selected state and accessibility with the service app.
- `tagros/sw.js`
  - advances the cache to `tagro-white-v17`.
- `scripts/map_parts_catalogs.py`
  - reads the official master `price` field when `retail` is absent.
- `scripts/verify-production-repairs.mjs`
  - verifies complaint saves, cleanup safety, fixture removal, and mapping UI guards.

Regenerated mapping:

- 6,205 diagram-reference rows;
- 5,417 exact-current rows, all with retail prices;
- 788 diagram rows missing from the current master and therefore held for
  supersession review;
- no automatic or guessed replacement numbers.

The production `parts:master` KV key now contains 13,121 canonical items and 1,742
TAGRO familiar names. Readback verified part `56057504305` with TAGRO name
`2 in 1 File Holder`, official STIHL name `2 IN 1 FILE HOLDER`, retail 1707, MRP
2115, HSN `82031000`, and GST 18. Rollback key:
`parts:master:backup:2026-07-04-before-tagro-enrichment`.

The Worker dry-run build passed with 30 static assets and all D1, KV, R2, and asset
bindings. The final Worker deployment did not run because the account reached its
Codex usage limit during the final preview attempt.

## Production data removal

See `PRODUCTION_DATA_CLEANUP_AUDIT_20260704.md`.

Removed from production D1:

- `Customer 001` (`customer_6896ad27-f69a-40c6-9d27-a920f1621c9f`);
- `Customer 002` (`customer_abadad0f-5eac-4aba-96bc-93144a83646a`);
- one phone identity key linked to `Customer 001`.

No job, machine, document, or credential row was linked to those fixtures. The real
work order, real staff record `T M Thomas`, and system-pending customer identity were
queried after deletion and remain present.

Immediate restore export:
`backups/tagro-os-pre-cleanup-20260704.sql`

SHA-256:
`CE481098F24B03DFFD6E0520299DFF173E894A8ADADABEACFBEAB45049A30677`

## Remaining production verification

- Deploy `tagro-os-core` after account usage is available.
- Smoke-test `os.tagro.in` after deployment.
- Confirm GitHub Pages has published commit `8c15471` to `service.tagro.in`.
- The in-app browser's URL policy blocked both production domains during this run,
  so production-domain browser smoke tests were not bypassed.

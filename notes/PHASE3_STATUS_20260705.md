# TAGRO OS Phase 3 staging status — 2026-07-05

## Deployment boundary

- Staging Worker: `tagro-os-core-staging`
- Staging URL: `https://tagro-os-core-staging.icy-fire-d2ac.workers.dev`
- Active staging version: `92b91e01-6c69-4646-9ad6-221885943800`
- Production remained on `30d30c0c-c54d-4e07-8ae5-ff295b578d92`.
- No production deployment or production database mutation was performed.

## Bindings and catalog

The staging dry run and deployment reported only:

- D1: `tagro-os-staging`
- KV binding: `TAGRO_DATA`, isolated staging namespace `cd758d9505544f84a9158b3fcc722328`
- R2 binding: `MANUALS`, bucket `tagro-manuals`
- Static assets and `ENVIRONMENT=staging`

`CATALOG_KV` is absent from Worker source, Wrangler configuration, migrations and scripts.
`TAGRO_DATA/parts:master` contains 2,022 TAGRO-named records, version `v2022-1`.
The live smoke test returned `Clutch Assembly MS 460`, part `11281602004`, retail `₹1,444`, GST 18%.

## Backup and clean staging state

Pre-deploy recovery material is under ignored folder:

- `rollback/20260705-phase3-predeploy/tagro-os-staging.sql`
- `rollback/20260705-phase3-predeploy/staging-kv-parts-master-before-phase3.json`
- `rollback/20260705-phase3-predeploy/tagro-data-parts-master-before-phase3.json`
- `rollback/20260705-phase3-predeploy/clean-staging-service-data.sql`

Migration 0010 and 0011 are schema-only. After acceptance testing, staging was cleaned and verified:

- customers: 0
- machines: 0
- jobs: 0
- estimates: 0
- intake drafts: 0
- work-order parts: 0
- ownership rows: 0

The staging branch, staff account and authentication configuration were preserved.

## Acceptance results

- Timed intake completed in 35 seconds, below the 60-second target.
- Mechanic PIN login and mechanic contact sign-off worked without SMS.
- `Won't Start` quick complaint saved correctly.
- Take job, free-text bench observation, TAGRO part search, quantity add, estimate, pause, resume, completion and return were exercised.
- Two `Clutch Assembly MS 460` parts produced subtotal `₹2,888.00` and GST-inclusive total `₹3,407.84`.
- Customer and machine histories both reported the returned job.
- A returned work order rejected mutation with HTTP 409.
- Portrait-to-landscape-to-portrait testing retained entered intake data.
- Phone-width checks used 390 × 844; intake, bench, job list, customer history and machine history had no horizontal page overflow.
- Workbench part names render at 16px, prices at 18px, tabs at 15px/44px, primary actions at 16px/44px or larger, and communication actions use two columns on mobile.
- Browser console checks reported no warnings or errors during the phone flow.
- All repository verification scripts and `git diff --check` passed.

## Visual comparison

Live staging follows the approved mockup direction: machine-first hierarchy, small muted work-order reference, orange/white cards, persistent mobile navigation, in-context parts and estimate, two-column communication actions and large touch controls. Exact pixel comparison against the original high-definition mockup files could not be archived because those image assets are not present in this repository.

## Deferred

- PIN is the reliable no-SMS/no-WhatsApp login fallback in this release.
- Biometric login requires a real WebAuthn/passkey enrollment and recovery design; it was not represented by a non-functional button in Phase 3.

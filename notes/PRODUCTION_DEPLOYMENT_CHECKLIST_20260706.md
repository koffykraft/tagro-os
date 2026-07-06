# TAGRO OS Production Deployment Checklist

Prepared: 2026-07-06

Release commit: `d79a7a7` (`Finalize mobile workbench launch gate`)

Approved foundation commit: `a970d6f` (`Separate daily job views and simplify navigation`)

Verified staging Worker: `4566eb8e-4090-403b-94c0-1369b4721812`

Current production Worker: `30d30c0c-c54d-4e07-8ae5-ff295b578d92`

Production has **not** been deployed. This checklist is the release gate.

## 1. Owner approval and pilot window

- [ ] Obtain explicit owner approval for the production deployment.
- [ ] Name the first pilot branch, manager and mechanic.
- [ ] Choose a quiet 30–60 minute deployment and smoke-test window.
- [ ] Ask staff not to create or edit service records during the migration/deployment window.
- [ ] Confirm who can authorize rollback.

## 2. Release identity

- [ ] Confirm `main` is clean and synchronized with `origin/main`.
- [ ] Confirm the release contains commits `a970d6f` and `d79a7a7`.
- [ ] Run the complete automated verification suite.
- [ ] Confirm staging still serves Worker version `4566eb8e-4090-403b-94c0-1369b4721812`.
- [ ] Confirm staging business data is clean after QA: zero customers, repair jobs, estimates and work-order parts.

## 3. Production backups and audit record

- [ ] Create a timestamped rollback folder.
- [ ] Export the complete production D1 database `tagro-os`.
- [ ] Record the D1 export SHA-256 checksum.
- [ ] Export/snapshot production KV `TAGRO_DATA` key `parts:master` from namespace `3a0fd40900114bb1861163a861dcf7e1`.
- [ ] Record the KV snapshot SHA-256 checksum and item count.
- [ ] Record current production Worker version `30d30c0c-c54d-4e07-8ae5-ff295b578d92`.
- [ ] Save the production binding inventory and migration list with the rollback bundle.

No customer or job deletion is part of this release.

## 4. Production migration gate

Production currently has three pending additive, schema-only migrations:

- `0009_intake_drafts.sql`
- `0010_machine_ownership.sql`
- `0011_intake_contact_verification.sql`

Before applying:

- [ ] Confirm all three files contain schema/index changes only and no sample-data `INSERT`.
- [ ] Confirm the D1 export completed successfully.
- [ ] Apply the three migrations to production D1.
- [ ] Confirm there are no remaining pending migrations.
- [ ] Confirm existing customer, job, estimate and part counts are unchanged.
- [ ] Confirm existing staff, branches and sessions remain present.

## 5. Production dry run and binding gate

- [ ] Run the production Worker dry run.
- [ ] Confirm the only application bindings are:
  - D1 `DB` → `tagro-os`
  - KV `TAGRO_DATA` → `3a0fd40900114bb1861163a861dcf7e1`
  - R2 `MANUALS` → `tagro-manuals`
  - static `ASSETS`
  - `ENVIRONMENT=production`
- [ ] Confirm there is no `CATALOG_KV` binding or fallback.
- [ ] Confirm the custom domain remains `os.tagro.in`.
- [ ] Stop if any production binding differs from this list.

## 6. Controlled deployment

- [ ] Deploy the Worker to production only after the prior gates pass.
- [ ] Record the new production Worker version and deployment time.
- [ ] Keep version `30d30c0c-c54d-4e07-8ae5-ff295b578d92` available for immediate Worker rollback.
- [ ] Do not modify `service.tagro.in` during this deployment.

## 7. Immediate production smoke test

Use an authorized real pilot record—never a hardcoded/sample customer.

- [ ] Log in with an existing staff PIN.
- [ ] Confirm My Space shows the full staff name and the correct branch separately.
- [ ] Confirm mobile navigation is exactly: My Space, Receive, My Bench, More.
- [ ] Confirm More contains Repair Jobs, Items & Parts, Customers, Machines, Purchase Orders and Settings.
- [ ] Receive one pilot machine with customer contact verification.
- [ ] Confirm the job appears in My Bench and can be taken by the mechanic.
- [ ] Record a free-text Bench Note.
- [ ] Open Pick Parts from the workbench.
- [ ] Confirm customer, complaint, machine and current-job destination are inherited.
- [ ] Confirm model-specific searching does not offer parts explicitly named for another model.
- [ ] Confirm typing does not move the search input or keyboard.
- [ ] Confirm each ✓ is draft-only and does not alter the job.
- [ ] Confirm Add to Job / Estimate persists selected parts once, returns to the same workbench and clears the handoff.
- [ ] Reload the workbench and confirm parts, quantity and prices remain.
- [ ] Create an estimate and verify subtotal, GST and total.
- [ ] Confirm no horizontal overflow at a 390×844 viewport.
- [ ] Confirm no 4xx/5xx errors or new Worker exceptions.

## 8. Pilot acceptance

- [ ] Mechanic completes the receive → bench → parts → estimate loop without assistance.
- [ ] Manager verifies the customer, machine, job, parts and estimate records.
- [ ] Record any friction as a specific observation; do not redesign during the pilot.
- [ ] Continue only with the named pilot branch until owner acceptance.

## 9. Rollback triggers

Rollback immediately if any of these occur:

- staff cannot authenticate;
- existing production customers/jobs disappear or change unexpectedly;
- parts save to the wrong work order;
- unrelated-model parts bypass the model guard;
- estimate totals are incorrect;
- repeated 5xx responses or Worker exceptions occur;
- mobile navigation blocks Receive or My Bench.

## 10. Rollback procedure

Worker rollback:

1. Roll back production traffic to Worker version `30d30c0c-c54d-4e07-8ae5-ff295b578d92`.
2. Smoke-test login, existing job access and customer history.
3. Record the reason, time and operator.

Database safety:

- Migrations 0009–0011 are additive. Do not manually drop their tables/columns during an application rollback.
- Restore the D1 backup only if verified data corruption occurred, with explicit owner approval and a controlled outage.
- This release does not modify production `TAGRO_DATA`; restore its snapshot only if an independent KV integrity check fails.

## 11. Closeout

- [ ] Record final Worker version, migration status and smoke-test results.
- [ ] Record pilot job reference and approving manager.
- [ ] Confirm production monitoring is quiet for at least 30 minutes.
- [ ] Publish a short deployment report: what changed, what data changed, what was removed (normally none), rollback point and remaining deferred work.

Deferred after real workshop feedback: search logging, Excel export, Repair Manual tile cleanup, Pick List naming cleanup and work-order reference in the picker header.

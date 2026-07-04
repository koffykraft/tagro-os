# TAGRO production data cleanup audit

Run date: 2026-07-04 (Asia/Calcutta)

## Recovery point

- Immediate pre-deletion D1 export:
  `backups/tagro-os-pre-cleanup-20260704.sql`
- Export created: 2026-07-04 16:50:27 +05:30
- Export size: 33,096 bytes
- SHA-256: `CE481098F24B03DFFD6E0520299DFF173E894A8ADADABEACFBEAB45049A30677`
- Full pre-cleanup D1 export: `backups/tagro-os-before-sample-cleanup-20260703.sql`
- Export created: 2026-07-03 06:00:43 +05:30
- Export size: 33,170 bytes
- SHA-256: `1AA808385E91D9D6ADD6995F167E693E96DE3DFC76C1BD84FD005D9BF111212A`
- Restore scope: complete schema and data through migration `0008_customer_document_types.sql`

## Records classified as fixtures

The backup contains two ordinary customer rows that have placeholder names rather than
real customer identities:

| Customer ID | Customer code | Name | Phone | Classification evidence |
|---|---|---|---|---|
| `customer_6896ad27-f69a-40c6-9d27-a920f1621c9f` | `CUS-2026-5D967E0` | `Customer 001` | `04752253172` | Placeholder name; phone duplicates the KVR branch landline; no machine, job, document, or credential dependency |
| `customer_abadad0f-5eac-4aba-96bc-93144a83646a` | `CUS-2026-8E93F52` | `Customer 002` | blank | Placeholder name; no identity, machine, job, document, or credential dependency |

One dependent row belongs to the first fixture:

- `customer_identity_keys`: phone `04752253172` for customer
  `customer_6896ad27-f69a-40c6-9d27-a920f1621c9f`.

No other table in the export references either fixture customer ID.

## Records explicitly preserved

- All branch records and their addresses/phones.
- All staff records, including `T M Thomas`; this is a real staff identity and is not
  the retired browser fixture formerly using a similar name/phone.
- `customer_pending_branch_5fa46b31-78b6-401a-aa1a-232b208aed4f`
  (`Details pending`), because it is a `system_pending` work-order identity, not a
  sample customer.
- The real work order `WO-20260702-KVR-E59A0E` and all related events, details, and
  parts.
- All purchase-order, catalog, machine, session, and authentication records.

## Browser fixture cleanup

The legacy service client previously seeded four browser-only customer fixtures.
The production source no longer contains their names or contact details. Cleanup now:

1. identifies only the retired internal customer/machine ID shapes;
2. preserves all timestamp-ID customer records;
3. backs up any removed browser records to `localStorage` key
   `tagro_cleanup_backup_v2`;
4. removes only jobs explicitly linked to those fixture IDs or marked as demo data;
5. never deletes a job by matching a customer name or phone number.

## Current-run mutation status

Authenticated remote D1 verification on 2026-07-04 confirmed the two classified
fixtures still existed. Immediately before deletion, they had:

- zero repair jobs;
- zero customer machines;
- zero documents;
- zero customer credentials;
- one phone identity key linked to `Customer 001`.

The guarded production delete matched both customer ID and placeholder name. D1
reported three changed rows: the two fixture customers and the one cascading identity
key. Post-delete verification returned zero remaining rows for both fixture IDs and
zero remaining identity keys linked to them.

The preserved real work order `WO-20260702-KVR-E59A0E`, staff record `T M Thomas`,
and system-pending customer identity were queried after deletion and each still
returned exactly one row. No other production data was deleted in this run.

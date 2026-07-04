# TAGRO OS deployment baseline — 4 July 2026

Captured before the staged approved-UI rollout.

## Source

- Repository: `https://github.com/koffykraft/tagro-os`
- Baseline commit: `b431f3e`
- Baseline tag: `baseline-production-2026-07-04`

## Production Worker

- Worker: `tagro-os-core`
- Active deployment: `bb4c4bdc-6ee4-4eca-815b-464021f159d2`
- Active version: `30d30c0c-c54d-4e07-8ae5-ff295b578d92`
- Version number: `23`
- Deployed: `2026-07-03T00:37:49.091454Z`

## Production D1 backup

- Database: `tagro-os`
- Database ID: `4f53e926-c25c-4279-aa14-8ca759a4ed4a`
- Local ignored path:
  `rollback/20260704-221938/tagro-os-production.sql`
- Size: `31,872` bytes
- Tables: `28`
- SHA-256:
  `7D718922231E543FE7029BD0464B29ED0E7F91E5CEB137B633057E8A78E69253`

The SQL export is deliberately excluded from Git because it contains production
data. Verify the checksum before any recovery operation.

## Rollback boundary

Cloudflare Worker rollback restores code, static assets and binding
configuration. It does not restore D1, KV or R2 content. Use the Worker version
above for code rollback and the separately protected export for data recovery.

## Isolated staging baseline

- Worker: `tagro-os-core-staging`
- URL: `https://tagro-os-core-staging.icy-fire-d2ac.workers.dev`
- Initial code version: `382c02ba-ba04-430e-af2b-caf33eb1443c`
- Active secret update version: `e0aa9fc5-4153-4788-9f09-db7453beaf8c`
- D1: `tagro-os-staging`
- D1 ID: `ac5807d2-3e6a-4e10-b77e-68692e21f06a`
- KV: `tagro-os-catalog-staging`
- KV ID: `cd758d9505544f84a9158b3fcc722328`
- R2 manuals: `tagro-manuals-staging`
- R2 private documents: `tagro-docs-staging`
- Staging D1 baseline:
  `rollback/20260704-221938/tagro-os-staging-baseline.sql`
- Staging export size: `17,557` bytes
- Staging export SHA-256:
  `9CA433860C877F497F3C52DE12B4772295FDF6A59F5E683E91D727BBCC105288`

Staging uses no production route and no production D1, KV or R2 binding.
Generated staging credentials are stored only in the ignored local rollback
directory.

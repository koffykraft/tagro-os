# TAGRO OS

TAGRO OS is the Worker-backed workshop application served at `os.tagro.in`.

## Runtime

- Cloudflare Worker for the API, authentication and static assets
- D1 for operational records and append-only job events
- KV for the canonical parts catalog
- R2 for manuals, diagrams and private documents

## Environments

- Production: `tagro-os-core` / `os.tagro.in`
- Staging: isolated Worker and D1 resources configured through Wrangler

Production data exports, local Wrangler state, generated catalog output and
credentials are intentionally excluded from Git.

## Safe release sequence

1. Export the affected D1 database before migrations.
2. Run syntax and local integration checks.
3. Deploy and smoke-test staging.
4. Commit the verified release.
5. Deploy production only after approval.
6. Record the active Worker version and backup path.

See `notes/ROLLBACK_RUNBOOK.md` for recovery procedures.


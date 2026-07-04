# TAGRO OS rollback runbook

## Scope

Worker versions contain code, static assets and binding configuration. They do
not contain D1, KV or R2 state. Code rollback and data recovery are therefore
separate operations.

## Before every release

1. Export the target D1 database to the ignored `rollback/` directory.
2. Record the current Worker deployment and version identifiers.
3. Run the local verification scripts.
4. Deploy and test staging before production.

## Worker rollback

List deployments and versions:

```powershell
.\node_modules\.bin\wrangler.cmd deployments list
.\node_modules\.bin\wrangler.cmd versions list
```

Roll back production only after identifying the intended version:

```powershell
.\node_modules\.bin\wrangler.cmd rollback <VERSION_ID>
```

For staging, add `--env staging`.

## D1 recovery

D1 migrations are additive. Do not use a destructive down migration in
production. If data must be restored:

1. Stop the affected write path.
2. Preserve a fresh export of the current database.
3. Review the release backup and restoration SQL.
4. Restore only the affected records or create a replacement database.
5. Verify row counts, relationships and audit records before reopening writes.

## KV and R2

Catalog updates must create a dated KV backup key before replacing the active
master. R2 objects should be versioned by key or copied before replacement.
Never delete manuals, diagrams or private documents as part of a code rollback.


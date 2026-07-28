# Warehouse and Stock Count integration

This change docks the existing historical Warehouse and illustrated Stock Count tools into TAGRO OS.

## Boundaries

- TAGRO OS login is the only identity boundary.
- Owners may select one or several warehouse branches.
- Other users are server-scoped to their logged-in branch; changing browser parameters cannot widen access.
- `HISTORY_DB` is queried read-only. No warehouse insert, update, or delete statement exists in the integrated router.
- Stock-count submissions are stamped with the authenticated branch and staff member.
- Submitted stock counts are append-only. A correction must be a later submission, preserving the original evidence.
- A phone draft remains in local storage when submission cannot reach TAGRO OS.

## Source preservation

The existing standalone Cloudflare deployments are not changed or removed. This branch adds the Git-controlled OS copies so the standalone versions remain available as rollback references until the integrated versions are accepted.

## Deployment order

1. Review and merge this pull request.
2. Apply `0012_stock_count.sql` to the staging D1 database.
3. Deploy the staging Worker and test owner, manager, and staff branch boundaries.
4. Apply the migration to production D1.
5. Deploy production only after the staging acceptance check.

The illustrated catalogue is versioned under `tagros/stock-count/`. New catalogue releases can replace its JSON and image assets without changing submission history.

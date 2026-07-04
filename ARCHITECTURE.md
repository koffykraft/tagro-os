# TAGRO OS application framework

TAGRO OS is a cloud-backed application shell. Each business capability is an independent app registered in `tagros/os-manifest.js`.

## Foundation

- Cloudflare Worker: API, authentication, authorization and static application delivery.
- Cloudflare D1: branches, staff, customers, catalog, machines, jobs and append-only events.
- Same-origin secure session cookie: the browser never stores a bearer token.
- App registry: controls app discovery and visibility. The API remains the final authority.
- Timeline events: repair-job status is derived from recorded work, never manually selected.

## Data quality rules

Every sale item requires a part number, item name, HSN/SAC and GST rate. Retail price and MRP may be blank. AI-assisted values use `data_source = ai_suggested` and `review_required = 1` until a person confirms them.

## Build sequence

1. Staff login and sessions
2. Customers
3. Branch locations
4. Machine makes and models
5. Machines, accessories, parts and services catalog
6. Service repair job types
7. Repair jobs and timeline
8. Reporting and assistant apps

Database migrations are additive. Existing data must not be silently rewritten when a new app is introduced.

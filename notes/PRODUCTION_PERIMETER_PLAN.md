# TAGRO OS production perimeter

Target host: `os.tagro.in`  
Worker: `tagro-os-core`  
Account: `c92a3d52fdc33021f324d9c2b05a6ac9`  
Zone: `f5c1cb97b6f0995b48e22da4ae2b4218`

## Release order

1. Apply D1 migration `0007_purchase_orders.sql`.
2. Deploy the verified Worker build.
3. Create the Access self-hosted application for `os.tagro.in`.
4. Add the normal administrator Allow policy:
   - Include: `info@tagro.in` (or the final approved administrator list).
   - Require: Country `IN`.
   - Require: the approved login method (Cloudflare account member or One-Time PIN).
5. Create a named, expiring Access service token for emergency automation.
6. Add a Service Auth policy for that exact token and require Country `IN`.
7. Store the token outside the repository in an approved password manager or secret store.
8. Bind `os.tagro.in` as the Worker's Custom Domain. Let Cloudflare create DNS and the certificate.
9. Disable the public `workers.dev` route so Access cannot be bypassed by using the old hostname.
10. Enable hostname-scoped bot/AI crawler blocking and verify `robots.txt` plus the `X-Robots-Tag` response header.

## Important security decision

Do not create an Access Bypass policy for an administrator email. Cloudflare Bypass
policies do not support identity-based email selectors, disable Access enforcement,
and do not produce Access logs. Use an Allow policy for the administrator and a
Service Auth policy for the emergency token.

Do not hardcode an emergency token in Worker source, frontend JavaScript, a URL, or
a browser bookmark. A leaked shared token is an unlogged backdoor. Cloudflare Access
service credentials are independently revocable, expiring, and auditable.

## Validation

- Authorized admin in India reaches Cloudflare authentication, then TAGRO login.
- The same admin outside India is denied.
- Unapproved email is denied and receives no OTP.
- Requests with no Access session do not reach the Worker or `/api/*`.
- The exact emergency service token works from India and is logged.
- An invalid or revoked token is denied.
- `https://tagro-os-core.icy-fire-d2ac.workers.dev` is unavailable after cutover.
- Search and AI crawlers receive an edge block; all HTML also returns no-index headers.

## Rollback

Remove the custom-domain binding to return traffic to the pre-cutover state. Keep the
Access application and service token disabled rather than deleting them until the
incident is understood. Re-enable `workers.dev` only as a temporary authenticated
recovery step.

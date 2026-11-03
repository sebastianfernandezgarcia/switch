# Public demonstration preparation

The current server binds to localhost and preserves a local review session. Public deployment is a separate step; the repository and demo video can be published first. No public service is created by this checkout.

The proposed host is the participant's personal Render account, using Free instances only and no payment card. The account was checked on 3 November 2026: Hobby, no card on file.

Before exposing an API-enabled public service:

1. Bind an explicitly configured public server to `0.0.0.0` and `PORT`; keep an exact external Host/Origin allowlist.
2. Isolate visitor sessions and prevent one visitor from cancelling or changing another's run.
3. Store credit reservations in durable storage before every provider call. Seed the previously consumed reservation balance rather than restarting it at zero. Existing authorization is five USD total; do not expand it silently.
4. Keep the provider key exclusively in authorized server secrets. Fail closed when the durable meter is unavailable. Apply request limits.
5. Verify the deployed app from a clean browser with no author session, including failure, cancellation and replay paths.

Render Free has an ephemeral filesystem, no persistent disk, 750 shared instance hours per month and cold starts after inactivity. It must not host a resettable file-based spending meter. Free PostgreSQL may provide durable storage during evaluation, but expires after 30 days and must be configured/verified before enabling inference. Neither resource has been created for SWITCH.

References checked 3 November 2026:
- https://render.com/docs/free
- https://render.com/docs/web-services

The local app remains available, the film already shows actual Meta inference, and a public copy must state clearly whether it offers new inference or saved actual results. No paid upgrade or always-on promise is implied.

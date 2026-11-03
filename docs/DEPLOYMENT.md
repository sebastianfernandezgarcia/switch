# Free public showcase

The public entry point is `npm run start:public`. The local server remains available through `npm start`. `render.yaml` selects a Free Node web service, runs the test suite during build and checks `/healthz`.

The gateway binds to `0.0.0.0` and `PORT`, using `RENDER_EXTERNAL_URL` or an exact `SWITCH_PUBLIC_ORIGIN` for Host/Origin checks. Each visitor gets an opaque HttpOnly/SameSite cookie and a private workspace. HTTPS sets Secure. Visitors cannot overwrite or cancel another visitor's case. Geometry and the public Renfe fetch cache are shared, not mutable session state. Idle workspaces expire; state also resets when the Free service sleeps or restarts.

The public showcase blocks all four new-inference routes before provider access, even if a provider key is accidentally present. Saved actual Meta outputs remain labelled and replay-verified. No secrets or private credit records are deployed. This makes the initial public demo independent of the author's Mac without risking a resettable credit cap.

Before enabling new public inference: provision durable reservations, seed the previously consumed balance, retain the existing total authorization and store the provider credential only in an authorized server secret. Fail closed when the meter is unavailable. This is a separate activation step; do not bypass the gateway block.

Render Free can cold-start after inactivity and has 750 shared instance hours monthly. Its filesystem resets on restart, and Free PostgreSQL expires after 30 days. The personal Render workspace was checked on 3 November 2026: Hobby and no card on file. No paid upgrade is needed for this showcase.

References checked 3 November 2026:
- https://render.com/docs/free
- https://render.com/docs/web-services

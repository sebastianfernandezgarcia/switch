# Free public demo

[Open SWITCH](https://switch-rail-demo.onrender.com/). Render Free may take about a minute to wake after inactivity. The deployment banner states whether new Meta requests are active or paused.

`npm run start:public` starts the public gateway. `npm start` retains the local server. `render.yaml` selects the Free Node service, installs the locked dependencies with lifecycle scripts disabled, runs the tests and checks `/healthz`.

The gateway binds to `0.0.0.0` and `PORT`, using `RENDER_EXTERNAL_URL` or an exact `SWITCH_PUBLIC_ORIGIN` for Host/Origin checks. Each visitor gets an opaque HttpOnly/SameSite cookie and a private workspace; HTTPS sets Secure. Geometry and the read-only Renfe cache are shared. Mutable rehearsals are isolated. Idle workspaces expire and reset when the Free service restarts.

## New Meta requests

New inference is disabled by default. Saved actual outputs remain labelled and replay-verified. The simulator and public Renfe observations need no provider key.

Activation requires all three server secrets/settings:

- `BASETEN_API_KEY`: an authorized existing provider credential.
- `DATABASE_URL`: an authorized, TLS-verified PostgreSQL connection.
- `SWITCH_PUBLIC_INFERENCE=1`: an explicit activation flag.

Do not put credentials in a Git file, browser bundle or deploy log. The PostgreSQL service must already contain the approved credit rows. Before activation, migrate all previous reservations and disable consumption against the old local ledgers. Do not spend concurrently from two independent meters.

`npm run credits:init -- /absolute/private/seed.json` is an explicit administrative migration using `DATABASE_URL`. The private seed contains two rows named `original` and `agent`, each with `cap_micros`, `reserved_micros` and `requests`. Existing consumption cannot be reset or a cap enlarged by repeating initialization. The application never creates or seeds a missing table on startup.

Every provider request atomically reserves its conservative maximum in PostgreSQL before transmission. The SQL update succeeds only within both the configured and stored allowance. A missing, expired or inaccessible database blocks new inference; saved runs and the simulator stay available. A visitor can initiate at most three new inference actions per session. Clearing cookies is not a budget bypass because the total database allowance is shared.

Render Free PostgreSQL expires after 30 days. Arrange an authorized durable replacement before expiry if inference must remain available longer; never recreate an empty ledger as a way to restore credit. Free service sleep can interrupt an in-progress action, whose reservation is retained rather than silently retried.

## Verification

Run `npm ci --ignore-scripts && npm test`. Unit tests cover ledger failure, out-of-order replies and no-reset migration. They do not substitute for an actual PostgreSQL concurrency check and a bounded deployed provider request before claiming that public inference works.

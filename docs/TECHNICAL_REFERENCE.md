# SWITCH technical reference

## Try the complete rehearsal

1. Choose **Start a guided case**. This opens an authored fictional case without making an AI request or deleting earlier branches.
2. Read the reports. T07's last position is inside R2; two messages disagree about clearance. A stale position does not prove exit.
3. Ask Meta to test alternatives, or inspect the labelled actual saved run. Meta reads the original reports through a tool, requests wait/bypass/immediate-entry tests from the independent engine and receives their results before proposing a plan.
4. Rehearse a feasible option. **Who occupies each section** draws the actual reservation intervals, with the same branch and clock as the3D view. Click an interval to seek that moment. The T07 interval is marked as assumed clearance. Adjustments remain explicit scenario assumptions.
5. Use the camera, follow T12, expand the model or rewind. **Receive maintenance notice** adds S4 and closes R5. The prior bypass stays in history; the new evidence invalidates it. A new Meta run must test its proposal again.
6. The other missions cover a closed alternative, confirmed clearance with opposing trains, and the evolving incident. Historical branches retain their old sources/assumptions and are visibly labelled.

Original Spanish evidence bytes and hashes remain unchanged. English report presentation and bilingual model conclusions do not rewrite those originals. Export includes rehearsals and their sources. The added occupancy view presents existing engine outputs; it is not a second planner or an operational timetable.

## Explore real Spain

The **Real network** tab contains60,018 IGN cartographic links,55,300 derived nodes and3,606 station nodes. Choose stations and gauge, inspect sections and compare hypothetical closures. The initial Madrid Atocha–Sevilla geometry is473.7km, not a journey-time or service promise.

Two fixed-origin public Renfe JSON feeds share a20-second server cache. The browser checks every20seconds while the network view is visible. Observed coordinates, timestamps, old/empty/unavailable feeds and coverage are exposed. Train positions are never extrapolated. Known source1435mm geometry has its own legend; published positions can be framed together. Renfe does not supply every operator or every train in Spain.

**Ask SWITCH** uses four constrained tool phases for route inquiries:

1. inspect_network reads real geometry, hypothetical conditions and dated public observations.
2. test_geographic_routes executes the current and one counterfactual geographic scenario.
3. draft_scenario_alert creates a bilingual review draft tied to a consumed counterfactual test, with fixed exercise-only scope and no operational delivery.
4. present_exploration selects a tested map preview. Keeping a closure as a hypothesis is a separate user action.

Observation inquiries examine actual timestamps. When a train is selected, the agent receives that exact published observation and its final highlight is restricted to the same identifier; a missing selection is rejected before inference. Source snapshots remain dated and separate from refreshed live points. Three replay controls select applicable actual saved runs without inference. Source/tool replay rejects changed snapshots or results.

The graph connects exactly matching XY endpoints, uses original segment distances and exposes station offsets. It does not establish signalling, occupancy, operating status, permitted turns, electrification compatibility or movement authority. The fictional3D cases have their own independent network and declared abstract travel times.

## What is real Meta output

Muse Spark Open is called through Baseten's fixed Chat Completions endpoint. A clean checkout includes three actual guided readings, seven fictional tool-agent runs, four geographic reviews and six interactive national explorations. These are visibly saved and replay-verified, not presented as new calls.

The latest national route/alert development run used four requests/four tools in3.582s. The selected-train check used two requests/two tools in3.161s. A prior malformed response was rejected and never applied, with its credit reservation retained. These are observed authored development cases, not a held-out accuracy benchmark or latency guarantee.

New inference starts only through explicit controls. Opening pages, selecting missions, moving/scrubbing the model, updating Renfe, inspecting occupancy and replaying saved results never call Meta. Failures keep their reservations and are not silently retried. Cancellation, scenario hashes and revision checks prevent late results being applied to a changed case. Internal reasoning and raw provider transport are not retained.

## Credentials and credit limits

The server alone reads BASETEN_API_KEY. The tool agents additionally require SWITCH_AGENT_ALLOW_CREDIT_USAGE=1, SWITCH_AGENT_CREDIT_BUDGET_USD and SWITCH_AGENT_CREDIT_LEDGER_FILE. The additional ledger is private, version1, with capMicros up to4,000,000, reservedMicros and requests. Every provider request reserves conservatively before network access; failed or uncertain requests keep the reservation.

The original guided adapter retains a separate1USD ledger and COUNTERCHECK configuration. The authorized development ceiling is5USD of granted credits combined:1USD original plus4USD additional. Never reset ledgers to restore allowance. Reservations are not provider invoices. No credential, ledger or private session belongs in source control or this package. Node's --env-file flag can supply a private local configuration.

The national agent permits at most four rounds/90seconds with3072 output tokens per request. The fictional agent permits six rounds/twelve tools/180seconds. Neither can operate real trains or send an operational alarm.

## Verify

```sh
npm test
```

70 tests cover scenario constraints, opposing/following reservations, evolving evidence, preserved branches, exact/newest citations, bounded actual tool consumption, budgets/concurrency, cancellation, stale responses, public-feed normalization, tampered saved output, occupancy-to-engine identity, independent pages and zero-inference navigation. Fixtures do not spend credits. The clean extracted review package runs without credentials.

## Story and media

The accidents at Adamuz on18January2026 and Urda on28October2026 motivated the project. Dated official balances record46 and69 deaths respectively. The injury figures retain their separate source dates. The context map places approximate accident areas from documented kilometre points interpolated along IGN geometry, not municipal centres or surveyed impact coordinates. See public/data/incident-context.json.

The story opens with “Everyone should make it home”, then the115 lives, injuries and families, then the dated46/69 balances and documentary media, then the geography and actual product. It does not lead with a simulator promotion. Both accidents have aligned visual treatment without ordinal numbers. No generated disaster images are used.

## Published train observations

Open /simulator#network. Search the published list by train identifier or reported stop, inspect the timestamp and choose a point on the real map. The console has separate Trains, Meta and Scenario panes, with a focus view for the map. Watch pins are local to this browser. Follow a train chooses a recent individually timestamped observation. Follow updates recentres only when the upstream source supplies a new position, retaining zoom. Its trail contains at most20 received source points from the last15minutes; it never interpolates motion. Source filters distinguish Cercanías/Rodalies from AV/LD/MD. Feed timestamps and individual vehicle timestamps stay distinct. Missing or empty sources do not mean no trains are running.

The source selector offers the current feed and five actual observations retained from1November. Archived observations are labelled NOT CURRENT with their dates. Selecting one draws a separate historical marker; live watch/follow controls are disabled in that mode. This is a reproducible real-source example when today's feeds are empty, not fabricated current telemetry. A current observation can prefill a Meta question; pressing the actual inference button remains a separate action.



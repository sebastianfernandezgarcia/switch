# SWITCH: an instrument for uncertainty

The product is a fictional rail rehearsal, with a working scenario engine and separately attributed Meta interpretation. The user should understand an incident by manipulating one network, rather than reading a dashboard.

## Visual direction

Porcelain #F4F6F8, paper #FFFFFF, ink #162431, steel #71808D, signal blue #225CF4 and uncertainty amber #BB661D. Blue identifies a selected path; amber means unresolved information. Color is always paired with words and line patterns.

Use the system sans serif deliberately: large, tight, quiet headlines; tabular time values; readable body text. No decorative uppercase eyebrows, repeated cards, neon particles or fabricated telemetry. The one signature element is the raised railway diagram, with paths and uncertainty drawn directly on it.

Desktop layout: a narrow top bar, a large landscape network, a compact incident rail on the right when needed, and a transport/timeline along the bottom. Comparison opens as two inline plan rows with a shared assumption control. Narrow screens keep the entire schematic visible and move explanation below it.

The first sketch considered a dark control room with green accents. It was rejected because it repeats COUNTERCHECK's generic dark/lime treatment. This prototype uses a pale instrument surface and changes geometry, focus and available controls in response to actions. Motion explains a selected timeline state; it does not claim live telemetry.

## Interaction contract

Start with the network before the incident. Introduce contradictory reports. Meta identifies the missing confirmation and proposes a focus and two strategies. A deterministic scenario engine evaluates these strategies. The user can reject an impossible shortcut, compare branches, change the assumed clearance time, scrub and rewind.

The scenario is fictional and uses declared abstract travel times, not real signalling or braking models. Originals and API credentials stay outside the frontend. Recorded Meta output is labelled as recorded; new analysis is always explicit and never triggered by a slider.

## Review units

1. Scenario model plus constraint tests. Rollback: remove switch/src/domain.mjs and its tests; COUNTERCHECK is unaffected.
2. Private Meta adapter and local HTTP service plus boundary tests. Rollback: remove switch/src/meta.mjs and server.mjs; no changes to the shared ledger module or private key file.
3. Interactive network and browser QA. Rollback: remove switch/public/; other candidates and original evidence remain intact.

Runtime evidence and verification results are recorded in the prototype receipt when the browser walkthrough is completed.

## Revision 2: understand the purpose before touching a control

The accepted light instrument surface stays. A purpose line and three-step guide explain the job. Every case starts with a concrete question. The long Meta interpretation stays behind a disclosure; sources, next question and comparison remain primary. The origin story follows the instrument, with official context separated from the invented cases.

Three cases have distinct constraints: missing clearance, closed bypass, and clearance confirmed inside the exercise. The user cannot reopen a maintenance-closed edge by ignoring its report. Route times and delays are local calculations. Actual recorded inference stays labelled as recorded.

### Review units and rollback

1. Case isolation: domain/Meta/HTTP changes plus tests. Branches store their case. Reverting this unit requires the pre-v2 session as well as pre-v2 source; do not load a three-case session into the old service. The backup is outside the source package.
2. Clearer interaction and origin: public HTML/CSS/JS and browser QA. This can be revised separately from scenario math. Preserve original reports and recorded responses. Desktop 1440×900 and mobile 390×844 were reviewed; cases, closure, confirmed access, playback, history and export were exercised in the real app.
3. Portable evidence: copied original budget module, validated recording loader, three actual recordings and recording tests. No private key/ledger is copied or reset. Clean installations run without a key.

Verification: `npm test`, 28 passed. The real maintenance and confirmed-clearance cases completed in 2,195 and 1,954 milliseconds. Observed durations, not a performance guarantee. Detailed proof and accounting are in the separate delivery receipt.

## Revision 3: an editorial journey into the working instrument

Sebastián explicitly requests a more ambitious, visual scrollytelling website situated in the Spanish context. The entry now uses a real licensed archive photograph, a quiet geographical chapter and a pinned diagram that changes as the reader encounters position, contradiction, evidence and consequences. Georgia display type, warm paper, deep railway ink and bronze accents distinguish the narrative from the retained light simulation instrument.

The archive image is identified as Atocha 2006. Official dates and context stay separate from fictional data. The municipality map does not plot a railway or precise accident sites. No cause, casualty count, prevented accident or professional safety capability is inferred from the visuals.

The canonical case 01 snapshot is independent of the currently selected case. The story's Meta question is read from a saved actual response, with provenance visible. Comparison figures come from the existing engine. User choices call the existing versioned actions to create an actual branch and start its replay. They do not call Baseten. A failed transition reports failure without fabricating a branch or model output.

Review units: (1) canonical read-only snapshot and explicit asset routes with two HTTP tests; (2) narrative HTML/CSS/JS plus browser walkthrough; (3) licensed media, public credits and standalone packaging. Rollback restores the pre-scrolly source snapshot and removes the narrative assets together. Session format, scenario math, Meta recordings and private credit ledger are unchanged; valid branches created through the new entry remain ordinary compatible branches.

This is a presentation and navigation upgrade. The previously proposed evolving incident engine, independent Meta interpretation task and held-out evaluation are still future work. It does not turn the existing guided API examples into independent reasoning evidence.

## Revision 4: evidence changes; the plan must change with it

This revision supersedes revision 3's warm/serif direction. The current system is white/charcoal, Hanken Grotesk variable type and saturated red/plum/green accents. A persistent light/dark switch applies to story and instrument. There are no pastel or bronze surfaces. The sober opening uses an actual licensed emergency-response photograph, with precise date/depiction and dated official context; the old Atocha image is retired.

S4 is received through a revisioned action. It transitions case 01 to a version-2 evidence snapshot, closes R5, stops playback and invalidates prior branches for current evidence without mutating their original simulations. Opening one of those branches preserves the current closure and clearly labels the replay as historical. Its clock/network use its old snapshot; the current source/decision panel keeps the latest evidence.

The new agent no longer receives the expected clearance verdict or closed-edge answer. It reads original reports through a tool, requests each actual engine test and receives the outputs before finalizing. A state gate permits the final tool only after all reports and three tests have been consumed. The final validator requires exact, read citations including the newest report, actual test IDs and a feasible tested recommendation. These checks validate provenance and declared-model consistency; they do not validate all prose claims or establish professional railway safety.

Original guided responses and source hashes remain intact. Three new successful real tool runs are packaged separately and replay-verified. Opening a saved run makes no API call. New inference is explicit, bounded and fail-closed, with a separate additional 4 USD credit ledger authorized by the user on 1 November. The original 1 USD ledger is unchanged. No local model is loaded.

Review units: temporal domain/server state and its tests; bounded agent/credit ledger/recorded-tool replay and their tests; visual system/media licenses/browser walkthrough. The pre-v4 source and private state are preserved outside the distributable ZIP. Restoring older code requires its matching state snapshot; do not overwrite current evidence to undo a visual change.

Live development results cover three authored conditions, not held-out evaluation. Professional validation, international presentation/video, hosted demo/public repository and final eligibility/submission remain separate completion gates.

## Revision 5: an inhabited model, not a dashboard

The current entry is a split composition: the human reason for building SWITCH and the actual code-authored spatial corridor. White/charcoal, restrained saturated accents and local Hanken Grotesk remain. The licensed Urda emergency-response photograph is deliberately labelled as real context; its cropped, reduced-saturation treatment is attributed and the fictional maquette never pretends to reconstruct that accident.

English is the default. EN/ES selectors translate authored interface/report presentation and select model-provided bilingual conclusions. Spanish report bytes and exact evidence quotes remain unchanged, with original reports available under disclosures. Language, theme and camera do not mutate engine revision, evidence hash or simulation time and never call an API. Older original Spanish outputs remain in history, with provenance intact.

Three.js 0.186.0 and OrbitControls are served locally. The renderer receives the same placed-train coordinates as the SVG map, not a second timetable. It has no planning authority or provider calls. A capped orthographic renderer provides orbit, track focus, top view, follow T12, bounded zoom and an inline branch slider. Off-screen/hidden scenes stop rendering; reduced motion removes camera tweening. The latest closed edge and the dashed previous-plan overlay are separately visible. WebGL failure routes the instrument to 2D.

New live Meta output is bilingual in one inference. The agent sees only the tools available in its current phase, so repeated reads cannot consume every round. Six rounds/twelve tools/180s and the existing 4 USD additional ledger cap remain. The output allowance is 4096 tokens; actual and failed responses keep their prior reservations. Four new actual bilingual runs cover all cases and are packaged alongside the original three tool runs. All are replay-verified locally on a clean install. These development cases are not a held-out evaluation or professional validation.

Review units: local Three vendor/provenance and model-to-renderer binding; bilingual presentation/source preservation; bounded bilingual tool-agent/output validation with recordings/tests. No change to the rail scenario engine or original source hashes. Pre-v5 source and private state are preserved outside the distributable. Automated verification: 44 passing tests. Real desktop/mobile, EN/ES, light/dark, time scrubbing and new-notice comparisons were exercised through the running app. Public hosting, repository, narrated video, eligibility and final submission remain distinct pending gates.

## Revision 6: national context with genuine data boundaries

The primary opening now leads to the national map, with real IGN geometry, not a larger fictional diagram. The official photograph depicts a damaged train in Adamuz and carries its publication date and place. The separate Urda casualty figure is static red, dated and sourced. No invented wreckage, death counter animation or common-cause assertion.

The map is code-rendered Canvas2D, with actual country polygons and60,018 IGN geometries. It supports pan, bounded zoom, mainland/all-Spain framing, station choice, gauge filtering, vehicle and track inspection, and closure comparison. Pathfinding uses original segment lengths and matching XY endpoints. Vertical source inconsistencies are documented; the result is expressly geographic, not permitted operational topology. No additional geometric bridges are invented. Station offsets remain visible.

Public Renfe feeds are normalized through a fixed-origin server adapter with size bounds, deduplication, shared30s cache, concurrency sharing and stale/error provenance. Points stay at supplied coordinates. No extrapolation, invented trains or all-operator claim. Missing station names use stable source identifiers.

The national Meta task reviews independently computed before/after results, separately from the existing fictional tool-agent. It reserves one1200-output-token call against the existing authorized ledger, verifies bilingual structured output and source IDs, retains failures without automatic retries, and discards late UI results after the conditions change. Four actual reviews are packaged with geometry/source/condition replay verification. This does not make their prose professionally validated.

Review order: source/derivation and topology limits; independent geographic routing and closure validation; public-feed freshness handling; Meta review/provenance; accessible national UI and unchanged local3D flow. Previous source/state and all authored cases/branches remain recoverable.54 automated tests pass; real browser QA and package verification are recorded separately.

## Revision7: the map stays alive; the model waits for a question

Renfe observation refresh remains a shared30-second public-data operation. It is independent of model inference. Navigation, refresh, map controls, typing, suggestion selection and recorded replays never start Meta. An explicit **Explore with Meta** action is required by both client and server. Source and progress reads cannot start an agent.

**Ask SWITCH** has two constrained paths. A route inquiry reads source context, tests current and counterfactual geometry in a batch, then chooses a real tested preview. An observation inquiry examines supplied timestamps and can highlight a real candidate, or return an overview when there are none. The visitor sees completed tools, the bilingual conclusion and the map action. Internal model reasoning is neither displayed nor retained. A preview cannot alter the ordinary scenario until the person explicitly keeps it as a hypothesis. Changing conditions invalidates a late response; cancellation discards a late proposal.

The map remains the main visual surface. Route previews keep the baseline dashed. A historical observation is a separately drawn, dated, dashed plum marker; automatic public refresh cannot turn it into a current live position. On mobile, the explicit map-preview action brings the map into view. Saved real agent runs are separately labelled and source/tool-replay-verified, including timestamps. They remain usable without credentials.

Valid GTFS feeds may omit an empty entity array. A dated header-only feed is now correctly classified as empty rather than unavailable; malformed payloads still fail. Zero published positions is not a claim that no trains operate in Spain. The original fictional scenario engine, branches and evidence remain independent and preserved.

Review units: explicit-only bounded agent/HTTP cancellation and source validation; map overlays and bilingual responsive interaction; replayable actual evidence and independent no-inference regression. Pre-v7 source/private session remains outside the distributable package. The four-round/90s limit uses the existing authorized credit cap; no local model or paid tile service is introduced.


## Revision8: one corridor, visible tool use and reviewable alerts

The opening now pairs two genuine scenes: the retained official Adamuz photograph and the officially embeddable RTVE report from Urda. Its provider-owned cover is not downloaded, altered or redistributed. The local content policy adds only the required RTVE frame origin; scripts, connections and credentials remain server/local-bound. No autoplay, generated wreckage or animated death counter. Dates, source balances and the283-day interval are explicit. The removed municipality illustration and long context caveats are replaced by a real IGN corridor view, with accident-area positions derived from reported chainage and precision documentation behind a disclosure.

A short three-step product explanation connects the story to the instrument. The map keeps all60,018 source links visible, highlights known1435mm geometry, labels real observed trains at useful zoom levels and offers framing of available public observations. It never animates a published GPS point into a predicted train position. The invented3D maquette now adds catenary and state-linked model signal lights while keeping the same train positions, clock, route engine and case evidence.

The national agent's fourth step is draft_scenario_alert. It can reference only a consumed counterfactual graph test, retains bilingual text and fixed exercise-only scope, and cannot send to an operator or train. The UI shows the underlying tests and a local review acknowledgment. Raw section identifiers remain in the evidence receipt; ordinary prose labels the tested section for readability. Existing recordings remain unchanged and continue to replay. One new actual four-request run is packaged with its exact tool results. Four rounds/90s and the existing combined5USD grant ceiling are unchanged.

The real-data explorer and the invented training scene remain distinct. The product's contribution is a transparent rehearsal and decision-support workflow; operational integrations and railway-professional evaluation are future work. No new public deployment, account terms or submission is authorized by this visual revision.

## Revision9: a product website and a dedicated workspace

The website introduces the product with a capture of the actual3D application and a clear entry action. The origin chapter is chronological, unnumbered and gives equal visual weight to Adamuz and Urda, including their dated official balances, injuries and human consequences. The Urda response photograph has no editorial overlay; original Spanish RTVE footage is behind a clearly labelled source dialog, with its player unaltered. Every page shares the same mark, type, accents, language and theme controls.

The simulator now has its own /simulator route and two explicit modes: fictional3D rehearsal and real geographic/observation exploration. The homepage no longer imports the stateful simulator or Three.js. Its geographic context is lazy-loaded. The real-data module loads when its workspace tab is selected. Legacy hash entry points route to the new workspace. Duplicate real/exercise network IDs have been separated.

Four mission controls introduce existing authored constraints; they do not invent new operating rules. A read-only occupancy projection draws exact existing engine reservation intervals, including clipped pre-start T07 occupancy labelled as assumed clearance. Its cursor and the3D positions share one clock. Clicking an interval seeks the same branch; no second simulation or model call is created. Current source reports stay alongside the chart, with the newest open. Empty selection offers actual feasible engine options before a branch is created. Historical branches remain labelled and preserved.

Focus mode enlarges the same live3D renderer and retains playback/camera controls. It is also the source of the homepage's actual product capture. No photorealistic mockup is substituted for the running product. Read-only workspace context, mission actions and clock events are narrow presentation bindings over the existing versioned API. The domain engine, original evidence and credit adapters remain unchanged.

Review units: independent page routing and shared shell; immutable occupancy projection and clock binding; mission/evidence interface and focus layout; source/branding/media presentation. Pre-v9 source and private state remain recoverable outside the distributable. Fresh Meta still requires an explicit existing button and the unchanged authorized credit ledger.

## Revision10: people before the product

The user's correction restores the established “Everyone should make it home” opening. One centred typographic hierarchy and consistent1240px maximum content alignment replace the rejected asymmetric product hero. The narrative order is people,115 lives, families and injuries,46/69 dated losses with real documentary imagery, real corridor, personal contribution, working instrument and inspectable Meta steps. Product screenshots and simulator actions are secondary to the origin. The English homepage contains no Spanish news headline; source playback remains an explicitly original-Spanish surface. Urda's external reference still has unresolved public reuse rights, so this is a local review build, not a publication-ready media clearance. The static image itself is not downloaded, altered or bundled.

The real-network workspace adds a transport index: searchable observations, timestamps, watch pins, follow on published updates and a clear recorded/current source selector. Recorded points cannot become live markers or enable follow. Route rehearsal is a disclosure, keeping the observation index and Meta visible. Source-backed timestamp classification and filtering are pure projections, not another telemetry engine. No public Vía Libre UI could be inspected because its official URL redirected to Wikipedia; no third-party UI/code, identity or assets were copied.

The domain engine, earlier branches, original evidence and Meta tool contracts are unchanged. No new inference, own-money spend, deployment or submission is part of this revision.


## Revision11: live observations and inspectable Meta work

The accepted human-first homepage and photographs remain. The real workspace becomes a single map-led console with Trains, Meta and Scenario panes, restrained typography, a focus mode, readable label collision management and compact provenance. Recent individually timestamped observations are plum; older observations are grey, with words and dates retaining the distinction. Mobile stacks the same working controls without horizontal overflow. The3D focus view uses actual viewport height and a wider orthographic span on narrow screens so its five station labels fit.

Renfe refresh uses a shared20-second cache and visible-view poll, independently of Meta. Follow chooses a recent individually dated point, preserves zoom and recentres only when a newer source coordinate arrives. Trails store received points in timestamp order, bounded to20 points/15minutes, rejecting duplicate, backwards and future samples. No position or motion is extrapolated. Live follow was positively verified on C3-27072: new source coordinates and timestamps, exact camera recentering and unchanged zoom.

Meta has a task-specific visible contract. Selected-train review receives only that exact supplied observation and must highlight the same key. The server rejects a vanished selection before paid work; its final schema cannot switch to another train or an overview. Geographic review still consumes actual engine results before proposing a view and drafting a local exercise alert. One invalid response was rejected without applying it; two subsequent real runs completed, selected-train2calls/2tools/3.161s and route-alert4calls/4tools/3.582s. Both are packaged as dated replayable real runs, retaining the earlier four unchanged. Replaying them or refreshing observations makes no inference.

70automated tests pass. Browser checks include live movement/follow with identical zoom, current/archive separation, both Meta task views, real route tests, EN/ES and light/dark, desktop1280×720 and measured mobile390×844, plus the corrected mobile3D framing. These are development checks, not professional railway validation or an accuracy benchmark. Session and original domain/evidence remain unchanged. The original1USD and additional4USD ledgers retain conservative reservations, including failures; no own-money spend or local model is introduced.

The delivery contains a290-word narration and a180-second real-product shot plan. It is ready for the user's voice; capture/edit/subtitles and final public delivery remain subsequent work. The photographic direction is treated as accepted by the user. No photograph or rights evidence was changed in this revision.

# SWITCH

**Everyone should make it home.**

SWITCH is an experimental railway decision-rehearsal tool. It combines real Spanish railway geography and dated public train observations with a separate fictional 3D exercise. Meta Muse Spark Open reads evidence, asks an independent engine to test alternatives and proposes a source-linked plan or rehearsal alert for a person to review.

The fatal accidents at Adamuz and Urda motivated this personal project. Their human consequences come first; SWITCH does not reconstruct their causes or claim a proven safety outcome.

## Run it

Use Node 20.16 or later. The application has no npm dependencies, no required local model and no paid map service.

```sh
npm test
npm start
```

Open **http://127.0.0.1:4352/**. The story is followed by a separate workspace at **/simulator**, with **3D rehearsal** and **Real network** views. English and Spanish, light and dark themes are available.

A clean checkout works without an API key: simulation, live Renfe refresh and explicitly labelled saved actual Meta runs remain usable. A saved run is replay-verified against its sources and engine results; it is never presented as a new inference. New model requests require private server-side configuration and an authorized credit ledger.

## A two-minute walkthrough

1. Open **Real network**, select a published observation and inspect its source and timestamp. Follow waits for a new received point; motion is not extrapolated.
2. Inspect a labelled saved train review or route exploration. Meta consumes actual source/tool results, including the original route and a hypothetical closure. The resulting alert is an exercise draft, not a message sent to a railway operator.
3. Open **3D rehearsal** and start a guided case. Two reports disagree about whether a section is clear. Compare waiting with another route and inspect the evidence behind the proposal.
4. Receive the maintenance notice: it closes the bypass. The earlier branch remains in history while the current proposal must be tested against the new evidence.

Opening pages, selecting trains, simulating, rewinding, inspecting evidence and updating Renfe do not call Meta. New inference starts only through an explicit request. The real geography and invented training network remain separate.

## What was built

The bilingual story and workspace, four fictional missions, versioned scenario engine, linked 3D and occupancy timeline, national geographic graph, dated Renfe adapters, constrained Meta tools and inspectable/replay-verified model records were developed for the event. Original work is MIT; third-party assets retain their licences.

The repository includes 70 automated tests and actual model/tool examples. Development examples are not a held-out accuracy benchmark or a railway-professional validation. A complete three-minute demo film has been prepared; its accessible link will be added after authorized publication.

## Scope and deployment

This checkout is a local application. **Do not expose its local server or copy a private API key into a browser or public repository.** A shared public service needs individual visitor sessions, an explicitly configured external origin and a durable credit limiter. Render Free storage resets on restart, so the local JSON credit ledger must not be used there as a persistent spending cap.

The public demonstration is being prepared separately. No live-hosting URL or submitted-candidature status is claimed here. See [deployment notes](docs/DEPLOYMENT.md).

The geographic view contains 60,018 IGN links and 3,606 station nodes. Renfe observations have limited coverage and expose source dates, stale points and missing feeds. Geographic connectivity is not movement authority or proof that track is available. The fictional engine has declared abstract rules and travel times.

## Evidence and credits

- [Technical detail and real Meta integration](docs/TECHNICAL_REFERENCE.md)
- [Media, fonts, software and data licences](ASSET_LICENSES.md)
- [Original code licence](LICENSE)

Data: **Obra derivada de IGR-RT 2026 CC-BY 4.0 scne.es. Origen de los datos: Renfe Operadora.** Natural Earth basemap is public domain. Adamuz uses the documented Defensa/UME image. Urda is shown through the official RTVE player. No AFP still or RTVE footage is distributed as a source asset.

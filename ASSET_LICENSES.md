# Media sources

Original code is MIT (LICENSE). Media and fonts keep their own licenses.

## Current opening: adamuz-ume-defensa-2026-01-21.jpg

- Official publisher: Ministerio de Defensa / Unidad Militar de Emergencias (UME). No individual photographer is identified.
- Depicts a damaged train carriage and responders in Adamuz, Córdoba, after the accident of 18 January 2026. No recognizable victims are visible. **This is not Urda.**
- Publication date: 21 January 2026. Exact camera capture date is unverified.
- Source: https://www.defensa.gob.es/comun/slider/2026/01/260121-ume-accidente-adamuz.html
- Reuse terms: https://www.defensa.gob.es/comun/avisoLegal.html , section REUTILIZACIÓN DE LA INFORMACIÓN DEL SECTOR PÚBLICO. The explicit permission covers commercial/noncommercial image reuse, reproduction and adaptation, requiring source/date, faithful meaning and no implied endorsement.
- Original 650×350 JPEG retained byte-for-byte, including metadata. CSS crops its presentation; no generated content or invented detail. SHA256 d229a484763b4c55a7d10ed90c3a257630114baa8b42a75bc68ff5bcee893248.
- Source/date and reuse link are visible in the caption/footer. The Urda death toll is separately identified as Urda and dated; it is not attributed to this photograph or presented as a combined count.

## Real rail cartography and observations

- IGN/CNIG IGR-RT, national geographic reference data: https://datos.gob.es/es/catalogo/e0dat0002-redes-de-transporte-de-espana1
- Geometry: https://api-features.idee.es/collections/railwaylink ; stations: https://api-features.idee.es/collections/railwaystationnode
- Required attribution retained: **Obra derivada de IGR-RT 2026 CC-BY 4.0 scne.es**. Terms: https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf
- Snapshot 1 November 2026: 60018 links, 55300 plan-view endpoint nodes, 3606 station nodes. Source geometry simplified at 15m tolerance with endpoints retained; distances use original unsimplified coordinates. Full derivation, source coverage, dates and counts are embedded in rail-network.json.
- Reproduction script: tools/build_ign_assets.py (Python standard library). It downloads the pinned source pages into ignored .cache/ign-source-pages, up to250MB; it is not run by starting the app. A refreshed source requires reviewing expected counts, connectivity and recorded Meta evidence.
- Live positions: Renfe Operadora, https://data.renfe.com/dataset/ubicacion-vehiculos and https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md . CC BY4.0. **Origen de los datos: Renfe Operadora.**
- Only published Renfe observations are represented. Timestamps, missing feeds and stale positions are exposed; markers are never extrapolated to pretend movement. No all-operator coverage, track-clearance or operating status is claimed.
- Country basemap: original Natural Earth country geometries filtered to Spain and neighbors; public domain, https://www.naturalearthdata.com/about/terms-of-use/ .

## Retained previous photograph: urda-incident.jpg

- Photo: David Esteban González, credited D. Esteban González / JCCM.
- Capture: 29 October 2026, emergency-response site at Urda, Toledo. It depicts responders and officials beside the 112 command vehicle and tents. It does not show the collision, damaged trains or casualties.
- Official source account: Emiliano García-Page Sánchez, https://www.flickr.com/photos/emilianogarciapage/55618106902/
- Verified Commons file: https://commons.wikimedia.org/wiki/File:Visita_a_la_zona_del_accidente_ferroviario_de_Urda_(Toledo)_-_55618106902.jpg
- License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
- The included 1920-pixel Commons derivative is unchanged. CSS crops and reduces saturation for presentation. This photo adaptation remains CC BY-SA 4.0; the website's MIT code license does not relicense the photo.
- Required author/source/license/change notice appear in the public caption/footer. No endorsement by the photographer, public administration or railway operators is implied.
- SHA-256: 25bcef5b8a035ae7253c401f9a38823392acfb0e43f3e92bc29e5b87485d181d.

The Atocha 2006 archive image used in v0.3 is retired and unserved. Its original license/attribution remain with the historical review snapshot outside this package.

## spain-context.svg

- Country outlines: Natural Earth, public domain.
- Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
- Terms: https://www.naturalearthdata.com/about/terms-of-use/
- Mainland Spain and Portugal projected into SVG; municipality references/labels added. Neutral fills and red markers changed for v0.4. These are not exact accident sites or a railway alignment.

## hanken-grotesk.ttf

- Copyright 2021 The Hanken Grotesk Project Authors, https://github.com/marcologous/hanken-grotesk
- Official Google Fonts distribution: https://github.com/google/fonts/tree/main/ofl/hankengrotesk
- License: SIL Open Font License 1.1; full notice retained in public/assets/HankenGrotesk-OFL.txt and served at /assets/HankenGrotesk-OFL.txt.
- Original variable font file, unmodified, hosted locally. No paid font service or external font request.

The local 3D exercise and its diagrams remain original code-authored illustrations of a fictional network. The national map instead uses the attributed real geometry above. Red/plum/green are visual references, not an official brand identity, affiliation or endorsement.

## Three.js and OrbitControls

- Three.js 0.186.0, https://github.com/mrdoob/three.js/tree/r186
- Source: official npm tarball https://registry.npmjs.org/three/-/three-0.186.0.tgz
- License: MIT, full notice retained and served at /vendor/three-LICENSE.txt.
- three.module.js and three.core.js are unchanged. OrbitControls.js has only its bare `three` import changed to the local `./three.module.js`.
- No CDN requests, external 3D asset services, textures or model downloads are required. Trains, stations, sleepers and barriers are original code-authored geometry.


## Urda: official embedded RTVE report, v0.8

- Original: https://www.rtve.es/play/videos/telediario-1/busqueda-victimas-retirada-trenes-zona-cero-del-accidente-toledo/17288773/
- Official embed: https://www.rtve.es/drmn/embed/video/17288773/
- Telediario1, published29October2026,1:30; shows wreckage and recovery at Urda. The provider exposes “Ponlo en tu Web”.
- Only the official player is embedded. Its cover JPEG (credited AFP) and footage are not downloaded, rehosted or included as licensed source assets. RTVE retains control of availability, player, attribution and playback. An original-page link is provided.
- Verification receipt is outside the source package in delivery/switch-v8-2026-11-02/media/URDA_RTVE_EMBED.json.

## Incident context and approximate chainage positions, v0.8

public/data/incident-context.json records dated official balances and source URLs. The two approximate markers were interpolated on actual IGN line geometry between published kilometre posts; they are not municipal centres or surveyed impact coordinates. Source/method documentation remains inspectable in the UI. In Adamuz, PK318+693 is the reported initial derailment area; the later collision was approximately PK318+200. Urda is reported at PK118+800. IGN attribution remains CC-BY4.0scne.es. The old municipal SVG is retained as an unused historical asset, not displayed as accident-location evidence.

## v0.9 presentation

The homepage product preview, assets/switch-product-preview.png, is an actual screenshot of SWITCH's own running3D application in focus mode. It is not an AI mockup. Original application graphics/code remain MIT; the retained Three.js license is included.

The unaltered Urda emergency-response photo is credited D.Esteban González/JCCM, CC BY-SA4.0, captured29October2026. Its source is https://www.flickr.com/photos/emilianogarciapage/55618106902/ . It shows responders and officials, not wreckage. Presentation uses a CSS crop; the original source file is preserved. Revalidation receipt: delivery/switch-v9-2026-11-02/media/URDA_RESPONSE_PHOTO.json.

RTVE's official player is now inside an explicitly identified original-Spanish-source dialog, created only when requested and removed when closed. Its cover text is neither covered nor modified. No RTVE/AFP image or video is downloaded or redistributed as a standalone asset.

## v0.10 local visual review: external Urda reference

The Urda wreckage image in the local landing is served directly by RTVE:
https://img.rtve.es/v/17288773?w=1600&preview=01793259717422.jpg
It is credited on the original report to Óscar del Pozo / AFP and is labelled as such, with an adjacent original-source link. No image file has been downloaded, added to this repository, or included under the project's MIT license. Clicking it opens the unaltered official RTVE player; it does not play or call Meta automatically. No text or watermark is removed from the image.

This is an external documentary reference for the user's local visual review, not a claim of an AFP redistribution licence. Reuse/embedding rights for a public competition deployment have not been established. Before public deployment, obtain appropriate permission or replace the external still with the provider-offered official player. The approved CC BY-SA emergency-response photograph remains preserved as another fallback; it does not show wreckage. See delivery/switch-v10-2026-11-02/media/URDA_DAMAGE_PHOTO_SEARCH.json.


## Publication copy, 3 November 2026

The homepage uses the provider-offered official RTVE player for Urda. The unresolved direct AFP/RTVE still URL has been removed from the public homepage. No AFP photograph or RTVE video is downloaded, rehosted or relicensed under MIT. The original Spanish report and provider branding remain intact. The previously approved local review app is unchanged. Adamuz is credited according to Defensa reuse conditions, not an invented CC licence.

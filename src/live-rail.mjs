// Public read-only observations, never movement authority. Fixed upstream URLs.
export const RAIL_FEEDS = Object.freeze([
  { id: 'long-distance', name: 'AV / LD / MD', url: 'https://gtfsrt.renfe.com/vehicle_positions_LD.json', dataset: 'https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md' },
  { id: 'commuter', name: 'Cercanías / Rodalies', url: 'https://gtfsrt.renfe.com/vehicle_positions.json', dataset: 'https://data.renfe.com/dataset/ubicacion-vehiculos' },
]);
const MAX_BYTES = 4_000_000, FRESH_SECONDS = 90;
const short = v => String(v ?? '').slice(0, 120);
function timestamp(v, now) {
  const n = Number(v);
  return Number.isFinite(n) && n > 1_500_000_000 && n <= now / 1000 + 300 ? n : null;
}
export function normalizeFeed(document, source, now = Date.now()) {
  // Protobuf JSON omits an empty repeated entity field. A valid dated header
  // alone is an empty published feed, not a connection failure.
  const entities=document?.entity===undefined&&document?.header?.gtfsRealtimeVersion&&timestamp(document.header.timestamp,now)?[]:document?.entity;
  if (!document || !Array.isArray(entities) || entities.length > 10000) throw Error('INVALID_FEED');
  const feedTimestamp = timestamp(document.header?.timestamp, now), vehicles = new Map();
  let rejected = 0, duplicates = 0;
  for (const entity of entities) {
    const v = entity?.vehicle, p = v?.position, lat = p?.latitude, lon = p?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 27 || lat > 45 || lon < -19 || lon > 5 || !v.vehicle?.id) { rejected++; continue; }
    const key = source.id + ':' + short(v.vehicle.id);
    if (vehicles.has(key)) { duplicates++; continue; }
    vehicles.set(key, { key, id: short(v.vehicle.id), label: short(v.vehicle.label || v.vehicle.id), sourceId: source.id,
      lon, lat, tripId: short(v.trip?.tripId), nextStopId: short(v.stopId),
      currentStatus: ['STOPPED_AT', 'IN_TRANSIT_TO', 'INCOMING_AT'].includes(v.currentStatus) ? v.currentStatus : 'UNKNOWN',
      observedAt: timestamp(v.timestamp, now) ?? feedTimestamp,
      timestampBasis: timestamp(v.timestamp, now) ? 'vehicle' : 'feed',
      bearing: typeof p.bearing === 'number' && p.bearing >= 0 && p.bearing < 360 ? p.bearing : null });
  }
  return { feedTimestamp, vehicles: [...vehicles.values()], rawCount: entities.length, rejected, duplicates };
}
async function readBounded(response) {
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('FEED_UNAVAILABLE');
  if (!response.body) throw Error('FEED_UNAVAILABLE');
  let count = 0; const parts = [];
  for await (const part of response.body) { count += part.length; if (count > MAX_BYTES) throw Error('FEED_TOO_LARGE'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createLiveRailClient({ fetchImpl = fetch, now = Date.now, ttlMs = 20000 } = {}) {
  const cached = new Map(), attempts = new Map(), pending = new Map();
  async function getFeed(source) {
    if (pending.has(source.id)) return pending.get(source.id);
    if (now() - (attempts.get(source.id)?.at ?? -Infinity) < ttlMs) return;
    attempts.set(source.id, { at: now(), error: false });
    const task = (async () => {
      try {
        const response = await fetchImpl(source.url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' }, redirect: 'error' });
        cached.set(source.id, { ...normalizeFeed(await readBounded(response), source, now()), retrievedAt: new Date(now()).toISOString() });
      } catch { attempts.set(source.id, { ...attempts.get(source.id), error: true }); }
      finally { pending.delete(source.id); }
    })();
    pending.set(source.id, task); return task;
  }
  return async function liveRail() {
    await Promise.allSettled(RAIL_FEEDS.map(getFeed));
    const feeds = RAIL_FEEDS.map(source => {
      const d = cached.get(source.id), error = attempts.get(source.id)?.error ?? false;
      const ageSeconds = d?.feedTimestamp ? Math.max(0, Math.floor(now() / 1000 - d.feedTimestamp)) : null;
      return { ...source, retrievedAt: d?.retrievedAt ?? null, feedTimestamp: d?.feedTimestamp ?? null, ageSeconds,
        status: !d ? 'unavailable' : error ? 'cached' : ageSeconds === null ? 'undated' : ageSeconds > FRESH_SECONDS ? 'stale' : 'fresh',
        vehicleCount: d?.vehicles.length ?? 0, rawCount: d?.rawCount ?? 0, rejected: d?.rejected ?? 0, duplicates: d?.duplicates ?? 0 };
    });
    return { fetchedAt: new Date(now()).toISOString(), attribution: 'Origen de los datos: Renfe Operadora · CC BY 4.0',
      coverage: 'Published Renfe positions only. Not every operator or train in Spain. GPS observations do not establish track clearance.',
      refreshSeconds: ttlMs / 1000, freshnessSeconds: FRESH_SECONDS, feeds,
      vehicles: feeds.flatMap(f => (cached.get(f.id)?.vehicles ?? []).map(v => ({ ...v,
        feedStatus: f.status === 'fresh' && v.observedAt && now() / 1000 - v.observedAt > FRESH_SECONDS ? 'stale' : f.status }))) };
  };
}

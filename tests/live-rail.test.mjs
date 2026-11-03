import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveRailClient, normalizeFeed, RAIL_FEEDS } from '../src/live-rail.mjs';
const at = Date.parse('2026-11-01T23:00:00Z');
const feed = { header: { timestamp: String(at / 1000) }, entity: [{ vehicle: { vehicle: { id: '123', label: '<train>' }, position: { latitude: 40.4, longitude: -3.7 }, currentStatus: 'IN_TRANSIT_TO' } }] };
test('observations preserve public coordinates, deduplicate vehicles and reject malformed positions', () => {
  const d = structuredClone(feed); d.entity.push(d.entity[0], { vehicle: { vehicle: { id: 'bad' }, position: { latitude: 100, longitude: 0 } } });
  const v = normalizeFeed(d, RAIL_FEEDS[0], at);
  assert.equal(v.vehicles.length, 1); assert.equal(v.duplicates, 1); assert.equal(v.rejected, 1);
  assert.equal(v.vehicles[0].lon, -3.7); assert.equal(v.vehicles[0].timestampBasis, 'feed');
  assert.equal(v.vehicles[0].label, '<train>'); // Rendering must use text, not HTML.
  assert.equal(v.vehicles[0].bearing, null);
});
test('concurrent live reads share one bounded request per feed; stale and cached observations never become fresh', async () => {
  let calls = 0, time = at, fail = false;
  const client = createLiveRailClient({ now: () => time, fetchImpl: async () => { calls++; if (fail) throw Error(); return new Response(JSON.stringify(feed)); } });
  const [a, b] = await Promise.all([client(), client()]);
  assert.equal(calls, 2); assert.equal(a.feeds[0].status, 'fresh'); assert.equal(b.vehicles.length, 2);
  time += 100000; const c = await client(); assert.equal(c.feeds[0].status, 'stale');
  time += 31000; fail = true; const d = await client();
  assert.equal(d.feeds[0].status, 'cached'); assert.equal(d.feeds[0].feedTimestamp, at / 1000);
  assert.equal(d.vehicles[0].lon, -3.7);
});
test('unavailable feeds never manufacture train positions or timestamps', async () => {
  const client = createLiveRailClient({ fetchImpl: async () => new Response('bad', { status: 503 }), now: () => at });
  const d = await client(); assert.deepEqual(d.vehicles, []); assert.ok(d.feeds.every(f => f.status === 'unavailable' && f.feedTimestamp === null));
});
test('a valid header-only GTFS feed is fresh and empty, not unavailable or fabricated', async()=>{
  const empty={header:{gtfsRealtimeVersion:'2.0',timestamp:String(at/1000)}};
  const client=createLiveRailClient({fetchImpl:async()=>new Response(JSON.stringify(empty)),now:()=>at});
  const d=await client();assert.equal(d.feeds[0].status,'fresh');assert.equal(d.feeds[0].vehicleCount,0);assert.deepEqual(d.vehicles,[]);
  assert.throws(()=>normalizeFeed({error:'upstream failure'},RAIL_FEEDS[0],at),/INVALID_FEED/);
});

test('a recent feed cannot make an old vehicle observation look fresh', async () => {
  const old=structuredClone(feed);old.entity[0].vehicle.timestamp=String(at/1000-400);
  const client=createLiveRailClient({now:()=>at,fetchImpl:async()=>new Response(JSON.stringify(old))});
  const d=await client();assert.equal(d.feeds[0].status,'fresh');assert.equal(d.vehicles[0].feedStatus,'stale');assert.equal(d.vehicles[0].timestampBasis,'vehicle');
});

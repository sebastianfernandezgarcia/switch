import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startPublicServer } from '../src/public-server.mjs';

async function fixture(t, options = {}) {
  const server = await startPublicServer({ port: 0, host: '127.0.0.1', env: {}, liveRail: async () => ({ feeds: [], observations: [] }), ...options });
  t.after(() => server.shutdown());
  return `http://127.0.0.1:${server.address().port}`;
}
test('public visitors cannot overwrite or export another visitor rehearsal', async t => {
  const base = await fixture(t);
  const first = await fetch(base + '/api/state');
  const cookieA = first.headers.get('set-cookie').split(';')[0], a = await first.json();
  const second = await fetch(base + '/api/state');
  const cookieB = second.headers.get('set-cookie').split(';')[0], b = await second.json();
  assert.notEqual(a.session.id, b.session.id);
  const changed = await fetch(base + '/api/action', { method: 'POST', headers: { Origin: base, Cookie: cookieA, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: a.session.revision, action: 'incident' }) });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).session.incident, true);
  const untouched = await (await fetch(base + '/api/state', { headers: { Cookie: cookieB } })).json();
  assert.equal(untouched.session.incident, false);
  assert.equal(untouched.session.revision, b.session.revision);
  assert.equal(untouched.session.analyses.length, 3);
  assert.equal(untouched.agentProvider.ready, false);
});
test('public requests cannot consume provider credit even if a key is accidentally present', async t => {
  const base = await fixture(t, { env: { BASETEN_API_KEY: 'test-only-not-a-real-key', SWITCH_AGENT_ALLOW_CREDIT_USAGE: '1' } });
  for (const path of ['/api/analyse','/api/rehearse','/api/network/review','/api/network/explore']) {
    const r = await fetch(base + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, 'PUBLIC_INFERENCE_PAUSED');
  }
  for (const path of ['/.env','/.data/current.json','/src/meta.mjs']) assert.equal((await fetch(base + path)).status, 404);
});
test('external origin rejects cross-site writes and spoofed hosts; health does not allocate a workspace', async t => {
  const base = await fixture(t, { origin: 'https://switch.example', maxVisitors: 1 });
  // Node fetch may replace Host; exercise the raw reverse-proxy boundary instead.
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const req = http.request(new URL(base + path), { method: options.method ?? 'GET', headers: options.headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject); req.end(options.body);
  });
  assert.equal((await fetch(base + '/healthz')).status, 403);
  const health = await request('/healthz', { headers: { Host: 'switch.example' } });
  assert.equal(health.status, 200); assert.equal(health.headers['set-cookie'], undefined);
  const rejected = await request('/api/action', { method: 'POST', headers: { Host: 'switch.example', Origin: 'https://wrong.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(rejected.status, 403);
  const visitor = await request('/api/state', { headers: { Host: 'switch.example' } });
  assert.equal(visitor.status, 200);
  assert.match(visitor.headers['set-cookie'][0], /HttpOnly; SameSite=Lax; Max-Age=1800; Secure/);
});

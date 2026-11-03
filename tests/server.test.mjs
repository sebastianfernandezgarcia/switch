import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../src/server.mjs';

async function fixture(t, analyse, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'switch-http-'));
  const server = await startServer({ port: 0, dataDir, env: {}, ...(analyse ? { analyse } : {}), ...options });
  t.after(async () => { await new Promise(r => server.close(r)); await rm(dataDir, { recursive: true, force: true }); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const get = async () => (await fetch(origin + '/api/state')).json();
  const post = async (path, body, headers = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { server, dataDir, origin, get, post };
}
test('service rejects cross-origin writes and does not serve private or parent files', async t => {
  const { origin, get, post } = await fixture(t);
  const state = await get();
  assert.equal((await post('/api/action', { revision: state.session.revision, action: 'incident' }, { Origin: 'https://unrelated.example' })).status, 403);
  for (const path of ['/.data/current.json', '/.env', '/../app/src/meta-provider.mjs', '/src/meta.mjs']) assert.equal((await fetch(origin + path)).status, 404);
  assert.equal((await get()).session.revision, state.session.revision);
  const page = await fetch(origin + '/');assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy').includes("connect-src 'self'"));
});
test('cancelled tool-using agent cannot apply a late plan; partial receipts remain separately identifiable', async t => {
  let entered, release;
  const started = new Promise(r => entered = r), pending = new Promise(r => release = r);
  const { get, post, dataDir } = await fixture(t, undefined, { rehearse: async (_, options) => {
    options.onStep([{ step: 1, tool: 'read_reports', arguments: { sourceIds: ['S1'] }, result: { reports: [] } }]);
    entered(); await pending; return { id: 'late-controlled-agent' };
  } });
  let state = await get(); state = await (await post('/api/action', { revision: state.session.revision, action: 'incident' })).json();
  const review = post('/api/rehearse', { revision: state.session.revision }); await started;
  assert.equal((await get()).agentProgress.length, 1);
  assert.equal((await post('/api/action', { revision: state.session.revision, action: 'receive_notice' })).status, 409);
  await post('/api/cancel', {}); release();
  assert.equal((await review).status, 502); assert.equal((await get()).session.agentRuns.length, 0);
  const files = await readdir(join(dataDir, 'runs')), receipt = JSON.parse(await readFile(join(dataDir, 'runs', files[0])));
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.mode, 'tool_using_agent');
  assert.equal(receipt.trace.length, 1); assert.equal(receipt.rawTransportSaved, false);
});
test('concurrent edits cannot silently overwrite a newer revision', async t => {
  const { get, post } = await fixture(t);const before = await get();
  const results = await Promise.all([post('/api/action', { revision: before.session.revision, action: 'incident' }), post('/api/action', { revision: before.session.revision, action: 'incident' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await get()).session.revision, before.session.revision + 1);
});
test('rejected shortcut does not create a branch, and rewind preserves legitimate history', async t => {
  const { get, post } = await fixture(t);let state = await get();
  state = await (await post('/api/action', { revision: state.session.revision, action: 'incident' })).json();
  const bad = await post('/api/action', { revision: state.session.revision, action: 'branch', strategy: 'enter_now' });
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error, 'CLEARANCE_NOT_CONFIRMED');
  assert.equal((await get()).session.branches.length, 0);
  state = await (await post('/api/action', { revision: state.session.revision, action: 'branch', strategy: 'bypass' })).json();
  const savedBranch = state.session.branches[0];
  state = await (await post('/api/action', { revision: state.session.revision, action: 'parameters', parameters: { clearanceMinutes: 12, bypassOpen: false } })).json();
  state = await (await post('/api/action', { revision: state.session.revision, action: 'select_branch', branchId: savedBranch.id })).json();
  assert.deepEqual(state.session.parameters, { clearanceMinutes: 4, bypassOpen: true });
  state = await (await post('/api/action', { revision: state.session.revision, action: 'rewind' })).json();
  assert.equal(state.session.incident, false);assert.equal(state.session.branches.length, 1);
});
test('cancelled late Meta result never becomes an applied analysis', async t => {
  let release, entered;
  const started = new Promise(r => { entered = r; });
  const pending = new Promise(r => { release = r; });
  const { get, post, dataDir } = await fixture(t, async () => { entered(); await pending; return { id: 'controlled-result' }; });
  let state = await get();state = await (await post('/api/action', { revision: state.session.revision, action: 'incident' })).json();
  const review = post('/api/analyse', { revision: state.session.revision }); await started;
  assert.equal((await post('/api/action', { revision: state.session.revision, action: 'rewind' })).status, 409);
  await post('/api/cancel', {}); release();
  assert.equal((await review).status, 502);
  assert.equal((await get()).session.analyses.length, 0);
  const files = await readdir(join(dataDir, 'runs'));assert.equal(files.length, 1);
  assert.equal(JSON.parse(await readFile(join(dataDir, 'runs', files[0]))).status, 'failed');
});
test('case changes preserve history and a restored branch brings its case back', async t => {
  const { get, post, origin } = await fixture(t); let state = await get();
  const change = async body => { const r = await post('/api/action', { revision: state.session.revision, ...body }); assert.equal(r.status, 200); state = await r.json(); };
  await change({ action: 'incident' });
  await change({ action: 'branch', strategy: 'wait' });
  const first = state.session.branches[0];
  await change({ action: 'select_scenario', scenarioId: 'clearance-received-03' });
  assert.equal(state.session.parameters.clearanceMinutes, 0);
  assert.equal(state.session.incident, false);
  assert.equal(state.session.branches.length, 1);
  await change({ action: 'incident' });
  await change({ action: 'branch', strategy: 'enter_now' });
  assert.equal(state.session.branches.length, 2);
  await change({ action: 'select_branch', branchId: first.id });
  assert.equal(state.scenario.id, 'corridor-north-01');
  assert.equal(state.session.parameters.clearanceMinutes, 4);
  const exported = await (await fetch(origin + '/api/export')).json();
  assert.equal(exported.session.branches.length, 2);
  assert.equal(exported.cases.length, 4);
  assert.equal(JSON.stringify(exported).includes('BASETEN_API_KEY'), false);
  assert.equal(exported.format, 'switch-rehearsals-v1');
});
test('a new notice preserves old branches; opening one cannot reopen the latest closed bypass', async t => {
  const { get, post } = await fixture(t); let state = await get();
  const action = async body => { const r = await post('/api/action', { revision: state.session.revision, ...body }); assert.equal(r.status, 200); state = await r.json(); };
  await action({ action: 'incident' }); await action({ action: 'branch', strategy: 'bypass' });
  const previous = structuredClone(state.session.branches[0]);
  await action({ action: 'receive_notice' });
  assert.equal(state.scenario.sources.at(-1).id, 'S4');
  assert.equal(state.comparison[1].feasible, false);
  assert.deepEqual(state.session.branches[0], previous);
  await action({ action: 'select_branch', branchId: previous.id });
  assert.equal(state.scenario.id, 'corridor-update-04');
  assert.equal(state.session.parameters.bypassOpen, false);
  assert.equal(state.branchStatus[0].affected, true);
  assert.equal((await post('/api/action', { revision: state.session.revision, action: 'branch', strategy: 'bypass' })).status, 400);
});
test('invalid or closed case changes cannot partially mutate the current case', async t => {
  const { get, post } = await fixture(t); let state = await get();
  assert.equal((await post('/api/action', { revision: state.session.revision, action: 'select_scenario', scenarioId: 'missing' })).status, 400);
  assert.equal((await get()).session.revision, state.session.revision);
  state = await (await post('/api/action', { revision: state.session.revision, action: 'select_scenario', scenarioId: 'ladera-closed-02' })).json();
  assert.equal((await post('/api/action', { revision: state.session.revision, action: 'parameters', parameters: { bypassOpen: true } })).status, 400);
  assert.equal((await get()).session.parameters.bypassOpen, false);
});
test('the narrative reads a stable first-case snapshot without mutating the selected case', async t => {
  const { get, post } = await fixture(t);let state = await get();
  const initial = state.intro;
  state = await (await post('/api/action', { revision: state.session.revision, action: 'select_scenario', scenarioId: 'clearance-received-03' })).json();
  assert.equal(state.scenario.id, 'clearance-received-03');
  assert.deepEqual(state.intro, initial);
  assert.equal(state.intro.scenario.id, 'corridor-north-01');
  assert.deepEqual(state.intro.comparison.map(p => p.metrics.totalDelay), [9, 3]);
  const revision = state.session.revision;
  assert.equal((await get()).session.revision, revision);
});
test('only the explicitly declared narrative assets are served', async t => {
  const { origin } = await fixture(t);
  for (const [path, type] of [['/story.js','text/javascript'],['/story.css','text/css'],['/i18n.mjs','text/javascript'],['/scene3d.js','text/javascript'],['/world.css','text/css'],['/vendor/three.module.js','text/javascript'],['/vendor/three.core.js','text/javascript'],['/vendor/OrbitControls.js','text/javascript'],['/vendor/three-LICENSE.txt','text/plain'],['/assets/urda-incident.jpg','image/jpeg'],['/assets/spain-context.svg','image/svg+xml']]) {
    const response = await fetch(origin + path);assert.equal(response.status, 200);assert.ok(response.headers.get('content-type').startsWith(type));assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  for (const path of ['/assets/.env','/assets/../src/meta.mjs','/ASSET_LICENSES.md','/assets/rail-context.jpg']) assert.equal((await fetch(origin + path)).status, 404);
});

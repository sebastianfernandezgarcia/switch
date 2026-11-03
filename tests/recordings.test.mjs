import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRecordedAnalyses } from '../src/recordings.mjs';
import { startServer } from '../src/server.mjs';
import { loadRecordedAgentRuns } from '../src/agent-recordings.mjs';

const examples = new URL('../examples/recorded-meta.json', import.meta.url);
const agentExamples = new URL('../examples/recorded-agent.json', import.meta.url);
test('packaged readings retain real provenance and recompute results from their exact cases', async () => {
  const records = await loadRecordedAnalyses(examples);
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map(r => r.scenarioId)).size, 3);
  assert.ok(records.every(r => r.origin === 'packaged_recording' && r.reasoningSaved === false));
  assert.equal(records.find(r => r.scenarioId === 'ladera-closed-02').results[1].feasible, false);
  assert.equal(records.find(r => r.scenarioId === 'clearance-received-03').shortcut.feasible, true);
});
test('real saved tool runs replay the changed evidence and explicit clearance without an API call', async t => {
  const runs = await loadRecordedAgentRuns(agentExamples);
  assert.equal(runs.length, 7);
  assert.deepEqual(runs.slice(0, 3).map(r => r.proposal.recommendedStrategy), ['bypass','wait','enter_now']);
  assert.ok(runs.every(r => r.toolReplayVerified && r.origin === 'packaged_recording'));
  const bilingual = runs.filter(r => r.language === 'en');
  assert.equal(bilingual.length, 4);
  assert.equal(new Set(bilingual.map(r => r.scenarioId)).size, 4);
  assert.ok(bilingual.every(r => r.proposal.localized.es.title && r.proposal.localized.es.summary && r.proposal.localized.es.question));
  const confirmed = bilingual.find(r => r.scenarioId === 'clearance-received-03');
  assert.equal(confirmed.tests.find(t => t.strategy === 'enter_now').feasible, true);
  const updated = runs.find(r => r.evidenceVersion === 2);
  assert.equal(updated.tests.find(t => t.strategy === 'bypass').code, 'BYPASS_CLOSED');
  assert.ok(updated.proposal.evidence.some(e => e.sourceId === 'S4'));
  const dataDir = await mkdtemp(join(tmpdir(), 'switch-agent-clean-'));
  const server = await startServer({ port: 0, dataDir, env: {}, agentRecordedFile: agentExamples });
  t.after(async () => { await new Promise(r => server.close(r)); await rm(dataDir, { recursive: true, force: true }); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  let state = await (await fetch(origin + '/api/state')).json();
  state = await (await fetch(origin + '/api/action', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.session.revision, action: 'select_scenario', scenarioId: 'corridor-update-04' }) })).json();
  assert.equal(state.agent.proposal.recommendedStrategy, 'wait');
  assert.equal(state.agentProvider.ready, false);
  assert.equal(state.agent.origin, 'packaged_recording');
  assert.equal(state.agent.language, 'en');
  for (const scenarioId of ['corridor-north-01', 'ladera-closed-02', 'clearance-received-03']) {
    state = await (await fetch(origin + '/api/action', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.session.revision, action: 'select_scenario', scenarioId }) })).json();
    assert.equal(state.agent.language, 'en');
    assert.equal(state.agent.scenarioId, scenarioId);
  }
});
test('altering a saved agent tool result or source cannot inherit real-run provenance', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'switch-agent-recording-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'bad.json'), document = JSON.parse(await readFile(agentExamples));
  document.records[1].trace.find(s => s.tool === 'test_plan' && s.arguments.strategy === 'bypass').result.feasible = true;
  await writeFile(file, JSON.stringify(document));
  await assert.rejects(loadRecordedAgentRuns(file), /Recorded tool result mismatch/);
});
test('altering a recording cannot transfer its provenance to different assumptions', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'switch-recording-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'bad.json'), document = JSON.parse(await readFile(examples));
  document.records[0].parameters.bypassOpen = !document.records[0].parameters.bypassOpen;
  await writeFile(file, JSON.stringify(document));
  await assert.rejects(loadRecordedAnalyses(file));
});
test('a clean installation opens all recorded cases without an API key', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'switch-clean-'));
  const server = await startServer({ port: 0, dataDir, env: {}, recordedFile: examples });
  t.after(async () => { await new Promise(r => server.close(r)); await rm(dataDir, { recursive: true, force: true }); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const get = async () => (await fetch(origin + '/api/state')).json();
  let state = await get(); assert.equal(state.session.analyses.length, 3); assert.equal(state.provider.ready, false);
  const act = async body => { const r = await fetch(origin + '/api/action', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.session.revision, ...body }) }); assert.equal(r.status, 200); state = await r.json(); };
  for (const id of state.catalog.filter(s => s.id !== "corridor-update-04").map(s => s.id)) {
    await act({ action: 'select_scenario', scenarioId: id }); await act({ action: 'incident' });
    assert.equal(state.analysis.scenarioId, id);
    assert.equal(state.analysis.origin, 'packaged_recording');
  }
});

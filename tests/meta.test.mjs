import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SCENARIO, getScenario } from '../src/domain.mjs';
import { analyseIncident, validateProposal } from '../src/meta.mjs';

export function proposal() {
  return { title: 'R2 sigue sin confirmar', summary: 'Una posición vencida y dos partes no acreditan que el tramo esté libre.',
    focus: 'R2', clearanceState: 'unconfirmed',
    evidence: [SCENARIO.sources[0], SCENARIO.sources[2]].map(s => ({ sourceId: s.id, quote: s.text })),
    nextQuestion: '¿Se ha confirmado que T07 salió de R2?',
    plans: [{ strategy: 'wait', reason: 'Esperar a la confirmación asumida.' }, { strategy: 'bypass', reason: 'Ensayar el desvío si permanece disponible.' }] };
}
function response(p = proposal(), finish = 'tool_calls') {
  return new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: {
    role: 'assistant', tool_calls: [{ id: 'call_controlled', type: 'function', function: { name: 'submit_rehearsal', arguments: JSON.stringify(p) } }],
    reasoning_content: 'This controlled reasoning must not be stored.',
  } }], usage: { prompt_tokens: 600, completion_tokens: 700 } }), { status: 200 });
}
async function fixture(t, reservedMicros = 0) {
  const dir = await mkdtemp(join(tmpdir(), 'switch-meta-'));t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'ledger.json');
  await writeFile(file, JSON.stringify({ version: 1, capMicros: 1000000, reservedMicros, requests: 0 }));
  return { file, env: { BASETEN_API_KEY: 'controlled-switch-secret', COUNTERCHECK_CREDIT_LEDGER_FILE: file,
    COUNTERCHECK_ALLOW_CREDIT_USAGE: '1', COUNTERCHECK_CREDIT_BUDGET_USD: '1' } };
}
test('proposal must retain unconfirmed clearance and exact evidence', () => {
  assert.equal(validateProposal(proposal()).clearanceState, 'unconfirmed');
  assert.throws(() => validateProposal({ ...proposal(), clearanceState: 'clear' }), { code: 'INVALID_PROPOSAL' });
  const wrong = proposal(); wrong.evidence[0].quote = 'Invented confirmation';
  assert.throws(() => validateProposal(wrong), { code: 'INVALID_EVIDENCE' });
  const duplicate = proposal(); duplicate.plans[1].strategy = 'wait';
  assert.throws(() => validateProposal(duplicate), { code: 'INVALID_PLANS' });
});
test('real adapter uses fixed origin/model, private auth and engine-checked plans', async t => {
  const { env } = await fixture(t);
  const result = await analyseIncident({ bypassOpen: false }, { env, fetch: async (url, options) => {
    assert.equal(url, 'https://inference.baseten.co/v1/chat/completions');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'meta-models/muse-spark-open-1026');
    assert.equal(body.max_tokens, 3072);
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(options.body.includes(env.BASETEN_API_KEY), false);
    return response();
  } });
  assert.equal(result.results.find(p => p.strategy === 'bypass').feasible, false);
  assert.equal(result.shortcut.code, 'CLEARANCE_NOT_CONFIRMED');
  assert.equal(result.usage.calls, 1);
  assert.equal(JSON.stringify(result).includes('controlled reasoning'), false);
  assert.equal(JSON.stringify(result).includes(env.BASETEN_API_KEY), false);
});
test('one invalid cited submission can be corrected once; all attempts keep a reservation', async t => {
  const { env, file } = await fixture(t); let calls = 0;
  const result = await analyseIncident({}, { env, fetch: async () => {
    calls++;
    const p = proposal(); if (calls === 1) p.evidence[0].quote = 'Wrong';
    return response(p);
  } });
  assert.equal(calls, 2);
  assert.equal(result.events.some(e => e.type === 'proposal_rejected'), true);
  assert.equal(JSON.parse(await readFile(file)).requests, 2);
});
test('repeated invalid submissions fail and transport errors are not retried', async t => {
  const { env, file } = await fixture(t); let calls = 0;
  await assert.rejects(analyseIncident({}, { env, fetch: async () => { calls++; return response({ ...proposal(), clearanceState: 'clear' }); } }), { code: 'INVALID_PROPOSAL' });
  assert.equal(calls, 2);
  assert.equal(JSON.parse(await readFile(file)).requests, 2);
  await assert.rejects(analyseIncident({}, { env, fetch: async () => { calls++; return new Response('', { status: 403 }); } }), { code: 'PROVIDER_REJECTED' });
  assert.equal(calls, 3);
});
test('exhausted or corrupt shared budget prevents any provider request', async t => {
  const { env, file } = await fixture(t, 995000); let calls = 0;
  await assert.rejects(analyseIncident({}, { env, fetch: async () => { calls++; return response(); } }), { code: 'PROVIDER_NOT_READY' });
  await writeFile(file, 'broken');
  await assert.rejects(analyseIncident({}, { env, fetch: async () => { calls++; return response(); } }), { code: 'PROVIDER_NOT_READY' });
  assert.equal(calls, 0);
});
test('the same source IDs cannot carry evidence from another case', () => {
  assert.throws(() => validateProposal(proposal(), 'ladera-closed-02'), { code: 'INVALID_EVIDENCE' });
  const p = proposal(), s = getScenario('clearance-received-03');
  p.evidence = s.sources.slice(0, 2).map(v => ({ sourceId: v.id, quote: v.text }));
  assert.throws(() => validateProposal(p, s.id), { code: 'INVALID_PROPOSAL' });
  p.clearanceState = 'confirmed';
  assert.equal(validateProposal(p, s.id).clearanceState, 'confirmed');
  assert.throws(() => validateProposal(p), { code: 'INVALID_PROPOSAL' });
});
test('Meta receives case-specific evidence and the engine rejects the closed alternative', async t => {
  const { env } = await fixture(t), id = 'ladera-closed-02', s = getScenario(id);
  const p = proposal(); p.evidence = s.sources.slice(0, 2).map(v => ({ sourceId: v.id, quote: v.text }));
  const result = await analyseIncident({}, { env, scenarioId: id, fetch: async (url, options) => {
    const user = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.equal(user.scenarioId, id);
    assert.deepEqual(user.closedEdges, ['R5']);
    assert.equal(user.declaredClearanceState, 'unconfirmed');
    return response(p);
  } });
  assert.equal(result.scenarioId, id);
  assert.equal(result.results[1].feasible, false);
});
test('truncated output cannot be applied as a completed Meta analysis', async t => {
  const { env } = await fixture(t);
  await assert.rejects(analyseIncident({}, { env, fetch: async () => response(proposal(), 'length') }), { code: 'INVALID_RESPONSE' });
});

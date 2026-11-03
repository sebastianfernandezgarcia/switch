import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolSession, runRehearsalAgent } from '../src/agent.mjs';
import { getScenario, DEFAULT_SCENARIO, UPDATED_SCENARIO, newSession, addBranch, receiveNotice, branchStatus } from '../src/domain.mjs';
import { reserveCredit } from '../src/agent-credit-ledger.mjs';

async function fixture(t, cap = 4000000, reserved = 0) {
  const dir = await mkdtemp(join(tmpdir(), 'switch-agent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'credits.json');
  await writeFile(file, JSON.stringify({ version: 1, capMicros: cap, reservedMicros: reserved, requests: 0 }));
  return { file, env: { BASETEN_API_KEY: 'agent-fixture-private-key', SWITCH_AGENT_CREDIT_LEDGER_FILE: file,
    SWITCH_AGENT_ALLOW_CREDIT_USAGE: '1', SWITCH_AGENT_CREDIT_BUDGET_USD: '4' } };
}
const call = (name, args, id = name) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const response = calls => new Response(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: {
  tool_calls: calls, reasoning_content: 'PRIVATE REASONING NOT TO SAVE',
} }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } }));
function final(scenarioId, recommendedStrategy = 'wait') {
  return { title: 'Ensayar después de comprobar', summary: 'La evidencia y los resultados del motor se conservan juntos.',
    question: '¿Quién puede confirmar el estado actual de R2?', recommendedStrategy,
    evidence: getScenario(scenarioId).sources.map(s => ({ sourceId: s.id, quote: s.text })), testIds: ['T1', 'T2', 'T3'],
    localized: { es: { title: 'Ensayar después de comprobar', summary: 'Fuentes y resultados del modelo ficticio.', question: '¿Quién puede confirmar R2?' } } };
}

test('a new notice invalidates the old bypass without changing its immutable evidence or replay', () => {
  const initial = addBranch({ ...newSession(), incident: true }, 'bypass');
  const branch = structuredClone(initial.branches[0]);
  const next = receiveNotice(initial);
  assert.equal(next.scenarioId, UPDATED_SCENARIO);
  assert.equal(next.parameters.bypassOpen, false);
  assert.equal(next.activeBranchId, null);
  assert.deepEqual(next.branches[0], branch);
  assert.equal(branchStatus(branch, next).affected, true);
  assert.throws(() => addBranch(next, 'bypass'), { code: 'BYPASS_CLOSED' });
  assert.throws(() => receiveNotice(next), { code: 'NOTICE_NOT_AVAILABLE' });
  const legacy = structuredClone(branch); delete legacy.scenarioId;
  assert.equal(branchStatus(legacy, next).affected, true, 'pre-case legacy branches also become historical');
});

test('the tool session rejects an untested plan, unread quotations, stale citations and a rejected recommendation', () => {
  const session = createToolSession(UPDATED_SCENARIO, {}), proposal = final(UPDATED_SCENARIO);
  assert.throws(() => session.execute('submit_plan', proposal), { code: 'UNTESTED_OR_REJECTED_PLAN' });
  for (const strategy of ['wait', 'bypass', 'enter_now']) session.execute('test_plan', { strategy });
  assert.throws(() => session.execute('submit_plan', proposal), { code: 'INVALID_EVIDENCE' });
  session.execute('read_reports', { sourceIds: ['S1', 'S2', 'S3', 'S4'] });
  assert.throws(() => session.execute('submit_plan', { ...proposal, recommendedStrategy: 'bypass' }), { code: 'UNTESTED_OR_REJECTED_PLAN' });
  assert.throws(() => session.execute('submit_plan', { ...proposal, evidence: proposal.evidence.slice(0, 3) }), { code: 'NEWEST_SOURCE_NOT_CITED' });
  assert.equal(session.execute('submit_plan', proposal).accepted, true);
});

test('Meta adapter must consume real tool results before it can finalize; request does not disclose expected clearance verdicts', async t => {
  const { env, file } = await fixture(t); let round = 0;
  const result = await runRehearsalAgent({}, { env, scenarioId: UPDATED_SCENARIO, fetch: async (url, opts) => {
    assert.equal(url, 'https://inference.baseten.co/v1/chat/completions');
    assert.equal(opts.redirect, 'error');
    const body = JSON.parse(opts.body); round++;
    assert.equal(opts.body.includes(env.BASETEN_API_KEY), false);
    if (round === 1) {
      const payload = JSON.parse(body.messages[1].content);
      assert.equal(payload.declaredClearanceState, undefined);
      assert.equal(payload.closedEdges, undefined);
      assert.equal(payload.reportIndex.some(s => 'text' in s || 'verifiedClearance' in s), false);
      return response([call('read_reports', { sourceIds: ['S1', 'S2', 'S3', 'S4'] })]);
    }
    if (round === 2) return response(['wait', 'bypass', 'enter_now'].map(s => call('test_plan', { strategy: s }, s)));
    const toolResults = body.messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
    assert.equal(toolResults.find(r => r.strategy === 'bypass').code, 'BYPASS_CLOSED');
    assert.equal(toolResults.find(r => r.strategy === 'enter_now').code, 'CLEARANCE_NOT_CONFIRMED');
    return response([call('submit_plan', final(UPDATED_SCENARIO))]);
  } });
  assert.equal(round, 3); assert.equal(result.trace.length, 5);
  assert.equal(result.tests.filter(t => t.feasible).length, 1);
  assert.equal(JSON.parse(await readFile(file)).requests, 3);
  assert.equal(JSON.stringify(result).includes('PRIVATE REASONING'), false);
});

test('mixed final/action batches and invented tools fail closed without side effects', async t => {
  const { env } = await fixture(t);
  await assert.rejects(runRehearsalAgent({}, { env, scenarioId: DEFAULT_SCENARIO, fetch: async () => response([
    call('test_plan', { strategy: 'wait' }), call('submit_plan', final(DEFAULT_SCENARIO)),
  ]) }), { code: 'PREMATURE_FINAL_BATCH' });
  await assert.rejects(runRehearsalAgent({}, { env, scenarioId: DEFAULT_SCENARIO, fetch: async () => response([
    call('open_file', { path: '/private' }),
  ]) }), { code: 'INVALID_RESPONSE' });
});

test('no credit configuration, exhausted allowance or aborted work makes an unreserved request', async t => {
  const { env, file } = await fixture(t, 4000000, 3999999); let calls = 0;
  await assert.rejects(runRehearsalAgent({}, { env, scenarioId: DEFAULT_SCENARIO, fetch: async () => { calls++; } }), { code: 'PROVIDER_NOT_READY' });
  await assert.rejects(runRehearsalAgent({}, { env: {}, scenarioId: DEFAULT_SCENARIO, fetch: async () => { calls++; } }), { code: 'PROVIDER_NOT_READY' });
  assert.equal(calls, 0); assert.equal(JSON.parse(await readFile(file)).requests, 0);
});

test('parallel reservations preserve the additional allowance and never reset the original ledger', async t => {
  const { file } = await fixture(t, 1000000, 900000);
  const results = await Promise.allSettled([reserveCredit(file, .06, 1), reserveCredit(file, .06, 1)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(JSON.parse(await readFile(file)).reservedMicros, 960000);
});
test('fresh bilingual conclusions cannot replace the original Spanish evidence quotes', () => {
  const task=createToolSession(UPDATED_SCENARIO,{}, {requireBilingual:true});
  task.execute('read_reports',{sourceIds:['S1','S2','S3','S4']});
  for(const strategy of ['wait','bypass','enter_now'])task.execute('test_plan',{strategy});
  const p=final(UPDATED_SCENARIO), old=structuredClone(p);delete old.localized;
  assert.throws(()=>task.execute('submit_plan',old),{code:'INVALID_LOCALIZATION'});
  const translated=structuredClone(p);translated.evidence[0].quote='T07 was observed on R2.';
  assert.throws(()=>task.execute('submit_plan',translated),{code:'INVALID_EVIDENCE'});
  assert.equal(task.execute('submit_plan',p).accepted,true);
});
test('available tools shrink from reading to untested alternatives and then finalization', async t => {
  const {env}=await fixture(t);let round=0;
  const result=await runRehearsalAgent({}, {env,scenarioId:UPDATED_SCENARIO,fetch:async (_,opts)=>{
    const body=JSON.parse(opts.body);round++;
    if(round===1){assert.deepEqual(body.tools.map(t=>t.function.name),['read_reports']);assert.equal(body.tools[0].function.parameters.properties.sourceIds.minItems,4);return response([call('read_reports',{sourceIds:['S1','S2','S3','S4']})]);}
    if(round<=4){const pending=['wait','bypass','enter_now'].slice(round-2);assert.deepEqual(body.tools.map(t=>t.function.name),['test_plan']);assert.deepEqual(body.tools[0].function.parameters.properties.strategy.enum,pending);return response([call('test_plan',{strategy:pending[0]})]);}
    assert.deepEqual(body.tools.map(t=>t.function.name),['submit_plan']);return response([call('submit_plan',final(UPDATED_SCENARIO))]);
  }});
  assert.equal(result.usage.calls,5);assert.equal(result.tests.length,3);assert.equal(result.proposal.localized.es.question,'¿Quién puede confirmar R2?');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDurableCredits, readDurableLedger, reserveDurableCredit, initializeDurableCredits } from '../src/durable-credits.mjs';
import { runRehearsalAgent } from '../src/agent.mjs';

const rows = () => [
  { name: 'original', cap_micros: '1000000', reserved_micros: '900000', requests: '10' },
  { name: 'agent', cap_micros: '4000000', reserved_micros: '1000000', requests: '20' },
];
test('a missing durable ledger fails closed without creating or seeding a fresh budget', async () => {
  const statements = [];
  await assert.rejects(openDurableCredits({ pool: {
    query: async sql => { statements.push(sql); throw Error('missing table'); }, end: async () => {},
  } }), { code: 'CREDIT_LEDGER_UNAVAILABLE' });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^SELECT/);
  assert.throws(() => readDurableLedger('durable:agent'), { code: 'CREDIT_LEDGER_UNAVAILABLE' });
});
test('a failed durable reservation cannot reach the model provider', async t => {
  let calls = 0;
  const store = await openDurableCredits({ pool: {
    query: async sql => { if (sql.startsWith('SELECT')) return { rows: rows() }; throw Error('connection lost'); }, end: async () => {},
  } });
  t.after(() => store.close());
  await assert.rejects(runRehearsalAgent({}, { env: { ...store.env, BASETEN_API_KEY: 'test-only-not-a-real-key' },
    fetch: async () => { calls++; throw Error('must not reach provider'); },
  }), { code: 'CREDIT_LEDGER_UNAVAILABLE' });
  assert.equal(calls, 0);
  assert.equal(store.healthy, false);
});
test('out-of-order reservation responses cannot reduce the displayed consumed balance', async t => {
  const pending = [];
  const store = await openDurableCredits({ pool: {
    query: async (sql, params) => sql.startsWith('SELECT') ? { rows: rows() } : new Promise(resolve => pending.push({ resolve, params })), end: async () => {},
  } });
  t.after(() => store.close());
  const first = reserveDurableCredit('durable:agent', .1, 4), second = reserveDurableCredit('durable:agent', .1, 4);
  assert.deepEqual(pending.map(p => p.params), [[100000,'agent',4000000],[100000,'agent',4000000]]);
  pending[1].resolve({ rows: [{ ...rows()[1], reserved_micros: '1200000', requests: '22' }] });
  await second;
  pending[0].resolve({ rows: [{ ...rows()[1], reserved_micros: '1100000', requests: '21' }] });
  await first;
  assert.equal(readDurableLedger('durable:agent').reservedMicros, 1200000);
});
test('repeating the explicit migration never inserts, resets or enlarges existing rows', async () => {
  const statements = [];
  const client = { query: async sql => { statements.push(sql); return { rows: sql.startsWith('SELECT') ? rows() : [] }; }, release() {} };
  await initializeDurableCredits({ connect: async () => client }, rows());
  assert.equal(statements.some(sql => sql.startsWith('INSERT') || sql.startsWith('UPDATE')), false);
  assert.equal(statements.at(-1), 'COMMIT');
});

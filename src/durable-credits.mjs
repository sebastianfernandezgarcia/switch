// The public service reads existing rows only. Creating/seeding the table is a
// separate, explicit migration; a missing database never becomes a fresh budget.
const registered = new Map();
const LIMITS = { original: 1_000_000, agent: 9_000_000 };
const COLUMNS = 'name, cap_micros, reserved_micros, requests';
function fail(code = 'CREDIT_LEDGER_UNAVAILABLE') {
  const error = new Error(code); error.code = code; throw error;
}
function decode(row) {
  if (!row || !Object.hasOwn(LIMITS, row.name)) fail();
  const value = { version: 1, capMicros: Number(row.cap_micros), reservedMicros: Number(row.reserved_micros), requests: Number(row.requests) };
  if (!Number.isSafeInteger(value.capMicros) || value.capMicros < 1 || value.capMicros > LIMITS[row.name] ||
      !Number.isSafeInteger(value.reservedMicros) || value.reservedMicros < 0 || value.reservedMicros > value.capMicros ||
      !Number.isSafeInteger(value.requests) || value.requests < 0) fail();
  return value;
}
export const isDurableLedger = file => typeof file === 'string' && file.startsWith('durable:');
export function readDurableLedger(file) {
  const record = registered.get(file);
  if (!record?.store.healthy) fail();
  return structuredClone(record.value);
}
export async function reserveDurableCredit(file, amountUsd, capUsd) {
  const record = registered.get(file);
  const amount = Math.ceil(amountUsd * 1_000_000), cap = Math.floor(capUsd * 1_000_000);
  if (!record?.store.healthy || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(cap) || cap <= 0 || cap > LIMITS[record.name]) fail();
  let result;
  try {
    result = await record.store.pool.query(`UPDATE switch_credit_ledgers
      SET reserved_micros = reserved_micros + $1, requests = requests + 1, updated_at = now()
      WHERE name = $2 AND reserved_micros + $1 <= LEAST(cap_micros, $3)
      RETURNING ${COLUMNS}`, [amount, record.name, cap]);
  } catch { record.store.healthy = false; fail(); }
  if (result.rows.length !== 1) fail('CREDIT_BUDGET_REACHED');
  const next = decode(result.rows[0]);
  // Concurrent replies can arrive out of order; the cached display may not go back.
  if (next.reservedMicros >= record.value.reservedMicros) record.value = next;
  return next;
}
export async function createDatabasePool(connectionString) {
  try {
    const address = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(address.protocol)) fail();
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) address.searchParams.delete(key);
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: address.href, max: 3, connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true } });
    pool.on('error', () => {});
    return pool;
  } catch { fail(); }
}
export async function openDurableCredits({ connectionString, pool: providedPool } = {}) {
  const pool = providedPool ?? await createDatabasePool(connectionString);
  const store = { pool, healthy: true };
  try {
    const result = await pool.query(`SELECT ${COLUMNS} FROM switch_credit_ledgers ORDER BY name`);
    if (result.rows.length !== 2 || new Set(result.rows.map(row => row.name)).size !== 2) fail();
    const records = result.rows.map(row => ({ name: row.name, value: decode(row), store }));
    if (records.reduce((sum, row) => sum + row.value.capMicros, 0) > 10_000_000) fail();
    for (const record of records) registered.set('durable:' + record.name, record);
    return {
      get healthy() { return store.healthy; },
      env: { COUNTERCHECK_CREDIT_LEDGER_FILE: 'durable:original', COUNTERCHECK_ALLOW_CREDIT_USAGE: '1',
        COUNTERCHECK_CREDIT_BUDGET_USD: String(records.find(row => row.name === 'original').value.capMicros / 1e6),
        SWITCH_AGENT_CREDIT_LEDGER_FILE: 'durable:agent', SWITCH_AGENT_ALLOW_CREDIT_USAGE: '1',
        SWITCH_AGENT_CREDIT_BUDGET_USD: String(records.find(row => row.name === 'agent').value.capMicros / 1e6) },
      async close() {
        store.healthy = false;
        for (const record of records) if (registered.get('durable:' + record.name) === record) registered.delete('durable:' + record.name);
        await pool.end();
      },
    };
  } catch {
    store.healthy = false; await pool.end().catch(() => {}); fail();
  }
}

export async function initializeDurableCredits(pool, seeds) {
  if (!Array.isArray(seeds) || seeds.length !== 2 || new Set(seeds.map(row => row.name)).size !== 2) fail();
  for (const row of seeds) decode(row);
  if (seeds.reduce((sum, row) => sum + Number(row.cap_micros), 0) > 10_000_000) fail();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS switch_credit_ledgers (
      name text PRIMARY KEY CHECK (name IN ('original','agent')),
      cap_micros bigint NOT NULL CHECK (cap_micros > 0),
      reserved_micros bigint NOT NULL CHECK (reserved_micros >= 0 AND reserved_micros <= cap_micros),
      requests bigint NOT NULL CHECK (requests >= 0), updated_at timestamptz NOT NULL DEFAULT now())`);
    const existing = await client.query(`SELECT ${COLUMNS} FROM switch_credit_ledgers FOR UPDATE`);
    if (existing.rows.length) {
      // A repeated migration cannot reset reservations or enlarge its authorization.
      if (existing.rows.length !== 2) fail();
      for (const row of existing.rows) {
        const value = decode(row), seed = seeds.find(seed => seed.name === row.name);
        if (value.reservedMicros < Number(seed.reserved_micros) || value.requests < Number(seed.requests) || value.capMicros > Number(seed.cap_micros)) fail();
      }
    } else {
      for (const row of seeds) await client.query(`INSERT INTO switch_credit_ledgers (name, cap_micros, reserved_micros, requests) VALUES ($1,$2,$3,$4)`, [row.name, row.cap_micros, row.reserved_micros, row.requests]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

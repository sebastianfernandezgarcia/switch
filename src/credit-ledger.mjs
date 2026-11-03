import { isDurableLedger, readDurableLedger, reserveDurableCredit } from './durable-credits.mjs';
import { readFileSync } from 'node:fs';
import { open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const queues = new Map();
const micros = usd => Math.ceil(usd * 1_000_000);
export class CreditLedgerError extends Error {
  constructor(code) { super(code); this.name = 'CreditLedgerError'; this.code = code; }
}
const fail = () => { throw new CreditLedgerError('CREDIT_LEDGER_UNAVAILABLE'); };
function validate(file, value) {
  if (!isAbsolute(file) || !value || value.version !== 1 || !Number.isSafeInteger(value.capMicros) || value.capMicros < 1 || value.capMicros > 1_000_000 || !Number.isSafeInteger(value.reservedMicros) || value.reservedMicros < 0 || value.reservedMicros > value.capMicros || !Number.isSafeInteger(value.requests) || value.requests < 0) fail();
  return value;
}
export function readCreditLedger(file) {
  if (isDurableLedger(file)) return readDurableLedger(file);
  try { return validate(file, JSON.parse(readFileSync(file, 'utf8'))); } catch { fail(); }
}
export function reserveCredit(file, amountUsd, capUsd) {
  if (isDurableLedger(file)) return reserveDurableCredit(file, amountUsd, capUsd);
  const previous = queues.get(file) || Promise.resolve();
  const operation = previous.catch(() => {}).then(() => reserve(file, amountUsd, capUsd));
  queues.set(file, operation);
  void operation.finally(() => { if (queues.get(file) === operation) queues.delete(file); }).catch(() => {});
  return operation;
}
async function reserve(file, amountUsd, capUsd) {
  if (!isAbsolute(file) || !Number.isFinite(amountUsd) || amountUsd <= 0 || !Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 1) fail();
  const lock = `${file}.lock`; let handle, temp;
  try {
    // Unknown locks fail closed rather than being erased or retried blindly.
    handle = await open(lock, 'wx', 0o600);
    const value = validate(file, JSON.parse(await readFile(file, 'utf8')));
    const capMicros = Math.min(value.capMicros, micros(capUsd));
    if (value.reservedMicros + micros(amountUsd) > capMicros) throw new CreditLedgerError('CREDIT_BUDGET_REACHED');
    const next = { ...value, capMicros, reservedMicros: value.reservedMicros + micros(amountUsd), requests: value.requests + 1, updatedAt: new Date().toISOString() };
    temp = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temp, file); temp = null;
    return next;
  } catch (error) {
    if (error instanceof CreditLedgerError) throw error;
    fail();
  } finally {
    if (temp) await unlink(temp).catch(() => {});
    if (handle) { await handle.close(); await unlink(lock).catch(() => {}); }
  }
}

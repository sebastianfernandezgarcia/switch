import { readFile } from 'node:fs/promises';
import { createDatabasePool, initializeDurableCredits } from '../src/durable-credits.mjs';
if (!process.env.DATABASE_URL || process.argv.length !== 3) throw new Error('Provide DATABASE_URL and one private, approved ledger snapshot filename.');
const seeds = JSON.parse(await readFile(process.argv[2], 'utf8'));
const pool = await createDatabasePool(process.env.DATABASE_URL);
try {
  await initializeDurableCredits(pool, seeds);
  console.log('Durable credit rows verified. Existing reservations preserved; no model request made.');
} finally { await pool.end(); }

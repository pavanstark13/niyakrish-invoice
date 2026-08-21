// Shared Postgres access for all API routes.
//
// Uses @neondatabase/serverless's Pool (WebSocket-based) rather than the simpler `neon()`
// HTTP tagged-template client, because several endpoints need real interactive transactions
// (e.g. atomically claim the next invoice number *and* insert the invoice in one commit) —
// not just a batch of independent queries.
import { Pool } from '@neondatabase/serverless';

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — connect a database in the Vercel Storage tab.');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

// One-off query outside a transaction.
export async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Runs `fn(client)` inside BEGIN/COMMIT, rolling back on any thrown error. `fn` should use
// the passed `client` for every query so they all share the same transaction.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Atomically claims the next value for a sequence key (invoice_seq/quote_seq/po_seq/gp_seq)
// inside an existing transaction client — call this from within withTransaction() alongside
// the record insert so the claim and the insert commit together.
export async function nextSeq(client, key) {
  const { rows } = await client.query(
    'UPDATE sequences SET value = value + 1 WHERE key = $1 RETURNING value',
    [key]
  );
  if (!rows.length) throw new Error(`Unknown sequence key: ${key}`);
  return rows[0].value;
}

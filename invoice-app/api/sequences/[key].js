import { query } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

const ALLOWED = new Set(['invoice_seq', 'quote_seq', 'po_seq', 'gp_seq']);

// Non-mutating preview of "what the next number would currently be" — for display in the
// builder forms' read-only number field before the record is actually saved. The real,
// collision-safe number is only assigned at save time via nextSeq() inside each create
// endpoint's transaction; this is purely cosmetic and can be stale by the time of save if
// another device saves in between (expected and harmless — the field is read-only and gets
// corrected to the real assigned number in the create response).
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.query.key;
  if (!ALLOWED.has(key)) return res.status(400).json({ error: 'Unknown sequence key' });

  const { rows: [row] } = await query('SELECT value FROM sequences WHERE key = $1', [key]);
  res.status(200).json({ next: (row?.value || 0) + 1 });
}

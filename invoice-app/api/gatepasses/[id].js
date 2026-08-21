import { query } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { rowCount } = await query('DELETE FROM gate_passes WHERE id = $1', [req.query.id]);
  if (!rowCount) return res.status(404).json({ error: 'Gate pass not found' });
  res.status(200).json({ ok: true });
}

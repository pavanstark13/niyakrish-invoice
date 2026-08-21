import bcrypt from 'bcryptjs';
import { query } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const { currentPassword, newUsername, newPassword } = req.body || {};
  if (!currentPassword || !newUsername || !newPassword) {
    return res.status(400).json({ error: 'Fill all fields.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const { rows } = await query('SELECT password_hash FROM auth_credentials WHERE id = 1');
  if (!rows.length) return res.status(500).json({ error: 'No credentials configured.' });

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await query(
    'UPDATE auth_credentials SET username = $1, password_hash = $2, updated_at = now() WHERE id = 1',
    [newUsername, newHash]
  );
  res.status(200).json({ ok: true });
}

import bcrypt from 'bcryptjs';
import { query } from '../_lib/db.js';

// One-time setup of the admin login. Guarded by SESSION_SECRET (same as init-schema.js) AND
// only works while auth_credentials is empty — so this can't be used to silently reset the
// password later; use POST /api/auth/change-password (which requires being logged in) for that.
//
// Usage (run this yourself — your new password goes straight from your terminal to the
// database, never through chat):
//   curl -X POST https://<your-preview-url>/api/admin/bootstrap-auth \
//     -H "Authorization: Bearer <SESSION_SECRET>" \
//     -H "Content-Type: application/json" \
//     -d '{"username":"admin","password":"choose-a-real-password"}'
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.SESSION_SECRET;
  if (!secret) return res.status(500).json({ error: 'SESSION_SECRET is not set in Vercel env vars.' });
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'username and password (min 6 chars) are required' });
  }

  const { rows } = await query('SELECT id FROM auth_credentials WHERE id = 1');
  if (rows.length) return res.status(409).json({ error: 'Already set up — use /api/auth/change-password instead.' });

  const hash = await bcrypt.hash(password, 12);
  await query('INSERT INTO auth_credentials (id, username, password_hash) VALUES (1, $1, $2)', [username, hash]);
  res.status(201).json({ ok: true });
}

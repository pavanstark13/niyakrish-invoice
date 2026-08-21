import bcrypt from 'bcryptjs';
import { query } from '../_lib/db.js';
import { signSession, setSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const { rows } = await query('SELECT username, password_hash FROM auth_credentials WHERE id = 1');
  if (!rows.length) return res.status(500).json({ error: 'No credentials configured — run schema.sql and set an initial password.' });

  const cred = rows[0];
  const ok = cred.username === username && await bcrypt.compare(password, cred.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect username or password' });

  setSessionCookie(res, signSession(cred.username));
  res.status(200).json({ username: cred.username });
}

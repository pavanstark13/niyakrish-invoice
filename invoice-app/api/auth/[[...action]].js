// Consolidated auth routes — Vercel's Hobby plan caps a deployment at 12 serverless
// functions, so login/logout/me/change-password share one catch-all function instead of
// four separate files (see api/invoices/[[...path]].js for the same pattern applied to
// resources with more than one operation).
import bcrypt from 'bcryptjs';
import { query } from '../_lib/db.js';
import { signSession, setSessionCookie, clearSessionCookie, getSession, requireAuth } from '../_lib/auth.js';

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const { rows } = await query('SELECT username, password_hash FROM auth_credentials WHERE id = 1');
  if (!rows.length) return res.status(500).json({ error: 'No credentials configured — see api/admin/bootstrap-auth.' });

  const cred = rows[0];
  const ok = cred.username === username && await bcrypt.compare(password, cred.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect username or password' });

  setSessionCookie(res, signSession(cred.username));
  res.status(200).json({ username: cred.username });
}

async function logout(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

async function me(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  res.status(200).json({ username: session.sub });
}

async function changePassword(req, res) {
  if (!requireAuth(req, res)) return;
  const { currentPassword, newUsername, newPassword } = req.body || {};
  if (!currentPassword || !newUsername || !newPassword) return res.status(400).json({ error: 'Fill all fields.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const { rows } = await query('SELECT password_hash FROM auth_credentials WHERE id = 1');
  if (!rows.length) return res.status(500).json({ error: 'No credentials configured.' });

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE auth_credentials SET username = $1, password_hash = $2, updated_at = now() WHERE id = 1', [newUsername, newHash]);
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  const action = (req.query.action || [])[0];

  if (action === 'login' && req.method === 'POST') return login(req, res);
  if (action === 'logout' && req.method === 'POST') return logout(req, res);
  if (action === 'me' && req.method === 'GET') return me(req, res);
  if (action === 'change-password' && req.method === 'POST') return changePassword(req, res);
  res.status(404).json({ error: 'Not found' });
}

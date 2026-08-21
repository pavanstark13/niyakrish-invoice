import { getSession } from '../_lib/auth.js';

// Used by the frontend on load to check whether the session cookie is still valid, instead
// of trusting a client-side flag.
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  res.status(200).json({ username: session.sub });
}

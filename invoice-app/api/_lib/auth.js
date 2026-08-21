// Session handling shared by every API route.
//
// Replaces the old app's `sessionStorage.getItem('niyakrish_auth')` flag — which anyone could
// set from devtools with zero password — with a signed, httpOnly session cookie that the
// server actually verifies on every request. This is the real security boundary; the
// frontend no longer makes any access-control decisions on its own.
import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'niyakrish_session';
const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h — matches a typical business working day

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set.');
  return secret;
}

export function signSession(username) {
  return jwt.sign({ sub: username }, getSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV !== 'development' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

// Returns the session payload ({ sub: username }) if the request has a valid, unexpired
// session cookie, or null otherwise. Never throws.
export function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

// Call at the top of every protected handler: `if (!requireAuth(req, res)) return;`
export function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  return true;
}

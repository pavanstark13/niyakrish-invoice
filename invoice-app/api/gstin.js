// Server-side GSTIN lookup proxy.
//
// Runs as a Vercel serverless function so the browser calls this same-origin endpoint
// instead of routing customer GSTINs (and the appyflow.in API key) through public,
// unauthenticated CORS proxies like corsproxy.io / api.allorigins.win.
//
// Optionally set GST_LOOKUP_API_KEY in the Vercel project's environment variables to use
// a paid/private appyflow.in key instead of their public free-tier "allkey".
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const gstin = (req.query.gstin || '').toString().trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(gstin)) {
    res.status(400).json({ error: 'Invalid GSTIN format' });
    return;
  }

  const apiKey = process.env.GST_LOOKUP_API_KEY || 'allkey';
  const target = `https://appyflow.in/api/verifyGST?gstNo=${encodeURIComponent(gstin)}&key=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(target, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'GST lookup upstream failed' });
  }
}

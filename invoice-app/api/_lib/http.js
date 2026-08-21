// Vercel's plain (non-framework) catch-all functions expose the wildcard segment as a
// single "/"-joined STRING (e.g. "me", or "779/rows"), not an array like Next.js does — so
// every [[...x]].js handler needs to split it back into segments itself.
export function pathSegments(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value; // defensive, in case the runtime ever changes this
  return String(value).split('/').filter(Boolean);
}

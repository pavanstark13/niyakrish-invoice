// ── localStorage abstraction layer ────────────────────────────────────────────
// All reads go through _lsCache to avoid redundant JSON.parse on hot paths.
// All writes update the cache first, then persist to localStorage.
// On QuotaExceededError the cache is rolled back and an error is surfaced.

const _lsCache = Object.create(null);

function _lsRead(key, defaultJson) {
  if (key in _lsCache) return _lsCache[key];
  try {
    const raw = localStorage.getItem(key);
    _lsCache[key] = JSON.parse(raw !== null ? raw : defaultJson);
  } catch (e) { _lsCache[key] = JSON.parse(defaultJson); }
  return _lsCache[key];
}

function _lsWrite(key, val) {
  const prev = _lsCache[key];
  _lsCache[key] = val;
  const json = JSON.stringify(val);
  try {
    localStorage.setItem(key, json);
  } catch (e) {
    _lsCache[key] = prev; // rollback — keep cache consistent with storage
    console.warn('_lsWrite: localStorage.setItem failed for', key, e);
    showToast('⚠️ Local storage full — data NOT saved. Free up space or archive old records.', 'error');
    throw e; // propagate so callers (cloudPush) don't fire on a failed save
  }
  return json; // returned so cloudPush can reuse the serialised string
}

// Used for incoming cloud data: invalidates cache to force a fresh JSON.parse
// on the next read (avoids serving stale in-memory data after remote writes).
function _lsWriteRaw(key, raw) {
  delete _lsCache[key];
  localStorage.setItem(key, raw);
}

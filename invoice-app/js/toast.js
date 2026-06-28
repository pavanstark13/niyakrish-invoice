// ── Toast notification ────────────────────────────────────────────────────────
// One active timer at a time — rapid successive calls won't stack hidden timers.

let _toastTimer = null;

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type}`;
  t.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.style.display = 'none'; }, APP.TOAST_DURATION_MS);
}

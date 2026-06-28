// ── Authentication ─────────────────────────────────────────────────────────────
// Custom credential system: username + password stored as SHA-256 hash.
// Cloud sync ensures all devices share the latest password change immediately.

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function doLogin() {
  const user = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const btn  = document.getElementById('login-btn');
  const err  = document.getElementById('login-error');
  if (!user || !pass) { err.textContent = 'Enter username and password.'; return; }
  btn.disabled = true; btn.textContent = 'Signing in…'; err.textContent = '';

  const stored       = JSON.parse(localStorage.getItem('app_credentials') || 'null');
  const expectedUser = stored ? stored.username : DEFAULT_USER;
  const expectedHash = stored ? stored.passHash  : await sha256(DEFAULT_USER + ':Niyakrish@690');
  const inputHash    = await sha256(user + ':' + pass);

  if (user === expectedUser && inputHash === expectedHash) {
    sessionStorage.setItem('niyakrish_auth', '1');
    showApp(user);
    if (db) {
      btn.textContent = 'Loading data…';
      await loadFromCloud(false);
      applyCompanySettings(getCompanySettings());
      updateDashboardMetrics();
      renderDashboardCharts();
      loadAutofills();
      const invNoInput = document.getElementById('invoiceNo');
      if (invNoInput) invNoInput.value = peekNextInvoiceNo();
      refreshActiveView();
      startRealtimeSync();
    }
    btn.disabled = false; btn.textContent = 'Sign In';
  } else {
    err.textContent = 'Incorrect username or password.';
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

function doLogout() {
  sessionStorage.removeItem('niyakrish_auth');
  stopRealtimeSync();
  hideApp();
}

async function changeAppPassword(event) {
  if (event) event.preventDefault();
  const curPass  = document.getElementById('cp-current').value;
  const newUser  = document.getElementById('cp-username').value.trim();
  const newPass  = document.getElementById('cp-new').value;
  const confPass = document.getElementById('cp-confirm').value;
  if (!curPass || !newUser || !newPass) { showToast('Fill all fields.', 'error'); return; }
  if (newPass !== confPass)             { showToast('New passwords do not match.', 'error'); return; }
  if (newPass.length < 6)              { showToast('Password must be at least 6 characters.', 'error'); return; }

  const stored       = JSON.parse(localStorage.getItem('app_credentials') || 'null');
  const expectedUser = stored ? stored.username : DEFAULT_USER;
  const expectedHash = stored ? stored.passHash  : await sha256(DEFAULT_USER + ':Niyakrish@690');
  const curHash      = await sha256(expectedUser + ':' + curPass);

  if (curHash !== expectedHash) { showToast('Current password is incorrect.', 'error'); return; }

  const newHash  = await sha256(newUser + ':' + newPass);
  const newCreds = JSON.stringify({ username: newUser, passHash: newHash });
  localStorage.setItem('app_credentials', newCreds);
  cloudPush('app_credentials', newCreds);
  ['cp-current','cp-new','cp-confirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  showToast('✓ Login credentials updated successfully!', 'success');
}

function showApp(username) {
  document.getElementById('login-overlay').classList.add('hidden');
  const el = document.getElementById('logged-in-user');
  if (el) el.textContent = '👤 ' + username;
}

function hideApp() {
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
}

function checkAuth() {
  if (sessionStorage.getItem('niyakrish_auth')) {
    const stored = JSON.parse(localStorage.getItem('app_credentials') || 'null');
    showApp(stored ? stored.username : DEFAULT_USER);
    return true;
  }
  return false;
}

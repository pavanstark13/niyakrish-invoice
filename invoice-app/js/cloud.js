// ── Firebase / Firestore cloud layer ──────────────────────────────────────────
// Handles Firebase initialisation, push/pull to Firestore, and the real-time
// onSnapshot listeners that keep all logged-in devices in sync automatically.

let db = null;

// ── Firebase init ─────────────────────────────────────────────────────────────
function initFirebase() {
  const stored = localStorage.getItem('firebase_config');
  const cfg    = stored ? stored : JSON.stringify(DEFAULT_FIREBASE_CONFIG);
  if (!stored) localStorage.setItem('firebase_config', cfg);
  try {
    const config = JSON.parse(cfg);
    if (!firebase.apps.length) firebase.initializeApp(config);
    db = firebase.firestore();
    updateCloudStatus('connected');
    populateFirebaseForm(config);
  } catch (e) {
    db = null;
    updateCloudStatus('error');
    console.warn('Firebase init failed:', e);
  }
}

function populateFirebaseForm(cfg) {
  ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'].forEach(k => {
    const el = document.getElementById('fb-' + k);
    if (el && cfg[k]) el.value = cfg[k];
  });
}

function saveFirebaseConfig() {
  const config = {
    apiKey:            document.getElementById('fb-apiKey').value.trim(),
    authDomain:        document.getElementById('fb-authDomain').value.trim(),
    projectId:         document.getElementById('fb-projectId').value.trim(),
    storageBucket:     document.getElementById('fb-storageBucket').value.trim(),
    messagingSenderId: document.getElementById('fb-messagingSenderId').value.trim(),
    appId:             document.getElementById('fb-appId').value.trim(),
  };
  if (!config.apiKey || !config.projectId) { alert('API Key and Project ID are required.'); return; }
  localStorage.setItem('firebase_config', JSON.stringify(config));
  if (!firebase.apps.length) {
    try { firebase.initializeApp(config); db = firebase.firestore(); updateCloudStatus('connected'); }
    catch (e) { updateCloudStatus('error'); alert('Firebase error: ' + e.message); }
  } else {
    db = firebase.app().firestore();
    updateCloudStatus('connected');
  }
}

function disconnectFirebase() {
  if (!confirm('Remove Firebase connection from this device?')) return;
  localStorage.removeItem('firebase_config');
  db = null;
  updateCloudStatus('offline');
  ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'].forEach(k => {
    const el = document.getElementById('fb-' + k); if (el) el.value = '';
  });
}

// ── Cloud push / pull ─────────────────────────────────────────────────────────
// Dedup flags ensure the user sees each warning at most once per session.
let _cloudPushErrorShown = false;
let _cloudSizeWarnShown  = false;

function cloudPush(key, value) {
  if (!db) return;
  const sizeBytes = new Blob([typeof value === 'string' ? value : JSON.stringify(value)]).size;
  if (sizeBytes > 900_000) {
    console.warn(`cloudPush: '${key}' is ${(sizeBytes/1024).toFixed(0)} KB — approaching Firestore 1 MB doc limit`);
    if (!_cloudSizeWarnShown) {
      _cloudSizeWarnShown = true;
      showToast(`⚠️ "${key}" is ${(sizeBytes/1024).toFixed(0)} KB — nearing cloud storage limit. Archive old records to avoid sync failures.`, 'warning');
    }
  }
  db.collection('niyakrish_data').doc(key).set({ value, ts: Date.now() })
    .catch(e => {
      console.warn('Cloud push failed for ' + key + ':', e);
      updateCloudStatus('error');
      if (!_cloudPushErrorShown) {
        _cloudPushErrorShown = true;
        showToast('⚠️ Cloud save failed — check Firebase rules or connection. Data saved locally only.', 'error');
      }
    });
}

async function cloudPull(key) {
  if (!db) return null;
  try {
    const snap = await db.collection('niyakrish_data').doc(key).get();
    if (snap.exists) return snap.data().value;
  } catch (e) {
    console.warn('Cloud pull failed for ' + key + ':', e);
    throw e;
  }
  return null;
}

async function loadFromCloud(manual) {
  if (!db) { if (manual) showToast('No cloud connection. Configure Firebase in Data Center.', 'error'); return; }
  updateCloudStatus('syncing');
  let loaded = 0, failed = 0;
  for (const key of CLOUD_KEYS) {
    try {
      const val = await cloudPull(key);
      if (val !== null) { _lsWriteRaw(key, val); loaded++; }
    } catch (e) { failed++; }
  }
  if (failed > 0) {
    updateCloudStatus('error');
    if (manual) showToast('⚠️ Cloud sync failed (' + failed + ' errors). Check Firestore security rules — allow read, write for niyakrish_data collection.', 'error');
  } else {
    updateCloudStatus('connected');
    _cloudPushErrorShown = false;
    _cloudSizeWarnShown  = false;
    if (manual) { showToast('✓ Loaded ' + loaded + ' collections from cloud.', 'success'); location.reload(); }
  }
}

async function syncLocalToCloud() {
  if (!db) { showToast('No cloud connection. Configure Firebase in Data Center.', 'error'); return; }
  updateCloudStatus('syncing');
  let pushed = 0, failed = 0, skipped = 0;
  for (const key of CLOUD_KEYS) {
    const val = localStorage.getItem(key);
    if (!val) continue;
    const sizeBytes = new Blob([val]).size;
    if (sizeBytes > 900_000) {
      console.warn(`syncLocalToCloud: '${key}' is ${(sizeBytes/1024).toFixed(0)} KB — skipping to avoid Firestore 1 MB rejection`);
      skipped++;
      continue;
    }
    try {
      await db.collection('niyakrish_data').doc(key).set({ value: val, ts: Date.now() });
      pushed++;
    } catch (e) { failed++; console.warn('Sync push failed for ' + key + ':', e); }
  }
  if (skipped > 0) showToast(`⚠️ ${skipped} collection(s) too large to sync (>900 KB). Archive old records first, then retry.`, 'warning');
  if (failed > 0) {
    updateCloudStatus('error');
    showToast('⚠️ Cloud push failed for ' + failed + ' collections. Check Firebase rules in Data Center.', 'error');
  } else if (pushed > 0) {
    updateCloudStatus('connected');
    showToast('✓ All local data (' + pushed + ' collections) pushed to cloud successfully!', 'success');
  }
}

// ── Cloud status indicator ────────────────────────────────────────────────────
function updateCloudStatus(state) {
  let text, color;
  switch (state) {
    case 'connected': text = '☁️ Cloud Sync Active — Auto-saving to Firebase'; color = '#10b981'; break;
    case 'syncing':   text = '⏳ Syncing with cloud…';                         color = '#f59e0b'; break;
    case 'error':     text = '⚠️ Cloud Error — Running in Offline Mode';       color = '#ef4444'; break;
    default:          text = '💾 Safe Offline Storage Active';                  color = '#6b7280';
  }
  [document.getElementById('backup-status-text'), document.getElementById('cloud-sync-status')]
    .forEach(el => { if (el) { el.textContent = text; el.style.color = color; } });
}

// ── Real-time cross-device sync ───────────────────────────────────────────────
let _realtimeUnsubs = [];

function startRealtimeSync() {
  if (!db) return;
  stopRealtimeSync();
  const keysToWatch = [...CLOUD_KEYS, 'app_credentials'];
  keysToWatch.forEach(key => {
    try {
      const unsub = db.collection('niyakrish_data').doc(key).onSnapshot(snap => {
        if (!snap.exists) return;
        const incoming = snap.data().value;
        if (incoming == null) return;
        if (incoming === localStorage.getItem(key)) return; // own write echoing back
        _lsWriteRaw(key, incoming);
        if (!sessionStorage.getItem('niyakrish_auth')) return;
        _applyRealtimeUpdate(key);
      }, err => {
        console.warn('Realtime listener error for', key, err);
        if (err.code === 'permission-denied') updateCloudStatus('error');
      });
      _realtimeUnsubs.push(unsub);
    } catch (e) { console.warn('Could not start listener for', key, e); }
  });
}

function stopRealtimeSync() {
  _realtimeUnsubs.forEach(fn => { try { fn(); } catch (e) {} });
  _realtimeUnsubs = [];
}

function _applyRealtimeUpdate(key) {
  if (key === 'company_settings') {
    applyCompanySettings(getCompanySettings());
    populateQuoteCompanyHeader();
    populatePOCompanyHeader();
  }
  const isDataKey = ['invoices','invoice_payments','invoice_customers','invoice_gatepasses','invoice_seq','gp_seq'].includes(key);
  if (isDataKey) {
    updateDashboardMetrics();
    if (_isDashboardActive()) renderDashboardCharts();
  }
  if (key === 'invoice_customers') { _customersGeneration++; loadAutofills(); populateQCustList(); }
  if (key === 'invoice_seq' || key === 'gp_seq') {
    const el = document.getElementById('invoiceNo');
    if (el) el.value = peekNextInvoiceNo();
  }
  refreshActiveView();
}

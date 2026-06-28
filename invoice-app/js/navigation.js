// ── View switching & sidebar ───────────────────────────────────────────────────
// Caches references to the active panel and menu item to avoid repeated
// querySelectorAll scans on every navigation event.

const VIEW_LABELS = {
  dashboard: 'Dashboard',    invoice:       'Invoice Builder',
  history:   'History',      gatepass:      'Gate Pass',
  gphistory: 'GP History',   customers:     'Customers',
  payments:  'Payments',     ledger:        'Ledger',
  datacenter:'Data Center',  settings:      'Settings',
  quotation: 'Quotation Builder', qhistory: 'Quotations',
  purchaseorder: 'Purchase Order', pohistory: 'PO History',
};

let _activePanel   = null;
let _activeMenuBtn = null;
let _viewMenuMap   = null; // viewId → .menu-item element, built once on first switchView call

function _buildViewMenuMap() {
  _viewMenuMap = {};
  document.querySelectorAll('.menu-item').forEach(item => {
    const oc = item.getAttribute('onclick') || '';
    const m  = oc.match(/switchView\('(\w+)'\)/);
    if (m) _viewMenuMap[m[1]] = item;
  });
}

function switchView(viewId) {
  if (!_viewMenuMap) _buildViewMenuMap();

  if (_activePanel)   _activePanel.classList.remove('active');
  if (_activeMenuBtn) _activeMenuBtn.classList.remove('active');

  _activePanel = document.getElementById('view-' + viewId);
  if (_activePanel) _activePanel.classList.add('active');

  _activeMenuBtn = _viewMenuMap[viewId] || null;
  if (_activeMenuBtn) _activeMenuBtn.classList.add('active');

  const label = document.getElementById('mobile-view-label');
  if (label) label.textContent = VIEW_LABELS[viewId] || '';

  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewId === 'dashboard')      { updateDashboardMetrics(); renderDashboardCharts(); }
  else if (viewId === 'history')   { renderHistoryView(); }
  else if (viewId === 'customers') { renderCustomersTable(); resetCustomerForm(); }
  else if (viewId === 'payments')  { loadCustomerSelects(); renderPaymentsHistoryTable(); }
  else if (viewId === 'ledger')    { loadCustomerSelects(); }
  else if (viewId === 'gphistory') { renderGPHistoryView(); }
  else if (viewId === 'settings')  { loadCompanySettingsForm(); }
  else if (viewId === 'qhistory')  { renderQHistoryView(); }
  else if (viewId === 'pohistory') { renderPOHistoryView(); }
  else if (viewId === 'quotation') { populateQuoteCompanyHeader(); populateQCustList(); }
  else if (viewId === 'purchaseorder') { populatePOCompanyHeader(); }

  loadAutofills();
}

// ── Mobile sidebar ────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const isOpen   = sidebar.classList.contains('open');
  isOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('visible');
  document.getElementById('hamburger-btn').classList.add('open');
}

function closeSidebar() {
  const sidebar   = document.querySelector('.sidebar');
  const backdrop  = document.getElementById('sidebar-backdrop');
  const hamburger = document.getElementById('hamburger-btn');
  if (sidebar)   sidebar.classList.remove('open');
  if (backdrop)  backdrop.classList.remove('visible');
  if (hamburger) hamburger.classList.remove('open');
}

// Re-renders whichever view is currently active (used after cloud data pull).
function refreshActiveView() {
  const activePanel = document.querySelector('.view-panel.active');
  if (!activePanel) return;
  const viewId = activePanel.id.replace('view-', '');
  if (viewId === 'history')        { renderHistoryView(); }
  else if (viewId === 'customers') { renderCustomersTable(); resetCustomerForm(); }
  else if (viewId === 'payments')  { loadCustomerSelects(); renderPaymentsHistoryTable(); }
  else if (viewId === 'ledger')    { loadCustomerSelects(); }
  else if (viewId === 'gphistory') { renderGPHistoryView(); }
  else if (viewId === 'dashboard') { updateDashboardMetrics(); renderDashboardCharts(); }
  else if (viewId === 'qhistory')  { renderQHistoryView(); }
  else if (viewId === 'pohistory') { renderPOHistoryView(); }
  loadAutofills();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });

// ── Domain data access layer ──────────────────────────────────────────────────
// All reads/writes go through _lsRead / _lsWrite (cache + localStorage).
// Every write also pushes to Firestore (cloudPush) and updates the dashboard.
// Dashboard chart render is gated: only fires when the dashboard panel is active.

// Returns true only when the dashboard panel is the visible view.
function _isDashboardActive() {
  return document.getElementById('view-dashboard')?.classList.contains('active') ?? false;
}

// ── Invoice ──────────────────────────────────────────────────────────────────
function getStoredInvoices()  { return _lsRead('invoices',           '[]'); }
function saveStoredInvoices(arr) {
  cloudPush('invoices', _lsWrite('invoices', arr));
  updateDashboardMetrics();
  if (_isDashboardActive()) renderDashboardCharts();
}

// ── Customers ─────────────────────────────────────────────────────────────────
// _customersGeneration is bumped on every write so loadAutofills() can skip
// rebuilding dropdown HTML when nothing has actually changed.
let _customersGeneration = 0;
function getStoredCustomers() { return _lsRead('invoice_customers', '[]'); }
function saveStoredCustomers(arr) {
  cloudPush('invoice_customers', _lsWrite('invoice_customers', arr));
  _customersGeneration++;
  updateDashboardMetrics();
}

// ── Payments ──────────────────────────────────────────────────────────────────
function getStoredPayments()  { return _lsRead('invoice_payments', '[]'); }
function saveStoredPayments(arr) {
  cloudPush('invoice_payments', _lsWrite('invoice_payments', arr));
  updateDashboardMetrics();
  if (_isDashboardActive()) renderDashboardCharts();
}

// ── Gate passes ───────────────────────────────────────────────────────────────
function getStoredGatePasses() { return _lsRead('invoice_gatepasses', '[]'); }
function saveStoredGatePasses(arr) {
  cloudPush('invoice_gatepasses', _lsWrite('invoice_gatepasses', arr));
  updateDashboardMetrics();
}

// ── Quotations ────────────────────────────────────────────────────────────────
function getStoredQuotations() { return _lsRead('quotations', '[]'); }
function saveStoredQuotations(arr) { cloudPush('quotations', _lsWrite('quotations', arr)); }

// ── Purchase orders ───────────────────────────────────────────────────────────
function getStoredPOs() { return _lsRead('purchase_orders', '[]'); }
function saveStoredPOs(arr) { cloudPush('purchase_orders', _lsWrite('purchase_orders', arr)); }

// ── Company settings ──────────────────────────────────────────────────────────
function getCompanySettings() {
  return _lsRead('company_settings', JSON.stringify({
    name:'', gstin:'', address:'', phone:'', email:'', logo:''
  }));
}

// ── Invoice sequence ──────────────────────────────────────────────────────────
// MIN_SEQ prevents the auto counter from ever falling below the historical floor.
const MIN_SEQ = 778;
function getSeq() {
  const v = localStorage.getItem('invoice_seq');
  const n = v !== null ? parseInt(v, 10) : 0;
  if (n < MIN_SEQ) {
    localStorage.setItem('invoice_seq', String(MIN_SEQ));
    cloudPush('invoice_seq', String(MIN_SEQ));
    return MIN_SEQ;
  }
  return n;
}
function setSeq(v) {
  localStorage.setItem('invoice_seq', String(v));
  cloudPush('invoice_seq', String(v));
  updateDashboardMetrics();
}
function pad(n) { return String(n).padStart(3, '0'); }
function peekNextInvoiceNo()    { return pad(getSeq() + 1); }
function consumeNextInvoiceNo() { const next = getSeq() + 1; setSeq(next); return pad(next); }

// ── Quotation sequence ────────────────────────────────────────────────────────
function getQuoteSeq()  { return parseInt(localStorage.getItem('quote_seq') || '0', 10); }
function setQuoteSeq(v) { localStorage.setItem('quote_seq', String(v)); cloudPush('quote_seq', String(v)); }
function consumeNextQuoteNo() { const n = getQuoteSeq()+1; setQuoteSeq(n); return 'QT-'+String(n).padStart(3,'0'); }
function peekNextQuoteNo()    { return 'QT-'+String(getQuoteSeq()+1).padStart(3,'0'); }

// ── Purchase-order sequence ───────────────────────────────────────────────────
function getPOSeq()  { return parseInt(localStorage.getItem('po_seq') || '0', 10); }
function setPOSeq(v) { localStorage.setItem('po_seq', String(v)); cloudPush('po_seq', String(v)); }
function consumeNextPONo() { const n = getPOSeq()+1; setPOSeq(n); return 'PO-'+String(n).padStart(3,'0'); }
function peekNextPONo()    { return 'PO-'+String(getPOSeq()+1).padStart(3,'0'); }

// ── Overdue detection ─────────────────────────────────────────────────────────
// Uses ISO string comparison to avoid creating Date objects per invoice.
function getOverdueInvoices() {
  const todayStr = _localDateStr();      // 'YYYY-MM-DD' — computed once
  const todayMs  = Date.parse(todayStr); // millisecond timestamp — computed once
  return getStoredInvoices().filter(inv => {
    if ((inv.status || 'Unpaid') === 'Paid') return false;
    if (inv.dueDate)     return inv.dueDate.slice(0, 10) < todayStr;
    if (inv.invoiceDate) return (todayMs - Date.parse(inv.invoiceDate.slice(0, 10))) / 86400000 > 45;
    return false;
  });
}

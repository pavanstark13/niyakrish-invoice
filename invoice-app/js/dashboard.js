// ── Dashboard metrics & SVG charts ───────────────────────────────────────────
// _updateSidebarBadge always runs (badge is always visible in the sidebar).
// The heavier stat cards and charts only run when the dashboard panel is active.

function _updateSidebarBadge(invs) {
  const unpaidCount = (invs || getStoredInvoices()).filter(i => (i.status || 'Unpaid') !== 'Paid').length;
  const badge = document.getElementById('unpaid-badge');
  if (badge) {
    badge.textContent    = unpaidCount > 0 ? unpaidCount : '';
    badge.style.display  = unpaidCount > 0 ? 'inline-block' : 'none';
  }
}

function updateDashboardMetrics() {
  const invs = getStoredInvoices();
  _updateSidebarBadge(invs);
  if (!_isDashboardActive()) return;

  const pays = getStoredPayments();
  const gps  = getStoredGatePasses();

  const billed      = invs.reduce((sum, i) => sum + (i.totals?.netAmount || 0), 0);
  const collected   = pays.reduce((sum, p) => sum + (p.amount || 0), 0);
  const outstanding = billed - collected;

  document.getElementById('stat-billed').textContent      = '₹' + formatNum(billed);
  document.getElementById('stat-collected').textContent   = '₹' + formatNum(collected);
  document.getElementById('stat-outstanding').textContent = '₹' + formatNum(outstanding);
  document.getElementById('stat-gatepasses').textContent  = gps.length;

  const overdueInvs = getOverdueInvoices();
  const overdueEl   = document.getElementById('stat-overdue');
  const overdueCard = document.getElementById('stat-overdue-card');
  if (overdueEl)   overdueEl.textContent       = overdueInvs.length;
  if (overdueCard) overdueCard.style.borderColor = overdueInvs.length > 0 ? '#ef4444' : 'var(--border-color)';
}

function renderDashboardCharts() {
  const invoices = getStoredInvoices();
  const payments = getStoredPayments();

  // ── Bar chart: Sales vs Collections (last 6 months) ──────────────────────
  // Map keyed by 'YYYY-MM' for O(1) lookup — avoids new Date() per invoice.
  const months   = [];
  const monthMap = new Map();
  const now      = new Date();
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${_pad2(d.getMonth()+1)}`;
    const entry = { label: d.toLocaleDateString('en-IN', { month: 'short' }), billed: 0, collected: 0 };
    months.push(entry);
    monthMap.set(key, entry);
  }

  invoices.forEach(inv => {
    if (!inv.invoiceDate) return;
    const match = monthMap.get(inv.invoiceDate.slice(0, 7));
    if (match) match.billed += inv.totals?.netAmount || 0;
  });
  payments.forEach(p => {
    if (!p.date) return;
    const match = monthMap.get(p.date.slice(0, 7));
    if (match) match.collected += p.amount || 0;
  });

  const maxVal        = Math.max(...months.map(x => Math.max(x.billed, x.collected)), 10000);
  const chartContainer = document.getElementById('revenue-chart-container');

  let svgHtml = `<svg viewBox="0 0 550 220" style="width:100%; height:100%; font-family:inherit;">
    <line x1="50" y1="30"  x2="500" y2="30"  stroke="#f1f5f9" stroke-width="1" />
    <line x1="50" y1="80"  x2="500" y2="80"  stroke="#f1f5f9" stroke-width="1" />
    <line x1="50" y1="130" x2="500" y2="130" stroke="#f1f5f9" stroke-width="1" />
    <line x1="50" y1="170" x2="500" y2="170" stroke="#cbd5e1" stroke-width="1" />
    <text x="40" y="34"  font-size="9" fill="#94a3b8" text-anchor="end">₹${(maxVal/1000).toFixed(0)}k</text>
    <text x="40" y="84"  font-size="9" fill="#94a3b8" text-anchor="end">₹${(maxVal/2000).toFixed(0)}k</text>
    <text x="40" y="134" font-size="9" fill="#94a3b8" text-anchor="end">₹0</text>
  `;
  months.forEach((m, idx) => {
    const xOffset    = 70 + idx * 72;
    const billedH    = (m.billed    / maxVal) * 130;
    const collectedH = (m.collected / maxVal) * 130;
    svgHtml += `
      <rect x="${xOffset}"      y="${170-billedH}"    width="16" height="${billedH}"    fill="#4f46e5" rx="3" title="Billed: ₹${formatNum(m.billed)}"/>
      <rect x="${xOffset + 20}" y="${170-collectedH}" width="16" height="${collectedH}" fill="#10b981" rx="3" title="Collected: ₹${formatNum(m.collected)}"/>
      <text x="${xOffset + 18}" y="190" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">${m.label}</text>`;
  });
  svgHtml += `
    <rect x="180" y="205" width="10" height="10" fill="#4f46e5" rx="2"/>
    <text x="196"  y="214" font-size="10" fill="#475569">Billed (Sales)</text>
    <rect x="290" y="205" width="10" height="10" fill="#10b981" rx="2"/>
    <text x="306"  y="214" font-size="10" fill="#475569">Collected (Payments)</text>
  </svg>`;
  if (chartContainer) chartContainer.innerHTML = svgHtml;

  // ── Concentration bars: Top 4 customers ──────────────────────────────────
  const clientBalances = {};
  invoices.forEach(i => {
    const c = i.customer?.name || 'Unknown';
    clientBalances[c] = (clientBalances[c] || 0) + (i.totals?.netAmount || 0);
  });
  const sortedClients  = Object.entries(clientBalances).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const concContainer  = document.getElementById('concentration-chart-container');
  if (!concContainer) return;
  if (sortedClients.length === 0) {
    concContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:12px;">No sales records logged yet.</div>`;
    return;
  }
  const maxVolume = sortedClients[0][1] || 1;
  concContainer.innerHTML = sortedClients.map(([name, val]) => {
    const pct = (val / maxVolume) * 100;
    return `<div style="font-size:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-weight:600;">
        <span style="color:var(--primary-light);text-overflow:ellipsis;overflow:hidden;white-space:nowrap;max-width:180px;">${escapeHtml(name)}</span>
        <span style="color:var(--accent);">₹${formatNum(val)}</span>
      </div>
      <div style="width:100%;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:4px;"></div>
      </div>
    </div>`;
  }).join('');
}

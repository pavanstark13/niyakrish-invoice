// ── Pagination engine ─────────────────────────────────────────────────────────
// Shared by all six table views. Each view has its own page cursor in _page.
// _pagSlice() slices the full sorted array and records the total for _pagRow().
// _pagRow()  renders prev/next controls (returns '' when everything fits on one page).
// _pageGo()  moves the cursor and re-renders the affected view.

const PAGE_SIZE  = 30;
const _page      = { history: 0, customers: 0, payments: 0, qhistory: 0, pohistory: 0, gphistory: 0 };
const _pageTotal = {};

function _pageGo(key, dir) {
  const pages = Math.ceil((_pageTotal[key] || 1) / PAGE_SIZE);
  _page[key]  = Math.max(0, Math.min((_page[key] || 0) + dir, pages - 1));
  ({
    history:   () => renderHistoryView(true),
    customers: () => renderCustomersTable(true),
    payments:  () => renderPaymentsHistoryTable(true),
    qhistory:  () => renderQHistoryView(true),
    pohistory: () => renderPOHistoryView(true),
    gphistory: () => renderGPHistoryView(true),
  })[key]?.();
}

// Slices arr to the current page. keepPage=false (default) resets to page 0.
function _pagSlice(arr, key, keepPage = false) {
  if (!keepPage) _page[key] = 0;
  _pageTotal[key] = arr.length;
  const pages = Math.ceil(arr.length / PAGE_SIZE) || 1;
  if (_page[key] >= pages) _page[key] = pages - 1;
  const p = _page[key];
  return arr.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
}

// Returns a full-width <tr> with Prev/Next buttons, or '' if not needed.
function _pagRow(key, colSpan) {
  const total = _pageTotal[key] || 0;
  if (total <= PAGE_SIZE) return '';
  const p     = _page[key] || 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const from  = p * PAGE_SIZE + 1;
  const to    = Math.min((p + 1) * PAGE_SIZE, total);
  return `<tr><td colspan="${colSpan}" style="padding:0;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;font-size:12px;color:var(--text-muted);">
      <span>${from}–${to} of <strong style="color:var(--text-main);">${total}</strong> records</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="btn secondary" style="padding:3px 10px;font-size:11px;" onclick="_pageGo('${key}',-1)" ${p===0?'disabled':''}>‹ Prev</button>
        <span style="font-weight:700;color:var(--text-main);min-width:60px;text-align:center;">Page ${p+1} / ${pages}</span>
        <button class="btn secondary" style="padding:3px 10px;font-size:11px;" onclick="_pageGo('${key}',1)" ${p>=pages-1?'disabled':''}>Next ›</button>
      </div>
    </div>
  </td></tr>`;
}

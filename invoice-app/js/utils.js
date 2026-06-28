// ── Pure utility functions ─────────────────────────────────────────────────────
// No DOM reads, no Firebase, no side-effects. Safe to call anywhere.

// Number formatting — single Intl instance reused across all calls.
const _numFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatNum(n) { return _numFmt.format(Number(n || 0)); }

// Strips thousands separators before parsing — handles formatted input fields.
function toNumber(v) { return Number((v || '').toString().replace(/,/g, '')) || 0; }

function _pad2(n) { return String(n).padStart(2, '0'); }

function _localDateTimeStr(d) {
  const n = d || new Date();
  return `${n.getFullYear()}-${_pad2(n.getMonth()+1)}-${_pad2(n.getDate())}T${_pad2(n.getHours())}:${_pad2(n.getMinutes())}`;
}

function _localDateStr(d) {
  const n = d || new Date();
  return `${n.getFullYear()}-${_pad2(n.getMonth()+1)}-${_pad2(n.getDate())}`;
}

function numberToWords(num) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
             'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function inWords(n) {
    if (n < 20)       return a[n];
    if (n < 100)      return b[Math.floor(n/10)] + (n%10 ? ' ' + a[n%10] : '');
    if (n < 1000)     return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + inWords(n%100) : '');
    if (n < 100000)   return inWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + inWords(n%1000) : '');
    if (n < 10000000) return inWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + inWords(n%100000) : '');
    return inWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + inWords(n%10000000) : '');
  }
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);
  let out = (rupees === 0 ? 'Zero' : inWords(rupees)) + ' Rupees';
  if (paise) out += ' and ' + inWords(paise) + ' Paise';
  return out + ' Only';
}

// Escapes user-supplied strings before inserting into innerHTML.
function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Triggers a browser CSV download without a server round-trip.
function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Centralised customer-name comparator — normalises whitespace and case.
function _nameMatch(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

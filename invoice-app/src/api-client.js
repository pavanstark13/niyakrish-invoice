// Thin fetch wrapper for the backend API (invoice-app/api/) — replaces the old app's direct
// Firestore/localStorage calls. Every call is same-origin with the session cookie attached;
// the server (not the browser) is the actual access-control boundary now.
//
// Multi-operation resources are dispatched by query string (?no=, ?id=, ?action=) rather
// than a path segment (e.g. /api/invoices?no=779, not /api/invoices/779) — see the comment
// at the top of api/auth.js for why: Vercel's plain file routing doesn't support Next.js-
// style optional catch-all filenames the way it looks like it should.
async function apiFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  let data = null;
  try { data = await res.json(); } catch { /* empty body, e.g. some 204s */ }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

export const Api = {
  auth: {
    login: (username, password) => apiFetch('/auth?action=login', { method: 'POST', body: { username, password } }),
    logout: () => apiFetch('/auth?action=logout', { method: 'POST' }),
    me: () => apiFetch('/auth?action=me'),
    changePassword: (currentPassword, newUsername, newPassword) =>
      apiFetch('/auth?action=change-password', { method: 'POST', body: { currentPassword, newUsername, newPassword } }),
  },

  invoices: {
    list: () => apiFetch('/invoices'),
    create: (inv) => apiFetch('/invoices', { method: 'POST', body: inv }),
    get: (invoiceNo) => apiFetch('/invoices?no=' + enc(invoiceNo)),
    update: (invoiceNo, inv) => apiFetch('/invoices?no=' + enc(invoiceNo), { method: 'PUT', body: inv }),
    delete: (invoiceNo) => apiFetch('/invoices?no=' + enc(invoiceNo), { method: 'DELETE' }),
    markPaid: (invoiceNo) => apiFetch('/invoices?action=mark-paid', { method: 'POST', body: { invoiceNo } }),
  },

  quotations: {
    list: () => apiFetch('/quotations'),
    create: (q) => apiFetch('/quotations', { method: 'POST', body: q }),
    update: (quoteNo, q) => apiFetch('/quotations?no=' + enc(quoteNo), { method: 'PUT', body: q }),
    delete: (quoteNo) => apiFetch('/quotations?no=' + enc(quoteNo), { method: 'DELETE' }),
  },

  purchaseOrders: {
    list: () => apiFetch('/purchase-orders'),
    create: (po) => apiFetch('/purchase-orders', { method: 'POST', body: po }),
    update: (poNo, po) => apiFetch('/purchase-orders?no=' + enc(poNo), { method: 'PUT', body: po }),
    delete: (poNo) => apiFetch('/purchase-orders?no=' + enc(poNo), { method: 'DELETE' }),
  },

  customers: {
    list: () => apiFetch('/customers'),
    create: (c) => apiFetch('/customers', { method: 'POST', body: c }),
    update: (id, c) => apiFetch('/customers?id=' + enc(id), { method: 'PUT', body: c }),
    delete: (id) => apiFetch('/customers?id=' + enc(id), { method: 'DELETE' }),
  },

  payments: {
    list: () => apiFetch('/payments'),
    create: (p) => apiFetch('/payments', { method: 'POST', body: p }),
    delete: (id) => apiFetch('/payments?id=' + enc(id), { method: 'DELETE' }),
  },

  gatePasses: {
    list: () => apiFetch('/gatepasses'),
    create: (g) => apiFetch('/gatepasses', { method: 'POST', body: g }),
    delete: (id) => apiFetch('/gatepasses?id=' + enc(id), { method: 'DELETE' }),
    nextNumber: () => apiFetch('/gatepasses?action=next-number'),
  },

  companySettings: {
    get: () => apiFetch('/company-settings'),
    update: (s) => apiFetch('/company-settings', { method: 'PUT', body: s }),
  },

  sequences: {
    peek: (key) => apiFetch('/sequences?key=' + enc(key)),
  },
};

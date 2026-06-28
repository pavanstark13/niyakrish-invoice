// ── Application-wide constants ────────────────────────────────────────────────
// Single source of truth. Change here; the rest of the app picks it up.

const SCRIPT_URL = ''; // Google Sheets webhook (unused — kept for future integration)

const APP = Object.freeze({
  DEFAULT_HSN_CODE:   '38245010',
  DEFAULT_HSN_DESC:   'READY MIX CONCRETE',
  DEFAULT_PRODUCT:    'Ready Mix Concrete',
  DEFAULT_CGST_PCT:   9,
  DEFAULT_SGST_PCT:   9,
  INVOICE_SEQ_FLOOR:  779,
  TOAST_DURATION_MS:  3500,
  RECALC_DEBOUNCE_MS: 60,
});

// All Firestore document keys — used by cloud sync & push functions.
const CLOUD_KEYS = [
  'invoices', 'invoice_customers', 'invoice_payments', 'invoice_gatepasses',
  'invoice_seq', 'gp_seq', 'company_settings', 'quotations',
  'purchase_orders', 'quote_seq', 'po_seq',
];

// Default Firebase project — overridable via Data Center UI.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAd0FzunhKRf_Mv65awqB86DAeaTif6_oE',
  authDomain:        'niyakrish-invoice.firebaseapp.com',
  projectId:         'niyakrish-invoice',
  storageBucket:     'niyakrish-invoice.firebasestorage.app',
  messagingSenderId: '1007805250679',
  appId:             '1:1007805250679:web:f0ea00778ab3da8871da72',
};

// Default auth (override via Settings → Change Password).
const DEFAULT_USER = 'admin';

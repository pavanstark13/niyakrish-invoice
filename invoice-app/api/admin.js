// One-time setup routes, dispatched by ?action= (see api/auth.js for why not a path segment).
//
// Both guarded by SESSION_SECRET as a bearer token, so schema creation and the initial admin
// password can be set up by curl commands run directly by whoever holds that secret — the
// password itself never has to pass through anyone else.
//
//   curl -X POST "https://<preview-url>/api/admin?action=init-schema" \
//     -H "Authorization: Bearer <SESSION_SECRET>"
//
//   curl -X POST "https://<preview-url>/api/admin?action=bootstrap-auth" \
//     -H "Authorization: Bearer <SESSION_SECRET>" -H "Content-Type: application/json" \
//     -d '{"username":"admin","password":"choose-a-real-password"}'
import bcrypt from 'bcryptjs';
import { query } from './_lib/db.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_credentials (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  username      text NOT NULL,
  password_hash text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sequences (
  key   text PRIMARY KEY,
  value int  NOT NULL DEFAULT 0
);
INSERT INTO sequences (key, value) VALUES
  ('invoice_seq', 778),
  ('quote_seq', 0),
  ('po_seq', 0),
  ('gp_seq', 0)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  phone        text NOT NULL DEFAULT '',
  gstin        text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  site         text NOT NULL DEFAULT '',
  pincode      text NOT NULL DEFAULT '',
  auto_created boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_name_lower_idx ON customers (lower(name));

CREATE TABLE IF NOT EXISTS customer_pricing (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  grade        text NOT NULL,
  rate         numeric(12,2) NOT NULL DEFAULT 0,
  product_name text NOT NULL DEFAULT 'Ready Mix Concrete',
  hsn_code     text NOT NULL DEFAULT '38245010',
  hsn_desc     text NOT NULL DEFAULT 'READY MIX CONCRETE'
);
CREATE INDEX IF NOT EXISTS customer_pricing_customer_idx ON customer_pricing (customer_id);

CREATE TABLE IF NOT EXISTS invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no     text UNIQUE NOT NULL,
  invoice_date   text NOT NULL,
  po_number      text NOT NULL DEFAULT '',
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  customer_gstin text NOT NULL DEFAULT '',
  customer_addr  text NOT NULL DEFAULT '',
  customer_site  text NOT NULL DEFAULT '',
  customer_pin   text NOT NULL DEFAULT '',
  hsn_code       text NOT NULL DEFAULT '38245010',
  hsn_desc       text NOT NULL DEFAULT 'READY MIX CONCRETE',
  product_name   text NOT NULL DEFAULT 'Ready Mix Concrete',
  driver_name    text NOT NULL DEFAULT '',
  vehicle_no     text NOT NULL DEFAULT '',
  sub_total      numeric(14,2) NOT NULL DEFAULT 0,
  cgst_total     numeric(14,2) NOT NULL DEFAULT 0,
  sgst_total     numeric(14,2) NOT NULL DEFAULT 0,
  tcs_amount     numeric(14,2) NOT NULL DEFAULT 0,
  net_amount     numeric(14,2) NOT NULL DEFAULT 0,
  amount_words   text NOT NULL DEFAULT '',
  paid_amount    numeric(14,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'Unpaid',
  remarks        text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices (invoice_date);

CREATE TABLE IF NOT EXISTS invoice_rows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position   int NOT NULL DEFAULT 0,
  grade      text NOT NULL DEFAULT '',
  qty        numeric(12,2) NOT NULL DEFAULT 0,
  rate       numeric(12,2) NOT NULL DEFAULT 0,
  disc_pct   numeric(5,2) NOT NULL DEFAULT 0,
  cgst_pct   numeric(5,2) NOT NULL DEFAULT 9,
  sgst_pct   numeric(5,2) NOT NULL DEFAULT 9
);
CREATE INDEX IF NOT EXISTS invoice_rows_invoice_idx ON invoice_rows (invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  text NOT NULL,
  linked_invoice text,
  date           text NOT NULL,
  amount         numeric(14,2) NOT NULL,
  payment_mode   text NOT NULL DEFAULT 'Cash',
  ref_no         text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (customer_name);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  amount     numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_invoice_idx ON payment_allocations (invoice_no);

CREATE TABLE IF NOT EXISTS gate_passes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gp_no      text UNIQUE NOT NULL,
  gp_date    text NOT NULL,
  vehicle    text NOT NULL DEFAULT '',
  dest       text NOT NULL DEFAULT '',
  driver     text NOT NULL DEFAULT '',
  mtype      text NOT NULL DEFAULT '',
  ptype      text NOT NULL DEFAULT 'Non-Returnable',
  challan    text NOT NULL DEFAULT '',
  total_qty  text NOT NULL DEFAULT '',
  remarks    text NOT NULL DEFAULT '',
  items      jsonb NOT NULL DEFAULT '[]',
  saved_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no             text UNIQUE NOT NULL,
  quote_date           text NOT NULL,
  valid_until          text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'Draft',
  customer_name        text NOT NULL DEFAULT '',
  customer_phone       text NOT NULL DEFAULT '',
  customer_gstin       text NOT NULL DEFAULT '',
  customer_addr        text NOT NULL DEFAULT '',
  customer_site        text NOT NULL DEFAULT '',
  sub_total            numeric(14,2) NOT NULL DEFAULT 0,
  cgst_total           numeric(14,2) NOT NULL DEFAULT 0,
  sgst_total           numeric(14,2) NOT NULL DEFAULT 0,
  net_amount           numeric(14,2) NOT NULL DEFAULT 0,
  terms                text NOT NULL DEFAULT '',
  notes                text NOT NULL DEFAULT '',
  converted_to_invoice text,
  saved_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotation_rows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  position     int NOT NULL DEFAULT 0,
  description  text NOT NULL DEFAULT '',
  qty          numeric(12,2) NOT NULL DEFAULT 0,
  unit         text NOT NULL DEFAULT '',
  rate         numeric(12,2) NOT NULL DEFAULT 0,
  disc_pct     numeric(5,2) NOT NULL DEFAULT 0,
  gst_pct      numeric(5,2) NOT NULL DEFAULT 18
);
CREATE INDEX IF NOT EXISTS quotation_rows_quotation_idx ON quotation_rows (quotation_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no          text UNIQUE NOT NULL,
  po_date        text NOT NULL,
  quote_ref      text NOT NULL DEFAULT '',
  delivery_date  text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'Draft',
  vendor_name    text NOT NULL DEFAULT '',
  vendor_contact text NOT NULL DEFAULT '',
  vendor_phone   text NOT NULL DEFAULT '',
  vendor_gstin   text NOT NULL DEFAULT '',
  vendor_addr    text NOT NULL DEFAULT '',
  freight        numeric(12,2) NOT NULL DEFAULT 0,
  terms          text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  saved_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS po_rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  position    int NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  qty         numeric(12,2) NOT NULL DEFAULT 0,
  unit        text NOT NULL DEFAULT '',
  rate        numeric(12,2) NOT NULL DEFAULT 0,
  gst_pct     numeric(5,2) NOT NULL DEFAULT 18
);
CREATE INDEX IF NOT EXISTS po_rows_po_idx ON po_rows (po_id);

CREATE TABLE IF NOT EXISTS company_settings (
  id       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name     text NOT NULL DEFAULT 'Niyakrish Industries',
  gstin    text NOT NULL DEFAULT '',
  cin      text NOT NULL DEFAULT '',
  address  text NOT NULL DEFAULT '',
  phone    text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT ''
);
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

function checkSecret(req, res) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: 'SESSION_SECRET is not set in Vercel env vars.' }); return false; }
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

async function initSchema(req, res) {
  if (!checkSecret(req, res)) return;
  try {
    await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await query(SCHEMA_SQL);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function bootstrapAuth(req, res) {
  if (!checkSecret(req, res)) return;
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'username and password (min 6 chars) are required' });
  }
  const { rows } = await query('SELECT id FROM auth_credentials WHERE id = 1');
  if (rows.length) return res.status(409).json({ error: 'Already set up — use /api/auth?action=change-password instead.' });

  const hash = await bcrypt.hash(password, 12);
  await query('INSERT INTO auth_credentials (id, username, password_hash) VALUES (1, $1, $2)', [username, hash]);
  res.status(201).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action;

  if (action === 'init-schema') return initSchema(req, res);
  if (action === 'bootstrap-auth') return bootstrapAuth(req, res);
  res.status(404).json({ error: 'Not found' });
}

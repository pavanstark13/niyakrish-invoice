-- Niyakrish Invoice — Postgres schema (Neon)
--
-- Run once against the connected Neon database (e.g. via `psql "$DATABASE_URL" -f schema.sql`,
-- or paste into the Neon SQL editor in the Vercel Storage tab). Safe to re-run: every
-- statement is idempotent (CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ======= AUTH =======
-- Singleton row (id always 1) — replaces the old hardcoded client-side default password.
CREATE TABLE IF NOT EXISTS auth_credentials (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  username      text NOT NULL,
  password_hash text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ======= SEQUENCE COUNTERS =======
-- invoice_seq / quote_seq / po_seq / gp_seq. Incremented atomically via
-- `UPDATE sequences SET value = value + 1 WHERE key = $1 RETURNING value`
-- inside the same transaction as the record insert — no separate "claim, then save" step,
-- so there's no gap left for two requests to be handed the same number.
CREATE TABLE IF NOT EXISTS sequences (
  key   text PRIMARY KEY,
  value int  NOT NULL DEFAULT 0
);
INSERT INTO sequences (key, value) VALUES
  ('invoice_seq', 778), -- invoices 001-778 already issued under the old app; next = 779
  ('quote_seq', 0),
  ('po_seq', 0),
  ('gp_seq', 0)
ON CONFLICT (key) DO NOTHING;

-- ======= CUSTOMERS =======
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

-- ======= INVOICES =======
CREATE TABLE IF NOT EXISTS invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no     text UNIQUE NOT NULL,
  invoice_date   text NOT NULL, -- kept as the app's own "YYYY-MM-DDTHH:mm" local string, not a timestamptz — the app already treats these as local wall-clock values (see parseLocalDate in the old client code) and mixing that with real UTC timestamps is exactly the class of bug fixed earlier this project
  po_number      text NOT NULL DEFAULT '',
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL, -- nullable: invoice keeps its own snapshot below regardless of later customer edits/deletes
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
  status         text NOT NULL DEFAULT 'Unpaid', -- Unpaid | Partially Paid | Paid
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

-- ======= PAYMENTS =======
CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  text NOT NULL,
  linked_invoice text, -- invoice_no of a directly-linked invoice, or NULL for a general payment split across invoices
  date           text NOT NULL,
  amount         numeric(14,2) NOT NULL,
  payment_mode   text NOT NULL DEFAULT 'Cash',
  ref_no         text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (customer_name);

-- Replaces the old client-side `appliedTo[]` JSON array with a real table — exactly which
-- invoices this payment paid down, and how much of each, so reversal (DELETE) is a
-- transactional join instead of re-deriving an allocation order.
CREATE TABLE IF NOT EXISTS payment_allocations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  amount     numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_invoice_idx ON payment_allocations (invoice_no);

-- ======= GATE PASSES =======
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
  items      jsonb NOT NULL DEFAULT '[]', -- array of strings ("desc | grade | qty unit"), matches the old app's flattened item lines
  saved_at   timestamptz NOT NULL DEFAULT now()
);

-- ======= QUOTATIONS =======
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

-- ======= PURCHASE ORDERS =======
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

-- ======= COMPANY SETTINGS =======
-- Singleton row (id always 1).
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

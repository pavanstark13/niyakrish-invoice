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
import { query, withTransaction } from './_lib/db.js';
import { batchInsert } from './_lib/batch.js';

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
  hsn_desc     text NOT NULL DEFAULT 'READY MIX CONCRETE',
  site         text NOT NULL DEFAULT ''
);
ALTER TABLE customer_pricing ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT '';
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
  hsn         text NOT NULL DEFAULT '',
  qty         numeric(12,2) NOT NULL DEFAULT 0,
  unit        text NOT NULL DEFAULT '',
  rate        numeric(12,2) NOT NULL DEFAULT 0,
  gst_pct     numeric(5,2) NOT NULL DEFAULT 18
);
ALTER TABLE po_rows ADD COLUMN IF NOT EXISTS hsn text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS po_rows_po_idx ON po_rows (po_id);

CREATE TABLE IF NOT EXISTS company_settings (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name          text NOT NULL DEFAULT 'Niyakrish Industries',
  gstin         text NOT NULL DEFAULT '',
  cin           text NOT NULL DEFAULT '',
  address       text NOT NULL DEFAULT '',
  phone         text NOT NULL DEFAULT '',
  logo_url      text NOT NULL DEFAULT '',
  bank_name     text NOT NULL DEFAULT '',
  bank_acc_name text NOT NULL DEFAULT '',
  bank_acc_no   text NOT NULL DEFAULT '',
  bank_ifsc     text NOT NULL DEFAULT '',
  bank_branch   text NOT NULL DEFAULT ''
);
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_acc_name text NOT NULL DEFAULT '';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_acc_no text NOT NULL DEFAULT '';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_ifsc text NOT NULL DEFAULT '';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_branch text NOT NULL DEFAULT '';
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

// One-time import of a local-backup JSON export (the shape produced by the old app's
// "Export Master Backup" in Data Center: { invoices, customers, payments, gatepasses,
// invoice_seq, gp_seq }) directly into Postgres — preserving the original invoice/gate-pass
// numbers exactly, unlike the normal create endpoints which always assign a fresh atomic
// number. This is NOT what restoreFullBackup() in the app itself does (that goes through the
// normal API and gets new numbers) — this is specifically for the one-time migration.
//
// Batches inserts (api/_lib/batch.js) instead of one round trip per record — with ~450
// records that's the difference between a handful of queries and hundreds, well within the
// function's time budget either way but far more reliable.
//
//   curl -X POST "https://<preview-url>/api/admin?action=migrate-import" \
//     -H "Authorization: Bearer <SESSION_SECRET>" -H "Content-Type: application/json" \
//     --data-binary @niyakrish_master_backup.json
async function migrateImport(req, res) {
  if (!checkSecret(req, res)) return;
  const data = req.body || {};
  const srcInvoices = Array.isArray(data.invoices) ? data.invoices : [];
  const srcCustomers = Array.isArray(data.customers) ? data.customers : [];
  const srcGatepasses = Array.isArray(data.gatepasses) ? data.gatepasses : [];
  const srcPayments = Array.isArray(data.payments) ? data.payments : [];

  const summary = { customers: 0, customerPricing: 0, invoices: 0, invoiceRows: 0, gatepasses: 0, payments: 0, paymentAllocations: 0, notes: [] };

  try {
    await withTransaction(async (client) => {
      // ---- customers ----
      if (srcCustomers.length) {
        const rows = srcCustomers.map(c => [c.name || '', c.phone || '', c.gstin || '', c.address || '', c.site || '', c.pincode || '', c.createdAt || new Date().toISOString()]);
        await batchInsert(client, 'customers', ['name', 'phone', 'gstin', 'address', 'site', 'pincode', 'created_at'], rows, {
          onConflict: 'ON CONFLICT (lower(name)) DO NOTHING',
        });
      }
      const { rows: allCustomers } = await client.query('SELECT id, name FROM customers');
      const custIdByName = new Map(allCustomers.map(c => [c.name.toLowerCase(), c.id]));
      summary.customers = srcCustomers.filter(c => custIdByName.has((c.name || '').toLowerCase())).length;

      const pricingRows = [];
      srcCustomers.forEach(c => {
        const custId = custIdByName.get((c.name || '').toLowerCase());
        if (!custId) return;
        (c.pricing || []).forEach(p => {
          if (!p.grade) return;
          pricingRows.push([custId, p.grade, p.rate || 0, p.productName || 'Ready Mix Concrete', p.hsnCode || '38245010', p.hsnDesc || 'READY MIX CONCRETE']);
        });
      });
      if (pricingRows.length) {
        await batchInsert(client, 'customer_pricing', ['customer_id', 'grade', 'rate', 'product_name', 'hsn_code', 'hsn_desc'], pricingRows);
        summary.customerPricing = pricingRows.length;
      }

      // ---- invoices ----
      // A handful of legacy records have an empty invoiceNo (a pre-existing bug in the old
      // app, not something this migration caused) — give each one a real number past the
      // highest one seen instead of silently dropping real invoice data.
      let maxSeenNo = 0;
      srcInvoices.forEach(inv => { const n = parseInt(inv.invoiceNo, 10); if (!isNaN(n) && n > maxSeenNo) maxSeenNo = n; });
      let nextSynthetic = maxSeenNo + 1;
      const resolvedNoByInvoice = new Map();
      srcInvoices.forEach((inv, idx) => {
        let no = (inv.invoiceNo || '').toString().trim();
        if (!no) {
          no = String(nextSynthetic++);
          summary.notes.push(`Invoice with no number (customer "${inv.customer?.name || 'unknown'}", dated ${inv.invoiceDate || 'unknown'}, ₹${inv.totals?.netAmount ?? '?'}) assigned new number ${no} — please verify.`);
        }
        resolvedNoByInvoice.set(idx, no);
      });

      if (srcInvoices.length) {
        const invRows = srcInvoices.map((inv, idx) => [
          resolvedNoByInvoice.get(idx), inv.invoiceDate || '', inv.poNumber || '',
          inv.customer?.name || '', inv.customer?.phone || '', inv.customer?.gstin || '', inv.customer?.address || '', inv.customer?.site || '', inv.customer?.pin || '',
          inv.product?.hsnCode || '38245010', inv.product?.hsnDesc || 'READY MIX CONCRETE', inv.product?.productName || 'Ready Mix Concrete', inv.product?.driverName || '', inv.product?.vehicleNo || '',
          inv.totals?.subTotal || 0, inv.totals?.cgstTotal || 0, inv.totals?.sgstTotal || 0, inv.totals?.tcsAmount || 0, inv.totals?.netAmount || 0,
          inv.amountWords || '', inv.paidAmount || 0, inv.status || 'Unpaid', inv.remarks || '',
        ]);
        await batchInsert(client, 'invoices', [
          'invoice_no', 'invoice_date', 'po_number',
          'customer_name', 'customer_phone', 'customer_gstin', 'customer_addr', 'customer_site', 'customer_pin',
          'hsn_code', 'hsn_desc', 'product_name', 'driver_name', 'vehicle_no',
          'sub_total', 'cgst_total', 'sgst_total', 'tcs_amount', 'net_amount',
          'amount_words', 'paid_amount', 'status', 'remarks',
        ], invRows, { onConflict: 'ON CONFLICT (invoice_no) DO NOTHING' });
      }

      const { rows: allInvoices } = await client.query('SELECT id, invoice_no FROM invoices');
      const invIdByNo = new Map(allInvoices.map(i => [i.invoice_no, i.id]));
      summary.invoices = [...resolvedNoByInvoice.values()].filter(no => invIdByNo.has(no)).length;

      const rowRows = [];
      srcInvoices.forEach((inv, idx) => {
        const invId = invIdByNo.get(resolvedNoByInvoice.get(idx));
        if (!invId) return;
        (inv.rows || []).forEach((r, pos) => {
          rowRows.push([invId, pos, r.grade || '', r.qty || 0, r.rate || 0, r.disc_pct || 0, r.cgst_pct ?? 9, r.sgst_pct ?? 9]);
        });
      });
      if (rowRows.length) {
        await batchInsert(client, 'invoice_rows', ['invoice_id', 'position', 'grade', 'qty', 'rate', 'disc_pct', 'cgst_pct', 'sgst_pct'], rowRows);
        summary.invoiceRows = rowRows.length;
      }

      // ---- gate passes ----
      if (srcGatepasses.length) {
        const gpRows = srcGatepasses.map(g => [
          g.gpno || '', g.gpdate || '', g.vehicle || '', g.dest || '', g.driver || '', g.mtype || '',
          g.ptype || 'Non-Returnable', g.challan || '', g.totalQty || '', g.remarks || '',
          JSON.stringify(g.items || []), g.savedAt || new Date().toISOString(),
        ]);
        const inserted = await batchInsert(client, 'gate_passes', [
          'gp_no', 'gp_date', 'vehicle', 'dest', 'driver', 'mtype', 'ptype', 'challan', 'total_qty', 'remarks', 'items', 'saved_at',
        ], gpRows, { onConflict: 'ON CONFLICT (gp_no) DO NOTHING', returning: 'id' });
        summary.gatepasses = inserted.length;
      }

      // ---- payments (+ allocations from appliedTo) ----
      if (srcPayments.length) {
        const payRows = srcPayments.map(p => [
          p.customerName || '', p.linkedInvoice || null, p.date || '', p.amount || 0,
          p.paymentMode || 'Cash', p.refNo || '', p.notes || '', p.createdAt || new Date().toISOString(),
        ]);
        const insertedPays = await batchInsert(client, 'payments', [
          'customer_name', 'linked_invoice', 'date', 'amount', 'payment_mode', 'ref_no', 'notes', 'created_at',
        ], payRows, { returning: 'id' });
        summary.payments = insertedPays.length;

        const allocRows = [];
        srcPayments.forEach((p, idx) => {
          const payId = insertedPays[idx]?.id;
          if (!payId) return;
          (p.appliedTo || []).forEach(a => {
            allocRows.push([payId, a.invoiceNo, a.amount || 0]);
          });
        });
        if (allocRows.length) {
          await batchInsert(client, 'payment_allocations', ['payment_id', 'invoice_no', 'amount'], allocRows);
          summary.paymentAllocations = allocRows.length;
        }
      }

      // ---- sequences: bring them up to at least what the import implies ----
      const importedInvoiceSeq = Math.max(maxSeenNo, parseInt(data.invoice_seq, 10) || 0, nextSynthetic - 1);
      const importedGpSeq = parseInt(data.gp_seq, 10) || 0;
      await client.query('UPDATE sequences SET value = GREATEST(value, $1) WHERE key = $2', [importedInvoiceSeq, 'invoice_seq']);
      await client.query('UPDATE sequences SET value = GREATEST(value, $1) WHERE key = $2', [importedGpSeq, 'gp_seq']);
    });

    res.status(200).json({ ok: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message, summary });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action;

  if (action === 'init-schema') return initSchema(req, res);
  if (action === 'bootstrap-auth') return bootstrapAuth(req, res);
  if (action === 'migrate-import') return migrateImport(req, res);
  res.status(404).json({ error: 'Not found' });
}


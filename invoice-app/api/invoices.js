// Invoice routes, dispatched by method + ?no= / ?action= (see api/auth.js for why not a
// path segment).
//
//   GET    /api/invoices                  list
//   POST   /api/invoices                  create (server assigns invoice_no atomically)
//   GET    /api/invoices?no=779           get one
//   PUT    /api/invoices?no=779           update (content only — paid_amount/status untouched)
//   DELETE /api/invoices?no=779           delete
//   POST   /api/invoices?action=mark-paid body: { invoiceNo } — mark fully paid + record payment
import { query, withTransaction, nextSeq } from './_lib/db.js';
import { requireAuth } from './_lib/auth.js';
import { invoiceRowToJson } from './_lib/serialize.js';

async function listInvoices(req, res) {
  const { rows: invoices } = await query('SELECT * FROM invoices ORDER BY invoice_no');
  if (!invoices.length) return res.status(200).json([]);
  const { rows: allRows } = await query(
    'SELECT * FROM invoice_rows WHERE invoice_id = ANY($1) ORDER BY invoice_id, position',
    [invoices.map(i => i.id)]
  );
  const rowsByInvoice = new Map();
  for (const r of allRows) {
    if (!rowsByInvoice.has(r.invoice_id)) rowsByInvoice.set(r.invoice_id, []);
    rowsByInvoice.get(r.invoice_id).push(r);
  }
  res.status(200).json(invoices.map(inv => invoiceRowToJson(inv, rowsByInvoice.get(inv.id) || [])));
}

async function createInvoice(req, res) {
  const body = req.body || {};
  const cust = body.customer || {};
  const product = body.product || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const totals = body.totals || {};
  if (!cust.name) return res.status(400).json({ error: 'Customer name is required' });

  const result = await withTransaction(async (client) => {
    const seq = await nextSeq(client, 'invoice_seq');
    const invoiceNo = String(seq).padStart(3, '0');

    const { rows: [inv] } = await client.query(
      `INSERT INTO invoices (
         invoice_no, invoice_date, po_number,
         customer_name, customer_phone, customer_gstin, customer_addr, customer_site, customer_pin,
         hsn_code, hsn_desc, product_name, driver_name, vehicle_no,
         sub_total, cgst_total, sgst_total, tcs_amount, net_amount,
         amount_words, remarks
       ) VALUES ($1,$2,$3, $4,$5,$6,$7,$8,$9, $10,$11,$12,$13,$14, $15,$16,$17,$18,$19, $20,$21)
       RETURNING *`,
      [
        invoiceNo, body.invoiceDate, body.poNumber || '',
        cust.name, cust.phone || '', cust.gstin || '', cust.address || '', cust.site || '', cust.pin || '',
        product.hsnCode || '38245010', product.hsnDesc || 'READY MIX CONCRETE', product.productName || 'Ready Mix Concrete',
        product.driverName || '', product.vehicleNo || '',
        totals.subTotal || 0, totals.cgstTotal || 0, totals.sgstTotal || 0, totals.tcsAmount || 0, totals.netAmount || 0,
        body.amountWords || '', body.remarks || '',
      ]
    );

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO invoice_rows (invoice_id, position, grade, qty, rate, disc_pct, cgst_pct, sgst_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [inv.id, i, r.grade || '', r.qty || 0, r.rate || 0, r.disc_pct || 0, r.cgst_pct ?? 9, r.sgst_pct ?? 9]
      );
    }

    // Customer auto-registration/pricing-sync is handled client-side (autoSaveCustomerFromInvoice
    // in index.html), called after every invoice save — both create and update — so it lives
    // in one place rather than duplicated here (and racing the client's own create call on
    // the unique customer-name index).
    //
    // Re-select the rows just inserted rather than reusing the request body: the DB has
    // already applied the real defaults (cgst_pct/sgst_pct etc.) for any field the client
    // omitted, so this is what actually got persisted — not a second, possibly-inconsistent
    // (and previously NaN-prone) copy of them.
    const { rows: savedRows } = await client.query('SELECT * FROM invoice_rows WHERE invoice_id = $1 ORDER BY position', [inv.id]);
    return invoiceRowToJson(inv, savedRows);
  });

  res.status(201).json(result);
}

async function getInvoice(invoiceNo, res) {
  const { rows: [inv] } = await query('SELECT * FROM invoices WHERE invoice_no = $1', [invoiceNo]);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const { rows } = await query('SELECT * FROM invoice_rows WHERE invoice_id = $1 ORDER BY position', [inv.id]);
  res.status(200).json(invoiceRowToJson(inv, rows));
}

async function updateInvoice(invoiceNo, req, res) {
  const body = req.body || {};
  const cust = body.customer || {};
  const product = body.product || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const totals = body.totals || {};

  const result = await withTransaction(async (client) => {
    const { rows: [inv] } = await client.query(
      `UPDATE invoices SET
         invoice_date=$1, po_number=$2,
         customer_name=$3, customer_phone=$4, customer_gstin=$5, customer_addr=$6, customer_site=$7, customer_pin=$8,
         hsn_code=$9, hsn_desc=$10, product_name=$11, driver_name=$12, vehicle_no=$13,
         sub_total=$14, cgst_total=$15, sgst_total=$16, tcs_amount=$17, net_amount=$18,
         amount_words=$19, remarks=$20, updated_at=now()
       WHERE invoice_no = $21
       RETURNING *`,
      [
        body.invoiceDate, body.poNumber || '',
        cust.name, cust.phone || '', cust.gstin || '', cust.address || '', cust.site || '', cust.pin || '',
        product.hsnCode || '38245010', product.hsnDesc || 'READY MIX CONCRETE', product.productName || 'Ready Mix Concrete',
        product.driverName || '', product.vehicleNo || '',
        totals.subTotal || 0, totals.cgstTotal || 0, totals.sgstTotal || 0, totals.tcsAmount || 0, totals.netAmount || 0,
        body.amountWords || '', body.remarks || '',
        invoiceNo,
      ]
    );
    if (!inv) return null;

    await client.query('DELETE FROM invoice_rows WHERE invoice_id = $1', [inv.id]);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO invoice_rows (invoice_id, position, grade, qty, rate, disc_pct, cgst_pct, sgst_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [inv.id, i, r.grade || '', r.qty || 0, r.rate || 0, r.disc_pct || 0, r.cgst_pct ?? 9, r.sgst_pct ?? 9]
      );
    }
    const { rows: savedRows } = await client.query('SELECT * FROM invoice_rows WHERE invoice_id = $1 ORDER BY position', [inv.id]);
    return invoiceRowToJson(inv, savedRows);
  });

  if (!result) return res.status(404).json({ error: 'Invoice not found' });
  res.status(200).json(result);
}

async function deleteInvoice(invoiceNo, res) {
  const { rowCount } = await query('DELETE FROM invoices WHERE invoice_no = $1', [invoiceNo]);
  if (!rowCount) return res.status(404).json({ error: 'Invoice not found' });
  res.status(200).json({ ok: true });
}

async function markPaid(req, res) {
  const { invoiceNo } = req.body || {};
  if (!invoiceNo) return res.status(400).json({ error: 'invoiceNo is required' });

  let result;
  try {
    result = await withTransaction(async (client) => {
      const { rows: [inv] } = await client.query('SELECT * FROM invoices WHERE invoice_no = $1', [invoiceNo]);
      if (!inv) return null;
      if (Number(inv.net_amount) <= 0) throw Object.assign(new Error('Invoice has zero amount'), { statusCode: 400 });

      const amount = Number(inv.net_amount);
      const { rows: [updated] } = await client.query(
        `UPDATE invoices SET paid_amount = $1, status = 'Paid', updated_at = now() WHERE invoice_no = $2 RETURNING *`,
        [amount, invoiceNo]
      );
      const { rows: [pay] } = await client.query(
        `INSERT INTO payments (customer_name, linked_invoice, date, amount, payment_mode, notes)
         VALUES ($1,$2, to_char(now(),'YYYY-MM-DD'), $3, 'Cash', 'Marked as paid from invoice builder')
         RETURNING id`,
        [inv.customer_name, invoiceNo, amount]
      );
      await client.query('INSERT INTO payment_allocations (payment_id, invoice_no, amount) VALUES ($1,$2,$3)', [pay.id, invoiceNo, amount]);
      return updated;
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message || 'Failed to mark invoice paid' });
  }

  if (!result) return res.status(404).json({ error: 'Invoice not found' });
  res.status(200).json({ ok: true, invoiceNo, paidAmount: Number(result.paid_amount), status: result.status });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const invoiceNo = req.query.no;
  const action = req.query.action;

  if (action === 'mark-paid' && req.method === 'POST') return markPaid(req, res);
  if (invoiceNo) {
    if (req.method === 'GET') return getInvoice(invoiceNo, res);
    if (req.method === 'PUT') return updateInvoice(invoiceNo, req, res);
    if (req.method === 'DELETE') return deleteInvoice(invoiceNo, res);
  } else {
    if (req.method === 'GET') return listInvoices(req, res);
    if (req.method === 'POST') return createInvoice(req, res);
  }
  res.status(404).json({ error: 'Not found' });
}

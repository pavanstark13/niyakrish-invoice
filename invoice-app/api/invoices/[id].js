import { query, withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { invoiceRowToJson } from '../_lib/serialize.js';

// [id] is the human invoice number (e.g. "779"), not a UUID — that's the key the rest of the
// app already uses everywhere (Load Invoice, Mark Paid, etc.), so routing on it directly
// avoids an extra id<->invoiceNo lookup on every call.

async function getInvoice(invoiceNo, res) {
  const { rows: [inv] } = await query('SELECT * FROM invoices WHERE invoice_no = $1', [invoiceNo]);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const { rows } = await query('SELECT * FROM invoice_rows WHERE invoice_id = $1 ORDER BY position', [inv.id]);
  res.status(200).json(invoiceRowToJson(inv, rows));
}

// Updates an existing invoice's content. paid_amount/status are preserved as-is (matching the
// old app's saveInvoiceToStorage, which never let editing an invoice touch its payment state —
// use POST /api/invoices/[id]/mark-paid or the payments endpoints for that).
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
    return invoiceRowToJson(inv, rows);
  });

  if (!result) return res.status(404).json({ error: 'Invoice not found' });
  res.status(200).json(result);
}

async function deleteInvoice(invoiceNo, res) {
  const { rowCount } = await query('DELETE FROM invoices WHERE invoice_no = $1', [invoiceNo]);
  if (!rowCount) return res.status(404).json({ error: 'Invoice not found' });
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const invoiceNo = req.query.id;

  if (req.method === 'GET') return getInvoice(invoiceNo, res);
  if (req.method === 'PUT') return updateInvoice(invoiceNo, req, res);
  if (req.method === 'DELETE') return deleteInvoice(invoiceNo, res);
  res.status(405).json({ error: 'Method not allowed' });
}

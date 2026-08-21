import { query, withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { quotationRowToJson } from '../_lib/serialize.js';

async function updateQuotation(quoteNo, req, res) {
  const body = req.body || {};
  const cust = body.customer || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const totals = body.totals || {};

  const result = await withTransaction(async (client) => {
    const { rows: [q] } = await client.query(
      `UPDATE quotations SET
         quote_date=$1, valid_until=$2, status=$3,
         customer_name=$4, customer_phone=$5, customer_gstin=$6, customer_addr=$7, customer_site=$8,
         sub_total=$9, cgst_total=$10, sgst_total=$11, net_amount=$12, terms=$13, notes=$14,
         converted_to_invoice=$15
       WHERE quote_no = $16
       RETURNING *`,
      [
        body.quoteDate, body.validUntil || '', body.status || 'Draft',
        cust.name, cust.phone || '', cust.gstin || '', cust.address || '', cust.site || '',
        totals.subTotal || 0, totals.cgstTotal || 0, totals.sgstTotal || 0, totals.netAmount || 0,
        body.terms || '', body.notes || '', body.convertedToInvoice || null,
        quoteNo,
      ]
    );
    if (!q) return null;

    await client.query('DELETE FROM quotation_rows WHERE quotation_id = $1', [q.id]);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO quotation_rows (quotation_id, position, description, qty, unit, rate, disc_pct, gst_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [q.id, i, r.description || '', r.qty || 0, r.unit || '', r.rate || 0, r.disc_pct || 0, r.gst_pct ?? 18]
      );
    }
    return quotationRowToJson(q, rows);
  });

  if (!result) return res.status(404).json({ error: 'Quotation not found' });
  res.status(200).json(result);
}

async function deleteQuotation(quoteNo, res) {
  const { rowCount } = await query('DELETE FROM quotations WHERE quote_no = $1', [quoteNo]);
  if (!rowCount) return res.status(404).json({ error: 'Quotation not found' });
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const quoteNo = req.query.id;
  if (req.method === 'PUT') return updateQuotation(quoteNo, req, res);
  if (req.method === 'DELETE') return deleteQuotation(quoteNo, res);
  res.status(405).json({ error: 'Method not allowed' });
}

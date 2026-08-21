import { query, withTransaction, nextSeq } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { quotationRowToJson } from '../_lib/serialize.js';

async function listQuotations(req, res) {
  const { rows: quotes } = await query('SELECT * FROM quotations ORDER BY quote_no');
  if (!quotes.length) return res.status(200).json([]);
  const { rows: allRows } = await query(
    'SELECT * FROM quotation_rows WHERE quotation_id = ANY($1) ORDER BY quotation_id, position',
    [quotes.map(q => q.id)]
  );
  const byQuote = new Map();
  for (const r of allRows) {
    if (!byQuote.has(r.quotation_id)) byQuote.set(r.quotation_id, []);
    byQuote.get(r.quotation_id).push(r);
  }
  res.status(200).json(quotes.map(q => quotationRowToJson(q, byQuote.get(q.id) || [])));
}

// Claims the next quote number and inserts the quotation in one transaction — see
// api/invoices/index.js for why this matters (no client-side "preview vs consume" gap left).
async function createQuotation(req, res) {
  const body = req.body || {};
  const cust = body.customer || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const totals = body.totals || {};
  if (!cust.name) return res.status(400).json({ error: 'Enter customer name.' });

  const result = await withTransaction(async (client) => {
    const seq = await nextSeq(client, 'quote_seq');
    const quoteNo = 'QT-' + String(seq).padStart(3, '0');

    const { rows: [q] } = await client.query(
      `INSERT INTO quotations (
         quote_no, quote_date, valid_until, status,
         customer_name, customer_phone, customer_gstin, customer_addr, customer_site,
         sub_total, cgst_total, sgst_total, net_amount, terms, notes
       ) VALUES ($1,$2,$3,$4, $5,$6,$7,$8,$9, $10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        quoteNo, body.quoteDate, body.validUntil || '', body.status || 'Draft',
        cust.name, cust.phone || '', cust.gstin || '', cust.address || '', cust.site || '',
        totals.subTotal || 0, totals.cgstTotal || 0, totals.sgstTotal || 0, totals.netAmount || 0,
        body.terms || '', body.notes || '',
      ]
    );

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

  res.status(201).json(result);
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'GET') return listQuotations(req, res);
  if (req.method === 'POST') return createQuotation(req, res);
  res.status(405).json({ error: 'Method not allowed' });
}

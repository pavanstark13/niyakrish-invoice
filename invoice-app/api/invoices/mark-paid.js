import { withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

// Marks an invoice fully paid and records the matching payment — mirrors the old app's
// markInvoiceAsPaid(), but as one DB transaction instead of three separate client-side saves.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

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
      await client.query(
        'INSERT INTO payment_allocations (payment_id, invoice_no, amount) VALUES ($1,$2,$3)',
        [pay.id, invoiceNo, amount]
      );

      return updated;
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message || 'Failed to mark invoice paid' });
  }

  if (!result) return res.status(404).json({ error: 'Invoice not found' });
  res.status(200).json({ ok: true, invoiceNo, paidAmount: Number(result.paid_amount), status: result.status });
}

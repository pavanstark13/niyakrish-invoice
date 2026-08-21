import { withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

// Reverses the payment's exact recorded allocations (payment_allocations), transactionally
// with the delete — correct regardless of what other payments/invoices happened since,
// unlike re-deriving an allocation order at delete time.
async function deletePayment(id, res) {
  const result = await withTransaction(async (client) => {
    const { rows: [pay] } = await client.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (!pay) return null;

    const { rows: allocations } = await client.query('SELECT * FROM payment_allocations WHERE payment_id = $1', [id]);
    for (const a of allocations) {
      const { rows: [inv] } = await client.query('SELECT * FROM invoices WHERE invoice_no = $1', [a.invoice_no]);
      if (!inv) continue;
      const paid = Math.max(0, Number(inv.paid_amount) - Number(a.amount));
      const status = paid === 0 ? 'Unpaid' : (paid >= Number(inv.net_amount) ? 'Paid' : 'Partially Paid');
      await client.query('UPDATE invoices SET paid_amount = $1, status = $2, updated_at = now() WHERE id = $3', [paid, status, inv.id]);
    }

    await client.query('DELETE FROM payments WHERE id = $1', [id]);
    return true;
  });

  if (!result) return res.status(404).json({ error: 'Payment not found' });
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'DELETE') return deletePayment(req.query.id, res);
  res.status(405).json({ error: 'Method not allowed' });
}

// Consolidated payment routes — see api/auth/[[...action]].js for why.
//   GET/POST /api/payments        list / create (allocates to invoices transactionally)
//   DELETE   /api/payments/:id    reverses the exact recorded allocation, transactionally
import { query, withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { pathSegments } from '../_lib/http.js';

function toJson(p, allocations) {
  return {
    id: p.id, customerName: p.customer_name, linkedInvoice: p.linked_invoice, date: p.date,
    amount: Number(p.amount), paymentMode: p.payment_mode, refNo: p.ref_no, notes: p.notes,
    createdAt: p.created_at,
    appliedTo: (allocations || []).map(a => ({ invoiceNo: a.invoice_no, amount: Number(a.amount) })),
  };
}

async function listPayments(req, res) {
  const { rows: payments } = await query('SELECT * FROM payments ORDER BY date, created_at');
  if (!payments.length) return res.status(200).json([]);
  const { rows: allocations } = await query('SELECT * FROM payment_allocations WHERE payment_id = ANY($1)', [payments.map(p => p.id)]);
  const byPayment = new Map();
  for (const a of allocations) {
    if (!byPayment.has(a.payment_id)) byPayment.set(a.payment_id, []);
    byPayment.get(a.payment_id).push(a);
  }
  res.status(200).json(payments.map(p => toJson(p, byPayment.get(p.id))));
}

async function createPayment(req, res) {
  const body = req.body || {};
  const { customerName, linkedInvoice, date, amount, paymentMode, refNo, notes } = body;
  if (!customerName || !date || !(amount > 0)) return res.status(400).json({ error: 'Fill all mandatory details' });

  const result = await withTransaction(async (client) => {
    const { rows: [pay] } = await client.query(
      `INSERT INTO payments (customer_name, linked_invoice, date, amount, payment_mode, ref_no, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [customerName, linkedInvoice || null, date, amount, paymentMode || 'Cash', refNo || '', notes || '']
    );

    const allocations = [];
    if (linkedInvoice) {
      const { rows: [inv] } = await client.query('SELECT * FROM invoices WHERE invoice_no = $1', [linkedInvoice]);
      if (inv) {
        const paid = Number(inv.paid_amount) + Number(amount);
        const status = paid >= Number(inv.net_amount) ? 'Paid' : 'Partially Paid';
        await client.query('UPDATE invoices SET paid_amount = $1, status = $2, updated_at = now() WHERE id = $3', [paid, status, inv.id]);
        allocations.push({ invoiceNo: inv.invoice_no, amount: Number(amount) });
      }
    } else {
      const { rows: clientInvoices } = await client.query(
        `SELECT * FROM invoices WHERE lower(customer_name) = lower($1) ORDER BY invoice_date ASC`, [customerName]
      );
      let remaining = Number(amount);
      for (const inv of clientInvoices) {
        if (remaining <= 0) break;
        const due = Number(inv.net_amount) - Number(inv.paid_amount);
        if (due <= 0) continue;
        const alloc = Math.min(remaining, due);
        const paid = Number(inv.paid_amount) + alloc;
        const status = paid >= Number(inv.net_amount) ? 'Paid' : 'Partially Paid';
        await client.query('UPDATE invoices SET paid_amount = $1, status = $2, updated_at = now() WHERE id = $3', [paid, status, inv.id]);
        allocations.push({ invoiceNo: inv.invoice_no, amount: alloc });
        remaining -= alloc;
      }
    }

    for (const a of allocations) {
      await client.query('INSERT INTO payment_allocations (payment_id, invoice_no, amount) VALUES ($1,$2,$3)', [pay.id, a.invoiceNo, a.amount]);
    }
    return toJson(pay, allocations.map(a => ({ invoice_no: a.invoiceNo, amount: a.amount })));
  });

  res.status(201).json(result);
}

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
  const path = pathSegments(req.query.path);

  if (path.length === 0) {
    if (req.method === 'GET') return listPayments(req, res);
    if (req.method === 'POST') return createPayment(req, res);
  } else if (path.length === 1) {
    if (req.method === 'DELETE') return deletePayment(path[0], res);
  }
  res.status(404).json({ error: 'Not found' });
}

import { query, withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

async function updateCustomer(id, req, res) {
  const body = req.body || {};
  const result = await withTransaction(async (client) => {
    const { rows: [c] } = await client.query(
      `UPDATE customers SET name=$1, phone=$2, gstin=$3, address=$4, site=$5, pincode=$6
       WHERE id = $7 RETURNING *`,
      [body.name, body.phone || '', body.gstin || '', body.address || '', body.site || '', body.pincode || '', id]
    );
    if (!c) return null;
    if (Array.isArray(body.pricing)) {
      await client.query('DELETE FROM customer_pricing WHERE customer_id = $1', [id]);
      for (const p of body.pricing) {
        await client.query(
          `INSERT INTO customer_pricing (customer_id, grade, rate, product_name, hsn_code, hsn_desc)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, p.grade, p.rate || 0, p.productName || 'Ready Mix Concrete', p.hsnCode || '38245010', p.hsnDesc || 'READY MIX CONCRETE']
        );
      }
    }
    return c;
  });
  if (!result) return res.status(404).json({ error: 'Customer not found' });
  res.status(200).json({ ok: true });
}

async function deleteCustomer(id, res) {
  const { rowCount } = await query('DELETE FROM customers WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Customer not found' });
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const id = req.query.id;
  if (req.method === 'PUT') return updateCustomer(id, req, res);
  if (req.method === 'DELETE') return deleteCustomer(id, res);
  res.status(405).json({ error: 'Method not allowed' });
}

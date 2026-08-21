import { query, withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

function toJson(c, pricing) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    gstin: c.gstin,
    address: c.address,
    site: c.site,
    pincode: c.pincode,
    autoCreated: c.auto_created,
    createdAt: c.created_at,
    pricing: (pricing || []).map(p => ({
      grade: p.grade, rate: Number(p.rate),
      productName: p.product_name, hsnCode: p.hsn_code, hsnDesc: p.hsn_desc,
    })),
  };
}

async function listCustomers(req, res) {
  const { rows: customers } = await query('SELECT * FROM customers ORDER BY name');
  if (!customers.length) return res.status(200).json([]);
  const { rows: pricing } = await query(
    'SELECT * FROM customer_pricing WHERE customer_id = ANY($1)', [customers.map(c => c.id)]
  );
  const byCustomer = new Map();
  for (const p of pricing) {
    if (!byCustomer.has(p.customer_id)) byCustomer.set(p.customer_id, []);
    byCustomer.get(p.customer_id).push(p);
  }
  res.status(200).json(customers.map(c => toJson(c, byCustomer.get(c.id))));
}

async function createCustomer(req, res) {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'Customer name is required' });

  const result = await withTransaction(async (client) => {
    const { rows: [c] } = await client.query(
      `INSERT INTO customers (name, phone, gstin, address, site, pincode)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [body.name, body.phone || '', body.gstin || '', body.address || '', body.site || '', body.pincode || '']
    );
    for (const p of (body.pricing || [])) {
      await client.query(
        `INSERT INTO customer_pricing (customer_id, grade, rate, product_name, hsn_code, hsn_desc)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [c.id, p.grade, p.rate || 0, p.productName || 'Ready Mix Concrete', p.hsnCode || '38245010', p.hsnDesc || 'READY MIX CONCRETE']
      );
    }
    return toJson(c, body.pricing);
  });

  res.status(201).json(result);
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'GET') return listCustomers(req, res);
  if (req.method === 'POST') return createCustomer(req, res);
  res.status(405).json({ error: 'Method not allowed' });
}

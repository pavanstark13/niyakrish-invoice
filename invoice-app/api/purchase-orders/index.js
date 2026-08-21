import { query, withTransaction, nextSeq } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { poRowToJson } from '../_lib/serialize.js';

async function listPOs(req, res) {
  const { rows: pos } = await query('SELECT * FROM purchase_orders ORDER BY po_no');
  if (!pos.length) return res.status(200).json([]);
  const { rows: allRows } = await query(
    'SELECT * FROM po_rows WHERE po_id = ANY($1) ORDER BY po_id, position', [pos.map(p => p.id)]
  );
  const byPO = new Map();
  for (const r of allRows) {
    if (!byPO.has(r.po_id)) byPO.set(r.po_id, []);
    byPO.get(r.po_id).push(r);
  }
  res.status(200).json(pos.map(p => poRowToJson(p, byPO.get(p.id) || [])));
}

async function createPO(req, res) {
  const body = req.body || {};
  const vendor = body.vendor || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!vendor.name) return res.status(400).json({ error: 'Enter vendor name.' });

  const result = await withTransaction(async (client) => {
    const seq = await nextSeq(client, 'po_seq');
    const poNo = 'PO-' + String(seq).padStart(3, '0');

    const { rows: [po] } = await client.query(
      `INSERT INTO purchase_orders (
         po_no, po_date, quote_ref, delivery_date, status,
         vendor_name, vendor_contact, vendor_phone, vendor_gstin, vendor_addr,
         freight, terms, notes
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10, $11,$12,$13)
       RETURNING *`,
      [
        poNo, body.poDate, body.quoteRef || '', body.deliveryDate || '', body.status || 'Draft',
        vendor.name, vendor.contact || '', vendor.phone || '', vendor.gstin || '', vendor.address || '',
        body.freight || 0, body.terms || '', body.notes || '',
      ]
    );

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO po_rows (po_id, position, description, qty, unit, rate, gst_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [po.id, i, r.description || '', r.qty || 0, r.unit || '', r.rate || 0, r.gst_pct ?? 18]
      );
    }

    return poRowToJson(po, rows);
  });

  res.status(201).json(result);
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'GET') return listPOs(req, res);
  if (req.method === 'POST') return createPO(req, res);
  res.status(405).json({ error: 'Method not allowed' });
}

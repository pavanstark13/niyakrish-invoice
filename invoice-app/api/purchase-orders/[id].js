import { query, withTransaction } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { poRowToJson } from '../_lib/serialize.js';

async function updatePO(poNo, req, res) {
  const body = req.body || {};
  const vendor = body.vendor || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];

  const result = await withTransaction(async (client) => {
    const { rows: [po] } = await client.query(
      `UPDATE purchase_orders SET
         po_date=$1, quote_ref=$2, delivery_date=$3, status=$4,
         vendor_name=$5, vendor_contact=$6, vendor_phone=$7, vendor_gstin=$8, vendor_addr=$9,
         freight=$10, terms=$11, notes=$12
       WHERE po_no = $13
       RETURNING *`,
      [
        body.poDate, body.quoteRef || '', body.deliveryDate || '', body.status || 'Draft',
        vendor.name, vendor.contact || '', vendor.phone || '', vendor.gstin || '', vendor.address || '',
        body.freight || 0, body.terms || '', body.notes || '',
        poNo,
      ]
    );
    if (!po) return null;

    await client.query('DELETE FROM po_rows WHERE po_id = $1', [po.id]);
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

  if (!result) return res.status(404).json({ error: 'Purchase order not found' });
  res.status(200).json(result);
}

async function deletePO(poNo, res) {
  const { rowCount } = await query('DELETE FROM purchase_orders WHERE po_no = $1', [poNo]);
  if (!rowCount) return res.status(404).json({ error: 'Purchase order not found' });
  res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const poNo = req.query.id;
  if (req.method === 'PUT') return updatePO(poNo, req, res);
  if (req.method === 'DELETE') return deletePO(poNo, res);
  res.status(405).json({ error: 'Method not allowed' });
}

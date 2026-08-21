import { query, withTransaction, nextSeq } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { invoiceRowToJson } from '../_lib/serialize.js';

async function listInvoices(req, res) {
  const { rows: invoices } = await query('SELECT * FROM invoices ORDER BY invoice_no');
  if (!invoices.length) return res.status(200).json([]);

  const { rows: allRows } = await query(
    'SELECT * FROM invoice_rows WHERE invoice_id = ANY($1) ORDER BY invoice_id, position',
    [invoices.map(i => i.id)]
  );
  const rowsByInvoice = new Map();
  for (const r of allRows) {
    if (!rowsByInvoice.has(r.invoice_id)) rowsByInvoice.set(r.invoice_id, []);
    rowsByInvoice.get(r.invoice_id).push(r);
  }

  res.status(200).json(invoices.map(inv => invoiceRowToJson(inv, rowsByInvoice.get(inv.id) || [])));
}

// Creates a brand-new invoice. The invoice number is claimed from the sequence and the
// invoice row is inserted in the SAME transaction, so — unlike the old app, where the number
// was merely *previewed* client-side before save — there is no gap at all for two requests
// to be handed the same number.
async function createInvoice(req, res) {
  const body = req.body || {};
  const cust = body.customer || {};
  const product = body.product || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const totals = body.totals || {};

  if (!cust.name) return res.status(400).json({ error: 'Customer name is required' });

  const result = await withTransaction(async (client) => {
    const seq = await nextSeq(client, 'invoice_seq');
    const invoiceNo = String(seq).padStart(3, '0');

    const { rows: [inv] } = await client.query(
      `INSERT INTO invoices (
         invoice_no, invoice_date, po_number,
         customer_name, customer_phone, customer_gstin, customer_addr, customer_site, customer_pin,
         hsn_code, hsn_desc, product_name, driver_name, vehicle_no,
         sub_total, cgst_total, sgst_total, tcs_amount, net_amount,
         amount_words, remarks
       ) VALUES ($1,$2,$3, $4,$5,$6,$7,$8,$9, $10,$11,$12,$13,$14, $15,$16,$17,$18,$19, $20,$21)
       RETURNING *`,
      [
        invoiceNo, body.invoiceDate, body.poNumber || '',
        cust.name, cust.phone || '', cust.gstin || '', cust.address || '', cust.site || '', cust.pin || '',
        product.hsnCode || '38245010', product.hsnDesc || 'READY MIX CONCRETE', product.productName || 'Ready Mix Concrete',
        product.driverName || '', product.vehicleNo || '',
        totals.subTotal || 0, totals.cgstTotal || 0, totals.sgstTotal || 0, totals.tcsAmount || 0, totals.netAmount || 0,
        body.amountWords || '', body.remarks || '',
      ]
    );

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO invoice_rows (invoice_id, position, grade, qty, rate, disc_pct, cgst_pct, sgst_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [inv.id, i, r.grade || '', r.qty || 0, r.rate || 0, r.disc_pct || 0, r.cgst_pct ?? 9, r.sgst_pct ?? 9]
      );
    }

    // Auto-register the customer if this name isn't already on file — mirrors the old
    // autoSaveCustomerFromInvoice() behaviour.
    const { rows: existing } = await client.query(
      'SELECT id FROM customers WHERE lower(name) = lower($1)', [cust.name]
    );
    if (!existing.length) {
      const { rows: [newCust] } = await client.query(
        `INSERT INTO customers (name, phone, gstin, address, site, pincode, auto_created)
         VALUES ($1,$2,$3,$4,$5,$6, true) RETURNING id`,
        [cust.name, cust.phone || '', cust.gstin || '', cust.address || '', cust.site || '', cust.pin || '']
      );
      for (const r of rows) {
        if (!r.grade || !(r.rate > 0)) continue;
        await client.query(
          `INSERT INTO customer_pricing (customer_id, grade, rate, product_name, hsn_code, hsn_desc)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [newCust.id, r.grade, r.rate, product.productName || 'Ready Mix Concrete', product.hsnCode || '38245010', product.hsnDesc || 'READY MIX CONCRETE']
        );
      }
    }

    return invoiceRowToJson(inv, rows.map((r, i) => ({ ...r, position: i, disc_pct: r.disc_pct || 0, cgst_pct: r.cgst_pct ?? 9, sgst_pct: r.sgst_pct ?? 9 })));
  });

  res.status(201).json(result);
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'GET') return listInvoices(req, res);
  if (req.method === 'POST') return createInvoice(req, res);
  res.status(405).json({ error: 'Method not allowed' });
}

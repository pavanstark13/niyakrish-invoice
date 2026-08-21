import { query, withTransaction, nextSeq } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

function toJson(g) {
  return {
    id: g.id, gpno: g.gp_no, gpdate: g.gp_date, vehicle: g.vehicle, dest: g.dest,
    driver: g.driver, mtype: g.mtype, ptype: g.ptype, challan: g.challan,
    totalQty: g.total_qty, remarks: g.remarks, items: g.items, savedAt: g.saved_at,
  };
}

async function listGatePasses(req, res) {
  const { rows } = await query('SELECT * FROM gate_passes ORDER BY saved_at DESC');
  res.status(200).json(rows.map(toJson));
}

// Returns a fresh, atomically-claimed gate pass number without creating a record yet — this
// DOES consume/increment the sequence (it's not a non-mutating peek despite the query param
// name below), mirroring the old app's setDefaults(), which claimed a number as soon as the
// form opened, whether or not the user went on to submit it.
async function nextGpNo(req, res) {
  const now = new Date();
  const yr = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  const seq = await withTransaction(client => nextSeq(client, 'gp_seq'));
  res.status(200).json({ gpno: `NI-GP-${yr}-${String(seq).padStart(3, '0')}` });
}

async function createGatePass(req, res) {
  const body = req.body || {};
  if (!body.gpno || !body.gpdate || !body.dest) {
    return res.status(400).json({ error: 'Fill GP No., Date and Destination first' });
  }
  const { rows: [g] } = await query(
    `INSERT INTO gate_passes (gp_no, gp_date, vehicle, dest, driver, mtype, ptype, challan, total_qty, remarks, items)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [body.gpno, body.gpdate, body.vehicle || '', body.dest, body.driver || '', body.mtype || '',
     body.ptype || 'Non-Returnable', body.challan || '', body.totalQty || '', body.remarks || '',
     JSON.stringify(body.items || [])]
  );
  res.status(201).json(toJson(g));
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'GET') {
    if (req.query.next === '1') return nextGpNo(req, res);
    return listGatePasses(req, res);
  }
  if (req.method === 'POST') return createGatePass(req, res);
  res.status(405).json({ error: 'Method not allowed' });
}

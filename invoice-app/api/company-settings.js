import { query } from './_lib/db.js';
import { requireAuth } from './_lib/auth.js';

function toJson(s) {
  return {
    name: s.name, gstin: s.gstin, cin: s.cin, address: s.address, phone: s.phone, logoUrl: s.logo_url,
    bankName: s.bank_name, bankAccName: s.bank_acc_name, bankAccNo: s.bank_acc_no,
    bankIfsc: s.bank_ifsc, bankBranch: s.bank_branch,
  };
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const { rows: [s] } = await query('SELECT * FROM company_settings WHERE id = 1');
    return res.status(200).json(toJson(s));
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const { rows: [s] } = await query(
      `UPDATE company_settings SET
         name=$1, gstin=$2, cin=$3, address=$4, phone=$5, logo_url=$6,
         bank_name=$7, bank_acc_name=$8, bank_acc_no=$9, bank_ifsc=$10, bank_branch=$11
       WHERE id = 1 RETURNING *`,
      [
        body.name || '', body.gstin || '', body.cin || '', body.address || '', body.phone || '', body.logoUrl || '',
        body.bankName || '', body.bankAccName || '', body.bankAccNo || '', body.bankIfsc || '', body.bankBranch || '',
      ]
    );
    return res.status(200).json(toJson(s));
  }

  res.status(405).json({ error: 'Method not allowed' });
}

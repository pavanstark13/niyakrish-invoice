// Row-shape <-> API-shape mapping helpers shared by the invoice/quotation/PO endpoints.
// Keeps the JSON the frontend sends/receives close to the old app's in-memory object shape,
// so the frontend port stays a mechanical translation rather than a redesign.

export function invoiceRowToJson(inv, rows) {
  return {
    invoiceNo: inv.invoice_no,
    invoiceDate: inv.invoice_date,
    poNumber: inv.po_number,
    customer: {
      name: inv.customer_name,
      phone: inv.customer_phone,
      gstin: inv.customer_gstin,
      address: inv.customer_addr,
      site: inv.customer_site,
      pin: inv.customer_pin,
    },
    product: {
      hsnCode: inv.hsn_code,
      hsnDesc: inv.hsn_desc,
      productName: inv.product_name,
      driverName: inv.driver_name,
      vehicleNo: inv.vehicle_no,
    },
    rows: rows.map(r => ({
      grade: r.grade,
      qty: Number(r.qty),
      rate: Number(r.rate),
      disc_pct: Number(r.disc_pct),
      cgst_pct: Number(r.cgst_pct),
      sgst_pct: Number(r.sgst_pct),
    })),
    totals: {
      subTotal: Number(inv.sub_total),
      cgstTotal: Number(inv.cgst_total),
      sgstTotal: Number(inv.sgst_total),
      tcsAmount: Number(inv.tcs_amount),
      netAmount: Number(inv.net_amount),
    },
    amountWords: inv.amount_words,
    paidAmount: Number(inv.paid_amount),
    status: inv.status,
    remarks: inv.remarks,
  };
}

export function quotationRowToJson(q, rows) {
  return {
    quoteNo: q.quote_no,
    quoteDate: q.quote_date,
    validUntil: q.valid_until,
    status: q.status,
    customer: {
      name: q.customer_name,
      phone: q.customer_phone,
      gstin: q.customer_gstin,
      address: q.customer_addr,
      site: q.customer_site,
    },
    rows: rows.map(r => ({
      description: r.description,
      qty: Number(r.qty),
      unit: r.unit,
      rate: Number(r.rate),
      disc_pct: Number(r.disc_pct),
      gst_pct: Number(r.gst_pct),
    })),
    totals: {
      subTotal: Number(q.sub_total),
      cgstTotal: Number(q.cgst_total),
      sgstTotal: Number(q.sgst_total),
      netAmount: Number(q.net_amount),
    },
    terms: q.terms,
    notes: q.notes,
    convertedToInvoice: q.converted_to_invoice,
  };
}

export function poRowToJson(po, rows) {
  return {
    poNo: po.po_no,
    poDate: po.po_date,
    quoteRef: po.quote_ref,
    deliveryDate: po.delivery_date,
    status: po.status,
    vendor: {
      name: po.vendor_name,
      contact: po.vendor_contact,
      phone: po.vendor_phone,
      gstin: po.vendor_gstin,
      address: po.vendor_addr,
    },
    rows: rows.map(r => ({
      description: r.description,
      qty: Number(r.qty),
      unit: r.unit,
      rate: Number(r.rate),
      gst_pct: Number(r.gst_pct),
    })),
    freight: Number(po.freight),
    terms: po.terms,
    notes: po.notes,
  };
}

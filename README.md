# Niyakrish Invoice

Enterprise invoicing and billing control center for Niyakrish Industries — a single-page app for creating invoices, quotations, purchase orders, and gate passes, with GSTIN customer lookup and PDF export.

## Stack

- Single-file static app: [`invoice-app/index.html`](invoice-app/index.html) (HTML/CSS/vanilla JS, no build step)
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) for PDF export/printing
- [Firebase Firestore](https://firebase.google.com/docs/firestore) for cross-device cloud sync (falls back to `localStorage`-only offline mode if unreachable), with Firestore transactions used for the invoice/quote/PO/gate-pass number counters so two devices can't be handed the same number
- [`invoice-app/api/gstin.js`](invoice-app/api/gstin.js) — a small Vercel serverless function that proxies GSTIN lookups server-side
- Deployed on [Vercel](https://vercel.com), auto-deploying from pushes to `main`

## Features

- Invoice builder with GST calculation, live GSTIN lookup/autofill for customers, and A4-formatted PDF export
- Quotation and Purchase Order builders with dedicated templates
- Outward Gate Pass creation and history
- Customer ledger, payment recording, and outstanding/overdue tracking
- Dashboard with revenue/collections charts and sales concentration by client
- Cloud sync across devices via Firestore, with an offline-first fallback to `localStorage`

## Development

No build step — open [`invoice-app/index.html`](invoice-app/index.html) directly in a browser, or serve it locally:

```bash
cd invoice-app
python -m http.server 8080
# open http://localhost:8080
```

Firebase config is embedded in the app; without network access to Firestore the app runs fully offline against `localStorage`.

## Deployment

Vercel is linked to the `invoice-app/` directory (see `invoice-app/vercel.json` and `invoice-app/.vercel/project.json`) and deploys automatically on push to `main`. No CI/CD workflows are configured — it's a static file, so there's nothing to build.

## Security notes

- The in-app login (Settings → Change Password) is a client-side convenience gate, not a real access-control boundary — session state is just a flag in `sessionStorage`, so it's bypassable from devtools with no password at all. The actual protection for invoice/customer/payment data is the Firestore security rules on the `niyakrish-invoice` Firebase project (confirmed to be rejecting unauthenticated reads/writes as of the last review — verify this hasn't regressed if the rules are ever touched).
- GSTIN lookups go through `invoice-app/api/gstin.js` (a same-origin Vercel serverless function) so the browser never talks to appyflow.in or a public CORS proxy directly. It only falls back to the direct/public-proxy path when running the file outside Vercel (e.g. a plain local static server).

## Known limitation: concurrent multi-device saves

Each data collection (invoices, customers, payments, quotations, purchase orders, etc.) is stored as a single Firestore document holding the entire array as JSON — every save overwrites that whole document. Sequence numbers (invoice/quote/PO/gate-pass) are protected against duplicates via Firestore transactions, but two devices saving *different* records at almost exactly the same moment can still have one save overwrite the other's, since there's no per-record merge. In practice the realtime listeners keep devices in sync outside of that narrow window, so this mostly matters if multiple people are actively entering data within a second or two of each other. A proper fix means moving each collection to one Firestore document per record, which is a larger schema change than a same-session patch — flagged here rather than attempted partially, since a naive array-merge would risk silently resurrecting deleted records instead.

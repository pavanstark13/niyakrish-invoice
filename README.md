# Niyakrish Invoice

Enterprise invoicing and billing control center for Niyakrish Industries — a single-page app for creating invoices, quotations, purchase orders, and gate passes, with GSTIN customer lookup and PDF export.

## Stack

- Single-file static app: [`invoice-app/index.html`](invoice-app/index.html) (HTML/CSS/vanilla JS, no build step)
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) for PDF export/printing
- [Firebase Firestore](https://firebase.google.com/docs/firestore) for cross-device cloud sync (falls back to `localStorage`-only offline mode if unreachable)
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

- The in-app login (Settings → Change Password) is a client-side convenience gate, not a real access-control boundary — the actual protection for invoice/customer/payment data is the Firestore security rules on the `niyakrish-invoice` Firebase project. Review those in the Firebase console if the sensitivity of the data changes.
- GSTIN lookups are proxied through public third-party CORS proxies (see `_fetchGSTINDetails` in `invoice-app/index.html`) since there's no backend. Treat this as a known limitation, not a solved problem.

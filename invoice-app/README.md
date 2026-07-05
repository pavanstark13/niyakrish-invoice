# Niyakrish Invoice Backend

This app no longer depends on Firebase. It serves the invoice UI from a FastAPI backend and stores invoice data in a server-owned SQLite database.

## Run locally

```bash
cd invoice-app
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8080
```

Open `http://127.0.0.1:8080`.

Local development defaults to `admin` / `Niyakrish@690`. In production, set:

```bash
ENVIRONMENT=production
INVOICE_ADMIN_USERNAME=admin
INVOICE_ADMIN_PASSWORD=<strong unique password>
INVOICE_COOKIE_SECURE=true
INVOICE_DATA_DIR=/persistent/data
```

The backend adds server-side sessions, CSRF checks, rate limiting, security headers, PBKDF2 password hashing, and a SQLite key-value store for invoices, customers, payments, gate passes, quotations, purchase orders, sequence counters, and company settings.


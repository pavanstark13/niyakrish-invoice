# Cloud Deployment Guide

Complete step-by-step instructions to deploy the AI Trading Agent Platform to the cloud
(Railway + Neon + Upstash + Vercel) — accessible from any device, anywhere.

---

## Railway Setup (Backend Microservices)

1. Go to [railway.app](https://railway.app) → **Login with GitHub**
2. Click **New Project** → **Deploy from GitHub repo** → select `pavanstark13/Trading-AI-Agent`
3. Railway auto-detects the monorepo via `railway.toml` and creates 6 services:
   - market-data, strategy-engine, risk-management, execution-engine, ai-agent, monitoring
4. For **each service**, go to its **Settings → Variables** and add all required env vars (see below)
5. Each service gets a public URL like `https://market-data-xxx.railway.app`

---

## Neon PostgreSQL Setup (Free Tier)

1. Go to [neon.tech](https://neon.tech) → **Sign up with GitHub** (free)
2. Click **New Project** → name it `trading-ai` → **Create database** named `trading_db`
3. Copy the connection string from the dashboard:
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/trading_db
   ```
4. Append `?sslmode=require` to the end
5. For async SQLAlchemy, replace `postgresql://` with `postgresql+asyncpg://`:
   ```
   postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/trading_db?sslmode=require
   ```
6. Paste this as the `DATABASE_URL` environment variable in Railway

---

## Upstash Redis Setup (Free Tier)

1. Go to [upstash.com](https://upstash.com) → **Sign up with GitHub** (free)
2. Click **Create Database** → select the region **closest to your Railway deployment region**
3. Copy the Redis URL:
   ```
   rediss://default:xxxxx@xxx.upstash.io:6379
   ```
   (Note: `rediss://` with double-s = TLS — required for Upstash)
4. Paste this as the `REDIS_URL` environment variable in Railway

---

## Vercel Frontend Setup

1. Go to [vercel.com](https://vercel.com) → **Login with GitHub**
2. Click **New Project** → **Import** `pavanstark13/Trading-AI-Agent`
3. Set **Root Directory** to `frontend`
4. Add environment variables:
   - `VITE_API_BASE_URL` = your Railway ai-agent URL (e.g. `https://ai-agent-xxx.railway.app`)
   - `VITE_WS_URL` = same URL with `wss://` prefix (e.g. `wss://ai-agent-xxx.railway.app`)
5. Click **Deploy** → get a URL like `https://trading-ai-agent.vercel.app`
6. Access from your phone, iPad, laptop — any browser worldwide

---

## Required Railway Environment Variables

Set these on **every service** that needs them (ai-agent needs all; others need the relevant subset):

```
DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.neon.tech/trading_db?sslmode=require
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
GEMINI_API_KEY=AIza...
AI_PROVIDER=gemini
ALPACA_API_KEY=PK...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets
SECRET_KEY=0f00dc85fdf7bc0a545fb3110b6aaafddbcce51893adc74bb9236c264fdd2e03
ENVIRONMENT=production
LOG_LEVEL=INFO
DATABASE_SSL=true
```

---

## GitHub Secrets for CI/CD

Add these in **GitHub → Settings → Secrets and Variables → Actions**:

| Secret | Where to get it |
|--------|----------------|
| `RAILWAY_TOKEN` | [railway.app/account/tokens](https://railway.app/account/tokens) |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel project settings → General |
| `VERCEL_PROJECT_ID` | Vercel project settings → General |

Once set, every `git push` to `main` will:
- Auto-deploy all backend services to Railway (`cd-staging.yml`)
- Auto-deploy the frontend to Vercel (`cd-production.yml`, only when `frontend/` changes)

---

## Verifying Deployment

After deploy, check each service health endpoint:

```bash
curl https://market-data-xxx.railway.app/api/v1/health
curl https://strategy-engine-xxx.railway.app/api/v1/health
curl https://risk-management-xxx.railway.app/api/v1/health
curl https://execution-engine-xxx.railway.app/api/v1/health
curl https://ai-agent-xxx.railway.app/api/v1/health
curl https://monitoring-xxx.railway.app/api/v1/health
```

Interactive API docs are available at each service URL + `/docs`, e.g.:
`https://ai-agent-xxx.railway.app/docs`

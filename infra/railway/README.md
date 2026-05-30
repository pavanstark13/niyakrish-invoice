# Railway Deployment Notes

## Environment Variables

Railway injects environment variables at runtime. Set them per-service in the Railway dashboard:
**Project → Service → Variables tab**.

Variables set at the project level are shared across all services. Service-level variables
override project-level ones. The `PORT` variable is automatically set by Railway — all
Dockerfiles and nixpacks.toml files use `${PORT:-<default>}` to respect this.

## Adding Neon and Upstash

Railway supports plugins that auto-inject connection strings:

- **Neon PostgreSQL**: In your Railway project → **New** → **Database** → **Neon** (or add
  manually by pasting the `DATABASE_URL` from neon.tech into your service variables).
- **Upstash Redis**: Similarly, add via **New** → **Database** → **Upstash Redis**, or paste
  the `REDIS_URL` (`rediss://...`) manually.

Both Neon and Upstash have generous free tiers suitable for development and low-traffic production.

## Viewing Logs

In the Railway dashboard:
1. Click on a service (e.g. `ai-agent`)
2. Go to the **Deployments** tab
3. Click the latest deployment → **View Logs**

Or use the Railway CLI:
```bash
railway logs --service ai-agent
```

## Scaling Services

To scale a service horizontally in Railway:
1. Go to **Service → Settings → Deploy**
2. Set **Replicas** to the desired count (paid plans only for >1 replica)

To adjust memory/CPU limits:
- Railway automatically allocates resources based on usage on the Starter plan
- On Pro plan: set resource limits in **Service → Settings → Resources**

## Custom Domains

To add a custom domain to any service:
1. **Service → Settings → Networking**
2. Click **Add Custom Domain**
3. Add the CNAME record shown to your DNS provider

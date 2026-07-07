# Digital Sales Automation Center - Deployment + Handoff

## Executive handoff (buyer-ready)

This project is now Django-only and deployed on Railway.

- Frontend (public pages): `https://gilliomfrontlinedigital.com`
- Backend service: `https://digital-sales-automation-center-production.up.railway.app`
- Intended API domain: `https://api.gilliomfrontlinedigital.com` (pending DNS verification)

## Current production status

- Core API routes are live and returning JSON from Railway service URL.
- Dashboard routes hydrate correctly against backend APIs.
- Protected admin/process routes enforce API-key auth.
- Frontend API client now auto-targets `api.gilliomfrontlinedigital.com` when loaded on `gilliomfrontlinedigital.com` or `www.gilliomfrontlinedigital.com`.

## Final DNS step (required)

Create these records at your DNS provider:

- Type: CNAME
- Host/Name: `api`
- Value/Target: `0vm7zitg.up.railway.app`

- Type: TXT
- Host/Name: `_railway-verify.api`
- Value: `railway-verify=9b87f7adff18ecbe01198f581d1af40cb512f0e6486256417746c34198fa435d`

After propagation, verify:

1. `https://api.gilliomfrontlinedigital.com/api/health`
2. `https://api.gilliomfrontlinedigital.com/api/config`
3. `https://gilliomfrontlinedigital.com/analytics.html`

## Deployment operations

Use these from repository root:

```powershell
railway status
railway logs -n 200
railway redeploy
```

## Environment variables checklist (Railway)

Required / recommended:

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG=false`
- `DJANGO_ALLOWED_HOSTS=gilliomfrontlinedigital.com,www.gilliomfrontlinedigital.com,api.gilliomfrontlinedigital.com,digital-sales-automation-center-production.up.railway.app,localhost,127.0.0.1`
- `APP_BASE_URL=https://api.gilliomfrontlinedigital.com`
- `API_ADMIN_KEY=<strong-random-key>`
- `HUNTER_API_KEY` (optional if Hunter enrichment is used)

## Security handoff

- Rotate any keys previously shared in chat/session logs.
- Keep `DJANGO_DEBUG=false` in production.
- Keep `API_ADMIN_KEY` set for protected routes.

## Buyer handoff package

Provide these to buyer:

1. Railway project access + environment variables.
2. Domain registrar access for DNS updates.
3. Repository access and this document.
4. Stripe account/docs (`docs/STRIPE-EXPRESS.md`) if monetization flow is included.

## Known residual risk

- API custom domain is not active until DNS ownership records propagate and Railway cert completes.

## Acceptance criteria for "sale-ready deployed"

- Custom API domain resolves publicly.
- Health/config endpoints pass on custom API domain.
- Frontend pages load and write/read records through API domain.
- One full lead-to-campaign workflow completes without manual DB edits.

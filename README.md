# Digital Sales Automation Center

Digital Sales Automation Center is a Node.js and Express sales workspace for prospect discovery, outreach operations, CRM management, monthly client subscription plans, and Railway deployment.

## Current Production State

- Production URL: https://digital-sales-automation-center-production.up.railway.app
- Local development URL: http://localhost:4000
- Runtime model: Express API + static frontend from `public/`
- Data store: JSON database at `data/db.json`
- Stripe model: subscription checkout for monthly client access plans
- Deployment source of truth: `railway.json`

## Current Feature Set

### Dashboard

- Live summary metrics for prospects, campaign activity, meetings, and pipeline value
- Recent activity log with bulk select, delete, refresh, and trim actions

### Automation Workspace

- Bulk prospect database generation
- Website technology detection
- 4-step industry email sequence generation
- Sales asset pack generation
- 12-month marketing calendar generation
- AI daily orchestration settings and manual execution
- Pipeline recommendation loading
- Integration status and email-job processing controls

### Prospects & CRM

- Prospect creation with company, contact, role, geography, and tech stack metadata
- Prospect validation via `src/services/validationService.js`
- Search, filtering, score ranges, sorting, paging, and CSV export
- Bulk selection and deletion
- AI outreach draft generation for selected prospects

### Email Campaigns and Inbox

- Campaign management and outbound workflow support
- Inquiry and reply tracking
- Bulk delete support for operational cleanup

### Client Subscriptions

- Monthly client plan generation
- Product catalog driven proposal/subscription pipeline
- Stripe checkout session creation for subscription flows
- Bulk proposal selection and deletion

### Scheduling and Analytics

- Demo scheduling workflow
- Funnel and revenue analytics views
- Operational event reporting

### Security and Settings

- Settings page is read-only for secret health/status
- Frontend secret editing is disabled
- Runtime secret updates require explicit server-side controls:
  - `ALLOW_RUNTIME_SECRET_UPDATES=true`
  - `ADMIN_API_TOKEN`
- Secrets are intended to be managed in Railway variables or local server env files, not in browser UI

## Product Catalog and Pricing

The current catalog is served from the canonical defaults in `src/db.js` and persisted in `data/db.json`.

Current monthly starting prices:

- AI Software Operations Studio: `$9`
- Deployment & Stripe Automation Center: `$79`
- Specwright: `$29`
- DBOps Control Center: `$79`
- Elite Fintech Systems: `$12`
- EnPowerCommandPro: `$39`
- RigHand AI: `$34.99`
- PC Checker Extreme: `$4`
- EastBridge Ops Intelligence: placeholder/no published paid price

## Local Development

### Requirements

- Node.js
- npm
- Optional local `.env` for Stripe, SMTP, and OpenAI integrations

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

The app listens on port `4000` by default.

## Scripts

- `npm start` — start the app
- `npm run dev` — run the app locally
- `npm run process:email-jobs` — process queued outbound email jobs
- `npm run connect:railway-stripe -- --public-url <https-url>` — push Railway vars, optionally create Stripe webhook, and deploy
- `npm run verify:deploy-guard` — validate deploy guard expectations before shipping

## Railway and Stripe Automation

The repository includes `scripts/connect-railway-stripe.js` for deployment automation.

What it does:

- optionally logs into Railway
- optionally links the current folder to a Railway project/service
- pushes supported environment variables to Railway
- verifies deployment routes after deploy
- optionally creates a Stripe webhook endpoint
- stores the webhook secret in Railway variables when creation succeeds

### Command

```bash
npm run connect:railway-stripe -- --public-url https://YOUR-APP.up.railway.app
```

### Optional Flags

- `--skip-deploy`
- `--skip-railway-login`
- `--skip-railway-link`
- `--skip-stripe-webhook`

### Supported Environment Variables

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### Stripe Webhook Route

- `POST /api/stripe/webhook`

Stripe webhook creation is skipped when `STRIPE_SECRET_KEY` is not present.

## Deployment Guard

The deployment guard script prevents accidental manifest drift and blocks tracking of files that caused regressions during setup experiments.

Current guard expectations:

- `railway.json` must stay the production deploy source
- `railway.json deploy.startCommand` must remain `npm start`
- `railway.json deploy.restartPolicyType` must remain `ON_FAILURE`
- these files must not be tracked:
  - `railway.toml`
  - `Dockerfile`
  - `deploy.config.json`
  - `.stripe-installer/deploy-manifest.json`
  - `.stripe-installer/stripe-manifest.json`

Run manually:

```bash
npm run verify:deploy-guard
```

## Recent Changes Reflected In This README

- Added bulk delete and multi-select management across operational tables
- Reframed proposals into monthly client subscriptions
- Switched Stripe checkout flow from one-time payment intent behavior to subscription checkout behavior
- Locked frontend settings to read-only secret status
- Fixed stale product catalog behavior by forcing canonical product defaults during DB initialization
- Added deployment guard protection against accidental Railway manifest drift
- Verified current production deployment from GitHub source on Railway

## Repository Notes

- `data/db.json` is the live app data store for local/runtime JSON persistence
- `src/db.js` controls default DB initialization and merge behavior
- `public/js/app.js` drives the browser UI workflows
- `server.js` exposes the REST API and static frontend

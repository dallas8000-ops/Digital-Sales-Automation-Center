# Digital Sales Automation Center

## Railway + Stripe Automation

This app includes an automated setup command that:

- Opens Railway sign-in flow
- Links this project to your Railway project/service
- Pushes app environment variables to Railway
- Creates a Stripe webhook endpoint for checkout events
- Saves the webhook secret back into Railway variables
- Deploys the app to Railway

### Prerequisites

- Railway CLI installed
- Node.js installed
- `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` available in local `.env` (or in shell env vars)

### Run Automated Setup

```
npm run connect:railway-stripe -- --public-url https://YOUR-APP.up.railway.app
```

Optional flags:

- `--skip-deploy`
- `--skip-railway-login`
- `--skip-stripe-webhook`

### Required Environment Variables

The automation syncs these values to Railway when present:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` (created by the script)
- `STRIPE_SUCCESS_URL` (computed from `--public-url`)
- `STRIPE_CANCEL_URL` (computed from `--public-url`)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### Stripe Webhook Endpoint

The webhook endpoint used is:

- `/api/stripe/webhook`

The script creates a Stripe webhook endpoint for event:

- `checkout.session.completed`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### Stripe Webhook Endpoint

The webhook endpoint used is:

- `/api/stripe/webhook`

The script creates a Stripe webhook endpoint for event:

- `checkout.session.completed`

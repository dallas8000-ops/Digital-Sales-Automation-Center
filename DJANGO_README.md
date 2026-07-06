# Digital Sales Automation Center - Django Edition

## Overview

This is the Django migration of the Digital Sales Automation Center. It provides:
- **Prospect management** with mandatory email/domain validation via Hunter.io
- **Email campaign sequencing** with compliance baked in (unsubscribe links, physical address)
- **Email job tracking** with suppression list management
- **Async email sending** via Celery + Redis
- **Stripe payment processing** for premium features
- **API-first architecture** (Django REST Framework)

## Architecture

```
dsac/                    # Django project settings
├── settings.py          # Configuration (DB, Celery, APIs)
├── urls.py              # URL routing
├── celery.py            # Celery configuration
└── wsgi.py              # WSGI entry point

prospects/               # Prospect management app
├── models.py            # Prospect model with validation tracking
├── views.py             # ViewSet with mandatory validation on create
├── serializers.py       # DRF serializers
└── urls.py              # Prospect API endpoints

campaigns/               # Email campaign management app
├── models.py            # Campaign, EmailSequence models
├── views.py             # ViewSet with pre-send validation
├── serializers.py       # Campaign serializers
└── urls.py              # Campaign API endpoints

emails/                  # Email management & sending app
├── models.py            # EmailJob, EmailEvent, SuppressionList models
├── services.py          # ValidationService (Hunter.io integration)
├── tasks.py             # Celery tasks for async email sending
├── views.py             # Email job & suppression list ViewSets
├── serializers.py       # Email serializers
└── urls.py              # Email API endpoints

payments/                # Payment processing app
├── models.py            # Payment, Product models
├── views.py             # Stripe integration ViewSets
├── serializers.py       # Payment serializers
└── urls.py              # Payment API endpoints

public/                  # Frontend (vanilla JS, unchanged from Node)
├── index.html           # Home page
├── automation.html      # Campaign builder (uses API instead of Express)
├── prospects.html       # Prospect list
├── campaigns.html       # Campaign list
├── js/api.js            # JavaScript API client (points to /api/* endpoints)
└── css/app.css          # Styling

manage.py                # Django management CLI
requirements.txt         # Python dependencies
```

## Setup

### 1. Prerequisites
- Python 3.11+
- PostgreSQL (local or cloud - Railway recommended)
- Redis (for Celery - Railway recommended)

### 2. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database (PostgreSQL on Railway or local)
DATABASE_NAME=dsac
DATABASE_USER=postgres
DATABASE_PASSWORD=your-password
DATABASE_HOST=localhost
DATABASE_PORT=5432

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# APIs
HUNTER_API_KEY=your-hunter-io-key
OPENAI_API_KEY=your-openai-key

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Celery & Redis
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Database Setup

```bash
# Create migrations
python manage.py makemigrations

# Run migrations
python manage.py migrate

# Create superuser (admin)
python manage.py createsuperuser
```

### 5. Run Locally

**Terminal 1 - Django Web Server:**
```bash
python manage.py runserver 0.0.0.0:8000
```

**Terminal 2 - Celery Worker (for async email sending):**
```bash
celery -A dsac worker -l info
```

**Terminal 3 - Celery Beat Scheduler (optional, for scheduled tasks):**
```bash
celery -A dsac beat -l info
```

Access the app at `http://localhost:8000`
Admin panel: `http://localhost:8000/admin/`

## API Endpoints

### Prospects
- `GET /api/prospects/` - List all prospects
- `POST /api/prospects/` - Create prospect (**mandatory validation**)
- `GET /api/prospects/{id}/` - Get prospect
- `PUT /api/prospects/{id}/` - Update prospect
- `DELETE /api/prospects/{id}/` - Delete prospect
- `POST /api/prospects/validate/` - Batch validate by IDs

### Campaigns
- `GET /api/campaigns/` - List campaigns
- `POST /api/campaigns/` - Create campaign
- `POST /api/campaigns/{id}/add_prospects/` - Add prospects to campaign
- `POST /api/campaigns/{id}/launch/` - Launch campaign (**pre-send validation**)

### Emails
- `GET /api/emails/jobs/` - List email jobs
- `POST /api/emails/jobs/` - Create email job
- `GET /api/emails/suppression/` - List suppressed emails
- `POST /api/emails/suppression/add_email/` - Add email to suppression list
- `GET /api/emails/suppression/check/?email=...` - Check if email suppressed

### Payments
- `GET /api/payments/products/` - List products
- `POST /api/payments/payments/create_payment_intent/` - Create Stripe payment
- `POST /api/payments/payments/confirm_payment/` - Confirm payment status

## Key Features

### 1. Mandatory Prospect Validation
- **POST /api/prospects/** requires both `email` and `domain`
- Validation via Hunter.io happens **before** saving
- Returns 422 "Data not confirmed" if validation fails
- No unverified data enters the system

### 2. Email Compliance
- Unsubscribe links and physical business address baked into email sequences
- Pre-send checklist blocks campaign launch if compliance missing
- Suppression list prevents sending to unsubscribed/bounced addresses

### 3. Async Email Sending
- Celery tasks process email jobs without blocking requests
- Redis stores task queue and results
- Email events tracked (sent, opened, clicked, bounced, complained)
- [SIMULATED] tag for test mode events prevents confusion

### 4. Campaign Pre-Send Validation
- Blocks launch if prospects unverified
- Blocks launch if email sequences missing
- Blocks launch if unsubscribe/address links missing
- Enforces send-rate limits

### 5. Stripe Payment Integration
- Products managed via Django admin
- Payment intents created server-side (secure)
- Payment status tracked and persisted

## Frontend Integration

The vanilla JS frontend (unchanged from Node version) calls Django API:

**Old (Node):** `POST http://localhost:4000/api/prospects`
**New (Django):** `POST http://localhost:8000/api/prospects`

To migrate frontend, update `public/js/api.js`:
```javascript
const API_BASE = 'http://localhost:8000/api'; // was 4000
```

The response format is identical, so **no business logic changes needed** in frontend.

## Deployment to Railway

### 1. Create Railway Project
```bash
railway init
```

### 2. Link Database & Redis
- Add PostgreSQL plugin
- Add Redis plugin

### 3. Set Environment Variables
In Railway dashboard, add all `.env` variables.

### 4. Deploy
```bash
railway up
```

Railway will:
- Build Docker image (uses `Dockerfile.django`)
- Run migrations automatically (`python manage.py migrate`)
- Start Gunicorn on port 8000
- Start Celery worker

### 5. Update Procfile
Change `Procfile` to `Procfile.django` in Railway settings.

## Database Schema

**Prospects**
- email, firstName, lastName, company, domain, industry, website, phone, location
- validation (JSON: email & domain verification results)
- emailVerified, domainVerified (boolean flags)
- score, recommendedProduct, source, created_at, updated_at, last_verified

**Campaigns**
- name, description, status (draft/scheduled/running/paused/completed)
- prospects (M2M), send_rate_limit, start_date, end_date
- total_sent, total_opened, total_clicked, total_bounced
- created_at, updated_at

**EmailSequences**
- campaign (FK), order, name, subject, body, html_body, delay_hours
- unsubscribe_link, sender_address, created_at, updated_at

**EmailJobs**
- prospect (FK), to_email, subject, body, html_body
- unsubscribe_link, sender_address, status (pending/sending/sent/failed/bounced)
- created_at, sent_at, failed_reason, metadata

**EmailEvents**
- email_job (FK), event_type (sent/delivered/opened/clicked/bounced/complained/unsubscribed)
- timestamp, metadata, is_simulated (for [SIMULATED] tracking)

**SuppressionList**
- email (unique), reason (unsubscribed/hard_bounce/complaint/manual)
- added_at, prospect (FK), metadata

**Payments**
- user (FK), stripe_payment_intent, amount, currency, status
- product, metadata, created_at, updated_at

**Products**
- stripe_product_id, name, description, price, currency, category, features
- created_at, updated_at

## Admin Panel

Access `/admin/` with superuser credentials.

Manage:
- Prospects (with validation status)
- Campaigns (with email sequence builder)
- Email jobs and events
- Suppression list
- Payments and products

## Rate Limiting & Send Rates

**Send-rate limiting is configurable per campaign:**
- Set `send_rate_limit` when creating campaign (default 50/day)
- Celery respects this via task scheduling
- Prevents domain reputation damage from burst sends

**Suppression list:**
- Automatically populated from bounce/complaint/unsubscribe events
- Pre-checked before every send
- Prevents sending to blocked addresses

## Testing

### Local API Testing
```bash
# Create prospect (will validate)
curl -X POST http://localhost:8000/api/prospects/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "firstName": "John",
    "domain": "example.com",
    "company": "Example Corp"
  }'

# Check suppression list
curl -X GET "http://localhost:8000/api/emails/suppression/check/?email=john@example.com"
```

### Admin Tests
1. Log in to `/admin/`
2. Create a prospect (validation triggered)
3. Create a campaign, add prospects
4. Try launching campaign (pre-send checks run)

## Known Differences from Node Version

| Feature | Node | Django |
|---------|------|--------|
| Database | JSON file | PostgreSQL |
| Async | 30s loops | Celery tasks |
| Server | Express | Gunicorn + Celery |
| ORM | Custom JS | Django ORM |
| Admin | None | Built-in Django admin |
| Validation | In-process | Hunter.io integration |
| Email | Nodemailer | Django mail backend |

## Migration Checklist

- [x] Django project structure
- [x] Prospect model with validation
- [x] Campaign & sequence models
- [x] Email job & event tracking
- [x] Suppression list
- [x] Payment models
- [x] Celery integration
- [x] Hunter.io ValidationService
- [x] DRF API endpoints (identical to Node contracts)
- [x] Admin interface
- [x] Deployment configs (Procfile, Dockerfile)
- [ ] Run migrations
- [ ] Test endpoints
- [ ] Migrate frontend API client
- [ ] Deploy to Railway

## Support

For questions or issues:
1. Check Django logs: `python manage.py runserver`
2. Check Celery logs: `celery -A dsac worker -l info`
3. Check admin panel for data integrity
4. Review API responses via curl/Postman

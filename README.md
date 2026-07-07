# Digital Sales Automation Center

Digital Sales Automation Center is a Django and static-frontend sales operations workspace for prospect intake, CRM workflows, campaign support, subscription operations, and automation controls.

## Current Runtime and Scope

- Backend runtime: Django (Python)
- Frontend runtime: static HTML/CSS/JS in `public/`
- Local data store: `data/db.json`
- Local app URL: `http://localhost:4000`
- Deployment target: Railway

The repository is intentionally single-backend-runtime (Django/Python). Legacy Node backend files have been removed to prevent runtime conflicts and regression paths.

## Project Structure

- `backend/`: Django project settings and root URL wiring
- `core/`: Django API handlers and app logic
- `public/`: static frontend pages and browser JS
- `data/db.json`: runtime JSON data used by the Django views
- `scripts/verify_deploy_guard.py`: deployment guard to prevent conflicting runtime files

## Implemented API Surface (Django)

- `GET /api/health`
- `GET /api/config`
- `GET /api/products`
- `GET|POST /api/prospects`
- `GET /api/prospects/query`
- `GET /api/prospects/possible-clients`
- `GET /api/prospects/export.csv`
- `GET /api/integrations/status`
- `GET /api/email-jobs`
- `POST /api/email-jobs/process`
- `GET /api/ai/automation/status`
- `POST /api/ai/automation/settings`
- `POST /api/ai/automation/run`
- `GET /api/ai/pipeline-recommendations`
- `POST /api/discovery/tech-detect`
- `GET /api/sales-package/assets`
- `GET /api/sales-package/calendar`
- `GET /api/sales-package/sequence`

## Data Integrity and Validation Policy

- Synthetic bulk prospect generation path has been removed.
- Prospect creation enforces verification prerequisites:
	- company and email are required
	- `HUNTER_API_KEY` is required for validation-enabled ingest
	- invalid email/domain checks are blocked with a non-success response
- Single-runtime guard is in place to block reintroduction of conflicting backend stacks.

## Local Development

### Requirements

- Python 3.11+
- Virtual environment recommended

### Install

```bash
pip install -r requirements.txt
```

### Run

```bash
python manage.py migrate
python manage.py runserver 0.0.0.0:4000
```

## Deployment

- Railway start command: `python manage.py runserver 0.0.0.0:$PORT`
- Nixpacks provider: `python`

## Deploy Guard

Run manually:

```bash
python scripts/verify_deploy_guard.py
```

The guard enforces Python runtime config and fails if conflicting legacy backend files are tracked.

## Smoke Test Snapshot (Latest Local)

Validated during the latest smoke pass:

- Health endpoint responded successfully
- Product catalog endpoint responded with configured products
- Integration status endpoint responded successfully
- Tech detection endpoint responded with validated fingerprint results
- Automation page rendered and loaded status panels

Expected behavior observed:

- Prospect create with placeholder/disposable-style data can fail by validation design when verification prerequisites are not satisfied

## Suggested Upgrades to Solidify the App

1. Replace raw JSON `<pre>` blocks in UI with document-style rendering.
2. Add a "Report View" component for outputs (cards, sections, headings, status badges) instead of showing API payloads directly.
3. Add export options for generated outputs: PDF, DOCX-style print layout, and structured CSV where appropriate.
4. Add server-side schema validation for all write endpoints to enforce payload contracts consistently.
5. Add API authentication and role-based access for admin-only operations.
6. Move from local JSON file to PostgreSQL via Django models and migrations for stronger data integrity and concurrency handling.
7. Add automated test coverage for critical flows: prospect create validation, automation status/settings, and integration status.
8. Add rate limiting and audit logging for write-heavy endpoints.
9. Add CI smoke tests that call core endpoints after deploy and fail fast on regressions.
10. Add a "Compliance Mode" setting that disables any non-verified ingest pathways at runtime with explicit admin controls.

## UI Improvement Note (Your Observation)

Your observation is correct: parts of the automation screens currently display raw data payloads rather than word/document-style output. The highest-value immediate UX improvement is to introduce formatted result templates (executive summary, findings, next actions, references) and reserve raw JSON for an optional developer debug panel.

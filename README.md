# Digital Sales Automation Center

Digital Sales Automation Center is a Django-based sales workspace for prospect operations, CRM workflows, automation controls, and deployment on Railway.

## Runtime

- Backend: Django (`backend/`, `core/`)
- Frontend: static pages in `public/`
- Data file: `data/db.json`
- Local URL: `http://localhost:4000`

## Local Development

### Requirements

- Python 3.11+

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

Run guard checks with:

```bash
python scripts/verify_deploy_guard.py
```

This guard enforces Django runtime settings and blocks legacy Node backend files from being tracked again.

## Data Integrity Policy

- Synthetic prospect generation is removed.
- Prospect ingestion is expected to use validated workflows.
- The app should keep a single backend language/runtime path (Django/Python) to prevent conflicts.

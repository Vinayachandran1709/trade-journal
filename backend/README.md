# Trade Intelligence Platform - Backend

FastAPI backend with PostgreSQL (Neon DB), JWT authentication, and SQLAlchemy ORM.

## Setup

```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```cmd
copy .env.example .env
```

Release 0 adds optional CORS configuration for local web and extension work:

```env
CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

`chrome-extension://<extension-id>` origins are already allowed by regex for local unpacked extension development.

## Database Migrations

```cmd
# Generate a migration after model changes
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

## Run

```cmd
uvicorn app.main:app --reload
```

API docs available at `http://localhost:8000/docs`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /api/auth/signup | Register new user |
| POST | /api/auth/login | Login, returns JWT |
| GET | /api/auth/me | Get current user (auth required) |

## Stock Master Sync

The stock master powers the extension ticker dictionary and company-name resolution for
market lookups. Heavy normalization and NSE/BSE dedupe happen on the backend so the
browser extension stays lightweight.

### Run manually

```cmd
cd backend
python -m app.jobs.sync_stock_master
```

The sync job:

- downloads the NSE equity security list from official NSE-hosted CSV sources
- downloads the latest available BSE equity bhavcopy ZIP from BSE
- normalizes and merges both sources into the `stocks` table
- deduplicates primarily by ISIN
- upserts idempotently without creating duplicates

### Daily scheduling

This repo does not currently run an always-on internal scheduler, so the recommended
production setup is an external daily trigger.

Examples:

- Railway cron job running `python -m app.jobs.sync_stock_master`
- GitHub Actions scheduled workflow
- server cron / Windows Task Scheduler for self-hosted environments

If one or both exchange downloads fail, the job does not wipe the existing stock master.
The next scheduled run retries automatically.

### Extension endpoints

- `GET /api/stocks/dictionary`
- `GET /api/stocks/debug`

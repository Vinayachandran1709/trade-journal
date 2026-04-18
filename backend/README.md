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

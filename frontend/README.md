# Trade Intelligence Platform - Frontend

Next.js 14 frontend with TypeScript, Tailwind CSS, and JWT authentication.

## Setup

```cmd
cd frontend
npm install
copy .env.local.example .env.local
```

## Run

```cmd
npm run dev
```

Opens at `http://localhost:3000`. Requires the backend running on `http://localhost:8000`.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/signup` | Create account |
| `/login` | Login |
| `/dashboard` | Protected dashboard |

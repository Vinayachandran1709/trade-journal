# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trade Journal is a three-part trading analytics platform: a **FastAPI backend**, a **Next.js frontend**, and a **Chrome extension** that auto-captures trades from broker websites (Zerodha, Groww).

## Commands

### Backend (`/backend`)
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload        # Dev server on port 8000
pytest                                # Run tests
alembic revision --autogenerate -m "description"  # Generate migration
alembic upgrade head                  # Apply migrations
```
API docs available at `http://localhost:8000/docs`.

### Frontend (`/frontend`)
```bash
npm install
npm run dev      # Dev server on port 3000
npm run build
npm run lint
```
Requires backend on `http://localhost:8000`. Copy `.env.local.example` → `.env.local`.

### Extension (`/extension`)
```bash
npm install
npm run dev      # Watch mode (Vite)
npm run build    # Output to dist/
npm run typecheck
```
Load unpacked from `dist/` at `chrome://extensions/`. Copy `.env.example` → `.env`.

## Architecture

```
Chrome Extension
  ↓ DOM scraping (Zerodha/Groww pages)
  ↓ REST API (Bearer token)
FastAPI Backend (port 8000) ←→ PostgreSQL (Neon)
  ↑ REST API
Next.js Frontend (port 3000)
```

### Backend (`/backend/app/`)

- **Auth:** JWT (PyJWT) with bcrypt. Token expiry: 7 days. CORS allows `localhost:3000` and `chrome-extension://*`.
- **Routes:** `routes/auth.py` (signup/login/me), `routes/trades.py` (import, capture, CRUD, processing)
- **Services:** `services/universal_csv_parser.py` (multi-broker CSV auto-detection), `services/csv_parser.py` (broker-specific), `services/trade_import_service.py` (deduplication + DB write), `services/auth_service.py`
- **Models:** `User`, `Trade`, `CompletedTrade` (plus scaffolded: `PatternAnalysis`, `BehavioralPattern`, `TradeSetup`)
- **Database:** SQLAlchemy 2.0 with connection pooling tuned for Neon (pool_size=5, recycle=300s)

Key trade endpoints:
- `POST /api/trades/import/universal-csv` — auto-detects broker format from column headers; requires manual mapping if confidence < 60%
- `POST /api/trades/auto-capture` — receives trades from extension
- `GET /api/trades/completed` — FIFO-matched BUY/SELL pairs with P&L
- `POST /api/trades/process` — recalculates all completed trades

**FIFO matching** in `services/trade_import_service.py`: consumes oldest BUY entries per symbol when a SELL arrives. Calculates `pnl`, `return_pct`, `holding_days`.

**Deduplication** uses composite key: `(user_id, symbol, type, quantity, price, date)` checked against DB + current import batch.

### Frontend (`/frontend/src/`)

- `app/` — Next.js App Router pages: `/`, `/login`, `/signup`, `/dashboard`, `/dashboard/trades`, `/import`, `/import/csv`, `/import/groww`, `/import/zerodha`
- `lib/auth.ts` — `signup()`, `login()`, `getMe()`, `logout()`. Token stored in `localStorage` as `"token"`.
- `lib/trades.ts` — trade fetch/import helpers
- `components/AuthGuard.tsx` — wraps all protected routes
- All API calls use `Authorization: Bearer {token}` header

### Extension (`/extension/src/`)

Communication flow:
1. Content script detects broker URL → runs DOM adapter (`brokers/zerodha.ts` or `brokers/groww.ts`)
2. Parsed trades sent via `chrome.runtime.sendMessage("capture:submit", trades)`
3. Background service worker (`background/index.ts`) posts to `/api/trades/auto-capture`
4. Captured state persisted in `chrome.storage.local`; badge shows pending count

Key message types (defined in `shared/types.ts`): `auth:login`, `auth:logout`, `capture:submit`, `capture:get-state`, `capture:update-trade`, `broker:page-detected`

Auth token stored in `chrome.storage.local` under key `"auth_token"`.

## Environment Variables

**Backend** (`.env`):
```
DATABASE_URL=postgresql://...
SECRET_KEY=...
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
```

**Extension** (`.env`):
```
VITE_API_BASE_URL=http://localhost:8000
VITE_WEB_APP_URL=http://localhost:3000   # set to https://indiacircle.in for prod build
```

## Billing (Release 1B)

- **Routes:** `routes/billing.py` — two routers registered in `main.py`: `billing_router` (prefix `/api/billing`) and `webhook_router` (prefix `/api/webhooks`)
- **Service:** `services/razorpay_service.py` — wraps Razorpay Python SDK; `verify_webhook_signature` uses HMAC-SHA256 over raw request body
- **Pricing:** Pro Monthly ₹599 (59900 paise), Pro Annual ₹4,999 (499900 paise)
- **FOUNDING coupon:** seeded by migration `b8e2f1a3c9d0`, max 100 redemptions, grants 90-day Pro access; tracked via `coupons.current_redemptions`
- **Webhook idempotency:** `PaymentEvent.provider_event_id` (unique constraint) prevents double-processing
- **Frontend pages:** `/pricing`, `/checkout?plan=…`, `/account`, `/account/billing`, `/download`
- **Checkout flow:** `createOrder` → load Razorpay JS SDK at runtime → open modal → `verifyPayment` on success
- **Subscription states:** `"pro"` (active), `"pro_cancelled"` (cancelled, still runs until `subscription_expires_at`), `null`/`"free"` (free)

## CSV Parser — Broker Detection

`universal_csv_parser.py` normalizes headers to lowercase alphanumeric, matches against per-broker field signatures, and picks the highest-confidence broker (threshold: 60%). Supports 10 brokers: Zerodha, Groww, Angel One, Upstox, Dhan, 5Paisa, ICICI Direct, HDFC Sec, Kotak Sec, Motilal Oswal. Handles 10+ date formats and 3 file encodings (utf-8, utf-8-sig, latin-1).

Zerodha email import uses regex against the format: `"You have bought/sold N shares of SYMBOL at ₹PRICE on DD-MMM-YYYY"`.

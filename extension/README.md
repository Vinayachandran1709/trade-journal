# Trade Copilot Extension

Chrome Manifest V3 extension scaffold for Release 0.

## Setup

```cmd
cd extension
npm install
```

## Environment Files

- `.env.development`: local extension build values
- `.env.production`: production extension build values
- `.env`: optional shared defaults only; prefer the mode-specific files above as the source of truth

Expected local development values:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WEB_APP_URL=http://localhost:3000
```

Expected production values:

```env
VITE_API_BASE_URL=https://YOUR-RAILWAY-BACKEND-URL.up.railway.app
VITE_WEB_APP_URL=https://YOUR-FRONTEND-DOMAIN.com
```

## Production Build

```cmd
cd extension
npm run build
```

`npm run build` uses Vite production mode, reads `.env.production`, and rejects localhost or non-HTTPS URLs.

## Local Development Build

```cmd
cd extension
npm run build:dev
```

`npm run build:dev` uses Vite development mode and reads `.env.development`.

## Watch Mode

```cmd
cd extension
npm run dev
```

`npm run dev` runs `vite build --watch --mode development` so the unpacked extension can be reloaded in Chrome after file changes.

## Load In Chrome

Load the unpacked extension from `extension\dist` in Chrome.

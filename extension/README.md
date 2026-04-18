# Trade Copilot Extension

Chrome Manifest V3 extension scaffold for Release 0.

## Setup

```cmd
cd extension
copy .env.example .env
npm install
```

## Build

```cmd
cd extension
npm run build
```

Load the unpacked extension from `extension\dist` in Chrome.

## Development

```cmd
cd extension
npm run dev
```

`npm run dev` runs `vite build --watch` so the unpacked extension can be reloaded in Chrome after file changes.

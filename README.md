# Naira POS

Offline-first supermarket POS MVP for a single Nigerian store, built with React, TypeScript, Zustand, Dexie/IndexedDB, and Supabase.

## Run locally

```bash
npm install
npm run dev
```

The app starts with sample inventory in IndexedDB. Every sale is committed locally and written to an outbox queue so checkout remains usable without an internet connection.

The app is installable as a Progressive Web App (PWA). After the first online load, the app shell is cached for offline reopening; operational data remains in IndexedDB.

## Configure Supabase

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to create the project, apply all migrations, seed the starter store/catalogue, and create staff accounts.

The included sync worker processes the local `outbox` automatically when online. It uses locally generated sale UUIDs as idempotency keys, and marks a sale synced only after the server accepts it.

All monetary database values use kobo (`price_kobo`) to avoid decimal rounding; the browser prototype currently uses naira values for its display-only starter data.

# Ozon Admin Web

Frontend for Ozon internal admin, built with Next.js App Router.

## Tech Stack

- Next.js 16
- React 19
- TypeScript

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Default URL: `http://localhost:3000`

## API Base URL

Use `NEXT_PUBLIC_API_BASE_URL` in `.env.local`.

Example:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

## Available Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Main Pages

- `/orders`: order list, status/store/amount/date filtering, CSV export, detail modal
- `/stores`: store CRUD, status filtering, keyword search, CSV export, detail modal

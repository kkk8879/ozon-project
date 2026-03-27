# Ozon Admin API

Backend service for Ozon internal admin, built with NestJS + Prisma.

## Local Development

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:db:push
npm run start:dev
```

Default URL: `http://localhost:3001`

## Health Checks

- `GET /` basic service info
- `GET /health` liveness
- `GET /health/ready` readiness (includes DB connectivity check)

## Production Start

```bash
npm ci
npm run build
npm run start:prod:migrated
```

`start:prod:migrated` runs:
1. `prisma generate`
2. `prisma migrate deploy`
3. `node dist/main`

## Environment Variables

Copy from `.env.example` and adjust:

- `NODE_ENV`, `HOST`, `PORT`
- `CORS_ORIGINS` (comma-separated; use your frontend domain in cloud)
- `DATABASE_URL` (PostgreSQL)
- `ORDER_AUTO_SYNC_*`
- `OZON_SYNC_*`
- `ORDER_WEBHOOK_*`

## Migration & Backup (Before Cloud Cutover)

Recommended pre-cutover checks:

```bash
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

If target DB already contains existing tables (non-empty DB), mark baseline once:

```bash
npx prisma migrate resolve --applied 20260326060000_postgres_baseline
```

Windows backup/restore helper scripts are provided in project root:

- `scripts/ops-db-backup.ps1`
- `scripts/ops-db-restore.ps1`

## Main Endpoints

- `GET /orders`
- `GET /orders/summary`
- `GET /orders/statuses`
- `POST /orders/sync`
- `GET /orders/sync-logs`
- `GET /stores`
- `POST /stores`
- `PATCH /stores/:id`
- `DELETE /stores/:id`
- `GET /accounts`
- `POST /accounts/login`

## Cloud Migration Note

Project now targets PostgreSQL in Prisma schema.  
Before first startup on cloud, ensure DB user has schema create/update permission.

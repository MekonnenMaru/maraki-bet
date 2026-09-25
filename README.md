# Maraki Bet

Phase 0–5 of a modular sportsbook: Next.js client, Express API, MySQL/Prisma catalog, Redis live odds, OddsPapi ingest, player auth, ETB wallet, place-bet, and score-based settlement.

OddsPapi is a data provider only. The API key never leaves the backend.

## Stack

- Frontend: Next.js + TypeScript + CSS
- Backend: Node.js + Express + TypeScript
- Database: MySQL + Prisma
- Cache / live odds: Redis
- Our realtime fan-out: WebSocket
- Provider: OddsPapi REST snapshots, plus a WS client that stays idle-safe if the plan has WebSocket disabled

## Start

Local MySQL (XAMPP) and Redis must be running. Docker Compose is optional if you prefer containers.

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:3000 (later `www.marakibet.com`)
- Admin: http://localhost:3001 (later `admin.marakibet.com`)
- Cashier / Agent apps are separate (ports 3002 / 3003, later `cashier.marakibet.com` / `agent.marakibet.com`)
- API: http://localhost:4000/health
- Auth: `POST /api/v1/auth/register`, `/auth/login`, `/auth/me`
- Wallet: `GET /api/v1/wallet`, `POST /api/v1/wallet/deposit` (test deposit 1–10000 ETB)
- Bets: `POST /api/v1/bets`, `GET /api/v1/bets`, `GET /api/v1/coupons/:code`
- Settlement: finished fixtures grade 1X2 / BTTS / totals; void refunds stake; wins credit `BET_WIN`. Test settle: `POST /api/v1/bets/:code/test-settle`
- Admin: `POST /api/v1/admin/auth/login`, dashboard / users / bets / settle. Seed with `pnpm seed:admin` (default `admin` / `maraki-admin-1`)
- Force a catalog/odds refresh: `pnpm sync`

Copy `.env.example` to `.env` and `apps/api/.env` before running. The free OddsPapi plan uses REST v4 (`https://api.oddspapi.io/v4`), is capped at 250 requests/month, and has WebSocket disabled. Ingest therefore defaults to a one-shot REST sync (`CATALOG_SYNC_ON_START=true`, `ODDSPAPI_ENABLE_WS=false`, `ENABLE_ODDSPAPI_POLL=false`).

# Bambino

Smart, Sustainable Babywear — Hassle-Free, Every Month.

A subscription and circular-commerce platform for baby clothing, launching in Kigali, Rwanda: subscribe, get
the right size, wear, return, exchange, reuse.

**Current state: Phases 1 to 6 and 8 are done, Phase 7 (mobile) has its core slice, and Phase 9 (verification) is in
progress.** The API covers accounts, staff roles, the catalogue, cart, checkout, orders, delivery, payments against a mock
provider, pay on delivery (mobile money at the door), baby profiles, rules-based sizing, subscriptions with renewal, the garment lifecycle,
returns, inspection, exchange credit and exchanges. The design system (`packages/ui`), the customer website
(`apps/web`), the admin dashboard (`apps/admin`) and the Expo mobile app (`apps/mobile`: sign in, shop, cart, checkout,
payment, orders, subscription, exchanges, babies) are built. The website, admin and API run on Cloudflare previews;
product photos are stored in Cloudflare R2. Payments use test wallets only, and email is logged rather than sent: a real
mobile-money provider, an email provider and a domain are still needed for production. See
[docs/README.md](docs/README.md) for the full status, [docs/11-verification.md](docs/11-verification.md) for the
latest checks, and the architecture documents.

## Requirements

- Node.js 22 or later
- pnpm 12 (`corepack enable` or the standalone installer)
- Docker Desktop for the local PostgreSQL and object storage (optional: development and tests can also use an in-process PostgreSQL, PGlite).

## Local storage with Docker

`docker-compose.yml` runs PostgreSQL 18 (port 5433) and RustFS, an S3-compatible object store (API on 9000,
console on 9001). Both listen on 127.0.0.1 only and use development credentials.

```sh
docker compose up -d                          # start (Docker Desktop must be running)
pnpm --filter @bambino/api db:migrate         # apply migrations to the Docker PostgreSQL
pnpm --filter @bambino/api storage:init       # create the bucket; product images become publicly readable
pnpm --filter @bambino/api db:seed            # roles, permissions and labelled development data
docker compose down                           # stop; data is kept in Docker volumes
```

`.env.local` (git-ignored; template in `.env.example`) points the API at these services. MinIO was the original
choice but no longer publishes free container images, so RustFS stands in; any S3-compatible service works.

To run the test suite against the real servers instead of the in-process database:

```sh
TEST_DATABASE_URL=postgresql://bambino:bambino_dev_password@127.0.0.1:5433/postgres \
TEST_STORAGE_ENDPOINT=http://127.0.0.1:9000 TEST_STORAGE_ACCESS_KEY=bambino TEST_STORAGE_SECRET_KEY=bambino_dev_password \
pnpm test
```

Each test file then creates and drops its own database. Without these variables the live storage tests are skipped.

## Commands

```sh
pnpm install
pnpm typecheck     # TypeScript across all packages
pnpm lint          # ESLint
pnpm test          # Vitest across all packages
pnpm format:check  # Prettier
pnpm db:generate   # new SQL migration after editing database/src/schema

# API (reads .env.local at the repository root; copy .env.example first)
pnpm --filter @bambino/api dev         # start with reload; pglite: databases are migrated on start
pnpm --filter @bambino/api db:migrate  # apply migrations to a PostgreSQL server
pnpm --filter @bambino/api db:seed     # roles, permissions and labelled development data

# Website (reads API_URL, default http://127.0.0.1:4000/graphql; start the API first)
pnpm --filter @bambino/web dev         # http://localhost:3000, design system at /design
pnpm --filter @bambino/admin dev       # http://localhost:3001/admin (staff accounts only)
pnpm --filter @bambino/ui tokens       # regenerate theme.css after editing packages/ui/src/tokens.ts

# End-to-end journeys (starts the API and website if they are not running). Needs SEED_ADMIN_PASSWORD in
# .env.local and `pnpm --filter @bambino/api db:seed`. E2E_CHANNEL=msedge uses the installed Edge; otherwise
# run `pnpm --filter @bambino/e2e exec playwright install chromium` once.
E2E_CHANNEL=msedge pnpm --filter @bambino/e2e e2e
```

## Layout

| Path              | Contents                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `apps/api`        | GraphQL API: server, auth, services, domain lifecycles, contract                          |
| `packages/types`  | Status enums and the permission catalogue shared by everything                            |
| `packages/utils`  | Integer money arithmetic and formatting                                                   |
| `packages/config` | Market configuration (Rwanda)                                                             |
| `database`        | Drizzle schema, SQL migrations, PGlite test helper                                        |
| `docs`            | Architecture, data model, security, payments, lifecycles, routes, testing, open questions |

Copy `.env.example` to `.env.local` when the API arrives; never commit real values.

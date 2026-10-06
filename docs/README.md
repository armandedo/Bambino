# Bambino technical documentation

| #   | Document                                       | Covers (specification §52 item)                                                                                                  |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Architecture](01-architecture.md)             | Architecture overview (1), technology decisions (2), monorepo structure (3), provider abstractions, money, i18n, errors, privacy |
| 2   | [Data model](02-data-model.md)                 | Database ERD and schema (4)                                                                                                      |
| 3   | [Auth and security](03-auth-and-security.md)   | Authentication flow (6), security model (15)                                                                                     |
| 4   | [Payments](04-payments.md)                     | Payment architecture (7)                                                                                                         |
| 5   | [Lifecycles and sizing](05-lifecycles.md)      | Subscription (8), return/exchange (9), garment (10) lifecycles, sizing engine (11)                                               |
| 6   | [Route maps](06-routes.md)                     | Web routes (12), mobile navigation (13), admin routes (14)                                                                       |
| 7   | [Testing and phases](07-testing-and-phases.md) | Testing strategy (16), development phases (17)                                                                                   |
| 8   | [Open questions](08-open-questions.md)         | Business decisions the build depends on                                                                                          |
| 9   | [Operations](09-operations.md)                 | Deploys, migrations, rollback, backups and restore, secret rotation, launch checklist                                            |

The GraphQL schema (5) is the SDL itself: [`apps/api/src/graphql/schema/`](../apps/api/src/graphql/schema).

## Status

Labels follow the specification: **IMPLEMENTED** (built and tested), **MOCKED** (works against a stand-in),
**PLACEHOLDER** (shape only), **NOT YET INTEGRATED** (external system not connected).

| Area                                                                                                                                                                                                                                    | Status                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Monorepo, tooling, shared types, money utilities, market config, validation                                                                                                                                                             | IMPLEMENTED                                                                                                         |
| Database schema (56 tables), migrations, integrity triggers, seeds                                                                                                                                                                      | IMPLEMENTED (applied to PostgreSQL 18 in Docker; full suite passes on it and on PGlite)                             |
| API server: configuration checks, error masking, request ids, logging, rate limits, query limits, CSRF rule, CORS, security headers, health check                                                                                       | IMPLEMENTED                                                                                                         |
| Accounts: register, login, lockout, sessions with refresh rotation, logout, email verification, password reset and change                                                                                                               | IMPLEMENTED                                                                                                         |
| Profile, addresses, consents, data export and account deletion (background job: private JSON export with signed download links; deletion anonymises after a grace period)                                                               | IMPLEMENTED (timings are placeholders, open question 14; what is kept is in docs/03 section 3.4)                    |
| RBAC: permission guards on the contract, service checks, role assignment, audit log                                                                                                                                                     | IMPLEMENTED                                                                                                         |
| Catalogue (search, filters, sorting, pagination), product and inventory administration, product image upload                                                                                                                            | IMPLEMENTED (images upload to S3-compatible storage; RustFS in Docker for development)                              |
| Cart, checkout with server-side pricing, promotions, exchange credit spending, orders, cancellation                                                                                                                                     | IMPLEMENTED                                                                                                         |
| Payments: lifecycle, polling, webhooks with replay protection, reconciliation, expiry, saved wallets                                                                                                                                    | IMPLEMENTED against the MOCK provider                                                                               |
| MTN MoMo, Airtel Money                                                                                                                                                                                                                  | NOT YET INTEGRATED (answer `NOT_IMPLEMENTED` / `PROVIDER_NOT_INTEGRATED`)                                           |
| Delivery tracking (in-house provider) and order fulfilment steps                                                                                                                                                                        | IMPLEMENTED                                                                                                         |
| In-app notifications                                                                                                                                                                                                                    | IMPLEMENTED (email and push delivery per notification: P1)                                                          |
| Email                                                                                                                                                                                                                                   | MOCKED (console provider; refused in production)                                                                    |
| Refunds: full and partial, staff approval, provider refunds with async confirmation, paid-order cancellation, admin and customer views                                                                                                  | IMPLEMENTED against the MOCK provider (journey C covers an admin refund; policy is a placeholder, open question 13) |
| Lifecycle state machines                                                                                                                                                                                                                | IMPLEMENTED; used by orders, payments, deliveries, subscriptions, garments, returns and exchanges                   |
| Baby profiles and measurements, rules-based sizing with fit feedback                                                                                                                                                                    | IMPLEMENTED (labelled as rules, never as AI)                                                                        |
| Subscriptions: start, activation on payment, renewal, reminders, automatic wallet requests, grace period, expiry, pause, resume, cancellation, plan changes, item selection                                                             | IMPLEMENTED (plan changes wait for the next renewal: placeholder policy)                                            |
| Garment lifecycle: registration, reservation, delivery, return, inspection, reuse, recycling, append-only history                                                                                                                       | IMPLEMENTED                                                                                                         |
| Returns with pickup, per-garment inspection, exchange credit, exchanges for the next size                                                                                                                                               | IMPLEMENTED (credit values are a placeholder policy)                                                                |
| Design system: tokens, web components, site and admin shells (`packages/ui`)                                                                                                                                                            | IMPLEMENTED (axe and contrast tested; mobile shell is Phase 7)                                                      |
| Customer website: public pages, sign-in and account recovery, cart, checkout, mobile-money payment screens, size finder, account area (baby, subscription, orders and tracking, returns and exchanges, settings); `packages/api-client` | IMPLEMENTED (journeys A and B pass in Playwright; payments use test wallets)                                        |
| Website hardening (production-readiness Phase 1): per-request nonce CSP and security headers, error and loading boundaries, hero visible without JavaScript, self-hosted stock photos, launch checks on production builds               | IMPLEMENTED (CSP, no-JS and journey A pass on a production build; HSTS only on https; preview builds show a banner) |
| Admin dashboard (`apps/admin`): metrics, operations, returns and inspection, garments, customers, catalogue, payments, staff, audit                                                                                                     | IMPLEMENTED (journey C passes in Playwright; settings view only)                                                    |
| Mobile app                                                                                                                                                                                                                              | Not started (Phase 7)                                                                                               |
| Push, SMS                                                                                                                                                                                                                               | NOT YET INTEGRATED                                                                                                  |
| Production object storage (AWS S3, R2 or similar)                                                                                                                                                                                       | Works through the same S3 provider; not yet configured, needs a hosting decision                                    |
| Operations: PostgreSQL rate limiter, error reporting (no-op or Sentry, scrubbed), readiness checks                                                                                                                                      | IMPLEMENTED and tested (Sentry only exercised against a stub endpoint, no real project yet)                         |
| Containers (API, web, admin Dockerfiles; docker-compose.prod.example.yml)                                                                                                                                                               | WRITTEN, NOT YET BUILT (not built locally: the machine ran out of disk space); cloud choice is open question 12     |
| CI (.github/workflows/ci.yml): format, lint, typecheck, unit tests on PostgreSQL 18, builds, Playwright                                                                                                                                 | WRITTEN, NOT YET RUN on GitHub (runs on the next push)                                                              |
| Operations runbook (docs/09-operations.md), restore test script                                                                                                                                                                         | IMPLEMENTED (restore test passed against the local PostgreSQL 18)                                                   |

## Phase 1 report

**Created**

- Root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`,
  Prettier config, `.gitignore`, `.env.example`, `README.md`
- `packages/types`: `enums.ts` (36 value sets), `rbac.ts` (30 permissions, 8 roles, default grants)
- `packages/utils`: `money.ts` + tests
- `packages/config`: `markets.ts` (Rwanda) + tests
- `database`: schema in 12 files, `drizzle.config.ts`, `testing.ts` (PGlite helper), `schema.test.ts`,
  migrations `0000_initial_schema.sql` (generated) and `0001_integrity_triggers.sql` (hand-written)
- `apps/api`: `domain/` (state machine, 7 lifecycles, errors, tests), `graphql/schema/*.graphql` (10 files),
  `graphql/load-schema.ts`, `graphql/schema.test.ts`
- `docs/`: this index and documents 1 to 8

**Verified** (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, all from the repository root)

| Check                   | Result                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Type-check, 5 packages  | Pass                                                                                    |
| ESLint, 5 packages      | Pass                                                                                    |
| Prettier                | Pass                                                                                    |
| Tests                   | 109 passed, 0 failed: utils 10, config 3, api 74 (lifecycles and contract), database 22 |
| Migrations match schema | `drizzle-kit generate` reports no changes                                               |
| Build                   | Not applicable yet: no package has a build output in Phase 1                            |

**Known limitations**

- Migrations have only been applied to PGlite (PostgreSQL 17 in WASM). The local PostgreSQL 18 server needs
  credentials before they can be applied there.
- The `C:` drive had about 1.5 GB free at the start of this phase. The web, admin and mobile apps will need
  more than that for their dependencies.
- `@requires` and `@authenticated` are declarative in the contract today; enforcement arrives with the server.

**Next:** Phase 2 (design system) and Phase 3 (backend foundation). Phase 3 can start first if the API is the
priority, since it does not depend on the design system.

## Phase 3 report (backend foundation)

Phase 3 came before Phase 2 because the API does not depend on the design system.

**Created**

- `packages/validation`: Zod schemas for email, password policy, phone (E.164), registration with required consents, profile, market-aware addresses; tests
- `packages/config/src/legal.ts`: current legal document versions (PLACEHOLDER `draft-1` until the texts exist)
- `database/src/client.ts`: one connection API for PostgreSQL (`postgres://`) and in-process PGlite (`pglite:`); `orm.ts` (the single drizzle-orm instance); `seeds/` (roles and permissions for every environment; labelled development reference data); seed tests
- `apps/api/src/config/env.ts`: startup validation; production refuses placeholders, PGlite, the console email provider and plain-http origins
- `apps/api/src/auth/`: argon2id hashing, JWT access tokens, opaque hashed refresh and email tokens
- `apps/api/src/services/`: `AuthService`, `AccountService`, `AccessService`, audit log writer, error codes, request context and permission checks
- `apps/api/src/graphql/`: scalars, query depth/field/alias limits, directive enforcement (`@authenticated`, `@requires`) with `NOT_IMPLEMENTED` for later operations, error formatting with request ids, resolvers
- `apps/api/src/server/`: Yoga app (CORS, cookie sessions with the CSRF header rule, security headers, body size and per-IP request limits), entry point; `scripts/` for migrate and seed
- Tests: `auth.test.ts`, `account-and-access.test.ts`, `env.test.ts`, plus `testing/test-app.ts` harness

**Verified**

| Check                  | Result                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Type-check, 6 packages | Pass                                                                                                        |
| ESLint, 6 packages     | Pass                                                                                                        |
| Prettier               | Pass                                                                                                        |
| Tests                  | 154 passed, 0 failed: api 112, database 24, utils 10, validation 5, config 3                                |
| Server smoke test      | Started on PGlite; `/health` and GraphQL answered over HTTP; reported 24 operations implemented, 86 not yet |
| Seed smoke test        | Ran twice against an on-disk PGlite database; second run made no duplicates                                 |
| Build                  | Not applicable yet: the API runs through `tsx`; a compiled build is set up in Phase 10                      |

**Behaviour covered by the integration tests** (all through the real HTTP pipeline): registration with consents and verification email; duplicate email in any case; field-level validation errors; identical answers for wrong password and unknown email; lockout after 5 failures and release after 15 minutes; suspended accounts; access-token expiry; refresh rotation and family revocation on replay; logout; web cookie sessions ignored without the client header; password reset (no email for unknown addresses, single use, expiry, all sessions ended); email verification; password change ending other sessions; login rate limit; profile and phone conflicts; address defaults, format rules and cross-customer `NOT_FOUND`; data requests; staff permission checks before resolvers run; role changes taking effect on the next request; self role change refused; audit log with actor names and cursor pagination; `NOT_IMPLEMENTED` operations still guarded; depth and alias limits; CORS allow-list; security headers and request ids; health check on a real listener; configuration validation; error masking; log redaction.

**Known limitations**

- Rate limits are held in memory, which is correct for one API instance only.
- Still not run against the local PostgreSQL 18 server (no credentials). Apply with `pnpm --filter @bambino/api db:migrate` once `DATABASE_URL` is set in `.env.local`.
- Locked accounts get the same generic "email or password is incorrect" answer as wrong passwords, to avoid revealing which accounts exist. A notification email to the account owner on lockout would help real users; it is not built.
- Account deletion and data export are recorded as requests only.

**Next:** Phase 4 (catalogue, inventory, cart, checkout, orders, payments with the mock provider), or Phase 2 (design system) if the web app should start sooner.

## Phase 4 report (commerce)

**Created**

- Domain: `pricing.ts` (promotion rules and order totals: subtotal, discount, shipping, exclusive tax, credit), `references.ts` (unguessable order numbers); unit tests
- Providers: `payments.ts` (interface and the MOCKED provider, whose outcome is chosen by wallet number, with HMAC-signed webhooks), `delivery.ts` (in-house), `storage.ts` (local URLs)
- Services: catalogue, inventory (reserve, release, commit, adjust, all through the movement ledger), cart, promotions, orders (checkout, cancellation, credit, staff steps, stale-order cleanup), payments (initiate, poll, webhook, reconcile, saved wallets), delivery (fulfilment steps that drive the order), notifications, credit ledger, pagination helpers
- GraphQL: `commerce-resolvers.ts`, per-request batching (`loaders.ts`); app gains `/webhooks/payments/<provider>` and a background job timer (payment reconciliation, unpaid-order cleanup)
- Seeds: labelled development catalogue (4 products, 20 variants with stock, promotion `SEED10`)
- Tests: `pricing.test.ts`, `commerce.test.ts`, webhook checks on a real listener

**Verified**

| Check                   | Result                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Type-check, 6 packages  | Pass                                                                                   |
| ESLint, 6 packages      | Pass                                                                                   |
| Tests                   | 190 passed, 0 failed: api 148, database 24, utils 10, validation 5, config 3           |
| Server smoke test       | Seeded an on-disk PGlite database, started the server, browsed the catalogue over HTTP |
| Migrations match schema | No changes                                                                             |

**Behaviour covered by the integration tests:** catalogue search, category, size, price filters, sorting and pagination; product detail with stock and lowest price; cart merging, limits and cross-customer `NOT_FOUND`; server-side preview with valid and invalid promotions; checkout reserving stock, emptying the cart and returning the same order for a resubmitted key; one promotion use per customer; the last unit cannot be sold twice; payment confirmed only from the provider, order paid, stock committed, delivery created, customer notified; declined payment with a safe message and a successful retry; repeated payment request returns the same payment; a second payment while one is open is refused; a signed webhook applied once, replays ignored, forged and malformed ones rejected; unanswered payments expire and unpaid orders are cancelled with stock returned; MTN MoMo reported as not integrated; other customers' orders invisible and unpayable; cancellation returning stock; orders paid wholly or partly with credit, credit returned on cancellation; warehouse steps and delivery to DELIVERED with full history; statuses that only payments or returns may set are refused to staff; price changes audited and reflected in carts immediately; staff list permissions.

**Known limitations**

- Payments use only the mock provider. Real providers need merchant sandbox credentials (docs/08-open-questions.md, item 10).
- No refunds: a paid order cannot be cancelled, and a payment that succeeds after its order was cancelled is logged for manual refund.
- Background jobs run on a timer inside the API process, which is right for one instance only; a PostgreSQL-backed queue replaces it in Phase 5.
- Catalogue pagination uses offset cursors (fine at catalogue sizes; pages can shift if products are added mid-browse). Search is a simple case-insensitive match; full-text search can follow when the catalogue grows.
- No tax is charged, because the tax question is still open (item 7).
- Product images can be read but not uploaded yet.

**Next:** Phase 5: baby profiles, the rules-based sizing engine, subscriptions with renewal, the garment lifecycle, returns, inspection, exchange credit and exchanges.

## Docker storage (between Phases 4 and 5)

**Created:** `docker-compose.yml` (PostgreSQL 18 on 5433, RustFS on 9000/9001, localhost only); `.env.local` for the Docker services (git-ignored); an S3 storage provider with in-house AWS Signature V4 signing (`providers/aws-sigv4.ts`, `providers/storage.ts`, `providers/storage-factory.ts`); `storage:init` script (creates the bucket, public read on `products/` only); product image upload in two steps (`adminCreateProductImageUpload`, then `adminAddProductImage` after checking what storage actually holds) plus `adminRemoveProductImage`; real-server test mode (`TEST_DATABASE_URL`) creating and dropping one database per test file; Vitest configs; tests for signing (AWS's published vector), the upload flow and live storage.

**Verified**

| Check                                          | Result                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Migrations on PostgreSQL 18 (Docker)           | Applied cleanly; seeds loaded                                                                                |
| Full suite on Docker PostgreSQL + RustFS       | 200 passed, 0 failed (api 158, database 24, utils 10, validation 5, config 3); no test databases left behind |
| Full suite in default mode (PGlite, no Docker) | 196 passed, 4 live-storage tests skipped by design                                                           |
| Type-check, lint, formatting, migration drift  | Pass                                                                                                         |

**What running on a real server found:** under nine parallel test files the Docker PostgreSQL on Windows answered slowly enough to trip 5-second timeouts. Individually the tests take under a second. Real-server mode now runs two files at a time with longer timeouts; no product code changed.

**Known limitations**

- The image upload flow was verified with a fake store at API level and with RustFS at provider level, but not yet end to end through a running server with an upload from a browser; that comes with the admin app.
- Removing an image detaches it but keeps the stored file; a clean-up job for unattached files is not built.
- The Docker CLI is not on the system PATH on this machine. Docker Desktop's CLI is at `C:\Users\PC\AppData\Local\Programs\DockerDesktop\resources\bin`.

## Phase 5 report (baby profiles, sizing, subscriptions, garments, returns, exchanges)

**Placeholder business rules.** Open questions 1, 3, 6 and 9 are still unanswered, so the code uses clearly labelled placeholders, all in one file (`packages/config/src/policies.ts`) plus the seed size chart:

| Question                   | Placeholder in use                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Exchange credit value   | Share of the garment's price by inspected condition: NEW 50%, EXCELLENT 40%, GOOD 30%, FAIR 15%, DAMAGED and RECYCLE 0%. Exchange replacements are priced at catalogue price with credit applied automatically |
| 3. Who chooses cycle items | The parent chooses, from the plan's allowed categories                                                                                                                                                         |
| 6. Plan changes            | Every change, up or down, takes effect at the next renewal (no proration)                                                                                                                                      |
| 9. Size chart              | The labelled seed chart (`NB` to `18-24M`)                                                                                                                                                                     |

Also placeholders: a 7-day renewal grace period, 3 automatic payment requests 24 hours apart, a reminder 3 days before renewal, pauses of up to 90 days.

**Created**

- Domain: `sizing.ts` (rules-based provider behind the `SizingProvider` interface: height, weight, age, fit preference, fit history, staleness, next-size estimate); tests
- Services: baby profiles (owner-scoped; staff reads need `baby_profile:read` and are audited), sizing (stores inputs and outcomes for future training), garments (the single place a garment changes status, preferring reused garments when reserving), subscriptions (cycles as orders, renewal job), returns (pickup, per-garment inspection, credit, order status kept in step), exchanges (replacement order created at request, payable only after approval)
- Order hooks so subscriptions, exchanges and garments react to orders being paid, delivered or cancelled in the same transaction; payment initiation shared with the renewal job; stale-order cleanup no longer touches exchanges awaiting approval or renewals inside the grace period
- Migrations `0002` (`RENEWAL_DUE` subscription event) and `0003` (sequence columns on the four event-history tables)
- GraphQL: `circular-resolvers.ts` and loaders; `CreateSubscriptionInput.paymentMethodId` for automatic renewal requests
- Seeds: 3 tagged development garments per seed variant
- Tests: `sizing.test.ts`, `circular.test.ts` (journeys A, B, C, privacy, staff controls), `subscriptions.test.ts` (renewal lifecycle)

**Verified**

| Check                                         | Result                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| Type-check, lint, formatting, migration drift | Pass                                                                |
| Default mode (in-process PostgreSQL)          | 225 passed, 4 live-storage tests skipped by design                  |
| Docker mode (PostgreSQL 18 + RustFS)          | 229 passed, 0 failed; no test databases left behind                 |
| Docker development database                   | Migrations 0002 and 0003 applied; seeds (including garments) loaded |

**Behaviour covered:** profile creation with measurements, size recommendation with reasons and stored inputs, a size shift after repeated "too small" reports, child data hidden from other customers and from staff without permission (with an audit entry when staff look); journey A (register, profile, sizing, subscribe, choose items, pay, deliver); journey B (return two garments with pickup, approval, pickup tracking, receipt, inspection with one accepted and one rejected, credit, exchange for the next size blocked until approval, payment, delivery, completion); journey C (the inspected garment's full history, back in circulation and chosen first for the next subscriber); exchange rejection freeing the garment and returning credit; staff garment registration and routing with customer-facing statuses refused; manual credit adjustments that cannot go below zero; pause and resume extending the period; cancellation at period end; renewal due, paid and advanced; expiry after the grace period with the renewal order cancelled; a plan change priced and applied at renewal; automatic payment from a saved wallet; a single renewal reminder; expiry when the first payment never arrives; plan administration permissions and audit.

**What this phase found and fixed:** event histories sorted by timestamp put same-instant events in random order (the frozen test clock made it visible; it could also happen in production within one millisecond). The four history tables now have a sequence column and histories are ordered by it.

**Known limitations**

- Background jobs still run on a timer in the API process, so a single API instance is assumed. pg-boss was planned for this phase and was not added: the jobs are idempotent, but running two instances would duplicate work until a shared lock or queue exists.
- Customers cannot cancel an exchange themselves before approval (the contract has no operation for it); cancelling the unpaid replacement order does the same.
- Garments still with a customer when a subscription ends are left with them; what should happen is open question 2.
- Return pickups are tracked by staff in the in-house delivery flow; there is no courier integration.

**Next:** Phase 2 (design system), then Phase 6 (web app). Phase 8 will finish the remaining admin operations (metrics and customer search).

## Phase 2 report (design system) and start of Phase 6 (web)

**Built**

- `packages/ui`: tokens for colour, type, spacing, radius and shadow in `tokens.ts`, generated into a Tailwind v4
  `theme.css` (Tailwind's default palette is removed, so only brand colours compile). Components: Button, text,
  textarea and select fields, Checkbox, RadioGroup, Card, Badge and StatusBadge (a tone for every domain status,
  enforced by the type checker), Alert, Modal (native `<dialog>`), toasts with live regions, Spinner, Skeleton,
  EmptyState, ErrorState (shows the request id), DataTable, MoneyText (formatting only), SiteShell and AdminShell.
- `packages/api-client`: fetch-based GraphQL client with typed operations, coded `ApiError`s, and web (cookie and
  CSRF header), mobile (bearer) and server modes. Operations: products, product, catalogue filters, plans.
- `apps/web` (Next.js 16, App Router): home, `/shop` (search, category, size, sort, in stock; filters in the URL and the
  form works without JavaScript), `/shop/[slug]`, `/subscriptions`, `/design` (the component gallery) and
  `/preview/admin-shell` (admin layout with sample rows, clearly labelled). Every page has loading-free server rendering
  plus empty and error states. A site-wide banner says it is a preview with placeholder copy and prices.

**Tests:** 54 in `packages/ui`: every semantic colour pair against WCAG AA (4.5:1 text, 3:1 controls and focus),
theme drift, keyboard behaviour (buttons, fields, radios, modal Escape, menu toggle), toast live regions and timing,
and axe on every component group and both shells. 10 in `packages/api-client`, including validation of every
operation against the API schema. Whole repository: 289 passed, 4 skipped (live storage, run in Docker mode). The web
app type-checks, lints and builds for production; every page was loaded in Edge with no console errors.

**Limitations**

- Not done yet in Phase 6: sign-in and registration, cart, checkout and payment waiting screen, size finder, account
  area, sitemap and structured data, Playwright journeys A and B.
- Product photos: the seed catalogue has none, so a drawn placeholder is shown. The logo is a placeholder wordmark.
- Contrast is verified from tokens, and axe runs in jsdom; a manual screen-reader pass is part of Phase 9.
- Light theme only.

## Phase 6 report (customer website)

**Built** (`apps/web`, on `packages/api-client`)

- Sign-in: register (with the required consents at the current document versions), sign in, forgot and reset password,
  email verification (on a button press, so mail scanners cannot use the link). Sessions use the API's httpOnly cookies;
  the client renews an expired access token once and retries. Renewal is serialised across tabs with the Web Locks API,
  because the API revokes a session when a refresh token is reused. Post-login redirects accept same-site paths only.
- Shop: add to cart from the product page (size and colour), cart with quantities, checkout (saved or new address in the
  Rwandan format, delivery option, promotion code, exchange credit, server-calculated totals), order placed with an
  idempotency key, then mobile-money payment: the parent approves on their phone while the page polls, and "paid"
  appears only when the API reports the provider's confirmation. Failed, declined and expired payments can be retried
  with a new key. MTN and Airtel are shown as not connected; development builds offer the three test wallets.
- Size finder and baby profiles: centimetres and kilograms entered, whole millimetres and grams sent; the recommendation
  with its reasons in plain words, confidence in words, and the label "Rules-based recommendation"; growth history; fit
  feedback.
- Subscription: choose plan, baby, address and delivery; choose the cycle's pieces in the recommended size (each reserves
  a tagged garment); pay the first period. Manage: pause, resume, cancel at period end, change plan (next renewal),
  change pieces, pay a renewal, history.
- Returns and exchanges: pieces held, return with pickup and fit per piece, inspection results and credit earned, next
  size (preselected) with exchange credit applied, approval status, replacement order, credit ledger.
- Account: overview, orders with status and delivery timeline, cancelling unpaid orders, settings (profile, addresses,
  wallets, password, data export and deletion requests, sign out). `robots.txt` (blocks everything until
  `SITE_INDEXING=true`) and `sitemap.xml` with products.

**Tests**

- `tests/e2e` (Playwright): journey A entirely through the UI, on desktop and on a phone viewport; journey B with every
  parent step in the UI and the operations team's steps through the API as the seeded admin (their screens are Phase 8);
  axe WCAG 2.2 A/AA scans of nine public pages and three signed-in pages in a real browser (colour contrast included);
  a check that journey pages never scroll sideways on a phone. Final runs: all passed.
- Unit and integration: 346 passed, 4 skipped (live storage), including 67 API-client tests that validate every
  operation against the schema. Type-check, lint, formatting and the production build pass.

**Bugs found by the new tests and fixed**

- On phones the account area was wider than the screen (the scrolling account menu stretched the grid). Fixed, and the
  journeys now fail if a page scrolls sideways.
- After paying an unpaid order from its page, the payment card disappeared with no confirmation. It now says "Payment
  received".

**Limitations**

- Payments: test wallets only; MTN MoMo and Airtel Money are not integrated.
- The subscription piece picker shows catalogue stock ("in stock" counts new units for sale), not tagged garments. If no
  garment is left, the parent sees a clear "not available" message and picks another. The API should expose garment
  availability for subscription choices.
- English only; Kinyarwanda and French need translations.
- Product photos and the logo are placeholders; `Product` structured data is not added yet.
- Local E2E runs share the development database and stock their own garments first. The API allows five sign-ups per
  address per ten minutes, so a second full run within ten minutes needs an API restart (the limits are in memory). The
  first request after the API starts can be slow on a busy machine; one step allows 45 seconds for it.
- On a heavily loaded machine the UI unit tests' jsdom workers occasionally miss Vitest's start-up timeout; they pass on
  rerun. CI (Phase 9) will watch for this.

**Next:** Phase 7 (Expo mobile app) or Phase 8 (admin dashboard). Phase 8 replaces the API-driven staff steps in
journey B with screens and enables journey C.

## Phase 8 report (admin dashboard)

**Built**

- API: `adminMetrics` (every figure counted from transactional rows; ratios are null until there is data),
  `adminCustomers` (search by name, email or phone; LIKE wildcards stripped) and `adminCustomer`, which were the last
  operations answering NOT_IMPLEMENTED. Added `adminReturn`, `adminOrder`, `adminProduct`, `Product.isActive`,
  `SubscriptionPlan.isActive`, and `ProductVariant.availableForSubscription` (tagged garments that can be reserved), which
  the website's piece picker and exchange sizes now use. Return pickups now show their return number on the delivery board.
- `apps/admin` (Next.js, `basePath: /admin`, port 3001, `noindex` and `X-Robots-Tag`): staff sign-in; navigation
  filtered by permissions (the API checks every permission again); dashboard and analytics with a date range; orders
  with warehouse steps; delivery board; returns with approval, pickup tracking, per-garment inspection (condition,
  decision, next status) and completion; exchanges with approve or reject; garments with tag search, registration,
  lifecycle-allowed moves and full history; customers with credit adjustment and baby profiles shown only on request
  (needs `baby_profile:read`, audited); subscriptions with the plan editor and staff cancellation; payments with the
  transaction log and "check with provider" (never set by hand); products with variants, prices and direct-to-storage
  photo upload; inventory adjustments; promotions; staff and roles; audit log; settings (view only).
- Session renewal (tab locking, refresh rotation) moved into `@bambino/api-client` and shared by both apps.

**Tests**

- Playwright, against production builds, all in one run: journey A (desktop and phone), journey B, journey C (every staff
  step in the admin dashboard), all 16 admin pages loading with no WCAG A/AA violations, nine public pages scanned on
  desktop and phone, and signed-out visitors sent to sign-in. 24 passed.
- Unit and integration: 406 passed, 4 skipped (live storage). New API tests cover metrics, customer search and
  permissions, and garment availability. Type-check, lint, formatting and both production builds pass.

**Bugs found and fixed**

- After signing in, the session cache could stay on the cleared "signed out" entry (admin bounced back to sign-in; the
  website had the same latent bug). Both now keep the session entry when clearing the cache.
- Before the page's JavaScript loaded, a password form submitted natively by GET would put credentials in the URL. All
  password forms now use POST.
- Links inside sentences were distinguishable by colour only (WCAG failure). Text links are now always underlined.
- The UI unit tests' jsdom workers could miss Vitest's fixed 60 s start-up limit on a busy machine. They now use thread
  workers, one file at a time.

**Limitations**

- Settings are view only: the API has no operations yet for delivery options or the size chart.
- Refunds are not built, so paid orders cannot be cancelled.
- Payments still use test wallets only.
- Journey B's staff steps still run through the API (journey C covers the same steps in the UI).

**Next:** Phase 7 (Expo mobile app) or Phase 9 (security review, performance, CI).

# Bambino: production-readiness pass

You are a senior full-stack engineer working in the Bambino monorepo (pnpm + Turborepo; Next.js 16 web and admin apps, a GraphQL API, Drizzle/PostgreSQL). Your goal is to close the code-level gaps between the current preview build and a production launch in Kigali, Rwanda. Work in the phases below, in order. Each phase must leave the repo green.

## Before you write any code

1. Read `README.md`, `docs/README.md` (the status table), `docs/03-auth-and-security.md`, `docs/04-payments.md`, `docs/07-testing-and-phases.md` and `docs/08-open-questions.md`.
2. Follow both `AGENTS.md` files. The installed Next.js and Turborepo differ from your training data. Before you touch Next.js config, routing, error files or headers, read the matching guide in `apps/web/node_modules/next/dist/docs/`. Do the same with Turborepo's bundled docs before you change `turbo.json`.
3. Study the existing patterns and reuse them rather than inventing new ones. In particular, look at:
   - provider abstractions in `apps/api/src/providers/`
   - lifecycle state machines in `apps/api/src/domain/`
   - placeholder policies in `packages/config/src/policies.ts`
   - environment validation in `apps/api/src/config/env.ts`
   - security headers in `apps/admin/next.config.ts`
4. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` and record the baseline. If anything already fails, report it before you change anything.

## Ground rules

- **Small, reviewable commits:** one per numbered task, each with a clear message. Don't push.
- **Don't invent business decisions.** Where a rule depends on an open question (refund policy, prices, VAT, credit value), add a clearly labelled placeholder in `packages/config/src/policies.ts` and reference the open-question number.
- **Never weaken existing security:** CSRF rule, cookie flags, production env refusals, introspection blocking, rate limits.
- **No real credentials anywhere.** New secrets go in `.env.example` as `CHANGE_ME` (production already refuses that value), and must be validated in `env.ts`.
- **Every behaviour change gets tests.** Use Vitest for logic and the API, and extend the Playwright journeys in `tests/e2e` where a user flow changes.
- **Keep docs honest.** After each phase, update the status table in `docs/README.md` with the same labels: IMPLEMENTED / MOCKED / PLACEHOLDER / NOT YET INTEGRATED.
- **Stop and ask** if a task needs a product decision, an external account, or a schema change you're unsure is backwards-compatible.

## Phase 1: Web app hardening (quick wins)

1. **Security headers for `apps/web`.** Mirror the admin app's `headers()` and add a Content-Security-Policy suited to the site. Allow:
   - self
   - the API origin from `NEXT_PUBLIC_API_URL`
   - the storage origin from `STORAGE_PUBLIC_BASE_URL`
   - `images.unsplash.com` (temporary; see task 4)
   - whatever Next needs for its scripts and styles in dev versus production. Read the Next docs on CSP and nonces first.

   Also add HSTS (production only), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `frame-ancestors 'none'`. Add a test that asserts the headers exist.
2. **Error and loading boundaries.** Add `error.tsx` for the `(site)` group and for `dashboard/` and `checkout/`, plus a root `global-error.tsx`. Use the design system (`@bambino/ui`), show the request id when there is one (see `components/api-error.tsx`), and offer a retry. Add `loading.tsx` where server data is slow: shop, product page, dashboard.
3. **Hero renders without JavaScript.** In `components/hero/hero.tsx` and `components/motion/primitives.tsx`, the headline, intro and calls to action must be visible in the server-rendered HTML. Animate only decorative layers, or use a transform-only entrance that starts visible. Respect `prefers-reduced-motion` everywhere. Verify with JavaScript disabled, and note before/after LCP from a production build (`next build && next start`).
4. **Self-host the stock images.** `apps/web/lib/stock-photos.ts` currently hotlinks Unsplash.
   - Download each listed photo once, at a sensible maximum width, into `apps/web/public/images/stock/`. If you have no network, write the download script and leave it for me to run.
   - Switch the images to `next/image` with correct `sizes`.
   - Keep the credits in that file.
   - Remove `images.unsplash.com` from the CSP.
   - Delete the now-unused `components/hero/garment.tsx`.
5. **Env templates and launch switches.** Add to `apps/web/.env.example` any variables introduced above. Make sure a production build fails fast if `NEXT_PUBLIC_MOCK_PAYMENTS=true`, or if `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_API_URL` is not https. The preview banner must be driven by a single flag.

## Phase 2: Refunds (built against the mock provider)

The docs say "Refunds: NOT YET BUILT (paid orders cannot be cancelled)".

6. **Refund domain.** Add a refund lifecycle state machine (requested → approved/rejected → processing → succeeded/failed), following the existing lifecycles, plus migrations generated with `pnpm db:generate`.
   - Support full and partial refunds, in integer money only.
   - Payment-provider refunds must be idempotent.
   - Return value to exchange credit as an alternative only if the policy placeholder allows it.
7. **Provider interface.** Add `refund()` to the payment provider abstraction. Implement it for the mock provider, including asynchronous completion through the existing webhook path with replay protection. MTN MoMo and Airtel must return `PROVIDER_NOT_INTEGRATED`.
8. **API, admin and customer UI.**
   - Add GraphQL mutations and queries guarded by a new permission in `packages/types/src/rbac.ts`, granted to the appropriate staff roles.
   - Write audit-log entries for every refund.
   - Let paid orders be cancelled with a refund, subject to the policy placeholder.
   - Admin: a refund action on the order detail and payments pages.
   - Customer: show refund status on the order page.
   - Add a customer notification.
   - Extend Playwright journey C to cover an admin refund.

## Phase 3: Privacy obligations (children's data, Rwanda Law 058/2021)

9. **Data export.** Turn recorded export requests into a background job that builds a machine-readable JSON archive of everything held about the account: profile, babies, measurements, orders, subscriptions, consents and audit entries about the user. Store it privately with a short-lived signed download link, and email the user.
10. **Account deletion.** Carry out recorded deletion requests after a grace period.
    - Remove or anonymise personal data, including baby names and measurements.
    - Keep records the law or accounting requires (orders and payments, anonymised).
    - Keep garment history intact but detached from the person.
    - Document exactly what is kept and why in `docs/03-auth-and-security.md`.
    - Make it idempotent and fully tested.

## Phase 4: Operations and deployment

11. **Shared rate limiting.** Add a PostgreSQL-backed `RateLimiter` behind the existing interface, chosen by an env var, and keep the memory version for development and tests. Include cleanup of expired windows.
12. **Error tracking and health checks.** Add an `ErrorReporter` provider abstraction with a no-op default and a Sentry implementation, enabled only when its DSN is set. Wire it into the API error masking, Next's error boundaries and `instrumentation`. Never send personal data or secrets: scrub cookies, auth headers and request bodies. Give each app a readiness check covering database connectivity on top of the existing health check.
13. **Containers.** Add production Dockerfiles for `api`, `web` and `admin`:
    - multi-stage builds with pnpm and turbo prune
    - Next standalone output
    - non-root user
    - a container health check

    Also add a `docker-compose.prod.example.yml` that shows how the pieces connect. Don't choose a cloud provider; that's open question 12.
14. **CI.** Add `.github/workflows/ci.yml` that runs, on push and pull request:
    - install with a frozen lockfile
    - format check, lint, typecheck
    - unit tests against a PostgreSQL 18 service container
    - `next build` for web and admin
    - the Playwright journeys

    Cache the pnpm store and Turbo outputs.
15. **Migrations and backups runbook.** Write `docs/09-operations.md` covering:
    - how migrations run on deploy
    - rollback steps
    - the backup and restore procedure, plus a script that tests a restore
    - secret rotation for `JWT_SECRET` and the webhook secrets
    - a launch checklist that includes every production env refusal in `env.ts`

## Definition of done

- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass from the repo root.
- `pnpm build` succeeds and all Playwright journeys pass.
- New code has tests for success paths and failure, authorisation and idempotency cases.
- `docs/README.md` status is updated, and nothing is labelled IMPLEMENTED unless it is built and tested.
- You end with a short report:
  - what changed, per task
  - what's verified and how
  - what's still blocked and on which open question or external account (MTN MoMo and Airtel merchant credentials, email provider and domain, hosting and data residency, final prices, VAT, size chart)
  - any risks you noticed but didn't fix

Start with the "Before you write any code" steps. Then give me a short plan for Phase 1 and wait for my go-ahead before you begin coding.

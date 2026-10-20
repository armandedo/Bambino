# 10. Cloudflare deployment

How Bambino runs on Cloudflare. The existing architecture is kept: PostgreSQL stays the database (through
Hyperdrive), the API keeps its code and runs as a Worker, the Next apps run as Workers through OpenNext.

## 10.1 Architecture

```
Browser ─▶ Cloudflare DNS, TLS, CDN, DDoS/WAF
   ├─▶ www.<domain>     bambino-web    (Worker, OpenNext; static files from the CDN)
   ├─▶ admin.<domain>   bambino-admin  (Worker, OpenNext; the dashboard is served under /admin)
   └─▶ api.<domain>     bambino-api    (Worker: GraphQL, webhooks, /health, /ready; Cron Trigger for jobs)
                              │
                              └─▶ Hyperdrive ─▶ managed PostgreSQL 18 (provider and region: open question 12)
Object storage: Cloudflare R2 through its S3 API (STORAGE_PROVIDER=s3).
```

| Concern              | How                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Database connections | One connection per request or cron run via Hyperdrive, which pools the real ones                                                             |
| Background jobs      | Cron Trigger `* * * * *`: one run per minute for the whole deployment (not per instance). Each job is idempotent and row-locked              |
| Rate limits          | PostgreSQL (`RATE_LIMITER=postgres`): shared by every isolate                                                                                |
| Passwords            | argon2id in plain JavaScript (`@noble/hashes`), same format as the Node server's hashes. About 1 s CPU each: **Workers Paid plan required**  |
| Client IP            | `CF-Connecting-IP` (set by Cloudflare, not forgeable through it)                                                                             |
| Caching              | API responses `no-store`; website pages render per request (CSP nonce) and are never cached; `/_next/static` and `/images` come from the CDN |
| Secrets              | `wrangler secret put` per environment; never in `wrangler.jsonc` or git                                                                      |

## 10.2 One-time setup (needs the Cloudflare account)

```bash
npx wrangler login                                     # opens the browser
# Production database first (open question 12), then:
npx wrangler hyperdrive create bambino-db --connection-string="postgresql://USER:PASSWORD@HOST:5432/DB"
# Put the returned id in apps/api/wrangler.jsonc (env.preview / env.production hyperdrive.id).
npx wrangler r2 bucket create bambino-media           # public: product images only
npx wrangler r2 bucket create bambino-private         # never public: data exports
```

### R2 (image storage)

R2 can make a **whole bucket** public, not a prefix, so there are two buckets: `bambino-media` (public, product
photos under `products/`) and `bambino-private` (data exports, reached only through short-lived signed links).

1. Dashboard, R2: create an **API token** (Object Read & Write, limited to the two buckets). Note the account id,
   the access key id and the secret. The S3 endpoint is `https://<account-id>.r2.cloudflarestorage.com`.
2. Make `bambino-media` public: R2, `bambino-media`, Settings, Custom domain (production: `media.<domain>`), or
   the `r2.dev` address for a preview. That address is `STORAGE_PUBLIC_BASE_URL`.
3. CORS on `bambino-media` (the browser PUTs the file straight to R2): edit `apps/api/r2-cors.json` to the real
   admin origins, then `npx wrangler r2 bucket cors set bambino-media --file apps/api/r2-cors.json`.
4. API variables (`wrangler.jsonc`, `env.preview.vars`): `STORAGE_PROVIDER=s3`, `STORAGE_ENDPOINT`,
   `STORAGE_REGION=auto`, `STORAGE_BUCKET=bambino-media`, `STORAGE_PRIVATE_BUCKET=bambino-private`,
   `STORAGE_PUBLIC_BASE_URL`. Secrets: `wrangler secret put STORAGE_ACCESS_KEY_ID` and
   `STORAGE_SECRET_ACCESS_KEY` (`--env preview`).
5. Website: set the same `STORAGE_PUBLIC_BASE_URL` in `apps/web/wrangler.jsonc` so the Content Security Policy
   allows the images.
6. Redeploy the API, then in the admin open a product and upload a photo.

Secrets for the API (`cd apps/api`, add `--env preview` or `--env production`):

```bash
wrangler secret put JWT_SECRET            # 48+ random characters
wrangler secret put STORAGE_ACCESS_KEY_ID  # R2 API token (S3 compatible)
wrangler secret put STORAGE_SECRET_ACCESS_KEY
wrangler secret put RESEND_API_KEY        # email: needs EMAIL_PROVIDER=resend and a verified sending domain
wrangler secret put SENTRY_DSN            # optional
```

Plain settings (origins, `EMAIL_FROM`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_PRIVATE_BUCKET`, `STORAGE_PUBLIC_BASE_URL`) go in the
environment's `vars` in `wrangler.jsonc`; every `CHANGE_ME` there must be replaced (production refuses it).

## 10.3 Deploying

1. Migrations, once per release, from a machine or CI job that can reach the database directly (not through the
   Worker): `DATABASE_URL=… pnpm --filter @bambino/api db:migrate`. Never automatic, never a reset or seed.
2. API: `pnpm --filter @bambino/api worker:deploy:preview` (or `wrangler deploy --env production`).
3. Website: build **and deploy** on Linux (CI, WSL or Cloudflare Workers Builds; OpenNext does not build on plain
   Windows because it creates symlinks, and the build output holds absolute Linux paths, so deploy from the same
   machine), then `pnpm --filter @bambino/web cf:deploy:preview`.
   Admin: the same two steps with `pnpm --filter @bambino/admin cf:build` and `cf:deploy:preview`. Build it with
   `NEXT_PUBLIC_API_URL` set to the API's address, because the dashboard calls the API from the browser. The staff
   dashboard is then at `https://bambino-admin-preview.<account>.workers.dev/admin`; the API's `ADMIN_ORIGIN` already
   allows it.
4. Seeding a new database (roles and permissions are required; sign-up fails without them): run `db:seed` once.
   In PowerShell, `$env:X = ""` **deletes** the variable, so the seed falls back to `.env.local`: unset the seed
   passwords there, or a seed admin with the local password is created.
5. Check `https://api.<domain>/ready`, sign in, and watch `wrangler tail`.

## 10.4 DNS (proposed; check before changing anything)

| Name       | Type                 | Target                                        | Proxied |
| ---------- | -------------------- | --------------------------------------------- | ------- |
| `www`      | Worker custom domain | `bambino-web`                                 | yes     |
| `@` (apex) | redirect rule        | `https://www.<domain>`                        | yes     |
| `api`      | Worker custom domain | `bambino-api`                                 | yes     |
| `admin`    | Worker custom domain | `bambino-admin`                               | yes     |
| `media`    | R2 custom domain     | `bambino-media` (public; product photos only) | yes     |

Custom domains are added in the Worker's settings (Cloudflare creates the records and the certificate). Existing
records for these names are listed and kept until the new ones are verified.

## 10.5 Security settings to switch on

- SSL/TLS mode **Full (strict)**, Always Use HTTPS, HSTS (the website already sends it), minimum TLS 1.2.
- WAF managed ruleset in **log mode first** for a week, then block; the GraphQL endpoint takes JSON POSTs, so
  check no legitimate request is flagged before blocking.
- A rate limiting rule on `api.<domain>/graphql` as a coarse outer limit (the API keeps its own per-action limits).
- Webhook paths (`/webhooks/payments/*`) must stay reachable: skip bot challenges for them; the API verifies
  signatures and stores events before acting.
- Cache rules: bypass cache for `api.*` and for website HTML; cache everything under `/_next/static/*`.

## 10.6 Status and limits

| Part               | Status                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Worker         | **Preview deployed** (`bambino-api-preview`, Neon PostgreSQL through Hyperdrive). Verified live: health, ready, register, login, authorization, catalogue, rate limits, `no-store`, cron jobs       |
| Website (OpenNext) | **Preview deployed** (`bambino-web-preview`). Pages, per-request CSP nonce and CORS to the API verified live. The Next 16 `proxy.ts` (Node runtime) is supported by OpenNext only as _experimental_ |
| Production         | Not deployed: needs the domain, an email provider and a payment decision                                                                                                                            |
| Admin              | Ported (`apps/admin/wrangler.jsonc`, same OpenNext steps as the website); builds in CI. Preview deploy is a manual step from Linux or WSL                                                           |
| Email              | Resend provider and templates built and tested; needs a domain, `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` (open question 11). Production refuses the console provider                            |
| Payments           | Mock only; MTN MoMo and Airtel not integrated (open question 10)                                                                                                                                    |

Costs beyond the free tier: Workers Paid plan (USD 5/month base, then per request and CPU time; needed for
password hashing), Hyperdrive (included with Workers Paid within limits), R2 (storage and operations above the
free allowance), Cloudflare Images for `next/image` (beyond the free transformations), and the managed
PostgreSQL provider, which is billed separately.

## 10.7 Staging runbook (Phase 10 exit checks)

### Restore rehearsal on Neon (do this once, then monthly)

Neon keeps a history of the database, so a restore is a branch, never an overwrite.

1. Neon console, the project, **Branches**, **Create branch**. Parent: `main`. Choose "Past data" and a time a few
   minutes ago. Name it `restore-test`.
2. Open the new branch's **SQL Editor** and run:
   `SELECT count(*) FROM users;`, `SELECT count(*) FROM orders;` and
   `SELECT count(*) FROM drizzle.__drizzle_migrations;`. The counts must match the main branch at that time, and the
   migration count must equal the number of files in `database/migrations`.
3. Optional end-to-end check: create a second Hyperdrive config for the branch's connection string and point a
   throwaway API deploy at it. `/ready` must return `database: ok` and a sign-in must work.
4. Delete the `restore-test` branch.
5. Record the date, who ran it, and the result in the table in 9.6.

A real restore is the same steps, followed by pointing the Hyperdrive config (`wrangler hyperdrive update`) at the
restored branch.

### Monitoring

- **Uptime.** Create free monitors (UptimeRobot or Better Stack) every minute for the API `/ready`, the website
  `/ready` and the admin `/admin/ready`, alerting by email and phone.
- **Errors.** Create a Sentry project, then `wrangler secret put SENTRY_DSN` (API, per environment). The website and
  admin read `NEXT_PUBLIC_SENTRY_DSN` at build time.
- **Jobs.** The cron trigger runs every minute. In the Cloudflare dashboard (Workers, `bambino-api-*`, Observability)
  watch for `background jobs failed`, and add a notification on the error rate.
- **Cost.** Set a billing alert in the Cloudflare dashboard.

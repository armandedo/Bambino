# 18. Vercel deployment

How Bambino runs on Vercel. The Cloudflare setup ([10-cloudflare.md](10-cloudflare.md)) keeps working unchanged and is the fallback; nothing here removes it.

## 18.1 Architecture

Three Vercel projects from this repository, each with its own Root Directory.

| Project | Root Directory | What runs                                                                                                   |
| ------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| API     | `apps/api`     | One Node.js function (`api/index.js`) serving GraphQL, webhooks, `/health`, `/ready` and the scheduled jobs |
| Website | `apps/web`     | Next.js                                                                                                     |
| Admin   | `apps/admin`   | Next.js, served under `/admin`                                                                              |

| Concern              | On Cloudflare                                     | On Vercel                                                                                                                                                                               |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database connections | One connection per request through Hyperdrive     | A pool of at most 3 per warm function instance (`connectPool`), pointed at the database's pooled endpoint. For Neon that is the connection string whose host contains `-pooler`         |
| Background jobs      | Cron Trigger every minute                         | Vercel Cron calls `GET /internal/jobs` every minute with the project's `CRON_SECRET` as a bearer token. Any other caller gets 401                                                       |
| Rate limits          | PostgreSQL                                        | PostgreSQL (`RATE_LIMITER=postgres`)                                                                                                                                                    |
| Passwords            | argon2id in plain JavaScript                      | The same, so the function carries no native binary                                                                                                                                      |
| Client IP            | `CF-Connecting-IP`                                | `X-Forwarded-For`, which Vercel's edge sets itself                                                                                                                                      |
| Sign-in cookies      | Website, admin and API share a registrable domain | `*.vercel.app` hosts are unrelated sites, so the browser calls the API through the website's or admin's own origin (`/api/graphql`, a rewrite to the API). Cookies are then first-party |
| Images               | R2 public bucket                                  | Unchanged: the same R2 bucket and public address                                                                                                                                        |
| Secrets              | `wrangler secret put`                             | Vercel environment variables marked Sensitive; never in git                                                                                                                             |

Scheduled jobs on Vercel have two limits that decide how the projects are set up:

- **Cron runs only against a project's production deployment.** A "preview" environment that needs reconciliation is therefore its own project (for example `bambino-api-preview`) whose production deployment is the preview.
- **The Hobby plan allows a cron job once a day at most** and refuses to deploy a more frequent schedule. Payment reconciliation needs every minute, which needs the Pro plan. Hobby is also limited to non-commercial use.

## 18.2 Environment variables

Names only. Values marked secret are entered by the owner in Vercel and never shared.

**API project**

| Name                                                                                                                            | Value                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                                      | `development` for a preview (keeps test payments allowed); `production` only for launch |
| `DATABASE_URL`                                                                                                                  | Secret. The pooled connection string of the database for this environment               |
| `JWT_SECRET`                                                                                                                    | Secret. At least 32 random characters, different per environment                        |
| `CRON_SECRET`                                                                                                                   | Secret. At least 16 random characters                                                   |
| `WEB_ORIGIN`, `ADMIN_ORIGIN`                                                                                                    | The website's and admin's origins, for example `https://bambino-web-preview.vercel.app` |
| `EMAIL_FROM`                                                                                                                    | As on Cloudflare                                                                        |
| `RATE_LIMITER`                                                                                                                  | `postgres`                                                                              |
| `PAYMENT_PROVIDERS_ENABLED`                                                                                                     | `mock` for a preview                                                                    |
| `SUBSCRIPTIONS_ENABLED`                                                                                                         | `false`                                                                                 |
| `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_PRIVATE_BUCKET`, `STORAGE_PUBLIC_BASE_URL` | As in `apps/api/wrangler.jsonc` for the same environment                                |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`                                                                            | Secret. Needed for uploads and private files; product photos display without them       |

**Website project**

| Name                                                      | Value                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                    | The website's own origin                                            |
| `NEXT_PUBLIC_API_URL`                                     | `<website origin>/api/graphql`                                      |
| `API_PROXY_TARGET`                                        | `<API origin>/graphql`                                              |
| `API_URL`                                                 | `<API origin>/graphql` (used when pages are rendered on the server) |
| `NEXT_PUBLIC_MOCK_PAYMENTS`, `NEXT_PUBLIC_PREVIEW_BANNER` | `true` for a preview                                                |

**Admin project**

| Name                   | Value                              |
| ---------------------- | ---------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | The admin's own origin             |
| `NEXT_PUBLIC_API_URL`  | `<admin origin>/admin/api/graphql` |
| `API_PROXY_TARGET`     | `<API origin>/graphql`             |

## 18.3 Database

A preview uses its own database, never production's. With Neon, create a branch of the preview database, copy its pooled connection string into the API project's `DATABASE_URL`, and apply migrations to that branch only with `pnpm --filter @bambino/api db:migrate` (see [09-operations.md](09-operations.md)).

## 18.4 Rollback

- A bad deployment: in Vercel, promote the previous deployment of that project (Deployments, "Promote to Production"), or `vercel rollback`.
- Leaving Vercel: the Cloudflare previews are untouched. Point people back at the `workers.dev` addresses; no data moves, because the preview database on Vercel is a separate branch.
- The code change is additive: `apps/api/src/vercel.ts`, `apps/api/api/`, `apps/api/vercel.json`, a pooled connection helper and an optional rewrite. Reverting the commit removes Vercel support without affecting Cloudflare or the Node server.

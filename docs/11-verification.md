# 11. Verification (Phase 9)

What was checked, what was measured, what was changed, and what is still open. Dates are 2026-10-15. Numbers come
from the live Cloudflare preview, measured from Johannesburg on a laptop, so treat them as indicative.

## 11.1 Dependency security

`pnpm audit --prod` found 6 advisories.

| Package                                                | Severity           | Where                               | Action                                                                                                                                  |
| ------------------------------------------------------ | ------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@graphql-tools/utils` < 12.0.1 (prototype pollution)  | high               | API runtime (through graphql-yoga)  | **Fixed**: pinned to 12.0.4 in `pnpm-workspace.yaml` overrides. API suite (239 tests) passes                                            |
| `source-map-js` < 1.2.2 (event-loop DoS)               | high               | Build tooling of web, admin, mobile | **Fixed**: pinned to 1.2.2                                                                                                              |
| `node-forge`, `braces`, `uuid`, `decode-uri-component` | 2 high, 2 moderate | Expo command-line tooling only      | **Accepted**: run on a developer machine, never bundled into the app. No patched release for two of them. Re-check on each Expo upgrade |

Re-run `pnpm audit --prod` before every release. The production build of the mobile app does not contain these.

## 11.2 API surface review

Checked by reading the code and its tests:

- GraphQL: depth 10, 400 fields and 20 aliases per document (`limits.ts`); batching off; 413 for oversized bodies;
  introspection and GraphiQL **disabled when `NODE_ENV=production`**. The preview runs in development mode, so
  introspection and GraphiQL are on there: expected, not a production finding.
- CORS: only the website and admin origins, with credentials; webhooks are answered without CORS or cookies.
- Auth: short access token, rotating refresh token with reuse detection, per-IP and per-account limits, lockout.
  Mobile keeps the refresh token in the device keystore and the access token in memory (unit tested).
- Pay on delivery: ownership check, idempotency key, eligibility re-checked on confirmation, no refund path for
  cash (tests in `cash-on-delivery.test.ts`).
- Object storage: product photos in a public bucket; data exports in a **separate private bucket**, served only
  through short-lived signed links.

Not done, and worth doing before launch: an external penetration test, a WAF rule review in log mode (docs/10 10.5),
secret rotation (the Neon password and R2 token were shared in chat and must be rotated), and certificate pinning
for the mobile app if the threat model needs it.

## 11.3 Accessibility

Lighthouse accessibility is **100 on the home, shop and plans pages**. Component tests also run axe and contrast
checks (`packages/ui`). Not yet checked: a manual screen-reader pass of checkout and the account area, and the
mobile app (labels and roles are set on controls, but VoiceOver and TalkBack have not been tried).

## 11.4 Performance

Lighthouse, mobile profile, one run per page (the home page twice).

| Page  | Performance | LCP   | Total blocking time | Notes                                                     |
| ----- | ----------- | ----- | ------------------- | --------------------------------------------------------- |
| Shop  | 94          | 1.7 s | 260 ms              | Good                                                      |
| Plans | 64          | 4.0 s | 970 ms              | One run                                                   |
| Home  | 42 and 61   | 5.6 s | 1.9 s and 0.6 s     | Server response 1.9 to 2.7 s under simulated slow network |

Best practices were 100 everywhere. SEO scored 63 to 66 only because the preview deliberately blocks indexing.

Findings and changes:

- Each API call takes about 0.55 s from Johannesburg even for `{ __typename }`, so network distance dominates. The
  database is in Frankfurt; there is no closer Neon region, so cache rather than relocate.
- The `revalidate` hint on catalogue reads does not take effect in the Cloudflare build (no Next.js data cache is
  configured), so each home page render made three API round trips. **Changed**: a bounded 30-second in-memory
  memo for anonymous catalogue reads (`apps/web/lib/ttl-memo.ts`, 5 tests). Errors are never cached.
- Blocking time varied from 0.6 s to 1.9 s between two runs of the same page, so it is noisy on this laptop. Measure
  again from CI or a clean machine before optimising JavaScript.

Open: re-measure after the memo is deployed (needs a WSL build and deploy), configure a real Next.js cache for
Workers (R2 incremental cache) if the memo is not enough, and measure the mobile app on a mid-range Android phone.

## 11.5 CI

- Checks job (format, lint, typecheck, unit tests, builds, Wrangler dry run, OpenNext builds for web and admin,
  mobile Android bundle): green at the last confirmed run.
- Playwright job: red. The last full-size log showed the API listening and only `localhost:4000/ready` unready,
  while the website and admin readiness checks (which call `127.0.0.1:4000`) passed. The step now waits on
  `127.0.0.1` with curl and, if anything is still down, prints direct requests for `127.0.0.1`, `[::1]` and
  `localhost`, name resolution, listening sockets and the three logs in plain view. **Status: unconfirmed until the
  next run on GitHub.**

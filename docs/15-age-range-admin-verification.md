# Ages and admin catalogue changes

The shopping groups now run from newborn through age 17. Older codes are `2-3Y` through `17-18Y`. Migration `0010_child_sizes` adds only missing size rows and never updates existing definitions, products, inventory or orders. Do not use development seeds to update an existing catalogue.

Child profiles accept dates before the eighteenth birthday (and the existing expected-date allowance). API measurements allow height through 230 cm and weight through 200 kg, with corresponding web form limits. These are input limits, not recommended or expected measurements. Chest/waist and foot limits also accommodate older children.

Older size rows currently contain age guidance only. When measurements exceed the configured measurement chart, the size finder uses age guidance rather than clamping to the largest infant size. A verified garment measurement chart is still needed for precise adolescent fit recommendations.

Admins with `product:write` can edit variant prices and remove/restore products using shop visibility. Records are retained. Order items retain their recorded unit prices and order status history. Stock availability remains per variant; the in-stock filter keeps a product listed while another variant has available stock.

Local validation completed: admin, API, database and web type checks; sizing and profile regressions; product-address tests; all 24 commerce tests, including price/history, permissions and sold-out/restock regressions; additive migration replay/preservation test. The seed suite encountered an environment setup timeout. No live database migration, live seed or deployment was performed.

Lint of edited admin/web forms, sizing code and regression tests passes, as does `git diff --check`. Desktop/mobile browser inspection remains incomplete: Chromium's missing runtime libraries were downloaded into `/tmp`, but the local `/shop` development compilation stalled. No screenshots were approved as verified. Temporary local verification servers were stopped after this attempt. Authenticated admin layout inspection also remains pending.

## Remaining verification attempt — 8 November 2026

This attempt changed only this report. Existing implementation and saved patches were preserved. Checks ran sequentially, with no builds or app servers alongside the test suite. No deployment or live database access occurred.

| Check                                                                | Actual result                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposable seed suite                                                | Failed during setup; three tests skipped. Command: `env -u TEST_DATABASE_URL pnpm --filter @bambino/database test seeds/seeds.test.ts --maxWorkers=1`. With that variable unset, `createTestDatabase()` uses in-memory PGlite.                                                |
| Storefront production build                                          | Failed before producing a usable build. Command: `NEXT_PUBLIC_PREVIEW_BANNER=true NEXT_PUBLIC_API_URL=http://localhost:4100/graphql API_URL=http://127.0.0.1:4100/graphql NEXT_PUBLIC_SITE_URL=http://localhost:3000 timeout 600 pnpm --filter @bambino/web build --webpack`. |
| Admin production build                                               | Failed before producing a usable build. Command: `NEXT_PUBLIC_API_URL=http://localhost:4100/graphql timeout 600 pnpm --filter @bambino/admin build --webpack`. Started after the storefront build exited.                                                                     |
| TypeScript configuration diagnostic                                  | Direct `node node_modules/typescript/bin/tsc --showConfig -p apps/web/tsconfig.json` produced 6,551 bytes of valid JSON and zero stderr. This does not establish why Next's invocation failed.                                                                                |
| Desktop/mobile storefront and authenticated admin browser inspection | Blocked by failed production builds. Age filters, price editing, remove/restore and stock status were **not browser-verified in this attempt**. Earlier API test results above remain separate evidence. No development server fallback or build restart was attempted.       |

Exact seed error:

```text
FAIL seeds/seeds.test.ts [ seeds/seeds.test.ts ]
Error: Hook timed out in 60000ms.
seeds/seeds.test.ts:18:1 — beforeAll / createTestDatabase()
Test Files 1 failed (1)
Tests 3 skipped (3)
Duration 123.17s
```

Exact error from both production builds:

```text
Creating an optimized production build ...
Build error occurred
Error: Could not parse output from TypeScript's --showConfig.
  type: 'Error'
ELIFECYCLE: Command failed with exit code 1.
```

Resource snapshots (`free -m` and process elapsed time, CPU, RSS, state):

- Seed baseline: 3,850 MB total RAM, 2,573 MB available; 1,017/1,024 MB swap used. One test worker was active at 98.1% CPU after nine seconds; no build was running.
- After the seed timeout: 2,800 MB available RAM, 1,017 MB swap used; test worker had exited.
- After storefront build failure: 2,788 MB available RAM, 1,009 MB swap used; build worker had exited.
- After admin build failure: 2,779 MB available RAM, 1,009 MB swap used; build worker had exited. These snapshots alone do not establish memory pressure as the failure's cause.

Captured local artifacts: `/tmp/bambino-verify-web-build.log`, `/tmp/bambino-verify-admin-build.log`, `/tmp/bambino-verify-showconfig.json`, `/tmp/bambino-verify-showconfig.err`. Temporary browser/API harnesses were prepared but not launched in this attempt because production builds failed. No seed-suite or build restart was performed after failure.

## Shared build failure diagnosis — 8 November 2026

Inspected installed Next.js 16.3.8 `dist/lib/typescript/runTypeScriptCli.js`. `getTypeScriptConfigurationCli` spawns `process.execPath` with the resolved compiler and `--showConfig --project <absolute tsconfig> --pretty false`; it captures UTF-8 stdout/stderr, checks the exit code, then parses stdout as JSON. Unix subprocesses use `detached: true`, `shell: false`, ignored stdin and piped stdout/stderr, with inherited environment.

Both apps resolve TypeScript **6.0.3**, at `/home/armandgedo/bambino/node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/package.json`. Compiler: `/home/armandgedo/bambino/node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/bin/tsc`. Executable: `/home/armandgedo/.nvm/versions/node/v24.19.0/bin/node`.

| App   | Working directory                     | Compiler arguments                                                                        |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Web   | `/home/armandgedo/bambino/apps/web`   | `--showConfig --project /home/armandgedo/bambino/apps/web/tsconfig.json --pretty false`   |
| Admin | `/home/armandgedo/bambino/apps/admin` | `--showConfig --project /home/armandgedo/bambino/apps/admin/tsconfig.json --pretty false` |

Called the installed `runTypeScriptCli` directly for each app, using those exact arguments. In the command sandbox both subprocesses returned exit code **0**, signal **null**, **0 stdout bytes**, **0 stderr bytes**. Output was empty, not truncated JSON or extra diagnostic text. `JSON.parse` failed with `Unexpected end of JSON input`. A direct Node spawn comparison also returned empty output with either detached setting.

The identical installed Next helper run outside the sandbox returned exit code **0**, signal **null**, no stderr, and valid JSON: **6,551 bytes for web**, **2,612 bytes for admin**. This establishes the sandbox subprocess environment as the cause of the empty capture; it does not establish the internal sandbox mechanism. The TypeScript configuration itself is valid.

Smallest fix: run the production builds with approved unsandboxed execution, preserving the existing Next/TypeScript configuration. No source/config workaround, dependency replacement, `ignoreBuildErrors`, or node_modules patch was used. The first corrected storefront build exited **0**, including TypeScript checking.

Raw diagnostic artifacts: `/tmp/bambino-{web,admin}-ts-sandbox.{stdout,stderr,meta.json}` and `/tmp/bambino-{web,admin}-ts.{stdout,stderr,meta.json}`. Corrected build logs: `/tmp/bambino-fixed-web-build.log` and `/tmp/bambino-fixed-admin-build.log`.

### Corrected production builds and browser results

Both corrected production builds exited **0**, sequentially, without source/configuration changes. Web compiled in 2.4 minutes and completed TypeScript checking in 37.2 seconds; admin compiled in 54 seconds and completed TypeScript checking in 32.5 seconds. Both generated their production route output. The original shared `--showConfig` failure is resolved by approved execution outside the command sandbox, with checking still enabled.

The seed suite was checked once in that corrected environment with `TEST_DATABASE_URL` unset and `--maxWorkers=1`, after builds completed and before serving apps. It still failed independently during in-memory PGlite setup: `Hook timed out in 60000ms` at `seeds/seeds.test.ts:18:1`; three tests skipped, total duration 86.60 seconds. Post-failure resource snapshot: 2,766 MB available RAM, 1,009 MB swap used; test worker had exited. Log: `/tmp/bambino-fixed-seed-tests.log`. No unchanged retry followed.

Production browser checks used Chromium at **1440×1000** and **390×844**, local production Next servers on ports 3000/3001, and an isolated PGlite API on port 4100. Temporary fixture credentials/tokens remain only in `/tmp`; no live database was used. The fixture clock was aligned to the real clock because production admin checks JWT expiry, unlike the frozen-clock API test fixture. Browser harness selectors were corrected for the age-range link and password field; no application changes were needed.

Confirmed in both viewports:

- Age-17 URL filter marks the 17–18-year group active and lists the disposable fixture with that variant.
- Staff sign-in, variant price edit to RWF 23,500, persistence after reload, removal from shop, API confirmation of removal, and restore to shop.
- Staff with `product:read` but no `product:write` can inspect the product but have no price-save or removal controls.
- Storefront and admin document widths fit the viewport. The mobile admin variant table scrolls horizontally to reach price controls; the forms themselves stack vertically.

Reviewed screenshots: `/tmp/bambino-verify-{desktop,mobile}-age.png`, `/tmp/bambino-verify-{desktop,mobile}-admin.png`; removal and read-only screenshots are alongside them. Machine-readable assertions: `/tmp/bambino-verify-browser-results.json`. All six viewport/flow groups passed; browser harness exited **0**. Earlier unsuccessful harness attempts are not counted as passing checks.

Inspection finding left unchanged: the storefront announcement still says “Newborn to 24 months” despite the working older-age filters. This is content follow-up, unrelated to the shared build failure.

### Stock browser inspection

A fresh disposable product with newborn and 17–18-year variants was used to avoid old fixture cache entries. Both desktop and mobile screenshots confirmed that one sold-out variant is disabled while the other in-stock variant remains selectable.

An initial assertion after 65 seconds still saw the previous in-stock detail response: expected zero “In stock” radios, received one. That assertion failed and is not counted as passing. The current uncached API subsequently confirmed both variants had `inStock: false`. A bounded follow-up explicitly triggered framework revalidation and allowed the separate 30-second in-process memo to expire. Both viewport checks then passed for all-sold-out detail rendering. Meaningful listing checks searched the actual product name: the product appeared without the stock filter and disappeared with `inStock=1`.

This demonstrates eventual public stock updates, not instantaneous invalidation. Existing framework revalidation and in-process memoization can expose stale stock after an admin adjustment; cache invalidation changes were outside this shared build-failure fix. Initial stock artifacts: `/tmp/bambino-stock-browser.log`, `/tmp/bambino-stock-results.json`; follow-up evidence: `/tmp/bambino-stock-resume.log` and `/tmp/bambino-stock-resume-results.json`. Partial and sold-out screenshots: `/tmp/bambino-stock-{desktop,mobile}-{partial,soldout}.png`.

Restock follow-up completed: both variants became selectable again in desktop and mobile detail pages after triggering revalidation and waiting for the in-process memo to expire. The desktop in-stock listing assertion passed. A name-only mobile listing selector matched two disposable products; it was corrected to match the exact fixture product URL, and the focused mobile restock/detail/listing check exited **0**. Evidence: `/tmp/bambino-mobile-restock.log`, `/tmp/bambino-stock-resume-results.json`; reviewed `/tmp/bambino-stock-{desktop,mobile}-restocked.png` and `/tmp/bambino-stock-mobile-restocked-listing.png`. These are eventual-consistency checks; the earlier 65-second stale-stock failure remains documented above.

Final scope: shared build failure resolved without application changes or disabling TypeScript. Both production builds passed. Desktop/mobile storefront and authenticated admin inspection completed, including edit permissions and stock states. Remaining findings: disposable seed-suite setup timeout, older-age promotional copy, and delayed public stock freshness from layered caches. No live database, deployment, or saved patch was changed. Temporary production servers and the disposable API were stopped after inspection.

## Age copy and stock freshness implementation — 8 November 2026

This section supersedes the earlier findings about general age-range copy, optional sold-out filtering, and stacked public product caches. Existing work and saved patches were preserved.

- Updated the general announcement, About page and default metadata to newborn through age 17. Infant-category labels and the infant-specific growth slider remain unchanged.
- Homepage already requested `inStockOnly: true`. Shop now also always requests it; the redundant optional stock checkbox was removed. The API's existing same-variant stock predicate retains products while a size/colour has available inventory. Products with no available variants disappear from default listings and return on restock.
- `Products` and `Product` reads bypass the 30-second in-process memo and use `cache: 'no-store'` to bypass Next's persistent fetch cache. Stable reference queries still use the existing cache. Removed misleading page-level 60-second revalidation exports from homepage/product detail. Stock/prices are refreshed on a new server page request; this does not add push updates to an already-open page.
- Cart/checkout server-side validation was not changed. All **24 commerce tests passed**, with one worker and no builds alongside tests (`/tmp/bambino-stock-change-commerce.log`, 98.03 seconds). Targeted lint and `git diff --check` passed.
- The seed-suite setup timeout remains **unresolved**. The unchanged failing seed suite was not rerun for this change.

### Production verification of the stock/copy changes

The changed storefront production build exited **0**, with TypeScript checking enabled (97-second compilation, 32.6-second type check). Build log: `/tmp/bambino-fresh-stock-build.log`. Browser inspection used its standalone production server, Chromium desktop **1440×1000** and mobile **390×844**, and disposable PGlite fixtures only. No builds ran alongside the 24-test commerce suite.

Both viewport runs passed these exact-product-link assertions on the **same `/`, `/shop`, and product detail URLs**, without any cache-expiry sleeps or cache-busting query parameters:

| Transition                                             | Desktop phase duration | Mobile phase duration | Result                                                                                                        |
| ------------------------------------------------------ | ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sell out one size/colour while another remains stocked | 14,538 ms              | 7,319 ms              | Product remains on default homepage/shop; sold-out size disabled; alternate colour remains selectable.        |
| Sell out every variant                                 | 9,507 ms               | 6,303 ms              | Product disappears from default homepage/shop; detail stock status refreshes.                                 |
| Restock a variant                                      | 13,131 ms              | 8,798 ms              | Product returns automatically on next request to those same listing URLs; detail variant is selectable again. |

Durations include both listing navigations, screenshots and detail assertions, rather than measuring API latency. Stock changes were made immediately before each phase. This replaces the previous 65–100-second cache-wait procedure; no explicit TTL waits were used.

Both viewport runs also verified updated default metadata and About copy, unchanged newborn `0-3 months` label, active `17-18 years` filter, no page-level horizontal overflow on homepage/shop, and **zero browser page errors**. Reviewed desktop/shop and mobile/shop/detail screenshots showing the updated announcement, available/sold-out sizes and responsive layouts. Homepage/shop snapshots exist for initial, partial, sold-out and restocked states. Exact fixture URL assertions distinguish temporary products that share a display name from earlier harness attempts.

One temporary harness attempt stopped on a hidden radio input whose label intercepted clicks (`locator.check: Timeout 30000ms exceeded`); the harness was corrected to click the visible colour label, then both viewport flows passed. No application change or rebuild was needed for that test correction. Resource snapshot during that run: 1,822 MB available RAM; Chromium active on CPU. Raw selector error: `/tmp/bambino-fresh-stock-browser-selector-error.log`.

Final evidence: `/tmp/bambino-fresh-stock-browser.log`, `/tmp/bambino-fresh-stock-results.json`, and `/tmp/bambino-fresh-{desktop,mobile}-{initial,partial,soldout,restocked}-{home,shop}.png`, plus age-17 and restocked-detail screenshots. Browser runner exited **0**. `git diff --check` passed. Temporary verification servers were stopped afterward. The seed-suite setup timeout remains unresolved and was not rerun. No deployment, live database modification or patch reapplication occurred.

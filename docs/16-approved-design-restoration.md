# Approved design restoration

The approved archive was extracted separately to `/tmp/bambino-approved-design-g1qtb1ps` from
`/mnt/c/Users/PC/Downloads/Bambino-approved-design.zip`. Its patch targets an older tree and did not
apply cleanly, so its reference files were merged into the existing `feat/shopping-only-storefront`
working tree. The original working files and patches were backed up under
`/tmp/bambino-before-restoration-u8d5pjt0` before editing.

The merge restores the arched mother-and-baby hero, cream/navy/apricot palette, simple header,
white footer logo, rounded product cards with contained photos, and approved shopping copy.
The Little Romper logo asset, logo component and PNG browser icon already matched the archive.
Favourites, the bag drawer, product sizes and current catalogue filters remain connected.

The age definitions (newborn through 17), API, admin price editing and product removal/restoration,
database files and fresh stock/price reads were preserved byte for byte from the backup.
The old infant-only age test was updated to protect the existing full age range and age-17 filter.
`SUBSCRIPTIONS_ENABLED` remains false by default and in the preview Worker configuration.
No deployment, database migration, seed or live database access was performed.

## Validation

Checks ran sequentially: web ESLint; config tests (20 passed); web tests (54 passed);
API environment/subscriptions-disabled unit tests (8 passed, no database); admin typecheck;
and a webpack website build including TypeScript checking. The initial config test failure
was the stale infant-only expectation described above.

Local Chromium checks cover homepage/shop at 320, 360, 390, 768, 1024 and 1440 pixels,
horizontal overflow, logo loading and inverse footer styling, theme colours, product photos,
the age-17 filter, persistent favourites, the bag drawer, PNG icon bytes and shopping-only
redirects. Screenshots are stored at `/tmp/bambino-approved-{390,1440}-{home,shop,footer}.png`.

## Local visual preview

The temporary fixture accepts only queries and serves synthetic catalogue entries and local photos.
It does not connect to a database or submit orders. In separate terminals:

```sh
node /tmp/bambino-design-fixture.cjs
```

```sh
API_URL=http://127.0.0.1:4100/graphql \
STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:4100 \
pnpm --filter @bambino/web start
```

Open <http://localhost:3000> and <http://localhost:3000/shop>. The current build is marked as a preview
and points browser API requests to the local fixture. The `/tmp` fixture and screenshots are temporary.
To rebuild this same local preview, stop the web server and run:

```sh
NEXT_PUBLIC_PREVIEW_BANNER=true NEXT_PUBLIC_MOCK_PAYMENTS=true \
NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
NEXT_PUBLIC_API_URL=http://127.0.0.1:4100/graphql \
API_URL=http://127.0.0.1:4100/graphql \
STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:4100 \
pnpm --filter @bambino/web build --webpack
```

The mock-data preview verifies presentation and catalogue interactions; it is not a live inventory,
authenticated admin, payment or checkout integration test.

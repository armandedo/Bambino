# Shopping-only storefront

Bambino now leads with individual clothing purchases. The storefront keeps the Little Romper logo and uses warm paper, apricot, navy, mixed-case headings, parent-and-baby photography and product photography with an uncropped contain fit.

## Design research

Reviewed in the browser on 3 November 2026:

- [Babuu, Webflow](https://webflow.com/templates/html/babuu-128), including its [live demo](https://babuu-128.webflow.io/): family photography, friendly type, clear shop/category/product pages. Bambino uses its own layout and copy.
- [Totsy, Shopify](https://themes.shopify.com/themes/toyo/presets/totsy): warm surfaces, playful accents, visual collections and a direct shopping call to action. Its denser promotional overlays are not used in Bambino.

These are design references. No theme code, imagery or paid template was purchased, copied or installed. No platform migration is required.

## Copy direction

Speak to a parent, using everyday situations and short, useful sentences. Do not invent reviews, customer counts, organic-material claims, delivery promises, discounts or certifications.

- Hero: **Little clothes. Lovely everyday moments.**
- Intro: From sleepy cuddles to first wobbly steps. Find baby clothes you love, in the size they need, right here in Kigali.
- Main action: Shop little favourites
- Products: Meet their next favourites
- Age groups: What stage are they at?
- Story: Their world is growing. Let’s dress them for it.
- Closing: Something small. A whole lot of love.
- About: For little people. And the people who love them.

Product descriptions and prices remain catalogue data. Delivery options, prices, stock and payment eligibility remain server-authoritative at checkout.

## Behaviour

- No subscription cards, renewal pricing, swap promotions or subscription badges in customer shopping flows.
- Main navigation: Shop all; Shop by age; Our little story; Shopping & delivery.
- Mobile navigation: Home; Shop; Bag; Find size; Account.
- Size-finder results lead to the matching shop size.
- Home, shop and sitemap catalogue requests use `oneTimeEligible: true`.
- Customer dashboard focuses on orders, delivery, baby sizing and notifications.
- Old `/plans`, `/subscriptions` and `/dashboard/subscription/*` URLs redirect to `/shop`.
- Legacy wardrobe, exchange and sustainability entry points redirect to relevant shopping/account information.
- Existing subscription source modules and database records remain for history and staff servicing; this change does not delete records or create a migration.

## Billing control

`SUBSCRIPTIONS_ENABLED` defaults to `false` for both the Node server and Cloudflare API Worker. Leave it false or unset when deploying. Explicitly check that an existing environment has not opted in with `true`.

When disabled, the public plans query returns an empty list. Subscription creation, resumption, plan changes and item selection are rejected with `SUBSCRIPTIONS_DISABLED`. The renewal job returns before querying subscriptions, creating renewal orders or requesting automatic payments. Existing read, pause and cancellation operations remain available for legacy account servicing.

Disabling billing is not a contractual cancellation or a refund of an existing paid subscription. If there are active subscribers, review their paid periods and communicate the transition before a production rollout. No existing records or payment transactions were modified during development.

## Handoff and verification

Apply the shopping-only patch after the Little Romper logo update. Run API and web type checks, lint and appropriate tests. For memory-limited machines, use two API test workers.

The implementation was checked with a Webpack production build, TypeScript, ESLint, all 54 web tests, and all 312 API tests (4 skipped). The API tests include disabled plan discovery, blocked direct subscription mutations and skipped renewal processing. A first concurrent full API test run exhausted worker resources; the complete two-worker run passed.

Desktop layout was visually inspected using the built standalone website. The managed browser does not expose viewport resizing, so exact phone-width QA must be completed locally. The managed preview could not connect to the external API; a separate read-only API request verified the current catalogue contains 20 purchasable products. Do not treat this as a live end-to-end checkout test.

Before publishing, inspect at 360, 390, 768 and 1440 CSS pixels. Check navigation, age filters, category filters, product photo containment, size selection, cart and checkout. Verify old subscription URLs redirect and that the browser console has no layout or hydration errors. Deploy the API and website to preview using the repository workflow. Confirm the API flag is false, then check the public preview before any production deployment.

### Resumed verification — 4 November 2026

- Branch: `feat/shopping-only-storefront`, based on logo commit `131105a`. The original shopping-only patch was already applied. Logo source and assets remain unchanged.
- Fixed TypeScript inference in the additional disabled-subscription test. API and web type checks and lint pass; all 54 web tests and 11 focused API tests pass. The attempted full API rerun was interrupted to reduce resource contention; the earlier full-suite result above was not repeated today.
- A fresh Webpack production build passes. The pre-existing build was stale and still displayed subscription copy, so it was replaced before reviewing layouts.
- Home, shop, about, shopping and delivery, size finder and cart returned 200 at 360, 390, 768 and 1440 CSS pixels, with no horizontal overflow or uncaught page errors. Checked `/plans`, `/subscriptions`, `/dashboard/subscription/test`, `/exchange` and `/sustainability`: all return the intended 308 redirect.
- The local website connected to the preview API and rendered 20 catalogue products. A product page opened at 390 and 1440 pixels without overflow. Fully revealed home screenshots were reviewed at both widths; lifestyle and featured product photos loaded successfully with the image origin configured. This used public reads only; no orders or payments were created.
- When running the build locally, set `API_URL` to the preview GraphQL endpoint and `STORAGE_PUBLIC_BASE_URL` to the preview image origin. Omitting the latter causes the existing CSP to block external product images even though the image host returns 200.
- Remaining: exercise filters, size selection and checkout with a test account; update the subscription-oriented browser journeys for shopping-only behavior; deploy API and web to preview and verify the deployed billing flag and public flows. Production has not been deployed.

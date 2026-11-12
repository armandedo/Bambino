# Product-led retail front end

This pass builds on the shopping-only working tree and preserves the approved Little Romper logo. It changes the website presentation and front-end interactions. Existing API changes from the earlier shopping-only task are preserved; this redesign does not modify them.

## Design and content

- Navy, warm white/peach surfaces and one darker coral action colour. Existing self-hosted Space Grotesk headings and a system body font avoid another font download.
- Search-first sticky header, real catalogue categories, an age mega-menu, a mobile drawer, persistent device favourites and a shopping-bag drawer.
- Two manually controlled collection slides, a direct product link in the hero, three collection promos, image categories, eight featured products, editorial collections, age links, a factual trust strip and account signup.
- Existing product names, prices, images, slugs and checkout inputs remain authoritative. Missing images use a neutral placeholder. Sale prices, bestseller labels, fabricated reviews and unverified delivery/returns/material promises are not invented.
- Product cards use 4:5 image areas, optional second images, size chips, saved hearts and a choose-size link. Category results use 2/3/4 columns at phone/tablet/desktop widths and collapsible phone filters.
- Product pages retain the existing size/colour selection and add-to-cart mutation, with a photo gallery and a single mobile purchase bar. Successful additions open the bag drawer. Cart quantity, removal, totals and checkout operations are retained.
- Native modal dialogs handle focus containment, Escape and focus return. Interactive controls wait for hydration. Motion is brief and respects reduced-motion preferences. The motion library is loaded by editorial components rather than every retail page.
- Next Image serves responsive WebP derivatives from the existing image URLs. Product detail photos can use containment to keep the whole garment visible. Lifestyle and card images fill their containers.

## Assumptions and items needing real business details

The current store sells babywear for newborns through 24 months, serves Rwanda and displays RWF. Navigation uses the catalogue's real clothing and age groups; unsupported gender, gift and sale collections were not invented. English and RWF are displayed without a nonfunctional language/currency switcher.

The family block uses the existing account-registration flow and prefills the email field. No newsletter service, discount, verified review feed, social handle or support contact was supplied. Editorial photography uses the existing licensed stock assets; product photos remain the merchant's existing catalogue images. No claim is made that the editorial models are wearing a particular listed product.

## Verification and scope

The production Webpack build, web TypeScript, ESLint and 54 web tests pass. New browser checks cover carousel controls, keyboard navigation, modal focus, favourites across reloads, size selection, opening the bag after add, quantity updates and delivery quoting. The controlled UI contract tests do not place orders or initiate payments.

Local visual review uses a read-only capture of the public catalogue and cached original photos because direct network requests from the local Node process were intermittently timing out. This fixture lives under `/tmp`, is not shipped, and does not change deployment configuration. Production builds target the actual preview API.

The earlier shopping-only work passed its full API run with one worker: 308 passed and 4 optional live-S3 tests skipped. That is prior validation of the preserved API work, not a new API run for this presentation-only change.

Website preview: https://bambino-web-preview.rwanyindoarmand.workers.dev, version `aafd50ac-b899-491c-bab9-63d79b6dcf6d`. Only the website was deployed in this presentation pass; production was not deployed.

Live mobile smoke verification passed: eight real product images loaded, carousel controls worked, all eight tested legacy redirects returned the correct 308 destination, no horizontal overflow at 375px and no browser page errors. Desktop interaction checks passed; the final mobile rerun passed both interaction and size/cart/delivery contract tests. Screenshots are available locally at `/tmp/bambino-retail-home-fold-1440.png` and `/tmp/bambino-retail-live-mobile.png`.

The deployed mobile journey A passed end to end: size selection, quantity increase/decrease, removal/re-add, delivery selection, order creation and successful MOCK payment. It asserted a ONE_TIME/PAID order, MOCK/SUCCEEDED payment and empty cart. No real payment provider or production deployment was used.

Remaining quality blockers: one mobile Lighthouse run measured performance 42 and accessibility 96. The performance target above 90 is not met. The audit recorded 2.49s document response, 4.6s LCP and 3.75s total blocking time; it ran concurrently with the checkout browser, so isolated follow-up measurement is needed before attributing all timing costs. Contrast findings affect muted unavailable-size chips (2.5:1) and two muted paragraphs on peach backgrounds (4.38:1). These findings remain on this preview and prevent a claim of full WCAG AA compliance. Report: `/tmp/bambino-retail-lighthouse.json`.

## Sales priorities

1. Make real products and their categories reachable directly from the opening screen.
2. Keep size choice, stock feedback and the primary purchase action clear and reachable on phones.
3. Add verified customer reviews and an on-child shoot of the actual best-performing products when those assets are available.

Image loading follows [browser-native lazy-loading guidance](https://web.dev/articles/browser-level-image-lazy-loading). Modal behavior follows the [W3C dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

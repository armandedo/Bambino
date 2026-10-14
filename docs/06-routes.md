# 6. Route maps

All three clients use the same GraphQL API. The customer web routes (6.1) are built (Phase 6); mobile and admin
are built in Phases 7 and 8.

## 6.1 Customer web (`apps/web`, Next.js App Router)

| Route                                                                         | Rendering                           | Purpose                                                                                                                     | Main operations                                                |
| ----------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/`                                                                           | Static, revalidated                 | Landing: hero, problem, how it works, sizing, plans, exchange, sustainability, products, testimonials placeholder, FAQ, CTA | `subscriptionPlans`, `products`                                |
| `/how-it-works`                                                               | Static                              | Subscribe → fit → wear → return → exchange → reuse                                                                          |                                                                |
| `/shop`                                                                       | Server-rendered, filters in the URL | Catalogue with search, category, size, price, availability and sort                                                         | `products`, `categories`, `sizes`                              |
| `/shop/[product]`                                                             | Server-rendered, revalidated        | Product detail, structured data (`Product`)                                                                                 | `product`                                                      |
| `/subscriptions`                                                              | Static, revalidated                 | Plans and prices from the database                                                                                          | `subscriptionPlans`                                            |
| `/sustainability`, `/exchange`, `/about`, `/faq`, `/contact`                  | Static                              | Content                                                                                                                     |                                                                |
| `/size-finder`                                                                | Client                              | "Find My Baby's Size": creates or picks a baby profile and shows the recommendation                                         | `createBabyProfile`, `createSizingRecommendation`              |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | Client                              | Authentication                                                                                                              | auth mutations                                                 |
| `/cart`                                                                       | Client                              | Cart                                                                                                                        | `myCart`, cart mutations                                       |
| `/checkout`                                                                   | Client, signed in                   | Address, delivery option, promotion, credit, summary, payment, waiting for phone approval, confirmation                     | `checkoutPreview`, `createOrder`, `initiatePayment`, `payment` |
| `/account`                                                                    | Client, signed in, `noindex`        | Overview: subscription, next delivery, baby size and next size, credit, recent orders                                       |                                                                |
| `/account/baby`                                                               |                                     | Profiles, measurements, sizing history                                                                                      |                                                                |
| `/account/orders`, `/account/orders/[id]`                                     |                                     | Orders and delivery tracking                                                                                                |                                                                |
| `/account/subscription`                                                       |                                     | Plan, price, cycle, renewal, items, pause, cancel, change plan                                                              |                                                                |
| `/account/exchanges`                                                          |                                     | Returns, exchanges, credit ledger                                                                                           |                                                                |
| `/account/settings`                                                           |                                     | Profile, addresses, payment methods, notifications, security, data export, account deletion                                 |                                                                |

Also: `sitemap.xml` (public pages and active products), `robots.txt` (disallows `/account`, `/checkout`,
`/cart`), canonical URLs, Open Graph metadata per page.

## 6.2 Mobile (`apps/mobile`, Expo Router)

Bottom tabs, each a native stack:

| Tab          | Screens                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Home         | Overview (as `/account`), notifications, size finder                                                                               |
| Shop         | Catalogue with filter sheet → product → cart → checkout (native steps: address, delivery, review, pay, waiting for approval, done) |
| Subscription | My subscription, plans, change plan, pause or cancel, items for this cycle                                                         |
| Exchanges    | Garments I hold → start a return → choose next size → status; credit ledger                                                        |
| Account      | Baby profiles and measurements, orders and tracking, addresses, payment methods, settings, sign out                                |

Signed out: welcome, sign in, register, forgot password, then the tabs.

**Built so far:** sign in and register; tabs Home (babies, subscription, notifications), Shop (cart button in the
header), Subscription (plans, start, pause, resume, cancel at period end, pay the waiting order), Exchanges (clothes
held, return request, returns and exchanges status, credit balance) and Account (orders, babies, sign out); product,
cart, checkout (address, delivery, review), order screen with mobile-money payment (polled until the provider
answers), pay on delivery and cancel; baby profiles with an optional first measurement.
**Not built yet:** choosing the next size for an exchange from the app, size finder, password reset, address and
payment-method management, change plan, item selection for a cycle, filter sheet, offline query cache and its
banner, push notifications. Tokens: refresh token in `expo-secure-store`,
access token in memory only (`src/lib/session-core.ts`, unit tested).

Offline behaviour: the query cache for catalogue, profile, baby profiles, recent orders and subscription is
persisted to device storage and shown with an "offline, last updated …" banner. Checkout, payment, return
requests and every other mutation are disabled offline, never queued.

## 6.3 Admin (`apps/admin`, Next.js, `basePath: /admin`, `noindex`)

Navigation is filtered by the signed-in staff member's permissions; the API enforces the same permissions
independently.

| Route                       | Permission                           | Purpose                                                                             |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `/admin`                    | `report:read`                        | Metrics dashboard                                                                   |
| `/admin/customers`, `/[id]` | `customer:read`                      | Customers, their baby profiles (`baby_profile:read`), subscriptions, orders, credit |
| `/admin/products`, `/[id]`  | `product:read` / `product:write`     | Products, variants, prices, images, categories                                      |
| `/admin/inventory`          | `inventory:read` / `inventory:write` | Stock per variant and location, adjustments, low stock                              |
| `/admin/garments`, `/[id]`  | `garment:read` / `garment:write`     | Search by tag code, register garments, transitions, lifecycle history               |
| `/admin/orders`, `/[id]`    | `order:read` / `order:write`         | Orders and status progression                                                       |
| `/admin/subscriptions`      | `subscription:read`                  | Subscriptions, plan editor (`plan:write`)                                           |
| `/admin/payments`           | `payment:read` / `payment:write`     | Payments, transaction log, reconcile                                                |
| `/admin/returns`, `/[id]`   | `return:read` / `return:write`       | Approve, receive, inspect each garment, complete                                    |
| `/admin/exchanges`          | `exchange:read` / `exchange:write`   | Approve or reject, credit adjustments                                               |
| `/admin/deliveries`         | `delivery:read` / `delivery:write`   | Delivery board and status updates                                                   |
| `/admin/promotions`         | `promotion:read` / `promotion:write` | Codes and campaigns                                                                 |
| `/admin/analytics`          | `report:read`                        | Customer, revenue, operations and circular-economy reports                          |
| `/admin/settings`           | `settings:write`                     | Delivery options, size chart                                                        |
| `/admin/users`              | `user_role:read` / `user_role:write` | Staff and roles                                                                     |
| `/admin/audit-log`          | `audit_log:read`                     | Audit trail                                                                         |

Notifications management (`notification:write`) is P1.

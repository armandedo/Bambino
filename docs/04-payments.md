# 4. Payment architecture

Status: designed. Tables, the payment lifecycle and their tests exist. The payment service and the mock
provider are built in Phase 4. MTN MoMo and Airtel Money are NOT YET INTEGRATED: they need merchant sandbox
credentials, and the provider details below must be confirmed against each provider's current documentation
when that work starts.

## 4.1 Interface

```ts
interface PaymentProvider {
  readonly code: PaymentProviderCode;
  /** Ask the provider to collect. Returns once the request is accepted, not once it is paid. */
  initiate(request: {
    reference: string; // our payment's idempotency key
    amount: Money;
    payerMsisdn: string;
    description: string;
  }): Promise<{ providerReference: string; expiresAt: Date | null }>;
  /** The provider's current answer for a payment. The only source of a final status. */
  getStatus(
    providerReference: string,
  ): Promise<{ status: 'PENDING' | 'SUCCEEDED' | 'FAILED'; failureCode?: string }>;
  /** Authenticate an incoming webhook and extract which payment it concerns. */
  parseWebhook(
    headers: Headers,
    body: string,
  ): { eventId: string; providerReference: string; signatureValid: boolean };
}
```

`MockPaymentProvider` implements the same interface for development and tests. Its outcome is chosen by the
test or by the wallet number used (one number approves, one declines, one never answers), so success is
never hard-coded and the failure and timeout paths are exercised. It is rejected in production.

## 4.2 Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant A as PaymentService
  participant D as PostgreSQL
  participant P as Provider
  participant U as Customer's phone

  C->>A: initiatePayment(orderId, provider, msisdn, idempotencyKey)
  A->>D: same key seen? return that payment
  A->>D: insert payment INITIATED for the order's stored total
  A->>P: initiate(reference = idempotencyKey)
  A->>D: payment PENDING + transaction INITIATION
  A-->>C: Payment PENDING
  P->>U: approval prompt (PIN)
  loop until final or expired
    C->>A: payment(id)
  end
  P-)A: webhook
  A->>D: store webhook event (unique: replays stop here)
  A->>P: getStatus(providerReference)
  A->>D: one transaction: payment SUCCEEDED, order PAID, subscription ACTIVE, stock committed
  A-)C: notification
```

Rules:

1. The amount is read from the order row. The client supplies no amount.
2. A payment becomes `SUCCEEDED` only from `getStatus`, reached by webhook, by polling or by reconciliation.
   The webhook body is a trigger to go and check, not evidence.
3. Applying a final status and its consequences (order paid, subscription activated, stock committed, credit
   redeemed) is one database transaction guarded by the payment lifecycle, so applying the same result twice
   changes nothing.
4. Every provider interaction appends a `payment_transactions` row.
5. Failure messages shown to customers are our own translated text per failure code.

## 4.3 Reconciliation

A job looks for payments still `INITIATED` or `PENDING` past a short grace period (there is a partial index
for exactly this), asks the provider for each one's status and applies it. Payments past their expiry with
no answer become `EXPIRED` and release reserved stock. Staff can trigger the same check for one payment
(`adminReconcilePayment`); there is no operation that sets a payment's status by hand.

## 4.4 Recurring billing with mobile money

Mobile money collections are approved by the customer on their phone each time. Bambino holds no credential
that allows charging a wallet silently, so "renewal" means:

1. A reminder notification before the period ends.
2. On the billing date, a renewal order is created and a collection request is sent to the saved wallet.
3. Approved: the period advances. Declined or unanswered: the subscription becomes `PAST_DUE`, with retries
   on a configurable schedule and a "pay now" action in the app, then `EXPIRED`.

The subscription lifecycle and the renewal job are provider-independent, so a provider offering pre-approved
debits, or cards, changes only the provider implementation.

## 4.4a Pay on delivery (cash)

Status: implemented. `CASH_ON_DELIVERY` is a payment provider code with **no provider behind it**: the courier collects
the money, and delivery completes the payment.

```mermaid
stateDiagram-v2
  [*] --> PENDING_PAYMENT: createOrder
  PENDING_PAYMENT --> CONFIRMED: confirmCashOnDelivery
  PENDING_PAYMENT --> PAID: online payment succeeds
  CONFIRMED --> PROCESSING: warehouse steps, as for a paid order
  PROCESSING --> DELIVERED: delivery completes
  CONFIRMED --> CANCELLED: customer or staff (no refund: nothing was paid)
```

1. The customer picks "Pay on delivery" on the order page. `confirmCashOnDelivery(orderId, idempotencyKey)` runs in
   one transaction: the order moves `PENDING_PAYMENT` to `CONFIRMED`, a `CASH_ON_DELIVERY` payment is created
   `PENDING` for the order's stored total, stock is committed, the delivery is created and the customer is told.
2. `CONFIRMED` means "accepted, money due on delivery". `PAID` keeps meaning "money received", so revenue figures
   built on payments stay correct.
3. When the delivery is marked `DELIVERED`, the `delivered` hook succeeds the payment and sets `orders.paid_at`
   (`PaymentService.collectCashOnDelivery`). The payment log records it as a `MANUAL_ADJUSTMENT`.
4. Cancelling a `CONFIRMED` (or later, not yet delivered) cash order restocks it, returns credit and any coupon, and
   closes the pending payment as `CANCELLED`. No refund is requested, because no money was taken.
5. Reconciliation ignores cash payments (there is no provider to ask), and the unpaid-order cleanup only looks at
   `PENDING_PAYMENT`, so a confirmed cash order is never cancelled for being "unpaid".
6. Eligibility is `CASH_ON_DELIVERY_POLICY` (packages/config): shop orders only, with no limit on the total at present (a limit can be set in the policy; the checkout, the
   rule and the wording follow it). Subscription
   orders keep requiring a wallet that can be charged again. The same rule is shown at checkout
   (`checkoutPreview.cashOnDelivery`, `Order.cashOnDelivery`) and enforced again on confirmation.

Known limits, listed in open question 15: a refund of cash already collected is done in person and cannot be requested
online (`CASH_REFUND_MANUAL`); there is no record of the amount the courier handed over, or of change; a failed
delivery leaves the payment pending for the next attempt.

## 4.5 Provider notes to verify at integration time

|                          | MTN MoMo (Collections)                                                                           | Airtel Money (Collections)                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Expected model           | Request-to-pay with a caller-supplied UUID reference; status by reference; optional callback URL | Payment request with OAuth client credentials; status enquiry; callback |
| Our reference            | `payments.idempotency_key`                                                                       | `payments.idempotency_key`                                              |
| Needed from the business | Merchant account, API user and key, subscription key, sandbox access                             | Merchant account, client id and secret, sandbox access                  |

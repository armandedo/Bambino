import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PaymentProviderCode } from '@bambino/types';
import type { Money } from '@bambino/utils';

export interface InitiatePaymentRequest {
  /** Our payment's idempotency key; the provider treats a repeat as the same request. */
  reference: string;
  amount: Money;
  payerMsisdn: string;
  description: string;
}

export type ProviderPaymentStatus =
  /** `unknown`: the provider has no such request (it never arrived), which is different from one still waiting. */
  | { status: 'PENDING'; unknown?: boolean }
  | { status: 'SUCCEEDED' }
  | { status: 'FAILED'; failureCode: string };

export interface RefundRequest {
  /** Our refund's idempotency key; the provider treats a repeat as the same refund. */
  reference: string;
  /** The provider's reference for the payment being refunded. */
  paymentProviderReference: string;
  amount: Money;
}

export interface ParsedWebhook {
  eventId: string;
  providerReference: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
}

/**
 * A provider marks an error `notSent` only when the request certainly did not reach it or was refused outright
 * (sign-in failed before anything was sent, or a 4xx answer). Everything else, such as a timeout, a dropped
 * connection, a lost response or a 5xx, is ambiguous: the request may exist and the customer may approve it.
 */
export function requestNeverSent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { notSent?: unknown }).notSent === true;
}

/** One mobile-money or card provider. See docs/04-payments.md. */
export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  initiate(request: InitiatePaymentRequest): Promise<{ providerReference: string; expiresAt: Date | null }>;
  /**
   * The provider's own answer: the only source of a final status. When `expected` is given and the provider reports
   * what it collected, a different amount is refused (thrown) instead of being reported as a success.
   */
  getStatus(providerReference: string, expected?: Money): Promise<ProviderPaymentStatus>;
  /**
   * For providers whose reference is derived from ours: the provider reference a request with this `reference`
   * would have. Lets a request that was sent but never recorded (the process stopped mid-call) be found again.
   */
  referenceFor?(reference: string): string;
  parseWebhook(headers: Headers, body: string): ParsedWebhook;
  /**
   * Asks the provider to send money back. Accepted, not finished: the outcome arrives by webhook or by
   * `getRefundStatus`. Repeating the same `reference` must not pay out twice.
   */
  refund(request: RefundRequest): Promise<{ providerReference: string }>;
  getRefundStatus(providerReference: string): Promise<ProviderPaymentStatus>;
}

/** Wallet numbers that make the mock behave a particular way, so every path can be exercised. */
export const MOCK_WALLETS = {
  approves: '+250780000001',
  declines: '+250780000002',
  neverAnswers: '+250780000003',
} as const;

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/**
 * MOCKED provider for development and tests. Outcome is decided by the wallet number:
 * the `declines` number fails, `neverAnswers` stays pending, anything else succeeds on the
 * first status check. The outcome travels in the reference it hands back, so it holds no state: any instance
 * (another Cloudflare isolate, a restarted server) gives the same answer for the same reference.
 * Refunds are accepted and succeed when next checked. Webhooks (payments and refunds alike) are signed with
 * HMAC-SHA256 of the raw body. Refused in production by configuration.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'MOCK' as const;

  constructor(
    /** Null: mock payments work, but mock webhooks are refused (nothing could verify them). */
    private readonly webhookSecret: string | null,
    private readonly expiryMinutes: number,
    private readonly now: () => Date,
  ) {}

  async initiate(request: InitiatePaymentRequest) {
    const outcome =
      request.payerMsisdn === MOCK_WALLETS.declines
        ? 'declined'
        : request.payerMsisdn === MOCK_WALLETS.neverAnswers
          ? 'waiting'
          : 'approved';
    return {
      providerReference: `mock-${outcome}-${randomUUID()}`,
      expiresAt: new Date(this.now().getTime() + this.expiryMinutes * 60_000),
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    if (providerReference.startsWith('mock-approved-')) return { status: 'SUCCEEDED' };
    if (providerReference.startsWith('mock-declined-')) return { status: 'FAILED', failureCode: 'DECLINED' };
    if (providerReference.startsWith('mock-waiting-')) return { status: 'PENDING' };
    return { status: 'PENDING', unknown: true };
  }

  /** Refunds are accepted and succeed on the first status check (or webhook), like an approving wallet. */
  async refund(request: RefundRequest) {
    // Derived from our reference, so a repeated request is the same refund on any instance.
    const id = createHash('sha256').update(request.reference).digest('hex').slice(0, 32);
    return { providerReference: `mock-refund-${id}` };
  }

  async getRefundStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    return providerReference.startsWith('mock-refund-') ? { status: 'SUCCEEDED' } : { status: 'PENDING' };
  }

  parseWebhook(headers: Headers, body: string): ParsedWebhook {
    if (!this.webhookSecret) throw new Error('Mock webhooks need MOCK_PAYMENT_WEBHOOK_SECRET');
    const payload = JSON.parse(body) as { eventId?: unknown; reference?: unknown };
    if (typeof payload.eventId !== 'string' || typeof payload.reference !== 'string') {
      throw new Error('Malformed mock webhook');
    }
    const expected = this.sign(body);
    const presented = headers.get(MOCK_SIGNATURE_HEADER) ?? '';
    const signatureValid =
      presented.length === expected.length && timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
    return { eventId: payload.eventId, providerReference: payload.reference, signatureValid, payload };
  }

  /** Test and development helper: what the provider would send. */
  sign(body: string): string {
    if (!this.webhookSecret) throw new Error('Mock webhooks need MOCK_PAYMENT_WEBHOOK_SECRET');
    return createHmac('sha256', this.webhookSecret).update(body).digest('hex');
  }
}

export type PaymentProviderRegistry = ReadonlyMap<PaymentProviderCode, PaymentProvider>;

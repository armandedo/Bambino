import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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
  { status: 'PENDING' } | { status: 'SUCCEEDED' } | { status: 'FAILED'; failureCode: string };

export interface ParsedWebhook {
  eventId: string;
  providerReference: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
}

/** One mobile-money or card provider. See docs/04-payments.md. */
export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  initiate(request: InitiatePaymentRequest): Promise<{ providerReference: string; expiresAt: Date | null }>;
  /** The provider's own answer: the only source of a final status. */
  getStatus(providerReference: string): Promise<ProviderPaymentStatus>;
  parseWebhook(headers: Headers, body: string): ParsedWebhook;
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
 * first status check. State lives in memory, so it is lost on restart (payments then expire).
 * Webhooks are signed with HMAC-SHA256 of the raw body. Refused in production by configuration.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'MOCK' as const;
  private readonly requests = new Map<string, { msisdn: string; amount: Money }>();

  constructor(
    private readonly webhookSecret: string,
    private readonly expiryMinutes: number,
    private readonly now: () => Date,
  ) {}

  async initiate(request: InitiatePaymentRequest) {
    const providerReference = `mock-${randomUUID()}`;
    this.requests.set(providerReference, { msisdn: request.payerMsisdn, amount: request.amount });
    return { providerReference, expiresAt: new Date(this.now().getTime() + this.expiryMinutes * 60_000) };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const request = this.requests.get(providerReference);
    if (!request) return { status: 'PENDING' };
    if (request.msisdn === MOCK_WALLETS.declines) return { status: 'FAILED', failureCode: 'DECLINED' };
    if (request.msisdn === MOCK_WALLETS.neverAnswers) return { status: 'PENDING' };
    return { status: 'SUCCEEDED' };
  }

  parseWebhook(headers: Headers, body: string): ParsedWebhook {
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
    return createHmac('sha256', this.webhookSecret).update(body).digest('hex');
  }
}

export type PaymentProviderRegistry = ReadonlyMap<PaymentProviderCode, PaymentProvider>;

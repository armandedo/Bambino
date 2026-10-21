import { createHash } from 'node:crypto';
import type {
  InitiatePaymentRequest,
  ParsedWebhook,
  PaymentProvider,
  ProviderPaymentStatus,
  RefundRequest,
} from './payments';

/** One MTN MoMo product (Collection takes money in, Disbursement sends refunds out) with its own credentials. */
export interface MomoProductCredentials {
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
}

export interface MtnMomoConfig {
  /** `https://sandbox.momodeveloper.mtn.com` for the sandbox; the live host MTN gives you for production. */
  baseUrl: string;
  /** `sandbox` while testing; the production target name MTN assigns (for Rwanda `mtnrwanda`). */
  targetEnvironment: string;
  /** The sandbox only accepts EUR; production uses the market currency (RWF). */
  currency: string;
  collection: MomoProductCredentials;
  /** Optional: without it refunds are refused rather than silently skipped. */
  disbursement?: MomoProductCredentials;
  expiryMinutes: number;
}

type Product = 'collection' | 'disbursement';

interface Deps {
  config: MtnMomoConfig;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** MTN accepts the payer as digits only, with the country code and no plus sign. */
export function momoPartyId(msisdn: string): string {
  return msisdn.replace(/[^0-9]/g, '');
}

/**
 * MTN identifies a request by a UUID we choose (X-Reference-Id) and answers 409 when it has seen it before, which
 * is what makes a repeat safe. Our references are not UUIDs, so one is derived from the reference: the same
 * reference always gives the same UUID.
 */
export function referenceToUuid(reference: string): string {
  const hex = createHash('sha256').update(`bambino:${reference}`).digest('hex');
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export class MomoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MomoError';
  }
}

/**
 * MTN Mobile Money (MoMo Open API). Collections: `requesttopay` asks the customer's wallet for the money and the
 * customer approves with their PIN. The status is read by polling the request, which is the only source of truth we
 * use: MTN's callbacks are not signed, so webhooks are not accepted (`parseWebhook` refuses them) and the
 * reconciliation job plus the customer's own status checks do the work. Refunds go through Disbursement.
 */
export class MtnMomoProvider implements PaymentProvider {
  readonly code = 'MTN_MOMO' as const;
  private readonly http: typeof fetch;
  private readonly now: () => Date;
  private readonly tokens = new Map<Product, { value: string; expiresAt: number }>();

  constructor(private readonly deps: Deps) {
    this.http = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
  }

  async initiate(request: InitiatePaymentRequest) {
    const id = referenceToUuid(request.reference);
    const { config } = this.deps;
    const response = await this.call('collection', 'POST', '/collection/v1_0/requesttopay', {
      referenceId: id,
      body: {
        amount: String(request.amount.amount),
        currency: config.currency,
        externalId: request.reference.slice(0, 60),
        payer: { partyIdType: 'MSISDN', partyId: momoPartyId(request.payerMsisdn) },
        payerMessage: request.description.slice(0, 160),
        payeeNote: request.description.slice(0, 160),
      },
    });
    // 202 accepted; 409 means this reference was already sent, which is the same request.
    if (response.status !== 202 && response.status !== 409) {
      throw new MomoError(`MTN MoMo refused the payment request (${response.status})`, response.status);
    }
    return {
      providerReference: id,
      expiresAt: new Date(this.now().getTime() + config.expiryMinutes * 60_000),
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    return this.readStatus('collection', `/collection/v1_0/requesttopay/${providerReference}`);
  }

  async refund(request: RefundRequest) {
    const { config } = this.deps;
    if (!config.disbursement) throw new MomoError('Refunds through MTN MoMo are not configured', 501);
    const id = referenceToUuid(`refund:${request.reference}`);
    const response = await this.call('disbursement', 'POST', '/disbursement/v2_0/refund', {
      referenceId: id,
      body: {
        amount: String(request.amount.amount),
        currency: config.currency,
        externalId: request.reference.slice(0, 60),
        payerMessage: 'Bambino refund',
        payeeNote: 'Bambino refund',
        referenceIdToRefund: request.paymentProviderReference,
      },
    });
    if (response.status !== 202 && response.status !== 409) {
      throw new MomoError(`MTN MoMo refused the refund (${response.status})`, response.status);
    }
    return { providerReference: id };
  }

  async getRefundStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    return this.readStatus('disbursement', `/disbursement/v2_0/refund/${providerReference}`);
  }

  /** MTN's callbacks carry no signature, so none is trusted: status always comes from asking MTN directly. */
  parseWebhook(_headers: Headers, _body: string): ParsedWebhook {
    throw new Error('MTN MoMo webhooks are not accepted; payment status is polled');
  }

  private async readStatus(product: Product, path: string): Promise<ProviderPaymentStatus> {
    const response = await this.call(product, 'GET', path);
    // An unknown or not-yet-visible request is still pending as far as we know; reconciliation will expire it.
    if (response.status === 404) return { status: 'PENDING' };
    if (!response.ok)
      throw new MomoError(`MTN MoMo status check failed (${response.status})`, response.status);
    const body = (await response.json()) as { status?: string; reason?: string | { code?: string } };
    switch (body.status) {
      case 'SUCCESSFUL':
        return { status: 'SUCCEEDED' };
      case 'FAILED': {
        const reason = typeof body.reason === 'string' ? body.reason : (body.reason?.code ?? 'FAILED');
        return { status: 'FAILED', failureCode: reason };
      }
      default:
        return { status: 'PENDING' };
    }
  }

  private async call(
    product: Product,
    method: 'GET' | 'POST',
    path: string,
    options: { referenceId?: string; body?: unknown } = {},
  ): Promise<Response> {
    const { config } = this.deps;
    const credentials = config[product];
    if (!credentials) throw new MomoError(`MTN MoMo ${product} is not configured`, 501);
    const token = await this.token(product, credentials);
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'x-target-environment': config.targetEnvironment,
      'ocp-apim-subscription-key': credentials.subscriptionKey,
    };
    if (options.referenceId) headers['x-reference-id'] = options.referenceId;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const response = await this.http(`${config.baseUrl}${path}`, init);
    // The cached token may have been revoked early: fetch a new one and try once more.
    if (response.status === 401) {
      this.tokens.delete(product);
      const fresh = await this.token(product, credentials);
      return this.http(`${config.baseUrl}${path}`, {
        ...init,
        headers: { ...headers, authorization: `Bearer ${fresh}` },
      });
    }
    return response;
  }

  private async token(product: Product, credentials: MomoProductCredentials): Promise<string> {
    const cached = this.tokens.get(product);
    if (cached && cached.expiresAt > this.now().getTime()) return cached.value;
    const basic = btoa(`${credentials.apiUser}:${credentials.apiKey}`);
    const response = await this.http(`${this.deps.config.baseUrl}/${product}/token/`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'ocp-apim-subscription-key': credentials.subscriptionKey },
    });
    if (!response.ok) throw new MomoError(`MTN MoMo sign-in failed (${response.status})`, response.status);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new MomoError('MTN MoMo sign-in returned no token', 502);
    // Renew a minute early so a token never expires mid-request.
    const lifetimeMs = Math.max(((body.expires_in ?? 3600) - 60) * 1000, 0);
    this.tokens.set(product, { value: body.access_token, expiresAt: this.now().getTime() + lifetimeMs });
    return body.access_token;
  }
}

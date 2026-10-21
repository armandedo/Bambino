import { money } from '@bambino/utils';
import { describe, expect, it } from 'vitest';
import { MtnMomoProvider, momoPartyId, referenceToUuid } from './mtn-momo';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A scripted MTN: answers by path prefix (longest first), records every call. */
function fakeMtn(handlers: Record<string, () => Response>) {
  const calls: Call[] = [];
  const keys = Object.keys(handlers).sort((a, b) => b.length - a.length);
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = keys.find((entry) => path.startsWith(entry));
    return key ? (handlers[key]?.() ?? new Response('', { status: 500 })) : new Response('', { status: 404 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const token = () => Response.json({ access_token: 'tok', expires_in: 3600 });
const credentials = { subscriptionKey: 'sub', apiUser: 'user', apiKey: 'key' };
const accepted = () => new Response('', { status: 202 });

function setup(handlers: Record<string, () => Response>, withDisbursement = false) {
  const { calls, fetchFn } = fakeMtn({
    '/collection/token': token,
    '/disbursement/token': token,
    ...handlers,
  });
  let clock = new Date('2026-10-21T10:00:00Z');
  return {
    calls,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    provider: new MtnMomoProvider({
      fetch: fetchFn,
      now: () => clock,
      config: {
        baseUrl: 'https://mtn.test',
        targetEnvironment: 'sandbox',
        currency: 'EUR',
        collection: credentials,
        ...(withDisbursement ? { disbursement: credentials } : {}),
        expiryMinutes: 10,
      },
    }),
  };
}

const request = (reference: string) => ({
  reference,
  amount: money(19_000, 'RWF'),
  payerMsisdn: '+250780000001',
  description: 'Bambino order BMB-1',
});

describe('MTN MoMo helpers', () => {
  it('sends the payer as digits only', () => {
    expect(momoPartyId('+250 78 000 0001')).toBe('250780000001');
  });

  it('derives a stable, valid UUID from our reference', () => {
    const a = referenceToUuid('door:abc:1');
    expect(a).toBe(referenceToUuid('door:abc:1'));
    expect(a).not.toBe(referenceToUuid('door:abc:2'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('MtnMomoProvider payments', () => {
  it("asks the payer's wallet for the amount and uses our derived id as the provider reference", async () => {
    const t = setup({ '/collection/v1_0/requesttopay': accepted });
    const result = await t.provider.initiate(request('pay-1'));
    expect(result.providerReference).toBe(referenceToUuid('pay-1'));
    expect(result.expiresAt?.toISOString()).toBe('2026-10-21T10:10:00.000Z');

    const call = t.calls.find((c) => c.url.endsWith('/requesttopay'));
    expect(call?.method).toBe('POST');
    expect(call?.headers['x-reference-id']).toBe(referenceToUuid('pay-1'));
    expect(call?.headers['x-target-environment']).toBe('sandbox');
    expect(call?.headers['ocp-apim-subscription-key']).toBe('sub');
    expect(call?.headers.authorization).toBe('Bearer tok');
    expect(call?.body).toMatchObject({
      amount: '19000',
      currency: 'EUR',
      payer: { partyIdType: 'MSISDN', partyId: '250780000001' },
    });
  });

  it('signs in with the API user and key, and reuses the token until it is nearly expired', async () => {
    const t = setup({ '/collection/v1_0/requesttopay': accepted });
    await t.provider.initiate(request('a'));
    await t.provider.initiate(request('b'));
    const signIns = () => t.calls.filter((c) => c.url.endsWith('/collection/token/'));
    expect(signIns()).toHaveLength(1);
    expect(signIns()[0]?.headers.authorization).toBe(`Basic ${btoa('user:key')}`);
    t.advance(3_600_000);
    await t.provider.initiate(request('c'));
    expect(signIns()).toHaveLength(2);
  });

  it('treats a repeated reference (409) as the same request, and refuses other failures', async () => {
    const dup = setup({ '/collection/v1_0/requesttopay': () => new Response('', { status: 409 }) });
    await expect(dup.provider.initiate(request('pay-1'))).resolves.toMatchObject({
      providerReference: referenceToUuid('pay-1'),
    });

    const bad = setup({ '/collection/v1_0/requesttopay': () => new Response('', { status: 500 }) });
    await expect(bad.provider.initiate(request('pay-2'))).rejects.toThrow(/refused the payment request/);
  });

  it('maps MTN statuses, and treats an unknown request as still pending', async () => {
    const reply = (body: unknown) => setup({ '/collection/v1_0/requesttopay/': () => Response.json(body) });
    expect(await reply({ status: 'PENDING' }).provider.getStatus('id')).toEqual({ status: 'PENDING' });
    expect(await reply({ status: 'SUCCESSFUL' }).provider.getStatus('id')).toEqual({ status: 'SUCCEEDED' });
    expect(await reply({ status: 'FAILED', reason: 'PAYER_NOT_FOUND' }).provider.getStatus('id')).toEqual({
      status: 'FAILED',
      failureCode: 'PAYER_NOT_FOUND',
    });
    expect(
      await reply({ status: 'FAILED', reason: { code: 'APPROVAL_REJECTED' } }).provider.getStatus('id'),
    ).toEqual({ status: 'FAILED', failureCode: 'APPROVAL_REJECTED' });
    const missing = setup({ '/collection/v1_0/requesttopay/': () => new Response('', { status: 404 }) });
    expect(await missing.provider.getStatus('id')).toEqual({ status: 'PENDING' });
    const broken = setup({ '/collection/v1_0/requesttopay/': () => new Response('', { status: 500 }) });
    await expect(broken.provider.getStatus('id')).rejects.toThrow(/status check failed/);
  });

  it('signs in again once when MTN rejects the cached token', async () => {
    let first = true;
    const t = setup({
      '/collection/v1_0/requesttopay/': () => {
        if (first) {
          first = false;
          return new Response('', { status: 401 });
        }
        return Response.json({ status: 'SUCCESSFUL' });
      },
    });
    expect(await t.provider.getStatus('id')).toEqual({ status: 'SUCCEEDED' });
    expect(t.calls.filter((c) => c.url.endsWith('/collection/token/'))).toHaveLength(2);
  });

  it('refuses webhooks: MTN callbacks are unsigned, so status is only ever polled', () => {
    const t = setup({});
    expect(() => t.provider.parseWebhook(new Headers(), '{}')).toThrow(/not accepted/);
  });
});

describe('MtnMomoProvider refunds', () => {
  it('refuses refunds when disbursement is not configured', async () => {
    const t = setup({});
    await expect(
      t.provider.refund({ reference: 'rf-1', paymentProviderReference: 'p', amount: money(1000, 'RWF') }),
    ).rejects.toThrow(/not configured/);
  });

  it('sends a refund of the original payment through disbursement and reads its status', async () => {
    const t = setup(
      {
        '/disbursement/v2_0/refund/': () => Response.json({ status: 'SUCCESSFUL' }),
        '/disbursement/v2_0/refund': accepted,
      },
      true,
    );
    const result = await t.provider.refund({
      reference: 'rf-1',
      paymentProviderReference: 'orig-id',
      amount: money(1000, 'RWF'),
    });
    expect(result.providerReference).toBe(referenceToUuid('refund:rf-1'));
    const call = t.calls.find((c) => c.url.endsWith('/refund'));
    expect(call?.headers['x-reference-id']).toBe(result.providerReference);
    expect(call?.body).toMatchObject({ amount: '1000', referenceIdToRefund: 'orig-id' });
    expect(await t.provider.getRefundStatus(result.providerReference)).toEqual({ status: 'SUCCEEDED' });
  });
});

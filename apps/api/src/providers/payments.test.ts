import { money } from '@bambino/utils';
import { describe, expect, it } from 'vitest';
import { MOCK_LATE_APPROVAL_MS, MOCK_WALLETS, MockPaymentProvider } from './payments';

const provider = () =>
  new MockPaymentProvider('a-test-webhook-secret', 10, () => new Date('2026-10-21T10:00:00Z'));
const request = (payerMsisdn: string) => ({
  reference: 'pay-1',
  amount: money(7_000, 'RWF'),
  payerMsisdn,
  description: 'Bambino order',
});

describe('MockPaymentProvider', () => {
  it('gives the same answer from any instance, as separate Cloudflare isolates must', async () => {
    const approved = await provider().initiate(request(MOCK_WALLETS.approves));
    const declined = await provider().initiate(request(MOCK_WALLETS.declines));
    const waiting = await provider().initiate(request(MOCK_WALLETS.neverAnswers));

    expect(await provider().getStatus(approved.providerReference)).toEqual({ status: 'SUCCEEDED' });
    expect(await provider().getStatus(declined.providerReference)).toEqual({
      status: 'FAILED',
      failureCode: 'DECLINED',
    });
    expect(await provider().getStatus(waiting.providerReference)).toEqual({ status: 'PENDING' });
    expect(await provider().getStatus('mock-unknown')).toEqual({ status: 'PENDING', unknown: true });
  });

  it('has a wallet that approves only after the request has expired', async () => {
    let clock = new Date('2026-10-21T10:00:00Z');
    const at = () => new MockPaymentProvider('a-test-webhook-secret', 10, () => clock);
    const started = await at().initiate(request(MOCK_WALLETS.approvesLate));
    expect(await at().getStatus(started.providerReference)).toEqual({ status: 'PENDING' });
    clock = started.expiresAt;
    expect(await at().getStatus(started.providerReference)).toEqual({ status: 'PENDING' });
    clock = new Date(started.expiresAt.getTime() + MOCK_LATE_APPROVAL_MS);
    expect(await at().getStatus(started.providerReference)).toEqual({ status: 'SUCCEEDED' });
  });

  it('treats a repeated refund request as the same refund on any instance', async () => {
    const refund = {
      reference: 'refund-1',
      paymentProviderReference: 'mock-approved-x',
      amount: money(7_000, 'RWF'),
    };
    const first = await provider().refund(refund);
    const second = await provider().refund(refund);
    expect(second.providerReference).toBe(first.providerReference);
    expect(await provider().getRefundStatus(first.providerReference)).toEqual({ status: 'SUCCEEDED' });
  });

  it('refuses every webhook when no secret was configured, while payments still work', async () => {
    const unsigned = new MockPaymentProvider(null, 10, () => new Date('2026-10-21T10:00:00Z'));
    const body = JSON.stringify({ eventId: 'evt-1', reference: 'mock-approved-x' });
    expect(() => unsigned.parseWebhook(new Headers({ 'x-mock-signature': '0'.repeat(64) }), body)).toThrow(
      /MOCK_PAYMENT_WEBHOOK_SECRET/,
    );
    const started = await unsigned.initiate(request(MOCK_WALLETS.approves));
    expect(await unsigned.getStatus(started.providerReference)).toEqual({ status: 'SUCCEEDED' });
  });

  it('accepts only webhooks signed with its secret', () => {
    const body = JSON.stringify({ eventId: 'evt-1', reference: 'mock-approved-x' });
    const signed = new Headers({ 'x-mock-signature': provider().sign(body) });
    expect(provider().parseWebhook(signed, body).signatureValid).toBe(true);
    expect(
      provider().parseWebhook(new Headers({ 'x-mock-signature': '0'.repeat(64) }), body).signatureValid,
    ).toBe(false);
    expect(provider().parseWebhook(new Headers(), body).signatureValid).toBe(false);
  });
});

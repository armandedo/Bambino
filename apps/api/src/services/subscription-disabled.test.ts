import { describe, expect, it, vi } from 'vitest';
import type { ServiceContext } from './context';
import { SubscriptionService, type SubscriptionServiceDependencies } from './subscription-service';

describe.each([false, undefined])('subscriptions disabled (enabled=%s)', (enabled) => {
  it('hides plans, blocks activation paths, and skips renewals without using storage or payments', async () => {
    const dependencyAccess = vi.fn((_target: object, key: string | symbol): unknown => {
      if (key === 'enabled') return enabled;
      if (key === 'now') return () => new Date('2026-11-03T12:00:00Z');
      // runRenewals destructures db before checking the flag, but must never use it.
      if (key === 'db') return {};
      throw new Error(`Disabled subscriptions accessed ${String(key)}`);
    });
    const service = new SubscriptionService(
      new Proxy<SubscriptionServiceDependencies>({} as SubscriptionServiceDependencies, {
        get: dependencyAccess,
      }),
    );
    const context: ServiceContext = {
      actor: { kind: 'user', userId: 'test-user', sessionId: 'test-session', permissions: new Set() },
      meta: { requestId: 'test-request', ipAddress: null, userAgent: null },
    };

    expect(await service.listPlans()).toEqual([]);
    for (const action of [
      () => service.create(context, {}),
      () => service.resume(context, 'test-subscription'),
      () => service.changePlan(context, 'test-subscription', 'test-plan'),
      () => service.selectItems(context, 'test-subscription', []),
    ]) {
      await expect(action()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        reason: 'SUBSCRIPTIONS_DISABLED',
      });
    }
    expect(await service.runRenewals()).toEqual({
      renewalsCreated: 0,
      expired: 0,
      cancelled: 0,
      resumed: 0,
      reminded: 0,
    });
  });
});

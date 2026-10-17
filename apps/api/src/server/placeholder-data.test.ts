import { afterEach, describe, expect, it } from 'vitest';
import { findPlaceholderData } from '../domain/placeholder-data';
import { createTestApp } from '../testing/test-app';

const apps: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()?.close();
});
async function build(options: Parameters<typeof createTestApp>[0] = {}) {
  const t = await createTestApp(options);
  apps.push(t);
  return t;
}

// Each test builds its own in-process database, which takes several seconds, hence the longer limit.
describe('placeholder data guard', { timeout: 90_000 }, () => {
  it('finds nothing in a database that holds only roles and permissions', async () => {
    const t = await build();
    expect(await findPlaceholderData(t.db)).toEqual([]);
  });

  it('finds the labelled development catalogue, plans, delivery options and sizes', async () => {
    const t = await build({ catalogue: true });
    const findings = await findPlaceholderData(t.db, 100);
    const tables = new Set(findings.map((finding) => finding.table));
    for (const table of ['products', 'product_variants', 'delivery_options', 'subscription_plans', 'sizes']) {
      expect(tables.has(table), `${table} should be flagged`).toBe(true);
    }
  });

  it('flags a seed account, because its password is known in development', async () => {
    const t = await build();
    await t.registerCustomer();
    const findings = await findPlaceholderData(t.db);
    expect(findings.some((finding) => finding.table === 'users')).toBe(true);
  });

  it('keeps production ready when the database is clean', async () => {
    const t = await build({ nodeEnv: 'production' });
    expect(await t.app.checkReady()).toEqual({ status: 200, body: { status: 'ready', database: 'ok' } });
  });

  it('makes production report not ready when demo data is present, and says why', async () => {
    const t = await build({ nodeEnv: 'production', catalogue: true });
    expect(await t.app.checkReady()).toEqual({
      status: 503,
      body: { status: 'unavailable', reason: 'placeholder_data' },
    });
  });

  it('does not apply outside production, where demo data is expected', async () => {
    const t = await build({ catalogue: true });
    expect(await t.app.checkReady()).toEqual({ status: 200, body: { status: 'ready', database: 'ok' } });
  });
});

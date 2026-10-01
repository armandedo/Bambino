import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../support/a11y';
import { staffApi } from '../support/api';
import { apiCustomer, subscriberWithDeliveredGarments } from '../support/setup';

const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001/admin';

/**
 * Journey C (docs/07): staff receive a return → inspect each garment → set its condition → the garment is
 * available for reuse, with its full history. Every staff step is done in the admin dashboard.
 * Setup (a family holding two delivered garments who asked for a pickup) goes through the API.
 */
test('journey C: staff receive and inspect a return, and the garment goes back into circulation', async ({
  page,
}) => {
  const staff = await staffApi();
  const customer = await apiCustomer('journey-c');
  try {
    const { garments, addressId, returnNumber } =
      await test.step('setup: family holds two garments and requests a return', async () => {
        const held = await subscriberWithDeliveredGarments(customer.gql, staff);
        const requested = await customer.gql<{ requestReturn: { returnNumber: string } }>(
          'mutation ($input: RequestReturnInput!) { requestReturn(input: $input) { returnNumber } }',
          {
            input: {
              reason: 'OUTGROWN',
              pickupAddressId: held.addressId,
              items: held.garments.map((g) => ({ garmentId: g.id, reportedFit: 'TOO_SMALL' })),
            },
          },
        );
        return { ...held, returnNumber: requested.requestReturn.returnNumber };
      });
    expect(addressId).toBeTruthy();
    const [reusable, worn] = garments;
    if (!reusable || !worn) throw new Error('expected two garments');
    // Reservation prefers reused garments, so this one may already have completed cycles in earlier runs.
    const cyclesBefore = (
      await staff.call<{ adminGarment: { lifecycleCount: number } }>(
        'query ($tag: String) { adminGarment(tagCode: $tag) { lifecycleCount } }',
        { tag: reusable.tagCode },
      )
    ).adminGarment.lifecycleCount;

    await test.step('staff sign in to the admin dashboard', async () => {
      await page.goto(`${ADMIN_URL}/login?next=/returns`);
      // Wait until the form is interactive (a dev server compiles each page on first visit).
      await page.waitForLoadState('networkidle');
      await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL ?? 'admin@seed.test');
      await page
        .getByLabel('Password')
        .fill(process.env.E2E_STAFF_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? '');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { name: 'Returns & inspection', level: 1 })).toBeVisible({
        timeout: 60_000,
      });
    });

    await test.step('open the requested return and approve it', async () => {
      await page.getByLabel('Status').selectOption('REQUESTED');
      await page.getByRole('link', { name: returnNumber }).click();
      // Generous: a dev server compiles the page on its first visit.
      await expect(page.getByText(reusable.tagCode)).toBeVisible({ timeout: 60_000 });
      await expectNoA11yViolations(page);
      await page.getByRole('button', { name: 'Approve return' }).click();
      await expect(page.getByText('Return approved')).toBeVisible();
    });

    await test.step('track the pickup until the pieces are received', async () => {
      const pickup = page.getByRole('region', { name: 'Pickup' });
      for (const step of ['Assign rider', 'Picked up', 'In transit', 'Collected and received']) {
        await pickup.getByRole('button', { name: step }).click();
        await expect(pickup.getByRole('button', { name: step })).toBeHidden();
      }
      await expect(page.getByText('Received', { exact: true }).first()).toBeVisible();
    });

    await test.step('inspect each garment: one back into circulation, one recycled', async () => {
      const first = page.getByRole('form', { name: `Inspect ${reusable.tagCode}` });
      await first.getByLabel('Condition').selectOption('EXCELLENT');
      await first.getByRole('radio', { name: /^Accept/ }).check();
      await first.getByLabel('Where it goes next').selectOption('AVAILABLE_FOR_REUSE');
      await first.getByRole('button', { name: 'Record inspection' }).click();
      await expect(page.getByText(`Inspection recorded for ${reusable.tagCode}`)).toBeVisible();

      const second = page.getByRole('form', { name: `Inspect ${worn.tagCode}` });
      await second.getByLabel('Condition').selectOption('DAMAGED');
      await second.getByRole('radio', { name: /^Reject/ }).check();
      await second.getByLabel('Where it goes next').selectOption('RECYCLE');
      await second.getByRole('button', { name: 'Record inspection' }).click();
      await expect(page.getByText(`Inspection recorded for ${worn.tagCode}`)).toBeVisible();

      await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Complete return' }).click();
      await expect(page.getByText('Return completed')).toBeVisible();
    });

    await test.step('the accepted garment is available for reuse, with its history', async () => {
      await page.getByRole('link', { name: reusable.tagCode }).click();
      await expect(page.getByRole('heading', { name: reusable.tagCode })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Available for reuse').first()).toBeVisible();
      const history = page.getByRole('table', { name: 'Lifecycle history' });
      for (const status of ['With customer', 'Returned', 'Inspection', 'Available for reuse']) {
        await expect(history.getByText(status, { exact: true }).first()).toBeVisible();
      }
      await expectNoA11yViolations(page);
    });

    await test.step('the next subscriber can be given the reused garment', async () => {
      const variant = await staff.call<{ adminGarment: { status: string; lifecycleCount: number } }>(
        'query ($tag: String) { adminGarment(tagCode: $tag) { status lifecycleCount } }',
        { tag: reusable.tagCode },
      );
      expect(variant.adminGarment).toEqual({
        status: 'AVAILABLE_FOR_REUSE',
        lifecycleCount: cyclesBefore + 1,
      });
    });
  } finally {
    await customer.dispose();
    await staff.dispose();
  }
});

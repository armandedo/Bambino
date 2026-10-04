import { expect, test } from '@playwright/test';
import { customerApi, staffApi } from '../support/api';
import { subscriberWithDeliveredGarments } from '../support/setup';
import { payWithApprovingTestWallet, registerThroughUi } from '../support/ui';

/**
 * Journey B (docs/07): a subscriber returns outgrown garments → approved → received → inspected → credit →
 * next size → replacement order.
 *
 * Setup (an active subscription whose first delivery has arrived) goes through the API, because journey A
 * already covers it in the UI. Every parent step is done in the website. Staff steps use the API as the
 * seeded admin until the admin dashboard exists (Phase 8).
 */
test('journey B: a subscriber returns outgrown pieces, earns credit and gets the next size', async ({
  page,
}) => {
  const staff = await staffApi();
  try {
    await registerThroughUi(page, 'journey-b', '/fit');
    const gql = customerApi(page);

    const { garments } = await test.step('setup: active subscription with two pieces delivered', () =>
      subscriberWithDeliveredGarments(gql, staff));

    await test.step('parent requests a return with pickup', async () => {
      await page.goto('/dashboard/exchange');
      const pieces = page.getByRole('group', { name: 'Pieces to return' });
      for (const garment of garments) await expect(pieces.getByText(`Tag ${garment.tagCode}`)).toBeVisible();
      for (const box of await pieces.getByRole('checkbox').all()) await box.check();
      await page.getByRole('button', { name: /Return 2 pieces/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Return pieces' });
      await dialog.getByRole('radio', { name: 'Outgrown' }).check();
      for (const select of await dialog.getByRole('combobox').all()) await select.selectOption('TOO_SMALL');
      await dialog.getByRole('button', { name: 'Request return' }).click();
      await expect(page.getByText('Return requested.')).toBeVisible();
      await expect(page.getByText('Requested', { exact: true }).first()).toBeVisible();
    });

    const returnRequest = await test.step('staff approve, collect and inspect the return', async () => {
      const { myReturns } = await gql<{
        myReturns: { id: string; pickup: { id: string }; items: { id: string }[] }[];
      }>('{ myReturns { id pickup { id } items { id } } }');
      const request = myReturns[0];
      if (!request) throw new Error('return not found');
      await staff.call('mutation ($id: ID!) { adminApproveReturn(id: $id) { status } }', { id: request.id });
      await staff.advanceDelivery(request.pickup.id, ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']);
      const [accepted, rejected] = request.items;
      const inspect =
        'mutation ($input: InspectionInput!) { adminRecordInspection(input: $input) { status } }';
      await staff.call(inspect, {
        input: {
          returnItemId: accepted?.id,
          condition: 'EXCELLENT',
          outcome: 'ACCEPTED',
          garmentStatus: 'AVAILABLE_FOR_REUSE',
        },
      });
      await staff.call(inspect, {
        input: {
          returnItemId: rejected?.id,
          condition: 'DAMAGED',
          outcome: 'REJECTED',
          garmentStatus: 'RECYCLE',
        },
      });
      return request;
    });

    await test.step('parent sees the inspection result and the credit earned', async () => {
      await page.reload();
      await expect(page.getByText(/\+ RF\s?[\d,]+ credit/)).toBeVisible();
      await expect(page.getByText('Not accepted')).toBeVisible();
      const creditTable = page.getByRole('table', { name: 'Credit history' });
      await expect(creditTable.getByRole('row', { name: /Earned/ })).toBeVisible();
    });

    const exchangeId = await test.step('parent chooses the next size', async () => {
      await page.getByRole('button', { name: 'Choose the next size' }).click();
      const dialog = page.getByRole('dialog', { name: 'Choose the next size' });
      // The next size up is preselected for the accepted piece.
      await expect(dialog.getByRole('combobox').first()).not.toHaveValue('');
      await dialog.getByRole('group', { name: 'Delivery', exact: true }).getByRole('radio').first().check();
      await dialog.getByRole('button', { name: 'Request exchange' }).click();
      await expect(page.getByText('Exchange requested.')).toBeVisible();
      await expect(page.getByText('Waiting for our team to approve.')).toBeVisible();
      const { myExchanges } = await gql<{ myExchanges: { id: string; returnRequest: { id: string } }[] }>(
        '{ myExchanges { id returnRequest { id } } }',
      );
      const exchange = myExchanges.find((e) => e.returnRequest.id === returnRequest.id);
      if (!exchange) throw new Error('exchange not found');
      return exchange.id;
    });

    await test.step('staff approve the exchange; the replacement order is paid or covered by credit', async () => {
      await staff.call('mutation ($id: ID!) { adminApproveExchange(id: $id) { status } }', {
        id: exchangeId,
      });
      await page.reload();
      // Either the replacement still needs a payment, or the credit covered it and it is already paid.
      const next = page.getByRole('link', { name: /^Pay the difference$|^Order / }).first();
      await expect(next).toBeVisible();
      if ((await next.textContent()) === 'Pay the difference') {
        await next.click();
        await payWithApprovingTestWallet(page);
        await expect(page.getByText('Payment received')).toBeVisible({ timeout: 60_000 });
      } else {
        await page
          .getByRole('link', { name: /^Order / })
          .first()
          .click();
      }
      await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await page.goto('/dashboard/exchange');
      const creditTable = page.getByRole('table', { name: 'Credit history' });
      await expect(creditTable.getByRole('row', { name: /Redeemed/ })).toBeVisible();
    });
  } finally {
    await staff.dispose();
  }
});

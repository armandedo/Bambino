import { type Page, expect } from '@playwright/test';
import { TEST_PASSWORD, testEmail } from './api';

/** Registers through the website's form and returns the email used. */
export async function registerThroughUi(page: Page, label: string, next = '/fit'): Promise<string> {
  const email = testEmail(label);
  await page.goto(`/register?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('First name').fill('Aline');
  await page.getByLabel('Last name').fill('Uwase');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByLabel('I accept the terms of service.').check();
  await page.getByLabel('I accept the privacy policy.').check();
  await page.getByLabel(/may store my baby’s age and measurements/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  // Generous: a dev server compiles each page on its first visit.
  await expect(page).toHaveURL(new RegExp(next.replace(/[/?]/g, '\\$&')), { timeout: 60_000 });
  return email;
}

/** Fills the Rwandan address form shown when the customer has no saved address. */
export async function addAddressThroughUi(page: Page) {
  const form = page.getByRole('form', { name: 'New address' });
  await form.getByLabel('Recipient name').fill('Aline Uwase');
  await form.getByLabel('Phone').fill('+250788123456');
  await form.getByLabel('Province').fill('Kigali City');
  await form.getByLabel('District').fill('Gasabo');
  await form.getByLabel('Sector').fill('Kimihurura');
  await form.getByRole('button', { name: 'Save address' }).click();
  await expect(form).toBeHidden();
}

/** Pays on the payment panel with the mock wallet that approves, and waits for the provider's confirmation. */
export async function payWithApprovingTestWallet(page: Page) {
  // The test-wallet provider is preselected in development builds; choose the number that approves.
  await page.getByRole('radio', { name: /\+250780000001/ }).check();
  await page.getByRole('button', { name: /^Pay / }).click();
}

/** A date of birth `months` months ago, as YYYY-MM-DD. */
export function birthDateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

/** Fails if the page is wider than the screen (content forcing sideways scrolling on phones). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page should not scroll sideways').toBeLessThanOrEqual(0);
}

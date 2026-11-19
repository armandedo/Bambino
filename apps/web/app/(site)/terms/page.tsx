import type { Metadata } from 'next';
import NextLink from 'next/link';
import { INFO_LINK, InfoPage } from '@/components/info-page';

export const metadata: Metadata = { title: 'Terms' };

/**
 * A plain summary of how buying works, limited to what the shop actually does. The full terms of service have
 * not been written yet (packages/config/src/legal.ts); they replace this page when they are.
 */
export default function TermsPage() {
  return (
    <InfoPage
      title="Terms"
      intro="A plain summary of how buying from Bambino works. The full terms of service are being finalised and will be published on this page."
      sections={[
        {
          heading: 'Prices',
          body: (
            <p>
              Prices are in Rwandan francs (RWF). Your bag is priced again each time you open it, and the
              total you pay, including delivery, is shown at checkout before you place the order.
            </p>
          ),
        },
        {
          heading: 'Buying',
          body: (
            <p>
              You need an account to add clothes to your bag and check out. An order is placed only when you
              confirm it at checkout.
            </p>
          ),
        },
        {
          heading: 'Delivery, cancelling and refunds',
          body: (
            <p>
              These are explained on{' '}
              <NextLink href="/delivery-returns" className={INFO_LINK}>
                Delivery and returns
              </NextLink>
              .
            </p>
          ),
        },
        {
          heading: 'Your data',
          body: (
            <p>
              What we keep and the choices you have are on the{' '}
              <NextLink href="/privacy" className={INFO_LINK}>
                Privacy
              </NextLink>{' '}
              page.
            </p>
          ),
        },
      ]}
    />
  );
}

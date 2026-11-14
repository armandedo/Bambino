import { PRIVACY_POLICY } from '@bambino/config';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { INFO_LINK, InfoPage } from '@/components/info-page';

export const metadata: Metadata = { title: 'Privacy' };

const SETTINGS = (
  <NextLink href="/account" className={INFO_LINK}>
    Account settings
  </NextLink>
);

/**
 * A plain summary of what the shop does with a customer's data, limited to what the product actually does.
 * The full policy text has not been written yet (packages/config/src/legal.ts); it replaces this page when it is.
 */
export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      intro="A plain summary of what Bambino keeps and the choices you have. The full privacy policy is being finalised and will be published on this page."
      sections={[
        {
          heading: 'What we keep',
          body: (
            <p>
              The details you give us when you create an account, the child sizes and measurements you choose
              to add, your delivery addresses and your orders.
            </p>
          ),
        },
        {
          heading: 'Favourites',
          body: <p>Favourites are saved on your own device. They are not stored in your account.</p>,
        },
        {
          heading: 'Getting a copy of your data',
          body: (
            <p>
              Ask for a copy from {SETTINGS}. When it is ready you can download it there for{' '}
              {PRIVACY_POLICY.exportRetentionDays} days.
            </p>
          ),
        },
        {
          heading: 'Deleting your account',
          body: (
            <p>
              Ask from {SETTINGS}. We carry out the request {PRIVACY_POLICY.deletionGraceDays} days later, so
              a request made by mistake can be noticed first.
            </p>
          ),
        },
      ]}
    />
  );
}

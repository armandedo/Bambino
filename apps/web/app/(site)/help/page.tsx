import type { Metadata } from 'next';
import NextLink from 'next/link';
import { INFO_LINK, InfoPage } from '@/components/info-page';

export const metadata: Metadata = { title: 'Help' };

const MOCK_PAYMENTS = process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true';

export default function HelpPage() {
  return (
    <InfoPage
      title="Help"
      intro="Short answers about sizes, buying, delivery and your orders."
      sections={[
        {
          heading: 'Which size should I choose?',
          body: (
            <>
              <p>
                Start with your child’s age, then check the sizes offered on the product. Ages are a guide:
                fit varies by brand and style.
              </p>
              <p>
                <NextLink href="/fit" className={INFO_LINK}>
                  Find their size
                </NextLink>
              </p>
            </>
          ),
        },
        {
          heading: 'Do I need an account to buy?',
          body: (
            <p>
              You can browse and save favourites without one. To add clothes to your bag and check out,{' '}
              <NextLink href="/login" className={INFO_LINK}>
                sign in
              </NextLink>{' '}
              or{' '}
              <NextLink href="/register" className={INFO_LINK}>
                create an account
              </NextLink>
              .
            </p>
          ),
        },
        {
          heading: 'How does delivery work?',
          body: (
            <>
              <p>
                Delivery options depend on your address. Add your delivery details at checkout to see the
                available service, fee and estimated timing before you place your order.
              </p>
              <p>
                <NextLink href="/delivery-returns" className={INFO_LINK}>
                  Delivery and returns
                </NextLink>
              </p>
            </>
          ),
        },
        {
          heading: 'How do I pay?',
          body: (
            <p>
              Your available payment options are shown at checkout. Review your order and delivery total
              before confirming.{MOCK_PAYMENTS ? ' This preview uses test wallets only.' : ''}
            </p>
          ),
        },
        {
          heading: 'Where is my order?',
          body: (
            <p>
              Sign in and open{' '}
              <NextLink href="/dashboard/orders" className={INFO_LINK}>
                Your orders
              </NextLink>{' '}
              to see each order and follow its delivery status.
            </p>
          ),
        },
        {
          heading: 'Where are my favourites kept?',
          body: (
            <p>
              Tap the heart on anything you like. Favourites are saved on the device you are using, so they do
              not follow you to another phone or computer.
            </p>
          ),
        },
      ]}
    />
  );
}

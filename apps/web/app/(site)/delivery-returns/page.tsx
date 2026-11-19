import type { Metadata } from 'next';
import NextLink from 'next/link';
import { INFO_LINK, InfoPage } from '@/components/info-page';

export const metadata: Metadata = { title: 'Delivery and returns' };

const ORDERS = (
  <NextLink href="/dashboard/orders" className={INFO_LINK}>
    Your orders
  </NextLink>
);

export default function DeliveryReturnsPage() {
  return (
    <InfoPage
      title="Delivery and returns"
      sections={[
        {
          heading: 'Delivery',
          body: (
            <p>
              Delivery availability, fees and estimated timing are shown at checkout for your address. Your
              order total includes the delivery option you choose, and you can review it before placing the
              order.
            </p>
          ),
        },
        {
          heading: 'Following your order',
          body: <p>Sign in and open {ORDERS} to see each order and follow its delivery status.</p>,
        },
        {
          heading: 'Cancelling an order',
          body: (
            <p>
              You can cancel a paid order, or a confirmed pay-on-delivery order, until we start preparing it.
              Open the order in {ORDERS} and choose “Cancel this order”.
            </p>
          ),
        },
        {
          heading: 'Refunds',
          body: (
            <p>
              When you cancel an order you have already paid for, our team reviews the refund and sends it to
              the mobile money wallet that paid. You can follow the refund on the order’s page.
            </p>
          ),
        },
        {
          heading: 'Returns after delivery',
          body: (
            <p>
              Our returns policy for delivered orders is being finalised and will be published on this page.
            </p>
          ),
        },
      ]}
    />
  );
}

'use client';

import { CancelOrderMutation, type OrderDetail } from '@bambino/api-client';
import { Alert, Button, Card, CardHeader, Modal, MoneyText, StatusBadge, humanizeStatus } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { TotalsTable, formatAddress } from '@/components/checkout-parts';
import { DeliveryProgress } from '@/components/delivery-progress';
import { PaymentPanel } from '@/components/payment-panel';
import { QueryState } from '@/components/query-state';
import { api } from '@/lib/browser-api';
import { errorMessage, formatDate } from '@/lib/messages';
import { keys, useOrder } from '@/lib/queries';
import { PageTitle } from '../../account-nav';

function Timeline({ order }: { order: OrderDetail }) {
  const events = [
    ...order.statusHistory.map((e) => ({
      at: e.occurredAt,
      text: humanizeStatus(e.status),
      note: null as string | null,
    })),
    ...(order.delivery?.events ?? []).map((e) => ({
      at: e.occurredAt,
      text: `Delivery: ${humanizeStatus(e.status).toLowerCase()}`,
      note: e.note,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-surface bg-primary"
          />
          <p className="font-medium">{event.text}</p>
          <p className="text-sm text-foreground-muted">
            {formatDate(event.at, true)}
            {event.note ? ` · ${event.note}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Where a refund is, in the parent's words. */
function refundText(refund: OrderDetail['refunds'][number]): string {
  switch (refund.status) {
    case 'REQUESTED':
      return `Requested ${formatDate(refund.requestedAt)}. Our team will review it.`;
    case 'APPROVED':
    case 'PROCESSING':
      return 'Approved. The money is on its way.';
    case 'SUCCEEDED':
      return `Paid ${refund.completedAt ? formatDate(refund.completedAt) : ''}.`;
    case 'REJECTED':
      return 'Not approved. Please contact us if you have questions.';
    case 'FAILED':
      return 'The payment provider could not send it. Our team will follow up.';
  }
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const placed = useSearchParams().get('placed') === '1';
  const order = useOrder(id);
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The payment card disappears once the order is paid, so confirm the payment explicitly.
  const [justPaid, setJustPaid] = useState(false);
  const cancel = useMutation({
    mutationFn: async () => (await api.request(CancelOrderMutation, { id })).cancelOrder,
    onSuccess: (next) => {
      queryClient.setQueryData(keys.order(id), next);
      void queryClient.invalidateQueries({ queryKey: keys.orders });
      setConfirmCancel(false);
    },
  });
  const onPaid = useCallback(() => {
    setJustPaid(true);
    void queryClient.invalidateQueries({ queryKey: keys.order(id) });
    void queryClient.invalidateQueries({ queryKey: keys.orders });
    void queryClient.invalidateQueries({ queryKey: keys.subscriptions });
  }, [queryClient, id]);

  return (
    <QueryState query={order} what="this order">
      {(data) =>
        !data ? (
          <Alert tone="warning" title="Order not found">
            It may belong to another account.
          </Alert>
        ) : (
          <>
            <PageTitle
              title={`Order ${data.orderNumber}`}
              description={`Placed ${formatDate(data.placedAt, true)}`}
              action={<StatusBadge status={data.status} />}
            />
            {justPaid && data.status !== 'PENDING_PAYMENT' ? (
              <Alert tone="success" title="Payment received" live>
                Thank you. Your order is confirmed and we’ll let you know when it is on its way.
              </Alert>
            ) : placed && data.status !== 'PENDING_PAYMENT' ? (
              <Alert tone="success" title="Thank you, your order is confirmed" live>
                We’ll let you know when it is on its way.
              </Alert>
            ) : null}

            {data.status === 'PENDING_PAYMENT' ? (
              <Card as="section" aria-labelledby="pay" className="flex flex-col gap-4">
                <CardHeader
                  title={<span id="pay">Payment needed</span>}
                  description="Your items are reserved for a limited time."
                  level={2}
                />
                <PaymentPanel orderId={data.id} total={data.totals.total} onPaid={onPaid} />
                <Button variant="ghost" size="sm" className="w-fit" onClick={() => setConfirmCancel(true)}>
                  Cancel this order
                </Button>
              </Card>
            ) : null}

            {data.status !== 'PENDING_PAYMENT' && data.status !== 'CANCELLED' ? (
              <Card as="section" aria-label="Delivery progress">
                <DeliveryProgress status={data.status} />
              </Card>
            ) : null}

            {data.refunds.length > 0 ? (
              <Card as="section" aria-labelledby="refunds-title" className="flex flex-col gap-3">
                <CardHeader title={<span id="refunds-title">Refunds</span>} level={2} />
                <ul className="flex flex-col gap-2 text-sm">
                  {data.refunds.map((refund) => (
                    <li key={refund.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <MoneyText value={refund.amount} className="font-semibold" />{' '}
                        {refund.method === 'CREDIT' ? 'as exchange credit' : 'to the wallet that paid'}
                        <span className="block text-foreground-muted">{refundText(refund)}</span>
                      </span>
                      <StatusBadge status={refund.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {data.status === 'PAID' && data.type === 'ONE_TIME' ? (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => setConfirmCancel(true)}>
                Cancel this order
              </Button>
            ) : null}

            <div className="grid gap-6 md:grid-cols-2">
              <Card as="section" aria-labelledby="items-title">
                <CardHeader title={<span id="items-title">Items</span>} level={2} />
                <ul className="flex flex-col gap-3 text-sm">
                  {data.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {item.quantity} × {item.productName}
                        <span className="block text-foreground-muted">
                          {item.sizeCode} · {item.color}
                        </span>
                      </span>
                      <MoneyText value={item.lineTotal} />
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-border pt-4">
                  <TotalsTable totals={data.totals} />
                </div>
              </Card>
              <Card as="section" aria-labelledby="delivery-title" className="flex flex-col gap-4">
                <CardHeader
                  title={<span id="delivery-title">Delivery</span>}
                  description={data.deliveryOption?.name}
                  level={2}
                  action={data.delivery ? <StatusBadge status={data.delivery.status} /> : null}
                />
                <p className="text-sm">
                  {data.shippingAddress.recipientName}, {data.shippingAddress.phone}
                  <span className="block text-foreground-muted">{formatAddress(data.shippingAddress)}</span>
                </p>
                {data.delivery?.estimatedDeliveryDate ? (
                  <p className="text-sm">Expected {formatDate(data.delivery.estimatedDeliveryDate)}</p>
                ) : null}
                <Timeline order={data} />
              </Card>
            </div>

            <Modal
              open={confirmCancel}
              onClose={() => setConfirmCancel(false)}
              title="Cancel this order?"
              description={
                data.status === 'PENDING_PAYMENT'
                  ? 'Reserved items go back on sale. Nothing has been charged.'
                  : 'We will ask our team to refund your payment to the wallet that paid. You can follow the refund here.'
              }
              footer={
                <>
                  <Button variant="outline" onClick={() => setConfirmCancel(false)}>
                    Keep order
                  </Button>
                  <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                    Cancel order
                  </Button>
                </>
              }
            >
              {cancel.isError ? (
                <Alert tone="danger" live>
                  {errorMessage(cancel.error)}
                </Alert>
              ) : null}
            </Modal>
          </>
        )
      }
    </QueryState>
  );
}

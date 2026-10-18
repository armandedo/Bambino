'use client';

import {
  AdminOrderQuery,
  AdminRequestDoorPaymentMutation,
  AdminUpdateOrderStatusMutation,
  type OrderStatus,
} from '@bambino/api-client';
import { Alert, Button, Card, CardHeader, Modal, MoneyText, StatusBadge, humanizeStatus } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DeliverySteps } from '@/components/delivery-steps';
import { RefundPanel } from '@/components/refund-panel';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

/** The warehouse steps staff set by hand; delivery updates move the order on from READY_FOR_DISPATCH. */
const NEXT_WAREHOUSE_STEP: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID: 'PROCESSING',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'PACKED',
  PACKED: 'READY_FOR_DISPATCH',
};
const STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  PROCESSING: 'Start processing',
  PACKED: 'Mark packed',
  READY_FOR_DISPATCH: 'Ready for dispatch',
};

function OrderDetail({ id }: { id: string }) {
  const { can } = useStaff();
  const key = ['admin-order', id];
  const invalidate = [key, ['admin-orders']];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.request(AdminOrderQuery, { id, withRefunds: can('refund:read') })).adminOrder,
  });
  const [cancelling, setCancelling] = useState(false);
  const setStatus = useAction(
    (status: OrderStatus) => api.request(AdminUpdateOrderStatusMutation, { orderId: id, status }),
    {
      success: (r) => `Order is now ${humanizeStatus(r.adminUpdateOrderStatus.status).toLowerCase()}`,
      invalidate,
    },
  );

  const askAtDoor = useAction(() => api.request(AdminRequestDoorPaymentMutation, { orderId: id }), {
    success: 'Payment requested. The customer approves it on their phone.',
    invalidate,
  });

  return (
    <QueryState query={query} what="this order">
      {(data) => {
        if (!data) return <Alert tone="warning">Order not found.</Alert>;
        const { order, customer, payments } = data;
        const next = NEXT_WAREHOUSE_STEP[order.status];
        const paidCancellable =
          order.type === 'ONE_TIME' &&
          ['PAID', 'CONFIRMED', 'PROCESSING', 'PACKED', 'READY_FOR_DISPATCH'].includes(order.status);
        // Pay on delivery: nothing is charged until the courier is at the door, so there is nothing to refund
        // if the order is cancelled before then.
        const door = order.doorPayment;
        const unpaidDoor = door !== null && !door.paid && !['DELIVERED', 'CANCELLED'].includes(order.status);
        const atDoor = unpaidDoor && order.status === 'OUT_FOR_DELIVERY';
        const requestWaiting = payments.some(
          (entry) => entry.payment.status === 'INITIATED' || entry.payment.status === 'PENDING',
        );
        return (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-2xl font-semibold">{order.orderNumber}</h2>
                <p className="text-foreground-muted">
                  {humanizeStatus(order.type)} ·{' '}
                  {can('customer:read') ? (
                    <NextLink
                      href={`/customers/${customer.id}`}
                      className="text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {fullName(customer)}
                    </NextLink>
                  ) : (
                    fullName(customer)
                  )}{' '}
                  · placed {formatDate(order.placedAt, true)}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            {unpaidDoor && door ? (
              <Alert tone="info" title="Pay on delivery, by mobile money">
                The customer pays <MoneyText value={order.totals.total} className="font-semibold" /> from
                their {humanizeStatus(door.provider)} wallet ({door.maskedMsisdn}) when the order arrives.
                There is no cash. Once the order is out for delivery and the courier is at the door, ask for
                payment. The delivery can be completed only after the customer approves it on their phone.
                {atDoor && can('order:write') ? (
                  <div className="mt-3">
                    {requestWaiting ? (
                      <p className="font-medium">Waiting for the customer to approve on their phone.</p>
                    ) : null}
                    <Button
                      className="mt-2"
                      loading={askAtDoor.isPending}
                      onClick={() => askAtDoor.mutate(undefined)}
                      variant={requestWaiting ? 'outline' : 'primary'}
                    >
                      {requestWaiting ? 'Check again' : 'Ask for payment now'}
                    </Button>
                  </div>
                ) : null}
              </Alert>
            ) : null}
            {door?.paid ? (
              <Alert tone="success" title="Paid at the door">
                The customer approved the payment from their {humanizeStatus(door.provider)} wallet (
                {door.maskedMsisdn}).
              </Alert>
            ) : null}

            {can('order:write') ? (
              <div className="flex flex-wrap gap-2">
                {next ? (
                  <Button loading={setStatus.isPending} onClick={() => setStatus.mutate(next)}>
                    {STEP_LABEL[next]}
                  </Button>
                ) : null}
                {order.status === 'PENDING_PAYMENT' || paidCancellable ? (
                  <Button variant="ghost" onClick={() => setCancelling(true)}>
                    Cancel order
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Items" level={3} />
                <ul className="flex flex-col gap-2 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {item.quantity} × {item.productName}
                        <span className="block text-foreground-muted">
                          {item.sku} · {item.sizeCode} · {item.color}
                        </span>
                      </span>
                      <MoneyText value={item.lineTotal} />
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm">
                  {(
                    [
                      ['Subtotal', order.totals.subtotal],
                      ['Discount', order.totals.discount],
                      ['Exchange credit', order.totals.creditApplied],
                      ['Delivery', order.totals.shipping],
                      ['Tax', order.totals.tax],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt>{label}</dt>
                      <dd>
                        <MoneyText value={value} />
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold">
                    <dt>Total</dt>
                    <dd>
                      <MoneyText value={order.totals.total} />
                    </dd>
                  </div>
                </dl>
              </Card>
              <Card className="flex flex-col gap-3">
                <CardHeader title="Delivery" description={order.deliveryOption?.name} level={3} />
                <p className="text-sm">
                  {order.shippingAddress.recipientName}, {order.shippingAddress.phone}
                  <span className="block text-foreground-muted">
                    {[
                      order.shippingAddress.street,
                      order.shippingAddress.sector,
                      order.shippingAddress.district,
                      order.shippingAddress.region,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  {order.shippingAddress.directions ? (
                    <span className="block text-foreground-muted">{order.shippingAddress.directions}</span>
                  ) : null}
                </p>
                {order.delivery ? (
                  <DeliverySteps delivery={order.delivery} invalidate={invalidate} />
                ) : (
                  <p className="text-sm text-foreground-muted">
                    A delivery is created when the order is paid.
                  </p>
                )}
              </Card>
              <Card>
                <CardHeader title="Payments" level={3} />
                {payments.length === 0 ? (
                  <p className="text-sm text-foreground-muted">No payment attempts.</p>
                ) : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {payments.map((entry) => {
                      const p = entry.payment;
                      return (
                        <li key={p.id} className="flex flex-col gap-2">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <MoneyText value={p.amount} /> · {humanizeStatus(p.provider)} ·{' '}
                              {formatDate(p.initiatedAt, true)}
                              {p.failureMessage ? (
                                <span className="block text-foreground-muted">{p.failureMessage}</span>
                              ) : null}
                            </span>
                            <StatusBadge status={p.status} />
                          </span>
                          {can('refund:read') && (p.status === 'SUCCEEDED' || p.status === 'REFUNDED') ? (
                            <RefundPanel payment={entry} invalidate={invalidate} />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <Card>
                <CardHeader title="Status history" level={3} />
                <ol className="flex flex-col gap-1 text-sm">
                  {order.statusHistory.map((event, index) => (
                    <li key={`${event.occurredAt}-${index}`} className="flex justify-between gap-3">
                      <span>{humanizeStatus(event.status)}</span>
                      <span className="text-foreground-muted">{formatDate(event.occurredAt, true)}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <Modal
              open={cancelling}
              onClose={() => setCancelling(false)}
              title={
                order.status === 'PENDING_PAYMENT' || unpaidDoor
                  ? 'Cancel this unpaid order?'
                  : 'Cancel this paid order?'
              }
              description={
                order.status === 'PENDING_PAYMENT' || unpaidDoor
                  ? 'Reserved stock and garments are released. Nothing has been paid, so there is nothing to refund.'
                  : 'Stock goes back on hand, and a full refund is requested. The refund needs approval before anything is paid out.'
              }
              footer={
                <>
                  <Button variant="outline" onClick={() => setCancelling(false)}>
                    Keep order
                  </Button>
                  <Button
                    variant="danger"
                    loading={setStatus.isPending}
                    onClick={() => setStatus.mutate('CANCELLED', { onSuccess: () => setCancelling(false) })}
                  >
                    Cancel order
                  </Button>
                </>
              }
            />
          </div>
        );
      }}
    </QueryState>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="order:read">
      <OrderDetail id={id} />
    </RequirePermission>
  );
}

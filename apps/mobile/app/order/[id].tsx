import {
  CancelOrderMutation,
  ConfirmPayOnDeliveryMutation,
  InitiatePaymentMutation,
  type OrderDetail,
  type Payment,
  type PaymentProvider,
  OrderQuery,
  PaymentQuery,
} from '@bambino/api-client';
import { phoneSchema } from '@bambino/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Body, Button, Card, Empty, Field, Heading, Loading, Screen } from '@/components/ui';
import { MOCK_PAYMENTS } from '@/config';
import { orderStatusLabel, price, when } from '@/lib/format';
import { errorMessage, newIdempotencyKey } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, radius, space } from '@/theme';

const TERMINAL: readonly Payment['status'][] = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

/** Wallets understood by the API's mock provider (apps/api/src/providers/payments.ts). */
const MOCK_WALLETS = [
  { msisdn: '+250780000001', label: 'Test wallet that approves' },
  { msisdn: '+250780000002', label: 'Test wallet that declines' },
];

function Pay({ order, onChanged }: { order: OrderDetail; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<PaymentProvider>(MOCK_PAYMENTS ? 'MOCK' : 'MTN_MOMO');
  const [msisdn, setMsisdn] = useState(MOCK_PAYMENTS ? (MOCK_WALLETS[0]?.msisdn ?? '+250') : '+250');
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);
  // One key per attempt so a double tap cannot charge twice.
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const initiate = useMutation({
    mutationFn: async () =>
      (
        await api.request(InitiatePaymentMutation, {
          input: { idempotencyKey: attemptKey, orderId: order.id, provider, msisdn },
        })
      ).initiatePayment,
    onSuccess: (payment) => setPaymentId(payment.id),
  });

  const status = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: async () => (await api.request(PaymentQuery, { id: paymentId ?? '' })).payment,
    enabled: paymentId !== null,
    // Poll while the customer approves on their phone; stop once the provider has answered.
    refetchInterval: (query) =>
      query.state.data && TERMINAL.includes(query.state.data.status) ? false : 3000,
  });
  const payment = status.data ?? initiate.data ?? null;

  useEffect(() => {
    if (payment?.status === 'SUCCEEDED') {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onChanged();
    }
  }, [payment?.status, queryClient, onChanged]);

  const cod = useMutation({
    mutationFn: async () =>
      (
        await api.request(ConfirmPayOnDeliveryMutation, {
          input: { orderId: order.id, provider, msisdn },
        })
      ).confirmPayOnDelivery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onChanged();
    },
  });

  function start() {
    const parsed = phoneSchema.safeParse(msisdn);
    if (!parsed.success) {
      setPhoneProblem('Enter a mobile money number such as +250 78 000 0000.');
      return;
    }
    setPhoneProblem(null);
    setMsisdn(parsed.data);
    initiate.mutate();
  }

  function payLater() {
    const parsed = phoneSchema.safeParse(msisdn);
    if (!parsed.success) {
      setPhoneProblem('Enter a mobile money number such as +250 78 000 0000.');
      return;
    }
    setPhoneProblem(null);
    setMsisdn(parsed.data);
    cod.mutate();
  }

  function again() {
    setPaymentId(null);
    initiate.reset();
    setAttemptKey(newIdempotencyKey());
  }

  if (payment && (payment.status === 'PENDING' || payment.status === 'INITIATED')) {
    return (
      <Card>
        <Heading level={2}>Approve the payment on your phone</Heading>
        <Body>
          We asked your wallet for {price(payment.amount)}. Enter your PIN on the prompt to confirm. This
          screen updates by itself.
        </Body>
      </Card>
    );
  }

  const failed = payment && TERMINAL.includes(payment.status) && payment.status !== 'SUCCEEDED';

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <Heading level={2}>Pay with mobile money</Heading>
        {failed ? (
          <Banner tone="danger">
            {payment.failureMessage ?? 'The payment did not go through. You can try again.'}
          </Banner>
        ) : null}
        {initiate.isError ? <Banner tone="danger">{errorMessage(initiate.error)}</Banner> : null}
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {(MOCK_PAYMENTS
            ? ([['MOCK', 'Test wallet']] as const)
            : ([
                ['MTN_MOMO', 'MTN MoMo'],
                ['AIRTEL_MONEY', 'Airtel Money'],
              ] as const)
          ).map(([code, label]) => (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityState={{ selected: provider === code }}
              onPress={() => setProvider(code)}
              style={{
                minHeight: 44,
                paddingHorizontal: space.lg,
                justifyContent: 'center',
                borderRadius: radius.full,
                borderWidth: provider === code ? 2 : 1,
                borderColor: provider === code ? colors.primary : colors['border-strong'],
              }}
            >
              <Text style={{ fontWeight: '600', color: colors.foreground }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {MOCK_PAYMENTS ? (
          <View style={{ gap: space.sm }}>
            {MOCK_WALLETS.map((wallet) => (
              <Pressable
                key={wallet.msisdn}
                accessibilityRole="radio"
                accessibilityState={{ selected: msisdn === wallet.msisdn }}
                onPress={() => setMsisdn(wallet.msisdn)}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  padding: space.md,
                  borderRadius: radius.lg,
                  borderWidth: msisdn === wallet.msisdn ? 2 : 1,
                  borderColor: msisdn === wallet.msisdn ? colors.primary : colors['border-strong'],
                }}
              >
                <Text style={{ color: colors.foreground }}>
                  {wallet.label} ({wallet.msisdn})
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Field
            label="Mobile money number"
            value={msisdn}
            onChangeText={setMsisdn}
            keyboardType="phone-pad"
            error={phoneProblem ?? undefined}
          />
        )}
        <Button
          label={failed ? 'Try again' : `Pay ${price(order.totals.total)}`}
          variant="accent"
          loading={initiate.isPending}
          onPress={() => {
            if (failed) again();
            else start();
          }}
        />
      </Card>

      {order.payOnDelivery ? (
        <Card>
          <Heading level={2}>Or pay when it arrives</Heading>
          {order.payOnDelivery.available ? (
            <>
              <Body muted>
                Pay {price(order.totals.total)} from the wallet chosen above when your order arrives. We send
                a payment request to that number at your door and you approve it with your PIN. No cash is
                taken.
              </Body>
              {cod.isError ? <Banner tone="danger">{errorMessage(cod.error)}</Banner> : null}
              <Button label="Pay on delivery" variant="outline" loading={cod.isPending} onPress={payLater} />
            </>
          ) : (
            <Body muted>
              {order.payOnDelivery.message ?? 'Pay on delivery is not available for this order.'}
            </Body>
          )}
        </Card>
      ) : null}
    </View>
  );
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['order', id],
    queryFn: async () => (await api.request(OrderQuery, { id: id ?? '' })).order,
    enabled: Boolean(id),
  });

  const cancel = useMutation({
    mutationFn: async () => (await api.request(CancelOrderMutation, { id: id ?? '' })).cancelOrder,
    onSuccess: (order) => {
      queryClient.setQueryData(['order', id], order);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  if (query.isPending) return <Loading label="Loading your order" />;
  if (query.isError) {
    return (
      <Screen>
        <Banner tone="danger">{errorMessage(query.error)}</Banner>
        <Button label="Try again" variant="outline" onPress={() => query.refetch()} />
      </Screen>
    );
  }
  const order = query.data;
  if (!order) return <Empty title="Order not found">It may belong to another account.</Empty>;

  const canCancel = order.status === 'PENDING_PAYMENT' || order.status === 'CONFIRMED';

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Heading>Order #{order.orderNumber}</Heading>
        <Body muted>Placed {when(order.placedAt)}</Body>
      </View>

      {order.status === 'CONFIRMED' ? (
        <Banner tone="info">
          Your order is confirmed. When it arrives you will get a mobile money request for{' '}
          {price(order.totals.total)}. Approve it with your PIN to receive your order. No cash is taken.
        </Banner>
      ) : (
        <Banner
          tone={order.status === 'CANCELLED' ? 'warning' : order.status === 'DELIVERED' ? 'success' : 'info'}
        >
          {orderStatusLabel(order.status)}
        </Banner>
      )}

      {order.status === 'PENDING_PAYMENT' ? <Pay order={order} onChanged={() => query.refetch()} /> : null}

      <Card>
        {order.items.map((item) => (
          <View
            key={item.id}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}
          >
            <Text style={{ flex: 1, color: colors.foreground }}>
              {item.quantity} × {item.productName} ({item.sizeCode})
            </Text>
            <Text style={{ fontWeight: '600', color: colors.foreground }}>{price(item.lineTotal)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Total</Text>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>
            {price(order.totals.total)}
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.foreground }}>Delivery to</Text>
        <Body>{order.shippingAddress.recipientName}</Body>
        <Body muted>
          {[order.shippingAddress.street, order.shippingAddress.sector, order.shippingAddress.district]
            .filter(Boolean)
            .join(', ')}
        </Body>
        {order.delivery?.trackingNumber ? <Body muted>Tracking: {order.delivery.trackingNumber}</Body> : null}
      </Card>

      {cancel.isError ? <Banner tone="danger">{errorMessage(cancel.error)}</Banner> : null}
      {canCancel ? (
        <Button
          label="Cancel order"
          variant="danger"
          loading={cancel.isPending}
          onPress={() => cancel.mutate()}
        />
      ) : null}
    </Screen>
  );
}

import {
  CancelSubscriptionMutation,
  MySubscriptionsQuery,
  PauseSubscriptionMutation,
  ResumeSubscriptionMutation,
  type Subscription,
  SubscriptionPlansQuery,
} from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { Banner, Body, Button, Card, Heading, Loading, Screen } from '@/components/ui';
import { price, when } from '@/lib/format';
import { subscriptionStatusLabel } from '@/lib/labels';
import { errorMessage } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, space } from '@/theme';

function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = (next: Subscription) => {
    queryClient.setQueryData<Subscription[]>(['subscriptions'], (current) =>
      current?.map((s) => (s.id === next.id ? next : s)),
    );
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const pause = useMutation({
    mutationFn: async () =>
      (await api.request(PauseSubscriptionMutation, { id: subscription.id })).pauseSubscription,
    onSuccess: refresh,
  });
  const resume = useMutation({
    mutationFn: async () =>
      (await api.request(ResumeSubscriptionMutation, { id: subscription.id })).resumeSubscription,
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: async () =>
      (await api.request(CancelSubscriptionMutation, { id: subscription.id })).cancelSubscription,
    onSuccess: refresh,
  });
  const problem = pause.error ?? resume.error ?? cancel.error;

  const currentItems = subscription.items.filter((item) => item.status !== 'RETURNED');

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
        <Text style={{ flex: 1, fontWeight: '700', fontSize: 18, color: colors.foreground }}>
          {subscription.plan.name}
        </Text>
        <Text style={{ fontWeight: '600', color: colors.emphasis }}>
          {subscriptionStatusLabel(subscription.status)}
        </Text>
      </View>
      <Body muted>
        For {subscription.babyProfile.nickname} · {price(subscription.price)} per{' '}
        {subscription.plan.billingInterval.toLowerCase().replace('ly', '')}
      </Body>
      {subscription.nextBillingAt && !subscription.cancelAtPeriodEnd ? (
        <Body muted>Next billing {when(subscription.nextBillingAt)}</Body>
      ) : null}
      {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
        <Banner tone="warning">
          Ends on {when(subscription.currentPeriodEnd)}. You will not be charged again.
        </Banner>
      ) : null}
      {subscription.pendingPlan ? (
        <Body muted>Changes to {subscription.pendingPlan.name} next period.</Body>
      ) : null}

      {subscription.orderAwaitingPayment ? (
        <>
          <Banner tone="info">
            Order #{subscription.orderAwaitingPayment.orderNumber} is waiting for payment (
            {price(subscription.orderAwaitingPayment.totals.total)}).
          </Banner>
          <Button
            label="Pay now"
            variant="accent"
            onPress={() =>
              router.push({
                pathname: '/order/[id]',
                params: { id: subscription.orderAwaitingPayment?.id ?? '' },
              })
            }
          />
        </>
      ) : null}

      {currentItems.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <Text style={{ fontWeight: '700', color: colors.foreground }}>Items this cycle</Text>
          {currentItems.map((item) => (
            <Body key={item.id} muted>
              {item.product.name} · {item.variant.size.label} · {item.variant.color}
            </Body>
          ))}
        </View>
      ) : null}

      {problem ? <Banner tone="danger">{errorMessage(problem)}</Banner> : null}

      {subscription.canPause ? (
        <Button label="Pause" variant="outline" loading={pause.isPending} onPress={() => pause.mutate()} />
      ) : null}
      {subscription.canResume ? (
        <Button label="Resume" variant="accent" loading={resume.isPending} onPress={() => resume.mutate()} />
      ) : null}
      {subscription.canCancel && !subscription.cancelAtPeriodEnd ? (
        <Button
          label="Cancel at period end"
          variant="danger"
          loading={cancel.isPending}
          onPress={() =>
            Alert.alert(
              'Cancel your subscription?',
              'You keep your clothes until the end of this period, then you will not be charged again.',
              [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel subscription', style: 'destructive', onPress: () => cancel.mutate() },
              ],
            )
          }
        />
      ) : null}
    </Card>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const subscriptions = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => (await api.request(MySubscriptionsQuery)).mySubscriptions,
  });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await api.request(SubscriptionPlansQuery)).subscriptionPlans,
  });

  if (subscriptions.isPending) return <Loading label="Loading your subscription" />;
  if (subscriptions.isError) {
    return (
      <Screen>
        <Banner tone="danger">{errorMessage(subscriptions.error)}</Banner>
        <Button label="Try again" variant="outline" onPress={() => subscriptions.refetch()} />
      </Screen>
    );
  }

  const live = subscriptions.data.filter((s) => s.status !== 'CANCELLED' && s.status !== 'EXPIRED');
  const ended = subscriptions.data.filter((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED');

  return (
    <Screen>
      {live.map((subscription) => (
        <SubscriptionCard key={subscription.id} subscription={subscription} />
      ))}

      <Heading level={2}>{live.length > 0 ? 'Add another plan' : 'Choose a plan'}</Heading>
      {plans.data?.map((plan) => (
        <Card key={plan.id}>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.foreground }}>{plan.name}</Text>
          <Body muted>{plan.description}</Body>
          <Text style={{ fontWeight: '700', color: colors.foreground }}>
            {price(plan.price)} per {plan.billingInterval.toLowerCase().replace('ly', '')}
          </Text>
          <Body muted>
            {plan.itemsPerCycle} items per cycle
            {plan.exchangesPerCycle !== null ? ` · ${plan.exchangesPerCycle} exchanges` : ''}
          </Body>
          <Button
            label="Choose this plan"
            variant="accent"
            onPress={() => router.push({ pathname: '/subscribe/[planId]', params: { planId: plan.id } })}
          />
        </Card>
      ))}

      {ended.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <Text style={{ fontWeight: '700', color: colors.foreground }}>Past subscriptions</Text>
          {ended.map((s) => (
            <Body key={s.id} muted>
              {s.plan.name} · {subscriptionStatusLabel(s.status)}
            </Body>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

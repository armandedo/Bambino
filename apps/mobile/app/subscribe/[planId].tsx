import {
  CreateSubscriptionMutation,
  DeliveryOptionsQuery,
  MyBabyProfilesQuery,
  SubscriptionPlansQuery,
} from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlanTermsCard, INTERVAL_WORD, planSummary } from '@/components/plan-terms';
import { Banner, Body, Button, Card, Empty, Heading, Loading, Screen } from '@/components/ui';
import { price } from '@/lib/format';
import { errorMessage, newIdempotencyKey } from '@/lib/messages';
import { api, useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme';

function Choice({
  selected,
  onPress,
  title,
  detail,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  detail?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 56,
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors['border-strong'],
        padding: space.md,
        gap: 2,
      }}
    >
      <Text style={{ fontWeight: '700', color: colors.foreground, fontSize: 16 }}>{title}</Text>
      {detail ? <Text style={{ color: colors['foreground-muted'] }}>{detail}</Text> : null}
    </Pressable>
  );
}

export default function Subscribe() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [babyId, setBabyId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  // One key for this visit, so a double tap cannot start two subscriptions.
  const [attemptKey] = useState(newIdempotencyKey);

  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await api.request(SubscriptionPlansQuery)).subscriptionPlans,
  });
  const babies = useQuery({
    queryKey: ['babies'],
    queryFn: async () => (await api.request(MyBabyProfilesQuery)).myBabyProfiles,
  });
  const delivery = useQuery({
    queryKey: ['delivery-options'],
    queryFn: async () => (await api.request(DeliveryOptionsQuery)).deliveryOptions,
  });

  const plan = plans.data?.find((p) => p.id === planId);
  const addresses = user?.addresses ?? [];
  const chosenBaby = babyId ?? babies.data?.[0]?.id ?? null;
  const chosenAddress = addressId ?? addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
  const chosenDelivery = deliveryCode ?? delivery.data?.[0]?.code ?? null;

  const start = useMutation({
    mutationFn: async () =>
      (
        await api.request(CreateSubscriptionMutation, {
          input: {
            idempotencyKey: attemptKey,
            planId: planId ?? '',
            babyProfileId: chosenBaby ?? '',
            shippingAddressId: chosenAddress ?? '',
            deliveryOptionCode: chosenDelivery ?? '',
          },
        })
      ).createSubscription,
    onSuccess: (subscription) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (subscription.orderAwaitingPayment) {
        router.replace({ pathname: '/order/[id]', params: { id: subscription.orderAwaitingPayment.id } });
      } else {
        router.replace('/subscription');
      }
    },
  });

  if (plans.isPending || babies.isPending || delivery.isPending) return <Loading label="Preparing" />;
  if (!plan) return <Empty title="Plan not found">Go back and choose a plan again.</Empty>;

  if ((babies.data?.length ?? 0) === 0) {
    return (
      <Screen>
        <Heading>Add your baby first</Heading>
        <Body muted>A subscription is matched to your baby’s size, so we need their date of birth.</Body>
        <Button label="Add a baby" variant="accent" onPress={() => router.push('/babies')} />
      </Screen>
    );
  }
  if (addresses.length === 0) {
    return (
      <Screen>
        <Heading>Add a delivery address</Heading>
        <Body muted>You can add one during your first checkout in the Shop tab, then come back here.</Body>
        <Button label="Go to the shop" variant="accent" onPress={() => router.replace('/shop')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>{plan.name}</Heading>
      <Body muted>
        {price(plan.price)} per {INTERVAL_WORD[plan.billingInterval]}. {planSummary(plan)}
      </Body>
      <PlanTermsCard plan={plan} open />

      <View style={{ gap: space.sm }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Who is it for?</Text>
        {babies.data?.map((baby) => (
          <Choice
            key={baby.id}
            selected={baby.id === chosenBaby}
            onPress={() => setBabyId(baby.id)}
            title={baby.nickname}
            detail={baby.currentSize ? `Wears ${baby.currentSize.label}` : undefined}
          />
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Deliver to</Text>
        {addresses.map((address) => (
          <Choice
            key={address.id}
            selected={address.id === chosenAddress}
            onPress={() => setAddressId(address.id)}
            title={address.recipientName}
            detail={[address.street, address.sector, address.district].filter(Boolean).join(', ')}
          />
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Delivery</Text>
        {delivery.data?.map((option) => (
          <Choice
            key={option.code}
            selected={option.code === chosenDelivery}
            onPress={() => setDeliveryCode(option.code)}
            title={`${option.name} · ${price(option.fee)}`}
            detail={`${option.estimatedDaysMin}–${option.estimatedDaysMax} days`}
          />
        ))}
      </View>

      <Card>
        <Body muted>
          You pay the first period on the next screen with mobile money. Subscriptions renew with a
          mobile-money approval each time; nothing is charged without your PIN.
        </Body>
      </Card>

      {start.isError ? <Banner tone="danger">{errorMessage(start.error)}</Banner> : null}
      <Button
        label="Start subscription"
        variant="accent"
        disabled={!chosenBaby || !chosenAddress || !chosenDelivery}
        loading={start.isPending}
        onPress={() => start.mutate()}
      />
    </Screen>
  );
}

import {
  type Address,
  CheckoutPreviewQuery,
  CreateAddressMutation,
  CreateOrderMutation,
  DeliveryOptionsQuery,
  MyCartQuery,
} from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Body, Button, Card, Empty, Field, Heading, Loading, Screen } from '@/components/ui';
import { price } from '@/lib/format';
import { errorMessage, fieldProblems, newIdempotencyKey } from '@/lib/messages';
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

function NewAddress({ onSaved }: { onSaved: (address: Address) => void }) {
  const { user } = useSession();
  const [recipientName, setRecipientName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [phone, setPhone] = useState(user?.phone ?? '+250');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [sector, setSector] = useState('');
  const [street, setStreet] = useState('');
  const [directions, setDirections] = useState('');

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.request(CreateAddressMutation, {
          input: {
            recipientName: recipientName.trim(),
            phone: phone.trim(),
            countryCode: 'RW',
            region: region.trim() || null,
            district: district.trim() || null,
            sector: sector.trim() || null,
            street: street.trim() || null,
            directions: directions.trim() || null,
            isDefault: true,
          },
        })
      ).createAddress,
    onSuccess: onSaved,
  });
  const fields = fieldProblems(save.error);

  return (
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>
        Where should we deliver?
      </Text>
      {save.isError ? <Banner tone="danger">{errorMessage(save.error)}</Banner> : null}
      <Field
        label="Recipient name"
        value={recipientName}
        onChangeText={setRecipientName}
        autoCapitalize="words"
        error={fields.recipientName}
      />
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={fields.phone}
      />
      <Field
        label="Province"
        value={region}
        onChangeText={setRegion}
        autoCapitalize="words"
        error={fields.region}
      />
      <Field
        label="District"
        value={district}
        onChangeText={setDistrict}
        autoCapitalize="words"
        error={fields.district}
      />
      <Field
        label="Sector"
        value={sector}
        onChangeText={setSector}
        autoCapitalize="words"
        error={fields.sector}
      />
      <Field
        label="Street or house number"
        value={street}
        onChangeText={setStreet}
        autoCapitalize="words"
        error={fields.street}
      />
      <Field
        label="Directions for the rider"
        value={directions}
        onChangeText={setDirections}
        autoCapitalize="sentences"
        multiline
        error={fields.directions}
      />
      <Button label="Save address" onPress={() => save.mutate()} loading={save.isPending} />
    </Card>
  );
}

export default function Checkout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useSession();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  // One key for this visit: a double tap or a retry after a dropped connection cannot create two orders.
  const [attemptKey] = useState(newIdempotencyKey);

  const cart = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.request(MyCartQuery)).myCart,
  });
  const delivery = useQuery({
    queryKey: ['delivery-options'],
    queryFn: async () => (await api.request(DeliveryOptionsQuery)).deliveryOptions,
  });

  const addresses = user?.addresses ?? [];
  const chosenAddress = addressId ?? addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
  const chosenDelivery = deliveryCode ?? delivery.data?.[0]?.code ?? null;

  const preview = useQuery({
    queryKey: ['checkout-preview', chosenAddress, chosenDelivery],
    queryFn: async () =>
      (
        await api.request(CheckoutPreviewQuery, {
          input: { shippingAddressId: chosenAddress ?? '', deliveryOptionCode: chosenDelivery ?? '' },
        })
      ).checkoutPreview,
    enabled: chosenAddress !== null && chosenDelivery !== null,
  });

  const place = useMutation({
    mutationFn: async () =>
      (
        await api.request(CreateOrderMutation, {
          input: {
            idempotencyKey: attemptKey,
            checkout: { shippingAddressId: chosenAddress ?? '', deliveryOptionCode: chosenDelivery ?? '' },
          },
        })
      ).createOrder,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    },
  });

  if (cart.isPending || delivery.isPending) return <Loading label="Preparing checkout" />;
  if (!cart.data || cart.data.items.length === 0) {
    return <Empty title="Your cart is empty">Add something from the Shop tab first.</Empty>;
  }

  return (
    <Screen>
      <Heading>Review and place order</Heading>

      <View style={{ gap: space.sm }}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Delivery address</Text>
        {addresses.length === 0 ? (
          <NewAddress
            onSaved={(address) => {
              if (user) setUser({ ...user, addresses: [...user.addresses, address] });
              setAddressId(address.id);
            }}
          />
        ) : (
          addresses.map((address) => (
            <Choice
              key={address.id}
              selected={address.id === chosenAddress}
              onPress={() => setAddressId(address.id)}
              title={address.recipientName}
              detail={[address.street, address.sector, address.district].filter(Boolean).join(', ')}
            />
          ))
        )}
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
        {preview.isPending && chosenAddress ? <Loading label="Calculating total" /> : null}
        {preview.isError ? <Banner tone="danger">{errorMessage(preview.error)}</Banner> : null}
        {preview.data ? (
          <>
            {(
              [
                ['Subtotal', preview.data.totals.subtotal],
                ['Delivery', preview.data.totals.shipping],
                ['Tax', preview.data.totals.tax],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body muted>{label}</Body>
                <Body>{price(value)}</Body>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm }}>
              <Text style={{ fontWeight: '700', fontSize: 18, color: colors.foreground }}>Total</Text>
              <Text style={{ fontWeight: '700', fontSize: 18, color: colors.foreground }}>
                {price(preview.data.totals.total)}
              </Text>
            </View>
          </>
        ) : null}
      </Card>

      {place.isError ? <Banner tone="danger">{errorMessage(place.error)}</Banner> : null}
      <Body muted>You choose how to pay on the next screen: mobile money now, or mobile money when it arrives.</Body>
      <Button
        label="Place order"
        variant="accent"
        disabled={!chosenAddress || !chosenDelivery || !preview.data}
        loading={place.isPending}
        onPress={() => place.mutate()}
      />
    </Screen>
  );
}

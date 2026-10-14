import {
  type CustomerGarment,
  MyExchangeCreditsQuery,
  MyExchangesQuery,
  MyGarmentsQuery,
  MyReturnsQuery,
  type ReturnReason,
  RequestReturnMutation,
} from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Body, Button, Card, Chip, Field, Heading, Loading, Screen } from '@/components/ui';
import { price, when } from '@/lib/format';
import { RETURN_REASONS, exchangeStatusLabel, returnStatusLabel } from '@/lib/labels';
import { errorMessage } from '@/lib/messages';
import { api, useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme';

function GarmentRow({
  garment,
  selected,
  onToggle,
}: {
  garment: CustomerGarment;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        gap: space.md,
        alignItems: 'center',
        minHeight: 56,
        padding: space.md,
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors['border-strong'],
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: colors['border-strong'],
          backgroundColor: selected ? colors.primary : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Text style={{ color: colors['primary-foreground'], fontWeight: '700' }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: colors.foreground }}>{garment.product.name}</Text>
        <Text style={{ color: colors['foreground-muted'] }}>
          Size {garment.size.label} · {garment.color} · tag {garment.tagCode}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Exchanges() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState<ReturnReason>('OUTGROWN');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const garments = useQuery({
    queryKey: ['garments'],
    queryFn: async () => (await api.request(MyGarmentsQuery)).myGarments,
  });
  const returns = useQuery({
    queryKey: ['returns'],
    queryFn: async () => (await api.request(MyReturnsQuery)).myReturns,
  });
  const exchanges = useQuery({
    queryKey: ['exchanges'],
    queryFn: async () => (await api.request(MyExchangesQuery)).myExchanges,
  });
  const credit = useQuery({
    queryKey: ['credit'],
    queryFn: async () => (await api.request(MyExchangeCreditsQuery)).myExchangeCredits,
  });

  const request = useMutation({
    mutationFn: async () => {
      const pickup = user?.addresses.find((a) => a.isDefault) ?? user?.addresses[0];
      return (
        await api.request(RequestReturnMutation, {
          input: {
            items: selected.map((garmentId) => ({ garmentId })),
            reason,
            customerNote: note.trim() ? note.trim() : null,
            pickupAddressId: pickup?.id ?? null,
          },
        })
      ).requestReturn;
    },
    onSuccess: () => {
      setSelected([]);
      setNote('');
      setSent(true);
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['garments'] });
    },
  });

  if (garments.isPending) return <Loading label="Loading your clothes" />;

  const held = garments.data?.filter((g) => g.status === 'WITH_CUSTOMER') ?? [];

  return (
    <Screen>
      {credit.data ? (
        <Card>
          <Body muted>Exchange credit</Body>
          <Text style={{ fontWeight: '700', fontSize: 24, color: colors.foreground }}>
            {price(credit.data.balance)}
          </Text>
          <Body muted>Earned when you return clothes in good condition. Use it at checkout.</Body>
        </Card>
      ) : null}

      <Heading level={2}>Clothes with you</Heading>
      {garments.isError ? <Banner tone="danger">{errorMessage(garments.error)}</Banner> : null}
      {held.length === 0 ? (
        <Body muted>You are not holding any rented clothes right now.</Body>
      ) : (
        <>
          {held.map((garment) => (
            <GarmentRow
              key={garment.id}
              garment={garment}
              selected={selected.includes(garment.id)}
              onToggle={() =>
                setSelected((current) =>
                  current.includes(garment.id)
                    ? current.filter((id) => id !== garment.id)
                    : [...current, garment.id],
                )
              }
            />
          ))}
          {selected.length > 0 ? (
            <Card>
              <Text style={{ fontWeight: '700', color: colors.foreground }}>Why are you returning them?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {RETURN_REASONS.map((option) => (
                  <Chip
                    key={option.code}
                    label={option.label}
                    selected={reason === option.code}
                    onPress={() => setReason(option.code)}
                  />
                ))}
              </View>
              <Field
                label="Anything we should know? (optional)"
                value={note}
                onChangeText={setNote}
                autoCapitalize="sentences"
                multiline
              />
              {request.isError ? <Banner tone="danger">{errorMessage(request.error)}</Banner> : null}
              <Button
                label={`Return ${selected.length} ${selected.length === 1 ? 'item' : 'items'}`}
                variant="accent"
                loading={request.isPending}
                onPress={() => request.mutate()}
              />
            </Card>
          ) : null}
        </>
      )}
      {sent ? (
        <Banner tone="success">
          Return requested. We will arrange a pickup, and you will be told when it is approved.
        </Banner>
      ) : null}

      {returns.data && returns.data.length > 0 ? (
        <>
          <Heading level={2}>Returns</Heading>
          {returns.data.map((item) => (
            <Card key={item.id}>
              <Text style={{ fontWeight: '700', color: colors.foreground }}>{item.returnNumber}</Text>
              <Body muted>
                {when(item.createdAt)} · {item.items.length} {item.items.length === 1 ? 'item' : 'items'}
              </Body>
              <Text style={{ color: colors.emphasis, fontWeight: '600' }}>
                {returnStatusLabel(item.status)}
              </Text>
              {item.rejectionReason ? <Body muted>{item.rejectionReason}</Body> : null}
            </Card>
          ))}
        </>
      ) : null}

      {exchanges.data && exchanges.data.length > 0 ? (
        <>
          <Heading level={2}>Exchanges</Heading>
          {exchanges.data.map((item) => (
            <Card key={item.id}>
              <Text style={{ fontWeight: '700', color: colors.foreground }}>{item.exchangeNumber}</Text>
              {item.items.map((line) => (
                <Body key={line.id} muted>
                  {line.product.name} · {line.requestedVariant.size.label} · {line.requestedVariant.color}
                </Body>
              ))}
              <Text style={{ color: colors.emphasis, fontWeight: '600' }}>
                {exchangeStatusLabel(item.status)}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

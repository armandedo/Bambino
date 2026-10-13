import { type Cart, MyCartQuery, RemoveFromCartMutation, UpdateCartItemMutation } from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { Banner, Body, Button, Card, Empty, Loading, Screen } from '@/components/ui';
import { price } from '@/lib/format';
import { errorMessage } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, radius, space } from '@/theme';

export default function CartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const cart = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.request(MyCartQuery)).myCart,
  });

  const update = useMutation({
    mutationFn: async (input: { itemId: string; quantity: number }) =>
      (await api.request(UpdateCartItemMutation, input)).updateCartItem,
    onSuccess: (next: Cart) => queryClient.setQueryData(['cart'], next),
  });
  const remove = useMutation({
    mutationFn: async (itemId: string) =>
      (await api.request(RemoveFromCartMutation, { itemId })).removeFromCart,
    onSuccess: (next: Cart) => queryClient.setQueryData(['cart'], next),
  });

  if (cart.isPending) return <Loading label="Loading your cart" />;
  if (cart.isError) {
    return (
      <Screen>
        <Banner tone="danger">{errorMessage(cart.error)}</Banner>
        <Button label="Try again" onPress={() => cart.refetch()} variant="outline" />
      </Screen>
    );
  }
  if (!cart.data || cart.data.items.length === 0) {
    return <Empty title="Your cart is empty">Find something soft for your little one in the Shop tab.</Empty>;
  }

  const busy = update.isPending || remove.isPending;
  const problem = update.error ?? remove.error;

  return (
    <Screen>
      {problem ? <Banner tone="danger">{errorMessage(problem)}</Banner> : null}
      {cart.data.items.map((line) => {
        const image = line.product.images[0];
        return (
          <Card key={line.id}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: radius.md,
                  backgroundColor: colors['surface-muted'],
                  overflow: 'hidden',
                }}
              >
                {image ? (
                  <Image
                    source={{ uri: image.url }}
                    accessibilityLabel={image.altText}
                    style={{ width: 72, height: 72 }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '700', color: colors.foreground, fontSize: 16 }}>
                  {line.product.name}
                </Text>
                <Text style={{ color: colors['foreground-muted'] }}>
                  Size {line.variant.size.label} · {line.variant.color}
                </Text>
                <Text style={{ fontWeight: '600', color: colors.foreground }}>{price(line.lineTotal)}</Text>
                {!line.variant.inStock ? (
                  <Text style={{ color: colors['danger-foreground'] }}>Out of stock</Text>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <View style={{ width: 52 }}>
                <Button
                  label="−"
                  variant="outline"
                  disabled={busy || line.quantity <= 1}
                  onPress={() => update.mutate({ itemId: line.id, quantity: line.quantity - 1 })}
                />
              </View>
              <Text style={{ minWidth: 28, textAlign: 'center', fontWeight: '700', fontSize: 16 }}>
                {line.quantity}
              </Text>
              <View style={{ width: 52 }}>
                <Button
                  label="+"
                  variant="outline"
                  disabled={busy}
                  onPress={() => update.mutate({ itemId: line.id, quantity: line.quantity + 1 })}
                />
              </View>
              <View style={{ flex: 1 }} />
              <View style={{ width: 120 }}>
                <Button
                  label="Remove"
                  variant="danger"
                  disabled={busy}
                  onPress={() => remove.mutate(line.id)}
                />
              </View>
            </View>
          </Card>
        );
      })}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Body>Subtotal</Body>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{price(cart.data.subtotal)}</Text>
        </View>
        <Body muted>Delivery and any discount are shown at checkout.</Body>
      </Card>

      <Button
        label="Checkout"
        variant="accent"
        disabled={busy || cart.data.items.some((line) => !line.variant.inStock)}
        onPress={() => router.push('/checkout')}
      />
    </Screen>
  );
}

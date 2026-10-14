import { Ionicons } from '@expo/vector-icons';
import { AddToCartMutation, ProductQuery } from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Banner, Body, Button, Empty, Heading, Loading, Screen } from '@/components/ui';
import { price } from '@/lib/format';
import { errorMessage } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, radius, space } from '@/theme';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const query = useQuery({
    queryKey: ['product', slug],
    queryFn: async () => (await api.request(ProductQuery, { slug: slug ?? '' })).product,
    enabled: Boolean(slug),
  });

  const add = useMutation({
    mutationFn: async (id: string) =>
      (await api.request(AddToCartMutation, { variantId: id, quantity: 1 })).addToCart,
    onSuccess: (cart) => {
      queryClient.setQueryData(['cart'], cart);
      setAdded(true);
    },
  });

  if (query.isPending) return <Loading label="Loading product" />;
  if (query.isError) {
    return (
      <Screen>
        <Banner tone="danger">{errorMessage(query.error)}</Banner>
        <Button label="Try again" onPress={() => query.refetch()} variant="outline" />
      </Screen>
    );
  }
  const product = query.data;
  if (!product) return <Empty title="Product not found">It may no longer be on sale.</Empty>;

  const image = product.images[0];
  const chosen = product.variants.find((v) => v.id === variantId) ?? null;

  return (
    <Screen>
      <View
        style={{
          aspectRatio: 1,
          borderRadius: radius.lg,
          backgroundColor: colors['surface-muted'],
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {image ? (
          <Image
            source={{ uri: image.url }}
            accessibilityLabel={image.altText}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shirt-outline" size={40} color={colors['border-strong']} />
          </View>
        )}
      </View>

      <View style={{ gap: space.xs }}>
        <Text style={{ color: colors['foreground-muted'], fontSize: 14 }}>{product.brand}</Text>
        <Heading>{product.name}</Heading>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
          {chosen ? price(chosen.price) : product.priceFrom ? `From ${price(product.priceFrom)}` : ''}
        </Text>
      </View>

      <Body>{product.description}</Body>

      <View style={{ gap: space.sm }}>
        <Text style={{ fontWeight: '700', color: colors.foreground }}>Size</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {product.variants
            .slice()
            .sort((a, b) => a.size.sortOrder - b.size.sortOrder)
            .map((variant) => {
              const active = variant.id === variantId;
              return (
                <Pressable
                  key={variant.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !variant.inStock }}
                  accessibilityLabel={`${variant.size.label}${variant.inStock ? '' : ', out of stock'}`}
                  disabled={!variant.inStock}
                  onPress={() => {
                    setVariantId(variant.id);
                    setAdded(false);
                  }}
                  style={{
                    minWidth: 56,
                    minHeight: 44,
                    paddingHorizontal: space.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors['border-strong'],
                    backgroundColor: active ? colors.primary : 'transparent',
                    opacity: variant.inStock ? 1 : 0.4,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '600',
                      color: active ? colors['primary-foreground'] : colors.foreground,
                    }}
                  >
                    {variant.size.label}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </View>

      {add.isError ? <Banner tone="danger">{errorMessage(add.error)}</Banner> : null}
      {added ? <Banner tone="success">Added to your cart.</Banner> : null}

      <Button
        label={chosen ? 'Add to cart' : 'Choose a size'}
        variant="accent"
        disabled={!chosen}
        loading={add.isPending}
        onPress={() => chosen && add.mutate(chosen.id)}
      />
      {added ? <Button label="View cart" variant="outline" onPress={() => router.push('/cart')} /> : null}

      {product.material || product.careInstructions || product.sustainabilityInfo ? (
        <View style={{ gap: space.xs, paddingTop: space.md }}>
          {product.material ? <Body muted>Material: {product.material}</Body> : null}
          {product.careInstructions ? <Body muted>Care: {product.careInstructions}</Body> : null}
          {product.sustainabilityInfo ? <Body muted>{product.sustainabilityInfo}</Body> : null}
        </View>
      ) : null}
    </Screen>
  );
}

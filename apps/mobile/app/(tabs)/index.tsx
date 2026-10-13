import { CatalogueFiltersQuery, type ProductCard, ProductsQuery } from '@bambino/api-client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Empty, Field, Loading } from '@/components/ui';
import { price } from '@/lib/format';
import { errorMessage } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, radius, space } from '@/theme';

function ProductTile({ product, onPress }: { product: ProductCard; onPress: () => void }) {
  const image = product.images[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={onPress}
      style={{ flex: 1, gap: space.sm }}
    >
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
        ) : null}
      </View>
      <Text style={{ fontWeight: '700', color: colors.foreground, fontSize: 15 }} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={{ color: colors['foreground-muted'], fontSize: 14 }}>
        {product.priceFrom ? `From ${price(product.priceFrom)}` : 'Price on request'}
      </Text>
    </Pressable>
  );
}

export default function Shop() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | undefined>();

  const filters = useQuery({
    queryKey: ['catalogue-filters'],
    queryFn: async () => api.request(CatalogueFiltersQuery),
  });

  const products = useInfiniteQuery({
    queryKey: ['products', submitted, categorySlug],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.request(ProductsQuery, {
          filter: {
            ...(submitted ? { search: submitted } : {}),
            ...(categorySlug ? { categorySlug } : {}),
          },
          sort: 'NEWEST',
          first: 12,
          ...(pageParam ? { after: pageParam } : {}),
        })
      ).products,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? (last.pageInfo.endCursor ?? undefined) : undefined,
  });

  const items = useMemo(
    () => products.data?.pages.flatMap((page) => page.edges.map((edge) => edge.node)) ?? [],
    [products.data],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <Field
          label="Search clothes"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          placeholder="Bodysuit, sleepsuit, hat…"
        />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Search" onPress={() => setSubmitted(search.trim())} variant="outline" />
          </View>
          {submitted || categorySlug ? (
            <View style={{ flex: 1 }}>
              <Button
                label="Clear"
                variant="outline"
                onPress={() => {
                  setSearch('');
                  setSubmitted('');
                  setCategorySlug(undefined);
                }}
              />
            </View>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}
        >
          {filters.data?.categories.map((category) => {
            const active = category.slug === categorySlug;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCategorySlug(active ? undefined : category.slug)}
                style={{
                  paddingHorizontal: space.lg,
                  minHeight: 40,
                  justifyContent: 'center',
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors['border-strong'],
                  backgroundColor: active ? colors.primary : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontWeight: '600',
                    color: active ? colors['primary-foreground'] : colors.foreground,
                  }}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {products.isPending ? (
        <Loading label="Loading clothes" />
      ) : products.isError ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          <Banner tone="danger">{errorMessage(products.error)}</Banner>
          <Button label="Try again" onPress={() => products.refetch()} variant="outline" />
        </View>
      ) : items.length === 0 ? (
        <Empty title="No clothes found">Try another search or clear the filters.</Empty>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: space.lg }}
          contentContainerStyle={{ padding: space.lg, gap: space.xl }}
          refreshControl={
            <RefreshControl refreshing={products.isRefetching} onRefresh={() => products.refetch()} />
          }
          onEndReached={() =>
            products.hasNextPage && !products.isFetchingNextPage && products.fetchNextPage()
          }
          renderItem={({ item }) => (
            <ProductTile
              product={item}
              onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
            />
          )}
        />
      )}
    </View>
  );
}

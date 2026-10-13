import { MyOrdersQuery } from '@bambino/api-client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Banner, Button, Card, Empty, Loading } from '@/components/ui';
import { orderStatusLabel, price, when } from '@/lib/format';
import { errorMessage } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, space } from '@/theme';

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useInfiniteQuery({
    queryKey: ['orders'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.request(MyOrdersQuery, { first: 15, ...(pageParam ? { after: pageParam } : {}) })).myOrders,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? (last.pageInfo.endCursor ?? undefined) : undefined,
  });
  const items = useMemo(
    () => orders.data?.pages.flatMap((page) => page.edges.map((edge) => edge.node)) ?? [],
    [orders.data],
  );

  if (orders.isPending) return <Loading label="Loading your orders" />;
  if (orders.isError) {
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Banner tone="danger">{errorMessage(orders.error)}</Banner>
        <Button label="Try again" variant="outline" onPress={() => orders.refetch()} />
      </View>
    );
  }
  if (items.length === 0) return <Empty title="No orders yet">Your orders will show up here.</Empty>;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => orders.refetch()} />}
      onEndReached={() => orders.hasNextPage && !orders.isFetchingNextPage && orders.fetchNextPage()}
      renderItem={({ item }) => (
        <Card onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: colors.foreground, fontSize: 16 }}>
              #{item.orderNumber}
            </Text>
            <Text style={{ fontWeight: '700', color: colors.foreground }}>{price(item.totals.total)}</Text>
          </View>
          <Text style={{ color: colors['foreground-muted'] }}>
            {when(item.placedAt)} · {item.items.length} {item.items.length === 1 ? 'item' : 'items'}
          </Text>
          <Text style={{ color: colors.emphasis, fontWeight: '600' }}>{orderStatusLabel(item.status)}</Text>
        </Card>
      )}
    />
  );
}

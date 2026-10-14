import {
  MarkAllNotificationsReadMutation,
  MyBabyProfilesQuery,
  MyNotificationsQuery,
  MySubscriptionsQuery,
} from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Banner, Body, Button, Card, Heading, Screen } from '@/components/ui';
import { when } from '@/lib/format';
import { notificationText, subscriptionStatusLabel } from '@/lib/labels';
import { api, useSession } from '@/lib/session';
import { colors, space } from '@/theme';

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const babies = useQuery({
    queryKey: ['babies'],
    queryFn: async () => (await api.request(MyBabyProfilesQuery)).myBabyProfiles,
  });
  const subscriptions = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => (await api.request(MySubscriptionsQuery)).mySubscriptions,
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.request(MyNotificationsQuery, { first: 5 })).myNotifications,
  });
  const markRead = useMutation({
    mutationFn: async () => api.request(MarkAllNotificationsReadMutation),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const live = subscriptions.data?.find((s) => s.status !== 'CANCELLED' && s.status !== 'EXPIRED');
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <Screen>
      <Heading>Hello{user ? `, ${user.firstName}` : ''}</Heading>

      <Card>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Your little ones</Text>
        {babies.isPending ? (
          <Body muted>Loading…</Body>
        ) : babies.data && babies.data.length > 0 ? (
          babies.data.map((baby) => (
            <View key={baby.id} style={{ gap: 2 }}>
              <Text style={{ fontWeight: '600', color: colors.foreground }}>{baby.nickname}</Text>
              <Body muted>
                {baby.currentSize ? `Wears ${baby.currentSize.label}` : 'Size not set'}
                {baby.latestRecommendation
                  ? ` · we suggest ${baby.latestRecommendation.recommendedSize.label}`
                  : ''}
              </Body>
            </View>
          ))
        ) : (
          <Body muted>Add your baby so we can suggest the right size.</Body>
        )}
        <Button label="Manage babies" variant="outline" onPress={() => router.push('/babies')} />
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>Subscription</Text>
        {live ? (
          <>
            <Body>
              {live.plan.name} · {subscriptionStatusLabel(live.status)}
            </Body>
            {live.nextBillingAt ? <Body muted>Next billing {when(live.nextBillingAt)}</Body> : null}
          </>
        ) : (
          <Body muted>No subscription yet. Rent clothes by the size, swap as your baby grows.</Body>
        )}
        <Button
          label={live ? 'Manage subscription' : 'See plans'}
          variant="outline"
          onPress={() => router.push('/subscription')}
        />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>
            Notifications{unread > 0 ? ` (${unread} new)` : ''}
          </Text>
        </View>
        {notifications.data && notifications.data.edges.length > 0 ? (
          notifications.data.edges.map(({ node }) => (
            <View key={node.id} style={{ gap: 2, opacity: node.read ? 0.6 : 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: node.read ? '400' : '600' }}>
                {notificationText(node.type)}
              </Text>
              <Text style={{ color: colors['foreground-muted'], fontSize: 13 }}>{when(node.createdAt)}</Text>
            </View>
          ))
        ) : (
          <Body muted>Nothing new.</Body>
        )}
        {unread > 0 ? (
          <Button
            label="Mark all as read"
            variant="outline"
            loading={markRead.isPending}
            onPress={() => markRead.mutate()}
          />
        ) : null}
      </Card>

      {babies.isError || subscriptions.isError ? (
        <Banner tone="warning">
          Some information could not be loaded. Pull down on another tab and try again.
        </Banner>
      ) : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}

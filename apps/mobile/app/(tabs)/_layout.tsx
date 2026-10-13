import { Redirect, Tabs } from 'expo-router';
import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** The signed-in app: Shop, Cart, Orders, Account. Subscription and Exchanges tabs follow in the next slice. */
export default function TabsLayout() {
  const { status } = useSession();
  if (status === 'loading') return <Loading label="Opening Bambino" />;
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors['foreground-muted'],
        tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Shop' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}

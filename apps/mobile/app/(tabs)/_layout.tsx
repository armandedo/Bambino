import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(outline: IconName, filled: IconName) {
  return function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
  };
}

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
      <Tabs.Screen
        name="index"
        options={{ title: 'Shop', tabBarIcon: icon('storefront-outline', 'storefront') }}
      />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: icon('cart-outline', 'cart') }} />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: icon('receipt-outline', 'receipt') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: icon('person-outline', 'person') }}
      />
    </Tabs>
  );
}

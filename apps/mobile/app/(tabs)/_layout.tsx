import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
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

/** The signed-in app (docs/06 section 6.2): Home, Shop, Subscription, Exchanges, Account. */
export default function TabsLayout() {
  const { status } = useSession();
  const router = useRouter();
  if (status === 'loading') return <Loading label="Opening Bambino" />;
  if (status === 'signedOut') return <Redirect href="/sign-in" />;

  const cartButton = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your cart"
      onPress={() => router.push('/cart')}
      hitSlop={8}
      style={{ paddingHorizontal: 16 }}
    >
      <Ionicons name="cart-outline" size={24} color={colors.foreground} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors['foreground-muted'],
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: icon('storefront-outline', 'storefront'),
          headerRight: cartButton,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{ title: 'Subscription', tabBarIcon: icon('repeat-outline', 'repeat') }}
      />
      <Tabs.Screen
        name="exchanges"
        options={{ title: 'Exchanges', tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: icon('person-outline', 'person') }}
      />
    </Tabs>
  );
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { colors } from '@/theme';

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.foreground,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[slug]" options={{ title: 'Product' }} />
            <Stack.Screen name="cart" options={{ title: 'Your cart' }} />
            <Stack.Screen name="orders" options={{ title: 'My orders' }} />
            <Stack.Screen name="babies" options={{ title: 'My babies' }} />
            <Stack.Screen name="subscribe/[planId]" options={{ title: 'Start a subscription' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
          </Stack>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

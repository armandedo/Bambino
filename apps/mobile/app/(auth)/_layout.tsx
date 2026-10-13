import { Redirect, Stack } from 'expo-router';
import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function AuthLayout() {
  const { status } = useSession();
  if (status === 'loading') return <Loading label="Opening Bambino" />;
  if (status === 'signedIn') return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        headerTitle: '',
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

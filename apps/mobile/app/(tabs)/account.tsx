import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Banner, Body, Button, Card, Heading, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    try {
      await signOut();
    } catch (error) {
      setProblem(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading>
        {user?.firstName} {user?.lastName}
      </Heading>
      {problem ? <Banner tone="danger">{problem}</Banner> : null}
      <Card>
        <Text style={{ color: colors['foreground-muted'] }}>Email</Text>
        <Body>{user?.email ?? 'Not set'}</Body>
        {user && !user.emailVerified ? (
          <Banner tone="warning">Your email is not verified yet. Check your inbox for the link.</Banner>
        ) : null}
        <Text style={{ color: colors['foreground-muted'] }}>Phone</Text>
        <Body>{user?.phone ?? 'Not set'}</Body>
      </Card>
      <Card>
        <Text style={{ fontWeight: '700', color: colors.foreground }}>Delivery addresses</Text>
        {user && user.addresses.length > 0 ? (
          user.addresses.map((address) => (
            <Body key={address.id} muted>
              {address.recipientName},{' '}
              {[address.street, address.sector, address.district].filter(Boolean).join(', ')}
            </Body>
          ))
        ) : (
          <Body muted>You can add one at checkout.</Body>
        )}
      </Card>
      <Button label="My orders" variant="outline" onPress={() => router.push('/orders')} />
      <Button label="My babies" variant="outline" onPress={() => router.push('/babies')} />
      <Button label="Sign out" variant="outline" loading={busy} onPress={leave} />
    </Screen>
  );
}

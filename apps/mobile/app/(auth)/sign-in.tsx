import { Link } from 'expo-router';
import { useState } from 'react';
import { Banner, Body, Button, Field, Heading, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/messages';
import { useSession } from '@/lib/session';

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setProblem('Enter your email and password.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading>Welcome back</Heading>
      <Body muted>Sign in to see your orders, your baby's sizes and your subscription.</Body>
      {problem ? <Banner tone="danger">{problem}</Banner> : null}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secure />
      <Button label="Sign in" onPress={submit} loading={busy} />
      <Link href="/register" style={{ textAlign: 'center', fontSize: 16, padding: 12 }}>
        New to Bambino? Create an account
      </Link>
    </Screen>
  );
}

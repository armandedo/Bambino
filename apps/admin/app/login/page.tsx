'use client';

import { Alert, Button, Card, TextField } from '@bambino/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { Logo } from '@/components/logo';
import { errorMessage } from '@/lib/format';
import { useStaff } from '@/lib/session';

/** Only same-app paths are accepted after sign-in, so `?next=` cannot send staff elsewhere. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

function LoginForm() {
  const { signIn } = useStaff();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const viewer = await signIn(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
      if (viewer.permissions.length === 0) {
        setError('This account has no staff role. Ask an administrator for access.');
        setPending(false);
        return;
      }
      router.replace(next);
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <TextField label="Email" name="email" type="email" autoComplete="username" required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" loading={pending} fullWidth>
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card padding="lg" className="flex w-full max-w-sm flex-col gap-6">
        <Logo />
        <h1 className="font-display text-2xl font-extrabold">Staff sign-in</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </Card>
    </main>
  );
}

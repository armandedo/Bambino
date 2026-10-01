'use client';

import { Alert, Button, TextField } from '@bambino/ui';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '@/lib/messages';
import { useSession } from '@/lib/session';

export function LoginForm({ next }: { next: string }) {
  const { signIn } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await signIn(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
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
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <NextLink
        href="/forgot-password"
        className="w-fit text-sm font-medium text-link underline underline-offset-4 hover:decoration-2"
      >
        Forgot your password?
      </NextLink>
      <Button type="submit" loading={pending} fullWidth>
        Sign in
      </Button>
    </form>
  );
}

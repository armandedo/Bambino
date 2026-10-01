'use client';

import { RequestPasswordResetMutation } from '@bambino/api-client';
import { Alert, Button, TextField } from '@bambino/ui';
import { type FormEvent, useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';

export function ForgotPasswordForm() {
  const [state, setState] = useState<'idle' | 'pending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setState('pending');
    setError(null);
    try {
      await api.request(RequestPasswordResetMutation, { email });
      setState('sent');
    } catch (caught) {
      setError(errorMessage(caught));
      setState('idle');
    }
  }

  if (state === 'sent') {
    // The API answers the same way for unknown addresses, so this never confirms that an account exists.
    return (
      <Alert tone="success" title="Check your email" live>
        If an account uses that address, a reset link is on its way. The link works for a limited time.
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" loading={state === 'pending'} fullWidth>
        Send reset link
      </Button>
    </form>
  );
}

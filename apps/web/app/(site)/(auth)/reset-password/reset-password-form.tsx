'use client';

import { ResetPasswordMutation } from '@bambino/api-client';
import { Alert, Button, TextField, buttonClasses } from '@bambino/ui';
import { passwordSchema } from '@bambino/validation';
import NextLink from 'next/link';
import { type FormEvent, useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage, validationMessage } from '@/lib/messages';

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  if (!token) {
    return (
      <Alert tone="danger" title="This link is incomplete">
        Open the link from the email again, or request a new one.
      </Alert>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('password') ?? '');
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setFieldError(validationMessage(parsed.error.issues[0]?.message));
      return;
    }
    setFieldError(undefined);
    setState('pending');
    setError(null);
    try {
      await api.request(ResetPasswordMutation, { token, newPassword });
      setState('done');
    } catch (caught) {
      setError(errorMessage(caught));
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Password changed" live>
          You have been signed out on other devices. Sign in with your new password.
        </Alert>
        <NextLink href="/login" className={buttonClasses({ fullWidth: true })}>
          Sign in
        </NextLink>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        required
        error={fieldError}
      />
      <Button type="submit" loading={state === 'pending'} fullWidth>
        Save password
      </Button>
    </form>
  );
}

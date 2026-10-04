'use client';

import { VerifyEmailMutation } from '@bambino/api-client';
import { Alert, Button, buttonClasses } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { ME_KEY } from '@/lib/session';

/** Verification runs on a button press, not on page load, so link scanners in mail clients cannot spend the token. */
export function VerifyEmail({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const verify = useMutation({
    mutationFn: () => api.request(VerifyEmailMutation, { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });

  if (!token) {
    return (
      <Alert tone="danger" title="This link is incomplete">
        Open the link from the email again, or request a new one from your account settings.
      </Alert>
    );
  }
  if (verify.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Email verified" live>
          Thank you. Your email address is confirmed.
        </Alert>
        <NextLink href="/dashboard" className={buttonClasses({ fullWidth: true })}>
          Go to your account
        </NextLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {verify.isError ? (
        <Alert tone="danger" live>
          {errorMessage(verify.error)}
        </Alert>
      ) : null}
      <p className="text-foreground-muted">Confirm that this email address belongs to you.</p>
      <Button onClick={() => verify.mutate()} loading={verify.isPending} fullWidth>
        Confirm my email
      </Button>
    </div>
  );
}

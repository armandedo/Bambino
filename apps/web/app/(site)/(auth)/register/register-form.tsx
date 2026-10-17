'use client';

import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import { Alert, Button, Checkbox, TextField } from '@bambino/ui';
import { registerSchema } from '@bambino/validation';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { errorMessage, fieldErrors, validationMessage } from '@/lib/messages';
import { PREVIEW_BUILD } from '@/lib/preview';
import { useSession } from '@/lib/session';

type Errors = Partial<Record<'email' | 'password' | 'firstName' | 'lastName' | 'phone' | 'consents', string>>;

export function RegisterForm({ next }: { next: string }) {
  const { register } = useSession();
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const granted = (name: string) => form.get(name) === 'on';
    const phone = String(form.get('phone') ?? '').trim();
    const input = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      phone: phone === '' ? null : phone,
      consents: (['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CHILD_DATA_PROCESSING', 'MARKETING'] as const).map(
        (type) => ({
          type,
          documentVersion: LEGAL_DOCUMENT_VERSIONS[type],
          granted: granted(type),
        }),
      ),
    };

    // The same schema the API uses, for instant feedback. The API still validates everything.
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]) as keyof Errors;
        const message = validationMessage(issue.message);
        if (message) next[field] ??= message;
      }
      setErrors(next);
      setFormError('Please check the highlighted fields.');
      return;
    }

    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await register(input);
      router.replace(next);
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setFormError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          error={errors.firstName}
        />
        <TextField
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
          error={errors.lastName}
        />
      </div>
      <TextField label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
      <TextField
        label="Phone (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        hint="With country code, for example +250 78 000 0000."
        error={errors.phone}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        required
        error={errors.password}
      />
      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={errors.consents ? 'consents-error' : undefined}
      >
        <legend className="mb-1 text-sm font-semibold">Agreements</legend>
        <Checkbox
          name="TERMS_OF_SERVICE"
          label="I accept the terms of service."
          {...(PREVIEW_BUILD ? { hint: 'Draft text, not yet published.' } : {})}
        />
        <Checkbox
          name="PRIVACY_POLICY"
          label="I accept the privacy policy."
          {...(PREVIEW_BUILD ? { hint: 'Draft text, not yet published.' } : {})}
        />
        <Checkbox
          name="CHILD_DATA_PROCESSING"
          label="I agree that Bambino may store my baby’s age and measurements to recommend sizes."
          hint="Only you and authorised staff can see them."
        />
        <Checkbox name="MARKETING" label="Send me news and offers (optional)." />
        {errors.consents ? (
          <p id="consents-error" className="text-sm font-medium text-danger">
            {errors.consents}
          </p>
        ) : null}
      </fieldset>
      <Button type="submit" loading={pending} fullWidth>
        Create account
      </Button>
    </form>
  );
}

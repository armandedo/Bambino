'use client';

import {
  ChangePasswordMutation,
  DeleteAddressMutation,
  MyDataRequestsQuery,
  RequestAccountDeletionMutation,
  RequestDataExportMutation,
  UpdateProfileMutation,
  type Viewer,
} from '@bambino/api-client';
import { Alert, Badge, Button, Card, CardHeader, Modal, StatusBadge, TextField } from '@bambino/ui';
import { passwordSchema, phoneSchema } from '@bambino/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AddressForm } from '@/components/address-form';
import { formatAddress } from '@/components/checkout-parts';
import { QueryState } from '@/components/query-state';
import { api } from '@/lib/browser-api';
import { errorMessage, fieldErrors, formatDate, validationMessage } from '@/lib/messages';
import { ME_KEY, useSession } from '@/lib/session';
import { PageTitle } from '../dashboard/account-nav';

function ProfileSection({ viewer }: { viewer: Viewer }) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (input: { firstName: string; lastName: string; phone: string | null }) =>
      (await api.request(UpdateProfileMutation, { input })).updateProfile,
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
    onError: (error) => setErrors(fieldErrors(error)),
  });
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    if (phone && !phoneSchema.safeParse(phone).success) {
      setErrors({ phone: validationMessage('validation.phone.invalid') ?? '' });
      return;
    }
    setErrors({});
    save.mutate({
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      phone: phone === '' ? null : phone,
    });
  }
  return (
    <Card as="section" aria-labelledby="profile">
      <CardHeader
        title={<span id="profile">Profile</span>}
        description={viewer.email ?? undefined}
        level={2}
        action={
          viewer.emailVerified ? (
            <Badge tone="success">Email verified</Badge>
          ) : (
            <Badge tone="warning">Email not verified</Badge>
          )
        }
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            name="firstName"
            defaultValue={viewer.firstName}
            autoComplete="given-name"
            error={errors.firstName}
          />
          <TextField
            label="Last name"
            name="lastName"
            defaultValue={viewer.lastName}
            autoComplete="family-name"
            error={errors.lastName}
          />
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={viewer.phone ?? ''}
            autoComplete="tel"
            error={errors.phone}
          />
        </div>
        {save.isSuccess ? (
          <p className="text-sm font-medium text-success-foreground" role="status">
            Saved.
          </p>
        ) : null}
        {save.isError ? (
          <Alert tone="danger" live>
            {errorMessage(save.error)}
          </Alert>
        ) : null}
        <Button type="submit" className="w-fit" loading={save.isPending}>
          Save profile
        </Button>
      </form>
    </Card>
  );
}

function AddressesSection({ viewer }: { viewer: Viewer }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.request(DeleteAddressMutation, { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
  return (
    <Card as="section" aria-labelledby="addresses" className="flex flex-col gap-4">
      <CardHeader
        title={<span id="addresses">Addresses</span>}
        level={2}
        action={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add address
          </Button>
        }
      />
      {viewer.addresses.length === 0 ? <p className="text-foreground-muted">No saved addresses.</p> : null}
      <ul className="flex flex-col gap-2">
        {viewer.addresses.map((address) => (
          <li
            key={address.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
          >
            <span>
              <span className="font-semibold">
                {address.label ? `${address.label}: ` : ''}
                {address.recipientName}
              </span>{' '}
              {address.isDefault ? <Badge tone="brand">Default</Badge> : null}
              <span className="block text-foreground-muted">
                {formatAddress(address)} · {address.phone}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending && remove.variables === address.id}
              onClick={() => remove.mutate(address.id)}
            >
              Remove<span className="sr-only"> address for {address.recipientName}</span>
            </Button>
          </li>
        ))}
      </ul>
      {remove.isError ? (
        <Alert tone="danger" live>
          {errorMessage(remove.error)}
        </Alert>
      ) : null}
      <Modal open={adding} onClose={() => setAdding(false)} title="New address" size="lg">
        {adding ? <AddressForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} /> : null}
      </Modal>
    </Card>
  );
}

function SecuritySection() {
  const [error, setError] = useState<string | undefined>();
  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.request(ChangePasswordMutation, input),
  });
  return (
    <Card as="section" aria-labelledby="security">
      <CardHeader title={<span id="security">Password</span>} level={2} />
      <form
        method="post"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const newPassword = String(form.get('newPassword') ?? '');
          const parsed = passwordSchema.safeParse(newPassword);
          if (!parsed.success) {
            setError(validationMessage(parsed.error.issues[0]?.message));
            return;
          }
          setError(undefined);
          change.mutate({ currentPassword: String(form.get('currentPassword') ?? ''), newPassword });
          event.currentTarget.reset();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters."
            error={error}
          />
        </div>
        {change.isSuccess ? (
          <p className="text-sm font-medium text-success-foreground" role="status">
            Password changed. Other devices have been signed out.
          </p>
        ) : null}
        {change.isError ? (
          <Alert tone="danger" live>
            {errorMessage(change.error)}
          </Alert>
        ) : null}
        <Button type="submit" variant="outline" className="w-fit" loading={change.isPending}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

function PrivacySection() {
  const router = useRouter();
  const { signOut } = useSession();
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ['data-requests'],
    queryFn: async () => (await api.request(MyDataRequestsQuery)).myDataRequests,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['data-requests'] });
  const exportData = useMutation({
    mutationFn: () => api.request(RequestDataExportMutation),
    onSuccess: refresh,
  });
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const deletion = useMutation({
    mutationFn: () => api.request(RequestAccountDeletionMutation, { currentPassword: password }),
    onSuccess: async () => {
      setDeleting(false);
      await signOut();
      router.replace('/');
    },
  });
  return (
    <Card as="section" aria-labelledby="privacy" className="flex flex-col gap-4">
      <CardHeader
        title={<span id="privacy">Your data</span>}
        description="Get a copy of your data, or ask us to delete your account."
        level={2}
      />
      <QueryState query={requests} what="your requests">
        {(list) =>
          list.length === 0 ? null : (
            <ul className="flex flex-col gap-1 text-sm">
              {list.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {request.type === 'EXPORT' ? 'Data export' : 'Account deletion'} requested{' '}
                    {formatDate(request.requestedAt)}
                  </span>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <Alert tone="info">
        Requests are recorded now; preparing the export file and carrying out deletion are handled by our team
        for the moment.
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" loading={exportData.isPending} onClick={() => exportData.mutate()}>
          Request a copy of my data
        </Button>
        <Button variant="danger" onClick={() => setDeleting(true)}>
          Delete my account
        </Button>
      </div>
      {exportData.isError ? (
        <Alert tone="danger" live>
          {errorMessage(exportData.error)}
        </Alert>
      ) : null}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete your account?"
        description="This starts closing your account. Our team confirms what is deleted and which records must be kept, such as payments."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              disabled={!password}
              loading={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              Request deletion
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {deletion.isError ? (
            <Alert tone="danger" live>
              {errorMessage(deletion.error)}
            </Alert>
          ) : null}
        </div>
      </Modal>
    </Card>
  );
}

export default function SettingsPage() {
  const { viewer, signOut } = useSession();
  const router = useRouter();
  if (!viewer) return null;
  return (
    <>
      <PageTitle
        title="Settings"
        action={
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              router.replace('/');
            }}
          >
            Sign out
          </Button>
        }
      />
      <ProfileSection viewer={viewer} />
      <AddressesSection viewer={viewer} />
      <SecuritySection />
      <PrivacySection />
    </>
  );
}

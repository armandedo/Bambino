'use client';

import {
  AdminAdjustExchangeCreditMutation,
  AdminBabyProfilesQuery,
  AdminCustomerQuery,
  AdminCustomerSubscriptionsQuery,
} from '@bambino/api-client';
import { Alert, Button, Card, CardHeader, Modal, MoneyText, StatusBadge, TextField } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { formatDate } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

/** Child data is loaded only on request: viewing it needs its own permission and is recorded in the audit log. */
function BabyProfiles({ customerId }: { customerId: string }) {
  const { can } = useStaff();
  const [show, setShow] = useState(false);
  const babies = useQuery({
    queryKey: ['admin-babies', customerId],
    queryFn: async () => (await api.request(AdminBabyProfilesQuery, { customerId })).adminBabyProfiles,
    enabled: show,
  });
  if (!can('baby_profile:read'))
    return <p className="text-sm text-foreground-muted">Your role cannot view children’s details.</p>;
  if (!show) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground-muted">
          Children’s details are sensitive. Viewing them is recorded in the audit log.
        </p>
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setShow(true)}>
          Show baby profiles
        </Button>
      </div>
    );
  }
  return (
    <QueryState query={babies} what="baby profiles">
      {(list) =>
        list.length === 0 ? (
          <p className="text-sm text-foreground-muted">No baby profiles.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {list.map((baby) => (
              <li key={baby.id} className="rounded-lg border border-border p-3">
                <p className="font-semibold">
                  {baby.nickname} · born {formatDate(baby.dateOfBirth)}
                </p>
                <p className="text-foreground-muted">
                  {baby.latestRecommendation
                    ? `Recommended ${baby.latestRecommendation.recommendedSize.label} (${baby.latestRecommendation.provider})`
                    : 'No recommendation'}{' '}
                  · {baby.measurements.length} measurements
                </p>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

function Subscriptions({ customerId }: { customerId: string }) {
  const { can } = useStaff();
  const query = useQuery({
    queryKey: ['admin-customer-subscriptions', customerId],
    queryFn: async () =>
      (await api.request(AdminCustomerSubscriptionsQuery, { id: customerId })).adminCustomer?.subscriptions ??
      [],
    enabled: can('subscription:read'),
  });
  if (!can('subscription:read'))
    return <p className="text-sm text-foreground-muted">Your role cannot view subscriptions.</p>;
  return (
    <QueryState query={query} what="subscriptions">
      {(list) =>
        list.length === 0 ? (
          <p className="text-sm text-foreground-muted">None.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.plan.name} · since {formatDate(s.createdAt)}
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

function CreditAdjustment({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = Number(amount);
  const valid = Number.isSafeInteger(value) && value !== 0 && note.trim().length >= 5;
  const adjust = useAction(
    () => api.request(AdminAdjustExchangeCreditMutation, { customerId, amount: value, note: note.trim() }),
    {
      success: 'Credit adjusted and recorded in the audit log',
      invalidate: [['admin-customer', customerId]],
    },
  );
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Amount in RWF"
        inputMode="numeric"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        hint="Whole francs. Positive adds credit, negative removes it."
      />
      <TextField
        label="Reason"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        hint="At least 5 characters; kept in the ledger."
      />
      <Button
        disabled={!valid}
        loading={adjust.isPending}
        onClick={() => adjust.mutate(undefined, { onSuccess: onDone })}
      >
        Record adjustment
      </Button>
    </div>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const { can } = useStaff();
  const [adjusting, setAdjusting] = useState(false);
  const query = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: async () => (await api.request(AdminCustomerQuery, { id })).adminCustomer,
  });
  return (
    <QueryState query={query} what="this customer">
      {(customer) =>
        !customer ? (
          <Alert tone="warning">Customer not found.</Alert>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="font-display text-2xl font-semibold">
                {customer.firstName} {customer.lastName}
              </h2>
              <p className="text-foreground-muted">
                {customer.email ?? 'No email'} · {customer.phone ?? 'No phone'} · joined{' '}
                {formatDate(customer.createdAt)}
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Exchange credit"
                  level={3}
                  action={
                    can('exchange:write') ? (
                      <Button size="sm" variant="outline" onClick={() => setAdjusting(true)}>
                        Adjust
                      </Button>
                    ) : null
                  }
                />
                <p className="font-display text-3xl font-extrabold">
                  <MoneyText value={customer.exchangeCreditBalance} />
                </p>
              </Card>
              <Card>
                <CardHeader title="Subscriptions" level={3} />
                <Subscriptions customerId={customer.id} />
              </Card>
              <Card>
                <CardHeader title="Baby profiles" level={3} />
                <BabyProfiles customerId={customer.id} />
              </Card>
            </div>
            <Modal open={adjusting} onClose={() => setAdjusting(false)} title="Adjust exchange credit">
              {adjusting ? (
                <CreditAdjustment customerId={customer.id} onDone={() => setAdjusting(false)} />
              ) : null}
            </Modal>
          </div>
        )
      }
    </QueryState>
  );
}

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="customer:read">
      <CustomerDetail id={id} />
    </RequirePermission>
  );
}

'use client';

import {
  type AdminPlan,
  AdminCancelSubscriptionMutation,
  AdminSubscriptionPlansQuery,
  AdminSubscriptionsQuery,
  AdminUpsertSubscriptionPlanMutation,
  type BillingInterval,
  CatalogueFiltersQuery,
  type SubscriptionStatus,
} from '@bambino/api-client';
import { SUBSCRIPTION_STATUSES } from '@bambino/types';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DataTable,
  Modal,
  MoneyText,
  SelectField,
  StatusBadge,
  TextField,
  TextareaField,
} from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { type FormEvent, useState } from 'react';
import {
  Pager,
  QueryState,
  RequirePermission,
  Section,
  StatusFilter,
  useAction,
  usePager,
} from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

function PlanForm({ plan, onDone }: { plan: AdminPlan | null; onDone: () => void }) {
  const categories = useQuery({
    queryKey: ['catalogue-filters'],
    queryFn: async () => (await api.request(CatalogueFiltersQuery)).categories,
  });
  const [chosen, setChosen] = useState<string[]>(plan?.allowedCategories.map((c) => c.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const save = useAction(
    (input: AdminPlanInput) => api.request(AdminUpsertSubscriptionPlanMutation, { input }),
    { success: 'Plan saved', invalidate: [['admin-plans']] },
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const priceAmount = Number(form.get('price'));
    const itemsPerCycle = Number(form.get('items'));
    const exchangesRaw = String(form.get('exchanges') ?? '').trim();
    const exchangesPerCycle = exchangesRaw === '' ? null : Number(exchangesRaw);
    if (!Number.isSafeInteger(priceAmount) || priceAmount < 0)
      return setError('Price must be a whole number of francs.');
    if (!Number.isInteger(itemsPerCycle) || itemsPerCycle < 1)
      return setError('Items per cycle must be at least 1.');
    if (exchangesPerCycle !== null && (!Number.isInteger(exchangesPerCycle) || exchangesPerCycle < 0))
      return setError('Exchanges per cycle must be a whole number, or empty for unlimited.');
    setError(null);
    save.mutate(
      {
        id: plan?.id ?? null,
        code: String(form.get('code') ?? '').trim(),
        name: String(form.get('name') ?? '').trim(),
        description: String(form.get('description') ?? '').trim(),
        billingInterval: String(form.get('interval')) as BillingInterval,
        priceAmount,
        itemsPerCycle,
        exchangesPerCycle,
        allowedCategoryIds: chosen,
        isActive: form.get('active') === 'on',
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Code"
          name="code"
          defaultValue={plan?.code ?? ''}
          required
          hint="Stable identifier, e.g. MONTHLY"
        />
        <TextField label="Name" name="name" defaultValue={plan?.name ?? ''} required />
        <SelectField
          label="Billing interval"
          name="interval"
          defaultValue={plan?.billingInterval ?? 'MONTHLY'}
          options={[
            { value: 'MONTHLY', label: 'Monthly' },
            { value: 'QUARTERLY', label: 'Quarterly' },
            { value: 'ANNUAL', label: 'Annual' },
          ]}
        />
        <TextField
          label="Price (RWF)"
          name="price"
          inputMode="numeric"
          defaultValue={plan ? String(plan.price.amount) : ''}
          required
        />
        <TextField
          label="Items per cycle"
          name="items"
          inputMode="numeric"
          defaultValue={plan ? String(plan.itemsPerCycle) : '3'}
          required
        />
        <TextField
          label="Exchanges per cycle"
          name="exchanges"
          inputMode="numeric"
          defaultValue={
            plan?.exchangesPerCycle === null || plan === null ? '' : String(plan.exchangesPerCycle)
          }
          hint="Empty means unlimited"
        />
      </div>
      <TextareaField label="Description" name="description" defaultValue={plan?.description ?? ''} rows={2} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Categories included (none ticked means all)</legend>
        {(categories.data ?? []).map((category) => (
          <Checkbox
            key={category.id}
            label={category.name}
            checked={chosen.includes(category.id)}
            onChange={(event) =>
              setChosen((current) =>
                event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id),
              )
            }
          />
        ))}
      </fieldset>
      <Checkbox name="active" label="Offered to customers" defaultChecked={plan?.isActive ?? true} />
      <p className="text-sm text-foreground-muted">
        Price changes apply to new subscriptions; existing subscribers keep the price they signed up at.
      </p>
      <Button type="submit" loading={save.isPending} className="w-fit">
        Save plan
      </Button>
    </form>
  );
}

type AdminPlanInput = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  billingInterval: BillingInterval;
  priceAmount: number;
  itemsPerCycle: number;
  exchangesPerCycle: number | null;
  allowedCategoryIds: string[];
  isActive: boolean;
};

function Subscriptions() {
  const { can } = useStaff();
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [editing, setEditing] = useState<AdminPlan | 'new' | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const pager = usePager();
  const plans = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => (await api.request(AdminSubscriptionPlansQuery)).adminSubscriptionPlans,
  });
  const subscriptions = useQuery({
    queryKey: ['admin-subscriptions', status, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminSubscriptionsQuery, {
          status: status || null,
          page: { first: 25, after: pager.after },
        })
      ).adminSubscriptions,
  });
  const cancel = useAction((id: string) => api.request(AdminCancelSubscriptionMutation, { id, reason }), {
    success: 'Subscription cancelled',
    invalidate: [['admin-subscriptions']],
  });

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Plans"
        action={
          can('plan:write') ? (
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              New plan
            </Button>
          ) : null
        }
      >
        <QueryState query={plans} what="plans">
          {(list) => (
            <div className="grid gap-3 md:grid-cols-3">
              {list.map((plan) => (
                <Card key={plan.id} padding="sm" className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {plan.name}
                    {plan.isActive ? null : <StatusBadge status="CANCELLED" label="Not offered" />}
                  </p>
                  <p className="font-mono text-xs text-foreground-muted">{plan.code}</p>
                  <p>
                    <MoneyText value={plan.price} className="font-display text-xl font-bold" /> /{' '}
                    {plan.billingInterval.toLowerCase()}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {plan.itemsPerCycle} items ·{' '}
                    {plan.exchangesPerCycle === null ? 'unlimited' : plan.exchangesPerCycle} exchanges ·{' '}
                    {plan.allowedCategories.length === 0
                      ? 'all categories'
                      : plan.allowedCategories.map((c) => c.name).join(', ')}
                  </p>
                  {can('plan:write') ? (
                    <Button size="sm" variant="ghost" className="mt-2 w-fit" onClick={() => setEditing(plan)}>
                      Edit
                    </Button>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </QueryState>
      </Section>

      <Section title="Subscriptions">
        <StatusFilter
          values={SUBSCRIPTION_STATUSES}
          value={status}
          onChange={(value) => {
            setStatus(value);
            pager.reset();
          }}
        />
        <QueryState query={subscriptions} what="subscriptions">
          {(page) => (
            <>
              <DataTable
                caption="Subscriptions"
                captionHidden
                rows={page.items}
                rowKey={(row) => row.subscription.id}
                empty="No subscriptions match."
                columns={[
                  {
                    key: 'customer',
                    header: 'Customer',
                    rowHeader: true,
                    cell: (row) =>
                      can('customer:read') ? (
                        <NextLink
                          href={`/customers/${row.customer.id}`}
                          className="text-link underline underline-offset-4 hover:decoration-2"
                        >
                          {fullName(row.customer)}
                        </NextLink>
                      ) : (
                        fullName(row.customer)
                      ),
                  },
                  {
                    key: 'plan',
                    header: 'Plan',
                    cell: (row) => `${row.subscription.plan.name} · ${row.subscription.babyProfile.nickname}`,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (row) => <StatusBadge status={row.subscription.status} />,
                  },
                  {
                    key: 'period',
                    header: 'Period ends',
                    cell: (row) => formatDate(row.subscription.currentPeriodEnd),
                  },
                  {
                    key: 'billing',
                    header: 'Next payment',
                    cell: (row) => formatDate(row.subscription.nextBillingAt),
                  },
                  {
                    key: 'attempts',
                    header: 'Renewal attempts',
                    align: 'end',
                    cell: (row) => row.renewalAttempts,
                  },
                  {
                    key: 'price',
                    header: 'Price',
                    align: 'end',
                    cell: (row) => <MoneyText value={row.subscription.price} />,
                  },
                  {
                    key: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    cell: (row) =>
                      can('subscription:write') &&
                      !['CANCELLED', 'EXPIRED'].includes(row.subscription.status) ? (
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(row.subscription.id)}>
                          Cancel
                        </Button>
                      ) : null,
                  },
                ]}
              />
              <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
            </>
          )}
        </QueryState>
      </Section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New plan' : 'Edit plan'}
        size="lg"
      >
        {editing !== null ? (
          <PlanForm plan={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>
      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this subscription now?"
        description="Staff cancellation takes effect immediately. The reason is recorded in the audit log."
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={cancel.isPending}
              onClick={() =>
                cancelling && cancel.mutate(cancelling, { onSuccess: () => setCancelling(null) })
              }
            >
              Cancel subscription
            </Button>
          </>
        }
      >
        <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Modal>
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <RequirePermission permission="subscription:read">
      <Subscriptions />
    </RequirePermission>
  );
}

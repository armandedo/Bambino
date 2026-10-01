'use client';

import {
  type AdminPromotion,
  AdminPromotionsQuery,
  AdminUpsertPromotionMutation,
  type VariablesOf,
} from '@bambino/api-client';
import {
  Alert,
  Button,
  Checkbox,
  DataTable,
  Modal,
  MoneyText,
  SelectField,
  StatusBadge,
  TextField,
  humanizeStatus,
} from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { formatDate } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

type DiscountType = AdminPromotion['discountType'];

function toLocalInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16) : '';
}

function PromotionForm({ promotion, onDone }: { promotion: AdminPromotion | null; onDone: () => void }) {
  const [type, setType] = useState<DiscountType>(promotion?.discountType ?? 'PERCENTAGE');
  const [error, setError] = useState<string | null>(null);
  const save = useAction(
    (input: VariablesOf<typeof AdminUpsertPromotionMutation>['input']) =>
      api.request(AdminUpsertPromotionMutation, { input }),
    { success: 'Promotion saved', invalidate: [['admin-promotions']] },
  );

  function buildInput(values: {
    code: string;
    name: string;
    scope: 'ORDER' | 'SUBSCRIPTION';
    percent: number | null;
    fixed: number | null;
    minSubtotal: number;
    maxRedemptions: number | null;
    perUser: number;
    startsAt: string;
    endsAt: string | null;
    active: boolean;
  }) {
    return {
      id: promotion?.id ?? null,
      code: values.code || null,
      name: values.name,
      scope: values.scope,
      discountType: type,
      percentBasisPoints:
        type === 'PERCENTAGE' && values.percent !== null ? Math.round(values.percent * 100) : null,
      fixedAmount: type === 'FIXED_AMOUNT' ? values.fixed : null,
      minSubtotalAmount: values.minSubtotal,
      maxRedemptions: values.maxRedemptions,
      maxRedemptionsPerUser: values.perUser,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
      isActive: values.active,
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const int = (name: string) => (text(name) === '' ? null : Number(text(name)));
    const percent = int('percent');
    const fixed = int('fixed');
    if (type === 'PERCENTAGE' && (percent === null || percent <= 0 || percent > 100))
      return setError('Percentage must be between 0 and 100.');
    if (type === 'FIXED_AMOUNT' && (fixed === null || !Number.isSafeInteger(fixed) || fixed <= 0))
      return setError('Amount must be a positive whole number of francs.');
    if (!text('startsAt')) return setError('Choose a start time.');
    setError(null);
    save.mutate(
      buildInput({
        code: text('code').toUpperCase(),
        name: text('name'),
        scope: text('scope') as 'ORDER' | 'SUBSCRIPTION',
        percent,
        fixed,
        minSubtotal: int('minSubtotal') ?? 0,
        maxRedemptions: int('maxRedemptions'),
        perUser: int('perUser') ?? 1,
        startsAt: text('startsAt'),
        endsAt: text('endsAt') || null,
        active: form.get('active') === 'on',
      }),
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
        <TextField label="Name" name="name" defaultValue={promotion?.name ?? ''} required />
        <TextField
          label="Code"
          name="code"
          defaultValue={promotion?.code ?? ''}
          hint="What customers type, e.g. WELCOME10"
        />
        <SelectField
          label="Applies to"
          name="scope"
          defaultValue={promotion?.scope ?? 'ORDER'}
          options={[
            { value: 'ORDER', label: 'Shop orders' },
            { value: 'SUBSCRIPTION', label: 'Subscriptions' },
          ]}
        />
        <SelectField
          label="Discount"
          value={type}
          onChange={(event) => setType(event.target.value as DiscountType)}
          options={[
            { value: 'PERCENTAGE', label: 'Percentage' },
            { value: 'FIXED_AMOUNT', label: 'Fixed amount' },
            { value: 'FREE_SHIPPING', label: 'Free delivery' },
          ]}
        />
        {type === 'PERCENTAGE' ? (
          <TextField
            label="Percent off"
            name="percent"
            inputMode="decimal"
            defaultValue={promotion?.percentBasisPoints ? String(promotion.percentBasisPoints / 100) : ''}
          />
        ) : null}
        {type === 'FIXED_AMOUNT' ? (
          <TextField
            label="Amount off (RWF)"
            name="fixed"
            inputMode="numeric"
            defaultValue={promotion?.fixedAmount ? String(promotion.fixedAmount.amount) : ''}
          />
        ) : null}
        <TextField
          label="Minimum subtotal (RWF)"
          name="minSubtotal"
          inputMode="numeric"
          defaultValue={promotion ? String(promotion.minSubtotal.amount) : '0'}
        />
        <TextField
          label="Total uses (empty = unlimited)"
          name="maxRedemptions"
          inputMode="numeric"
          defaultValue={promotion?.maxRedemptions?.toString() ?? ''}
        />
        <TextField
          label="Uses per customer"
          name="perUser"
          inputMode="numeric"
          defaultValue={String(promotion?.maxRedemptionsPerUser ?? 1)}
        />
        <TextField
          label="Starts (UTC)"
          name="startsAt"
          type="datetime-local"
          defaultValue={toLocalInput(promotion?.startsAt ?? new Date().toISOString())}
        />
        <TextField
          label="Ends (UTC, optional)"
          name="endsAt"
          type="datetime-local"
          defaultValue={toLocalInput(promotion?.endsAt ?? null)}
        />
      </div>
      <Checkbox name="active" label="Active" defaultChecked={promotion?.isActive ?? true} />
      <Button type="submit" className="w-fit" loading={save.isPending}>
        Save promotion
      </Button>
    </form>
  );
}

function Promotions() {
  const { can } = useStaff();
  const [editing, setEditing] = useState<AdminPromotion | 'new' | null>(null);
  const promotions = useQuery({
    queryKey: ['admin-promotions'],
    queryFn: async () => (await api.request(AdminPromotionsQuery)).adminPromotions,
  });
  return (
    <div className="flex flex-col gap-4">
      {can('promotion:write') ? (
        <Button variant="outline" className="w-fit" onClick={() => setEditing('new')}>
          New promotion
        </Button>
      ) : null}
      <QueryState query={promotions} what="promotions">
        {(list) => (
          <DataTable
            caption="Promotions"
            captionHidden
            rows={list}
            rowKey={(p) => p.id}
            empty="No promotions yet."
            columns={[
              { key: 'name', header: 'Name', rowHeader: true, cell: (p) => p.name },
              {
                key: 'code',
                header: 'Code',
                cell: (p) => <span className="font-mono">{p.code ?? '—'}</span>,
              },
              {
                key: 'discount',
                header: 'Discount',
                cell: (p) =>
                  p.discountType === 'PERCENTAGE' ? (
                    `${(p.percentBasisPoints ?? 0) / 100}%`
                  ) : p.discountType === 'FIXED_AMOUNT' && p.fixedAmount ? (
                    <MoneyText value={p.fixedAmount} />
                  ) : (
                    humanizeStatus(p.discountType)
                  ),
              },
              {
                key: 'used',
                header: 'Used',
                align: 'end',
                cell: (p) => `${p.redemptionCount}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}`,
              },
              {
                key: 'window',
                header: 'Runs',
                cell: (p) => `${formatDate(p.startsAt)} – ${p.endsAt ? formatDate(p.endsAt) : 'open'}`,
              },
              {
                key: 'active',
                header: 'Status',
                cell: (p) => <StatusBadge status={p.isActive ? 'ACTIVE' : 'PAUSED'} />,
              },
              {
                key: 'edit',
                header: <span className="sr-only">Actions</span>,
                cell: (p) =>
                  can('promotion:write') ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      Edit<span className="sr-only"> {p.name}</span>
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </QueryState>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New promotion' : 'Edit promotion'}
        size="lg"
      >
        {editing !== null ? (
          <PromotionForm promotion={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>
    </div>
  );
}

export default function PromotionsPage() {
  return (
    <RequirePermission permission="promotion:read">
      <Promotions />
    </RequirePermission>
  );
}

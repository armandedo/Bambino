'use client';

import {
  AdminGarmentQuery,
  AdminTransitionGarmentMutation,
  type GarmentCondition,
  type GarmentStatus,
} from '@bambino/api-client';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  DataTable,
  SelectField,
  StatusBadge,
  TextField,
  humanizeStatus,
} from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

const CONDITIONS: GarmentCondition[] = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'RECYCLE'];

function Transition({ garmentId, allowed }: { garmentId: string; allowed: GarmentStatus[] }) {
  const [status, setStatus] = useState<GarmentStatus | ''>('');
  const [condition, setCondition] = useState<GarmentCondition | ''>('');
  const [note, setNote] = useState('');
  const move = useAction(
    () =>
      api.request(AdminTransitionGarmentMutation, {
        input: {
          garmentId,
          status: status as GarmentStatus,
          condition: condition || null,
          note: note.trim() || null,
        },
      }),
    {
      success: (r) => `Moved to ${humanizeStatus(r.adminTransitionGarment.status).toLowerCase()}`,
      invalidate: [['admin-garment', garmentId], ['admin-garments']],
    },
  );
  if (allowed.length === 0)
    return (
      <p className="text-sm text-foreground-muted">No further moves: this garment has left circulation.</p>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      aria-label="Move garment"
      onSubmit={(event) => {
        event.preventDefault();
        if (status) move.mutate(undefined, { onSuccess: () => setStatus('') });
      }}
    >
      <SelectField
        label="Move to"
        value={status}
        onChange={(event) => setStatus(event.target.value as GarmentStatus | '')}
        placeholder="Choose"
        options={allowed.map((s) => ({ value: s, label: humanizeStatus(s) }))}
      />
      <SelectField
        label="Condition (optional)"
        value={condition}
        onChange={(event) => setCondition(event.target.value as GarmentCondition | '')}
        placeholder="Unchanged"
        options={CONDITIONS.map((c) => ({ value: c, label: humanizeStatus(c) }))}
      />
      <TextField label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
      <Button type="submit" disabled={!status} loading={move.isPending}>
        Move
      </Button>
    </form>
  );
}

function GarmentDetail({ id }: { id: string }) {
  const { can } = useStaff();
  const query = useQuery({
    queryKey: ['admin-garment', id],
    queryFn: async () => (await api.request(AdminGarmentQuery, { id })).adminGarment,
  });
  return (
    <QueryState query={query} what="this garment">
      {(garment) =>
        !garment ? (
          <Alert tone="warning">Garment not found.</Alert>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-2xl font-bold">{garment.tagCode}</h2>
                <p className="text-foreground-muted">
                  {garment.product.name} · {garment.variant.size.label} · {garment.variant.color} ·{' '}
                  {garment.variant.sku}
                </p>
              </div>
              <StatusBadge status={garment.status} />
            </div>
            <dl className="grid gap-3 sm:grid-cols-4">
              {[
                ['Condition', humanizeStatus(garment.condition)],
                ['Completed cycles', String(garment.lifecycleCount)],
                ['Procured', formatDate(garment.procuredAt)],
                ['Last inspected', formatDate(garment.lastInspectedAt)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-surface p-3">
                  <dt className="text-sm text-foreground-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {garment.currentCustomer ? (
              <p>
                With{' '}
                {can('customer:read') ? (
                  <NextLink
                    href={`/customers/${garment.currentCustomer.id}`}
                    className="text-link underline underline-offset-4 hover:decoration-2"
                  >
                    {fullName(garment.currentCustomer)}
                  </NextLink>
                ) : (
                  fullName(garment.currentCustomer)
                )}
              </p>
            ) : null}
            {can('garment:write') ? (
              <Card>
                <CardHeader
                  title="Move"
                  description="Only the moves the lifecycle allows from the current status are offered."
                  level={3}
                />
                <Transition garmentId={garment.id} allowed={garment.allowedNextStatuses} />
              </Card>
            ) : null}
            <DataTable
              caption="Lifecycle history"
              rows={[...garment.events].reverse()}
              rowKey={(e) => e.id}
              columns={[
                { key: 'when', header: 'When', rowHeader: true, cell: (e) => formatDate(e.occurredAt, true) },
                { key: 'event', header: 'Event', cell: (e) => humanizeStatus(e.eventType) },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (e) => (
                    <span className="flex flex-wrap items-center gap-1">
                      {e.previousStatus ? (
                        <span className="text-foreground-muted">{humanizeStatus(e.previousStatus)} →</span>
                      ) : null}
                      <StatusBadge status={e.newStatus} />
                    </span>
                  ),
                },
                { key: 'condition', header: 'Condition', cell: (e) => humanizeStatus(e.newCondition) },
                { key: 'by', header: 'By', cell: (e) => e.actorName ?? 'System' },
              ]}
            />
          </div>
        )
      }
    </QueryState>
  );
}

export default function GarmentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="garment:read">
      <GarmentDetail id={id} />
    </RequirePermission>
  );
}

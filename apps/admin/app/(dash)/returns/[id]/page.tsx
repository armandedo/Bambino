'use client';

import {
  AdminApproveReturnMutation,
  AdminCompleteReturnMutation,
  AdminMarkReturnReceivedMutation,
  AdminRecordInspectionMutation,
  AdminRejectReturnMutation,
  AdminReturnQuery,
  type GarmentCondition,
  type GarmentStatus,
  type ReturnRequest,
} from '@bambino/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Modal,
  MoneyText,
  RadioGroup,
  SelectField,
  StatusBadge,
  TextField,
  TextareaField,
  humanizeStatus,
} from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DeliverySteps } from '@/components/delivery-steps';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

type ReturnItem = ReturnRequest['items'][number];

const CONDITIONS: { value: GarmentCondition; label: string; description: string }[] = [
  { value: 'NEW', label: 'New', description: 'Unworn, tags or packaging intact' },
  { value: 'EXCELLENT', label: 'Excellent', description: 'No visible wear' },
  { value: 'GOOD', label: 'Good', description: 'Light wear, fully usable' },
  { value: 'FAIR', label: 'Fair', description: 'Visible wear; may need refurbishing' },
  { value: 'DAMAGED', label: 'Damaged', description: 'Stains, holes or broken fastenings' },
  { value: 'RECYCLE', label: 'Recycle only', description: 'Not wearable' },
];

const NEXT_BY_OUTCOME: Record<'ACCEPTED' | 'REJECTED', { value: GarmentStatus; label: string }[]> = {
  ACCEPTED: [
    { value: 'AVAILABLE_FOR_REUSE', label: 'Back into circulation (available for reuse)' },
    { value: 'REFURBISHING', label: 'Refurbish first' },
    { value: 'RESALE', label: 'Resale' },
  ],
  REJECTED: [
    { value: 'RECYCLE', label: 'Recycle' },
    { value: 'RESALE', label: 'Resale' },
  ],
};

const OPEN_FOR_INSPECTION = ['RECEIVED', 'INSPECTING'];

function InspectionForm({ item, returnId }: { item: ReturnItem; returnId: string }) {
  const [condition, setCondition] = useState<GarmentCondition | ''>('');
  const [outcome, setOutcome] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [nextStatus, setNextStatus] = useState<GarmentStatus>('AVAILABLE_FOR_REUSE');
  const [notes, setNotes] = useState('');
  const record = useAction(
    () =>
      api.request(AdminRecordInspectionMutation, {
        input: {
          returnItemId: item.id,
          condition: condition as GarmentCondition,
          outcome,
          garmentStatus: nextStatus,
          notes: notes.trim() || null,
        },
      }),
    {
      success: `Inspection recorded for ${item.garment.tagCode}`,
      invalidate: [['admin-return', returnId], ['admin-returns']],
    },
  );
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
      aria-label={`Inspect ${item.garment.tagCode}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (condition) record.mutate(undefined);
      }}
    >
      <SelectField
        label="Condition"
        value={condition}
        onChange={(event) => setCondition(event.target.value as GarmentCondition | '')}
        placeholder="Choose a condition"
        options={CONDITIONS.map((c) => ({ value: c.value, label: `${c.label}: ${c.description}` }))}
        required
      />
      <RadioGroup
        legend="Decision"
        name={`outcome-${item.id}`}
        value={outcome}
        onChange={(value) => {
          const next = value as 'ACCEPTED' | 'REJECTED';
          setOutcome(next);
          setNextStatus(NEXT_BY_OUTCOME[next][0]?.value ?? 'RECYCLE');
        }}
        options={[
          {
            value: 'ACCEPTED',
            label: 'Accept',
            description: 'The family earns exchange credit for this piece.',
          },
          { value: 'REJECTED', label: 'Reject', description: 'No credit.' },
        ]}
      />
      <SelectField
        label="Where it goes next"
        value={nextStatus}
        onChange={(event) => setNextStatus(event.target.value as GarmentStatus)}
        options={NEXT_BY_OUTCOME[outcome]}
      />
      <TextareaField
        label="Notes (optional)"
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      <Button type="submit" className="w-fit" disabled={!condition} loading={record.isPending}>
        Record inspection
      </Button>
    </form>
  );
}

function ItemCard({ item, request }: { item: ReturnItem; request: ReturnRequest }) {
  const { can } = useStaff();
  const inspected = item.outcome !== null;
  return (
    <li>
      <Card padding="sm" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              {item.garment.product.name} · {item.garment.size.label} · {item.garment.color}
            </p>
            <p className="text-sm text-foreground-muted">
              Tag{' '}
              <NextLink
                href={`/garments/${item.garment.id}`}
                className="font-mono text-link underline underline-offset-4 hover:decoration-2"
              >
                {item.garment.tagCode}
              </NextLink>
              {item.reportedFit ? ` · parent says: ${humanizeStatus(item.reportedFit).toLowerCase()}` : ''}
            </p>
          </div>
          <StatusBadge status={item.garment.status} />
        </div>
        {inspected ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={item.outcome === 'ACCEPTED' ? 'success' : 'danger'}>
              {humanizeStatus(item.outcome ?? '')}
            </Badge>
            Condition: {humanizeStatus(item.inspectedCondition ?? '')}
            {item.creditEarned ? (
              <span>
                · credit <MoneyText value={item.creditEarned} className="font-semibold" />
              </span>
            ) : null}
          </p>
        ) : OPEN_FOR_INSPECTION.includes(request.status) && can('return:write') ? (
          <InspectionForm item={item} returnId={request.id} />
        ) : (
          <p className="text-sm text-foreground-muted">Inspected once the pieces are received.</p>
        )}
      </Card>
    </li>
  );
}

function ReturnDetail({ id }: { id: string }) {
  const { can } = useStaff();
  const key = ['admin-return', id];
  const invalidate = [key, ['admin-returns']];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await api.request(AdminReturnQuery, { id })).adminReturn,
  });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const approve = useAction(() => api.request(AdminApproveReturnMutation, { id }), {
    success: 'Return approved',
    invalidate,
  });
  const received = useAction(() => api.request(AdminMarkReturnReceivedMutation, { id }), {
    success: 'Marked as received',
    invalidate,
  });
  const complete = useAction(() => api.request(AdminCompleteReturnMutation, { id }), {
    success: 'Return completed',
    invalidate,
  });
  const reject = useAction(() => api.request(AdminRejectReturnMutation, { id, reason }), {
    success: 'Return rejected',
    invalidate,
  });

  return (
    <QueryState query={query} what="this return">
      {(data) => {
        if (!data) return <Alert tone="warning">Return not found.</Alert>;
        const request = data.returnRequest;
        const writable = can('return:write');
        return (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  Return <span className="font-mono">{request.returnNumber}</span>
                </h2>
                <p className="text-foreground-muted">
                  {fullName(data.customer)} · requested {formatDate(request.createdAt, true)} ·{' '}
                  {humanizeStatus(request.reason)}
                </p>
              </div>
              <StatusBadge status={request.status} />
            </div>
            {request.customerNote ? (
              <Alert tone="info" title="Note from the parent">
                {request.customerNote}
              </Alert>
            ) : null}
            {request.rejectionReason ? (
              <Alert tone="warning" title="Rejected">
                {request.rejectionReason}
              </Alert>
            ) : null}

            {writable ? (
              <div className="flex flex-wrap gap-2">
                {request.status === 'REQUESTED' ? (
                  <>
                    <Button loading={approve.isPending} onClick={() => approve.mutate(undefined)}>
                      Approve return
                    </Button>
                    <Button variant="ghost" onClick={() => setRejecting(true)}>
                      Reject
                    </Button>
                  </>
                ) : null}
                {['APPROVED', 'IN_TRANSIT'].includes(request.status) ? (
                  <Button
                    variant="outline"
                    loading={received.isPending}
                    onClick={() => received.mutate(undefined)}
                  >
                    Mark pieces received
                  </Button>
                ) : null}
                {request.status === 'ACCEPTED' ? (
                  <Button loading={complete.isPending} onClick={() => complete.mutate(undefined)}>
                    Complete return
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <section aria-label="Pieces" className="flex flex-col gap-3">
                <h3 className="font-display text-lg font-bold">Pieces</h3>
                <ul className="flex flex-col gap-3">
                  {request.items.map((item) => (
                    <ItemCard key={item.id} item={item} request={request} />
                  ))}
                </ul>
              </section>
              <Card as="section" aria-label="Pickup">
                <CardHeader title="Pickup" level={3} />
                {request.pickup ? (
                  <DeliverySteps
                    delivery={request.pickup}
                    invalidate={invalidate}
                    receivedLabel="Collected and received"
                  />
                ) : (
                  <p className="text-sm text-foreground-muted">
                    {request.status === 'REQUESTED'
                      ? 'Created when the return is approved, if the parent asked for pickup.'
                      : 'The parent drops the pieces off.'}
                  </p>
                )}
              </Card>
            </div>

            <Modal
              open={rejecting}
              onClose={() => setRejecting(false)}
              title="Reject this return?"
              description="The pieces stay with the family. The reason is shown to the parent."
              footer={
                <>
                  <Button variant="outline" onClick={() => setRejecting(false)}>
                    Keep it
                  </Button>
                  <Button
                    variant="danger"
                    disabled={reason.trim().length < 3}
                    loading={reject.isPending}
                    onClick={() => reject.mutate(undefined, { onSuccess: () => setRejecting(false) })}
                  >
                    Reject return
                  </Button>
                </>
              }
            >
              <TextField
                label="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </Modal>
          </div>
        );
      }}
    </QueryState>
  );
}

export default function ReturnPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="return:read">
      <ReturnDetail id={id} />
    </RequirePermission>
  );
}

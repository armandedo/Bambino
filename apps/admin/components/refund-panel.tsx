'use client';

import {
  type AdminPayment,
  AdminApproveRefundMutation,
  AdminRejectRefundMutation,
  AdminRequestRefundMutation,
  type RefundMethod,
} from '@bambino/api-client';
import {
  Button,
  Modal,
  MoneyText,
  SelectField,
  StatusBadge,
  TextField,
  TextareaField,
  humanizeStatus,
} from '@bambino/ui';
import type { QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { useAction } from '@/components/kit';
import { formatDate } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

type RefundablePayment = Pick<AdminPayment, 'payment' | 'refundableAmount' | 'refundMethods' | 'refunds'>;

/**
 * Refunds for one payment: their status, approve and reject for requested ones, and a form to request a new one.
 * Shown to staff with refund:read; the actions need refund:write. Nothing is paid out until a refund is approved.
 */
export function RefundPanel({
  payment: entry,
  invalidate,
}: {
  payment: RefundablePayment;
  invalidate: QueryKey[];
}) {
  const { can } = useStaff();
  const { payment, refundableAmount, refundMethods, refunds = [] } = entry;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(refundableAmount.amount));
  const [method, setMethod] = useState<RefundMethod>('PROVIDER');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());

  const request = useAction(
    () =>
      api.request(AdminRequestRefundMutation, {
        input: { idempotencyKey: key, paymentId: payment.id, amount: Number(amount), method, reason },
      }),
    { success: 'Refund requested. It needs approval before anything is paid out.', invalidate },
  );
  const approve = useAction((id: string) => api.request(AdminApproveRefundMutation, { id }), {
    success: (r) =>
      r.adminApproveRefund.refund.status === 'FAILED'
        ? 'The provider refused the refund.'
        : 'Refund approved and sent. It completes when the provider confirms.',
    invalidate,
  });
  const reject = useAction((id: string) => api.request(AdminRejectRefundMutation, { id }), {
    success: 'Refund rejected. The customer has been told.',
    invalidate,
  });

  const amountValue = Number(amount);
  const amountValid =
    Number.isInteger(amountValue) && amountValue > 0 && amountValue <= refundableAmount.amount;
  const canWrite = can('refund:write');

  return (
    <div className="flex flex-col gap-2 text-sm">
      {refunds.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Refunds">
          {refunds.map(({ refund, reason: why, failureCode }) => (
            <li key={refund.id} className="flex flex-col gap-1 rounded-lg border border-border p-2">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Refund <MoneyText value={refund.amount} className="font-semibold" /> ·{' '}
                  {humanizeStatus(refund.method)} · {formatDate(refund.requestedAt, true)}
                </span>
                <StatusBadge status={refund.status} />
              </span>
              <span className="text-foreground-muted">
                {why}
                {failureCode ? ` · ${humanizeStatus(failureCode)}` : ''}
              </span>
              {canWrite && refund.status === 'REQUESTED' ? (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    loading={approve.isPending && approve.variables === refund.id}
                    onClick={() => approve.mutate(refund.id)}
                  >
                    Approve refund
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={reject.isPending && reject.variables === refund.id}
                    onClick={() => reject.mutate(refund.id)}
                  >
                    Reject
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canWrite && refundableAmount.amount > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => {
            setAmount(String(refundableAmount.amount));
            setKey(crypto.randomUUID());
            setOpen(true);
          }}
        >
          Refund…
        </Button>
      ) : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request a refund"
        description={
          <>
            Up to <MoneyText value={refundableAmount} /> can be refunded. The refund waits for approval.
          </>
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!amountValid || reason.trim().length < 3}
              loading={request.isPending}
              onClick={() => request.mutate(undefined, { onSuccess: () => setOpen(false) })}
            >
              Request refund
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField
            label={`Amount (${refundableAmount.currency})`}
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
            error={amount && !amountValid ? 'Enter a whole amount up to what is refundable.' : undefined}
            required
          />
          {refundMethods.length > 1 ? (
            <SelectField
              label="Refund to"
              value={method}
              onChange={(event) => setMethod(event.target.value as RefundMethod)}
              options={refundMethods.map((value) => ({
                value,
                label: value === 'PROVIDER' ? 'The wallet that paid' : 'Exchange credit',
              }))}
            />
          ) : null}
          <TextareaField
            label="Reason (staff only)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </div>
      </Modal>
    </div>
  );
}

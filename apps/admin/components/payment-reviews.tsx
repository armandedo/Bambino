'use client';

import {
  type AdminPaymentReview,
  AdminPaymentReviewsQuery,
  AdminResolvePaymentReviewMutation,
  type PaymentReviewReason,
  type PaymentReviewResolution,
} from '@bambino/api-client';
import { Button, Card, MoneyText, StatusBadge, humanizeStatus } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';
import { QueryState, useAction } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

const REASONS: Record<PaymentReviewReason, string> = {
  ORDER_CANCELLED:
    'The customer approved this payment after the order was cancelled. Nothing was sent. Refund it.',
  ORDER_NOT_AWAITING_PAYMENT:
    'This payment arrived for an order that was already paid or no longer awaiting payment. Refund it.',
  OUTCOME_UNCONFIRMED:
    'The provider never said whether this payment went through. Check the provider account for this reference.',
};

const RESOLUTIONS: { value: PaymentReviewResolution; label: string }[] = [
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'NO_MONEY_RECEIVED', label: 'No money was received' },
  { value: 'OTHER', label: 'Other' },
];

const FIELD = 'min-h-10 rounded-md border border-border bg-surface px-3 text-sm';

function ReviewCard({ review }: { review: AdminPaymentReview }) {
  const { can } = useStaff();
  const [resolution, setResolution] = useState<PaymentReviewResolution>('REFUNDED');
  const [note, setNote] = useState('');
  const resolve = useAction(
    () =>
      api.request(AdminResolvePaymentReviewMutation, {
        input: { id: review.id, resolution, note: note.trim() },
      }),
    {
      success: () => 'Outcome recorded. No money was moved.',
      invalidate: [['admin-payment-reviews'], ['admin-payments']],
    },
  );
  const { payment, customer, providerReference } = review.payment;
  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <MoneyText value={payment.amount} className="font-semibold" />
          <span className="text-sm text-foreground-muted">
            {humanizeStatus(payment.provider)} · {fullName(customer)} · {formatDate(review.createdAt, true)}
          </span>
        </span>
        <StatusBadge status={payment.status} />
      </div>
      <p className="text-sm">{REASONS[review.reason]}</p>
      <p className="text-sm text-foreground-muted">
        Reference <span className="font-mono">{providerReference ?? '—'}</span>
        {review.order ? (
          <>
            {' · '}
            <NextLink
              href={`/orders/${review.order.id}`}
              className="text-link underline underline-offset-4 hover:decoration-2"
            >
              order {review.order.orderNumber}
            </NextLink>{' '}
            ({humanizeStatus(review.order.status).toLowerCase()})
          </>
        ) : null}
      </p>
      {can('payment:write') ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            resolve.mutate(undefined);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Outcome</span>
            <select
              className={FIELD}
              value={resolution}
              onChange={(event) => setResolution(event.target.value as PaymentReviewResolution)}
            >
              {RESOLUTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">What was done</span>
            <input
              className={FIELD}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
          </label>
          <Button type="submit" size="sm" loading={resolve.isPending}>
            Record outcome
          </Button>
          <p className="w-full text-xs text-foreground-muted">
            This only records what you did and closes the case. It does not send a refund.
          </p>
        </form>
      ) : null}
    </Card>
  );
}

/** Payments that need a person, shown above the payment list. Refunds are made on the payment itself, below. */
export function PaymentReviews() {
  const reviews = useQuery({
    queryKey: ['admin-payment-reviews'],
    queryFn: async () =>
      (await api.request(AdminPaymentReviewsQuery, { open: true, page: { first: 50 } })).adminPaymentReviews,
  });
  return (
    <QueryState query={reviews} what="payment reviews">
      {(page) =>
        page.items.length === 0 ? null : (
          <section aria-labelledby="payment-reviews-heading" className="flex flex-col gap-3">
            <h2 id="payment-reviews-heading" className="text-lg font-semibold">
              Needs review ({page.totalCount})
            </h2>
            <p className="text-sm text-foreground-muted">
              These payments were not applied to an order automatically. Recording an outcome here does not
              move any money: to refund, use the refund controls on the payment in the list below first, then
              record the outcome here.
            </p>
            <ul className="flex flex-col gap-3">
              {page.items.map((review) => (
                <li key={review.id}>
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
          </section>
        )
      }
    </QueryState>
  );
}

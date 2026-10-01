'use client';

import {
  CreateExchangeMutation,
  type FitOutcome,
  type ReturnReason,
  type ReturnRequest,
  RequestReturnMutation,
  type Viewer,
} from '@bambino/api-client';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  Modal,
  MoneyText,
  RadioGroup,
  SelectField,
  StatusBadge,
  TextareaField,
  buttonClasses,
  humanizeStatus,
} from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';
import { AddressPicker, DeliveryPicker } from '@/components/checkout-parts';
import { QueryState } from '@/components/query-state';
import { api, newIdempotencyKey } from '@/lib/browser-api';
import { errorMessage, formatDate } from '@/lib/messages';
import {
  keys,
  useCredits,
  useExchanges,
  useGarments,
  useReturns,
  useSubscriptionProducts,
} from '@/lib/queries';
import { useSession } from '@/lib/session';
import { PageTitle } from '../account-nav';

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'OUTGROWN', label: 'Outgrown' },
  { value: 'WRONG_SIZE', label: 'Wrong size' },
  { value: 'DEFECTIVE', label: 'Damaged or faulty' },
  { value: 'NOT_AS_EXPECTED', label: 'Not as expected' },
  { value: 'OTHER', label: 'Something else' },
];
const FITS: { value: FitOutcome; label: string }[] = [
  { value: 'TOO_SMALL', label: 'Too small' },
  { value: 'GOOD_FIT', label: 'Fitted well' },
  { value: 'TOO_LARGE', label: 'Too large' },
];

function invalidateCircular(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [keys.garments, keys.returns, keys.exchanges, keys.credits, keys.orders]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

function ReturnForm({
  viewer,
  garmentIds,
  onDone,
}: {
  viewer: Viewer;
  garmentIds: string[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReturnReason>('OUTGROWN');
  const [fits, setFits] = useState<Record<string, FitOutcome | ''>>({});
  const [pickup, setPickup] = useState(true);
  const defaultAddress = viewer.addresses.find((a) => a.isDefault) ?? viewer.addresses[0];
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [note, setNote] = useState('');
  const garments = useGarments();
  const submit = useMutation({
    mutationFn: () =>
      api.request(RequestReturnMutation, {
        input: {
          reason,
          customerNote: note.trim() === '' ? null : note.trim(),
          pickupAddressId: pickup ? addressId : null,
          items: garmentIds.map((garmentId) => {
            const fit = fits[garmentId];
            return fit ? { garmentId, reportedFit: fit } : { garmentId };
          }),
        },
      }),
    onSuccess: () => {
      invalidateCircular(queryClient);
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <RadioGroup
        legend="Why are they coming back?"
        name="reason"
        value={reason}
        onChange={(v) => setReason(v as ReturnReason)}
        options={REASONS}
      />
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">How did they fit? (helps future size recommendations)</p>
        {garmentIds.map((id) => {
          const garment = garments.data?.find((g) => g.id === id);
          return (
            <SelectField
              key={id}
              label={garment ? `${garment.product.name}, ${garment.size.label}` : id}
              value={fits[id] ?? ''}
              onChange={(event) =>
                setFits((current) => ({ ...current, [id]: event.target.value as FitOutcome | '' }))
              }
              placeholder="Not sure"
              options={FITS}
            />
          );
        })}
      </div>
      <Checkbox
        label="Collect them from my address"
        checked={pickup}
        onChange={(event) => setPickup(event.target.checked)}
        hint="Untick if you will drop them off."
      />
      {pickup ? (
        <AddressPicker viewer={viewer} value={addressId} onChange={setAddressId} legend="Pickup address" />
      ) : null}
      <TextareaField
        label="Anything we should know? (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
      />
      {submit.isError ? (
        <Alert tone="danger" live>
          {errorMessage(submit.error)}
        </Alert>
      ) : null}
      <Button loading={submit.isPending} disabled={pickup && !addressId} onClick={() => submit.mutate()}>
        Request return
      </Button>
    </div>
  );
}

/** Pick the replacement for each accepted piece; defaults to the next size of the same product. */
function ExchangeForm({
  viewer,
  request,
  onDone,
}: {
  viewer: Viewer;
  request: ReturnRequest;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const products = useSubscriptionProducts();
  const accepted = request.items.filter((item) => item.outcome === 'ACCEPTED');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const defaultAddress = viewer.addresses.find((a) => a.isDefault) ?? viewer.addresses[0];
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);

  const optionsFor = (item: (typeof accepted)[number]) => {
    const product = products.data?.find((p) => p.id === item.garment.product.id);
    return [...(product?.variants ?? [])]
      .filter((variant) => variant.availableForSubscription)
      .sort((a, b) => a.size.sortOrder - b.size.sortOrder)
      .map((variant) => ({
        value: variant.id,
        label: variant.size.label,
        sortOrder: variant.size.sortOrder,
      }));
  };
  const choiceFor = (item: (typeof accepted)[number]) => {
    const explicit = choices[item.id];
    if (explicit) return explicit;
    const next = optionsFor(item).find((option) => option.sortOrder > item.garment.size.sortOrder);
    return next?.value ?? '';
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!addressId || !deliveryCode) throw new Error('Choose an address and a delivery option.');
      return api.request(CreateExchangeMutation, {
        input: {
          idempotencyKey: key,
          returnRequestId: request.id,
          shippingAddressId: addressId,
          deliveryOptionCode: deliveryCode,
          items: accepted.map((item) => ({ returnItemId: item.id, requestedVariantId: choiceFor(item) })),
        },
      });
    },
    onSuccess: () => {
      invalidateCircular(queryClient);
      onDone();
    },
  });

  const ready = accepted.every((item) => choiceFor(item) !== '') && addressId && deliveryCode;

  return (
    <div className="flex flex-col gap-5">
      <QueryState query={products} what="available sizes">
        {() => (
          <div className="flex flex-col gap-3">
            {accepted.map((item) => (
              <SelectField
                key={item.id}
                label={`${item.garment.product.name} (returned ${item.garment.size.label})`}
                value={choiceFor(item)}
                onChange={(event) => setChoices((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder="Choose a size"
                options={optionsFor(item).map(({ value, label }) => ({ value, label }))}
              />
            ))}
          </div>
        )}
      </QueryState>
      <AddressPicker viewer={viewer} value={addressId} onChange={setAddressId} />
      <DeliveryPicker value={deliveryCode} onChange={setDeliveryCode} />
      <p className="text-sm text-foreground-muted">
        Your exchange credit is applied automatically. Our team approves the exchange before any payment is
        asked for.
      </p>
      {create.isError ? (
        <Alert tone="danger" live>
          {errorMessage(create.error)}
        </Alert>
      ) : null}
      <Button disabled={!ready} loading={create.isPending} onClick={() => create.mutate()}>
        Request exchange
      </Button>
    </div>
  );
}

export default function ExchangesPage() {
  const { viewer } = useSession();
  const garments = useGarments();
  const returns = useReturns();
  const exchanges = useExchanges();
  const credits = useCredits();
  const [selected, setSelected] = useState<string[]>([]);
  const [returning, setReturning] = useState(false);
  const [exchangeFor, setExchangeFor] = useState<ReturnRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!viewer) return null;
  const exchangedReturnIds = new Set((exchanges.data ?? []).map((e) => e.returnRequest?.id).filter(Boolean));

  return (
    <>
      <PageTitle
        title="Returns & exchanges"
        description="Send back outgrown pieces, earn credit and get the next size."
      />
      {notice ? (
        <Alert tone="success" live>
          {notice}
        </Alert>
      ) : null}

      <Card as="section" aria-labelledby="held" className="flex flex-col gap-4">
        <CardHeader
          title={<span id="held">Pieces you have</span>}
          description="Choose the ones to send back."
          level={2}
        />
        <QueryState query={garments} what="your pieces">
          {(list) =>
            list.length === 0 ? (
              <p className="text-foreground-muted">You have no pieces from us at the moment.</p>
            ) : (
              <>
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">Pieces to return</legend>
                  {list.map((garment) => (
                    <Checkbox
                      key={garment.id}
                      label={`${garment.product.name}, ${garment.size.label}, ${garment.color}`}
                      hint={
                        garment.status === 'WITH_CUSTOMER'
                          ? `Tag ${garment.tagCode}`
                          : `${humanizeStatus(garment.status)} · tag ${garment.tagCode}`
                      }
                      disabled={garment.status !== 'WITH_CUSTOMER'}
                      checked={selected.includes(garment.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, garment.id]
                            : current.filter((id) => id !== garment.id),
                        )
                      }
                    />
                  ))}
                </fieldset>
                <Button className="w-fit" disabled={selected.length === 0} onClick={() => setReturning(true)}>
                  Return {selected.length > 0 ? selected.length : ''}{' '}
                  {selected.length === 1 ? 'piece' : 'pieces'}
                </Button>
              </>
            )
          }
        </QueryState>
      </Card>

      <section aria-labelledby="returns-title" className="flex flex-col gap-3">
        <h2 id="returns-title" className="font-display text-xl font-bold">
          Returns
        </h2>
        <QueryState query={returns} what="your returns">
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="No returns yet"
                description="When your baby outgrows a piece, send it back here."
                level={3}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {list.map((request) => {
                  const acceptedCount = request.items.filter((i) => i.outcome === 'ACCEPTED').length;
                  const canExchange =
                    ['ACCEPTED', 'COMPLETED'].includes(request.status) &&
                    acceptedCount > 0 &&
                    !exchangedReturnIds.has(request.id);
                  return (
                    <li key={request.id}>
                      <Card padding="sm" className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm">{request.returnNumber}</span>
                          <StatusBadge status={request.status} />
                        </div>
                        <ul className="flex flex-col gap-1 text-sm">
                          {request.items.map((item) => (
                            <li key={item.id} className="flex flex-wrap justify-between gap-2">
                              <span>
                                {item.garment.product.name}, {item.garment.size.label}
                                {item.inspectedCondition ? (
                                  <span className="text-foreground-muted">
                                    {' '}
                                    · inspected: {humanizeStatus(item.inspectedCondition)}
                                  </span>
                                ) : null}
                              </span>
                              <span>
                                {item.outcome === 'ACCEPTED' && item.creditEarned ? (
                                  <span className="font-medium text-success-foreground">
                                    + <MoneyText value={item.creditEarned} /> credit
                                  </span>
                                ) : item.outcome === 'REJECTED' ? (
                                  <span className="text-foreground-muted">Not accepted</span>
                                ) : (
                                  <span className="text-foreground-muted">Awaiting inspection</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {request.pickup ? (
                          <p className="text-sm text-foreground-muted">
                            Pickup: {humanizeStatus(request.pickup.status).toLowerCase()}
                            {request.pickup.estimatedDeliveryDate
                              ? `, expected ${formatDate(request.pickup.estimatedDeliveryDate)}`
                              : ''}
                          </p>
                        ) : null}
                        {request.rejectionReason ? (
                          <p className="text-sm">Reason: {request.rejectionReason}</p>
                        ) : null}
                        {canExchange ? (
                          <Button size="sm" className="w-fit" onClick={() => setExchangeFor(request)}>
                            Choose the next size
                          </Button>
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryState>
      </section>

      <section aria-labelledby="exchanges-title" className="flex flex-col gap-3">
        <h2 id="exchanges-title" className="font-display text-xl font-bold">
          Exchanges
        </h2>
        <QueryState query={exchanges} what="your exchanges">
          {(list) =>
            list.length === 0 ? (
              <p className="text-foreground-muted">No exchanges yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {list.map((exchange) => (
                  <li key={exchange.id}>
                    <Card padding="sm" className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm">{exchange.exchangeNumber}</span>
                        <StatusBadge status={exchange.status} />
                      </div>
                      <p className="text-sm">
                        {exchange.items
                          .map((item) => `${item.product.name} in ${item.requestedVariant.size.label}`)
                          .join(', ')}
                      </p>
                      {exchange.status === 'REQUESTED' ? (
                        <p className="text-sm text-foreground-muted">Waiting for our team to approve.</p>
                      ) : null}
                      {exchange.replacementOrder ? (
                        <NextLink
                          href={`/account/orders/${exchange.replacementOrder.id}`}
                          className={buttonClasses({
                            size: 'sm',
                            variant:
                              exchange.replacementOrder.status === 'PENDING_PAYMENT' &&
                              exchange.status === 'APPROVED'
                                ? 'primary'
                                : 'outline',
                            className: 'w-fit',
                          })}
                        >
                          {exchange.replacementOrder.status === 'PENDING_PAYMENT' &&
                          exchange.status === 'APPROVED'
                            ? 'Pay the difference'
                            : `Order ${exchange.replacementOrder.orderNumber}`}
                        </NextLink>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>

      <Card as="section" aria-labelledby="credit-title" className="flex flex-col gap-4">
        <QueryState query={credits} what="your credit">
          {(summary) => (
            <>
              <CardHeader
                title={<span id="credit-title">Exchange credit</span>}
                description="Balance"
                level={2}
                action={
                  <MoneyText value={summary.balance} className="font-display text-2xl font-extrabold" />
                }
              />
              <DataTable
                caption="Credit history"
                captionHidden
                rows={summary.entries}
                rowKey={(entry) => entry.id}
                empty="No credit yet. Returned pieces that pass inspection earn credit."
                columns={[
                  { key: 'date', header: 'Date', rowHeader: true, cell: (e) => formatDate(e.createdAt) },
                  { key: 'type', header: 'Type', cell: (e) => humanizeStatus(e.type) },
                  { key: 'note', header: 'Details', cell: (e) => e.note ?? '' },
                  {
                    key: 'amount',
                    header: 'Amount',
                    align: 'end',
                    cell: (e) => <MoneyText value={e.amount} />,
                  },
                ]}
              />
            </>
          )}
        </QueryState>
      </Card>

      <Modal open={returning} onClose={() => setReturning(false)} title="Return pieces" size="lg">
        {returning ? (
          <ReturnForm
            viewer={viewer}
            garmentIds={selected}
            onDone={() => {
              setReturning(false);
              setSelected([]);
              setNotice('Return requested. We’ll confirm the pickup.');
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={exchangeFor !== null}
        onClose={() => setExchangeFor(null)}
        title="Choose the next size"
        size="lg"
      >
        {exchangeFor ? (
          <ExchangeForm
            viewer={viewer}
            request={exchangeFor}
            onDone={() => {
              setExchangeFor(null);
              setNotice('Exchange requested. We’ll let you know when it is approved.');
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

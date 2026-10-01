'use client';

import { SelectSubscriptionItemsMutation, type Subscription } from '@bambino/api-client';
import { Alert, Badge, Button, EmptyState, SelectField, cn } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { keys, useSizes, useSubscriptionProducts } from '@/lib/queries';
import { ProductArt } from './product-art';
import { QueryState } from './query-state';

/**
 * Choose this cycle's pieces. Each choice reserves a specific tagged garment on the server (reused ones first);
 * choosing again replaces the earlier choice.
 */
export function ItemPicker({
  subscription,
  initialSize,
  onSaved,
}: {
  subscription: Subscription;
  initialSize: string | null;
  onSaved: (next: Subscription) => void;
}) {
  const products = useSubscriptionProducts();
  const sizes = useSizes();
  const queryClient = useQueryClient();
  const limit = subscription.plan.itemsPerCycle;
  const [size, setSize] = useState(initialSize ?? '');
  const [chosen, setChosen] = useState<string[]>(() =>
    subscription.items.filter((item) => item.status === 'SELECTED').map((item) => item.variant.id),
  );
  const save = useMutation({
    mutationFn: async () =>
      (await api.request(SelectSubscriptionItemsMutation, { id: subscription.id, variantIds: chosen }))
        .selectSubscriptionItems,
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: keys.subscriptions });
      onSaved(next);
    },
  });

  function toggle(variantId: string) {
    setChosen((current) =>
      current.includes(variantId)
        ? current.filter((id) => id !== variantId)
        : current.length < limit
          ? [...current, variantId]
          : current,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SelectField
          label="Size"
          value={size}
          onChange={(event) => setSize(event.target.value)}
          placeholder="Choose a size"
          options={(sizes.data ?? []).map((s) => ({ value: s.code, label: s.label }))}
          hint={initialSize ? `Recommended: ${initialSize}` : undefined}
        />
        <p className="text-sm font-medium" aria-live="polite">
          {chosen.length} of {limit} chosen
        </p>
      </div>
      <QueryState query={products} what="the subscription collection">
        {(list) => {
          const cards = list.flatMap((product) =>
            product.variants
              .filter((variant) => variant.size.code === size)
              .map((variant) => ({ product, variant })),
          );
          if (!size) return <p className="text-foreground-muted">Choose a size to see what is available.</p>;
          if (cards.length === 0)
            return (
              <EmptyState
                title="Nothing in this size right now"
                description="Try the next size up."
                level={3}
              />
            );
          return (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map(({ product, variant }) => {
                const selected = chosen.includes(variant.id);
                const full = !selected && chosen.length >= limit;
                return (
                  <li key={variant.id}>
                    <label
                      className={cn(
                        'flex h-full cursor-pointer gap-3 rounded-xl border bg-surface p-3 has-focus-visible:outline-2 has-focus-visible:outline-focus',
                        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
                        (!variant.availableForSubscription || full) && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        disabled={!variant.availableForSubscription || full}
                        onChange={() => toggle(variant.id)}
                      />
                      <div className="w-16 shrink-0 overflow-hidden rounded-lg">
                        <ProductArt seed={product.slug} className="aspect-square" />
                      </div>
                      <span className="flex flex-col gap-1">
                        <span className="font-semibold">{product.name}</span>
                        <span className="text-sm text-foreground-muted">{variant.size.label}</span>
                        {selected ? (
                          <Badge tone="brand">Chosen</Badge>
                        ) : !variant.availableForSubscription ? (
                          <Badge>Not available</Badge>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryState>
      {save.isError ? (
        <Alert tone="danger" live>
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      <Button
        size="lg"
        className="w-fit"
        disabled={chosen.length === 0}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Save my choice
      </Button>
    </div>
  );
}

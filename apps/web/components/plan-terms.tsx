import type { BillingInterval, Money } from '@bambino/api-client';
import { planTerms } from '@bambino/config';
import { plainPrice } from '@/lib/highlights';

/**
 * The terms of a plan, written out: what is charged and when, what a swap is, renewal, failed payments, pausing,
 * cancelling. The words come from packages/config (plan-terms.ts), built from the same policy the server enforces.
 * Folded away by default so a plan card stays short, but always one tap from the customer.
 */
export function PlanTermsList({
  plan,
  open = false,
}: {
  plan: {
    billingInterval: BillingInterval;
    itemsPerCycle: number;
    exchangesPerCycle: number | null;
    price: Money;
  };
  open?: boolean;
}) {
  const terms = planTerms({
    billingInterval: plan.billingInterval,
    itemsPerCycle: plan.itemsPerCycle,
    exchangesPerCycle: plan.exchangesPerCycle,
    priceText: plainPrice(plan.price),
  });
  return (
    <details open={open} className="group rounded-[15px] border border-border bg-surface-muted p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">
        Plan terms: billing, swaps, cancelling
      </summary>
      <dl className="mt-4 flex flex-col gap-3 text-sm">
        {terms.map((term) => (
          <div key={term.id}>
            <dt className="font-semibold text-primary">{term.title}</dt>
            <dd className="text-foreground-muted">{term.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

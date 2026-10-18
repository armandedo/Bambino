import type { BillingInterval, Money } from '@bambino/api-client';
import { planTerms } from '@bambino/config';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { price } from '@/lib/format';
import { colors, space } from '@/theme';

/** "month", "3 months", "year": how the plan's price is quoted. */
export const INTERVAL_WORD: Record<BillingInterval, string> = {
  MONTHLY: 'month',
  QUARTERLY: '3 months',
  ANNUAL: 'year',
};

/** One line saying what the plan includes, with the same definitions as the terms below it. */
export function planSummary(plan: {
  itemsPerCycle: number;
  exchangesPerCycle: number | null;
  billingInterval: BillingInterval;
}) {
  const period =
    plan.billingInterval === 'MONTHLY'
      ? 'month'
      : plan.billingInterval === 'QUARTERLY'
        ? '3-month period'
        : 'year';
  const swaps =
    plan.exchangesPerCycle === null
      ? 'unlimited swaps'
      : `${plan.exchangesPerCycle} ${plan.exchangesPerCycle === 1 ? 'swap' : 'swaps'} per ${period}`;
  return `Up to ${plan.itemsPerCycle} ${plan.itemsPerCycle === 1 ? 'garment' : 'garments'} at a time, with ${swaps}.`;
}

/**
 * The plan's terms in plain words (packages/config/plan-terms.ts, built from the same policy the server enforces):
 * what is charged and when, what a swap is, renewal, failed payments, pausing, cancelling and refunds.
 */
export function PlanTermsCard({
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
  const [expanded, setExpanded] = useState(open);
  const terms = planTerms({
    billingInterval: plan.billingInterval,
    itemsPerCycle: plan.itemsPerCycle,
    exchangesPerCycle: plan.exchangesPerCycle,
    priceText: price(plan.price),
  });
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ fontWeight: '700', color: colors.foreground }}>
          Plan terms: billing, swaps, cancelling {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={{ gap: space.md }}>
          {terms.map((term) => (
            <View key={term.id} style={{ gap: 2 }}>
              <Text style={{ fontWeight: '700', color: colors.foreground }}>{term.title}</Text>
              <Text style={{ color: colors['foreground-muted'], fontSize: 15, lineHeight: 21 }}>
                {term.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

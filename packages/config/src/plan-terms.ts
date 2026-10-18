import { getMarket } from './markets';
import { PLAN_ENTITLEMENT_POLICY, REFUND_POLICY, SUBSCRIPTION_POLICY } from './policies';

/**
 * The terms of a subscription plan, in plain words, for the plan page, the subscribe step and the mobile app.
 *
 * Every number and rule here is read from the same policy objects the server enforces (packages/config/policies.ts),
 * so what the customer is told and what the system does cannot drift apart. Change the policy and the wording
 * changes with it. A term is stated only when the code really behaves that way.
 */
export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface PlanTermsInput {
  billingInterval: BillingInterval;
  /** The box size: garments held at one time. */
  itemsPerCycle: number;
  /** Swaps (garments exchanged) per billing period; null means unlimited. */
  exchangesPerCycle: number | null;
  /** The price already formatted for display, for example "RF 39,000". */
  priceText: string;
  marketCode?: string;
}

export interface PlanTerm {
  id: 'price' | 'box' | 'swaps' | 'renewal' | 'failed-payment' | 'pause' | 'plan-change' | 'cancel';
  title: string;
  text: string;
}

const PERIOD: Record<BillingInterval, { every: string; period: string }> = {
  MONTHLY: { every: 'month', period: 'month' },
  QUARTERLY: { every: '3 months', period: '3-month period' },
  ANNUAL: { every: 'year', period: 'year' },
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function planTerms(input: PlanTermsInput): PlanTerm[] {
  const { every, period } = PERIOD[input.billingInterval];
  const market = getMarket(input.marketCode ?? 'RW');

  const taxSentence = !market.tax
    ? 'No tax is added to this price.'
    : market.tax.includedInPrices
      ? 'The price includes tax.'
      : 'Tax is added at checkout.';

  const swapsAllowed =
    input.exchangesPerCycle === null
      ? `Your plan includes unlimited swaps.`
      : input.exchangesPerCycle === 0
        ? 'Your plan does not include swaps.'
        : `Your plan includes ${plural(input.exchangesPerCycle, 'swap')} per ${period}.`;
  const swapsPrice =
    PLAN_ENTITLEMENT_POLICY.replacementPrice === 'INCLUDED_IN_PLAN'
      ? 'A swap within your allowance costs nothing extra; you pay only the delivery fee.'
      : 'A replacement is charged at the shop price, less your exchange credit.';
  const swapsReset = PLAN_ENTITLEMENT_POLICY.carryOverUnused
    ? 'Unused swaps carry over.'
    : `The count starts again at each renewal, and unused swaps do not carry over.`;

  const attempts = SUBSCRIPTION_POLICY.maxRenewalAttempts;

  return [
    {
      id: 'price',
      title: 'What you pay',
      text:
        `${input.priceText} every ${every}. ${taxSentence} ` +
        'Delivery is charged separately with each period, at the fee of the delivery option you chose.',
    },
    {
      id: 'box',
      title: 'Your box',
      text:
        `Up to ${plural(input.itemsPerCycle, 'garment')} at a time. ` +
        `You choose them at the start of each ${period}.`,
    },
    {
      id: 'swaps',
      title: 'Swaps',
      text:
        'A swap is one garment sent back and one other garment sent to you. ' +
        `${swapsAllowed} ${swapsReset} ${swapsPrice} ` +
        'Swaps are available while your subscription is active, once the returned garment has passed our inspection.',
    },
    {
      id: 'renewal',
      title: 'Renewal',
      text:
        `Your plan renews every ${every} until you cancel. We remind you ${plural(SUBSCRIPTION_POLICY.reminderDaysBeforeRenewal, 'day')} ahead. ` +
        `If you have a saved wallet, we send the payment request ourselves (up to ${attempts} attempts, ` +
        `${SUBSCRIPTION_POLICY.hoursBetweenRenewalAttempts} hours apart) and you approve it on your phone with your PIN. ` +
        'Without a saved wallet, you pay the renewal from your account.',
    },
    {
      id: 'failed-payment',
      title: 'If a payment fails',
      text:
        `From the renewal date your subscription shows as overdue until the payment is approved. You have ${plural(SUBSCRIPTION_POLICY.renewalGraceDays, 'day')} from the renewal date to pay; ` +
        'after that the subscription ends.',
    },
    {
      id: 'pause',
      title: 'Pausing',
      text:
        `You can pause for up to ${plural(SUBSCRIPTION_POLICY.maxPauseDays, 'day')}. ` +
        'The paused time is added to your period, so you do not lose days you have paid for.',
    },
    {
      id: 'plan-change',
      title: 'Changing plan',
      text:
        SUBSCRIPTION_POLICY.planChangeTiming === 'NEXT_RENEWAL'
          ? 'A change of plan takes effect at your next renewal.'
          : 'A change of plan takes effect straight away.',
    },
    {
      id: 'cancel',
      title: 'Cancelling and refunds',
      text:
        'You can cancel any time. Your plan then runs to the end of the period you have paid for, and you are not charged again. ' +
        (REFUND_POLICY.cancellableOrderTypes.includes('SUBSCRIPTION_CYCLE')
          ? 'A cancelled period can be refunded.'
          : 'Payments for a period that has started are not refunded.'),
    },
  ];
}

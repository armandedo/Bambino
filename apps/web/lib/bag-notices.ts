import type { BagAdjustment } from '@bambino/api-client';

/**
 * Plain words for a bag line the server changed. `merge` is the moment a guest bag joins a customer's account
 * (the quantity is what their bag holds afterwards); `guest` is a visitor's bag being checked while they browse.
 * A guest's sold-out piece gets no notice here: it stays in the bag, marked on its own line.
 */
export function describeAdjustment(adjustment: BagAdjustment, when: 'guest' | 'merge'): string | null {
  const name = adjustment.productName ?? 'An item';
  const { quantity } = adjustment;
  switch (adjustment.reason) {
    case 'UNAVAILABLE':
      return when === 'merge'
        ? `${name} is no longer available, so it was not added to your bag.`
        : `${name} is no longer available and was removed from your bag.`;
    case 'OUT_OF_STOCK':
      return when === 'merge' ? `${name} is out of stock, so it was not added to your bag.` : null;
    case 'LIMITED_STOCK':
      return quantity > 0
        ? `Only ${quantity} of ${name} left in stock, so your bag has ${quantity}.`
        : `${name} is out of stock, so it was not added to your bag.`;
    case 'QUANTITY_LIMIT':
      return `An order can hold at most ${quantity} of ${name}, so your bag has ${quantity}.`;
    case 'BAG_FULL':
      return `Your bag is full, so ${name} was not added.`;
    default:
      return null;
  }
}

export function describeAdjustments(
  adjustments: readonly BagAdjustment[],
  when: 'guest' | 'merge',
): string[] {
  return adjustments.flatMap((adjustment) => describeAdjustment(adjustment, when) ?? []);
}

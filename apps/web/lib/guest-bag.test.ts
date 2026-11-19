import { BAG_POLICY } from '@bambino/config';
import { describe, expect, it } from 'vitest';
import { describeAdjustment, describeAdjustments } from './bag-notices';
import {
  EMPTY_GUEST_BAG,
  MAX_BAG_LINES,
  MAX_BAG_QUANTITY,
  addToGuestBag,
  guestBagCount,
  parseGuestBag,
  reconcileGuestBag,
  serializeGuestBag,
  setGuestBagQuantity,
} from './guest-bag';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const key = () => 'merge-key-0001';

function added(state = EMPTY_GUEST_BAG, variantId = A, quantity = 1) {
  const change = addToGuestBag(state, variantId, quantity, key);
  if (!change.ok) throw new Error(`not added: ${change.reason}`);
  return change.state;
}

describe('the guest bag', () => {
  it('stores only variant ids, quantities and its merge key', () => {
    const state = added(added(), B, 2);
    expect(JSON.parse(serializeGuestBag(state))).toEqual({
      items: [
        { variantId: A, quantity: 1 },
        { variantId: B, quantity: 2 },
      ],
      mergeKey: 'merge-key-0001',
    });
  });

  it('gets its merge key with the first piece and keeps it while pieces remain', () => {
    const one = added();
    expect(one.mergeKey).toBe('merge-key-0001');
    const two = addToGuestBag(one, B, 1, () => 'another-key-0002');
    expect(two.state.mergeKey).toBe('merge-key-0001');
  });

  it('adds to a piece already in the bag, up to the limit', () => {
    let state = added(EMPTY_GUEST_BAG, A, 4);
    state = added(state, A, 5);
    expect(state.items).toEqual([{ variantId: A, quantity: 9 }]);
    const full = added(state, A, MAX_BAG_QUANTITY - 9);
    expect(full.items[0]?.quantity).toBe(MAX_BAG_QUANTITY);
    const over = addToGuestBag(full, A, 1, key);
    expect(over).toMatchObject({ ok: false, reason: 'QUANTITY_LIMIT' });
    expect(guestBagCount(over.state)).toBe(MAX_BAG_QUANTITY);
  });

  it('uses the limits the server enforces', () => {
    expect(MAX_BAG_QUANTITY).toBe(BAG_POLICY.maxQuantityPerItem);
    expect(MAX_BAG_LINES).toBe(BAG_POLICY.maxLines);
  });

  it('refuses another line when it is full', () => {
    const items = Array.from({ length: MAX_BAG_LINES }, (_, index) => ({
      variantId: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
      quantity: 1,
    }));
    expect(addToGuestBag({ items, mergeKey: 'k-12345678' }, A, 1, key)).toMatchObject({
      ok: false,
      reason: 'BAG_FULL',
    });
  });

  it('changes quantities, removes a piece at zero, and forgets its key when emptied', () => {
    const state = added(added(), B, 2);
    expect(setGuestBagQuantity(state, B, 5).items[1]).toEqual({ variantId: B, quantity: 5 });
    expect(setGuestBagQuantity(state, B, 99).items[1]?.quantity).toBe(MAX_BAG_QUANTITY);
    const onlyA = setGuestBagQuantity(state, B, 0);
    expect(onlyA.items).toEqual([{ variantId: A, quantity: 1 }]);
    expect(onlyA.mergeKey).toBe('merge-key-0001');
    expect(setGuestBagQuantity(onlyA, A, 0)).toBe(EMPTY_GUEST_BAG);
  });

  it('survives a reload: what was written is what is read', () => {
    const state = added(added(), B, 3);
    expect(parseGuestBag(serializeGuestBag(state))).toEqual(state);
  });

  it('drops anything malformed or unexpected when reading, including personal details', () => {
    expect(parseGuestBag(null)).toBe(EMPTY_GUEST_BAG);
    expect(parseGuestBag('not json')).toBe(EMPTY_GUEST_BAG);
    expect(parseGuestBag('{"items":"nope"}')).toBe(EMPTY_GUEST_BAG);
    const read = parseGuestBag(
      JSON.stringify({
        email: 'someone@example.com',
        items: [
          { variantId: A, quantity: 2, price: 1, name: 'Injected' },
          { variantId: A, quantity: 9 },
          { variantId: 'not-a-uuid', quantity: 1 },
          { variantId: B, quantity: 0 },
          { variantId: B, quantity: 500 },
        ],
        mergeKey: 'merge-key-0001',
      }),
    );
    expect(read).toEqual({
      items: [
        { variantId: A, quantity: 2 },
        { variantId: B, quantity: MAX_BAG_QUANTITY },
      ],
      mergeKey: 'merge-key-0001',
    });
  });

  it('follows the server: dropped pieces go, reduced quantities shrink, the rest is untouched', () => {
    const state = added(added(EMPTY_GUEST_BAG, A, 5), B, 2);
    expect(
      reconcileGuestBag(state, [
        { variantId: A, quantity: 5 },
        { variantId: B, quantity: 2 },
      ]),
    ).toBe(state);
    expect(reconcileGuestBag(state, [{ variantId: A, quantity: 3 }]).items).toEqual([
      { variantId: A, quantity: 3 },
    ]);
    // The server never raises a quantity, and a sold-out line (still listed) stays for the shopper to remove.
    expect(
      reconcileGuestBag(state, [
        { variantId: A, quantity: 20 },
        { variantId: B, quantity: 2 },
      ]),
    ).toBe(state);
    expect(reconcileGuestBag(state, [])).toBe(EMPTY_GUEST_BAG);
  });
});

describe('bag notices', () => {
  const adjustment = (reason: Parameters<typeof describeAdjustment>[0]['reason'], quantity: number) => ({
    variantId: A,
    productName: 'Footed romper',
    requested: 4,
    quantity,
    reason,
  });

  it('explains each change in plain words when a guest bag joins an account', () => {
    expect(describeAdjustment(adjustment('UNAVAILABLE', 0), 'merge')).toBe(
      'Footed romper is no longer available, so it was not added to your bag.',
    );
    expect(describeAdjustment(adjustment('OUT_OF_STOCK', 0), 'merge')).toBe(
      'Footed romper is out of stock, so it was not added to your bag.',
    );
    expect(describeAdjustment(adjustment('LIMITED_STOCK', 3), 'merge')).toBe(
      'Only 3 of Footed romper left in stock, so your bag has 3.',
    );
    expect(describeAdjustment(adjustment('QUANTITY_LIMIT', 20), 'merge')).toBe(
      'An order can hold at most 20 of Footed romper, so your bag has 20.',
    );
    expect(describeAdjustment(adjustment('BAG_FULL', 0), 'merge')).toBe(
      'Your bag is full, so Footed romper was not added.',
    );
  });

  it('does not repeat what a guest already sees on the line, and never names a hidden product', () => {
    expect(describeAdjustment(adjustment('OUT_OF_STOCK', 0), 'guest')).toBeNull();
    expect(describeAdjustment({ ...adjustment('UNAVAILABLE', 0), productName: null }, 'guest')).toBe(
      'An item is no longer available and was removed from your bag.',
    );
    expect(
      describeAdjustments([adjustment('OUT_OF_STOCK', 0), adjustment('LIMITED_STOCK', 2)], 'guest'),
    ).toEqual(['Only 2 of Footed romper left in stock, so your bag has 2.']);
  });
});

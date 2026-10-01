import {
  DELIVERY_STATUSES,
  EXCHANGE_STATUSES,
  GARMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  RETURN_STATUSES,
  SUBSCRIPTION_STATUSES,
} from '@bambino/types';
import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import {
  deliveryLifecycle,
  exchangeLifecycle,
  garmentLifecycle,
  orderLifecycle,
  paymentLifecycle,
  returnLifecycle,
  subscriptionLifecycle,
} from './lifecycles';
import type { StateMachine } from './state-machine';

/** Follows `path` from the machine's initial state, asserting each step is allowed. */
function walk<S extends string>(machine: StateMachine<S>, path: readonly S[]) {
  let current = machine.initial;
  for (const step of path) {
    machine.assertTransition(current, step);
    current = step;
  }
  return current;
}

function reachableFromInitial<S extends string>(machine: StateMachine<S>): Set<S> {
  const seen = new Set<S>([machine.initial]);
  const queue: S[] = [machine.initial];
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    for (const target of machine.next(state)) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

const machines = [
  {
    machine: subscriptionLifecycle as StateMachine<string>,
    statuses: SUBSCRIPTION_STATUSES as readonly string[],
  },
  { machine: orderLifecycle as StateMachine<string>, statuses: ORDER_STATUSES as readonly string[] },
  { machine: paymentLifecycle as StateMachine<string>, statuses: PAYMENT_STATUSES as readonly string[] },
  { machine: returnLifecycle as StateMachine<string>, statuses: RETURN_STATUSES as readonly string[] },
  { machine: garmentLifecycle as StateMachine<string>, statuses: GARMENT_STATUSES as readonly string[] },
  { machine: deliveryLifecycle as StateMachine<string>, statuses: DELIVERY_STATUSES as readonly string[] },
  { machine: exchangeLifecycle as StateMachine<string>, statuses: EXCHANGE_STATUSES as readonly string[] },
];

describe.each(machines)('$machine.name lifecycle structure', ({ machine, statuses }) => {
  it('defines exactly the statuses in @bambino/types', () => {
    expect([...machine.states].sort()).toEqual([...statuses].sort());
  });

  it('can reach every status from the initial one', () => {
    expect([...reachableFromInitial(machine)].sort()).toEqual([...statuses].sort());
  });

  it('never transitions a status to itself and has at least one terminal status', () => {
    for (const state of machine.states) expect(machine.canTransition(state, state)).toBe(false);
    expect(machine.terminal.length).toBeGreaterThan(0);
  });
});

describe('subscription lifecycle', () => {
  it('supports activate, pause, resume, failed renewal, recovery and cancellation', () => {
    expect(
      walk(subscriptionLifecycle, ['ACTIVE', 'PAUSED', 'ACTIVE', 'PAST_DUE', 'ACTIVE', 'CANCELLED']),
    ).toBe('CANCELLED');
    expect(walk(subscriptionLifecycle, ['ACTIVE', 'PAST_DUE', 'EXPIRED'])).toBe('EXPIRED');
  });

  it('cannot be paused before it is active or revived once ended', () => {
    expect(subscriptionLifecycle.canTransition('PENDING', 'PAUSED')).toBe(false);
    expect(subscriptionLifecycle.canTransition('CANCELLED', 'ACTIVE')).toBe(false);
    expect(subscriptionLifecycle.canTransition('EXPIRED', 'ACTIVE')).toBe(false);
    expect(subscriptionLifecycle.terminal).toEqual(['CANCELLED', 'EXPIRED']);
  });
});

describe('order lifecycle', () => {
  it('runs from payment to delivery and on to a return', () => {
    expect(
      walk(orderLifecycle, [
        'PAID',
        'PROCESSING',
        'PACKED',
        'READY_FOR_DISPATCH',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'RETURN_REQUESTED',
        'RETURNED',
      ]),
    ).toBe('RETURNED');
  });

  it('cannot skip payment or be cancelled once out for delivery', () => {
    expect(orderLifecycle.canTransition('PENDING_PAYMENT', 'PROCESSING')).toBe(false);
    expect(orderLifecycle.canTransition('PENDING_PAYMENT', 'DELIVERED')).toBe(false);
    expect(orderLifecycle.canTransition('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
    expect(orderLifecycle.canTransition('DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('reports illegal moves as a DomainError with context', () => {
    let thrown: unknown;
    try {
      orderLifecycle.assertTransition('PENDING_PAYMENT', 'DELIVERED');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect(thrown).toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      details: { machine: 'Order', from: 'PENDING_PAYMENT', to: 'DELIVERED' },
    });
  });
});

describe('payment lifecycle', () => {
  it('only succeeds after being pending', () => {
    expect(paymentLifecycle.canTransition('INITIATED', 'SUCCEEDED')).toBe(false);
    expect(walk(paymentLifecycle, ['PENDING', 'SUCCEEDED', 'REFUNDED'])).toBe('REFUNDED');
  });

  it('cannot flip a settled outcome', () => {
    expect(paymentLifecycle.canTransition('FAILED', 'SUCCEEDED')).toBe(false);
    expect(paymentLifecycle.canTransition('SUCCEEDED', 'FAILED')).toBe(false);
    expect(paymentLifecycle.canTransition('EXPIRED', 'SUCCEEDED')).toBe(false);
    expect(paymentLifecycle.canTransition('SUCCEEDED', 'PENDING')).toBe(false);
  });
});

describe('return lifecycle', () => {
  it('follows request, approval, receipt, inspection and completion', () => {
    expect(
      walk(returnLifecycle, [
        'APPROVED',
        'IN_TRANSIT',
        'RECEIVED',
        'INSPECTING',
        'ACCEPTED',
        'REFURBISHING',
        'COMPLETED',
      ]),
    ).toBe('COMPLETED');
    expect(walk(returnLifecycle, ['APPROVED', 'RECEIVED', 'INSPECTING', 'ACCEPTED', 'COMPLETED'])).toBe(
      'COMPLETED',
    );
  });

  it('cannot be accepted without inspection', () => {
    expect(returnLifecycle.canTransition('REQUESTED', 'ACCEPTED')).toBe(false);
    expect(returnLifecycle.canTransition('RECEIVED', 'ACCEPTED')).toBe(false);
    expect(returnLifecycle.canTransition('APPROVED', 'COMPLETED')).toBe(false);
  });
});

describe('garment lifecycle', () => {
  it('completes a full circular loop and goes out again', () => {
    expect(
      walk(garmentLifecycle, [
        'AVAILABLE',
        'RESERVED',
        'WITH_CUSTOMER',
        'RETURN_REQUESTED',
        'RETURNED',
        'INSPECTION',
        'REFURBISHING',
        'AVAILABLE_FOR_REUSE',
        'RESERVED',
        'WITH_CUSTOMER',
      ]),
    ).toBe('WITH_CUSTOMER');
  });

  it('cannot be reused without passing inspection', () => {
    expect(garmentLifecycle.canTransition('RETURNED', 'AVAILABLE_FOR_REUSE')).toBe(false);
    expect(garmentLifecycle.canTransition('RETURNED', 'RESERVED')).toBe(false);
    expect(garmentLifecycle.canTransition('WITH_CUSTOMER', 'AVAILABLE')).toBe(false);
    expect(garmentLifecycle.canTransition('RETURN_REQUESTED', 'AVAILABLE_FOR_REUSE')).toBe(false);
  });

  it('ends at RETIRED and nowhere else', () => {
    expect(garmentLifecycle.terminal).toEqual(['RETIRED']);
    expect(
      walk(garmentLifecycle, [
        'AVAILABLE',
        'RESERVED',
        'WITH_CUSTOMER',
        'RETURN_REQUESTED',
        'RETURNED',
        'INSPECTION',
        'RECYCLE',
        'RETIRED',
      ]),
    ).toBe('RETIRED');
  });
});

describe('delivery and exchange lifecycles', () => {
  it('lets a failed delivery be reattempted', () => {
    expect(
      walk(deliveryLifecycle, [
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'FAILED',
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED',
      ]),
    ).toBe('DELIVERED');
    expect(deliveryLifecycle.canTransition('PENDING', 'DELIVERED')).toBe(false);
  });

  it('completes an exchange only after approval and fulfilment', () => {
    expect(walk(exchangeLifecycle, ['APPROVED', 'FULFILLING', 'COMPLETED'])).toBe('COMPLETED');
    expect(exchangeLifecycle.canTransition('REQUESTED', 'COMPLETED')).toBe(false);
    expect(exchangeLifecycle.canTransition('FULFILLING', 'CANCELLED')).toBe(false);
  });
});

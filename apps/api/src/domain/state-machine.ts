import { DomainError } from './errors';

export interface StateMachine<S extends string> {
  readonly name: string;
  readonly initial: S;
  readonly states: readonly S[];
  /** States with no outgoing transitions. */
  readonly terminal: readonly S[];
  next(from: S): readonly S[];
  canTransition(from: S, to: S): boolean;
  /** Throws DomainError(INVALID_STATE_TRANSITION) unless the move is allowed. */
  assertTransition(from: S, to: S): void;
}

/**
 * Builds a lifecycle from an explicit transition table. Services call
 * assertTransition before persisting any status change, so an illegal jump
 * (for example PENDING_PAYMENT straight to DELIVERED) cannot be written.
 */
export function defineStateMachine<S extends string>(
  name: string,
  initial: S,
  transitions: Readonly<Record<S, readonly S[]>>,
): StateMachine<S> {
  const states = Object.keys(transitions) as S[];
  const next = (from: S): readonly S[] => transitions[from];
  const canTransition = (from: S, to: S) => next(from).includes(to);

  return {
    name,
    initial,
    states,
    terminal: states.filter((state) => next(state).length === 0),
    next,
    canTransition,
    assertTransition(from, to) {
      if (!canTransition(from, to)) {
        throw new DomainError('INVALID_STATE_TRANSITION', `${name} cannot move from ${from} to ${to}`, {
          machine: name,
          from,
          to,
        });
      }
    },
  };
}

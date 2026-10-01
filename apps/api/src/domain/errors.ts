/**
 * Errors raised by domain logic. `code` is stable and machine-readable; the GraphQL
 * layer maps it to an `extensions.code` and a translated, customer-safe message.
 */
export type DomainErrorCode = 'INVALID_STATE_TRANSITION';

export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

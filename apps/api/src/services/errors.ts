import type { z } from 'zod';

/**
 * Stable codes the clients translate. The message is an English fallback for logs
 * and developers; customer-facing text comes from the client's translation files.
 */
export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

export interface FieldError {
  path: string;
  /** Translation key, e.g. validation.password.too_short. */
  message: string;
}

export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: AppErrorCode,
    message: string,
    /** Machine-readable sub-reason, e.g. INVALID_CREDENTIALS. */
    readonly reason?: string,
    readonly fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
  }
}

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError(
    'VALIDATION_FAILED',
    'The input is not valid.',
    'INVALID_INPUT',
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

/** PostgreSQL unique_violation, unwrapped from the driver or Drizzle wrapper. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current: unknown = error; current instanceof Error || (current && typeof current === 'object');) {
    const candidate = current as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === '23505') {
      return (
        constraint === undefined ||
        candidate.constraint === constraint ||
        String(candidate.message).includes(constraint)
      );
    }
    current = candidate.cause;
  }
  return false;
}

import { z } from 'zod';
import { AppError } from './errors';

export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  first?: number | null;
  after?: string | null;
}

export interface Page<T> {
  items: T[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount?: number;
}

export function pageSize(request: PageRequest, fallback = 25): number {
  return Math.min(Math.max(request.first ?? fallback, 1), MAX_PAGE_SIZE);
}

/** Offset cursors, opaque to clients. Used where the sort order has no unique key (catalogue sorting). */
export function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

export function decodeOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    return z
      .object({ o: z.number().int().min(0).max(100_000) })
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).o;
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Invalid page cursor.', 'INVALID_CURSOR');
  }
}

/** Keyset cursors over (timestamp, id), stable under inserts. Used for histories and order lists. */
export function encodeKeyset(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url');
}

export function decodeKeyset(cursor: string | null | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = z
      .tuple([z.iso.datetime(), z.uuid()])
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return { at: new Date(at), id };
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Invalid page cursor.', 'INVALID_CURSOR');
  }
}

/** Fetches one row more than requested to know whether another page exists. */
export function toPage<T>(rows: T[], size: number, cursorOf: (row: T) => string): Page<T> {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  return { items, hasNextPage: rows.length > size, endCursor: last === undefined ? null : cursorOf(last) };
}

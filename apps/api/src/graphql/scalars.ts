import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateTime(value: unknown): Date {
  if (typeof value !== 'string' || !ISO_DATETIME.test(value) || Number.isNaN(Date.parse(value))) {
    throw new GraphQLError('DateTime must be an ISO-8601 timestamp with a time zone.');
  }
  return new Date(value);
}

export const DateTimeScalar = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  coerceOutputValue(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    throw new GraphQLError('DateTime cannot represent this value.');
  },
  coerceInputValue: parseDateTime,
  coerceInputLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('DateTime must be a string.');
    return parseDateTime(ast.value);
  },
});

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) throw new GraphQLError('Date must be YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GraphQLError('Date is not a real calendar date.');
  }
  return value;
}

/** Dates travel as YYYY-MM-DD strings end to end; no time zone conversion applies. */
export const DateScalar = new GraphQLScalarType<string, string>({
  name: 'Date',
  coerceOutputValue(value) {
    if (typeof value === 'string' && ISO_DATE.test(value)) return value;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    throw new GraphQLError('Date cannot represent this value.');
  },
  coerceInputValue: parseDate,
  coerceInputLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('Date must be a string.');
    return parseDate(ast.value);
  },
});

function parseMinorUnits(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new GraphQLError('MinorUnits must be an integer.');
  }
  return value;
}

export const MinorUnitsScalar = new GraphQLScalarType<number, number>({
  name: 'MinorUnits',
  coerceOutputValue(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    throw new GraphQLError('MinorUnits cannot represent a non-integer.');
  },
  coerceInputValue: parseMinorUnits,
  coerceInputLiteral(ast) {
    if (ast.kind !== Kind.INT) throw new GraphQLError('MinorUnits must be an integer literal.');
    return parseMinorUnits(Number(ast.value));
  },
});

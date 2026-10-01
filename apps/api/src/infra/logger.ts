export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type Fields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Keys whose values never reach a log line, at any depth. */
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|msisdn|api[-_]?key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(inner, depth + 1),
    ]),
  );
}

/** Structured JSON lines. Small on purpose; swap for a hosted logger in Phase 10 without changing callers. */
export function createLogger(
  level: LogLevel,
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  base: Fields = {},
): Logger {
  const threshold = LEVELS[level];
  const log = (at: Exclude<LogLevel, 'silent'>, message: string, fields: Fields = {}) => {
    if (LEVELS[at] < threshold) return;
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level: at,
        message,
        ...(redact({ ...base, ...fields }) as Fields),
      }),
    );
  };
  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
    child: (fields) => createLogger(level, write, { ...base, ...fields }),
  };
}

export const silentLogger: Logger = createLogger('silent');

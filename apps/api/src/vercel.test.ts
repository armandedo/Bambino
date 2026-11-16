import { describe, expect, it } from 'vitest';
import { cronAuthorized } from './vercel';

const SECRET = 'a-long-enough-cron-secret-0001';

describe('the scheduled jobs route on Vercel', () => {
  it('runs only for the exact bearer token Vercel Cron sends', () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronAuthorized(SECRET, SECRET)).toBe(false);
    expect(cronAuthorized(undefined, SECRET)).toBe(false);
  });

  it('authorises nobody when the secret is missing or too short to be one', () => {
    expect(cronAuthorized('Bearer ', '')).toBe(false);
    expect(cronAuthorized('Bearer undefined', undefined)).toBe(false);
    expect(cronAuthorized('Bearer short', 'short')).toBe(false);
  });
});

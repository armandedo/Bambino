/** Only same-site paths are allowed as a post-login destination, so `?next=` cannot send users elsewhere. */
export function safeNext(value: string | string[] | undefined, fallback = '/account'): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

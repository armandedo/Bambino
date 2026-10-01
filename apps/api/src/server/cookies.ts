export const ACCESS_COOKIE = 'bmb_at';
export const REFRESH_COOKIE = 'bmb_rt';

export interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

/** Collects Set-Cookie values during a request; a server plugin writes them onto the response. */
export class CookieJar {
  private readonly values: string[] = [];

  constructor(
    private readonly secure: boolean,
    /** Cookies the request arrived with. */
    readonly incoming: ReadonlyMap<string, string> = new Map(),
  ) {}

  set(name: string, value: string, maxAgeSeconds: number): void {
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      'Path=/',
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (this.secure) parts.push('Secure');
    this.values.push(parts.join('; '));
  }

  clear(name: string): void {
    this.set(name, '', 0);
  }

  get setCookieHeaders(): readonly string[] {
    return this.values;
  }
}

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    try {
      cookies.set(name, decodeURIComponent(pair.slice(index + 1).trim()));
    } catch {
      // Ignore malformed cookie values rather than failing the request.
    }
  }
  return cookies;
}

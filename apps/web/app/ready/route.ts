import { NextResponse } from 'next/server';

/**
 * Readiness for load balancers: this app is up and the API it depends on is ready (which includes the database).
 * The API's own /health only says its process is alive.
 */
export async function GET() {
  const api = process.env.API_URL ?? 'http://127.0.0.1:4000/graphql';
  try {
    const response = await fetch(new URL('/ready', api), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok)
      return NextResponse.json({ status: 'ready', api: 'ok' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    // Unreachable: reported as unavailable below.
  }
  return NextResponse.json(
    { status: 'unavailable', api: 'unreachable' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}

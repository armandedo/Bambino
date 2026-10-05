'use client';

import { RouteError, type RouteErrorValue } from '@/components/route-error';

/** Inside the account frame, so the account navigation stays usable. */
export default function DashboardError({ error, retry }: { error: RouteErrorValue; retry: () => void }) {
  return <RouteError error={error} retry={retry} what="this part of your account" />;
}

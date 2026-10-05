'use client';

import { RouteError, type RouteErrorValue } from '@/components/route-error';

export default function SiteError({ error, retry }: { error: RouteErrorValue; retry: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <RouteError error={error} retry={retry} what="this page" />
    </div>
  );
}

'use client';

import { RouteError, type RouteErrorValue } from '@/components/route-error';

export default function SiteError({ error, retry }: { error: RouteErrorValue; retry: () => void }) {
  return (
    <div className="retail-narrow">
      <RouteError error={error} retry={retry} what="this page" />
    </div>
  );
}

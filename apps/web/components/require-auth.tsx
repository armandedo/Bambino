'use client';

import type { Viewer } from '@bambino/api-client';
import { Spinner } from '@bambino/ui';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useSession } from '@/lib/session';

/** Signed-in pages: sends visitors to sign in and brings them back here afterwards. */
export function RequireAuth({ children }: { children: (viewer: Viewer) => ReactNode }) {
  const { viewer, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !viewer) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, viewer, router, pathname]);

  if (!viewer) {
    return (
      <div className="flex justify-center py-24">
        <Spinner
          label={loading ? 'Checking your session' : 'Taking you to sign in'}
          size="lg"
          className="text-primary"
        />
      </div>
    );
  }
  return <>{children(viewer)}</>;
}

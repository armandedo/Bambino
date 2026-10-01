import type { LinkProps } from '@bambino/ui';
import NextLink from 'next/link';

/** Adapts Next.js `Link` to the link contract the shared shells expect. */
export function RouterLink(props: LinkProps) {
  return <NextLink {...props} />;
}

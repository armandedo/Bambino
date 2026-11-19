import { EmptyState, buttonClasses } from '@bambino/ui';
import NextLink from 'next/link';

export default function NotFound() {
  return (
    <div className="retail-narrow">
      <EmptyState
        title="We couldn't find that page"
        description="It may have moved, or the product is no longer available."
        action={
          <NextLink href="/shop" className={buttonClasses()}>
            Go to the shop
          </NextLink>
        }
      />
    </div>
  );
}

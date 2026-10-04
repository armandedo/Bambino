'use client';

import type { CustomerGarment } from '@bambino/api-client';
import { EmptyState, StatusBadge, buttonClasses } from '@bambino/ui';
import { RefreshCw } from 'lucide-react';
import NextLink from 'next/link';
import { Stagger, StaggerItem } from '@/components/motion/primitives';
import { ProductArt } from '@/components/product-art';
import { QueryState } from '@/components/query-state';
import { formatDate } from '@/lib/messages';
import { useGarments } from '@/lib/queries';
import { PageTitle } from '../account-nav';

function GarmentCard({ garment }: { garment: CustomerGarment }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <ProductArt seed={garment.product.slug} className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-bold text-primary">{garment.product.name}</h3>
          <StatusBadge status={garment.status} />
        </div>
        <p className="text-sm text-foreground-muted">
          {garment.size.label} · {garment.color}
        </p>
        <p className="mt-auto text-xs text-foreground-muted">
          Tag <span className="font-mono">{garment.tagCode}</span>
          {garment.receivedAt ? ` · with you since ${formatDate(garment.receivedAt)}` : ''}
        </p>
      </div>
    </article>
  );
}

/** The pieces the family holds now, from the garment records, with a route to returning them. */
export default function WardrobePage() {
  const garments = useGarments();
  return (
    <>
      <PageTitle
        title="Wardrobe"
        description="The Bambino pieces your baby has right now."
        action={
          <NextLink
            href="/dashboard/exchange"
            className={buttonClasses({ variant: 'outline', className: 'gap-2' })}
          >
            <RefreshCw aria-hidden="true" className="size-4" /> Return outgrown pieces
          </NextLink>
        }
      />
      <QueryState query={garments} what="your wardrobe">
        {(list) => {
          if (list.length === 0) {
            return (
              <EmptyState
                title="Your wardrobe is empty"
                description="Pieces from your subscription appear here once they are delivered."
                action={
                  <NextLink href="/plans" className={buttonClasses()}>
                    Explore plans
                  </NextLink>
                }
              />
            );
          }
          const withYou = list.filter((g) => g.status === 'WITH_CUSTOMER');
          const goingBack = list.filter((g) => g.status !== 'WITH_CUSTOMER');
          return (
            <div className="flex flex-col gap-10">
              <section aria-labelledby="with-you" className="flex flex-col gap-4">
                <h2 id="with-you" className="font-display text-xl font-bold text-primary">
                  With you ({withYou.length})
                </h2>
                {withYou.length === 0 ? (
                  <p className="text-foreground-muted">Nothing at the moment.</p>
                ) : (
                  <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {withYou.map((garment) => (
                      <StaggerItem as="li" key={garment.id}>
                        <GarmentCard garment={garment} />
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
              </section>
              {goingBack.length > 0 ? (
                <section aria-labelledby="going-back" className="flex flex-col gap-4">
                  <h2 id="going-back" className="font-display text-xl font-bold text-primary">
                    On their way back ({goingBack.length})
                  </h2>
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {goingBack.map((garment) => (
                      <li key={garment.id}>
                        <GarmentCard garment={garment} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

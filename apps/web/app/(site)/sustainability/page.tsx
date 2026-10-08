import { buttonClasses } from '@bambino/ui';
import { Leaf, Recycle, Search, Tag } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Stagger, StaggerItem } from '@/components/motion/primitives';
import { PageHero } from '@/components/page-hero';
import { SectionHeading } from '@/components/sections';
import { LifecycleLoop } from '@/components/story/lifecycle-loop';

export const metadata: Metadata = {
  title: 'Sustainability',
  description:
    'One garment, many babies: how Bambino inspects, refurbishes, redistributes and recycles babywear.',
};

const PRINCIPLES = [
  {
    icon: Tag,
    title: 'Every piece is tagged',
    body: 'Each garment carries a unique tag, so every step of its life is on record.',
  },
  {
    icon: Search,
    title: 'Nothing reused without inspection',
    body: 'Returned pieces are checked one by one and given a condition before they go anywhere.',
  },
  {
    icon: Leaf,
    title: 'Reuse comes first',
    body: 'Pieces in good condition go to the next family before anything new is used.',
  },
  {
    icon: Recycle,
    title: 'Recycled at the end',
    body: 'Pieces that can no longer be worn are recycled rather than thrown away.',
  },
];

export default function SustainabilityPage() {
  return (
    <>
      <PageHero
        eyebrow="Sustainability"
        title="One garment, many babies."
        intro="Babies outgrow clothes in weeks. Bambino keeps good pieces in use for longer and tracks every step, so we can report reuse from real records rather than estimates."
      />
      <section
        aria-labelledby="loop"
        className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 lg:py-20"
      >
        <SectionHeading
          id="loop"
          eyebrow="The lifecycle"
          title="Produced, worn, returned, refurbished, and on to the next family."
        />
        <LifecycleLoop />
      </section>
      <section aria-labelledby="principles" className="bg-surface-muted">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 lg:py-20">
          <SectionHeading
            id="principles"
            eyebrow="How we work"
            title="Simple rules, recorded for every piece."
          />
          <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((item) => {
              const Icon = item.icon;
              return (
                <StaggerItem
                  as="li"
                  key={item.title}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="font-display text-lg font-bold text-primary">{item.title}</h3>
                  <p className="text-sm text-foreground-muted">{item.body}</p>
                </StaggerItem>
              );
            })}
          </Stagger>
          <p className="text-sm text-foreground-muted">
            Impact figures will be published once there is enough real data to report them honestly.
          </p>
          <NextLink href="/plans" className={buttonClasses({ className: 'w-fit' })}>
            Join the circle
          </NextLink>
        </div>
      </section>
    </>
  );
}

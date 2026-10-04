import { buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { ExchangeSequence } from '@/components/exchange/exchange-sequence';
import { PageHero } from '@/components/page-hero';
import { SectionHeading } from '@/components/sections';
import { HowItWorksStory } from '@/components/story/how-it-works';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Create a profile, choose a plan, get fitted, receive your box, return what’s outgrown and exchange for the next size.',
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How Bambino works"
        title="Subscribe once. Size up as they grow."
        intro="Six steps, repeated as your baby grows: the wardrobe keeps up instead of starting over."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <NextLink href="/fit" className={buttonClasses({ size: 'lg', className: 'gap-2' })}>
            Find the right fit <ArrowRight aria-hidden="true" className="size-5" />
          </NextLink>
          <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
            Explore plans
          </NextLink>
        </div>
      </PageHero>
      <section aria-label="The six steps" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-16">
        <HowItWorksStory />
      </section>
      <section aria-labelledby="swap" className="bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-14 sm:px-6 lg:py-20">
          <SectionHeading id="swap" eyebrow="The exchange" title="From current size to next size." />
          <ExchangeSequence />
        </div>
      </section>
    </>
  );
}

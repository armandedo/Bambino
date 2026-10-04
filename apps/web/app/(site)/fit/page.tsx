import type { Metadata } from 'next';
import { PageHero } from '@/components/page-hero';
import { FitWizard } from '@/components/sizing/fit-wizard';

export const metadata: Metadata = {
  title: 'Find the right fit',
  description:
    'Answer a few questions about your baby and get a size recommendation with the reasons behind it.',
};

export default function FitPage() {
  return (
    <>
      <PageHero
        eyebrow="Find the right fit"
        title="The right size, with the reasons behind it."
        intro="About two minutes. We compare your baby’s age, height and weight with our size chart and explain every recommendation."
      />
      <section aria-label="Fit finder" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <FitWizard />
      </section>
    </>
  );
}

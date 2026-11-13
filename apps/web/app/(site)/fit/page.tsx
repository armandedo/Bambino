import type { Metadata } from 'next';
import { FitWizard } from '@/components/sizing/fit-wizard';

export const metadata: Metadata = {
  title: 'Find a size',
  description:
    'Answer a few questions about your child and get a size recommendation with the reasons behind it.',
};

export default function FitPage() {
  return (
    <div className="retail-narrow">
      <h1 className="text-xl font-semibold md:text-2xl">Find a size</h1>
      <p className="mt-1 mb-5 text-sm text-foreground-muted">
        About two minutes. We compare your child’s age, height and weight with our size chart and explain the
        recommendation.
      </p>
      <FitWizard />
    </div>
  );
}

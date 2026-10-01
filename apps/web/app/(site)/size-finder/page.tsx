import type { Metadata } from 'next';
import { SizeFinder } from './size-finder';

export const metadata: Metadata = {
  title: 'Find my baby’s size',
  description:
    'Enter your baby’s age, height and weight and get a size recommendation with the reasons behind it.',
};

export default function SizeFinderPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-extrabold">Find my baby’s size</h1>
        <p className="text-lg text-foreground-muted">
          Tell us your baby’s age and, if you can, height and weight. We compare them with our size chart and
          explain the result.
        </p>
      </div>
      <SizeFinder />
    </div>
  );
}

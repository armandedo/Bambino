import type { Metadata } from 'next';
import { ExchangeSequence } from '@/components/exchange/exchange-sequence';
import { PageHero } from '@/components/page-hero';
import { SectionHeading } from '@/components/sections';
import { ExchangePanel } from './exchange-panel';

export const metadata: Metadata = {
  title: 'Exchange',
  description: 'Send back outgrown pieces, earn credit for what passes inspection, and choose the next size.',
};

const DETAILS = [
  {
    title: 'When to exchange',
    body: 'Whenever pieces get small. The fit finder and growth chart suggest when the next size is due.',
  },
  { title: 'Pickup or drop-off', body: 'Book a pickup from your address in Kigali, or drop pieces off.' },
  {
    title: 'Inspection and credit',
    body: 'Each piece is inspected. Accepted pieces earn exchange credit; the amount depends on the piece’s condition.',
  },
  {
    title: 'The next size',
    body: 'Choose the replacement with your credit applied. Our team approves it before any payment is asked for.',
  },
];

export default function ExchangePage() {
  return (
    <>
      <PageHero
        eyebrow="Exchange"
        title="Outgrown? Swap it for the next size."
        intro="No starting over: what your baby has outgrown becomes credit towards what fits next."
      />
      <section
        aria-labelledby="sequence"
        className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 lg:py-20"
      >
        <SectionHeading
          id="sequence"
          eyebrow="Step by step"
          title="Current size → return → inspection → credit → next size."
        />
        <ExchangeSequence />
        <ExchangePanel />
      </section>
      <section aria-labelledby="details" className="bg-surface-muted">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2 lg:py-20">
          <h2 id="details" className="sr-only">
            Details
          </h2>
          {DETAILS.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6"
            >
              <h3 className="font-display text-xl font-bold text-primary">{item.title}</h3>
              <p className="text-foreground-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

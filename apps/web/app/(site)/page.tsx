import { CatalogueFiltersQuery, ProductsQuery, SubscriptionPlansQuery } from '@bambino/api-client';
import { EmptyState, buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { ApiErrorState } from '@/components/api-error';
import { GrowthSlider } from '@/components/hero/growth-slider';
import { Hero } from '@/components/hero/hero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives';
import { PlanCard } from '@/components/plan-card';
import { ProductCard } from '@/components/product-card';
import { HowItWorksStory } from '@/components/story/how-it-works';
import { load } from '@/lib/api';
import { PHOTOS, type StockPhoto, photoSrcSet, photoUrl } from '@/lib/stock-photos';

export const revalidate = 60;

/** The questions the fit finder asks, in the order it asks them. */
const FIT_QUESTIONS = [
  'What’s your baby’s name, and when were they born?',
  'How tall are they? (A guess is fine.)',
  'Roughly how much do they weigh?',
  'Do you like clothes snug, or with room to grow?',
];

/** What a returned piece goes through. Matches the garment states recorded for every tagged piece. */
const AFTER_RETURN = ['Comes back to us', 'Checked by hand', 'Washed', 'Off to the next family'];

const SWAP = ['Book a pickup', 'We check each piece', 'You get credit', 'Pick the next size'];

const LOCAL_NOTES = [
  {
    title: 'Pay with MoMo or Airtel Money',
    body: 'You approve the payment on your phone. No card needed.',
  },
  {
    title: 'Delivered across Kigali',
    body: 'Standard delivery, or same-day if you need it sooner.',
  },
  {
    title: 'Every piece has a tag',
    body: 'So we always know where a garment has been and what condition it’s in.',
  },
  {
    title: 'Designed here',
    body: 'By people in Kigali, with our weather and our prices in mind.',
  },
];

function Photo({
  photo,
  aspect,
  className,
  sizes = '(min-width: 1024px) 50vw, 100vw',
}: {
  photo: StockPhoto;
  aspect: number;
  className?: string;
  sizes?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-sand-100 ${className ?? ''}`}>
      <img
        src={photoUrl(photo, 1080, aspect)}
        srcSet={photoSrcSet(photo, aspect)}
        sizes={sizes}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  );
}

/** A plain section heading: no label above it, no animation. Words first. */
function Heading({
  id,
  children,
  intro,
  inverse = false,
}: {
  id: string;
  children: ReactNode;
  intro?: ReactNode;
  inverse?: boolean;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <h2
        id={id}
        className={`font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-[2.6rem] ${
          inverse ? 'text-primary-foreground' : 'text-primary'
        }`}
      >
        {children}
      </h2>
      {intro ? (
        <p className={`text-lg leading-relaxed ${inverse ? 'text-brand-100' : 'text-foreground-muted'}`}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}

/** Steps written as one line of text with arrows between them, instead of a row of cards. */
function Flow({ steps, inverse = false }: { steps: string[]; inverse?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg font-semibold">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-3">
          <span className={inverse ? 'text-primary-foreground' : 'text-primary'}>{step}</span>
          {index < steps.length - 1 ? (
            <ArrowRight
              aria-hidden="true"
              className={`size-4 ${inverse ? 'text-accent-200' : 'text-accent-600'}`}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default async function HomePage() {
  const [plans, products, filters] = await Promise.all([
    load(SubscriptionPlansQuery),
    load(ProductsQuery, { first: 12, sort: 'NEWEST' }),
    load(CatalogueFiltersQuery),
  ]);
  const productList = products.ok ? products.data.products.edges.map((edge) => edge.node) : [];

  return (
    <>
      <Hero />

      {/* How long a size lasts */}
      <section aria-labelledby="grow" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="flex flex-col gap-10">
          <Heading
            id="grow"
            intro="Drag the slider to your baby’s age. It’s a rough guide from our size chart. Every baby grows at their own speed, which is why the fit finder asks for height and weight too."
          >
            How long does a size actually last?
          </Heading>
          {filters.ok && filters.data.sizes.length > 0 ? (
            <GrowthSlider chart={filters.data.sizes} products={productList} />
          ) : filters.ok ? null : (
            <ApiErrorState error={filters.error} what="the size chart" />
          )}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-16 sm:px-6 lg:py-20">
          <Heading id="how" intro="Six steps, and you only really have to do the first two.">
            Here&rsquo;s how it works
          </Heading>
          <HowItWorksStory />
        </div>
      </section>

      {/* Fit finder */}
      <section aria-labelledby="fit" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid items-start gap-10 rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-6">
            <Heading
              id="fit"
              inverse
              intro="Answer four quick questions. We’ll suggest a size and show you how we got there, so you can check our working."
            >
              Not sure which size to pick?
            </Heading>
            <NextLink
              href="/fit"
              className={buttonClasses({ variant: 'accent', size: 'lg', className: 'w-fit gap-2' })}
            >
              Start the fit finder <ArrowRight aria-hidden="true" className="size-5" />
            </NextLink>
          </div>
          <div className="rounded-2xl bg-surface p-6 text-foreground shadow-lg sm:p-8 lg:rotate-1">
            <p className="text-sm font-semibold text-foreground-muted">What we&rsquo;ll ask you</p>
            <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-lg marker:font-bold marker:text-accent-700">
              {FIT_QUESTIONS.map((question) => (
                <li key={question} className="pl-1">
                  {question}
                </li>
              ))}
            </ol>
            <p className="mt-5 border-t border-border pt-4 text-foreground-muted">
              Then you get a size, plus the reasons behind it. Takes about two minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Products */}
      <section aria-labelledby="new" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:pb-20">
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Heading id="new" intro="Everyday basics, made to be washed a lot and worn by more than one baby.">
              What comes in the box
            </Heading>
            <NextLink
              href="/shop"
              className="font-semibold text-link underline underline-offset-4 hover:decoration-2"
            >
              See everything in the shop
            </NextLink>
          </div>
          {!products.ok ? (
            <ApiErrorState error={products.error} what="products" />
          ) : productList.length === 0 ? (
            <EmptyState
              title="The shop is empty"
              description="Products appear here once they are published."
            />
          ) : (
            <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {productList.slice(0, 4).map((product) => (
                <StaggerItem as="li" key={product.id} className="flex">
                  <ProductCard product={product} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>

      {/* What happens to returned clothes */}
      <section aria-labelledby="circular" className="bg-surface-muted">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <Reveal>
            <Photo photo={PHOTOS.circular} aspect={4 / 3} className="aspect-[4/3]" />
          </Reveal>
          <div className="flex flex-col gap-6">
            <Heading id="circular">One romper, several babies</Heading>
            <p className="text-lg leading-relaxed text-foreground-muted">
              Babies wear most things for a few weeks before they&rsquo;re too small. That&rsquo;s a waste of good
              cotton, and of your money. So when clothes come back to us, we check every piece by hand. The good
              ones are washed and go to the next family. The worn-out ones are recycled, never quietly sent back
              out.
            </p>
            <Flow steps={AFTER_RETURN} />
            <NextLink
              href="/sustainability"
              className="w-fit font-semibold text-link underline underline-offset-4 hover:decoration-2"
            >
              More on how we reuse clothes
            </NextLink>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section aria-labelledby="plans" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="flex flex-col gap-10">
          <Heading
            id="plans"
            intro="One plan per baby, and you can switch whenever you need to. These prices are placeholders until we launch."
          >
            Plans and prices
          </Heading>
          {!plans.ok ? (
            <ApiErrorState error={plans.error} what="plans" />
          ) : plans.data.subscriptionPlans.length === 0 ? (
            <EmptyState title="No plans yet" description="Plans appear here once they are published." />
          ) : (
            <div className="grid gap-6 pt-3 md:grid-cols-3">
              {plans.data.subscriptionPlans.map((plan, index) => (
                <PlanCard key={plan.id} plan={plan} featured={index === 0} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Exchange */}
      <section aria-labelledby="exchange" className="bg-primary">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 lg:py-20">
          <Heading
            id="exchange"
            inverse
            intro="You don’t start over. Send back what’s small, and the pieces that pass our check turn into credit for the next size."
          >
            Outgrown already? Swap it.
          </Heading>
          <Flow steps={SWAP} inverse />
          <NextLink
            href="/exchange"
            className={buttonClasses({ variant: 'accent', className: 'w-fit gap-2' })}
          >
            How swapping works <ArrowRight aria-hidden="true" className="size-4" />
          </NextLink>
        </div>
      </section>

      {/* Made for here */}
      <section aria-labelledby="trust" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="grid grid-cols-2 gap-4">
            <Photo
              photo={PHOTOS.kigaliSkyline}
              aspect={16 / 10}
              className="col-span-2 aspect-[16/10]"
              sizes="(min-width: 1024px) 55vw, 100vw"
            />
            <Photo
              photo={PHOTOS.motherCarrying}
              aspect={1}
              className="aspect-square"
              sizes="(min-width: 1024px) 27vw, 50vw"
            />
            <Photo
              photo={PHOTOS.kigaliHills}
              aspect={1}
              className="aspect-square"
              sizes="(min-width: 1024px) 27vw, 50vw"
            />
          </div>
          <div className="flex flex-col gap-8">
            <Heading id="trust">Made in Kigali, for families here</Heading>
            <dl className="flex flex-col gap-6">
              {LOCAL_NOTES.map((note) => (
                <div key={note.title} className="border-l-2 border-accent pl-4">
                  <dt className="font-display text-lg font-bold text-primary">{note.title}</dt>
                  <dd className="mt-1 text-foreground-muted">{note.body}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-foreground-muted">
              Heads up: this is a preview. Mobile money isn&rsquo;t connected yet, so checkout uses test wallets.
            </p>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section aria-labelledby="start" className="px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="mx-auto flex max-w-4xl flex-col items-start gap-5 rounded-3xl bg-accent-50 px-6 py-12 sm:px-12">
          <h2 id="start" className="font-display text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">
            <span lang="rw">Murakoze</span> for reading this far.
          </h2>
          <p className="max-w-xl text-lg text-foreground-muted">
            The easiest place to start is your baby&rsquo;s size. It takes about two minutes, and you can
            change your mind about everything later.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg', className: 'gap-2' })}>
              Find my baby&rsquo;s size <ArrowRight aria-hidden="true" className="size-5" />
            </NextLink>
            <NextLink
              href="/plans"
              className="px-2 py-3 font-semibold text-primary underline decoration-accent decoration-2 underline-offset-4 hover:decoration-primary"
            >
              or compare plans
            </NextLink>
          </div>
        </div>
      </section>
    </>
  );
}

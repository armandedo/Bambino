import { ProductsQuery, SubscriptionPlansQuery } from '@bambino/api-client';
import { EmptyState, buttonClasses } from '@bambino/ui';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { PlanCard } from '@/components/plan-card';
import { ProductArt } from '@/components/product-art';
import { ProductCard } from '@/components/product-card';
import { load } from '@/lib/api';

export const revalidate = 60;

const STEPS = [
  {
    title: 'Tell us about your baby',
    body: 'Age, height and weight. Children’s details stay private to your account.',
  },
  {
    title: 'Get the right size',
    body: 'We recommend a size from your measurements and show why, so you can check it.',
  },
  {
    title: 'Wear and enjoy',
    body: 'Soft everyday pieces, delivered to your door in Kigali.',
  },
  {
    title: 'Swap when they grow',
    body: 'Send outgrown pieces back and choose the next size. Returned pieces earn exchange credit.',
  },
  {
    title: 'We clean, check, reuse',
    body: 'Every returned piece is inspected. Good ones go to another family; worn-out ones are recycled.',
  },
] as const;

export default async function HomePage() {
  const [plans, products] = await Promise.all([
    load(SubscriptionPlansQuery),
    load(ProductsQuery, { first: 4, sort: 'NEWEST' }),
  ]);

  return (
    <>
      <section className="overflow-hidden bg-gradient-to-b from-brand-50 to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col gap-6">
            <p className="w-fit rounded-full bg-surface px-3 py-1 text-sm font-semibold text-primary shadow-xs">
              Babywear subscription · Rwanda
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Clothes that keep up with your baby.
            </h1>
            <p className="max-w-prose text-lg text-foreground-muted">
              We find the right size, deliver it, and swap it for the next size when your baby grows. Then we
              clean, check and reuse what comes back.
            </p>
            <div className="flex flex-wrap gap-3">
              <NextLink href="/subscriptions" className={buttonClasses({ size: 'lg' })}>
                See plans
              </NextLink>
              <NextLink href="/shop" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
                Browse the shop
              </NextLink>
            </div>
          </div>
          <div aria-hidden="true" className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4">
            <ProductArt seed="hero-a" className="aspect-square rotate-[-4deg] rounded-2xl shadow-md" />
            <ProductArt seed="hero-bb" className="mt-10 aspect-square rotate-[3deg] rounded-2xl shadow-md" />
            <ProductArt seed="hero-c" className="-mt-6 aspect-square rotate-[2deg] rounded-2xl shadow-md" />
            <ProductArt seed="hero-ddd" className="mt-4 aspect-square rotate-[-3deg] rounded-2xl shadow-md" />
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="how" className="font-display text-3xl font-bold">
          How it works
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5"
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-primary-soft font-display font-bold text-primary-soft-foreground"
              >
                {index + 1}
              </span>
              <h3 className="font-display text-lg font-bold">{step.title}</h3>
              <p className="text-sm text-foreground-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="plans" className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="plans" className="font-display text-3xl font-bold">
                Plans
              </h2>
              <p className="mt-2 text-foreground-muted">Prices come straight from the database.</p>
            </div>
            <NextLink
              href="/subscriptions"
              className="font-semibold text-link underline underline-offset-4 hover:decoration-2"
            >
              Compare plans
            </NextLink>
          </div>
          <div className="mt-8">
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
        </div>
      </section>

      <section aria-labelledby="new" className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="new" className="font-display text-3xl font-bold">
            New in the shop
          </h2>
          <NextLink
            href="/shop"
            className="font-semibold text-link underline underline-offset-4 hover:decoration-2"
          >
            See everything
          </NextLink>
        </div>
        <div className="mt-8">
          {!products.ok ? (
            <ApiErrorState error={products.error} what="products" />
          ) : products.data.products.edges.length === 0 ? (
            <EmptyState
              title="The shop is empty"
              description="Products appear here once they are published."
            />
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {products.data.products.edges.map(({ node }) => (
                <li key={node.id} className="flex">
                  <ProductCard product={node} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="circular" className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2">
          <h2 id="circular" className="font-display text-3xl font-bold">
            Every piece has a history.
          </h2>
          <div className="flex flex-col gap-4 text-brand-50">
            <p>
              Each garment carries a tag. We record every step it takes: delivered, returned, inspected,
              cleaned, reused or recycled. Nothing is reused without passing inspection.
            </p>
            <p>That record is how we will report reuse honestly, from real numbers rather than estimates.</p>
          </div>
        </div>
      </section>
    </>
  );
}

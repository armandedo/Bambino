import { buttonClasses } from '@bambino/ui';
import { ArrowRight, Ruler, ShoppingBag, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'Shopping & delivery' };
const STEPS = [
  {
    icon: ShoppingBag,
    title: 'Find a little favourite',
    body: 'Browse by age or category, then open a product to see its photos, description, colours and available sizes.',
  },
  {
    icon: Ruler,
    title: 'Choose their size',
    body: 'Shop newborns through age 17. Age is a helpful starting point, but every child is different. Check each product’s available sizes and garment measurements before ordering.',
  },
  {
    icon: Truck,
    title: 'Make it theirs',
    body: 'Add your pieces to the bag. At checkout, choose from the delivery and payment options available for your address and review the full total.',
  },
];
export default function ShoppingGuidePage() {
  return (
    <>
      <PageHero
        eyebrow="A little help"
        title="Lovely finds. A few simple steps."
        intro="Here’s how to find their next outfit and get it on its way."
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-14 sm:px-6 lg:py-20">
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-3xl border border-border bg-surface p-7">
              <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-accent-soft">
                <Icon aria-hidden="true" className="size-6" strokeWidth={1.5} />
              </span>
              <p className="mb-2 text-xs text-emphasis">Step {i + 1}</p>
              <h2 className="mb-3 font-display text-xl font-semibold">{title}</h2>
              <p className="leading-relaxed text-foreground-muted">{body}</p>
            </li>
          ))}
        </ol>
        <section id="delivery" className="grid gap-7 rounded-3xl bg-surface-muted p-7 sm:p-10 md:grid-cols-2">
          <div>
            <h2 className="mb-3 font-display text-2xl font-semibold">A clear picture before you order</h2>
            <p className="leading-relaxed text-foreground-muted">
              Delivery availability, fees and estimated timing are shown at checkout for your address. Your
              order total includes the selected delivery option. You can review it before placing the order.
            </p>
          </div>
          <div>
            <h2 className="mb-3 font-display text-2xl font-semibold">After you’ve ordered</h2>
            <p className="leading-relaxed text-foreground-muted">
              Sign in to see your orders and follow their delivery status. If something doesn’t look right,
              open the order details and keep your order number handy when contacting Bambino.
            </p>
            <NextLink
              href="/dashboard/orders"
              className="mt-4 inline-block font-medium underline underline-offset-4"
            >
              See your orders
            </NextLink>
          </div>
        </section>
        <div className="flex flex-wrap gap-3">
          <NextLink href="/shop" className={buttonClasses()}>
            Ready to explore? <ArrowRight aria-hidden="true" className="size-4" />
          </NextLink>
          <NextLink href="/fit" className={buttonClasses({ variant: 'outline' })}>
            Help me find a size
          </NextLink>
        </div>
      </div>
    </>
  );
}

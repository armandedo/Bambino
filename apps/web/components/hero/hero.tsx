import { buttonClasses, cn } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

/**
 * The sizes a baby moves through, drawn as marks on a doorframe. Each stage has its own colour, which follows the
 * baby through tags, plans and boxes. Placeholder ranges until the size chart from the API is wired in here.
 */
const STAGES = [
  { label: 'Newborn', range: '0–3 months', tag: 'bg-stage-newborn', mark: 'w-10' },
  { label: 'Early', range: '3–6 months', tag: 'bg-stage-early', mark: 'w-14' },
  { label: 'Mid', range: '6–12 months', tag: 'bg-stage-mid', mark: 'w-20' },
  { label: 'Toddler', range: '12–18 months', tag: 'bg-stage-toddler', mark: 'w-28' },
  { label: 'Big', range: '18–24 months', tag: 'bg-stage-big', mark: 'w-36' },
] as const;

/**
 * The home page's opening: the headline, one main action, and a growth ruler that shows the stages a baby moves
 * through. Server-rendered; the ruler marks draw in once (transform only) and are readable without JavaScript.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="bg-surface-muted">
      {/* Split hero: the photo fills the left half, the headline and ruler sit on the cream panel. */}
      <div className="mx-auto grid max-w-[1400px] lg:grid-cols-2">
        <div className="relative aspect-[4/3] bg-sand-200 lg:aspect-auto lg:min-h-[40rem]">
          {/* The page's largest paint: fetched early, never lazy. */}
          <Image
            src={stockSrc(PHOTOS.heroMother)}
            alt={PHOTOS.heroMother.alt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            fetchPriority="high"
            loading="eager"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-center gap-7 px-4 py-12 sm:px-10 lg:px-16 lg:py-20">
          <h1
            id="hero-title"
            className="font-display text-[2.5rem] leading-[1.1] font-bold tracking-[0.016em] text-primary uppercase sm:text-5xl lg:text-[3.5rem]"
          >
            The right size, every month.
          </h1>
          <p className="max-w-[44ch] text-lg leading-relaxed text-foreground-muted">
            Babies outgrow clothes every few months. We bring clothes in your baby&rsquo;s size to your door
            in Kigali, collect them when they get small, and bring the next size up.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg', variant: 'primary' })}>
              Find my baby&rsquo;s size <ArrowRight aria-hidden="true" className="size-4" />
            </NextLink>
            <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
              See plans and prices
            </NextLink>
          </div>

          {/* The ruler: oldest stage at the top, like marks on a doorframe. */}
          <ol
            aria-label="Baby sizes from newborn to 24 months"
            className="mt-2 flex flex-col-reverse border-l border-primary"
          >
            {STAGES.map((stage, index) => (
              <li key={stage.label} className="relative flex items-center gap-4 py-1.5">
                <span
                  aria-hidden="true"
                  className={cn('ruler-mark h-px bg-primary', stage.mark)}
                  style={{ animationDelay: `${0.15 + index * 0.12}s` }}
                />
                <span
                  className={cn(
                    'rounded-full border border-primary/20 px-3.5 py-1 text-xs font-medium tracking-[0.08em] text-foreground uppercase',
                    stage.tag,
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-sm text-foreground-muted">{stage.range}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

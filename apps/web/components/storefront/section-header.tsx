import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';

export function SectionHeader({
  id,
  eyebrow,
  title,
  intro,
  href,
  action = 'Shop all',
}: {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 sm:mb-9">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-sm font-semibold tracking-[.12em] text-emphasis uppercase">{eyebrow}</p>
        ) : null}
        <h2
          id={id}
          className="font-display text-3xl leading-tight font-bold tracking-[-.045em] sm:text-[2.5rem]"
        >
          {title}
        </h2>
        {intro ? <p className="mt-3 text-base text-foreground-muted">{intro}</p> : null}
      </div>
      {href ? (
        <NextLink
          href={href}
          className="retail-text-link inline-flex min-h-11 items-center gap-2 font-semibold"
        >
          {action}
          <ArrowRight className="size-4" aria-hidden="true" />
        </NextLink>
      ) : null}
    </div>
  );
}

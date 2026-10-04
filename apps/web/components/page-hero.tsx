import type { ReactNode } from 'react';
import { Reveal } from './motion/primitives';

/** Opening band for inner pages: eyebrow, editorial headline, intro and optional actions. */
export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 pt-12 pb-14 sm:px-6 lg:pt-20 lg:pb-20">
        <Reveal immediate from="up" duration="normal">
          <p className="text-sm font-bold tracking-[0.14em] text-emphasis uppercase">{eyebrow}</p>
        </Reveal>
        <Reveal immediate delay={0.08}>
          <h1 className="max-w-4xl font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-primary sm:text-6xl">
            {title}
          </h1>
        </Reveal>
        {intro ? (
          <Reveal immediate delay={0.18}>
            <p className="max-w-2xl text-lg text-foreground-muted sm:text-xl">{intro}</p>
          </Reveal>
        ) : null}
        {children ? (
          <Reveal immediate delay={0.28}>
            {children}
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

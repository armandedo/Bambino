import type { ReactNode } from 'react';
import { Entrance } from './motion/entrance';

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
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-12 pb-14 sm:px-6 lg:pt-20 lg:pb-20">
        <Entrance as="p" className="text-base font-semibold text-emphasis">
          {eyebrow}
        </Entrance>
        <Entrance
          as="h1"
          delay={0.08}
          className="max-w-4xl font-display text-4xl leading-[1.02] font-semibold tracking-tight text-primary sm:text-6xl"
        >
          {title}
        </Entrance>
        {intro ? (
          <Entrance as="p" delay={0.18} className="max-w-2xl text-lg text-foreground-muted sm:text-xl">
            {intro}
          </Entrance>
        ) : null}
        {children ? <Entrance delay={0.28}>{children}</Entrance> : null}
      </div>
    </section>
  );
}

import type { ReactNode } from 'react';

export interface InfoSection {
  heading: string;
  body: ReactNode;
}

/** A short reading page (help, delivery, privacy, terms): a title, one line of context and plain sections. */
export function InfoPage({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro?: ReactNode;
  sections: InfoSection[];
  children?: ReactNode;
}) {
  return (
    <div className="retail-narrow flex flex-col gap-5 pt-5 pb-12">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">{title}</h1>
        {intro ? <p className="text-foreground-muted">{intro}</p> : null}
      </div>
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-1.5 py-4">
            <h2 className="font-semibold">{section.heading}</h2>
            <div className="flex flex-col gap-2 leading-relaxed text-foreground-muted">{section.body}</div>
          </section>
        ))}
      </div>
      {children}
    </div>
  );
}

export const INFO_LINK = 'rounded-sm font-medium text-foreground underline underline-offset-4';

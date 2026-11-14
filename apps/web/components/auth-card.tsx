import { Card } from '@bambino/ui';
import type { ReactNode } from 'react';

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8">
      <Card padding="lg" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
          {intro ? <p className="text-sm text-foreground-muted">{intro}</p> : null}
        </div>
        {children}
      </Card>
      {footer ? <div className="text-center text-sm text-foreground-muted">{footer}</div> : null}
    </div>
  );
}

import { BrandLogo } from '@bambino/ui';

/** The Bambino kite logo with the “admin” tag, for the staff sign-in screen and the admin header. */
export function Logo() {
  return (
    <span className="inline-flex items-end gap-2">
      <BrandLogo className="h-7" />
      <span className="pb-px font-sans text-sm leading-none font-semibold text-foreground-muted">admin</span>
    </span>
  );
}

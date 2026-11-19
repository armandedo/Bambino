import { BrandLogo } from '@bambino/ui';

/**
 * The Bambino kite logo, sized for the compact shop header.
 * The link around it carries the name ("Bambino home"), so the drawing itself is hidden from screen readers by default.
 */
export function Logo({
  tone,
  label = '',
  className,
}: {
  tone?: 'default' | 'onDark';
  label?: string;
  className?: string;
}) {
  return <BrandLogo {...(tone ? { tone } : {})} label={label} className={className ?? 'h-7 sm:h-8'} />;
}

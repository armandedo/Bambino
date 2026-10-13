/**
 * The same design tokens as the website (packages/ui/src/tokens.ts), converted to React Native numbers:
 * rem becomes 16-pixel units.
 */
import { colors, radii } from '@bambino/ui/tokens';

export { colors };

const rem = (value: string) => Math.round(Number.parseFloat(value) * 16);

export const radius = {
  sm: rem(radii.sm),
  md: rem(radii.md),
  lg: rem(radii.lg),
  full: 9999,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Space Grotesk is not bundled yet; the system font is used until the font files are added. */
export const font = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '500' as const },
  bold: { fontWeight: '700' as const },
};

export const minTouchTarget = 44;

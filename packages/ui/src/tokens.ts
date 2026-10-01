/**
 * Design tokens: the single source for colour, type, spacing, radius and shadow.
 *
 * `theme.css` (Tailwind v4 `@theme`) is generated from this file by `pnpm --filter @bambino/ui tokens`,
 * and a test fails if the two drift. The mobile app (Phase 7) reads the same values for NativeWind.
 */

/** Raw palette. Components never use these directly; they use the semantic colours below. */
export const palette = {
  /** Eucalyptus green: the brand colour, chosen for calm and the circular-economy story. */
  brand: {
    50: '#eef7f4',
    100: '#d5ede5',
    200: '#abdacb',
    300: '#7bc1ac',
    400: '#4fa48c',
    500: '#2f8770',
    600: '#226d5a',
    700: '#1d5849',
    800: '#1a473c',
    900: '#163b32',
  },
  /** Warm coral: highlights and calls to action that are not the main action. */
  accent: {
    50: '#fef4ef',
    100: '#fde4d8',
    200: '#fac7b0',
    300: '#f5a280',
    400: '#ee7d55',
    500: '#e35f35',
    600: '#c24a28',
    700: '#a13b22',
    800: '#802f1f',
    900: '#67281c',
  },
  /** Warm neutrals ("sand") rather than blue-greys, to suit a soft babywear brand. */
  sand: {
    0: '#ffffff',
    50: '#fbf9f6',
    100: '#f4f0ea',
    200: '#e7e1d7',
    300: '#d3cabc',
    400: '#a89e8f',
    500: '#7d7466',
    600: '#5f574b',
    700: '#48413a',
    800: '#2f2a25',
    900: '#1e1b18',
  },
  success: { 50: '#ecf8f0', 200: '#a9dfbd', 700: '#19663a', 800: '#14522f' },
  warning: { 50: '#fff6db', 200: '#f5d77c', 700: '#7a4f00', 800: '#5f3d00' },
  danger: { 50: '#fdf0ef', 200: '#f4b8b2', 600: '#b42318', 700: '#982016', 800: '#7a1a12' },
  info: { 50: '#eef4fd', 200: '#b3cdf3', 700: '#1f4f9a', 800: '#193f7b' },
} as const;

/** Semantic colours: what components use. Every text/background pair is contrast-tested to WCAG AA. */
export const colors = {
  background: palette.sand[50],
  surface: palette.sand[0],
  'surface-muted': palette.sand[100],
  'surface-sunken': palette.sand[200],
  foreground: palette.sand[900],
  'foreground-muted': palette.sand[600],
  border: palette.sand[200],
  /** Borders of form controls must reach 3:1 against the surface (WCAG 1.4.11). */
  'border-strong': palette.sand[500],
  primary: palette.brand[600],
  'primary-hover': palette.brand[700],
  'primary-foreground': palette.sand[0],
  'primary-soft': palette.brand[50],
  'primary-soft-foreground': palette.brand[800],
  accent: palette.accent[600],
  'accent-hover': palette.accent[700],
  'accent-foreground': palette.sand[0],
  'accent-soft': palette.accent[50],
  'accent-soft-foreground': palette.accent[800],
  link: palette.brand[700],
  focus: palette.brand[500],
  'success-soft': palette.success[50],
  'success-border': palette.success[200],
  'success-foreground': palette.success[800],
  'warning-soft': palette.warning[50],
  'warning-border': palette.warning[200],
  'warning-foreground': palette.warning[800],
  'danger-soft': palette.danger[50],
  'danger-border': palette.danger[200],
  'danger-foreground': palette.danger[800],
  danger: palette.danger[600],
  'danger-hover': palette.danger[700],
  'info-soft': palette.info[50],
  'info-border': palette.info[200],
  'info-foreground': palette.info[800],
} as const;

export type ColorToken = keyof typeof colors;

export const fonts = {
  /** Rounded, friendly headings. Loaded by each app (next/font on web); the stack is the fallback. */
  display: '"Nunito", ui-rounded, "Segoe UI", system-ui, sans-serif',
  sans: '"Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

/** Type scale: [font-size, line-height]. Body text is 16px so mobile browsers never zoom inputs. */
export const fontSizes = {
  xs: ['0.75rem', '1rem'],
  sm: ['0.875rem', '1.25rem'],
  base: ['1rem', '1.5rem'],
  lg: ['1.125rem', '1.75rem'],
  xl: ['1.25rem', '1.75rem'],
  '2xl': ['1.5rem', '2rem'],
  '3xl': ['1.875rem', '2.25rem'],
  '4xl': ['2.25rem', '2.5rem'],
  '5xl': ['3rem', '1.1'],
} as const;

/** Tailwind's 4px spacing unit is kept; this is the base it multiplies. */
export const spacingUnit = '0.25rem';

export const radii = {
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  '2xl': '1.75rem',
  full: '9999px',
} as const;

export const shadows = {
  xs: '0 1px 2px rgb(30 27 24 / 0.06)',
  sm: '0 1px 3px rgb(30 27 24 / 0.08), 0 1px 2px rgb(30 27 24 / 0.04)',
  md: '0 4px 12px rgb(30 27 24 / 0.08), 0 2px 4px rgb(30 27 24 / 0.04)',
  lg: '0 12px 32px rgb(30 27 24 / 0.12), 0 4px 8px rgb(30 27 24 / 0.04)',
} as const;

/** Minimum touch target (WCAG 2.5.8 asks for 24px; 44px follows the platform guidelines). */
export const minTouchTarget = '2.75rem';

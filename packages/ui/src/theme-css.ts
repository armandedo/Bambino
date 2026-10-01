import { colors, fontSizes, fonts, palette, radii, shadows, spacingUnit } from './tokens';

/**
 * Renders the tokens as a Tailwind v4 `@theme` block. Tailwind's default colour palette is cleared
 * (`--color-*: initial`), so only Bambino colours exist and an off-brand `bg-blue-500` does not compile.
 */
export function generateThemeCss(): string {
  const lines: string[] = [
    '/* Generated from src/tokens.ts by `pnpm --filter @bambino/ui tokens`. Do not edit by hand. */',
    '@theme {',
    '  --color-*: initial;',
  ];
  for (const [scale, shades] of Object.entries(palette)) {
    for (const [shade, value] of Object.entries(shades)) {
      lines.push(`  --color-${scale}-${shade}: ${value};`);
    }
  }
  for (const [name, value] of Object.entries(colors)) {
    lines.push(`  --color-${name}: ${value};`);
  }
  lines.push('');
  for (const [name, value] of Object.entries(fonts)) {
    lines.push(`  --font-${name}: ${value};`);
  }
  lines.push('');
  for (const [name, [size, lineHeight]] of Object.entries(fontSizes)) {
    lines.push(`  --text-${name}: ${size};`, `  --text-${name}--line-height: ${lineHeight};`);
  }
  lines.push('', `  --spacing: ${spacingUnit};`, '');
  for (const [name, value] of Object.entries(radii)) {
    lines.push(`  --radius-${name}: ${value};`);
  }
  lines.push('');
  for (const [name, value] of Object.entries(shadows)) {
    lines.push(`  --shadow-${name}: ${value};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

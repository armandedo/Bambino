import { AGE_GROUPS } from './age-groups';

export interface PlannedVariant {
  sku: string;
  sizeCode: string;
  color: string;
}

/** "White, soft pink; Sky blue" becomes ["White", "Soft pink", "Sky blue"], without repeats (case-insensitive). */
export function parseColors(text: string): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const clean = part.trim().replace(/\s+/g, ' ');
    if (!clean || clean.length > 40) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(clean.charAt(0).toUpperCase() + clean.slice(1));
  }
  return colors;
}

/**
 * The variants a new product needs when staff pick age groups and colours: one per colour and size in the chosen
 * groups. SKUs are `<SLUG>-<COLOUR>-<SIZE>`, unique because the slug is. `availableSizes` limits sizes to ones that
 * exist in the database.
 */
export function planVariants(input: {
  slug: string;
  ageSlugs: readonly string[];
  colors: readonly string[];
  availableSizes: readonly string[];
}): PlannedVariant[] {
  const sizes = AGE_GROUPS.filter((group) => input.ageSlugs.includes(group.slug))
    .flatMap((group) => group.sizeCodes)
    .filter((code) => input.availableSizes.includes(code));
  const prefix = input.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  return input.colors.flatMap((color) =>
    sizes.map((sizeCode) => ({
      sku: `${prefix}-${color.toUpperCase().replace(/[^A-Z0-9]+/g, '')}-${sizeCode.replace(/[^0-9A-Z]/gi, '')}`,
      sizeCode,
      color,
    })),
  );
}

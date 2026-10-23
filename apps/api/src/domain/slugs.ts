/** Longest slug we generate, leaving room for a "-12" suffix under the 120-character limit. */
const MAX_BASE = 100;

/**
 * A web address segment from a product name: lowercase ASCII letters and digits separated by single hyphens.
 * Accents are folded ("Crème" becomes "creme"); a name with nothing usable gives "product".
 */
export function slugify(name: string): string {
  const folded = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = folded.slice(0, MAX_BASE).replace(/-+$/, '');
  return base || 'product';
}

/** `base` if free, otherwise `base-2`, `base-3`, ... the first one not in `taken`. */
export function firstFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

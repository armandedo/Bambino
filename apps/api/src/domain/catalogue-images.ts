/**
 * Pure helpers for the bulk product-image workflow (scripts/catalogue-images.ts, docs/13-catalogue-and-images.md):
 * a photo brief for each product that has no image yet, and the file naming that links an image file to a product.
 */

export interface BriefInput {
  slug: string;
  name: string;
  category: string;
  colors: readonly string[];
  sizes: readonly string[];
  description: string;
}

export interface ImageBrief {
  slug: string;
  name: string;
  /** Text to give an image tool, one per shot. */
  prompts: { file: string; shot: 'primary' | 'detail' | 'lifestyle'; prompt: string }[];
}

const STYLE =
  'Professional e-commerce product photograph, soft natural light, clean cream or pale pastel background, ' +
  'realistic fabric texture and stitching, accurate garment proportions, square 1:1 composition, centred, ' +
  'no text, no logos, no brand names, no watermark.';

const SAFETY =
  'No loose ties near the neck, no detachable small parts, and nothing that suggests an unsafe sleep setup.';

const WORN_BY_BABY =
  /bodysuit|sleeper|pyjama|romper|dress|dungaree|sweater|jacket|raincoat|swimsuit|t-shirt|top|trousers|pants|leggings/i;

/** "seed-ext-bod" and a trailing "(seed)" are removed so the brief describes the product, not the placeholder. */
export function cleanName(name: string): string {
  return name.replace(/\s*\(seed[^)]*\)\s*$/i, '').trim();
}

export function buildBrief(input: BriefInput): ImageBrief {
  const name = cleanName(input.name).toLowerCase();
  const color = input.colors[0]?.toLowerCase() ?? 'neutral';
  const ages =
    input.sizes.length > 0 ? `${input.sizes[0]} to ${input.sizes[input.sizes.length - 1]}` : 'baby';
  const prompts: ImageBrief['prompts'] = [
    {
      file: `${input.slug}.jpg`,
      shot: 'primary',
      prompt: `A single ${color} baby ${name} (sizes ${ages}), laid flat or on an invisible mannequin. ${STYLE} ${SAFETY}`,
    },
    {
      file: `${input.slug}-2.jpg`,
      shot: 'detail',
      prompt: `Close-up of the fabric, stitching and fastening of a ${color} baby ${name}. ${STYLE}`,
    },
  ];
  if (WORN_BY_BABY.test(name)) {
    prompts.push({
      file: `${input.slug}-3.jpg`,
      shot: 'lifestyle',
      prompt: `A calm, appropriately aged baby wearing a ${color} ${name}, sitting or lying safely on a soft rug, natural window light, uncluttered cream background. ${STYLE} ${SAFETY}`,
    });
  }
  return { slug: input.slug, name: cleanName(input.name), prompts };
}

const FILE = /^(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(?<order>[2-9]))?\.(?<ext>jpe?g|png|webp)$/i;

export interface ParsedImageFile {
  slug: string;
  /** 1 for the main image, 2 and up for further views. */
  position: number;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** `seed-ext-bod.jpg` is the main image of that product; `seed-ext-bod-2.png` is its second view. */
export function parseImageFile(fileName: string): ParsedImageFile | null {
  const match = FILE.exec(fileName);
  if (!match?.groups) return null;
  const ext = (match.groups.ext ?? '').toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return {
    slug: (match.groups.slug ?? '').toLowerCase(),
    position: match.groups.order ? Number(match.groups.order) : 1,
    contentType,
  };
}

export function altTextFor(productName: string, position: number): string {
  const name = cleanName(productName);
  return position === 1 ? name : `${name}, view ${position}`;
}

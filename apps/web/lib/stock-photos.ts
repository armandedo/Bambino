/**
 * Professional stock photography used across the marketing pages until Bambino's own shoot is ready.
 *
 * All photos are from Unsplash (https://unsplash.com/license): free for commercial use, no permission needed.
 * They are self-hosted under public/images/stock/ (no request to a third party from the visitor's browser) and
 * resized by next/image. To add or replace one, edit the list below and run
 * `pnpm --filter @bambino/web stock-photos`, which downloads any missing file.
 */

export interface StockPhoto {
  /** The Unsplash photo id: the part after `photo-` in an images.unsplash.com URL. Also the local file name. */
  id: string;
  alt: string;
  /** The photographer, shown in the footer's photo credits. */
  credit: string;
}

/** The self-hosted file, for next/image. */
export function stockSrc(photo: StockPhoto): string {
  return `/images/stock/${photo.id}.jpg`;
}

/** Where the download script fetches the original (large enough for next/image to resize down from). */
export function unsplashDownloadUrl(photo: StockPhoto): string {
  return `https://images.unsplash.com/photo-${photo.id}?w=1440&q=72&fm=jpg`;
}

export const PHOTOS = {
  heroMother: {
    id: '1596510915005-2cd3c22b37df',
    alt: 'A mother cuddling her baby',
    credit: 'Lawrence Crayton',
  },
  heroBaby: {
    id: '1737648987004-2f724d30e6b7',
    alt: 'A happy baby sitting on colourful kitenge fabric',
    credit: 'Unsplash',
  },

  // How it works, one per step
  stepProfile: {
    id: '1591451855781-9eb0f9726a33',
    alt: 'A smiling mother holding her baby close',
    credit: 'Andrae Ricketts',
  },
  stepPlan: {
    id: '1768693602418-260d828b878d',
    alt: 'Soft baby clothes folded in a woven basket',
    credit: 'Carmela Lustre',
  },
  stepFit: {
    id: '1523901839036-a3030662f220',
    alt: 'A tailor’s measuring tape',
    credit: 'Unsplash',
  },
  stepBox: {
    id: '1718628816251-9af355936244',
    alt: 'A baby sitting in an open delivery box',
    credit: 'Jonathan Borba',
  },
  stepReturn: {
    id: '1766918780914-5df4a5a98c44',
    alt: 'Baby clothes hanging on a rack',
    credit: 'Jackson Kondili',
  },
  stepExchange: {
    id: '1766918780916-228d10b071be',
    alt: 'Baby clothes and shoes organised on shelves, ready for the next family',
    credit: 'Jackson Kondili',
  },

  // Circular section
  circular: {
    id: '1596433904747-e8b061219a71',
    alt: 'A stack of soft, folded garments in natural tones',
    credit: 'Unsplash',
  },

  // Made for here
  kigaliSkyline: {
    id: '1687986261123-b17f08f2796c',
    alt: 'The Kigali skyline at sunset',
    credit: 'Jean Claude Akarikumutima',
  },
  kigaliHills: {
    id: '1708772565599-2c4e4b3ed9db',
    alt: 'Homes across the hills of Kigali',
    credit: 'Protais Benjamin Mugenzi',
  },
  motherCarrying: {
    id: '1487546331507-fcf8a5d27ab3',
    alt: 'A mother in a headwrap carrying her baby',
    credit: 'Annie Spratt',
  },
} satisfies Record<string, StockPhoto>;

/** Product photos by garment type, used while a product has no photos of its own. */
const PRODUCT_PHOTOS: { match: RegExp; photo: StockPhoto }[] = [
  {
    match: /bodysuit|onesie|vest/i,
    photo: { id: '1622290319146-7b63df48a635', alt: 'A white cotton baby bodysuit', credit: 'Mediamodifier' },
  },
  {
    match: /romper|overall|dungaree/i,
    photo: {
      id: '1780329942969-eb17bf426e37',
      alt: 'A baby in a soft printed romper',
      credit: 'Rohit Dey',
    },
  },
  {
    match: /sleep|pajama|pyjama|night/i,
    photo: {
      id: '1582212742235-a2500f31cb39',
      alt: 'A baby asleep in light blue sleepwear',
      credit: 'Hessam Nabavi',
    },
  },
  {
    match: /trouser|pant|legging|jogger/i,
    photo: {
      id: '1605644235751-709c7254e3e3',
      alt: 'A baby sitting in everyday trousers and a long-sleeve top',
      credit: 'Marcin Jozwiak',
    },
  },
];

export function productPhotoFor(seed: string): StockPhoto | undefined {
  return PRODUCT_PHOTOS.find((entry) => entry.match.test(seed))?.photo;
}

/** Every stock photo the site uses. */
export const ALL_STOCK_PHOTOS: StockPhoto[] = [
  ...Object.values(PHOTOS),
  ...PRODUCT_PHOTOS.map((p) => p.photo),
];

/** Named photographers, for the credits line ("Unsplash" entries have no named author). */
export const PHOTO_CREDITS: string[] = [...new Set(ALL_STOCK_PHOTOS.map((p) => p.credit))]
  .filter((name) => name !== 'Unsplash')
  .sort();

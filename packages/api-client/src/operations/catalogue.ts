import { operation } from '../client';

/** Public catalogue reads. Field selections are validated against the API schema in a test. */

export interface Money {
  amount: number;
  currency: string;
}

export interface SizeSummary {
  code: string;
  label: string;
  sortOrder: number;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  brand: string;
  subscriptionEligible: boolean;
  category: CategorySummary;
  images: { id: string; url: string; altText: string }[];
  priceFrom: Money | null;
  /** `inStock`: new units for sale. `availableForSubscription`: a tagged garment can be reserved now. */
  variants: { id: string; inStock: boolean; availableForSubscription: boolean; size: SizeSummary }[];
}

const PRODUCT_CARD_FIELDS = `
  id slug name brand subscriptionEligible
  category { id slug name }
  images { id url altText }
  priceFrom { amount currency }
  variants { id inStock availableForSubscription size { code label sortOrder } }
`;

export type ProductSort = 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'NAME_ASC';

export interface ProductFilter {
  search?: string;
  categorySlug?: string;
  sizeCodes?: string[];
  inStockOnly?: boolean;
  subscriptionEligible?: boolean;
}

export const ProductsQuery = operation<
  {
    products: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: { node: ProductCard }[];
    };
  },
  { filter?: ProductFilter; sort?: ProductSort; first?: number; after?: string }
>(
  'Products',
  `query Products($filter: ProductFilter, $sort: ProductSort, $first: Int, $after: String) {
    products(filter: $filter, sort: $sort, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node { ${PRODUCT_CARD_FIELDS} } }
    }
  }`,
);

export interface ProductDetail extends Omit<ProductCard, 'variants'> {
  description: string;
  material: string | null;
  sustainabilityInfo: string | null;
  careInstructions: string | null;
  oneTimeEligible: boolean;
  variants: { id: string; sku: string; color: string; inStock: boolean; price: Money; size: SizeSummary }[];
}

export const ProductQuery = operation<{ product: ProductDetail | null }, { slug: string }>(
  'Product',
  `query Product($slug: String!) {
    product(slug: $slug) {
      id slug name brand description material sustainabilityInfo careInstructions
      subscriptionEligible oneTimeEligible
      category { id slug name }
      images { id url altText }
      priceFrom { amount currency }
      variants { id sku color inStock price { amount currency } size { code label sortOrder } }
    }
  }`,
);

export const CatalogueFiltersQuery = operation<{ categories: CategorySummary[]; sizes: SizeSummary[] }>(
  'CatalogueFilters',
  `query CatalogueFilters {
    categories { id slug name }
    sizes { code label sortOrder }
  }`,
);

export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface PlanSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  billingInterval: BillingInterval;
  price: Money;
  itemsPerCycle: number;
  exchangesPerCycle: number | null;
}

export const SubscriptionPlansQuery = operation<{ subscriptionPlans: PlanSummary[] }>(
  'SubscriptionPlans',
  `query SubscriptionPlans {
    subscriptionPlans { id code name description billingInterval price { amount currency } itemsPerCycle exchangesPerCycle }
  }`,
);

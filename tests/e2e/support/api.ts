import { type APIRequestContext, type Page, expect, request } from '@playwright/test';

const GRAPHQL_URL = `${process.env.E2E_API_URL ?? 'http://localhost:4000'}/graphql`;

interface GraphQLResult<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

async function post<T>(
  context: APIRequestContext,
  headers: Record<string, string>,
  query: string,
  variables: object = {},
): Promise<T> {
  const response = await context.post(GRAPHQL_URL, {
    headers: { 'content-type': 'application/json', ...headers },
    data: { query, variables },
  });
  const body = (await response.json()) as GraphQLResult<T>;
  if (body.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  if (!body.data) throw new Error('GraphQL response without data');
  return body.data;
}

/**
 * Calls the API as the customer signed in on `page`, using the same httpOnly cookies the website uses.
 * Used to set up state quickly and to read ids; every step a journey tests is done through the UI.
 */
export function customerApi(page: Page) {
  return <T>(query: string, variables: object = {}) =>
    post<T>(page.request, { 'x-bambino-client': 'web' }, query, variables);
}

/**
 * The seeded admin, through the API. Staff screens arrive with the admin dashboard (Phase 8); until then the
 * operations team's steps in a journey (approving, receiving, inspecting) are performed here.
 */
export async function staffApi() {
  const email = process.env.E2E_STAFF_EMAIL ?? 'admin@seed.test';
  const password = process.env.E2E_STAFF_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  if (!password)
    throw new Error(
      'Set SEED_ADMIN_PASSWORD (or E2E_STAFF_PASSWORD) and run `pnpm --filter @bambino/api db:seed`.',
    );
  const context = await request.newContext();
  const login = await post<{ login: { accessToken: string } }>(
    context,
    {},
    'mutation ($input: LoginInput!) { login(input: $input) { accessToken } }',
    { input: { email, password } },
  );
  const token = login.login.accessToken;
  expect(token).toBeTruthy();
  const call = <T>(query: string, variables: object = {}) =>
    post<T>(context, { authorization: `Bearer ${token}` }, query, variables);

  return {
    call,
    async advanceOrder(orderId: string, statuses: string[]) {
      for (const status of statuses) {
        await call(
          'mutation ($id: ID!, $status: OrderStatus!) { adminUpdateOrderStatus(orderId: $id, status: $status) { status } }',
          {
            id: orderId,
            status,
          },
        );
      }
    },
    async advanceDelivery(deliveryId: string, statuses: string[]) {
      for (const status of statuses) {
        await call(
          'mutation ($input: DeliveryUpdateInput!) { adminUpdateDelivery(input: $input) { status } }',
          {
            input: { deliveryId, status },
          },
        );
      }
    },
    /**
     * Registers new tagged garments (checked in, ready to reserve) for every subscription variant in these sizes, so a journey
     * never depends on what earlier runs left in the shared development database.
     */
    async stockGarments(sizeCodes: string[], perVariant = 2) {
      const { products } = await call<{
        products: { edges: { node: { variants: { id: string; size: { code: string } }[] } }[] };
      }>(
        '{ products(filter: { subscriptionEligible: true }, first: 50) { edges { node { variants { id size { code } } } } } }',
      );
      const variants = products.edges
        .flatMap((edge) => edge.node.variants)
        .filter((v) => sizeCodes.includes(v.size.code));
      for (const variant of variants) {
        // Registration records PROCURED and checks the garment in (AVAILABLE) in one step.
        await call(
          'mutation ($id: ID!, $n: Int!) { adminRegisterGarments(variantId: $id, quantity: $n) { id } }',
          {
            id: variant.id,
            n: perVariant,
          },
        );
      }
    },
    dispose: () => context.dispose(),
  };
}

/** A unique, recognisable test identity (seed and test data use the seed.test domain). */
export function testEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@seed.test`;
}

export const TEST_PASSWORD = 'e2e-Journey-pass-2026';

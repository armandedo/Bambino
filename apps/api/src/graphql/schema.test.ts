import * as types from '@bambino/types';
import {
  type GraphQLField,
  GraphQLEnumType,
  type GraphQLObjectType,
  type GraphQLSchema,
  Kind,
  assertValidSchema,
} from 'graphql';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadSchema } from './load-schema';

let schema: GraphQLSchema;
let queryFields: Record<string, GraphQLField<unknown, unknown>>;
let mutationFields: Record<string, GraphQLField<unknown, unknown>>;

beforeAll(() => {
  schema = loadSchema();
  queryFields = (schema.getQueryType() as GraphQLObjectType).getFields();
  mutationFields = (schema.getMutationType() as GraphQLObjectType).getFields();
});

function directiveNames(field: GraphQLField<unknown, unknown>): string[] {
  return (field.astNode?.directives ?? []).map((directive) => directive.name.value);
}

function requiredPermission(field: GraphQLField<unknown, unknown>): string | undefined {
  const directive = field.astNode?.directives?.find((candidate) => candidate.name.value === 'requires');
  const value = directive?.arguments?.find((argument) => argument.name.value === 'permission')?.value;
  return value?.kind === Kind.STRING ? value.value : undefined;
}

describe('GraphQL contract', () => {
  it('is a valid schema', () => {
    expect(() => assertValidSchema(schema)).not.toThrow();
  });

  it('exposes every query named in the specification', () => {
    const required = [
      'me',
      'products',
      'product',
      'categories',
      'myBabyProfiles',
      'mySubscriptions',
      'myOrders',
      'myReturns',
      'myExchangeCredits',
      'myNotifications',
      'sizingRecommendation',
    ];
    expect(required.filter((name) => !(name in queryFields))).toEqual([]);
  });

  it('exposes every mutation named in the specification', () => {
    const required = [
      'register',
      'login',
      'createBabyProfile',
      'updateBabyProfile',
      'createSizingRecommendation',
      'createCart',
      'addToCart',
      'removeFromCart',
      'createOrder',
      'createSubscription',
      'pauseSubscription',
      'resumeSubscription',
      'cancelSubscription',
      'requestReturn',
      'createExchange',
      'applyExchangeCredit',
      'updateProfile',
      'updateAddress',
    ];
    expect(required.filter((name) => !(name in mutationFields))).toEqual([]);
  });
});

describe('enum parity with @bambino/types', () => {
  const pairs: Record<string, readonly string[]> = {
    UserStatus: types.USER_STATUSES,
    ConsentType: types.CONSENT_TYPES,
    DataRequestType: types.DATA_REQUEST_TYPES,
    DataRequestStatus: types.DATA_REQUEST_STATUSES,
    BabySex: types.BABY_SEXES,
    FitPreference: types.FIT_PREFERENCES,
    MeasurementSource: types.MEASUREMENT_SOURCES,
    FitOutcome: types.FIT_OUTCOMES,
    GarmentStatus: types.GARMENT_STATUSES,
    GarmentCondition: types.GARMENT_CONDITIONS,
    BillingInterval: types.BILLING_INTERVALS,
    SubscriptionStatus: types.SUBSCRIPTION_STATUSES,
    SubscriptionEventType: types.SUBSCRIPTION_EVENT_TYPES,
    SubscriptionItemStatus: types.SUBSCRIPTION_ITEM_STATUSES,
    OrderType: types.ORDER_TYPES,
    OrderStatus: types.ORDER_STATUSES,
    DiscountType: types.DISCOUNT_TYPES,
    PromotionScope: types.PROMOTION_SCOPES,
    PaymentProvider: types.PAYMENT_PROVIDERS,
    PaymentStatus: types.PAYMENT_STATUSES,
    DeliveryStatus: types.DELIVERY_STATUSES,
    DeliveryDirection: types.DELIVERY_DIRECTIONS,
    ReturnStatus: types.RETURN_STATUSES,
    ReturnReason: types.RETURN_REASONS,
    ReturnItemOutcome: types.RETURN_ITEM_OUTCOMES,
    ExchangeStatus: types.EXCHANGE_STATUSES,
    ExchangeCreditEntryType: types.EXCHANGE_CREDIT_ENTRY_TYPES,
  };

  it.each(Object.entries(pairs))('%s matches', (name, expected) => {
    const type = schema.getType(name);
    expect(type).toBeInstanceOf(GraphQLEnumType);
    expect((type as GraphQLEnumType).getValues().map((value) => value.name)).toEqual([...expected]);
  });

  it('covers every domain enum in the schema except client-only ones', () => {
    const clientOnly = ['ProductSort'];
    const domainEnums = Object.values(schema.getTypeMap())
      .filter((type) => type instanceof GraphQLEnumType && !type.name.startsWith('__'))
      .map((type) => type.name)
      .filter((name) => !clientOnly.includes(name));
    expect(domainEnums.sort()).toEqual(Object.keys(pairs).sort());
  });
});

describe('authorization declared in the contract', () => {
  // Reachable without signing in. Anything not listed here must declare a guard.
  const publicQueries = [
    'market',
    'me',
    'sizes',
    'products',
    'product',
    'categories',
    'deliveryOptions',
    'subscriptionPlans',
  ];
  const publicMutations = [
    'register',
    'login',
    'refreshSession',
    'logout',
    'requestPasswordReset',
    'resetPassword',
    'verifyEmail',
  ];

  const allFields = () => [
    ...Object.values(queryFields).map((field) => ({ field, isPublic: publicQueries.includes(field.name) })),
    ...Object.values(mutationFields).map((field) => ({
      field,
      isPublic: publicMutations.includes(field.name),
    })),
  ];

  it('guards every non-public operation', () => {
    const unguarded = allFields()
      .filter(({ field, isPublic }) => !isPublic && directiveNames(field).length === 0)
      .map(({ field }) => field.name);
    expect(unguarded).toEqual([]);
  });

  it('keeps the public list honest', () => {
    const guardedButListedPublic = allFields()
      .filter(({ field, isPublic }) => isPublic && directiveNames(field).length > 0)
      .map(({ field }) => field.name);
    expect(guardedButListedPublic).toEqual([]);
  });

  it('requires a known permission on every admin operation, and only there', () => {
    const problems: string[] = [];
    for (const { field } of allFields()) {
      const permission = requiredPermission(field);
      const isAdmin = field.name.startsWith('admin');
      if (isAdmin && permission === undefined) problems.push(`${field.name}: missing @requires`);
      if (!isAdmin && permission !== undefined)
        problems.push(`${field.name}: @requires on a non-admin field`);
      if (permission !== undefined && !(types.PERMISSIONS as readonly string[]).includes(permission)) {
        problems.push(`${field.name}: unknown permission "${permission}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses every permission in the catalogue, apart from a declared few', () => {
    const used = new Set(
      allFields()
        .map(({ field }) => requiredPermission(field))
        .filter(Boolean),
    );
    // Granted for features that arrive after P0; listed so the gap is deliberate, not forgotten.
    const notYetUsed = ['customer:write', 'notification:write', 'settings:write'];
    const unused = types.PERMISSIONS.filter(
      (permission) => !used.has(permission) && !notYetUsed.includes(permission),
    );
    expect(unused).toEqual([]);
  });

  it('never accepts a price or total from a customer', () => {
    const customerMutations = Object.values(mutationFields).filter(
      (field) => !field.name.startsWith('admin'),
    );
    const offenders: string[] = [];
    for (const field of customerMutations) {
      const pending = field.args.map((argument) => ({
        path: `${field.name}.${argument.name}`,
        type: argument.type,
      }));
      const seen = new Set<string>();
      for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
        const typeName = entry.type.toString().replace(/[[\]!]/g, '');
        if (typeName === 'MinorUnits') offenders.push(entry.path);
        const named = schema.getType(typeName);
        if (named && 'getFields' in named && !seen.has(typeName)) {
          seen.add(typeName);
          for (const inner of Object.values(named.getFields())) {
            pending.push({ path: `${entry.path}.${inner.name}`, type: inner.type });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('default role grants', () => {
  it('give customers no staff permissions and super admins all of them', () => {
    expect(types.DEFAULT_ROLE_PERMISSIONS.CUSTOMER).toEqual([]);
    expect(types.DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(types.PERMISSIONS);
  });

  it('only reference known permissions, without duplicates', () => {
    for (const role of types.ROLE_KEYS) {
      const granted = types.DEFAULT_ROLE_PERMISSIONS[role];
      expect(new Set(granted).size, role).toBe(granted.length);
      for (const permission of granted) expect(types.PERMISSIONS, role).toContain(permission);
    }
  });

  it('keep role management and payment writes away from operational roles', () => {
    for (const role of [
      'OPERATIONS_MANAGER',
      'INVENTORY_MANAGER',
      'CUSTOMER_SUPPORT',
      'DELIVERY_STAFF',
      'CONTENT_MANAGER',
    ] as const) {
      expect(types.DEFAULT_ROLE_PERMISSIONS[role]).not.toContain('user_role:write');
      expect(types.DEFAULT_ROLE_PERMISSIONS[role]).not.toContain('payment:write');
    }
  });
});

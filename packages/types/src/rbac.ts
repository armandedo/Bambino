/**
 * Role-based access control catalogue.
 *
 * Authorization is always checked against permissions, never against role names,
 * so new roles can be added (or existing ones re-scoped) as data without code changes.
 * The seed script writes these into the roles / permissions / role_permissions tables.
 */

export const PERMISSIONS = [
  'customer:read',
  'customer:write',
  'baby_profile:read',
  'product:read',
  'product:write',
  'inventory:read',
  'inventory:write',
  'garment:read',
  'garment:write',
  'order:read',
  'order:write',
  'subscription:read',
  'subscription:write',
  'plan:write',
  'payment:read',
  'payment:write',
  'return:read',
  'return:write',
  'exchange:read',
  'exchange:write',
  'delivery:read',
  'delivery:write',
  'promotion:read',
  'promotion:write',
  'notification:write',
  'report:read',
  'settings:write',
  'user_role:read',
  'user_role:write',
  'audit_log:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  'CUSTOMER',
  'SUPER_ADMIN',
  'OPERATIONS_MANAGER',
  'INVENTORY_MANAGER',
  'CUSTOMER_SUPPORT',
  'DELIVERY_STAFF',
  'FINANCE',
  'CONTENT_MANAGER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Default grants. CUSTOMER holds no staff permissions: customers only ever reach
 * their own data, which is enforced by ownership checks rather than permissions.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  CUSTOMER: [],
  SUPER_ADMIN: PERMISSIONS,
  OPERATIONS_MANAGER: [
    'customer:read',
    'baby_profile:read',
    'product:read',
    'inventory:read',
    'inventory:write',
    'garment:read',
    'garment:write',
    'order:read',
    'order:write',
    'subscription:read',
    'subscription:write',
    'payment:read',
    'return:read',
    'return:write',
    'exchange:read',
    'exchange:write',
    'delivery:read',
    'delivery:write',
    'report:read',
  ],
  INVENTORY_MANAGER: [
    'product:read',
    'inventory:read',
    'inventory:write',
    'garment:read',
    'garment:write',
    'return:read',
    'return:write',
  ],
  CUSTOMER_SUPPORT: [
    'customer:read',
    'baby_profile:read',
    'product:read',
    'order:read',
    'subscription:read',
    'payment:read',
    'return:read',
    'return:write',
    'exchange:read',
    'exchange:write',
    'delivery:read',
  ],
  DELIVERY_STAFF: ['order:read', 'delivery:read', 'delivery:write'],
  FINANCE: [
    'customer:read',
    'order:read',
    'subscription:read',
    'payment:read',
    'payment:write',
    'report:read',
  ],
  CONTENT_MANAGER: [
    'product:read',
    'product:write',
    'promotion:read',
    'promotion:write',
    'notification:write',
  ],
};

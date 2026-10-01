/**
 * Single source of truth for every closed set of values in the Bambino domain.
 * PostgreSQL enums (database/), GraphQL enums (apps/api) and state machines are
 * all derived from, or tested against, these arrays.
 */

// --- Identity -----------------------------------------------------------------
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const VERIFICATION_TOKEN_PURPOSES = ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'PHONE_OTP'] as const;
export type VerificationTokenPurpose = (typeof VERIFICATION_TOKEN_PURPOSES)[number];

export const CONSENT_TYPES = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'CHILD_DATA_PROCESSING',
  'MARKETING',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const DATA_REQUEST_TYPES = ['EXPORT', 'DELETION'] as const;
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];

export const DATA_REQUEST_STATUSES = ['REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED'] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

// --- Baby profiles & sizing -----------------------------------------------------
export const BABY_SEXES = ['FEMALE', 'MALE', 'UNSPECIFIED'] as const;
export type BabySex = (typeof BABY_SEXES)[number];

export const FIT_PREFERENCES = ['SNUG', 'REGULAR', 'ROOMY'] as const;
export type FitPreference = (typeof FIT_PREFERENCES)[number];

export const MEASUREMENT_SOURCES = ['PARENT', 'STAFF'] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const FIT_OUTCOMES = ['TOO_SMALL', 'GOOD_FIT', 'TOO_LARGE'] as const;
export type FitOutcome = (typeof FIT_OUTCOMES)[number];

// --- Catalogue & inventory ------------------------------------------------------
export const MEDIA_PURPOSES = [
  'PRODUCT_IMAGE',
  'GARMENT_INSPECTION',
  'DELIVERY_EVIDENCE',
  'RETURN_EVIDENCE',
  'DATA_EXPORT',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const INVENTORY_MOVEMENT_REASONS = [
  'STOCK_RECEIVED',
  'RESERVED',
  'RESERVATION_RELEASED',
  'SOLD',
  'MOVED_TO_CIRCULAR_POOL',
  'ADJUSTMENT',
] as const;
export type InventoryMovementReason = (typeof INVENTORY_MOVEMENT_REASONS)[number];

// --- Garments -------------------------------------------------------------------
export const GARMENT_STATUSES = [
  'PROCURED',
  'AVAILABLE',
  'RESERVED',
  'WITH_CUSTOMER',
  'RETURN_REQUESTED',
  'RETURNED',
  'INSPECTION',
  'REFURBISHING',
  'AVAILABLE_FOR_REUSE',
  'RESALE',
  'RECYCLE',
  'RETIRED',
] as const;
export type GarmentStatus = (typeof GARMENT_STATUSES)[number];

export const GARMENT_CONDITIONS = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'RECYCLE'] as const;
export type GarmentCondition = (typeof GARMENT_CONDITIONS)[number];

// --- Subscriptions --------------------------------------------------------------
export const BILLING_INTERVALS = ['MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_EVENT_TYPES = [
  'CREATED',
  'ACTIVATED',
  'RENEWAL_DUE',
  'RENEWED',
  'PAYMENT_FAILED',
  'PAUSED',
  'RESUMED',
  'PLAN_CHANGE_SCHEDULED',
  'PLAN_CHANGED',
  'CANCELLATION_SCHEDULED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export const SUBSCRIPTION_ITEM_STATUSES = ['SELECTED', 'SHIPPED', 'WITH_CUSTOMER', 'RETURNED'] as const;
export type SubscriptionItemStatus = (typeof SUBSCRIPTION_ITEM_STATUSES)[number];

// --- Commerce -------------------------------------------------------------------
export const CART_STATUSES = ['ACTIVE', 'CONVERTED', 'ABANDONED'] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

export const ORDER_TYPES = ['ONE_TIME', 'SUBSCRIPTION_CYCLE', 'EXCHANGE_REPLACEMENT'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'PACKED',
  'READY_FOR_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PROMOTION_SCOPES = ['ORDER', 'SUBSCRIPTION'] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

// --- Payments -------------------------------------------------------------------
export const PAYMENT_PROVIDERS = ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'MOCK'] as const;
export type PaymentProviderCode = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_TRANSACTION_TYPES = [
  'INITIATION',
  'STATUS_CHECK',
  'WEBHOOK',
  'RECONCILIATION',
  'REFUND',
  'MANUAL_ADJUSTMENT',
] as const;
export type PaymentTransactionType = (typeof PAYMENT_TRANSACTION_TYPES)[number];

export const IDEMPOTENCY_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

// --- Delivery -------------------------------------------------------------------
export const DELIVERY_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_DIRECTIONS = ['OUTBOUND', 'RETURN_PICKUP'] as const;
export type DeliveryDirection = (typeof DELIVERY_DIRECTIONS)[number];

// --- Returns & exchanges --------------------------------------------------------
export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'IN_TRANSIT',
  'RECEIVED',
  'INSPECTING',
  'ACCEPTED',
  'REJECTED',
  'REFURBISHING',
  'COMPLETED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_REASONS = ['OUTGROWN', 'WRONG_SIZE', 'DEFECTIVE', 'NOT_AS_EXPECTED', 'OTHER'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_ITEM_OUTCOMES = ['ACCEPTED', 'REJECTED'] as const;
export type ReturnItemOutcome = (typeof RETURN_ITEM_OUTCOMES)[number];

export const EXCHANGE_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'FULFILLING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];

/** Exchange credit is a ledger: balance = sum of signed entries. */
export const EXCHANGE_CREDIT_ENTRY_TYPES = ['EARNED', 'REDEEMED', 'EXPIRED', 'ADJUSTMENT'] as const;
export type ExchangeCreditEntryType = (typeof EXCHANGE_CREDIT_ENTRY_TYPES)[number];

// --- Notifications & analytics --------------------------------------------------
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'PUSH', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Stored as text (not a PG enum) so new templates do not need a migration. */
export const NOTIFICATION_TYPES = [
  'ACCOUNT_CREATED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'SUBSCRIPTION_STARTED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_RENEWAL_REMINDER',
  'ORDER_CONFIRMED',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'RETURN_APPROVED',
  'RETURN_RECEIVED',
  'EXCHANGE_APPROVED',
  'EXCHANGE_COMPLETED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Stored as text for the same reason as notification types. */
export const ANALYTICS_EVENTS = [
  'USER_REGISTERED',
  'BABY_PROFILE_CREATED',
  'SIZE_RECOMMENDATION_GENERATED',
  'PRODUCT_VIEWED',
  'PRODUCT_ADDED_TO_CART',
  'CHECKOUT_STARTED',
  'PAYMENT_INITIATED',
  'PAYMENT_COMPLETED',
  'SUBSCRIPTION_STARTED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_CANCELLED',
  'ORDER_CREATED',
  'ORDER_DELIVERED',
  'RETURN_REQUESTED',
  'RETURN_COMPLETED',
  'EXCHANGE_COMPLETED',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

import * as t from '@bambino/types';
import { pgEnum } from 'drizzle-orm/pg-core';

/** PostgreSQL enum types, generated from the arrays in @bambino/types. */

export const userStatus = pgEnum('user_status', t.USER_STATUSES);
export const verificationTokenPurpose = pgEnum('verification_token_purpose', t.VERIFICATION_TOKEN_PURPOSES);
export const consentType = pgEnum('consent_type', t.CONSENT_TYPES);
export const dataRequestType = pgEnum('data_request_type', t.DATA_REQUEST_TYPES);
export const dataRequestStatus = pgEnum('data_request_status', t.DATA_REQUEST_STATUSES);

export const babySex = pgEnum('baby_sex', t.BABY_SEXES);
export const fitPreference = pgEnum('fit_preference', t.FIT_PREFERENCES);
export const measurementSource = pgEnum('measurement_source', t.MEASUREMENT_SOURCES);
export const fitOutcome = pgEnum('fit_outcome', t.FIT_OUTCOMES);

export const mediaPurpose = pgEnum('media_purpose', t.MEDIA_PURPOSES);
export const inventoryMovementReason = pgEnum('inventory_movement_reason', t.INVENTORY_MOVEMENT_REASONS);

export const garmentStatus = pgEnum('garment_status', t.GARMENT_STATUSES);
export const garmentCondition = pgEnum('garment_condition', t.GARMENT_CONDITIONS);

export const billingInterval = pgEnum('billing_interval', t.BILLING_INTERVALS);
export const subscriptionStatus = pgEnum('subscription_status', t.SUBSCRIPTION_STATUSES);
export const subscriptionEventType = pgEnum('subscription_event_type', t.SUBSCRIPTION_EVENT_TYPES);
export const subscriptionItemStatus = pgEnum('subscription_item_status', t.SUBSCRIPTION_ITEM_STATUSES);

export const cartStatus = pgEnum('cart_status', t.CART_STATUSES);
export const orderType = pgEnum('order_type', t.ORDER_TYPES);
export const orderStatus = pgEnum('order_status', t.ORDER_STATUSES);
export const discountType = pgEnum('discount_type', t.DISCOUNT_TYPES);
export const promotionScope = pgEnum('promotion_scope', t.PROMOTION_SCOPES);

export const paymentProvider = pgEnum('payment_provider', t.PAYMENT_PROVIDERS);
export const paymentStatus = pgEnum('payment_status', t.PAYMENT_STATUSES);
export const paymentTransactionType = pgEnum('payment_transaction_type', t.PAYMENT_TRANSACTION_TYPES);
export const refundStatus = pgEnum('refund_status', t.REFUND_STATUSES);
export const refundMethod = pgEnum('refund_method', t.REFUND_METHODS);
export const idempotencyStatus = pgEnum('idempotency_status', t.IDEMPOTENCY_STATUSES);

export const deliveryStatus = pgEnum('delivery_status', t.DELIVERY_STATUSES);
export const deliveryDirection = pgEnum('delivery_direction', t.DELIVERY_DIRECTIONS);

export const returnStatus = pgEnum('return_status', t.RETURN_STATUSES);
export const returnReason = pgEnum('return_reason', t.RETURN_REASONS);
export const returnItemOutcome = pgEnum('return_item_outcome', t.RETURN_ITEM_OUTCOMES);
export const exchangeStatus = pgEnum('exchange_status', t.EXCHANGE_STATUSES);
export const exchangeCreditEntryType = pgEnum('exchange_credit_entry_type', t.EXCHANGE_CREDIT_ENTRY_TYPES);

export const notificationChannel = pgEnum('notification_channel', t.NOTIFICATION_CHANNELS);
export const notificationStatus = pgEnum('notification_status', t.NOTIFICATION_STATUSES);

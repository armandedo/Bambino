import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz } from './columns';
import { notificationChannel, notificationStatus } from './enums';
import { users } from './identity';

/** One row per notification per channel. Text is rendered from `type` + `params` in the user's locale. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    /** A NotificationType from @bambino/types. */
    type: text('type').notNull(),
    params: jsonb('params').$type<Record<string, string | number>>(),
    status: notificationStatus('status').notNull().default('PENDING'),
    error: text('error'),
    sentAt: tstz('sent_at'),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    index('notifications_status_idx').on(t.status),
  ],
);

/** Append-only record of sensitive actions (UPDATE/DELETE blocked by trigger). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    /** No foreign key on purpose: the log must survive, unchanged, whatever happens to the actor. */
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
  ],
);

/**
 * First-party analytics events. Properties carry ids and categorical values only,
 * never names, contact details or measurements.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: id(),
    /** An AnalyticsEventName from @bambino/types. */
    eventName: text('event_name').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    properties: jsonb('properties').$type<Record<string, string | number | boolean | null>>(),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    index('analytics_events_name_time_idx').on(t.eventName, t.occurredAt),
    index('analytics_events_user_idx').on(t.userId),
  ],
);

/** Shared fixed-window rate limit counters (RATE_LIMITER=postgres). Expired rows are pruned by the API job. */
export const rateLimitWindows = pgTable(
  'rate_limit_windows',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: tstz('reset_at').notNull(),
  },
  (t) => [index('rate_limit_windows_reset_idx').on(t.resetAt)],
);

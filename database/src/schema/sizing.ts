import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { babyProfiles } from './baby';
import { sizes } from './catalogue';
import { createdAt, id } from './columns';
import { orderItems } from './commerce';
import { fitOutcome, fitPreference } from './enums';
import { returnItems } from './returns';

/** The output of a sizing provider for one baby at one moment. Never updated. */
export const sizingRecommendations = pgTable(
  'sizing_recommendations',
  {
    id: id(),
    babyProfileId: uuid('baby_profile_id')
      .notNull()
      .references(() => babyProfiles.id, { onDelete: 'cascade' }),
    /** Which SizingProvider produced this, e.g. "rules" today and an ML provider later. */
    provider: text('provider').notNull(),
    providerVersion: text('provider_version').notNull(),
    recommendedSizeCode: text('recommended_size_code')
      .notNull()
      .references(() => sizes.code, { onDelete: 'restrict' }),
    nextSizeCode: text('next_size_code').references(() => sizes.code, { onDelete: 'restrict' }),
    /** 0-10000 (basis points), so 8500 = 85%. */
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    /** Machine-readable reasons (translation keys plus parameters); the UI renders the text. */
    explanation: jsonb('explanation')
      .$type<{ key: string; params?: Record<string, string | number> }[]>()
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sizing_recommendations_baby_idx').on(t.babyProfileId, t.createdAt),
    check('sizing_recommendations_confidence_range', sql`${t.confidenceBasisPoints} BETWEEN 0 AND 10000`),
  ],
);

/**
 * Exact inputs a recommendation was computed from. Kept separate from the live baby
 * profile so the input/outcome pair stays intact as training data if the profile changes.
 */
export const sizingMeasurements = pgTable(
  'sizing_measurements',
  {
    id: id(),
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => sizingRecommendations.id, { onDelete: 'cascade' }),
    ageDays: integer('age_days').notNull(),
    heightMm: integer('height_mm'),
    weightG: integer('weight_g'),
    chestMm: integer('chest_mm'),
    waistMm: integer('waist_mm'),
    footLengthMm: integer('foot_length_mm'),
    currentSizeCode: text('current_size_code'),
    fitPreference: fitPreference('fit_preference').notNull(),
    /** Summary of prior fit signals used as input, e.g. counts of TOO_SMALL returns per size. */
    history: jsonb('history').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sizing_measurements_recommendation_uq').on(t.recommendationId)],
);

/** How a recommended size actually fitted: the outcome half of the future training set. */
export const sizingFeedback = pgTable(
  'sizing_feedback',
  {
    id: id(),
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => sizingRecommendations.id, { onDelete: 'cascade' }),
    outcome: fitOutcome('outcome').notNull(),
    sizeCode: text('size_code')
      .notNull()
      .references(() => sizes.code, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    returnItemId: uuid('return_item_id').references(() => returnItems.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('sizing_feedback_recommendation_idx').on(t.recommendationId)],
);

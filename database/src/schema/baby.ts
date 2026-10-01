import { date, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sizes } from './catalogue';
import { createdAt, deletedAt, id, tstz, updatedAt } from './columns';
import { babySex, fitPreference, measurementSource } from './enums';
import { users } from './identity';

/**
 * Child data is kept to what sizing needs: a nickname (not a legal name), date of
 * birth, optional sex and fit preferences. Every read is scoped to the owning user.
 */
export const babyProfiles = pgTable(
  'baby_profiles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    dateOfBirth: date('date_of_birth').notNull(),
    sex: babySex('sex'),
    fitPreference: fitPreference('fit_preference').notNull().default('REGULAR'),
    currentSizeCode: text('current_size_code').references(() => sizes.code, { onDelete: 'restrict' }),
    /** Free-form style preferences, e.g. { colours: [...], avoid: [...] }. */
    clothingPreferences: jsonb('clothing_preferences').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('baby_profiles_user_idx').on(t.userId)],
);

/** Growth history: one row per measuring occasion. Lengths in mm, weight in grams. */
export const babyMeasurements = pgTable(
  'baby_measurements',
  {
    id: id(),
    babyProfileId: uuid('baby_profile_id')
      .notNull()
      .references(() => babyProfiles.id, { onDelete: 'cascade' }),
    measuredAt: tstz('measured_at').notNull().defaultNow(),
    heightMm: integer('height_mm'),
    weightG: integer('weight_g'),
    chestMm: integer('chest_mm'),
    waistMm: integer('waist_mm'),
    footLengthMm: integer('foot_length_mm'),
    source: measurementSource('source').notNull().default('PARENT'),
    createdAt: createdAt(),
  },
  (t) => [index('baby_measurements_profile_idx').on(t.babyProfileId, t.measuredAt)],
);

import { type Database, type Executor, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, isNull } from '@bambino/database/orm';
import { BABY_SEXES, FIT_PREFERENCES } from '@bambino/types';
import { z } from 'zod';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission, requireUser } from './context';
import { AppError, parseInput } from './errors';

export type BabyProfileRow = typeof schema.babyProfiles.$inferSelect;
export type BabyMeasurementRow = typeof schema.babyMeasurements.$inferSelect;

export const MAX_BABY_PROFILES = 10;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date.invalid');

/** Lengths in mm and weight in grams, within ranges that are plausible for children up to about 6 years. */
const measurementSchema = z
  .object({
    heightMm: z.number().int().min(300).max(1_300).nullish(),
    weightG: z.number().int().min(1_000).max(30_000).nullish(),
    chestMm: z.number().int().min(250).max(800).nullish(),
    waistMm: z.number().int().min(250).max(800).nullish(),
    footLengthMm: z.number().int().min(60).max(220).nullish(),
  })
  .refine((input) => Object.values(input).some((value) => value != null), {
    message: 'validation.measurement.empty',
  });

const profileFields = {
  nickname: z.string().trim().min(1).max(40),
  dateOfBirth: isoDate,
  sex: z.enum(BABY_SEXES).nullish(),
  fitPreference: z.enum(FIT_PREFERENCES).nullish(),
  currentSizeCode: z.string().trim().max(20).nullish(),
};

const createSchema = z.object({ ...profileFields, measurement: measurementSchema.nullish() });
const updateSchema = z.object({
  nickname: profileFields.nickname.nullish(),
  dateOfBirth: isoDate.nullish(),
  sex: profileFields.sex,
  fitPreference: profileFields.fitPreference,
  currentSizeCode: profileFields.currentSizeCode,
});

/**
 * Baby profiles: the only child data Bambino keeps. Every customer query is scoped to the
 * owner; staff reads need baby_profile:read and are written to the audit log.
 */
export class BabyService {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date,
  ) {}

  async listOwn(context: ServiceContext): Promise<BabyProfileRow[]> {
    const actor = requireUser(context);
    return this.db
      .select()
      .from(schema.babyProfiles)
      .where(and(eq(schema.babyProfiles.userId, actor.userId), isNull(schema.babyProfiles.deletedAt)))
      .orderBy(asc(schema.babyProfiles.createdAt));
  }

  async getOwn(context: ServiceContext, rawId: unknown): Promise<BabyProfileRow | null> {
    const actor = requireUser(context);
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    return this.findOwned(this.db, actor.userId, parsed.data);
  }

  /** Throws NOT_FOUND for missing, deleted or someone else's profile. */
  async requireOwned(db: Executor, userId: string, id: string): Promise<BabyProfileRow> {
    const profile = z.uuid().safeParse(id).success ? await this.findOwned(db, userId, id) : null;
    if (!profile) throw new AppError('NOT_FOUND', 'Baby profile not found.');
    return profile;
  }

  async create(context: ServiceContext, rawInput: unknown): Promise<BabyProfileRow> {
    const actor = requireUser(context);
    const input = parseInput(createSchema, rawInput);
    this.assertDateOfBirth(input.dateOfBirth);
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.babyProfiles.id })
        .from(schema.babyProfiles)
        .where(and(eq(schema.babyProfiles.userId, actor.userId), isNull(schema.babyProfiles.deletedAt)));
      if (existing.length >= MAX_BABY_PROFILES)
        throw new AppError(
          'CONFLICT',
          'You have reached the number of baby profiles allowed.',
          'PROFILE_LIMIT',
        );
      if (input.currentSizeCode) await this.assertSize(tx, input.currentSizeCode);
      const [profile] = await tx
        .insert(schema.babyProfiles)
        .values({
          userId: actor.userId,
          nickname: input.nickname,
          dateOfBirth: input.dateOfBirth,
          sex: input.sex ?? null,
          fitPreference: input.fitPreference ?? 'REGULAR',
          currentSizeCode: input.currentSizeCode ?? null,
        })
        .returning();
      if (!profile) throw new Error('Baby profile insert returned no row');
      if (input.measurement) {
        await tx
          .insert(schema.babyMeasurements)
          .values({ babyProfileId: profile.id, measuredAt: this.now(), ...nullable(input.measurement) });
      }
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'BABY_PROFILE_CREATED',
        userId: actor.userId,
        properties: { babyProfileId: profile.id },
        occurredAt: this.now(),
      });
      return profile;
    });
  }

  async update(context: ServiceContext, rawId: unknown, rawInput: unknown): Promise<BabyProfileRow> {
    const actor = requireUser(context);
    const id = parseInput(z.uuid(), rawId);
    const input = parseInput(updateSchema, rawInput);
    if (input.dateOfBirth) this.assertDateOfBirth(input.dateOfBirth);
    return this.db.transaction(async (tx) => {
      await this.requireOwned(tx, actor.userId, id);
      if (input.currentSizeCode) await this.assertSize(tx, input.currentSizeCode);
      const changes = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
      );
      if (input.sex === null) changes.sex = null;
      if (Object.keys(changes).length === 0) return this.requireOwned(tx, actor.userId, id);
      const [updated] = await tx
        .update(schema.babyProfiles)
        .set(changes)
        .where(eq(schema.babyProfiles.id, id))
        .returning();
      if (!updated) throw new AppError('NOT_FOUND', 'Baby profile not found.');
      return updated;
    });
  }

  /** Soft delete. A profile with a live subscription cannot be removed. */
  async remove(context: ServiceContext, rawId: unknown): Promise<void> {
    const actor = requireUser(context);
    const id = parseInput(z.uuid(), rawId);
    await this.db.transaction(async (tx) => {
      await this.requireOwned(tx, actor.userId, id);
      const [live] = await tx
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.babyProfileId, id),
            inArray(schema.subscriptions.status, ['PENDING', 'ACTIVE', 'PAUSED', 'PAST_DUE']),
          ),
        );
      if (live)
        throw new AppError('CONFLICT', 'Cancel the subscription for this baby first.', 'SUBSCRIPTION_ACTIVE');
      await tx
        .update(schema.babyProfiles)
        .set({ deletedAt: this.now() })
        .where(eq(schema.babyProfiles.id, id));
    });
  }

  async addMeasurement(
    context: ServiceContext,
    rawBabyId: unknown,
    rawInput: unknown,
  ): Promise<BabyMeasurementRow> {
    const actor = requireUser(context);
    const babyId = parseInput(z.uuid(), rawBabyId);
    const input = parseInput(measurementSchema, rawInput);
    await this.requireOwned(this.db, actor.userId, babyId);
    const [row] = await this.db
      .insert(schema.babyMeasurements)
      .values({ babyProfileId: babyId, measuredAt: this.now(), ...nullable(input) })
      .returning();
    if (!row) throw new Error('Measurement insert returned no row');
    return row;
  }

  async measurementsFor(babyIds: readonly string[]): Promise<BabyMeasurementRow[]> {
    if (babyIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.babyMeasurements)
      .where(inArray(schema.babyMeasurements.babyProfileId, [...babyIds]))
      .orderBy(desc(schema.babyMeasurements.measuredAt));
  }

  async byIds(ids: readonly string[]): Promise<BabyProfileRow[]> {
    return ids.length
      ? this.db
          .select()
          .from(schema.babyProfiles)
          .where(inArray(schema.babyProfiles.id, [...ids]))
      : [];
  }

  /** Staff view of a customer's baby profiles. Access to child data is audited. */
  async listForCustomerAsStaff(context: ServiceContext, rawCustomerId: unknown): Promise<BabyProfileRow[]> {
    requirePermission(context, 'baby_profile:read');
    const customerId = parseInput(z.uuid(), rawCustomerId);
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.babyProfiles)
        .where(and(eq(schema.babyProfiles.userId, customerId), isNull(schema.babyProfiles.deletedAt)))
        .orderBy(asc(schema.babyProfiles.createdAt));
      await recordAudit(tx, context, {
        action: 'baby_profile.viewed_by_staff',
        entityType: 'user',
        entityId: customerId,
        newValue: { profiles: rows.length },
      });
      return rows;
    });
  }

  ageInDays(profile: BabyProfileRow): number {
    const born = Date.parse(`${profile.dateOfBirth}T00:00:00Z`);
    return Math.max(0, Math.floor((this.now().getTime() - born) / 86_400_000));
  }

  private async findOwned(db: Executor, userId: string, id: string): Promise<BabyProfileRow | null> {
    const [profile] = await db
      .select()
      .from(schema.babyProfiles)
      .where(
        and(
          eq(schema.babyProfiles.id, id),
          eq(schema.babyProfiles.userId, userId),
          isNull(schema.babyProfiles.deletedAt),
        ),
      );
    return profile ?? null;
  }

  private assertDateOfBirth(value: string): void {
    const born = Date.parse(`${value}T00:00:00Z`);
    const ageDays = (this.now().getTime() - born) / 86_400_000;
    // Allows an expected date up to ~9 months ahead (gift registries) and children up to 6 years.
    if (Number.isNaN(born) || ageDays < -280 || ageDays > 6 * 366) {
      throw new AppError('VALIDATION_FAILED', 'Please check the date of birth.', 'INVALID_DATE_OF_BIRTH');
    }
  }

  private async assertSize(db: Executor, code: string): Promise<void> {
    const [size] = await db
      .select({ code: schema.sizes.code })
      .from(schema.sizes)
      .where(eq(schema.sizes.code, code));
    if (!size) throw new AppError('VALIDATION_FAILED', 'Unknown size.', 'UNKNOWN_SIZE');
  }
}

function nullable(input: z.infer<typeof measurementSchema>) {
  return {
    heightMm: input.heightMm ?? null,
    weightG: input.weightG ?? null,
    chestMm: input.chestMm ?? null,
    waistMm: input.waistMm ?? null,
    footLengthMm: input.footLengthMm ?? null,
  };
}

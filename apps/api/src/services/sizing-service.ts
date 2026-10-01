import { type Database, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, sql } from '@bambino/database/orm';
import { FIT_OUTCOMES } from '@bambino/types';
import { z } from 'zod';
import type { SizingProvider } from '../domain/sizing';
import type { BabyService } from './baby-service';
import { type ServiceContext, requireUser } from './context';
import { AppError, parseInput } from './errors';

export type SizingRecommendationRow = typeof schema.sizingRecommendations.$inferSelect;

/**
 * Runs the configured SizingProvider and keeps both halves of every recommendation: the
 * exact inputs (sizing_measurements) and, later, how the size fitted (sizing_feedback).
 */
export class SizingService {
  constructor(
    private readonly db: Database,
    private readonly provider: SizingProvider,
    private readonly babies: BabyService,
    private readonly now: () => Date,
  ) {}

  async recommend(context: ServiceContext, rawBabyId: unknown): Promise<SizingRecommendationRow> {
    const actor = requireUser(context);
    const babyId = parseInput(z.uuid(), rawBabyId);
    return this.db.transaction(async (tx) => {
      const baby = await this.babies.requireOwned(tx, actor.userId, babyId);
      const sizes = await tx
        .select()
        .from(schema.sizes)
        .where(eq(schema.sizes.isActive, true))
        .orderBy(asc(schema.sizes.sortOrder));
      if (sizes.length === 0) throw new AppError('CONFLICT', 'Sizing is not configured yet.', 'NO_SIZES');

      const measurements = await tx
        .select()
        .from(schema.babyMeasurements)
        .where(eq(schema.babyMeasurements.babyProfileId, babyId))
        .orderBy(desc(schema.babyMeasurements.measuredAt))
        .limit(20);
      const latest = measurements[0];
      const latestHeight = measurements.find((row) => row.heightMm !== null);
      const latestWeight = measurements.find((row) => row.weightG !== null);
      const daysAgo = (date: Date) =>
        Math.max(0, Math.floor((this.now().getTime() - date.getTime()) / 86_400_000));

      const feedback = await tx
        .select({
          sizeCode: schema.sizingFeedback.sizeCode,
          outcome: schema.sizingFeedback.outcome,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.sizingFeedback)
        .innerJoin(
          schema.sizingRecommendations,
          eq(schema.sizingRecommendations.id, schema.sizingFeedback.recommendationId),
        )
        .where(eq(schema.sizingRecommendations.babyProfileId, babyId))
        .groupBy(schema.sizingFeedback.sizeCode, schema.sizingFeedback.outcome);
      const fitHistory: Record<string, { tooSmall: number; tooLarge: number }> = {};
      for (const row of feedback) {
        const entry = (fitHistory[row.sizeCode] ??= { tooSmall: 0, tooLarge: 0 });
        if (row.outcome === 'TOO_SMALL') entry.tooSmall += row.n;
        if (row.outcome === 'TOO_LARGE') entry.tooLarge += row.n;
      }

      const input = {
        ageDays: this.babies.ageInDays(baby),
        heightMm: latestHeight?.heightMm ?? null,
        weightG: latestWeight?.weightG ?? null,
        measurementAgeDays: latest ? daysAgo(latest.measuredAt) : null,
        fitPreference: baby.fitPreference,
        heightHistory: measurements
          .filter((row) => row.heightMm !== null)
          .slice(1)
          .reverse()
          .map((row) => ({ heightMm: row.heightMm ?? 0, daysAgo: daysAgo(row.measuredAt) })),
        fitHistory,
      };
      const result = this.provider.recommend(input, sizes);

      const [recommendation] = await tx
        .insert(schema.sizingRecommendations)
        .values({
          babyProfileId: babyId,
          provider: this.provider.name,
          providerVersion: this.provider.version,
          recommendedSizeCode: result.sizeCode,
          nextSizeCode: result.nextSizeCode,
          confidenceBasisPoints: result.confidenceBasisPoints,
          explanation: result.reasons,
          createdAt: this.now(),
        })
        .returning();
      if (!recommendation) throw new Error('Recommendation insert returned no row');
      await tx.insert(schema.sizingMeasurements).values({
        recommendationId: recommendation.id,
        ageDays: input.ageDays,
        heightMm: input.heightMm,
        weightG: input.weightG,
        chestMm: latest?.chestMm ?? null,
        waistMm: latest?.waistMm ?? null,
        footLengthMm: latest?.footLengthMm ?? null,
        currentSizeCode: baby.currentSizeCode,
        fitPreference: baby.fitPreference,
        history: { fitHistory, measurementAgeDays: input.measurementAgeDays },
      });
      await tx.insert(schema.analyticsEvents).values({
        eventName: 'SIZE_RECOMMENDATION_GENERATED',
        userId: actor.userId,
        properties: {
          provider: this.provider.name,
          size: result.sizeCode,
          confidence: result.confidenceBasisPoints,
        },
        occurredAt: this.now(),
      });
      return recommendation;
    });
  }

  async latestFor(context: ServiceContext, rawBabyId: unknown): Promise<SizingRecommendationRow | null> {
    const actor = requireUser(context);
    const babyId = parseInput(z.uuid(), rawBabyId);
    await this.babies.requireOwned(this.db, actor.userId, babyId);
    const [row] = await this.history([babyId], 1);
    return row ?? null;
  }

  async history(babyIds: readonly string[], limitPerBaby = 20): Promise<SizingRecommendationRow[]> {
    if (babyIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.sizingRecommendations)
      .where(inArray(schema.sizingRecommendations.babyProfileId, [...babyIds]))
      .orderBy(desc(schema.sizingRecommendations.createdAt), desc(schema.sizingRecommendations.id));
    const seen = new Map<string, number>();
    return rows.filter((row) => {
      const count = (seen.get(row.babyProfileId) ?? 0) + 1;
      seen.set(row.babyProfileId, count);
      return count <= limitPerBaby;
    });
  }

  async submitFeedback(
    context: ServiceContext,
    raw: { recommendationId: unknown; sizeCode: unknown; outcome: unknown },
  ): Promise<void> {
    const actor = requireUser(context);
    const input = parseInput(
      z.object({
        recommendationId: z.uuid(),
        sizeCode: z.string().min(1).max(20),
        outcome: z.enum(FIT_OUTCOMES),
      }),
      raw,
    );
    const [owned] = await this.db
      .select({ id: schema.sizingRecommendations.id })
      .from(schema.sizingRecommendations)
      .innerJoin(schema.babyProfiles, eq(schema.babyProfiles.id, schema.sizingRecommendations.babyProfileId))
      .where(
        and(
          eq(schema.sizingRecommendations.id, input.recommendationId),
          eq(schema.babyProfiles.userId, actor.userId),
        ),
      );
    if (!owned) throw new AppError('NOT_FOUND', 'Recommendation not found.');
    const [size] = await this.db
      .select({ code: schema.sizes.code })
      .from(schema.sizes)
      .where(eq(schema.sizes.code, input.sizeCode));
    if (!size) throw new AppError('VALIDATION_FAILED', 'Unknown size.', 'UNKNOWN_SIZE');
    await this.db
      .insert(schema.sizingFeedback)
      .values({ recommendationId: input.recommendationId, sizeCode: input.sizeCode, outcome: input.outcome });
  }
}

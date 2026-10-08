'use client';

import {
  AddBabyMeasurementMutation,
  type BabyProfile,
  CreateBabyProfileMutation,
  CreateSizingRecommendationMutation,
  type FitOutcome,
  type FitPreference,
  type MeasurementInput,
  type SizingRecommendation,
  SubmitFitFeedbackMutation,
} from '@bambino/api-client';
import { Alert, Badge, Button, Card, RadioGroup, SelectField, TextField } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '@/lib/browser-api';
import { confidenceWords, errorMessage, formatDate, sizingReason } from '@/lib/messages';
import { keys } from '@/lib/queries';

/**
 * Parents enter centimetres and kilograms; the API stores whole millimetres and grams so no stored value is
 * a float. Returns undefined for an empty field and null for an invalid one.
 */
function toWholeUnits(
  raw: FormDataEntryValue | null,
  factor: number,
  max: number,
): number | undefined | null {
  const text = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (text === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > max) return null;
  return Math.round(value * factor);
}

interface MeasurementErrors {
  height?: string;
  weight?: string;
}

function readMeasurements(form: FormData): { input: MeasurementInput; errors: MeasurementErrors } {
  const heightMm = toWholeUnits(form.get('heightCm'), 10, 130);
  const weightG = toWholeUnits(form.get('weightKg'), 1000, 40);
  const errors: MeasurementErrors = {};
  if (heightMm === null) errors.height = 'Enter a height in centimetres, for example 62.5.';
  if (weightG === null) errors.weight = 'Enter a weight in kilograms, for example 6.8.';
  return {
    input: { ...(heightMm ? { heightMm } : {}), ...(weightG ? { weightG } : {}) },
    errors,
  };
}

function MeasurementFields({ errors }: { errors: MeasurementErrors }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Height (cm)"
        name="heightCm"
        inputMode="decimal"
        hint="Lying down, head to heel."
        error={errors.height}
      />
      <TextField label="Weight (kg)" name="weightKg" inputMode="decimal" error={errors.weight} />
    </div>
  );
}

const FIT_OPTIONS: { value: FitPreference; label: string; description: string }[] = [
  { value: 'REGULAR', label: 'Regular', description: 'The size that fits now.' },
  {
    value: 'ROOMY',
    label: 'Room to grow',
    description: 'Moves up a size when your baby is near the top of a range.',
  },
  { value: 'SNUG', label: 'Snug', description: 'Stays in the smaller size near a boundary.' },
];

function todayInKigali(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali' }).format(new Date());
}

/** Creates a baby profile with a first measurement, then asks the sizing engine for a recommendation. */
export function BabyProfileForm({
  onCreated,
}: {
  onCreated: (baby: BabyProfile, recommendation: SizingRecommendation) => void;
}) {
  const queryClient = useQueryClient();
  const [fit, setFit] = useState<FitPreference>('REGULAR');
  const [errors, setErrors] = useState<MeasurementErrors & { nickname?: string; dateOfBirth?: string }>({});
  const create = useMutation({
    mutationFn: async (input: {
      nickname: string;
      dateOfBirth: string;
      fitPreference: FitPreference;
      measurement: MeasurementInput;
    }) => {
      const { createBabyProfile } = await api.request(CreateBabyProfileMutation, {
        input: {
          ...input,
          measurement: Object.keys(input.measurement).length > 0 ? input.measurement : null,
        },
      });
      const { createSizingRecommendation } = await api.request(CreateSizingRecommendationMutation, {
        babyProfileId: createBabyProfile.id,
      });
      return { baby: createBabyProfile, recommendation: createSizingRecommendation };
    },
    onSuccess: ({ baby, recommendation }) => {
      void queryClient.invalidateQueries({ queryKey: keys.babies });
      onCreated(baby, recommendation);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nickname = String(form.get('nickname') ?? '').trim();
    const dateOfBirth = String(form.get('dateOfBirth') ?? '');
    const { input, errors: measurementErrors } = readMeasurements(form);
    const next = { ...measurementErrors } as typeof errors;
    if (!nickname) next.nickname = 'Enter a name or nickname.';
    if (!dateOfBirth || dateOfBirth > todayInKigali())
      next.dateOfBirth = 'Enter a date of birth that is not in the future.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    create.mutate({ nickname, dateOfBirth, fitPreference: fit, measurement: input });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {create.isError ? (
        <Alert tone="danger" live>
          {errorMessage(create.error)}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Baby’s name or nickname"
          name="nickname"
          required
          error={errors.nickname}
          hint="Only you see this."
        />
        <TextField
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          max={todayInKigali()}
          required
          error={errors.dateOfBirth}
        />
      </div>
      <MeasurementFields errors={errors} />
      <p className="-mt-2 text-sm text-foreground-muted">
        Measurements are optional, but they make the recommendation much more accurate.
      </p>
      <RadioGroup
        legend="How do you like clothes to fit?"
        name="fit"
        value={fit}
        onChange={(v) => setFit(v as FitPreference)}
        options={FIT_OPTIONS}
      />
      <Button type="submit" size="lg" loading={create.isPending}>
        Get size recommendation
      </Button>
    </form>
  );
}

/** Adds a measurement to an existing baby and refreshes the recommendation. */
export function MeasurementForm({
  baby,
  onDone,
}: {
  baby: BabyProfile;
  onDone: (recommendation: SizingRecommendation) => void;
}) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<MeasurementErrors>({});
  const save = useMutation({
    mutationFn: async (input: MeasurementInput) => {
      if (Object.keys(input).length > 0)
        await api.request(AddBabyMeasurementMutation, { babyProfileId: baby.id, input });
      return (await api.request(CreateSizingRecommendationMutation, { babyProfileId: baby.id }))
        .createSizingRecommendation;
    },
    onSuccess: (recommendation) => {
      void queryClient.invalidateQueries({ queryKey: keys.babies });
      onDone(recommendation);
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const { input, errors: next } = readMeasurements(new FormData(event.currentTarget));
        setErrors(next);
        if (Object.keys(next).length === 0) save.mutate(input);
      }}
    >
      {save.isError ? (
        <Alert tone="danger" live>
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      <MeasurementFields errors={errors} />
      <Button type="submit" loading={save.isPending} className="w-fit">
        Save and update recommendation
      </Button>
    </form>
  );
}

const OUTCOMES: { value: FitOutcome; label: string }[] = [
  { value: 'TOO_SMALL', label: 'Too small' },
  { value: 'GOOD_FIT', label: 'Fits well' },
  { value: 'TOO_LARGE', label: 'Too large' },
];

function FitFeedback({ recommendation }: { recommendation: SizingRecommendation }) {
  const [outcome, setOutcome] = useState<FitOutcome | ''>('');
  const send = useMutation({
    mutationFn: (value: FitOutcome) =>
      api.request(SubmitFitFeedbackMutation, {
        recommendationId: recommendation.id,
        sizeCode: recommendation.recommendedSize.code,
        outcome: value,
      }),
  });
  if (send.isSuccess)
    return <p className="text-sm font-medium text-success-foreground">Thanks, this helps us size better.</p>;
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (outcome) send.mutate(outcome);
      }}
    >
      <SelectField
        label={`How did size ${recommendation.recommendedSize.code} fit?`}
        value={outcome}
        onChange={(event) => setOutcome(event.target.value as FitOutcome | '')}
        placeholder="Choose"
        options={OUTCOMES}
      />
      <Button type="submit" variant="outline" size="sm" disabled={!outcome} loading={send.isPending}>
        Send
      </Button>
      {send.isError ? <p className="text-sm text-danger">{errorMessage(send.error)}</p> : null}
    </form>
  );
}

/** The engine's answer, its reasons in plain words, and an honest label for how it was produced. */
export function RecommendationCard({
  recommendation,
  babyName,
}: {
  recommendation: SizingRecommendation;
  babyName: string;
}) {
  return (
    <Card
      as="section"
      aria-labelledby={`rec-${recommendation.id}`}
      className="flex flex-col gap-4 border-primary"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground-muted">Recommended size for {babyName}</p>
          <h2 id={`rec-${recommendation.id}`} className="font-display text-4xl font-semibold text-primary">
            {recommendation.recommendedSize.label}
          </h2>
          <p className="font-semibold">{confidenceWords(recommendation.confidence)}</p>
        </div>
        <Badge tone="neutral">
          {recommendation.provider === 'rules'
            ? 'Rules-based recommendation'
            : `Engine: ${recommendation.provider}`}
        </Badge>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {recommendation.explanation.map((reason, index) => (
          <li key={`${reason.key}-${index}`}>{sizingReason(reason)}</li>
        ))}
      </ul>
      {recommendation.nextSize ? (
        <p className="rounded-lg bg-accent-soft p-3 text-sm text-accent-soft-foreground">
          Next size: <strong>{recommendation.nextSize.label}</strong>. Swap when you need it through returns
          and exchanges.
        </p>
      ) : null}
      <p className="text-xs text-foreground-muted">
        Calculated {formatDate(recommendation.createdAt, true)} from the size chart and your measurements. It
        is a guide, not a guarantee.
      </p>
      <FitFeedback recommendation={recommendation} />
    </Card>
  );
}

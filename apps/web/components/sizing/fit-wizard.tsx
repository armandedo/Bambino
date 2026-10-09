'use client';

import {
  AddBabyMeasurementMutation,
  type BabyProfile,
  CreateBabyProfileMutation,
  CreateSizingRecommendationMutation,
  type FitPreference,
  type MeasurementInput,
  type SizingRecommendation,
} from '@bambino/api-client';
import { Alert, Button, RadioGroup, TextField, buttonClasses, cn } from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import NextLink from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { keys, useBabies } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { RecommendationCard } from '../baby-parts';
import { DURATION, EASE } from '../motion/primitives';

/** Answers survive a sign-up detour in this tab only; nothing about the baby is stored until the account exists. */
const DRAFT_KEY = 'bambino-fit-draft';

interface Draft {
  babyId: string | null;
  nickname: string;
  dateOfBirth: string;
  heightCm: string;
  weightKg: string;
  fit: FitPreference;
}

const EMPTY: Draft = {
  babyId: null,
  nickname: '',
  dateOfBirth: '',
  heightCm: '',
  weightKg: '',
  fit: 'REGULAR',
};
type Step = 'who' | 'baby' | 'height' | 'weight' | 'fit' | 'account' | 'analysis' | 'result';

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}
function writeDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: the wizard still works within the page.
  }
}

function todayInKigali(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali' }).format(new Date());
}

/** cm and kg in, whole mm and g out; undefined for blank, null for invalid. */
function wholeUnits(raw: string, factor: number, max: number): number | undefined | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= max ? Math.round(value * factor) : null;
}

const FIT_OPTIONS: { value: FitPreference; label: string; description: string }[] = [
  { value: 'REGULAR', label: 'Just right', description: 'The size that fits now.' },
  {
    value: 'ROOMY',
    label: 'Room to grow',
    description: 'Moves up a size when your baby is near the top of a range.',
  },
  { value: 'SNUG', label: 'Snug', description: 'Stays in the smaller size near a boundary.' },
];

function Progress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((label, index) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 rounded-full transition-colors duration-500 ease-brand',
              index <= current ? 'bg-primary' : 'bg-sand-200',
            )}
          />
          <span
            className={cn(
              'hidden text-xs sm:block',
              index === current ? 'font-semibold text-primary' : 'text-foreground-muted',
            )}
          >
            {label}
            {index < current ? (
              <span className="sr-only"> (done)</span>
            ) : index === current ? (
              <span className="sr-only"> (current step)</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepFrame({
  title,
  hint,
  children,
  onBack,
  nextLabel = 'Continue',
  nextDisabled = false,
  onNext,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to each new step's question so keyboard and screen-reader users follow along.
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onNext();
      }}
    >
      <div className="flex flex-col gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl font-semibold text-primary focus:outline-none sm:text-4xl"
        >
          {title}
        </h2>
        {hint ? <p className="text-foreground-muted">{hint}</p> : null}
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} icon={<ArrowLeft aria-hidden="true" className="size-4" />}>
            Back
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={nextDisabled} className="gap-2">
          {nextLabel} <ArrowRight aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </form>
  );
}

export function FitWizard() {
  const { viewer, loading } = useSession();
  const babies = useBabies();
  const queryClient = useQueryClient();
  // Answers saved before a sign-up detour (read once; on the server there is no session storage).
  const [savedDraft] = useState<Draft | null>(() => (typeof window === 'undefined' ? null : readDraft()));
  const [draft, setDraft] = useState<Draft>(savedDraft ?? EMPTY);
  const [chosenStep, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    baby: { id: string; nickname: string };
    recommendation: SizingRecommendation;
  } | null>(null);

  // Until the parent moves, the starting step follows the data: resume after sign-up, or ask which baby.
  const startStep: Step =
    savedDraft && viewer ? 'fit' : viewer && (babies.data?.length ?? 0) > 0 ? 'who' : 'baby';
  const step = chosenStep ?? startStep;

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const analyse = useMutation({
    mutationFn: async (d: Draft) => {
      const heightMm = wholeUnits(d.heightCm, 10, 130);
      const weightG = wholeUnits(d.weightKg, 1000, 40);
      const measurement: MeasurementInput = {
        ...(heightMm ? { heightMm } : {}),
        ...(weightG ? { weightG } : {}),
      };
      let baby: Pick<BabyProfile, 'id' | 'nickname'>;
      if (d.babyId) {
        const existing = babies.data?.find((b) => b.id === d.babyId);
        if (!existing) throw new Error('That baby profile is no longer available.');
        if (Object.keys(measurement).length > 0) {
          await api.request(AddBabyMeasurementMutation, { babyProfileId: existing.id, input: measurement });
        }
        baby = existing;
      } else {
        baby = (
          await api.request(CreateBabyProfileMutation, {
            input: {
              nickname: d.nickname.trim(),
              dateOfBirth: d.dateOfBirth,
              fitPreference: d.fit,
              measurement: Object.keys(measurement).length > 0 ? measurement : null,
            },
          })
        ).createBabyProfile;
      }
      const { createSizingRecommendation } = await api.request(CreateSizingRecommendationMutation, {
        babyProfileId: baby.id,
      });
      return { baby: { id: baby.id, nickname: baby.nickname }, recommendation: createSizingRecommendation };
    },
    onMutate: () => setStep('analysis'),
    onSuccess: (outcome) => {
      writeDraft(null);
      void queryClient.invalidateQueries({ queryKey: keys.babies });
      setResult(outcome);
      setStep('result');
    },
    onError: (caught) => {
      setError(errorMessage(caught));
      setStep('fit');
    },
  });

  const finish = () => {
    if (!viewer) {
      writeDraft(draft);
      setStep('account');
      return;
    }
    setError(null);
    analyse.mutate(draft);
  };

  const flow: Step[] = draft.babyId ? ['height', 'weight', 'fit'] : ['baby', 'height', 'weight', 'fit'];
  const labels = draft.babyId
    ? ['Height', 'Weight', 'Fit', 'Result']
    : ['Baby', 'Height', 'Weight', 'Fit', 'Result'];
  const position =
    step === 'analysis' || step === 'result' || step === 'account'
      ? labels.length - 1
      : Math.max(0, flow.indexOf(step));
  const height = wholeUnits(draft.heightCm, 10, 130);
  const weight = wholeUnits(draft.weightKg, 1000, 40);

  let body: React.ReactNode;
  if (step === 'who') {
    body = (
      <StepFrame title="Who is this for?" onNext={() => setStep(draft.babyId ? 'height' : 'baby')}>
        <RadioGroup
          legend="Choose a baby"
          name="who"
          value={draft.babyId ?? 'new'}
          onChange={(value) => update(value === 'new' ? { babyId: null } : { babyId: value })}
          options={[
            ...(babies.data ?? []).map((b) => ({
              value: b.id,
              label: b.nickname,
              description: b.latestRecommendation
                ? `Currently ${b.latestRecommendation.recommendedSize.label}`
                : 'No size yet',
            })),
            { value: 'new', label: 'Another baby' },
          ]}
        />
      </StepFrame>
    );
  } else if (step === 'baby') {
    const future = draft.dateOfBirth > todayInKigali();
    body = (
      <StepFrame
        title="Tell us about your baby"
        hint="Only you see this. We use the age to start from the right part of the size chart."
        nextDisabled={!draft.nickname.trim() || !draft.dateOfBirth || future}
        onNext={() => setStep('height')}
        {...(viewer && (babies.data?.length ?? 0) > 0 ? { onBack: () => setStep('who') } : {})}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Baby’s name or nickname"
            value={draft.nickname}
            onChange={(e) => update({ nickname: e.target.value })}
            required
          />
          <TextField
            label="Date of birth"
            type="date"
            max={todayInKigali()}
            value={draft.dateOfBirth}
            onChange={(e) => update({ dateOfBirth: e.target.value })}
            required
            error={future ? 'Enter a date that is not in the future.' : undefined}
          />
        </div>
      </StepFrame>
    );
  } else if (step === 'height') {
    body = (
      <StepFrame
        title="How tall is your baby?"
        hint="Lying down, head to heel. Leave it blank if you don’t know; height makes the result much more accurate."
        nextLabel={draft.heightCm.trim() ? 'Continue' : 'Skip'}
        nextDisabled={height === null}
        onBack={() => setStep(draft.babyId ? 'who' : 'baby')}
        onNext={() => setStep('weight')}
      >
        <TextField
          label="Height (cm)"
          inputMode="decimal"
          value={draft.heightCm}
          onChange={(e) => update({ heightCm: e.target.value })}
          error={height === null ? 'Enter a height in centimetres, for example 62.5.' : undefined}
          className="max-w-xs"
        />
      </StepFrame>
    );
  } else if (step === 'weight') {
    body = (
      <StepFrame
        title="And how much does your baby weigh?"
        hint="From the last clinic visit is fine."
        nextLabel={draft.weightKg.trim() ? 'Continue' : 'Skip'}
        nextDisabled={weight === null}
        onBack={() => setStep('height')}
        onNext={() => setStep('fit')}
      >
        <TextField
          label="Weight (kg)"
          inputMode="decimal"
          value={draft.weightKg}
          onChange={(e) => update({ weightKg: e.target.value })}
          error={weight === null ? 'Enter a weight in kilograms, for example 6.8.' : undefined}
          className="max-w-xs"
        />
      </StepFrame>
    );
  } else if (step === 'fit') {
    body = (
      <StepFrame
        title="How do you like clothes to fit?"
        onBack={() => setStep('weight')}
        nextLabel="Get size recommendation"
        onNext={finish}
      >
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        <RadioGroup
          legend="Fit"
          name="fit"
          value={draft.fit}
          onChange={(v) => update({ fit: v as FitPreference })}
          options={FIT_OPTIONS}
        />
      </StepFrame>
    );
  } else if (step === 'account') {
    body = (
      <div className="flex flex-col gap-5">
        <h2 className="font-display text-3xl font-semibold text-primary">
          Create a free account to see the result
        </h2>
        <p className="text-foreground-muted">
          We save your baby’s details to your account so the recommendation improves as your baby grows. Only
          you and authorised Bambino staff can see them. Your answers are kept in this tab while you sign up.
        </p>
        <div className="flex flex-wrap gap-3">
          <NextLink href="/register?next=/fit" className={buttonClasses({ size: 'lg' })}>
            Create an account
          </NextLink>
          <NextLink href="/login?next=/fit" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
            Sign in
          </NextLink>
        </div>
      </div>
    );
  } else if (step === 'analysis') {
    body = (
      <div className="flex flex-col items-center gap-6 py-10 text-center" role="status">
        <div className="relative size-24" aria-hidden="true">
          <motion.span
            className="absolute inset-0 rounded-full border-4 border-brand-100 border-t-primary"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
          />
        </div>
        <p className="font-display text-2xl font-semibold text-primary">Comparing with our size chart…</p>
        <p className="text-foreground-muted">
          Checking age{draft.heightCm ? ', height' : ''}
          {draft.weightKg ? ' and weight' : ''}.
        </p>
      </div>
    );
  } else if (result) {
    body = (
      <div className="flex flex-col gap-6">
        <p className="flex items-center gap-2 font-semibold text-success-foreground">
          <Check aria-hidden="true" className="size-5" /> Saved to {result.baby.nickname}’s profile
        </p>
        <RecommendationCard recommendation={result.recommendation} babyName={result.baby.nickname} />
        <div className="flex flex-wrap gap-3">
          <NextLink
            href={`/dashboard/subscription/new?baby=${result.baby.id}`}
            className={buttonClasses({ size: 'lg' })}
          >
            Build my Bambino box
          </NextLink>
          <NextLink
            href={`/shop?size=${encodeURIComponent(result.recommendation.recommendedSize.code)}`}
            className={buttonClasses({ size: 'lg', variant: 'outline' })}
          >
            Shop this size
          </NextLink>
        </div>
      </div>
    );
  }

  if (loading || (viewer && babies.isPending)) {
    return (
      <div
        className="h-72 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none"
        aria-busy="true"
      />
    );
  }

  return (
    <div className="flex flex-col gap-8 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-10">
      <Progress steps={labels} current={position} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: DURATION.fast, ease: EASE }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

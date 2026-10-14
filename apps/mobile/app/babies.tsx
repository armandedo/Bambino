import {
  type BabyProfile,
  type BabySex,
  CreateBabyProfileMutation,
  type FitPreference,
  MyBabyProfilesQuery,
} from '@bambino/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, Body, Button, Card, Chip, Field, Heading, Loading, Screen } from '@/components/ui';
import { errorMessage, fieldProblems } from '@/lib/messages';
import { api } from '@/lib/session';
import { colors, space } from '@/theme';

const SEXES: { code: BabySex; label: string }[] = [
  { code: 'FEMALE', label: 'Girl' },
  { code: 'MALE', label: 'Boy' },
  { code: 'UNSPECIFIED', label: 'Prefer not to say' },
];
const FITS: { code: FitPreference; label: string }[] = [
  { code: 'SNUG', label: 'Snug' },
  { code: 'REGULAR', label: 'Regular' },
  { code: 'ROOMY', label: 'Roomy' },
];

/** Numbers typed by a person, as a whole number or nothing. "58.5" cm is 585 mm. */
function toMillimetres(cm: string): number | null {
  const value = Number.parseFloat(cm.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) : null;
}
function toGrams(kg: string): number | null {
  const value = Number.parseFloat(kg.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
}

function AddBaby({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<BabySex>('UNSPECIFIED');
  const [fit, setFit] = useState<FitPreference>('REGULAR');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [localProblem, setLocalProblem] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const heightMm = toMillimetres(heightCm);
      const weightG = toGrams(weightKg);
      return (
        await api.request(CreateBabyProfileMutation, {
          input: {
            nickname: nickname.trim(),
            dateOfBirth: dob.trim(),
            sex,
            fitPreference: fit,
            ...(heightMm || weightG ? { measurement: { heightMm, weightG } } : {}),
          },
        })
      ).createBabyProfile;
    },
    onSuccess: (baby) => {
      queryClient.setQueryData<BabyProfile[]>(['babies'], (current) => [...(current ?? []), baby]);
      onDone();
    },
  });
  const fields = fieldProblems(create.error);

  function submit() {
    setLocalProblem(null);
    if (!nickname.trim()) return setLocalProblem('Give your baby a nickname.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob.trim()))
      return setLocalProblem('Enter the date of birth as year-month-day, for example 2026-03-14.');
    create.mutate();
  }

  return (
    <Card>
      <Heading level={2}>Add a baby</Heading>
      {localProblem ? <Banner tone="danger">{localProblem}</Banner> : null}
      {create.isError ? <Banner tone="danger">{errorMessage(create.error)}</Banner> : null}
      <Field
        label="Nickname"
        value={nickname}
        onChangeText={setNickname}
        autoCapitalize="words"
        error={fields.nickname}
      />
      <Field
        label="Date of birth (YYYY-MM-DD)"
        value={dob}
        onChangeText={setDob}
        keyboardType="numbers-and-punctuation"
        placeholder="2026-03-14"
        error={fields.dateOfBirth}
      />
      <Text style={{ fontWeight: '600', color: colors.foreground }}>Sex (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {SEXES.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            selected={sex === option.code}
            onPress={() => setSex(option.code)}
          />
        ))}
      </View>
      <Text style={{ fontWeight: '600', color: colors.foreground }}>How do you like clothes to fit?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {FITS.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            selected={fit === option.code}
            onPress={() => setFit(option.code)}
          />
        ))}
      </View>
      <Field
        label="Height in cm (optional)"
        value={heightCm}
        onChangeText={setHeightCm}
        keyboardType="decimal-pad"
      />
      <Field
        label="Weight in kg (optional)"
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="decimal-pad"
      />
      <Button label="Save baby" variant="accent" loading={create.isPending} onPress={submit} />
      <Button label="Cancel" variant="outline" onPress={onDone} />
    </Card>
  );
}

export default function Babies() {
  const [adding, setAdding] = useState(false);
  const babies = useQuery({
    queryKey: ['babies'],
    queryFn: async () => (await api.request(MyBabyProfilesQuery)).myBabyProfiles,
  });

  if (babies.isPending) return <Loading label="Loading your babies" />;
  if (babies.isError) {
    return (
      <Screen>
        <Banner tone="danger">{errorMessage(babies.error)}</Banner>
        <Button label="Try again" variant="outline" onPress={() => babies.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {babies.data.map((baby) => (
        <Card key={baby.id}>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.foreground }}>{baby.nickname}</Text>
          <Body muted>
            {Math.floor(baby.ageInDays / 30)} months old ·{' '}
            {baby.currentSize ? `wears ${baby.currentSize.label}` : 'size not set'}
          </Body>
          {baby.latestRecommendation ? (
            <Banner tone="info">
              We suggest {baby.latestRecommendation.recommendedSize.label}
              {baby.latestRecommendation.nextSize ? `, then ${baby.latestRecommendation.nextSize.label}` : ''}
              .
            </Banner>
          ) : null}
          {baby.latestMeasurement ? (
            <Body muted>
              Last measured:{' '}
              {baby.latestMeasurement.heightMm ? `${baby.latestMeasurement.heightMm / 10} cm` : ''}
              {baby.latestMeasurement.weightG ? ` · ${baby.latestMeasurement.weightG / 1000} kg` : ''}
            </Body>
          ) : null}
        </Card>
      ))}
      {adding ? (
        <AddBaby onDone={() => setAdding(false)} />
      ) : (
        <Button label="Add a baby" variant="accent" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

import { operation } from '../client';
import type { SizeSummary } from './catalogue';

export type BabySex = 'FEMALE' | 'MALE' | 'UNSPECIFIED';
export type FitPreference = 'SNUG' | 'REGULAR' | 'ROOMY';
export type FitOutcome = 'TOO_SMALL' | 'GOOD_FIT' | 'TOO_LARGE';

export interface Measurement {
  id: string;
  measuredAt: string;
  heightMm: number | null;
  weightG: number | null;
  chestMm: number | null;
  waistMm: number | null;
  footLengthMm: number | null;
  source: 'PARENT' | 'STAFF';
}

export interface SizingRecommendation {
  id: string;
  babyProfileId: string;
  recommendedSize: SizeSummary;
  nextSize: SizeSummary | null;
  confidence: number;
  explanation: { key: string; params: { name: string; value: string }[] }[];
  provider: string;
  createdAt: string;
}

export interface BabyProfile {
  id: string;
  nickname: string;
  dateOfBirth: string;
  ageInDays: number;
  sex: BabySex | null;
  fitPreference: FitPreference;
  currentSize: SizeSummary | null;
  latestMeasurement: Measurement | null;
  measurements: Measurement[];
  latestRecommendation: SizingRecommendation | null;
  sizingHistory: SizingRecommendation[];
}

const SIZE = '{ code label sortOrder }';
const MEASUREMENT_FIELDS = 'id measuredAt heightMm weightG chestMm waistMm footLengthMm source';
const RECOMMENDATION_FIELDS = `id babyProfileId recommendedSize ${SIZE} nextSize ${SIZE} confidence explanation { key params { name value } } provider createdAt`;
const PROFILE_FIELDS = `
  id nickname dateOfBirth ageInDays sex fitPreference currentSize ${SIZE}
  latestMeasurement { ${MEASUREMENT_FIELDS} }
  measurements { ${MEASUREMENT_FIELDS} }
  latestRecommendation { ${RECOMMENDATION_FIELDS} }
  sizingHistory { ${RECOMMENDATION_FIELDS} }
`;

export const MyBabyProfilesQuery = operation<{ myBabyProfiles: BabyProfile[] }>(
  'MyBabyProfiles',
  `query MyBabyProfiles { myBabyProfiles { ${PROFILE_FIELDS} } }`,
);

export interface MeasurementInput {
  heightMm?: number | null;
  weightG?: number | null;
  chestMm?: number | null;
  waistMm?: number | null;
  footLengthMm?: number | null;
}

export const CreateBabyProfileMutation = operation<
  { createBabyProfile: BabyProfile },
  {
    input: {
      nickname: string;
      dateOfBirth: string;
      sex?: BabySex | null;
      fitPreference?: FitPreference | null;
      currentSizeCode?: string | null;
      measurement?: MeasurementInput | null;
    };
  }
>(
  'CreateBabyProfile',
  `mutation CreateBabyProfile($input: CreateBabyProfileInput!) { createBabyProfile(input: $input) { ${PROFILE_FIELDS} } }`,
);

export const UpdateBabyProfileMutation = operation<
  { updateBabyProfile: BabyProfile },
  { id: string; input: { nickname?: string; fitPreference?: FitPreference; sex?: BabySex | null } }
>(
  'UpdateBabyProfile',
  `mutation UpdateBabyProfile($id: ID!, $input: UpdateBabyProfileInput!) { updateBabyProfile(id: $id, input: $input) { ${PROFILE_FIELDS} } }`,
);

export const DeleteBabyProfileMutation = operation<{ deleteBabyProfile: boolean }, { id: string }>(
  'DeleteBabyProfile',
  'mutation DeleteBabyProfile($id: ID!) { deleteBabyProfile(id: $id) }',
);

export const AddBabyMeasurementMutation = operation<
  { addBabyMeasurement: Measurement },
  { babyProfileId: string; input: MeasurementInput }
>(
  'AddBabyMeasurement',
  `mutation AddBabyMeasurement($babyProfileId: ID!, $input: MeasurementInput!) {
    addBabyMeasurement(babyProfileId: $babyProfileId, input: $input) { ${MEASUREMENT_FIELDS} }
  }`,
);

export const CreateSizingRecommendationMutation = operation<
  { createSizingRecommendation: SizingRecommendation },
  { babyProfileId: string }
>(
  'CreateSizingRecommendation',
  `mutation CreateSizingRecommendation($babyProfileId: ID!) {
    createSizingRecommendation(babyProfileId: $babyProfileId) { ${RECOMMENDATION_FIELDS} }
  }`,
);

export const SubmitFitFeedbackMutation = operation<
  { submitFitFeedback: boolean },
  { recommendationId: string; sizeCode: string; outcome: FitOutcome }
>(
  'SubmitFitFeedback',
  `mutation SubmitFitFeedback($recommendationId: ID!, $sizeCode: ID!, $outcome: FitOutcome!) {
    submitFitFeedback(recommendationId: $recommendationId, sizeCode: $sizeCode, outcome: $outcome)
  }`,
);

import type {
  DailyArchetype,
  DailyBundleCoverageV2,
  DailyBundleV2,
} from './types';

const CONFIGURED_ARCHETYPES = ['easy', 'polished-casual', 'expressive'] as const;
const CURRENT_QUALITY_POLICY_VERSION = 4;

interface DailyBundleParseOptions {
  allowLegacyThreeLookWithoutCoverage?: boolean;
}

type UnknownRecord = Record<string, unknown>;

const invalidBundle = (reason: string): never => {
  throw new Error(`Invalid DailyBundleV2: ${reason}`);
};

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function assertRecord(value: unknown, reason: string): asserts value is UnknownRecord {
  if (!isRecord(value)) invalidBundle(reason);
}

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isDenseArray = (value: unknown): value is unknown[] => {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
};

const isStringArray = (value: unknown): value is string[] => (
  isDenseArray(value) && value.every(entry => typeof entry === 'string')
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isNonNegativeFiniteNumber = (value: unknown): value is number => (
  isFiniteNumber(value) && value >= 0
);

const isLocalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const arraysEqual = (left: readonly unknown[], right: readonly unknown[]): boolean => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.hasOwn(left, index) || left[index] !== right[index]) return false;
  }
  return true;
};

const isConfiguredArchetype = (value: unknown): value is DailyArchetype => (
  typeof value === 'string' && CONFIGURED_ARCHETYPES.includes(value as DailyArchetype)
);

function assertRecommendationArray(value: unknown): asserts value is unknown[] {
  if (!isDenseArray(value) || value.length < 1 || value.length > 3) {
    invalidBundle('recommendations must contain between one and three looks');
  }
}

function assertConfiguredArchetype(value: unknown, index: number): asserts value is DailyArchetype {
  if (!isConfiguredArchetype(value)) {
    invalidBundle(`recommendations[${index}].archetype is not configured`);
  }
}

const legacyCoverage = (): DailyBundleCoverageV2 => ({
  deliveryMode: 'complete',
  selectedArchetypes: [...CONFIGURED_ARCHETYPES],
  omittedArchetypes: [],
});

export const parseDailyBundleV2 = (
  value: unknown,
  options: DailyBundleParseOptions = {},
): DailyBundleV2 => {
  assertRecord(value, 'bundle must be a non-null object');
  if (value.version !== 2) invalidBundle('version must be 2');
  if (!Number.isInteger(value.qualityPolicyVersion) || (value.qualityPolicyVersion as number) < 1) {
    invalidBundle('qualityPolicyVersion must be a positive integer');
  }
  const qualityPolicyVersion = value.qualityPolicyVersion as number;
  if (!isLocalDate(value.localDate)) invalidBundle('localDate must be a valid YYYY-MM-DD date');
  if (!isNonNegativeFiniteNumber(value.generatedAt)) invalidBundle('generatedAt must be a non-negative finite number');
  if (!isNonNegativeFiniteNumber(value.snapshotGeneratedAt)) {
    invalidBundle('snapshotGeneratedAt must be a non-negative finite number');
  }
  if (!isNonEmptyString(value.wardrobeFingerprint)) invalidBundle('wardrobeFingerprint must be a non-empty string');
  if (!isNonEmptyString(value.modelRunId)) invalidBundle('modelRunId must be a non-empty string');

  const weather = value.weather;
  assertRecord(weather, 'weather must be a non-null object');
  if (!isFiniteNumber(weather.morningFeelsLikeF)) invalidBundle('weather.morningFeelsLikeF must be finite');
  if (!isFiniteNumber(weather.highTemperatureF)) invalidBundle('weather.highTemperatureF must be finite');
  if (!isFiniteNumber(weather.maxRainProbability)) invalidBundle('weather.maxRainProbability must be finite');
  if (typeof weather.plainEnglishSummary !== 'string') {
    invalidBundle('weather.plainEnglishSummary must be a string');
  }

  const recommendations = value.recommendations;
  assertRecommendationArray(recommendations);

  const recommendationArchetypes: DailyArchetype[] = [];
  let previousArchetypeIndex = -1;
  recommendations.forEach((recommendation, index) => {
    assertRecord(recommendation, `recommendations[${index}] must be a non-null object`);
    if (!isNonEmptyString(recommendation.candidateId)) {
      invalidBundle(`recommendations[${index}].candidateId must be a non-empty string`);
    }
    const archetype = recommendation.archetype;
    assertConfiguredArchetype(archetype, index);
    const archetypeIndex = CONFIGURED_ARCHETYPES.indexOf(archetype);
    if (archetypeIndex <= previousArchetypeIndex) {
      invalidBundle('recommendation archetypes must be unique and in configured order');
    }
    previousArchetypeIndex = archetypeIndex;
    recommendationArchetypes.push(archetype);
    if (!isNonEmptyString(recommendation.name)) {
      invalidBundle(`recommendations[${index}].name must be a non-empty string`);
    }
    if (!isStringArray(recommendation.itemIds)) {
      invalidBundle(`recommendations[${index}].itemIds must be a string array`);
    }
    for (const field of ['colorHook', 'whyItWorks', 'weatherNote'] as const) {
      if (typeof recommendation[field] !== 'string') {
        invalidBundle(`recommendations[${index}].${field} must be a string`);
      }
    }
  });

  let coverage = value.coverage;
  if (coverage === undefined) {
    const exactLegacyThreeLook = qualityPolicyVersion < CURRENT_QUALITY_POLICY_VERSION &&
      arraysEqual(recommendationArchetypes, CONFIGURED_ARCHETYPES);
    if (!options.allowLegacyThreeLookWithoutCoverage || !exactLegacyThreeLook) {
      invalidBundle('coverage is required');
    }
    coverage = legacyCoverage();
  } else {
    assertRecord(coverage, 'coverage must be a non-null object');
    const expectedDeliveryMode = recommendations.length === 3 ? 'complete' : 'partial';
    if (coverage.deliveryMode !== expectedDeliveryMode) {
      invalidBundle(`coverage.deliveryMode must be ${expectedDeliveryMode}`);
    }
    if (!Array.isArray(coverage.selectedArchetypes) ||
        !arraysEqual(coverage.selectedArchetypes, recommendationArchetypes)) {
      invalidBundle('coverage.selectedArchetypes must exactly match recommendation archetypes');
    }
    const omittedArchetypes = CONFIGURED_ARCHETYPES.filter(
      archetype => !recommendationArchetypes.includes(archetype),
    );
    if (!Array.isArray(coverage.omittedArchetypes) ||
        !arraysEqual(coverage.omittedArchetypes, omittedArchetypes)) {
      invalidBundle('coverage.omittedArchetypes must be the configured complement');
    }
  }

  if (value.encore !== undefined) {
    const encore = value.encore;
    assertRecord(encore, 'encore must be a non-null object when present');
    if (!isNonEmptyString(encore.outfitId)) invalidBundle('encore.outfitId must be a non-empty string');
    if (!isNonEmptyString(encore.candidateId)) invalidBundle('encore.candidateId must be a non-empty string');
    if (!isNonEmptyString(encore.name)) invalidBundle('encore.name must be a non-empty string');
    if (!isStringArray(encore.itemIds)) invalidBundle('encore.itemIds must be a string array');
  }

  return (coverage === value.coverage ? value : { ...value, coverage }) as unknown as DailyBundleV2;
};

export const parseCachedDailyBundleV2 = (value: unknown): DailyBundleV2 => (
  parseDailyBundleV2(value, { allowLegacyThreeLookWithoutCoverage: true })
);

export const tryParseCachedDailyBundleV2 = (value: unknown): DailyBundleV2 | null => {
  try {
    return parseCachedDailyBundleV2(value);
  } catch {
    return null;
  }
};

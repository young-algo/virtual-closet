import type {
  DailyArchetype,
  DailyBundleCoverageV2,
  DailyBundleV2,
  DailyFinalRecommendationV2,
  DailyRecommendationSetV2,
  DailyWeatherProfileV2,
} from '../types';

export const CONFIGURED_ARCHETYPES = ['easy', 'polished-casual', 'expressive'] as const;

const recommendation = (archetype: DailyArchetype, index: number): DailyFinalRecommendationV2 => ({
  candidateId: `candidate-${index + 1}`,
  archetype,
  name: `Look ${index + 1}`,
  itemIds: [`top-${index + 1}`, `bottom-${index + 1}`, `shoes-${index + 1}`],
  colorHook: 'Navy and cream echo across the outfit.',
  whyItWorks: 'The proportions and colors work together.',
  weatherNote: 'Comfortable for the forecast.',
});

const weather: DailyWeatherProfileV2 = {
  localDate: '2026-07-15',
  locationLabel: 'Brooklyn, NY',
  timezone: 'America/New_York',
  hourly: [],
  morningFeelsLikeF: 70,
  middayFeelsLikeF: 78,
  eveningFeelsLikeF: 74,
  minFeelsLikeF: 68,
  maxFeelsLikeF: 82,
  highTemperatureF: 82,
  lowTemperatureF: 66,
  maxRainProbability: 20,
  totalPrecipitationInches: 0,
  maxWindMph: 8,
  maxGustMph: 12,
  averageHumidity: 60,
  rainExpected: false,
  windy: false,
  largeTemperatureSwing: false,
  layerGuidance: 'optional',
  plainEnglishSummary: 'Light pieces are comfortable today.',
  weatherPhrase: 'Warm and dry',
  fetchedAt: 1_752_600_000_000,
};

export const makeDailyBundle = (
  archetypes: DailyArchetype[] = [...CONFIGURED_ARCHETYPES],
): DailyBundleV2 => {
  const recommendations = archetypes.map(recommendation) as DailyRecommendationSetV2;
  const coverage: DailyBundleCoverageV2 = {
    deliveryMode: archetypes.length === 3 ? 'complete' : 'partial',
    selectedArchetypes: [...archetypes],
    omittedArchetypes: CONFIGURED_ARCHETYPES.filter(archetype => !archetypes.includes(archetype)),
  };
  return {
    version: 2,
    qualityPolicyVersion: 4,
    localDate: '2026-07-15',
    weather: structuredClone(weather),
    coverage,
    recommendations,
    generatedAt: 1_752_600_100_000,
    snapshotGeneratedAt: 1_752_599_000_000,
    wardrobeFingerprint: 'wardrobe-fingerprint',
    modelRunId: 'model-run-id',
  };
};

type MutableRecord = Record<string, unknown>;
type MalformedCase = readonly [name: string, bundle: unknown];

const asRecord = (value: unknown): MutableRecord => value as MutableRecord;

export const makeLegacyThreeLookBundle = (): unknown => {
  const legacy = asRecord(structuredClone(makeDailyBundle()));
  legacy.qualityPolicyVersion = 3;
  delete legacy.coverage;
  return legacy;
};

export const makeMalformedDailyBundles = (): MalformedCase[] => {
  const cases: MalformedCase[] = [];
  const add = (name: string, mutate: (bundle: MutableRecord) => void) => {
    const bundle = asRecord(structuredClone(makeDailyBundle()));
    mutate(bundle);
    cases.push([name, bundle]);
  };

  add('zero recommendations', bundle => { bundle.recommendations = []; });
  add('four recommendations', bundle => {
    bundle.recommendations = [
      ...asRecord(bundle).recommendations as unknown[],
      { ...recommendation('expressive', 3), candidateId: 'candidate-4' },
    ];
  });
  add('unknown archetype', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).archetype = 'unknown';
  });
  add('reordered archetypes', bundle => {
    const recommendations = bundle.recommendations as unknown[];
    [recommendations[0], recommendations[1]] = [recommendations[1], recommendations[0]];
  });
  add('duplicate archetypes', bundle => {
    asRecord((bundle.recommendations as unknown[])[1]).archetype = 'easy';
  });
  add('contradictory delivery mode', bundle => {
    asRecord(bundle.coverage).deliveryMode = 'partial';
  });
  add('selected archetype drift', bundle => {
    asRecord(bundle.coverage).selectedArchetypes = ['easy', 'expressive'];
  });
  add('omitted archetype drift', bundle => {
    asRecord(bundle.coverage).omittedArchetypes = ['easy'];
  });
  add('missing coverage', bundle => { delete bundle.coverage; });
  add('null coverage', bundle => { bundle.coverage = null; });
  add('null recommendation', bundle => {
    (bundle.recommendations as unknown[])[0] = null;
  });
  add('sparse recommendations', bundle => {
    bundle.recommendations = new Array(1);
    bundle.coverage = {
      deliveryMode: 'partial',
      selectedArchetypes: [],
      omittedArchetypes: [...CONFIGURED_ARCHETYPES],
    };
  });
  add('empty candidate id', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).candidateId = '   ';
  });
  add('empty recommendation name', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).name = '';
  });
  add('malformed recommendation item ids', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).itemIds = ['top-1', 2];
  });
  add('sparse recommendation item ids', bundle => {
    const itemIds = new Array(3);
    itemIds[0] = 'top-1';
    itemIds[2] = 'shoes-1';
    asRecord((bundle.recommendations as unknown[])[0]).itemIds = itemIds;
  });
  add('malformed color hook', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).colorHook = 5;
  });
  add('malformed why-it-works copy', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).whyItWorks = null;
  });
  add('malformed weather note', bundle => {
    asRecord((bundle.recommendations as unknown[])[0]).weatherNote = {};
  });
  add('malformed morning weather', bundle => {
    asRecord(bundle.weather).morningFeelsLikeF = '70';
  });
  add('malformed high weather', bundle => {
    asRecord(bundle.weather).highTemperatureF = null;
  });
  add('malformed rain weather', bundle => {
    asRecord(bundle.weather).maxRainProbability = Number.NaN;
  });
  add('malformed weather summary', bundle => {
    asRecord(bundle.weather).plainEnglishSummary = null;
  });
  add('malformed Encore item ids', bundle => {
    bundle.encore = { outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved look', itemIds: null };
  });
  add('sparse Encore item ids', bundle => {
    bundle.encore = {
      outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved look', itemIds: new Array(1),
    };
  });
  add('malformed Encore outfit id', bundle => {
    bundle.encore = { outfitId: 1, candidateId: 'encore:saved-1', name: 'Saved look', itemIds: [] };
  });
  add('malformed Encore candidate id', bundle => {
    bundle.encore = { outfitId: 'saved-1', candidateId: '', name: 'Saved look', itemIds: [] };
  });
  add('malformed Encore name', bundle => {
    bundle.encore = { outfitId: 'saved-1', candidateId: 'encore:saved-1', name: '  ', itemIds: [] };
  });
  add('sparse selected archetypes', bundle => {
    const selectedArchetypes = new Array(3);
    selectedArchetypes[0] = 'easy';
    selectedArchetypes[2] = 'expressive';
    asRecord(bundle.coverage).selectedArchetypes = selectedArchetypes;
  });
  add('sparse omitted archetypes', bundle => {
    const recommendations = bundle.recommendations as unknown[];
    bundle.recommendations = [recommendations[0], recommendations[2]];
    bundle.coverage = {
      deliveryMode: 'partial',
      selectedArchetypes: ['easy', 'expressive'],
      omittedArchetypes: new Array(1),
    };
  });
  add('wrong bundle version', bundle => { bundle.version = 1; });
  add('malformed quality policy version', bundle => { bundle.qualityPolicyVersion = '4'; });
  add('malformed local date', bundle => { bundle.localDate = 'not-a-date'; });
  add('malformed generated time', bundle => { bundle.generatedAt = -1; });
  add('malformed snapshot time', bundle => { bundle.snapshotGeneratedAt = 'yesterday'; });
  add('empty wardrobe fingerprint', bundle => { bundle.wardrobeFingerprint = ''; });
  add('empty model run id', bundle => { bundle.modelRunId = '   '; });

  return cases;
};

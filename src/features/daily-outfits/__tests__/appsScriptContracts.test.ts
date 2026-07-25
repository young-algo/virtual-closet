import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apps = (file: string) => readFileSync(join(process.cwd(), 'apps-script/daily-outfits-v2', file), 'utf8');

const evaluateAppsScript = <T>(
  files: string[],
  exported: string,
  globals: Record<string, unknown> = {},
) => {
  const jobRuntimeFiles = files.includes('JobState.gs') && !files.includes('Selection.gs')
    ? ['Selection.gs', ...files]
    : files;
  const runtimeFiles = (jobRuntimeFiles.includes('Selection.gs') || jobRuntimeFiles.includes('FinalValidation.gs')) &&
    !jobRuntimeFiles.includes('ShoeRotation.gs')
    ? ['ShoeRotation.gs', ...jobRuntimeFiles]
    : jobRuntimeFiles;
  const runtimeGlobals: Record<string, unknown> = {
    savedOutfitExactCopyV2_: () => null,
    weatherSafetyErrorsV2_: () => [],
    ...globals,
    ...(globals.DAILY_V2 && typeof globals.DAILY_V2 === 'object'
      ? { DAILY_V2: { COMPOSITE_WEIGHTS: dailyCompositeWeights, ...globals.DAILY_V2 } }
      : {}),
  };
  const names = Object.keys(runtimeGlobals);
  const values = names.map(name => runtimeGlobals[name]);
  return new Function(...names, `${runtimeFiles.map(apps).join('\n')}\nreturn ${exported};`)(...values) as T;
};

const plannerValidator = new Function(`
  ${apps('ItemIndex.gs')}
  ${apps('Taste.gs')}
  ${apps('PlannerValidation.gs')}
  return validatePlannerResponseV2_;
`)() as (response: unknown, archetype: string, snapshot: unknown, expectedEasyShoeId?: string) => string[];

const weatherSafety = new Function(`
  var DAILY_V2 = { ARCHETYPES: ['easy','polished-casual','expressive'], REQUIRED_SLOTS: ['top','bottom','shoes'] };
  ${apps('FinalValidation.gs')}
  return weatherSafetyErrorsV2_;
`)() as (recommendation: { itemIds: string[] }, itemMap: Record<string, unknown>, weather: Record<string, unknown>, snapshot: { items: unknown[] }) => string[];

const criticApi = new Function(`
  ${apps('Critic.gs')}
  return { schema: CRITIC_SCHEMA_V2, validate: validateCriticResponseV2_ };
`)() as {
  schema: { properties: Record<string, unknown>; required: string[] };
  validate: (response: unknown, candidates: unknown[]) => string[];
};

const criticValidator = criticApi.validate;

const finalValidator = new Function(`
  var DAILY_V2 = {
    ARCHETYPES: ['easy','polished-casual','expressive'],
    REQUIRED_SLOTS: ['top','bottom','shoes'],
    COMPOSITE_WEIGHTS: ${JSON.stringify({
      colorIntent: 0.20,
      palette: 0.15,
      weather: 0.12,
      archetypeFit: 0.10,
      visualInterest: 0.10,
      wearability: 0.10,
      freshness: 0.10,
      silhouette: 0.08,
      formality: 0.05,
    })}
  };
  function itemMapV2_(snapshot) { var map = Object.create(null); snapshot.items.forEach(function(item) { map[item.id] = item; }); return map; }
  ${apps('ShoeRotation.gs')}
  ${apps('Taste.gs')}
  ${apps('Selection.gs')}
  ${apps('FinalValidation.gs')}
  return validateFinalBundleV2_;
`)() as (
  curated: unknown,
  snapshot: unknown,
  weather: unknown,
  history: unknown,
  selectedCandidates: unknown[],
  critic: unknown,
  selection: unknown
) => string[];

const snapshot = {
  tasteExamples: [
    { id: 'saved-1', name: 'Saved Look', itemIds: ['top', 'bottom', 'shoe'], createdAt: 1 }
  ],
  items: [
    { id: 'top', slot: 'top', category: 'T-Shirts', profile: { warmth: 2, breathability: 4 } },
    { id: 'bottom', slot: 'bottom', category: 'Pants', profile: {} },
    { id: 'shorts', slot: 'bottom', category: 'Shorts', profile: {} },
    { id: 'shoe', slot: 'shoes', category: 'Sneakers', profile: { rainSafety: 'poor' } },
    { id: 'safe-shoe', slot: 'shoes', category: 'Sneakers', profile: { rainSafety: 'good' } },
    { id: 'layer', slot: 'layer', category: 'Outerwear', profile: { warmth: 5 } },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `top-${index}`, slot: 'top', category: 'T-Shirts', profile: { warmth: 2, breathability: 4 } })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `bottom-${index}`, slot: 'bottom', category: 'Pants', profile: {} })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `shoe-${index}`, slot: 'shoes', category: 'Sneakers', profile: { rainSafety: 'good' } }))
  ]
};

const candidate = (index = 0) => ({
  candidateId: `c${index}`, archetype: 'easy', topId: `top-${index}`, bottomId: `bottom-${index}`, shoeId: `shoe-${index}`, itemIds: [`top-${index}`, `bottom-${index}`, `shoe-${index}`], name: 'A look', styleSummary: 'Coherent proportions and formality', colorStrategy: 'The blue trim in the top is echoed precisely by the blue detail in the shoes.', weatherSummary: 'Safe for the forecast', potentialRisks: [], plannerConfidence: 0.9
});

describe('authenticated diagnostics web action', () => {
  it('returns the safe diagnostics projection only for the configured secret', () => {
    let diagnosticsCalls = 0;
    let capturedText = '';
    const output = {
      setMimeType() { return this; },
    };
    const post = evaluateAppsScript<(event: { postData: { contents: string } }) => unknown>(
      ['WebApp.gs'],
      'doPost',
      {
        DAILY_V2: { MAX_POST_BYTES: 100_000 },
        getRequiredPropertyV2_: () => 'test-secret-value',
        getDailyOutfitDiagnosticsV2: () => {
          diagnosticsCalls += 1;
          return { selection: { bundleReadyValidationPassed: true } };
        },
        ContentService: {
          MimeType: { JSON: 'application/json' },
          createTextOutput: (text: string) => {
            capturedText = text;
            return output;
          },
        },
      },
    );
    const request = (secret: string) => {
      capturedText = '';
      post({
        postData: {
          contents: JSON.stringify({ action: 'getDailyOutfitDiagnosticsV2', secret }),
        },
      });
      return JSON.parse(capturedText) as Record<string, unknown>;
    };

    expect(request('test-secret-value')).toEqual({
      ok: true,
      action: 'getDailyOutfitDiagnosticsV2',
      diagnostics: { selection: { bundleReadyValidationPassed: true } },
    });
    expect(diagnosticsCalls).toBe(1);

    expect(request('wrong-secret')).toMatchObject({ ok: false });
    expect(diagnosticsCalls).toBe(1);
  });
});

const dailyArchetypes = ['easy', 'polished-casual', 'expressive'];
const dailyCompositeWeights = {
  colorIntent: 0.20,
  palette: 0.15,
  weather: 0.12,
  archetypeFit: 0.10,
  visualInterest: 0.10,
  wearability: 0.10,
  freshness: 0.10,
  silhouette: 0.08,
  formality: 0.05,
};
const allNineComposite = Object.values(dailyCompositeWeights)
  .reduce((total, weight) => total + 9 * weight, 0);
const emailUtilitiesFixture = {
  newBlob: (bytes: unknown, mimeType: string, name: string) => ({ bytes, mimeType, name }),
  base64Decode: (value: string) => Uint8Array.from(Buffer.from(value, 'base64')),
  formatDate: () => 'Wednesday, July 15',
};

const persistedSelectionFixture = () => {
  const planners = persistedPlannersFixture();
  const candidates = planners.flatMap(response => response.candidates).map(value => structuredClone(value));
  const selectedCandidates = dailyArchetypes.map((_, index) => structuredClone(candidates[index * 5]));
  const critic = persistedCriticFixture(planners);
  return {
    candidates,
    critic,
    selectedCandidates,
    replanRounds: [] as Array<{
      round: number;
      targetArchetype: string;
      structurallyValid: boolean;
      returnedCandidates: typeof candidates;
      acceptedCandidateIds: string[];
      duplicateCandidateIds: string[];
    }>,
    selection: {
      path: 'top2',
      deliveryMode: 'complete' as 'complete' | 'partial',
      selectedCount: 3,
      selectedArchetypes: dailyArchetypes.slice(),
      omittedArchetypes: [] as string[],
      eligibleCountByArchetype: { easy: 1, 'polished-casual': 5, expressive: 5 },
      compositeById: Object.fromEntries(candidates.map(({ candidateId }) => [candidateId, allNineComposite])),
      feasibleSetCount: 4,
      replannedArchetypes: [] as string[],
    },
  };
};

const currentPendingFixture = () => ({
  qualityPolicyVersion: 4,
  localDate: '2026-07-15',
  wardrobeFingerprint: 'wardrobe-v3-28',
  weather: persistedWeatherFixture(),
  history: persistedHistoryFixture(),
  planners: persistedPlannersFixture(),
  ...persistedSelectionFixture(),
});

const persistedWeatherFixture = (localDate = '2026-07-15') => ({
  localDate,
  locationLabel: 'Brooklyn',
  timezone: 'UTC',
  hourly: [{
    localHour: 12,
    temperatureF: 70,
    feelsLikeF: 70,
    precipitationProbability: 0,
    precipitationInches: 0,
    humidity: 50,
    windMph: 5,
    gustMph: 8,
    weatherCode: 0,
  }],
  morningFeelsLikeF: 60,
  middayFeelsLikeF: 70,
  eveningFeelsLikeF: 62,
  minFeelsLikeF: 58,
  maxFeelsLikeF: 72,
  highTemperatureF: 72,
  lowTemperatureF: 56,
  maxRainProbability: 0,
  totalPrecipitationInches: 0,
  maxWindMph: 5,
  maxGustMph: 8,
  averageHumidity: 50,
  rainExpected: false,
  windy: false,
  largeTemperatureSwing: false,
  layerGuidance: 'none',
  plainEnglishSummary: 'Light, breathable pieces should carry the day.',
  weatherPhrase: 'clear',
  fetchedAt: 100,
});

const persistedHistoryFixture = () => ({
  exactOutfitsPrevious14Days: [] as Array<{ localDate: string; itemIds: string[]; archetype: string }>,
  itemUsagePrevious7Days: {} as Record<string, number>,
  feedback: [] as Array<{ localDate: string; value: string; outfitName: string; archetype: string; items: string[] }>,
  itemFeedbackSignals: {} as Record<string, { wore: number; liked: number; disliked: number }>,
  cooldownItemLabels: [] as string[],
  cooldownItemIds: [] as string[],
  wornItemIds: [] as string[],
});

const persistedPlannerCandidateFixture = (archetype: string, index: number) => ({
  candidateId: `${archetype}-candidate-${index}`,
  archetype,
  topId: `${archetype}-top-${index}`,
  bottomId: `${archetype}-bottom-${index}`,
  shoeId: `${archetype}-shoe-${index}`,
  itemIds: [`${archetype}-top-${index}`, `${archetype}-bottom-${index}`, `${archetype}-shoe-${index}`],
  name: `${archetype} look ${index}`,
  styleSummary: 'The proportions and formality form one deliberate, wearable look.',
  colorStrategy: 'The blue top detail repeats in the blue shoe trim to create a deliberate bridge.',
  weatherSummary: 'Comfortable across the complete forecast window.',
  potentialRisks: [] as string[],
  plannerConfidence: 0.9,
});

const persistedPlannersFixture = () => dailyArchetypes.map(archetype => ({
  archetype,
  candidates: Array.from({ length: 5 }, (_, index) => persistedPlannerCandidateFixture(archetype, index)),
}));

const persistedCriticFixture = (planners = persistedPlannersFixture()) => ({
  scores: planners.flatMap(response => response.candidates).map(({ candidateId }) => ({
    candidateId,
    weather: 9,
    palette: 9,
    colorIntent: 9,
    silhouette: 9,
    formality: 9,
    visualInterest: 9,
    wearability: 9,
    freshness: 9,
    archetypeFit: 9,
    disqualified: false,
    criticalDefects: [] as string[],
    reservations: [] as string[],
  })),
});

const sendablePendingFixture = () => {
  const planners = persistedPlannersFixture();
  const selected = persistedSelectionFixture();
  const weather = persistedWeatherFixture();
  const history = persistedHistoryFixture();
  const recommendations = selected.selectedCandidates.map(candidate => ({
    candidateId: candidate.candidateId,
    archetype: candidate.archetype,
    name: `${candidate.archetype} daily look`,
    itemIds: candidate.itemIds.slice(),
    colorHook: 'The exact blue trim on the top repeats in the shoes for a deliberate bridge.',
    whyItWorks: 'The proportions, formality, and palette align across all three selected pieces.',
    weatherNote: 'Breathable and comfortable across the complete forecast window.',
  }));
  return {
    qualityPolicyVersion: 4,
    localDate: '2026-07-15',
    wardrobeFingerprint: 'wardrobe-v3-28',
    weather,
    history,
    planners,
    ...selected,
    bundle: {
      version: 2,
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      weather: structuredClone(weather),
      coverage: {
        deliveryMode: selected.selection.deliveryMode,
        selectedArchetypes: selected.selection.selectedArchetypes.slice(),
        omittedArchetypes: selected.selection.omittedArchetypes.slice(),
      },
      recommendations,
      generatedAt: 200,
      snapshotGeneratedAt: 50,
      wardrobeFingerprint: 'wardrobe-v3-28',
      modelRunId: 'run-id',
    },
  };
};

const persistedSnapshotFixture = (pending: {
  wardrobeFingerprint: string;
  candidates: ReturnType<typeof persistedPlannerCandidateFixture>[];
}) => {
  type SnapshotItem = {
    id: string;
    slot: string;
    category: string;
    name: string;
    thumbnailDataUrl: string;
    profile: Record<string, unknown>;
  };
  const itemById = new Map<string, SnapshotItem>();
  pending.candidates.forEach((candidate, index) => {
    const archetypeIndex = dailyArchetypes.indexOf(candidate.archetype);
    const storyIndex = archetypeIndex * 20 + index;
    itemById.set(candidate.topId, {
      id: candidate.topId,
      slot: 'top',
      category: 'T-Shirts',
      name: `Top ${index}`,
      thumbnailDataUrl: 'data:image/png;base64,AA==',
      profile: {
        primaryColorFamily: `top-color-${storyIndex}`,
        silhouette: `top-shape-${storyIndex}`,
        warmth: 1,
        breathability: 4,
        available: true,
        excludedFromDaily: false,
      },
    });
    itemById.set(candidate.bottomId, {
      id: candidate.bottomId,
      slot: 'bottom',
      category: 'Pants',
      name: `Bottom ${index}`,
      thumbnailDataUrl: 'data:image/png;base64,AA==',
      profile: {
        primaryColorFamily: `bottom-color-${storyIndex}`,
        silhouette: `bottom-shape-${storyIndex}`,
        available: true,
        excludedFromDaily: false,
      },
    });
    itemById.set(candidate.shoeId, {
      id: candidate.shoeId,
      slot: 'shoes',
      category: 'Sneakers',
      name: `Shoe ${index}`,
      thumbnailDataUrl: 'data:image/png;base64,AA==',
      profile: { rainSafety: 'good', available: true, excludedFromDaily: false },
    });
  });
  return {
    wardrobeFingerprint: pending.wardrobeFingerprint,
    generatedAt: 50,
    settings: {},
    tasteExamples: [] as Array<{
      id: string;
      name: string;
      itemIds: string[];
      createdAt: number;
      source?: string;
    }>,
    items: Array.from(itemById.values()),
  };
};

const sendableSnapshotFixture = () => persistedSnapshotFixture(sendablePendingFixture());

const finalPolicyFixture = () => {
  const pending = sendablePendingFixture();
  return {
    curated: { recommendations: structuredClone(pending.bundle.recommendations) },
    snapshot: sendableSnapshotFixture(),
    weather: structuredClone(pending.weather),
    history: structuredClone(pending.history),
    selected: structuredClone(pending.selectedCandidates),
    critic: structuredClone(pending.critic),
    selection: {
      ...structuredClone(pending.selection),
      deliveryMode: pending.selection.deliveryMode as 'complete' | 'partial',
    },
  };
};

type MetadataDimension = 'policy' | 'date' | 'fingerprint';

const mutatePersistedMetadataDimension = (
  pending: ReturnType<typeof sendablePendingFixture>,
  dimension: MetadataDimension,
) => {
  if (dimension === 'policy') {
    pending.qualityPolicyVersion = 3;
    pending.bundle.qualityPolicyVersion = 3;
  } else if (dimension === 'date') {
    pending.localDate = '2026-07-14';
    pending.weather.localDate = '2026-07-14';
    pending.bundle.localDate = '2026-07-14';
    pending.bundle.weather.localDate = '2026-07-14';
  } else {
    pending.wardrobeFingerprint = 'wardrobe-stale';
    pending.bundle.wardrobeFingerprint = 'wardrobe-stale';
  }
};

const rewriteSelectedOpaqueIds = (pending: ReturnType<typeof currentPendingFixture>) => {
  const opaqueIds = ['__proto__', 'constructor', 'toString'];
  pending.selectedCandidates.forEach((selectedCandidate, index) => {
    const oldCandidateId = selectedCandidate.candidateId;
    const matchingCandidates = [
      selectedCandidate,
      pending.candidates.find(candidate => candidate.candidateId === oldCandidateId),
      pending.planners[index].candidates.find(candidate => candidate.candidateId === oldCandidateId),
    ];
    matchingCandidates.forEach(candidate => {
      if (!candidate) throw new Error('fixture candidate graph is disconnected');
      candidate.candidateId = opaqueIds[index];
      if (index === 0) candidate.topId = '__proto__';
      if (index === 1) candidate.bottomId = 'constructor';
      if (index === 2) candidate.shoeId = 'toString';
      candidate.itemIds = [candidate.topId, candidate.bottomId, candidate.shoeId];
    });
    const score = pending.critic.scores.find(value => value.candidateId === oldCandidateId);
    if (!score) throw new Error('fixture score graph is disconnected');
    score.candidateId = opaqueIds[index];
    Object.keys(dailyCompositeWeights).forEach(metric => {
      (score as unknown as Record<string, unknown>)[metric] = 10;
    });
  });
  const scoreById = Object.fromEntries(pending.critic.scores.map(score => [score.candidateId, score]));
  pending.selection.compositeById = Object.fromEntries(
    pending.candidates.map(({ candidateId }) => [
      candidateId,
      Object.entries(dailyCompositeWeights).reduce(
        (total, [metric, weight]) => total + Number((scoreById[candidateId] as unknown as Record<string, unknown>)[metric]) * weight,
        0,
      ),
    ]),
  );
  return opaqueIds;
};

const dailySelectionRuntime = {
  QUALITY_POLICY_VERSION: 4,
  ARCHETYPES: dailyArchetypes,
  COMPOSITE_WEIGHTS: dailyCompositeWeights,
};

const fixtureShoeRotationContext = evaluateAppsScript<(
  snapshot: Record<string, unknown>,
  localDate: string,
  history: Record<string, unknown>,
) => { easyAnchorShoeId: string }>(
  ['ShoeRotation.gs'],
  'shoeRotationContextV2_',
);

const alignSnapshotEasyAnchor = (
  snapshot: Record<string, unknown>,
  localDate: string,
  history: Record<string, unknown>,
  targetShoeId: string,
  fingerprintPrefix = 'rotation-fixture',
) => {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const wardrobeFingerprint = `${fingerprintPrefix}-${attempt}`;
    snapshot.wardrobeFingerprint = wardrobeFingerprint;
    if (fixtureShoeRotationContext(snapshot, localDate, history).easyAnchorShoeId === targetShoeId) {
      return wardrobeFingerprint;
    }
  }
  throw new Error(`fixture cannot anchor Easy on ${targetShoeId}`);
};

const alignPendingEasyAnchor = (
  pending: ReturnType<typeof currentPendingFixture>,
  snapshot: ReturnType<typeof persistedSnapshotFixture>,
  targetShoeId: string,
  fingerprintPrefix = pending.wardrobeFingerprint,
) => {
  const wardrobeFingerprint = alignSnapshotEasyAnchor(
    snapshot,
    pending.localDate,
    pending.history,
    targetShoeId,
    fingerprintPrefix,
  );
  pending.wardrobeFingerprint = wardrobeFingerprint;
  return wardrobeFingerprint;
};

const deterministicSelectionGuard = evaluateAppsScript<(
  pending: unknown,
  expectedLocalDate: string,
  wardrobeFingerprint: string,
  snapshot: unknown,
) => unknown>(
  ['Selection.gs', 'JobState.gs'],
  'assertDeterministicSelectionReadyV2_',
  {
    DAILY_V2: dailySelectionRuntime,
    savedOutfitExactCopyV2_: () => null,
    weatherSafetyErrorsV2_: () => [],
  },
);

const policyConsistentSelectionGuard = evaluateAppsScript<(
  pending: unknown,
  expectedLocalDate: string,
  wardrobeFingerprint: string,
  snapshot: unknown,
) => unknown>(
  ['ItemIndex.gs', 'Taste.gs', 'FinalValidation.gs', 'Selection.gs', 'JobState.gs'],
  'assertDeterministicSelectionReadyV2_',
  { DAILY_V2: dailySelectionRuntime },
);

const deterministicCandidateSetErrors = evaluateAppsScript<(
  selected: ReturnType<typeof persistedPlannerCandidateFixture>[],
  snapshot: ReturnType<typeof persistedSnapshotFixture>,
  weather: ReturnType<typeof persistedWeatherFixture>,
) => string[]>(
  ['Selection.gs'],
  'candidateSetErrorsV2_',
  { DAILY_V2: dailySelectionRuntime },
);

const deterministicSelectionSelectors = evaluateAppsScript<{
  finalists: (
    candidates: ReturnType<typeof persistedPlannerCandidateFixture>[],
    scores: ReturnType<typeof persistedCriticFixture>['scores'],
    snapshot: ReturnType<typeof persistedSnapshotFixture>,
    weather: ReturnType<typeof persistedWeatherFixture>,
    history: ReturnType<typeof persistedHistoryFixture>,
  ) => {
    needsReplan: string | null;
    finalistPools: Record<string, ReturnType<typeof persistedPlannerCandidateFixture>[]>;
    eligibleByArchetype: Record<string, ReturnType<typeof persistedPlannerCandidateFixture>[]>;
    eligibleCountByArchetype: Record<string, number>;
    compositeById: Record<string, number>;
  };
  finalSet: (
    pools: Record<string, ReturnType<typeof persistedPlannerCandidateFixture>[]>,
    scores: ReturnType<typeof persistedCriticFixture>['scores'],
    snapshot: ReturnType<typeof persistedSnapshotFixture>,
    weather: ReturnType<typeof persistedWeatherFixture>,
  ) => {
    selectedCandidates: ReturnType<typeof persistedPlannerCandidateFixture>[] | null;
    path: 'top2' | 'top3';
    feasibleSetCount: number;
  };
  exhausted: (
    pools: Record<string, ReturnType<typeof persistedPlannerCandidateFixture>[]>,
    scores: ReturnType<typeof persistedCriticFixture>['scores'],
    snapshot: ReturnType<typeof persistedSnapshotFixture>,
    weather: ReturnType<typeof persistedWeatherFixture>,
  ) => {
    selectedCandidates: ReturnType<typeof persistedPlannerCandidateFixture>[];
    deliveryMode: 'complete' | 'partial';
    feasibleSetCount: number;
  } | null;
}>(
  ['Selection.gs'],
  '({ finalists: selectFinalistsV2_, finalSet: selectFinalSetV2_, exhausted: selectExhaustedFinalSetV2_ })',
  {
    DAILY_V2: dailySelectionRuntime,
    savedOutfitExactCopyV2_: () => null,
    weatherSafetyErrorsV2_: () => [],
  },
);

const recomputePersistedSelectionFixture = (
  pending: ReturnType<typeof currentPendingFixture>,
  snapshot: ReturnType<typeof persistedSnapshotFixture>,
  replannedArchetypes: string[] = [],
) => {
  const finalists = deterministicSelectionSelectors.finalists(
    pending.candidates,
    pending.critic.scores,
    snapshot,
    pending.weather,
    pending.history,
  );
  const finalSet = deterministicSelectionSelectors.finalSet(
    finalists.finalistPools,
    pending.critic.scores,
    snapshot,
    pending.weather,
  );
  if (!finalSet.selectedCandidates) throw new Error('fixture has no deterministic winner');
  pending.selectedCandidates = structuredClone(finalSet.selectedCandidates);
  pending.selection = {
    path: replannedArchetypes.length ? `replan-${replannedArchetypes.length}` : finalSet.path,
    deliveryMode: 'complete',
    selectedCount: 3,
    selectedArchetypes: dailyArchetypes.slice(),
    omittedArchetypes: [],
    eligibleCountByArchetype: {
      easy: finalists.eligibleCountByArchetype.easy,
      'polished-casual': finalists.eligibleCountByArchetype['polished-casual'],
      expressive: finalists.eligibleCountByArchetype.expressive,
    },
    compositeById: Object.fromEntries(Object.entries(finalists.compositeById)),
    feasibleSetCount: finalSet.feasibleSetCount,
    replannedArchetypes: replannedArchetypes.slice(),
  };
  return pending;
};

const persistedReplanFixture = (roundCount: 1 | 2) => {
  const pending = currentPendingFixture();
  const replannedArchetypes = dailyArchetypes.slice(0, roundCount);
  pending.critic.scores.forEach(score => {
    const candidate = pending.candidates.find(value => value.candidateId === score.candidateId);
    if (candidate && replannedArchetypes.includes(candidate.archetype)) {
      score.disqualified = true;
      score.criticalDefects = ['fixture forces targeted re-plan'];
    }
  });
  replannedArchetypes.forEach(archetype => {
    const returnedCandidates = Array.from(
      { length: 5 },
      (_, offset) => persistedPlannerCandidateFixture(archetype, offset + 5),
    );
    returnedCandidates.forEach(addition => {
      pending.candidates.push(addition);
      pending.critic.scores.push({
        ...structuredClone(pending.critic.scores[0]),
        candidateId: addition.candidateId,
        disqualified: false,
        criticalDefects: [],
      });
    });
    pending.replanRounds.push({
      round: pending.replanRounds.length + 1,
      targetArchetype: archetype,
      structurallyValid: true,
      returnedCandidates: structuredClone(returnedCandidates),
      acceptedCandidateIds: returnedCandidates.map(candidate => candidate.candidateId),
      duplicateCandidateIds: [],
    });
  });
  const snapshotValue = persistedSnapshotFixture(pending);
  const easyAddition = pending.candidates.find(candidate => candidate.candidateId === 'easy-candidate-5');
  if (!easyAddition) throw new Error('fixture Easy re-plan candidate is missing');
  alignPendingEasyAnchor(pending, snapshotValue, easyAddition.shoeId);
  recomputePersistedSelectionFixture(pending, snapshotValue, replannedArchetypes);
  return { pending, snapshot: snapshotValue };
};

const persistedDuplicateOnlyPartialFixture = (
  selectedArchetypes: string[] = ['easy', 'expressive'],
) => {
  const pending = currentPendingFixture();
  pending.qualityPolicyVersion = 4;
  const omittedArchetypes = dailyArchetypes.filter(archetype => !selectedArchetypes.includes(archetype));
  const targetArchetype = omittedArchetypes[0];
  const targetPlanner = pending.planners.find(value => value.archetype === targetArchetype);
  if (!targetPlanner || !targetArchetype) throw new Error('fixture re-plan target is missing');
  pending.critic.scores.forEach(score => {
    const candidateValue = pending.candidates.find(value => value.candidateId === score.candidateId);
    if (candidateValue && omittedArchetypes.includes(candidateValue.archetype)) {
      score.disqualified = true;
      score.criticalDefects = ['fixture forces targeted re-plan'];
    }
  });
  pending.replanRounds = ([1, 2] as const).map(round => {
    const returnedCandidates = targetPlanner.candidates.map((candidateValue, index) => ({
      ...structuredClone(candidateValue),
      candidateId: `${targetArchetype}-duplicate-r${round}-${index}`,
    }));
    return {
      round,
      targetArchetype,
      structurallyValid: true,
      returnedCandidates,
      acceptedCandidateIds: [] as string[],
      duplicateCandidateIds: returnedCandidates.map(candidateValue => candidateValue.candidateId),
    };
  });
  const snapshotValue = persistedSnapshotFixture(pending);
  const finalists = deterministicSelectionSelectors.finalists(
    pending.candidates,
    pending.critic.scores,
    snapshotValue,
    pending.weather,
    pending.history,
  );
  const exhausted = deterministicSelectionSelectors.exhausted(
    finalists.eligibleByArchetype,
    pending.critic.scores,
    snapshotValue,
    pending.weather,
  );
  if (!exhausted || exhausted.selectedCandidates.length !== selectedArchetypes.length) {
    throw new Error('fixture partial winner is missing');
  }
  pending.selectedCandidates = structuredClone(exhausted.selectedCandidates);
  pending.selection = {
    deliveryMode: 'partial',
    selectedCount: selectedArchetypes.length,
    selectedArchetypes: selectedArchetypes.slice(),
    omittedArchetypes,
    eligibleCountByArchetype: {
      easy: finalists.eligibleCountByArchetype.easy,
      'polished-casual': finalists.eligibleCountByArchetype['polished-casual'],
      expressive: finalists.eligibleCountByArchetype.expressive,
    },
    compositeById: { ...finalists.compositeById },
    path: 'replan-2',
    feasibleSetCount: exhausted.feasibleSetCount,
    replannedArchetypes: [targetArchetype, targetArchetype],
  };
  return { pending, snapshot: snapshotValue };
};

const persistedExhaustiveTrioFixture = () => {
  const pending = currentPendingFixture();
  pending.qualityPolicyVersion = 4;
  const replaceShoe = (candidateValue: ReturnType<typeof persistedPlannerCandidateFixture>, shoeId: string) => {
    candidateValue.shoeId = shoeId;
    candidateValue.itemIds = [candidateValue.topId, candidateValue.bottomId, shoeId];
  };
  pending.planners.flatMap(value => value.candidates).forEach(candidateValue => {
    const shoeId = candidateValue.archetype === 'easy'
      ? 'easy-shared'
      : candidateValue.archetype === 'expressive'
        ? 'expressive-shared'
        : candidateValue.shoeId;
    replaceShoe(candidateValue, shoeId);
    const persisted = pending.candidates.find(value => value.candidateId === candidateValue.candidateId);
    if (!persisted) throw new Error('fixture initial candidate is disconnected');
    replaceShoe(persisted, shoeId);
  });
  pending.critic.scores.forEach(score => {
    if (score.candidateId.startsWith('polished-casual-')) {
      score.disqualified = true;
      score.criticalDefects = ['fixture forces targeted re-plan'];
    }
  });
  const roundOne = Array.from({ length: 5 }, (_, index) =>
    persistedPlannerCandidateFixture('polished-casual', index + 5));
  const roundTwo = Array.from({ length: 5 }, (_, index) => {
    const candidateValue = persistedPlannerCandidateFixture('polished-casual', index + 10);
    replaceShoe(
      candidateValue,
      index < 3 ? 'easy-shared' : index === 3 ? 'polished-unique' : 'expressive-shared',
    );
    return candidateValue;
  });
  const scoreFor = (
    candidateValue: ReturnType<typeof persistedPlannerCandidateFixture>,
    value: number,
    disqualified: boolean,
  ) => ({
    ...structuredClone(pending.critic.scores[0]),
    ...Object.fromEntries(Object.keys(dailyCompositeWeights).map(metric => [metric, value])),
    candidateId: candidateValue.candidateId,
    disqualified,
    criticalDefects: disqualified ? ['fixture forces targeted re-plan'] : [],
    reservations: [] as string[],
  });
  pending.candidates.push(...structuredClone(roundOne), ...structuredClone(roundTwo));
  pending.critic.scores.push(
    ...roundOne.map(candidateValue => scoreFor(candidateValue, 9, true)),
    ...roundTwo.map((candidateValue, index) => scoreFor(candidateValue, index < 3 ? 9 : index === 3 ? 8 : 7, false)),
  );
  pending.replanRounds = [roundOne, roundTwo].map((returnedCandidates, index) => ({
    round: index + 1,
    targetArchetype: 'polished-casual',
    structurallyValid: true,
    returnedCandidates: structuredClone(returnedCandidates),
    acceptedCandidateIds: returnedCandidates.map(candidateValue => candidateValue.candidateId),
    duplicateCandidateIds: [] as string[],
  }));
  const snapshotValue = persistedSnapshotFixture(pending);
  alignPendingEasyAnchor(pending, snapshotValue, 'easy-shared');
  const finalists = deterministicSelectionSelectors.finalists(
    pending.candidates,
    pending.critic.scores,
    snapshotValue,
    pending.weather,
    pending.history,
  );
  const bounded = deterministicSelectionSelectors.finalSet(
    finalists.finalistPools,
    pending.critic.scores,
    snapshotValue,
    pending.weather,
  );
  if (bounded.selectedCandidates) throw new Error('fixture unexpectedly has a bounded trio');
  const exhausted = deterministicSelectionSelectors.exhausted(
    finalists.eligibleByArchetype,
    pending.critic.scores,
    snapshotValue,
    pending.weather,
  );
  if (!exhausted || exhausted.selectedCandidates.length !== 3) {
    throw new Error('fixture exhaustive trio is missing');
  }
  pending.selectedCandidates = structuredClone(exhausted.selectedCandidates);
  pending.selection = {
    deliveryMode: 'complete',
    selectedCount: 3,
    selectedArchetypes: [...dailyArchetypes],
    omittedArchetypes: [] as string[],
    eligibleCountByArchetype: {
      easy: finalists.eligibleCountByArchetype.easy,
      'polished-casual': finalists.eligibleCountByArchetype['polished-casual'],
      expressive: finalists.eligibleCountByArchetype.expressive,
    },
    compositeById: { ...finalists.compositeById },
    path: 'replan-2',
    feasibleSetCount: exhausted.feasibleSetCount,
    replannedArchetypes: ['polished-casual', 'polished-casual'],
  };
  return { pending, snapshot: snapshotValue };
};

const ledgerTamperCases: Array<[
  string,
  (pending: ReturnType<typeof persistedDuplicateOnlyPartialFixture>['pending']) => void,
]> = [
  ['noncontiguous round', pending => { pending.replanRounds[1].round = 3; }],
  ['wrong target', pending => { pending.replanRounds[0].targetArchetype = 'expressive'; }],
  ['reused id', pending => {
    pending.replanRounds[0].returnedCandidates[0].candidateId = pending.candidates[0].candidateId;
  }],
  ['overlapping disposition', pending => {
    pending.replanRounds[0].acceptedCandidateIds.push(
      pending.replanRounds[0].duplicateCandidateIds[0],
    );
  }],
  ['missing disposition', pending => { pending.replanRounds[0].duplicateCandidateIds.pop(); }],
  ['reordered disposition', pending => { pending.replanRounds[0].duplicateCandidateIds.reverse(); }],
  ['candidate universe drift', pending => {
    pending.candidates.push(structuredClone(pending.replanRounds[0].returnedCandidates[0]));
  }],
  ['targeted score drift', pending => {
    pending.critic.scores.push({
      ...structuredClone(pending.critic.scores[0]),
      candidateId: pending.replanRounds[0].duplicateCandidateIds[0],
    });
  }],
  ['partial before two rounds', pending => { pending.replanRounds.pop(); }],
  ['coverage count drift', pending => { pending.selection.selectedCount = 1; }],
  ['coverage order drift', pending => { pending.selection.selectedArchetypes.reverse(); }],
  ['omission drift', pending => { pending.selection.omittedArchetypes = ['expressive']; }],
  ['path drift', pending => { pending.selection.path = 'top2'; }],
];

describe('Apps Script contracts', () => {
  it('rejects invented ids, wrong slots, duplicate pieces, and wrong candidate counts', () => {
    const valid = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    expect(plannerValidator(valid, 'easy', snapshot)).toEqual([]);
    expect(plannerValidator({ ...valid, candidates: valid.candidates.slice(0, 4) }, 'easy', snapshot).join(' ')).toMatch(/five/);
    const invented = structuredClone(valid); invented.candidates[0].topId = 'invented'; invented.candidates[0].itemIds[0] = 'invented';
    expect(plannerValidator(invented, 'easy', snapshot).join(' ')).toMatch(/invented id/);
    const duplicate = structuredClone(valid); duplicate.candidates[0].bottomId = 'top'; duplicate.candidates[0].itemIds = ['top', 'top', 'shoe'];
    expect(plannerValidator(duplicate, 'easy', snapshot).join(' ')).toMatch(/wrong slot|repeats/);
  });

  it('requires every Easy candidate to use the supplied shoe anchor', () => {
    const anchored = {
      archetype: 'easy',
      candidates: Array.from({ length: 5 }, (_, index) => ({
        ...candidate(index),
        shoeId: 'shoe-0',
        itemIds: [`top-${index}`, `bottom-${index}`, 'shoe-0'],
      })),
    };
    expect(plannerValidator(anchored, 'easy', snapshot, 'shoe-0')).toEqual([]);

    const wrongShoe = structuredClone(anchored);
    wrongShoe.candidates[2] = {
      ...wrongShoe.candidates[2],
      shoeId: 'shoe-1',
      itemIds: ['top-2', 'bottom-2', 'shoe-1'],
    };
    expect(plannerValidator(wrongShoe, 'easy', snapshot, 'shoe-0')).toContain(
      'candidate[2].shoeId must use the required Easy shoe anchor'
    );
  });

  it('blocks exact manual core trios but permits transformed and AI-sourced saves', () => {
    const valid = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    const twoOfThree = structuredClone(valid);
    twoOfThree.candidates[0] = { ...twoOfThree.candidates[0], topId: 'top', bottomId: 'bottom', itemIds: ['top', 'bottom', 'shoe-0'] };
    expect(plannerValidator(twoOfThree, 'easy', snapshot)).toEqual([]);

    const exactManual = structuredClone(valid);
    exactManual.candidates[0] = { ...exactManual.candidates[0], topId: 'top', bottomId: 'bottom', shoeId: 'shoe', itemIds: ['top', 'bottom', 'shoe'] };
    expect(plannerValidator(exactManual, 'easy', snapshot).join(' ')).toMatch(/exactly copies manual saved outfit "Saved Look"/);

    const aiSnapshot = { ...snapshot, tasteExamples: [{ id: 'ai-1', name: 'AI Save', itemIds: ['top', 'bottom', 'shoe'], createdAt: 1, source: 'ai' }] };
    expect(plannerValidator(exactManual, 'easy', aiSnapshot)).toEqual([]);

    const hiddenManualSnapshot = { ...snapshot, tasteExamples: [{ id: 'hidden', name: 'Hidden Manual', itemIds: ['top', 'bottom', 'shoe'], createdAt: 1, seedStylist: false }] };
    expect(plannerValidator(exactManual, 'easy', hiddenManualSnapshot).join(' ')).toMatch(/exactly copies manual saved outfit "Hidden Manual"/);

    const duplicateAndLayerSnapshot = { ...snapshot, tasteExamples: [{ id: 'duplicate', name: 'Layered Manual', itemIds: ['top', 'top', 'bottom', 'shoe', 'layer'], createdAt: 1 }] };
    expect(plannerValidator(exactManual, 'easy', duplicateAndLayerSnapshot).join(' ')).toMatch(/exactly copies manual saved outfit "Layered Manual"/);

    const onlyTwoCoreSnapshot = { ...snapshot, tasteExamples: [{ id: 'two-core', name: 'Two Core', itemIds: ['top', 'bottom', 'layer'], createdAt: 1 }] };
    expect(plannerValidator(exactManual, 'easy', onlyTwoCoreSnapshot)).toEqual([]);

    const mismatchedIds = structuredClone(exactManual);
    mismatchedIds.candidates[0].itemIds = ['top-0', 'bottom-0', 'shoe-0'];
    const mismatchErrors = plannerValidator(mismatchedIds, 'easy', snapshot).join(' ');
    expect(mismatchErrors).toMatch(/itemIds does not match/);
    expect(mismatchErrors).toMatch(/exactly copies manual saved outfit "Saved Look"/);
  });

  it('accepts safe prototype-key candidate ids alongside distinct opaque wardrobe ids', () => {
    const response = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    response.candidates[0] = {
      ...response.candidates[0],
      candidateId: '__proto__',
      topId: 'wardrobe.__proto__',
      bottomId: 'wardrobe.constructor',
      shoeId: 'wardrobe.toString',
      itemIds: ['wardrobe.toString', 'wardrobe.__proto__', 'wardrobe.constructor'],
    };
    response.candidates[1].candidateId = 'constructor';
    response.candidates[2].candidateId = 'toString';
    const opaqueSnapshot = {
      ...snapshot,
      items: snapshot.items.concat([
        { id: 'wardrobe.__proto__', slot: 'top', category: 'T-Shirts', profile: { warmth: 2, breathability: 4 } },
        { id: 'wardrobe.constructor', slot: 'bottom', category: 'Pants', profile: {} },
        { id: 'wardrobe.toString', slot: 'shoes', category: 'Sneakers', profile: { rainSafety: 'good' } },
      ]),
    };

    expect(plannerValidator(response, 'easy', opaqueSnapshot)).toEqual([]);
  });

  it('rejects planner candidate ids that shared model sanitation would rewrite', () => {
    const currentWardrobeId = 'user_closet_1783863184668';
    const privacySnapshot = {
      ...snapshot,
      items: snapshot.items.concat([{
        id: currentWardrobeId,
        slot: 'top',
        category: 'T-Shirts',
        profile: { warmth: 2, breathability: 4 },
      }]),
    };
    const current = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    current.candidates[0].candidateId = currentWardrobeId;
    const stale = structuredClone(current);
    stale.candidates[0].candidateId = 'item_archived_1783863199998';

    expect(plannerValidator(current, 'easy', privacySnapshot).join(' ')).toMatch(/candidateId.*unsafe model token/);
    expect(plannerValidator(stale, 'easy', privacySnapshot).join(' ')).toMatch(/candidateId.*unsafe model token/);
  });

  it('does not collapse distinct planner combinations whose opaque ids contain delimiters', () => {
    const response = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    response.candidates[0] = {
      ...response.candidates[0],
      topId: 'a', bottomId: 'b|c', shoeId: 'd', itemIds: ['a', 'b|c', 'd'],
    };
    response.candidates[1] = {
      ...response.candidates[1],
      topId: 'a|b', bottomId: 'c', shoeId: 'd', itemIds: ['d', 'c', 'a|b'],
    };
    const delimiterSnapshot = {
      ...snapshot,
      items: snapshot.items.concat([
        { id: 'a', slot: 'top', category: 'T-Shirts', profile: { warmth: 2, breathability: 4 } },
        { id: 'a|b', slot: 'top', category: 'T-Shirts', profile: { warmth: 2, breathability: 4 } },
        { id: 'b|c', slot: 'bottom', category: 'Pants', profile: {} },
        { id: 'c', slot: 'bottom', category: 'Pants', profile: {} },
        { id: 'd', slot: 'shoes', category: 'Sneakers', profile: { rainSafety: 'good' } },
      ]),
    };

    expect(plannerValidator(response, 'easy', delimiterSnapshot)).toEqual([]);
  });

  it('still rejects superficial variations within one planner response', () => {
    const valid = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    const superficial = structuredClone(valid);
    superficial.candidates[1] = { ...superficial.candidates[1], topId: 'top-0', bottomId: 'bottom-0', itemIds: ['top-0', 'bottom-0', 'shoe-1'] };
    expect(plannerValidator(superficial, 'easy', snapshot).join(' ')).toMatch(/one-core-item variation/);
  });

  it('enforces rain and hot-weather comfort bands at their exact boundaries', () => {
    const byId = Object.fromEntries(snapshot.items.concat([
      { id: 'top-w3', slot: 'top', category: 'Long Sleeves', profile: { warmth: 3, breathability: 3 } },
      { id: 'top-w4', slot: 'top', category: 'Long Sleeves', profile: { warmth: 4, breathability: 3 } },
      { id: 'layer-w4', slot: 'layer', category: 'Jackets', profile: { warmth: 4, breathability: 3 } }
    ]).map(entry => [entry.id, entry]));
    const weather = { morningFeelsLikeF: 55, eveningFeelsLikeF: 55, middayFeelsLikeF: 85, rainExpected: false };
    expect(weatherSafety({ itemIds: ['top', 'bottom', 'shoe'] }, byId, { ...weather, rainExpected: true }, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top', 'bottom', 'safe-shoe', 'layer-w4'] }, byId, weather, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top', 'bottom', 'safe-shoe', 'layer-w4'] }, byId, { ...weather, middayFeelsLikeF: 85.1 }, snapshot).join(' ')).toMatch(/warmth-4 layer/);
    expect(weatherSafety({ itemIds: ['top-w4', 'bottom', 'safe-shoe'] }, byId, weather, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top-w4', 'bottom', 'safe-shoe'] }, byId, { ...weather, middayFeelsLikeF: 85.1 }, snapshot).join(' ')).toMatch(/warmth-4 top/);
    expect(weatherSafety({ itemIds: ['top-w3', 'bottom', 'safe-shoe'] }, byId, { ...weather, middayFeelsLikeF: 92 }, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top-w3', 'bottom', 'safe-shoe'] }, byId, { ...weather, middayFeelsLikeF: 92.1 }, snapshot).join(' ')).toMatch(/warmth-3 top/);
  });

  it('contains policy-v5 selection resume and send-after-success duplicate protections', () => {
    const scheduler = apps('Scheduler.gs');
    const config = apps('Config.gs');
    const diagnostics = apps('Diagnostics.gs');
    expect(config).toMatch(/QUALITY_POLICY_VERSION:\s*5/);
    expect(scheduler).toMatch(/LockService\.getScriptLock/);
    expect(scheduler).toMatch(/weather-ready/);
    expect(scheduler).toMatch(/planners-ready/);
    expect(scheduler).toMatch(/critic-ready/);
    expect(scheduler).toMatch(/selection-ready/);
    expect(scheduler).toMatch(/bundle-ready/);
    expect(scheduler).not.toMatch(/curated-ready/);
    expect(diagnostics).toMatch(/eligibleCountByArchetype/);
    expect(diagnostics).toMatch(/attemptCounts/);
    const sendIndex = scheduler.indexOf('sendDailyBundleNowV2_');
    const finalizeIndex = scheduler.indexOf('finalizeSentBundleV2_', sendIndex);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(finalizeIndex).toBeGreaterThan(sendIndex);
    expect(apps('JobState.gs')).toMatch(/setProperty\('LAST_SENT_DATE_V2',[\s\S]*recordSentBundleV2_/);
  });

  it('persists manual selection output and resumes selection-ready without selecting again', () => {
    const selectedResult = persistedSelectionFixture();
    const planners = persistedPlannersFixture();
    const snapshot = persistedSnapshotFixture({
      wardrobeFingerprint: 'wardrobe-v3-28',
      candidates: planners.flatMap(response => response.candidates),
    });
    const basePending = {
      workflow: 'manual-v2',
      qualityPolicyVersion: 4,
      manualStage: 'critic-ready',
      localDate: '2026-07-15',
      wardrobeFingerprint: snapshot.wardrobeFingerprint,
      weather: persistedWeatherFixture(),
      history: persistedHistoryFixture(),
      planners,
      critic: persistedCriticFixture(planners),
    };
    let mergeCalls = 0;
    let persisted: Record<string, unknown> | null = null;
    const runCriticReady = evaluateAppsScript<() => { stage: string; complete: boolean }>(
      ['JobState.gs', 'Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => snapshot,
        loadSnapshotV2_: () => snapshot,
        mergeEmailFeedbackIntoHistoryV2_: () => { mergeCalls += 1; },
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => structuredClone(basePending),
        savePendingV2_: (value: Record<string, unknown>) => {
          persisted = structuredClone(value);
          return 'pending-file';
        },
      },
    );

    expect(runCriticReady()).toEqual({ complete: false, stage: 'selection-ready', bundle: null });
    expect(mergeCalls).toBe(0);
    expect(persisted).toMatchObject({
      manualStage: 'selection-ready',
      candidates: selectedResult.candidates,
      critic: selectedResult.critic,
      selectedCandidates: selectedResult.selectedCandidates,
      replanRounds: selectedResult.replanRounds,
      selection: selectedResult.selection,
    });

    const curatorInputs: unknown[][] = [];
    const validationInputs: unknown[][] = [];
    const selectionReadyPending = {
      ...basePending,
      ...selectedResult,
      manualStage: 'selection-ready',
    };
    const runSelectionReady = evaluateAppsScript<() => { stage: string; complete: boolean; bundle: unknown }>(
      ['JobState.gs', 'Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => snapshot,
        loadSnapshotV2_: () => snapshot,
        mergeEmailFeedbackIntoHistoryV2_: () => { mergeCalls += 1; },
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => structuredClone(selectionReadyPending),
        assertDeterministicSelectionReadyV2_: () => undefined,
        assertPersistedSelectionContextV2_: () => undefined,
        runCuratorV2_: (...args: unknown[]) => {
          curatorInputs.push(args);
          return { recommendations: [] };
        },
        validateFinalBundleV2_: (...args: unknown[]) => {
          validationInputs.push(args);
          return [];
        },
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        newRunIdV2_: () => 'run-id',
        savePendingV2_: () => 'pending-file',
      },
    );

    const selectionReadyResult = runSelectionReady();
    expect(selectionReadyResult).toEqual({
      complete: true,
      stage: 'bundle-ready',
      bundle: expect.objectContaining({ localDate: '2026-07-15' }),
    });
    expect(curatorInputs[0]?.slice(-2)).toEqual([selectedResult.selectedCandidates, selectedResult.critic]);
    expect(validationInputs[0]?.slice(-3)).toEqual([
      selectedResult.selectedCandidates,
      selectedResult.critic,
      selectedResult.selection,
    ]);
    expect(selectionReadyResult.bundle).toEqual(expect.objectContaining({
      coverage: {
        deliveryMode: 'complete',
        selectedArchetypes: dailyArchetypes,
        omittedArchetypes: [],
      },
    }));
    expect(mergeCalls).toBe(0);
  });

  it('persists fresh manual idle recovery before feedback or weather can fail', () => {
    const events: string[] = [];
    let released = false;
    const generate = evaluateAppsScript<() => unknown>(
      ['JobState.gs', 'Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { released = true; } }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => {
          events.push('load');
          return {
            workflow: 'manual-v2',
            qualityPolicyVersion: 4,
            manualStage: 'selection-ready',
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
            selectedCandidates: [],
          };
        },
        savePendingV2_: (pending: { manualStage: string }) => {
          events.push(`save:${pending.manualStage}`);
          return 'pending-file';
        },
        mergeEmailFeedbackIntoHistoryV2_: () => { events.push('merge'); },
        fetchDailyWeatherV2: () => {
          events.push('weather');
          throw new Error('weather unavailable');
        },
      },
    );

    expect(generate).toThrowError('weather unavailable');
    expect(events).toEqual(['load', 'save:idle', 'merge', 'weather']);
    expect(released).toBe(true);
  });

  it('loads and validates a persisted manual idle before merging feedback exactly once', () => {
    const events: string[] = [];
    const generate = evaluateAppsScript<() => { complete: boolean; stage: string }>(
      ['JobState.gs', 'Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => {
          events.push('load');
          return {
            workflow: 'manual-v2',
            qualityPolicyVersion: 4,
            manualStage: 'idle',
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
          };
        },
        mergeEmailFeedbackIntoHistoryV2_: () => { events.push('merge'); },
        fetchDailyWeatherV2: () => {
          events.push('weather');
          return persistedWeatherFixture();
        },
        dailyHistoryContextV2_: () => {
          events.push('history');
          return persistedHistoryFixture();
        },
        savePendingV2_: (pending: { manualStage: string }) => {
          events.push(`save:${pending.manualStage}`);
          return 'pending-file';
        },
      },
    );

    expect(generate()).toEqual({ complete: false, stage: 'weather-ready', bundle: null });
    expect(events).toEqual(['load', 'merge', 'weather', 'history', 'save:weather-ready']);
  });

  it('persists the job selection transition and resumes it without rerunning selection', () => {
    const selectedResult = persistedSelectionFixture();
    const planners = persistedPlannersFixture();
    const snapshot = persistedSnapshotFixture({
      wardrobeFingerprint: 'wardrobe-v3-28',
      candidates: planners.flatMap(response => response.candidates),
    });
    const pending = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3-28',
      weather: persistedWeatherFixture(),
      history: persistedHistoryFixture(),
      planners,
      critic: persistedCriticFixture(planners),
    };
    const savedPending: unknown[] = [];
    let clockIndex = 0;
    const clock = [0, 1, 2, 300_000];
    const TestDate = function(this: unknown, ...args: unknown[]) { return new Date(...args as []); } as unknown as DateConstructor;
    Object.assign(TestDate, { now: () => clock[clockIndex++] ?? 300_000, UTC: Date.UTC });
    const advanceCritic = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown>; pending: Record<string, unknown> }>(
      ['JobState.gs', 'Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        Date: TestDate,
        loadPendingV2_: () => structuredClone(pending),
        incrementAttemptV2_: (state: { attemptCounts: Record<string, number> }, stage: string) => {
          state.attemptCounts[stage] = (state.attemptCounts[stage] || 0) + 1;
        },
        savePendingV2_: (value: unknown) => {
          savedPending.push(structuredClone(value));
          return 'pending-file';
        },
        saveJobStateV2_: () => 'job-file',
      },
    );
    const selected = advanceCritic({
      stage: 'critic-ready',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3-28',
      attemptCounts: {},
    }, snapshot, 0);
    expect(selected.state.stage).toBe('selection-ready');
    expect(savedPending).toContainEqual(expect.objectContaining({
      candidates: selectedResult.candidates,
      critic: selectedResult.critic,
      selectedCandidates: selectedResult.selectedCandidates,
      replanRounds: selectedResult.replanRounds,
      selection: selectedResult.selection,
    }));

    const curatorInputs: unknown[][] = [];
    clockIndex = 0;
    const advanceSelection = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown> }>(
      ['JobState.gs', 'Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        Date: TestDate,
        loadPendingV2_: () => structuredClone({ ...pending, ...selectedResult }),
        incrementAttemptV2_: (state: { attemptCounts: Record<string, number> }, stage: string) => {
          state.attemptCounts[stage] = (state.attemptCounts[stage] || 0) + 1;
        },
        runCuratorV2_: (...args: unknown[]) => {
          curatorInputs.push(args);
          return { recommendations: [] };
        },
        validateFinalBundleV2_: () => [],
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: () => ({ localDate: '2026-07-15' }),
        newRunIdV2_: () => 'run-id',
        savePendingV2_: () => 'pending-file',
        saveJobStateV2_: () => 'job-file',
      },
    );
    const bundled = advanceSelection({
      stage: 'selection-ready',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3-28',
      attemptCounts: {},
    }, snapshot, 0);
    expect(bundled.state.stage).toBe('bundle-ready');
    expect(curatorInputs[0]?.slice(-2)).toEqual([selectedResult.selectedCandidates, selectedResult.critic]);
  });

  it('rejects shallow weather, planner, and critic content in both scheduled and manual resumes', () => {
    const planners = persistedPlannersFixture();
    const validBase = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      weather: persistedWeatherFixture(),
      history: persistedHistoryFixture(),
      planners,
      critic: persistedCriticFixture(planners),
    };
    const poisonCases = [
      {
        stage: 'weather-ready',
        pending: { ...validBase, weather: { localDate: '2026-07-15' } },
        nextBoundary: 'planners',
      },
      {
        stage: 'planners-ready',
        pending: { ...validBase, planners: dailyArchetypes.map(archetype => ({ archetype, candidates: [{ archetype }] })) },
        nextBoundary: 'critic',
      },
      {
        stage: 'critic-ready',
        pending: { ...validBase, critic: { scores: [{ candidateId: planners[0].candidates[0].candidateId }] } },
        nextBoundary: 'selection',
      },
    ];

    poisonCases.forEach(({ stage, pending, nextBoundary }) => {
      const scheduledBoundaries: string[] = [];
      const scheduledStates: Record<string, unknown>[] = [];
      let clockIndex = 0;
      const clock = [0, 300_000];
      const advance = evaluateAppsScript<(
        state: Record<string, unknown>,
        snapshot: Record<string, unknown>,
        startedAt: number,
      ) => { state: Record<string, unknown>; pending: unknown }>(
        ['JobState.gs', 'Scheduler.gs'],
        'advanceDailyJobV2_',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
          Date: { now: () => clock[clockIndex++] ?? 300_000 },
          loadPendingV2_: () => structuredClone(pending),
          runAllPlannersV2_: () => { scheduledBoundaries.push('planners'); return []; },
          runCriticV2_: () => { scheduledBoundaries.push('critic'); return { scores: [] }; },
          runSelectionV2_: () => { scheduledBoundaries.push('selection'); return persistedSelectionFixture(); },
          savePendingV2_: () => 'pending-file',
          saveJobStateV2_: (value: Record<string, unknown>) => {
            scheduledStates.push(structuredClone(value));
            return 'job-file';
          },
        },
      );
      const scheduledResult = advance({
        stage,
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
        attemptCounts: {},
      }, { wardrobeFingerprint: 'wardrobe-v3' }, 0);
      expect({ stage, result: scheduledResult.state.stage, scheduledBoundaries }).toEqual({
        stage,
        result: 'idle',
        scheduledBoundaries: [],
      });
      expect(scheduledStates).toContainEqual(expect.objectContaining({ stage: 'idle', attemptCounts: {} }));

      const manualBoundaries: string[] = [];
      const savedPending: Record<string, unknown>[] = [];
      const manual = evaluateAppsScript<() => { stage: string; complete: boolean }>(
        ['JobState.gs', 'Scheduler.gs'],
        'generateDailyBundleStepV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          mergeEmailFeedbackIntoHistoryV2_: () => undefined,
          applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
          getDailyConfigV2_: () => ({}),
          localDateV2_: () => '2026-07-15',
          loadPendingV2_: () => ({ ...structuredClone(pending), workflow: 'manual-v2', manualStage: stage }),
          fetchDailyWeatherV2: () => persistedWeatherFixture(),
          dailyHistoryContextV2_: () => persistedHistoryFixture(),
          runAllPlannersV2_: () => { manualBoundaries.push('planners'); return []; },
          runCriticV2_: () => { manualBoundaries.push('critic'); return { scores: [] }; },
          runSelectionV2_: () => { manualBoundaries.push('selection'); return persistedSelectionFixture(); },
          savePendingV2_: (value: Record<string, unknown>) => {
            savedPending.push(structuredClone(value));
            return 'pending-file';
          },
        },
      );
      expect({ stage, nextBoundary, result: manual(), manualBoundaries }).toEqual({
        stage,
        nextBoundary,
        result: { complete: false, stage: 'weather-ready', bundle: null },
        manualBoundaries: [],
      });
      expect(savedPending).toContainEqual(expect.objectContaining({
        workflow: 'manual-v2',
        manualStage: 'weather-ready',
      }));
    });
  });

  it('rejects unknown, inherited, fractional, string, or negative scheduled attempt counts', () => {
    const inherited = Object.assign(Object.create({ 'weather-ready': 1 }), { 'critic-ready': 1 });
    const invalidAttemptCounts: unknown[] = [
      { unknown: 1 },
      inherited,
      { 'weather-ready': 1.5 },
      { 'weather-ready': '1' },
      { 'weather-ready': -1 },
      { 'weather-ready': Number.POSITIVE_INFINITY },
    ];
    invalidAttemptCounts.forEach(attemptCounts => {
      const boundaryCalls: string[] = [];
      const savedStates: Record<string, unknown>[] = [];
      let clockIndex = 0;
      const clock = [0, 300_000];
      const advance = evaluateAppsScript<(
        state: Record<string, unknown>,
        snapshot: Record<string, unknown>,
        startedAt: number,
      ) => { state: Record<string, unknown> }>(
        ['JobState.gs', 'Scheduler.gs'],
        'advanceDailyJobV2_',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
          Date: { now: () => clock[clockIndex++] ?? 300_000 },
          loadPendingV2_: () => ({
            qualityPolicyVersion: 4,
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
            weather: persistedWeatherFixture(),
            history: persistedHistoryFixture(),
          }),
          runAllPlannersV2_: () => { boundaryCalls.push('planners'); return []; },
          savePendingV2_: () => 'pending-file',
          saveJobStateV2_: (value: Record<string, unknown>) => {
            savedStates.push(structuredClone(value));
            return 'job-file';
          },
        },
      );
      const result = advance({
        stage: 'weather-ready',
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
        attemptCounts,
      }, { wardrobeFingerprint: 'wardrobe-v3' }, 0);
      expect(result.state.stage).toBe('idle');
      expect(boundaryCalls).toEqual([]);
      expect(savedStates).toContainEqual(expect.objectContaining({ stage: 'idle', attemptCounts: {} }));
    });
  });

  it('recovers malformed idle attempt counts before weather or history work', () => {
    const events: string[] = [];
    const savedStates: Record<string, unknown>[] = [];
    const advance = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown>; pending: unknown }>(
      ['JobState.gs', 'Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: { now: () => 0 },
        loadPendingV2_: () => null,
        mergeEmailFeedbackIntoHistoryV2_: () => { events.push('history'); },
        fetchDailyWeatherV2: () => { events.push('weather'); return persistedWeatherFixture(); },
        savePendingV2_: () => 'pending-file',
        saveJobStateV2_: (value: Record<string, unknown>) => {
          savedStates.push(structuredClone(value));
          return 'job-file';
        },
      },
    );

    expect(() => advance({
      stage: 'idle',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      attemptCounts: null,
    }, { wardrobeFingerprint: 'wardrobe-v3' }, 0)).not.toThrow();
    expect(events).toEqual([]);
    expect(savedStates).toContainEqual(expect.objectContaining({ stage: 'idle', attemptCounts: {} }));
  });

  it('validates a current sent job before the state-sent short circuit', () => {
    const events: string[] = [];
    const savedStates: Record<string, unknown>[] = [];
    let nowCalls = 0;
    class SchedulerDate extends Date {
      static now() {
        nowCalls += 1;
        return nowCalls === 1 ? 0 : 300_000;
      }
    }
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage?: string; skipped?: string }>(
      ['JobState.gs', 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: SchedulerDate,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => { events.push(`set:${key}`); },
        }),
        getBooleanPropertyV2_: () => false,
        loadJobStateV2_: () => ({
          stage: 'sent',
          qualityPolicyVersion: 4,
          localDate: '2026-07-15',
          wardrobeFingerprint: 'wardrobe-v3',
          attemptCounts: null,
        }),
        loadPendingV2_: () => null,
        mergeEmailFeedbackIntoHistoryV2_: () => { events.push('merge'); },
        sendDailyBundleNowV2_: () => { events.push('mail'); },
        recordSentBundleV2_: () => { events.push('record'); },
        savePendingV2_: () => 'pending-file',
        saveJobStateV2_: (state: Record<string, unknown>) => {
          savedStates.push(structuredClone(state));
          return 'job-file';
        },
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toEqual({ ok: true, stage: 'idle' });
    expect(events).toEqual([]);
    expect(savedStates).toContainEqual(expect.objectContaining({ stage: 'idle', attemptCounts: {} }));
  });

  it('writes the sent date only after the persisted bundle is sent successfully', () => {
    const runScheduler = (sendFails: boolean) => {
      const events: string[] = [];
      const state = {
        stage: 'bundle-ready',
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
        attemptCounts: {},
      };
      const properties = {
        getProperty: () => null,
        setProperty: (key: string) => { events.push(`set:${key}`); },
      };
      const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
        ['Scheduler.gs'],
        'runDailyOutfitScheduler',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
          DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          localDateV2_: () => '2026-07-15',
          localMinutesV2_: () => 405,
          getDailyPropertiesV2_: () => properties,
          getBooleanPropertyV2_: () => false,
          assertUnambiguousDailySendStateV2_: () => ({ marker: null, lastSentDate: null }),
          mergeEmailFeedbackIntoHistoryV2_: () => undefined,
          loadJobStateV2_: () => structuredClone(state),
          loadPendingV2_: () => ({
            qualityPolicyVersion: 4,
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
            bundle: {
              qualityPolicyVersion: 4,
              localDate: '2026-07-15',
              wardrobeFingerprint: 'wardrobe-v3',
            },
          }),
          validCurrentPendingV2_: () => true,
          validCurrentBundleV2_: () => true,
          validFullBundleReadyV2_: () => true,
          validScheduledJobStateV2_: () => true,
          validScheduledStageResumeV2_: () => true,
          incrementAttemptV2_: () => undefined,
          sendDailyBundleNowV2_: () => {
            events.push('send');
            if (sendFails) throw new Error('send failed');
          },
          finalizeSentBundleV2_: (_bundle: unknown, _snapshot: unknown, current: typeof state) => {
            events.push('set:LAST_SENT_DATE_V2');
            events.push('record');
            return { ...current, stage: 'sent' };
          },
          saveJobStateV2_: () => undefined,
          sendOperationalAlertV2_: () => undefined,
          console: { error: () => undefined },
        },
      );
      return { result: scheduler(), events };
    };

    const failed = runScheduler(true);
    expect(failed.result.ok).toBe(false);
    expect(failed.events).toEqual(['send']);

    const sent = runScheduler(false);
    expect(sent.result.ok).toBe(true);
    expect(sent.events).toEqual(['send', 'set:LAST_SENT_DATE_V2', 'record']);
  });

  it.each([
    ['quality-exhausted-zero: no eligible daily outfit recommendation remains', 'quality-exhausted-zero', 0],
    ['critic transport failed', 'generation-failed', 1],
  ])('classifies scheduler failure %s and suppresses only zero-safe alert delivery', (
    errorMessage,
    expectedReason,
    expectedAlertCount,
  ) => {
    const planners = persistedPlannersFixture();
    const pending = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      weather: persistedWeatherFixture(),
      history: persistedHistoryFixture(),
      planners,
      critic: persistedCriticFixture(planners),
    };
    const snapshotValue = persistedSnapshotFixture({
      wardrobeFingerprint: pending.wardrobeFingerprint,
      candidates: planners.flatMap(response => response.candidates),
    });
    const bundleSaves: unknown[] = [];
    const mailCalls: unknown[] = [];
    const logMessages: string[] = [];
    const savedStates: Array<Record<string, unknown>> = [];
    const propertyValues: Record<string, string> = {};
    const scheduler = evaluateAppsScript<() => { ok: boolean; error: string; stage: string }>(
      ['Email.gs', 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: {
          QUALITY_POLICY_VERSION: 4,
          ARCHETYPES: dailyArchetypes,
          GENERATION_CUTOFF_HOUR: 8,
          MIN_EXECUTION_REMAINING_MS: 45_000,
        },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        Date: class extends Date { static now() { return 0; } },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => snapshotValue,
        loadSnapshotV2_: () => snapshotValue,
        applySnapshotSettingsV2_: () => ({
          timezone: 'UTC',
          deliveryHour: 6,
          deliveryMinute: 45,
          generationLeadMinutes: 75,
        }),
        getDailyConfigV2_: () => ({
          timezone: 'UTC',
          recipientEmail: 'safe@example.com',
          sendOperationalAlerts: true,
        }),
        localDateV2_: () => pending.localDate,
        localMinutesV2_: () => 600,
        getDailyPropertiesV2_: () => ({
          getProperty: (key: string) => propertyValues[key] ?? null,
          setProperty: (key: string, value: string) => { propertyValues[key] = value; },
        }),
        assertUnambiguousDailySendStateV2_: () => ({ marker: null, lastSentDate: null }),
        getBooleanPropertyV2_: () => false,
        loadJobStateV2_: () => ({
          stage: 'critic-ready',
          qualityPolicyVersion: 4,
          localDate: pending.localDate,
          wardrobeFingerprint: pending.wardrobeFingerprint,
          attemptCounts: {},
        }),
        loadPendingV2_: () => structuredClone(pending),
        validScheduledJobStateV2_: () => true,
        validScheduledStageResumeV2_: () => true,
        incrementAttemptV2_: (state: { attemptCounts: Record<string, number> }, stage: string) => {
          state.attemptCounts[stage] = (state.attemptCounts[stage] || 0) + 1;
        },
        runSelectionV2_: () => { throw new Error(errorMessage); },
        savePendingV2_: (value: unknown) => {
          bundleSaves.push(structuredClone(value));
          return 'pending-file';
        },
        saveJobStateV2_: (value: Record<string, unknown>) => {
          savedStates.push(structuredClone(value));
          return 'job-file';
        },
        MailApp: { sendEmail: (...args: unknown[]) => { mailCalls.push(args); } },
        console: { error: (message: string) => { logMessages.push(message); } },
      },
    );

    expect(scheduler()).toMatchObject({ ok: false, error: errorMessage, stage: 'failed' });
    expect(bundleSaves).toEqual([]);
    expect(mailCalls).toHaveLength(expectedAlertCount);
    expect(propertyValues).toEqual(expectedAlertCount
      ? { LAST_OPERATIONAL_ALERT_V2: `${pending.localDate}|${expectedReason}` }
      : {});
    expect(logMessages).toContain(`Daily scheduler failed [${expectedReason}]: ${errorMessage}`);
    expect(savedStates.at(-1)).toMatchObject({
      stage: 'failed',
      lastError: errorMessage,
      attemptCounts: { 'critic-ready-error': 1 },
    });
  });

  it('sets the real-send marker immediately before MailApp while test delivery never touches it', () => {
    const run = (testMode: boolean, markerFails = false, mailFails = false) => {
      const events: string[] = [];
      const values: Record<string, string> = {};
      const pending = sendablePendingFixture();
      const snapshotValue = sendableSnapshotFixture();
      const send = evaluateAppsScript<(
        bundle: unknown,
        snapshot: unknown,
        isTest: boolean,
        persisted: unknown,
        localDate: string,
      ) => void>(
        ['JobState.gs', 'FinalValidation.gs', 'Email.gs'],
        'sendDailyBundleNowV2_',
        {
          DAILY_V2: dailySelectionRuntime,
          getDailyPropertiesV2_: () => ({
            getProperty: (key: string) => values[key] ?? null,
            setProperty: (key: string, value: string) => {
              events.push(`set:${key}:${value}`);
              if (markerFails && key === 'SEND_IN_PROGRESS_DATE_V2') throw new Error('marker failed');
              values[key] = value;
            },
          }),
          getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
          savedOutfitExactCopyV2_: () => null,
          Utilities: emailUtilitiesFixture,
          MailApp: { sendEmail: () => {
            events.push('mail');
            if (mailFails) throw new Error('mail failed');
          } },
        },
      );
      const invoke = () => send(pending.bundle, snapshotValue, testMode, pending, '2026-07-15');
      return { events, invoke, values };
    };

    const real = run(false);
    expect(real.invoke).not.toThrow();
    expect(real.events.slice(-2)).toEqual(['set:SEND_IN_PROGRESS_DATE_V2:2026-07-15', 'mail']);
    expect(real.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-15');

    const test = run(true);
    expect(test.invoke).not.toThrow();
    expect(test.events).toEqual(['mail']);
    expect(test.values).not.toHaveProperty('SEND_IN_PROGRESS_DATE_V2');

    const markerFailure = run(false, true);
    expect(markerFailure.invoke).toThrowError('marker failed');
    expect(markerFailure.events).toEqual(['set:SEND_IN_PROGRESS_DATE_V2:2026-07-15']);

    const mailFailure = run(false, false, true);
    expect(mailFailure.invoke).toThrowError('mail failed');
    expect(mailFailure.events.slice(-2)).toEqual(['set:SEND_IN_PROGRESS_DATE_V2:2026-07-15', 'mail']);
    expect(mailFailure.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-15');
  });

  it('fails closed instead of resending after MailApp leaves an unresolved current or stale marker', () => {
    const run = (initialMarker?: string, invalidatePending = false) => {
      const events: string[] = [];
      const values: Record<string, string> = initialMarker
        ? { SEND_IN_PROGRESS_DATE_V2: initialMarker }
        : {};
      let mailFails = !initialMarker;
      const pending = sendablePendingFixture();
      if (invalidatePending) pending.bundle.recommendations = [];
      const snapshotValue = sendableSnapshotFixture();
      const send = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'FinalValidation.gs', 'Email.gs'],
        'sendDailyBundleNowV2',
        {
          DAILY_V2: dailySelectionRuntime,
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          loadPendingV2_: () => pending,
          getDailyPropertiesV2_: () => ({
            getProperty: (key: string) => values[key] ?? null,
            setProperty: (key: string, value: string) => {
              events.push(`set:${key}:${value}`);
              values[key] = value;
            },
            deleteProperty: (key: string) => {
              events.push(`delete:${key}`);
              delete values[key];
            },
          }),
          getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
          savedOutfitExactCopyV2_: () => null,
          Utilities: emailUtilitiesFixture,
          MailApp: { sendEmail: () => {
            events.push('mail');
            if (mailFails) throw new Error('mail failed');
          } },
          loadHistoryV2_: () => [],
          saveHistoryV2_: () => events.push('record'),
        },
      );
      return { events, send, values, allowMail: () => { mailFails = false; } };
    };

    const current = run();
    expect(current.send).toThrowError('mail failed');
    expect(current.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-15');
    current.allowMail();
    expect(current.send).toThrowError(/Ambiguous daily email send.*2026-07-15/);
    expect(current.events.filter(event => event === 'mail')).toHaveLength(1);
    expect(current.values).not.toHaveProperty('LAST_SENT_DATE_V2');

    const stale = run('2026-07-14');
    expect(stale.send).toThrowError(/Ambiguous daily email send.*2026-07-14/);
    expect(stale.events).toEqual([]);
    expect(stale.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-14');

    const staleWithInvalidPending = run('2026-07-14', true);
    expect(staleWithInvalidPending.send)
      .toThrowError(/Ambiguous daily email send.*2026-07-14/);
    expect(staleWithInvalidPending.events).toEqual([]);
  });

  it('finalizes real sends in recoverable order and reconciles matching sent state without another email', () => {
    const run = (initialValues: Record<string, string> = {}, failHistoryOnce = false) => {
      const events: string[] = [];
      const values = { ...initialValues };
      const pending = sendablePendingFixture();
      const snapshotValue = sendableSnapshotFixture();
      let history: unknown[] = [];
      let state = {
        stage: 'bundle-ready',
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: snapshotValue.wardrobeFingerprint,
        attemptCounts: {},
      };
      let historyFailuresRemaining = failHistoryOnce ? 1 : 0;
      const send = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'FinalValidation.gs', 'Email.gs'],
        'sendDailyBundleNowV2',
        {
          DAILY_V2: dailySelectionRuntime,
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          loadPendingV2_: () => pending,
          loadJobStateV2_: () => structuredClone(state),
          saveJobStateV2_: (next: typeof state) => {
            events.push(`state:${next.stage}`);
            state = structuredClone(next);
          },
          getDailyPropertiesV2_: () => ({
            getProperty: (key: string) => values[key] ?? null,
            setProperty: (key: string, value: string) => {
              events.push(`set:${key}:${value}`);
              values[key] = value;
            },
            deleteProperty: (key: string) => {
              events.push(`delete:${key}`);
              delete values[key];
            },
          }),
          getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
          savedOutfitExactCopyV2_: () => null,
          Utilities: emailUtilitiesFixture,
          MailApp: { sendEmail: () => events.push('mail') },
          loadHistoryV2_: () => structuredClone(history),
          saveHistoryV2_: (next: unknown[]) => {
            events.push('history');
            if (historyFailuresRemaining > 0) {
              historyFailuresRemaining -= 1;
              throw new Error('history failed');
            }
            history = structuredClone(next);
          },
        },
      );
      return { events, history: () => history, send, state: () => state, values };
    };

    const successful = run();
    expect(successful.send).not.toThrow();
    expect(successful.events).toEqual([
      'set:SEND_IN_PROGRESS_DATE_V2:2026-07-15',
      'mail',
      'set:LAST_SENT_DATE_V2:2026-07-15',
      'history',
      'state:sent',
      'delete:SEND_IN_PROGRESS_DATE_V2',
    ]);
    expect(successful.state().stage).toBe('sent');
    expect(successful.values).toEqual({ LAST_SENT_DATE_V2: '2026-07-15' });

    const retry = run({}, true);
    expect(retry.send).toThrowError('history failed');
    expect(retry.values).toMatchObject({
      LAST_SENT_DATE_V2: '2026-07-15',
      SEND_IN_PROGRESS_DATE_V2: '2026-07-15',
    });
    expect(retry.send).not.toThrow();
    expect(retry.events.filter(event => event === 'mail')).toHaveLength(1);
    expect(retry.events.slice(-3)).toEqual(['history', 'state:sent', 'delete:SEND_IN_PROGRESS_DATE_V2']);

    const alreadySent = run({ LAST_SENT_DATE_V2: '2026-07-15' });
    expect(alreadySent.send).not.toThrow();
    expect(alreadySent.events).toEqual(['history', 'state:sent', 'delete:SEND_IN_PROGRESS_DATE_V2']);
    expect(alreadySent.history()).toHaveLength(1);
  });

  it('makes Scheduler reconcile an already-sent persisted bundle and reject ambiguity before generation', () => {
    const run = (values: Record<string, string>) => {
      const events: string[] = [];
      const state = {
        stage: 'bundle-ready', qualityPolicyVersion: 4, localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3', attemptCounts: {},
      };
      const pending = { bundle: { localDate: '2026-07-15', wardrobeFingerprint: 'wardrobe-v3' } };
      const scheduler = evaluateAppsScript<() => { ok: boolean; skipped?: string; error?: string; stage?: string }>(
        ['Scheduler.gs'],
        'runDailyOutfitScheduler',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
          DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          localDateV2_: () => '2026-07-15',
          localMinutesV2_: () => 300,
          getDailyPropertiesV2_: () => ({
            getProperty: (key: string) => values[key] ?? null,
          }),
          getBooleanPropertyV2_: () => false,
          assertUnambiguousDailySendStateV2_: (properties: { getProperty: (key: string) => string | null }) => {
            const marker = properties.getProperty('SEND_IN_PROGRESS_DATE_V2');
            const last = properties.getProperty('LAST_SENT_DATE_V2');
            events.push('send-state');
            if (marker && marker !== last) throw new Error(`Ambiguous daily email send state for ${marker}`);
            return { marker, lastSentDate: last };
          },
          loadJobStateV2_: () => { events.push('load-state'); return structuredClone(state); },
          loadPendingV2_: () => { events.push('load-pending'); return pending; },
          validScheduledJobStateV2_: () => true,
          validFullBundleReadyV2_: () => true,
          reconcilePersistedSentBundleV2_: () => {
            events.push('load-state', 'load-pending', 'reconcile');
            return { state: { ...state, stage: 'sent' } };
          },
          finalizeSentBundleV2_: (_bundle: unknown, _snapshot: unknown, current: typeof state) => {
            events.push('reconcile');
            return { ...current, stage: 'sent' };
          },
          sendDailyBundleNowV2_: () => events.push('mail'),
          saveJobStateV2_: () => events.push('state'),
          sendOperationalAlertV2_: () => events.push('alert'),
          console: { error: () => undefined },
        },
      );
      return { events, scheduler };
    };

    const alreadySent = run({
      LAST_SENT_DATE_V2: '2026-07-15',
      SEND_IN_PROGRESS_DATE_V2: '2026-07-15',
    });
    expect(alreadySent.scheduler()).toEqual({ ok: true, skipped: 'already-sent', stage: 'sent' });
    expect(alreadySent.events).toEqual(['send-state', 'load-state', 'load-pending', 'reconcile']);

    const ambiguous = run({ SEND_IN_PROGRESS_DATE_V2: '2026-07-14' });
    expect(ambiguous.scheduler()).toMatchObject({
      ok: false,
      error: 'Ambiguous daily email send state for 2026-07-14',
    });
    expect(ambiguous.events).toEqual(['send-state']);
  });

  it('causally blocks policy, prior-date, and fingerprint metadata drift at all three send endpoints', () => {
    const dimensions: MetadataDimension[] = ['policy', 'date', 'fingerprint'];
    const baselinePending = sendablePendingFixture();
    const baselineSnapshot = sendableSnapshotFixture();
    const fullBundle = evaluateAppsScript<(pending: unknown, snapshot: unknown, localDate: string) => boolean>(
      ['Selection.gs', 'JobState.gs', 'FinalValidation.gs'],
      'validFullBundleReadyV2_',
      {
        DAILY_V2: dailySelectionRuntime,
        itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
        savedOutfitExactCopyV2_: () => null,
      },
    );
    expect(fullBundle(baselinePending, baselineSnapshot, '2026-07-15')).toBe(true);

    ['sendDailyBundleNowV2', 'sendDailyTestEmailV2'].forEach(exported => {
      const events: string[] = [];
      const send = evaluateAppsScript<() => unknown>(
        ['Selection.gs', 'JobState.gs', 'FinalValidation.gs', 'Email.gs'],
        exported,
        {
          DAILY_V2: dailySelectionRuntime,
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          loadSnapshotV2_: () => baselineSnapshot,
          assertFreshSnapshotV2_: () => baselineSnapshot,
          loadPendingV2_: () => structuredClone(baselinePending),
          getDailyPropertiesV2_: () => ({
            getProperty: () => null,
            setProperty: (key: string) => { events.push(`set:${key}`); },
          }),
          getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
          savedOutfitExactCopyV2_: () => null,
          Utilities: emailUtilitiesFixture,
          MailApp: { sendEmail: () => { events.push('mail'); } },
          loadHistoryV2_: () => [],
          saveHistoryV2_: () => { events.push('sent-history'); },
        },
      );

      expect(() => send()).not.toThrow();
      expect(events).toEqual(exported === 'sendDailyBundleNowV2'
        ? ['set:SEND_IN_PROGRESS_DATE_V2', 'mail', 'set:LAST_SENT_DATE_V2', 'sent-history']
        : ['mail']);
    });

    const scheduledEvents: string[] = [];
    class BaselineSchedulerDate extends Date {
      static now() {
        return 0;
      }
    }
    const scheduledBaseline = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['Selection.gs', 'JobState.gs', 'FinalValidation.gs', 'Email.gs', 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { ...dailySelectionRuntime, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: BaselineSchedulerDate,
        Utilities: emailUtilitiesFixture,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => baselineSnapshot,
        loadSnapshotV2_: () => baselineSnapshot,
        applySnapshotSettingsV2_: () => ({
          recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC',
          deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75,
        }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => { scheduledEvents.push(`set:${key}`); },
        }),
        getBooleanPropertyV2_: () => false,
        loadJobStateV2_: () => ({
          stage: 'bundle-ready', qualityPolicyVersion: 4, localDate: '2026-07-15',
          wardrobeFingerprint: 'wardrobe-v3-28', attemptCounts: {},
        }),
        loadPendingV2_: () => structuredClone(baselinePending),
        mergeEmailFeedbackIntoHistoryV2_: () => { scheduledEvents.push('feedback-history'); },
        itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
        savedOutfitExactCopyV2_: () => null,
        MailApp: { sendEmail: () => { scheduledEvents.push('mail'); } },
        loadHistoryV2_: () => [],
        saveHistoryV2_: () => { scheduledEvents.push('sent-history'); },
        saveJobStateV2_: () => 'job-file',
        savePendingV2_: () => 'pending-file',
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );
    expect(scheduledBaseline()).toMatchObject({ ok: true, stage: 'sent' });
    expect(scheduledEvents).toEqual(['set:SEND_IN_PROGRESS_DATE_V2', 'mail', 'set:LAST_SENT_DATE_V2', 'sent-history']);

    dimensions.forEach(dimension => {
      ['sendDailyBundleNowV2', 'sendDailyTestEmailV2'].forEach(exported => {
        const events: string[] = [];
        const snapshotValue = sendableSnapshotFixture();
        const pendingValue = sendablePendingFixture();
        mutatePersistedMetadataDimension(pendingValue, dimension);
        const send = evaluateAppsScript<() => unknown>(
          ['Selection.gs', 'JobState.gs', 'FinalValidation.gs', 'Email.gs'],
          exported,
          {
            DAILY_V2: dailySelectionRuntime,
            loadSnapshotV2_: () => snapshotValue,
            assertFreshSnapshotV2_: () => snapshotValue,
            loadPendingV2_: () => structuredClone(pendingValue),
            getDailyPropertiesV2_: () => ({
              getProperty: () => null,
              setProperty: (key: string) => { events.push(`set:${key}`); },
            }),
            getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
            applySnapshotSettingsV2_: (value: unknown) => value,
            localDateV2_: () => '2026-07-15',
            itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
            savedOutfitExactCopyV2_: () => null,
            Utilities: emailUtilitiesFixture,
            MailApp: { sendEmail: () => { events.push('mail'); } },
            loadHistoryV2_: () => [],
            saveHistoryV2_: () => { events.push('sent-history'); },
          },
        );

        expect({ dimension, exported }).toMatchObject({ dimension, exported });
        expect(send).toThrow();
        expect(events).toEqual([]);
      });

      const events: string[] = [];
      const savedStates: Record<string, unknown>[] = [];
      const snapshotValue = sendableSnapshotFixture();
      const pendingValue = sendablePendingFixture();
      mutatePersistedMetadataDimension(pendingValue, dimension);
      const state = {
        stage: 'bundle-ready',
        qualityPolicyVersion: pendingValue.qualityPolicyVersion,
        localDate: pendingValue.localDate,
        wardrobeFingerprint: pendingValue.wardrobeFingerprint,
        attemptCounts: {},
      };
      class SchedulerDate extends Date {
        static now() {
          return 0;
        }
      }
      const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
        ['Selection.gs', 'JobState.gs', 'FinalValidation.gs', 'Email.gs', 'Scheduler.gs'],
        'runDailyOutfitScheduler',
        {
          DAILY_V2: { ...dailySelectionRuntime, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
          Date: SchedulerDate,
          Utilities: emailUtilitiesFixture,
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          assertFreshSnapshotV2_: () => snapshotValue,
          loadSnapshotV2_: () => snapshotValue,
          applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          localDateV2_: () => '2026-07-15',
          localMinutesV2_: () => 405,
          getDailyPropertiesV2_: () => ({
            getProperty: () => null,
            setProperty: (key: string) => { events.push(`set:${key}`); },
          }),
          getBooleanPropertyV2_: () => false,
          loadJobStateV2_: () => structuredClone(state),
          loadPendingV2_: () => structuredClone(pendingValue),
          mergeEmailFeedbackIntoHistoryV2_: () => { events.push('feedback-history'); },
          fetchDailyWeatherV2: () => {
            events.push('generation');
            throw new Error('drift recovery advanced into generation');
          },
          itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
          savedOutfitExactCopyV2_: () => null,
          MailApp: { sendEmail: () => { events.push('mail'); } },
          loadHistoryV2_: () => [],
          saveHistoryV2_: () => { events.push('sent-history'); },
          saveJobStateV2_: (value: Record<string, unknown>) => {
            savedStates.push(structuredClone(value));
            return 'job-file';
          },
          savePendingV2_: () => 'pending-file',
          sendOperationalAlertV2_: () => undefined,
          console: { error: () => undefined },
        },
      );

      expect({ dimension, result: scheduler() }).toMatchObject({ dimension, result: { ok: true, stage: 'idle' } });
      expect(events).toEqual([]);
      expect(savedStates).toEqual([expect.objectContaining({
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3-28',
        stage: 'idle',
        attemptCounts: {},
      })]);
    });
  });

  it('never sends or records malformed stale-policy or prior-date content through public normal or test entry points', () => {
    const snapshotValue = { wardrobeFingerprint: 'wardrobe-v3', settings: {}, items: [] };
    const bundle = {
      qualityPolicyVersion: 3,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      recommendations: [],
      weather: {
        locationLabel: 'Brooklyn',
        timezone: 'UTC',
        morningFeelsLikeF: 60,
        highTemperatureF: 70,
        maxRainProbability: 0,
        plainEnglishSummary: 'Clear.',
        weatherPhrase: 'clear',
        windy: false,
      },
    };
    const stalePending = {
      qualityPolicyVersion: 3,
      localDate: bundle.localDate,
      wardrobeFingerprint: bundle.wardrobeFingerprint,
      bundle,
    };

    const priorDatePending = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-14',
      wardrobeFingerprint: bundle.wardrobeFingerprint,
      bundle: {
        ...bundle,
        qualityPolicyVersion: 4,
        localDate: '2026-07-14',
      },
    };

    [stalePending, priorDatePending].forEach(pendingValue => ['sendDailyBundleNowV2', 'sendDailyTestEmailV2'].forEach(exported => {
      const events: string[] = [];
      const properties = {
        getProperty: () => null,
        setProperty: (key: string) => { events.push(`set:${key}`); },
      };
      const send = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'Email.gs'],
        exported,
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          loadPendingV2_: () => pendingValue,
          getDailyPropertiesV2_: () => properties,
          getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          itemMapV2_: () => Object.create(null),
          Utilities: { formatDate: () => 'Wednesday, July 15' },
          MailApp: { sendEmail: () => { events.push('send'); } },
          recordSentBundleV2_: () => { events.push('record'); },
        },
      );

      expect(send).toThrow();
      expect(events).toEqual([]);
    }));
  });

  it('does not send or record a public normal bundle whose fingerprint differs from the current snapshot', () => {
    const events: string[] = [];
    const snapshotValue = { wardrobeFingerprint: 'wardrobe-current', settings: {}, items: [] };
    const pendingValue = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-stale',
      bundle: {
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-stale',
        recommendations: [],
        weather: {},
      },
    };
    const send = evaluateAppsScript<() => unknown>(
      ['JobState.gs', 'Email.gs'],
      'sendDailyBundleNowV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        loadSnapshotV2_: () => snapshotValue,
        assertFreshSnapshotV2_: () => snapshotValue,
        loadPendingV2_: () => pendingValue,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => { events.push(`set:${key}`); },
        }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '' }),
        applySnapshotSettingsV2_: (value: unknown) => value,
        localDateV2_: () => '2026-07-15',
        MailApp: { sendEmail: () => { events.push('mail'); } },
        recordSentBundleV2_: () => { events.push('record'); },
      },
    );

    expect(send).toThrowError('No quality-gated bundle is ready');
    expect(events).toEqual([]);
  });

  it('does not send a public test email whose fingerprint differs from the current snapshot', () => {
    const events: string[] = [];
    const snapshotValue = sendableSnapshotFixture();
    snapshotValue.wardrobeFingerprint = 'wardrobe-current';
    const pendingValue = sendablePendingFixture();
    const send = evaluateAppsScript<() => unknown>(
      ['JobState.gs', 'FinalValidation.gs', 'Email.gs'],
      'sendDailyTestEmailV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => snapshotValue,
        assertFreshSnapshotV2_: () => snapshotValue,
        loadPendingV2_: () => pendingValue,
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        applySnapshotSettingsV2_: (value: unknown) => value,
        localDateV2_: () => '2026-07-15',
        itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
        savedOutfitExactCopyV2_: () => null,
        MailApp: { sendEmail: () => { events.push('mail'); } },
      },
    );

    expect(send).toThrow();
    expect(events).toEqual([]);
  });

  it('requires full sendable bundle content, not only current metadata', () => {
    const validator = evaluateAppsScript<((pending: unknown, snapshot: unknown, localDate: string) => boolean) | null>(
      ['JobState.gs', 'FinalValidation.gs'],
      "(typeof validFullBundleReadyV2_ === 'function' ? validFullBundleReadyV2_ : null)",
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
        savedOutfitExactCopyV2_: () => null,
      },
    );
    expect(validator).toBeTypeOf('function');
    if (!validator) return;

    const snapshotValue = sendableSnapshotFixture();
    const valid = sendablePendingFixture();
    expect(validator(valid, snapshotValue, '2026-07-15')).toBe(true);

    const invalids: unknown[] = [];
    const emptyRecommendations = structuredClone(valid);
    emptyRecommendations.bundle.recommendations = [];
    invalids.push(emptyRecommendations);

    const sparseRecommendations = structuredClone(valid);
    delete sparseRecommendations.bundle.recommendations[1];
    invalids.push(sparseRecommendations);

    const missingCustomerCopy = structuredClone(valid);
    delete (missingCustomerCopy.bundle.recommendations[0] as Partial<typeof missingCustomerCopy.bundle.recommendations[number]>).name;
    invalids.push(missingCustomerCopy);

    const changedCandidate = structuredClone(valid);
    changedCandidate.bundle.recommendations[0].candidateId = 'changed-candidate';
    invalids.push(changedCandidate);

    const missingCoverage = structuredClone(valid);
    delete (missingCoverage.bundle as Partial<typeof missingCoverage.bundle>).coverage;
    invalids.push(missingCoverage);

    const mismatchedCoverage = structuredClone(valid);
    mismatchedCoverage.bundle.coverage.selectedArchetypes.reverse();
    invalids.push(mismatchedCoverage);

    const reorderedItems = structuredClone(valid);
    reorderedItems.bundle.recommendations[0].itemIds.reverse();
    expect(validator(reorderedItems, snapshotValue, '2026-07-15')).toBe(true);

    const invalidWeather = structuredClone(valid);
    invalidWeather.weather = { localDate: '2026-07-15' } as typeof invalidWeather.weather;
    invalidWeather.bundle.weather = structuredClone(invalidWeather.weather);
    invalids.push(invalidWeather);

    const invalidHistory = structuredClone(valid);
    invalidHistory.history.cooldownItemIds = new Array(1);
    invalids.push(invalidHistory);

    const invalidCritic = structuredClone(valid);
    invalidCritic.critic.scores[0].reservations = [9] as unknown as string[];
    invalids.push(invalidCritic);

    invalids.forEach(value => {
      expect(() => validator(value, snapshotValue, '2026-07-15')).not.toThrow();
      expect(validator(value, snapshotValue, '2026-07-15')).toBe(false);
    });
  });

  it('blocks empty, malformed, or changed recommendations in public normal and test sends', () => {
    const mutations: Array<[string, (pending: ReturnType<typeof sendablePendingFixture>) => void]> = [
      ['empty', pending => { pending.bundle.recommendations = []; }],
      ['malformed', pending => {
        delete (pending.bundle.recommendations[0] as Partial<typeof pending.bundle.recommendations[number]>).weatherNote;
      }],
      ['changed', pending => { pending.bundle.recommendations[0].candidateId = 'changed-candidate'; }],
    ];

    mutations.forEach(([label, mutate]) => {
      ['sendDailyBundleNowV2', 'sendDailyTestEmailV2'].forEach(exported => {
        const events: string[] = [];
        const snapshotValue = sendableSnapshotFixture();
        const pendingValue = sendablePendingFixture();
        mutate(pendingValue);
        const send = evaluateAppsScript<() => unknown>(
          ['JobState.gs', 'FinalValidation.gs', 'Email.gs'],
          exported,
          {
            DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
            loadSnapshotV2_: () => snapshotValue,
            assertFreshSnapshotV2_: () => snapshotValue,
            loadPendingV2_: () => pendingValue,
            getDailyPropertiesV2_: () => ({
              getProperty: () => null,
              setProperty: (key: string) => { events.push(`set:${key}`); },
            }),
            getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
            applySnapshotSettingsV2_: (value: unknown) => value,
            localDateV2_: () => '2026-07-15',
            itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
            savedOutfitExactCopyV2_: () => null,
            Utilities: {
              base64Decode: () => [],
              newBlob: () => ({}),
              formatDate: () => 'Wednesday, July 15',
            },
            MailApp: { sendEmail: () => { events.push('mail'); } },
            recordSentBundleV2_: () => { events.push('record'); },
          },
        );

        expect({ label, exported, run: send }).toMatchObject({ label, exported });
        expect(send).toThrow();
        expect(events).toEqual([]);
      });
    });
  });

  it('defensively blocks malformed bundle content at the internal send boundary', () => {
    const events: string[] = [];
    const snapshotValue = sendableSnapshotFixture();
    const pendingValue = sendablePendingFixture();
    pendingValue.bundle.recommendations[0].itemIds[0] = 'changed-item-id';
    const send = evaluateAppsScript<(bundle: unknown, snapshot: unknown, testMode: boolean, pending: unknown, localDate: string) => unknown>(
      ['JobState.gs', 'FinalValidation.gs', 'Email.gs'],
      'sendDailyBundleNowV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        applySnapshotSettingsV2_: (value: unknown) => value,
        itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
        savedOutfitExactCopyV2_: () => null,
        Utilities: {
          base64Decode: () => [],
          newBlob: () => ({}),
          formatDate: () => 'Wednesday, July 15',
        },
        MailApp: { sendEmail: () => { events.push('mail'); } },
      },
    );

    expect(() => send(pendingValue.bundle, snapshotValue, false, pendingValue, '2026-07-15')).toThrow();
    expect(events).toEqual([]);
  });

  it('does not send a stale pending bundle from a current bundle-ready job', () => {
    const events: string[] = [];
    let nowCalls = 0;
    class SchedulerDate extends Date {
      static now() {
        nowCalls += 1;
        return nowCalls === 1 ? 0 : 300_000;
      }
    }
    const state = {
      stage: 'bundle-ready',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      attemptCounts: {},
    };
    const stalePending = {
      qualityPolicyVersion: 3,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      bundle: {
        qualityPolicyVersion: 3,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
      },
    };
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['JobState.gs', 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: SchedulerDate,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => { events.push(`set:${key}`); },
        }),
        getBooleanPropertyV2_: () => false,
        mergeEmailFeedbackIntoHistoryV2_: () => undefined,
        loadJobStateV2_: () => structuredClone(state),
        loadPendingV2_: () => structuredClone(stalePending),
        incrementAttemptV2_: () => undefined,
        sendDailyBundleNowV2_: () => { events.push('send'); },
        recordSentBundleV2_: () => { events.push('record'); },
        saveJobStateV2_: () => undefined,
        savePendingV2_: () => 'pending-file',
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toMatchObject({ ok: true, stage: 'idle' });
    expect(events).toEqual([]);
  });

  it('does not call MailApp or record a scheduled bundle-ready fingerprint mismatch', () => {
    const events: string[] = [];
    let nowCalls = 0;
    class SchedulerDate extends Date {
      static now() {
        nowCalls += 1;
        return nowCalls === 1 ? 0 : 300_000;
      }
    }
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['JobState.gs', 'Scheduler.gs', 'Email.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: SchedulerDate,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-current' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-current' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => { events.push(`set:${key}`); },
        }),
        getBooleanPropertyV2_: () => false,
        mergeEmailFeedbackIntoHistoryV2_: () => undefined,
        loadJobStateV2_: () => ({
          stage: 'bundle-ready',
          qualityPolicyVersion: 4,
          localDate: '2026-07-15',
          wardrobeFingerprint: 'wardrobe-current',
          attemptCounts: {},
        }),
        loadPendingV2_: () => ({
          qualityPolicyVersion: 4,
          localDate: '2026-07-15',
          wardrobeFingerprint: 'wardrobe-current',
          weather: {},
          history: {},
          planners: dailyArchetypes.map(archetype => ({ archetype })),
          critic: { scores: [{ candidateId: 'selected-easy' }] },
          bundle: {
            qualityPolicyVersion: 4,
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-stale',
            weather: {},
            recommendations: dailyArchetypes.map(archetype => ({ archetype })),
          },
        }),
        MailApp: { sendEmail: () => { events.push('mail'); } },
        recordSentBundleV2_: () => { events.push('record'); },
        saveJobStateV2_: () => undefined,
        savePendingV2_: () => 'pending-file',
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toMatchObject({ ok: true, stage: 'idle' });
    expect(events).toEqual([]);
  });

  it('does not send or mutate scheduled state for empty, malformed, or changed recommendation content', () => {
    const mutations: Array<[string, (pending: ReturnType<typeof sendablePendingFixture>) => void]> = [
      ['empty', pending => { pending.bundle.recommendations = []; }],
      ['malformed', pending => {
        delete (pending.bundle.recommendations[1] as Partial<typeof pending.bundle.recommendations[number]>).whyItWorks;
      }],
      ['changed', pending => { pending.bundle.recommendations[2].itemIds[0] = 'changed-item-id'; }],
    ];
    mutations.forEach(([label, mutate]) => {
      const events: string[] = [];
      let nowCalls = 0;
      class SchedulerDate extends Date {
        static now() {
          nowCalls += 1;
          return nowCalls === 1 ? 0 : 300_000;
        }
      }
      const pendingValue = Object.assign(sendablePendingFixture(), { planners: persistedPlannersFixture() });
      mutate(pendingValue);
      const snapshotValue = sendableSnapshotFixture();
      const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
        ['JobState.gs', 'FinalValidation.gs', 'Scheduler.gs'],
        'runDailyOutfitScheduler',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
          Date: SchedulerDate,
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          assertFreshSnapshotV2_: () => snapshotValue,
          loadSnapshotV2_: () => snapshotValue,
          applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          localDateV2_: () => '2026-07-15',
          localMinutesV2_: () => 405,
          getDailyPropertiesV2_: () => ({
            getProperty: () => null,
            setProperty: (key: string) => { events.push(`set:${key}`); },
          }),
          getBooleanPropertyV2_: () => false,
          mergeEmailFeedbackIntoHistoryV2_: () => { events.push('history-merge'); },
          loadJobStateV2_: () => ({
            stage: 'bundle-ready',
            qualityPolicyVersion: 4,
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
            attemptCounts: {},
          }),
          loadPendingV2_: () => structuredClone(pendingValue),
          itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
          savedOutfitExactCopyV2_: () => null,
          sendDailyBundleNowV2_: () => { events.push('mail'); },
          recordSentBundleV2_: () => { events.push('record'); },
          saveJobStateV2_: () => undefined,
          savePendingV2_: () => 'pending-file',
          sendOperationalAlertV2_: () => undefined,
          console: { error: () => undefined },
        },
      );

      expect({ label, result: scheduler() }).toMatchObject({ label, result: { ok: true, stage: 'idle' } });
      expect(events).toEqual([]);
    });
  });

  it('does not send, mark sent, or record history for a prior-date scheduled job', () => {
    const events: string[] = [];
    let nowCalls = 0;
    class SchedulerDate extends Date {
      static now() {
        nowCalls += 1;
        return nowCalls === 1 ? 0 : 300_000;
      }
    }
    const priorPending = Object.assign(sendablePendingFixture(), { planners: persistedPlannersFixture() });
    priorPending.localDate = '2026-07-14';
    priorPending.weather.localDate = '2026-07-14';
    priorPending.bundle.localDate = '2026-07-14';
    priorPending.bundle.weather.localDate = '2026-07-14';
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['JobState.gs', 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: SchedulerDate,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => { events.push(`set:${key}`); },
        }),
        getBooleanPropertyV2_: () => false,
        mergeEmailFeedbackIntoHistoryV2_: () => { events.push('history-merge'); },
        loadJobStateV2_: () => ({
          stage: 'bundle-ready',
          qualityPolicyVersion: 4,
          localDate: '2026-07-14',
          wardrobeFingerprint: 'wardrobe-v3',
          attemptCounts: {},
        }),
        loadPendingV2_: () => structuredClone(priorPending),
        sendDailyBundleNowV2_: () => { events.push('mail'); },
        recordSentBundleV2_: () => { events.push('record'); },
        saveJobStateV2_: () => undefined,
        savePendingV2_: () => 'pending-file',
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toMatchObject({ ok: true, stage: 'idle' });
    expect(events).toEqual([]);
  });

  it('requires matching current-policy pending and bundle dates and fingerprints', () => {
    const validator = evaluateAppsScript<((pending: unknown, bundle: unknown) => boolean) | null>(
      ['JobState.gs'],
      "(typeof validCurrentBundleV2_ === 'function' ? validCurrentBundleV2_ : null)",
      { DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes } },
    );
    expect(validator).toBeTypeOf('function');
    if (!validator) return;

    const pending = currentPendingFixture();
    const bundle = {
      qualityPolicyVersion: 4,
      localDate: pending.localDate,
      wardrobeFingerprint: pending.wardrobeFingerprint,
    };
    expect(validator(pending, bundle)).toBe(true);
    expect(validator(pending, { ...bundle, qualityPolicyVersion: 3 })).toBe(false);
    expect(validator(pending, { ...bundle, localDate: '2026-07-14' })).toBe(false);
    expect(validator(pending, { ...bundle, wardrobeFingerprint: 'other-wardrobe' })).toBe(false);
    expect(validator({ ...pending, localDate: 'tomorrow' }, { ...bundle, localDate: 'tomorrow' })).toBe(false);
    expect(validator(Object.create(pending), bundle)).toBe(false);
  });

  it('rejects a structurally valid policy-v4 pending object at runtime policy version 5', () => {
    const validator = evaluateAppsScript<(pending: unknown, localDate: string, wardrobeFingerprint: string) => boolean>(
      ['JobState.gs'],
      'validCurrentPendingV2_',
      { DAILY_V2: { QUALITY_POLICY_VERSION: 5, ARCHETYPES: dailyArchetypes } },
    );
    const pending = currentPendingFixture();

    expect(validator(pending, pending.localDate, pending.wardrobeFingerprint)).toBe(false);
  });

  it('rejects persisted planner and replan candidates that do not resolve exactly to the current snapshot', () => {
    const valid = currentPendingFixture();
    const validSnapshot = persistedSnapshotFixture(valid);
    expect(() => deterministicSelectionGuard(valid, valid.localDate, valid.wardrobeFingerprint, validSnapshot)).not.toThrow();

    const invented = structuredClone(valid);
    [invented.planners[0].candidates[0], invented.candidates[0], invented.selectedCandidates[0]].forEach(candidate => {
      candidate.topId = 'invented-top';
      candidate.itemIds[0] = 'invented-top';
    });
    expect(() => deterministicSelectionGuard(invented, invented.localDate, invented.wardrobeFingerprint, validSnapshot))
      .toThrowError('Deterministic selection must be ready');

    const wrongSlot = persistedSnapshotFixture(valid);
    const wrongSlotItem = wrongSlot.items.find(item => item.id === valid.candidates[1].bottomId);
    if (!wrongSlotItem) throw new Error('fixture item is missing');
    wrongSlotItem.slot = 'top';
    expect(() => deterministicSelectionGuard(valid, valid.localDate, valid.wardrobeFingerprint, wrongSlot))
      .toThrowError('Deterministic selection must be ready');

    const invalidProfile = persistedSnapshotFixture(valid);
    const invalidProfileItem = invalidProfile.items.find(item => item.id === valid.candidates[2].topId);
    if (!invalidProfileItem) throw new Error('fixture item is missing');
    delete (invalidProfileItem.profile as Record<string, unknown>).breathability;
    expect(() => deterministicSelectionGuard(valid, valid.localDate, valid.wardrobeFingerprint, invalidProfile))
      .toThrowError('Deterministic selection must be ready');

    const invalidReplan = structuredClone(valid);
    const replanAddition = persistedPlannerCandidateFixture('easy', 5);
    replanAddition.topId = 'invented-replan-top';
    replanAddition.itemIds[0] = 'invented-replan-top';
    invalidReplan.candidates.push(replanAddition);
    invalidReplan.critic.scores.push({
      ...structuredClone(invalidReplan.critic.scores[0]),
      candidateId: replanAddition.candidateId,
    });
    invalidReplan.selection.path = 'replan-1';
    invalidReplan.selection.replannedArchetypes = ['easy'];
    invalidReplan.selection.eligibleCountByArchetype.easy = 6;
    invalidReplan.selection.compositeById[replanAddition.candidateId] = allNineComposite;
    expect(() => deterministicSelectionGuard(
      invalidReplan,
      invalidReplan.localDate,
      invalidReplan.wardrobeFingerprint,
      persistedSnapshotFixture(valid),
    )).toThrowError('Deterministic selection must be ready');
  });

  it('recomputes every persisted selection total, winner, path, and replan summary exactly', () => {
    const valid = currentPendingFixture();
    const snapshotValue = persistedSnapshotFixture(valid);
    expect(() => deterministicSelectionGuard(valid, valid.localDate, valid.wardrobeFingerprint, snapshotValue)).not.toThrow();

    const invalids = [
      { label: 'eligible count', mutate: (pending: typeof valid) => { pending.selection.eligibleCountByArchetype.easy -= 1; } },
      { label: 'composite value', mutate: (pending: typeof valid) => { pending.selection.compositeById[pending.candidates[0].candidateId] = 123; } },
      { label: 'feasible count', mutate: (pending: typeof valid) => { pending.selection.feasibleSetCount += 1; } },
      { label: 'winner', mutate: (pending: typeof valid) => { pending.selectedCandidates[0] = structuredClone(pending.candidates[1]); } },
      { label: 'path', mutate: (pending: typeof valid) => { pending.selection.path = 'top3'; } },
      { label: 'replans', mutate: (pending: typeof valid) => {
        pending.selection.path = 'replan-1';
        pending.selection.replannedArchetypes = ['easy'];
      } },
    ];
    invalids.forEach(({ label, mutate }) => {
      const pending = structuredClone(valid);
      mutate(pending);
      expect({ label, run: () => deterministicSelectionGuard(
        pending,
        pending.localDate,
        pending.wardrobeFingerprint,
        snapshotValue,
      ) }).toMatchObject({ label });
      expect(() => deterministicSelectionGuard(pending, pending.localDate, pending.wardrobeFingerprint, snapshotValue))
        .toThrowError('Deterministic selection must be ready');
    });
  });

  it.each([
    [['easy', 'expressive'], 2, ['polished-casual']],
    [['expressive'], 1, ['easy', 'polished-casual']],
  ] as const)('replays a duplicate-only partial selection for %j', (selected, count, omitted) => {
    const { pending, snapshot: snapshotValue } = persistedDuplicateOnlyPartialFixture([...selected]);
    expect(pending.replanRounds.map(round => round.targetArchetype))
      .toEqual([pending.replanRounds[0].targetArchetype, pending.replanRounds[0].targetArchetype]);
    expect(pending.replanRounds[0].acceptedCandidateIds).toEqual([]);
    expect(pending.selection).toMatchObject({
      deliveryMode: 'partial',
      selectedCount: count,
      selectedArchetypes: [...selected],
      omittedArchetypes: [...omitted],
      path: 'replan-2',
    });
    expect(policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toBe(pending);
  });

  it.each(ledgerTamperCases)('rejects ledger tampering: %s', (_label, mutate) => {
    const { pending, snapshot: snapshotValue } = persistedDuplicateOnlyPartialFixture();
    mutate(pending);
    expect(() => policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toThrow('Deterministic selection must be ready');
  });

  it('rejects ledger rounds appended after an initial bounded winner', () => {
    const pending = currentPendingFixture();
    pending.qualityPolicyVersion = 4;
    const easy = pending.planners.find(value => value.archetype === 'easy');
    if (!easy) throw new Error('fixture easy planner is missing');
    pending.replanRounds = ([1, 2] as const).map(round => {
      const returnedCandidates = easy.candidates.map((candidateValue, index) => ({
        ...structuredClone(candidateValue),
        candidateId: `easy-false-round-${round}-${index}`,
      }));
      return {
        round,
        targetArchetype: 'easy',
        structurallyValid: true,
        returnedCandidates,
        acceptedCandidateIds: [] as string[],
        duplicateCandidateIds: returnedCandidates.map(candidateValue => candidateValue.candidateId),
      };
    });
    const snapshotValue = persistedSnapshotFixture(pending);
    expect(() => policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toThrow('Deterministic selection must be ready');
  });

  it('replays a complete trio found only by the post-round-two exhaustive search', () => {
    const { pending, snapshot: snapshotValue } = persistedExhaustiveTrioFixture();
    expect(pending.selectedCandidates.map(candidateValue => candidateValue.candidateId))
      .toContain('polished-casual-candidate-13');
    expect(policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toBe(pending);
  });

  it('resumes an exact-three selection with one eligible candidate per archetype', () => {
    const pending = currentPendingFixture();
    dailyArchetypes.forEach((_archetype, groupIndex) => {
      for (let offset = 1; offset <= 4; offset += 1) {
        const score = pending.critic.scores[groupIndex * 5 + offset];
        score.disqualified = true;
        score.criticalDefects = ['fixture leaves one eligible candidate'];
      }
    });
    const snapshotValue = persistedSnapshotFixture(pending);
    recomputePersistedSelectionFixture(pending, snapshotValue);

    expect(pending.selection.eligibleCountByArchetype).toEqual({
      easy: 1,
      'polished-casual': 1,
      expressive: 1,
    });
    expect(policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toBe(pending);
  });

  it('persists the exact-manual-trio policy without reviving the legacy two-core ban', () => {
    const pending = currentPendingFixture();
    const snapshotValue = persistedSnapshotFixture(pending);
    const selected = pending.selectedCandidates[0];
    snapshotValue.tasteExamples = [{
      id: 'transformed-manual',
      name: 'Transformed manual save',
      itemIds: [selected.topId, selected.bottomId, pending.selectedCandidates[1].shoeId],
      createdAt: 1,
    }];

    expect(() => policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).not.toThrow();

    const exactSnapshot = structuredClone(snapshotValue);
    exactSnapshot.tasteExamples = [{
      id: 'exact-manual',
      name: 'Exact manual save',
      itemIds: selected.itemIds.slice(),
      createdAt: 1,
    }];
    expect(() => policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      exactSnapshot,
    )).toThrowError('Deterministic selection must be ready');
  });

  it('accepts set-equal candidate item ids across planner, selection, and persisted winner representations', () => {
    const pending = currentPendingFixture();
    const candidateId = pending.selectedCandidates[0].candidateId;
    const plannerCandidate = pending.planners[0].candidates.find(value => value.candidateId === candidateId);
    const universeCandidate = pending.candidates.find(value => value.candidateId === candidateId);
    if (!plannerCandidate || !universeCandidate) throw new Error('fixture candidate graph is disconnected');
    const [topId, bottomId, shoeId] = plannerCandidate.itemIds;
    plannerCandidate.itemIds = [shoeId, topId, bottomId];
    universeCandidate.itemIds = [bottomId, shoeId, topId];
    pending.selectedCandidates[0].itemIds = [shoeId, bottomId, topId];
    const snapshotValue = persistedSnapshotFixture(pending);

    expect(() => policyConsistentSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).not.toThrow();
  });

  it('guards persisted selections structurally while supporting opaque prototype-key ids and valid replans', () => {
    const guard = deterministicSelectionGuard;
    const valid = currentPendingFixture();
    rewriteSelectedOpaqueIds(valid);
    const validSnapshot = persistedSnapshotFixture(valid);
    alignPendingEasyAnchor(valid, validSnapshot, valid.selectedCandidates[0].shoeId);
    expect(() => guard(valid, valid.localDate, valid.wardrobeFingerprint, validSnapshot)).not.toThrow();

    const { pending: validReplan, snapshot: replanSnapshot } = persistedReplanFixture(1);
    expect(deterministicSelectionSelectors.finalists(
      validReplan.candidates.slice(0, 15),
      validReplan.critic.scores.slice(0, 15),
      replanSnapshot,
      validReplan.weather,
      validReplan.history,
    ).needsReplan).toBe('easy');
    expect(() => guard(
      validReplan,
      validReplan.localDate,
      validReplan.wardrobeFingerprint,
      replanSnapshot,
    )).not.toThrow();

    const invalids: unknown[] = [];
    invalids.push({ ...structuredClone(valid), qualityPolicyVersion: 3 });

    const emptySelection = structuredClone(valid);
    emptySelection.selectedCandidates = [];
    invalids.push(emptySelection);

    const emptyCandidateId = structuredClone(valid);
    emptyCandidateId.selectedCandidates[0].candidateId = '';
    invalids.push(emptyCandidateId);

    const duplicateCandidate = structuredClone(valid);
    duplicateCandidate.selectedCandidates[1].candidateId = duplicateCandidate.selectedCandidates[0].candidateId;
    invalids.push(duplicateCandidate);

    const duplicateArchetype = structuredClone(valid);
    duplicateArchetype.selectedCandidates[1].archetype = duplicateArchetype.selectedCandidates[0].archetype;
    invalids.push(duplicateArchetype);

    const emptyCritic = structuredClone(valid);
    emptyCritic.critic = {} as typeof emptyCritic.critic;
    invalids.push(emptyCritic);

    const emptyScores = structuredClone(valid);
    emptyScores.critic.scores = [];
    invalids.push(emptyScores);

    const duplicateScore = structuredClone(valid);
    duplicateScore.critic.scores.push(structuredClone(duplicateScore.critic.scores[0]));
    invalids.push(duplicateScore);

    const missingScore = structuredClone(valid);
    missingScore.critic.scores.pop();
    invalids.push(missingScore);

    const malformedScore = structuredClone(valid);
    malformedScore.critic.scores[0].criticalDefects = [9] as unknown as string[];
    invalids.push(malformedScore);

    const inheritedCandidate = structuredClone(valid);
    inheritedCandidate.selectedCandidates[0] = Object.create(inheritedCandidate.selectedCandidates[0]);
    invalids.push(inheritedCandidate);

    const inheritedScore = structuredClone(valid);
    inheritedScore.critic.scores[0] = Object.create(inheritedScore.critic.scores[0]);
    invalids.push(inheritedScore);

    const inheritedItemId = structuredClone(valid);
    const inheritedItemIds = inheritedItemId.selectedCandidates[0].itemIds;
    const inheritedTopId = inheritedItemIds[0];
    delete inheritedItemIds[0];
    Object.setPrototypeOf(inheritedItemIds, Object.assign(Object.create(Array.prototype), { 0: inheritedTopId }));
    invalids.push(inheritedItemId);

    const sparseItemId = structuredClone(valid);
    delete sparseItemId.selectedCandidates[0].itemIds[0];
    invalids.push(sparseItemId);

    const inheritedComment = structuredClone(valid);
    inheritedComment.critic.scores[0].criticalDefects = new Array(1);
    Object.setPrototypeOf(inheritedComment.critic.scores[0].criticalDefects, Object.assign(Object.create(Array.prototype), { 0: 'inherited' }));
    invalids.push(inheritedComment);

    const noPlanners = structuredClone(valid) as Partial<typeof valid>;
    delete noPlanners.planners;
    invalids.push(noPlanners);

    const selectedOnlyUniverse = structuredClone(valid);
    selectedOnlyUniverse.candidates = structuredClone(selectedOnlyUniverse.selectedCandidates);
    invalids.push(selectedOnlyUniverse);

    const unknownScore = structuredClone(valid);
    unknownScore.critic.scores.push({ ...structuredClone(unknownScore.critic.scores[0]), candidateId: 'unknown-candidate' });
    invalids.push(unknownScore);

    const permutedSelected = structuredClone(valid);
    permutedSelected.selectedCandidates.reverse();
    invalids.push(permutedSelected);

    const changedSelectedRecord = structuredClone(valid);
    changedSelectedRecord.selectedCandidates[0].name = 'Changed persisted copy';
    invalids.push(changedSelectedRecord);

    const duplicateCombination = structuredClone(valid);
    const combinationSource = duplicateCombination.candidates[0];
    const combinationTarget = duplicateCombination.candidates[1];
    [combinationTarget, duplicateCombination.planners[0].candidates[1]].forEach(candidate => {
      candidate.topId = combinationSource.topId;
      candidate.bottomId = combinationSource.bottomId;
      candidate.shoeId = combinationSource.shoeId;
      candidate.itemIds = combinationSource.itemIds.slice();
    });
    invalids.push(duplicateCombination);

    const permutedPlanners = structuredClone(valid);
    permutedPlanners.planners.reverse();
    invalids.push(permutedPlanners);

    const sparsePlannerCandidates = structuredClone(valid);
    delete sparsePlannerCandidates.planners[0].candidates[0];
    invalids.push(sparsePlannerCandidates);

    const inheritedPlannerCandidate = structuredClone(valid);
    inheritedPlannerCandidate.planners[0].candidates[0] = Object.create(inheritedPlannerCandidate.planners[0].candidates[0]);
    invalids.push(inheritedPlannerCandidate);

    const sparseCandidateUniverse = structuredClone(valid);
    delete sparseCandidateUniverse.candidates[0];
    invalids.push(sparseCandidateUniverse);

    const inheritedCandidateUniverse = structuredClone(valid);
    inheritedCandidateUniverse.candidates[0] = Object.create(inheritedCandidateUniverse.candidates[0]);
    invalids.push(inheritedCandidateUniverse);

    const permutedCandidateUniverse = structuredClone(valid);
    [permutedCandidateUniverse.candidates[0], permutedCandidateUniverse.candidates[1]] =
      [permutedCandidateUniverse.candidates[1], permutedCandidateUniverse.candidates[0]];
    invalids.push(permutedCandidateUniverse);

    const sparseScores = structuredClone(valid);
    delete sparseScores.critic.scores[0];
    invalids.push(sparseScores);

    const permutedScores = structuredClone(valid);
    [permutedScores.critic.scores[0], permutedScores.critic.scores[1]] =
      [permutedScores.critic.scores[1], permutedScores.critic.scores[0]];
    invalids.push(permutedScores);

    const inconsistentReplan = structuredClone(valid);
    inconsistentReplan.selection.path = 'replan-1';
    inconsistentReplan.selection.replannedArchetypes = ['easy'];
    invalids.push(inconsistentReplan);

    invalids.forEach(value => {
      expect(() => guard(value, valid.localDate, valid.wardrobeFingerprint, validSnapshot))
        .toThrowError('Deterministic selection must be ready');
    });
  });

  it('rejects persisted replan additions after the initial selection already succeeds', () => {
    const pending = currentPendingFixture();
    Array.from({ length: 5 }, (_, offset) => persistedPlannerCandidateFixture('easy', offset + 5))
      .forEach(addition => {
        pending.candidates.push(addition);
        pending.critic.scores.push({
          ...structuredClone(pending.critic.scores[0]),
          candidateId: addition.candidateId,
        });
      });
    const snapshotValue = persistedSnapshotFixture(pending);
    recomputePersistedSelectionFixture(pending, snapshotValue, ['easy']);

    expect(() => deterministicSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toThrowError('Deterministic selection must be ready');
  });

  it('rejects a persisted round whose archetype differs from the intermediate replan request', () => {
    const { pending, snapshot: snapshotValue } = persistedReplanFixture(2);
    const initialCount = dailyArchetypes.length * 5;
    const easyRound = pending.candidates.slice(initialCount, initialCount + 5);
    const polishedRound = pending.candidates.slice(initialCount + 5);
    const initialScores = pending.critic.scores.slice(0, initialCount);
    const easyScores = pending.critic.scores.slice(initialCount, initialCount + 5);
    const polishedScores = pending.critic.scores.slice(initialCount + 5);
    pending.candidates = pending.candidates.slice(0, initialCount).concat(polishedRound, easyRound);
    pending.critic.scores = initialScores.concat(polishedScores, easyScores);
    pending.selection.replannedArchetypes = ['polished-casual', 'easy'];

    expect(() => deterministicSelectionGuard(
      pending,
      pending.localDate,
      pending.wardrobeFingerprint,
      snapshotValue,
    )).toThrowError('Deterministic selection must be ready');
  });

  it('preserves exact-recomputed top3 and two-round replan graphs', () => {
    const top3 = currentPendingFixture();
    const sharedTopId = 'cross-archetype-shared-top';
    [0, 1].forEach(candidateIndex => {
      [0, 1].forEach(plannerIndex => {
        const plannerCandidate = top3.planners[plannerIndex].candidates[candidateIndex];
        const universeCandidate = top3.candidates.find(candidate => candidate.candidateId === plannerCandidate.candidateId);
        if (!universeCandidate) throw new Error('top3 fixture graph is disconnected');
        [plannerCandidate, universeCandidate].forEach(candidate => {
          candidate.topId = sharedTopId;
          candidate.itemIds[0] = sharedTopId;
        });
      });
    });
    const top3Snapshot = persistedSnapshotFixture(top3);
    recomputePersistedSelectionFixture(top3, top3Snapshot);
    expect(top3.selection.path).toBe('top3');
    expect(() => deterministicSelectionGuard(top3, top3.localDate, top3.wardrobeFingerprint, top3Snapshot)).not.toThrow();

    const { pending: replan2, snapshot: replan2Snapshot } = persistedReplanFixture(2);
    expect(deterministicSelectionSelectors.finalists(
      replan2.candidates.slice(0, 15),
      replan2.critic.scores.slice(0, 15),
      replan2Snapshot,
      replan2.weather,
      replan2.history,
    ).needsReplan).toBe('easy');
    expect(deterministicSelectionSelectors.finalists(
      replan2.candidates.slice(0, 20),
      replan2.critic.scores.slice(0, 20),
      replan2Snapshot,
      replan2.weather,
      replan2.history,
    ).needsReplan).toBe('polished-casual');
    expect(replan2.selection.path).toBe('replan-2');
    expect(() => deterministicSelectionGuard(
      replan2,
      replan2.localDate,
      replan2.wardrobeFingerprint,
      replan2Snapshot,
    )).not.toThrow();
  });

  it('keeps critic-ready validation limited to ordered planners with exact initial score coverage', () => {
    const validateStage = evaluateAppsScript<(
      stage: string,
      pending: unknown,
      localDate: string,
      wardrobeFingerprint: string,
      snapshot: unknown,
    ) => boolean>(
      ['JobState.gs'],
      'validPersistedStagePrerequisitesV2_',
      { DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes } },
    );
    const planners = persistedPlannersFixture();
    const valid = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      weather: persistedWeatherFixture(),
      history: persistedHistoryFixture(),
      planners,
      critic: persistedCriticFixture(planners),
    };
    const args = [
      'critic-ready',
      '2026-07-15',
      'wardrobe-v3',
      persistedSnapshotFixture({
        wardrobeFingerprint: 'wardrobe-v3',
        candidates: planners.flatMap(response => response.candidates),
      }),
    ] as const;

    expect(validateStage(args[0], valid, args[1], args[2], args[3])).toBe(true);
    expect('candidates' in valid).toBe(false);
    expect('selectedCandidates' in valid).toBe(false);

    const permutedPlanners = structuredClone(valid);
    permutedPlanners.planners.reverse();
    expect(validateStage(args[0], permutedPlanners, args[1], args[2], args[3])).toBe(false);

    const missingScore = structuredClone(valid);
    missingScore.critic.scores.pop();
    expect(validateStage(args[0], missingScore, args[1], args[2], args[3])).toBe(false);

    const unknownScore = structuredClone(valid);
    unknownScore.critic.scores[0].candidateId = 'unknown-candidate';
    expect(validateStage(args[0], unknownScore, args[1], args[2], args[3])).toBe(false);

    const duplicatePlannerId = structuredClone(valid);
    duplicatePlannerId.planners[1].candidates[0].candidateId = duplicatePlannerId.planners[0].candidates[0].candidateId;
    expect(validateStage(args[0], duplicatePlannerId, args[1], args[2], args[3])).toBe(false);
  });

  it.each([
    ['malformed exact-outfit date', (history: ReturnType<typeof persistedHistoryFixture>) => {
      history.exactOutfitsPrevious14Days.push({
        localDate: 'not-a-date', archetype: 'easy', itemIds: ['shoe-0'],
      });
    }],
    ['impossible exact-outfit date', (history: ReturnType<typeof persistedHistoryFixture>) => {
      history.exactOutfitsPrevious14Days.push({
        localDate: '2026-02-30', archetype: 'easy', itemIds: ['shoe-0'],
      });
    }],
    ['malformed feedback date', (history: ReturnType<typeof persistedHistoryFixture>) => {
      history.feedback.push({
        localDate: 'not-a-date', value: 'liked', outfitName: 'Look', archetype: 'easy', items: ['shoe-0'],
      });
    }],
    ['impossible feedback date', (history: ReturnType<typeof persistedHistoryFixture>) => {
      history.feedback.push({
        localDate: '2026-02-30', value: 'wore', outfitName: 'Look', archetype: 'easy', items: ['shoe-0'],
      });
    }],
  ] as const)('fails closed on a %s during stage replay and shoe diagnostics', (_name, mutate) => {
    const pending = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'strict-history-dates',
      weather: persistedWeatherFixture(),
      history: persistedHistoryFixture(),
    };
    mutate(pending.history);
    const snapshotValue = {
      wardrobeFingerprint: pending.wardrobeFingerprint,
      items: [{
        id: 'shoe-0', shortLabel: 'S1', slot: 'shoes',
        profile: { available: true, excludedFromDaily: false },
      }],
    };
    const guards = evaluateAppsScript<{
      validPersistedHistoryV2_: (history: object) => boolean;
      validPersistedStagePrerequisitesV2_: (
        stage: string, pendingValue: object, localDate: string, wardrobeFingerprint: string, snapshot: object,
      ) => boolean;
      safeDailyShoeRotationProjectionV2_: (
        pendingValue: object, context: object, snapshot: object,
      ) => object | null;
    }>(
      ['ItemIndex.gs', 'ShoeRotation.gs', 'JobState.gs', 'Diagnostics.gs'],
      '({ validPersistedHistoryV2_, validPersistedStagePrerequisitesV2_, safeDailyShoeRotationProjectionV2_ })',
      { DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes } },
    );

    expect(guards.validPersistedHistoryV2_(pending.history)).toBe(false);
    expect(guards.validPersistedStagePrerequisitesV2_(
      'weather-ready', pending, pending.localDate, pending.wardrobeFingerprint, snapshotValue,
    )).toBe(false);
    expect(guards.safeDailyShoeRotationProjectionV2_(pending, {
      localDate: pending.localDate,
      wardrobeFingerprint: pending.wardrobeFingerprint,
    }, snapshotValue)).toBeNull();
  });

  it('makes full-bundle and standalone guards inherit the complete selection graph', () => {
    const pendingValue = sendablePendingFixture() as Partial<ReturnType<typeof sendablePendingFixture>>;
    delete pendingValue.planners;
    const snapshotValue = sendableSnapshotFixture();
    const fullBundle = evaluateAppsScript<(pending: unknown, snapshot: unknown, localDate: string) => boolean>(
      ['JobState.gs', 'FinalValidation.gs'],
      'validFullBundleReadyV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
        savedOutfitExactCopyV2_: () => null,
      },
    );
    expect(fullBundle(pendingValue, snapshotValue, '2026-07-15')).toBe(false);
    const validateStage = evaluateAppsScript<(
      stage: string,
      pending: unknown,
      localDate: string,
      wardrobeFingerprint: string,
      snapshot: unknown,
    ) => boolean>(
      ['JobState.gs'],
      'validPersistedStagePrerequisitesV2_',
      { DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes } },
    );
    expect(validateStage('selection-ready', pendingValue, '2026-07-15', 'wardrobe-v3', snapshotValue)).toBe(false);

    const events: string[] = [];
    const curator = evaluateAppsScript<() => unknown>(
      ['JobState.gs', 'Curator.gs'],
      'runCuratorV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        loadPendingV2_: () => structuredClone(pendingValue),
        loadSnapshotV2_: () => snapshotValue,
        assertFreshSnapshotV2_: () => snapshotValue,
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        applySnapshotSettingsV2_: (value: unknown) => value,
        localDateV2_: () => '2026-07-15',
        callGeminiV2_: () => { events.push('model'); return {}; },
        savePendingV2_: () => { events.push('save'); },
      },
    );
    expect(curator).toThrowError('Deterministic selection must be ready');
    expect(events).toEqual([]);
  });

  it('resets a malformed selection-ready resume to a persisted fresh idle job', () => {
    const pending = {
      ...currentPendingFixture(),
      weather: {},
      history: {},
      planners: dailyArchetypes.map(archetype => ({ archetype })),
    };
    pending.selectedCandidates = [];
    let curatorCalls = 0;
    const savedStates: Record<string, unknown>[] = [];
    let clockIndex = 0;
    const clock = [0, 1, 300_000];
    const advance = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown>; pending: unknown }>(
      ['JobState.gs', 'Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: { now: () => clock[clockIndex++] ?? 300_000 },
        loadPendingV2_: () => pending,
        incrementAttemptV2_: () => undefined,
        runCuratorV2_: () => { curatorCalls += 1; return { recommendations: [] }; },
        validateFinalBundleV2_: () => [],
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: () => ({ localDate: '2026-07-15' }),
        savePendingV2_: () => 'pending-file',
        saveJobStateV2_: (value: Record<string, unknown>) => {
          savedStates.push(structuredClone(value));
          return 'job-file';
        },
      },
    );
    const state = {
      stage: 'selection-ready',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      attemptCounts: {},
    };

    expect(advance(state, { wardrobeFingerprint: 'wardrobe-v3' }, 0)).toMatchObject({
      state: {
        stage: 'idle',
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
        attemptCounts: {},
      },
      pending: null,
    });
    expect(savedStates).toContainEqual(expect.objectContaining({
      stage: 'idle',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
    }));
    expect(curatorCalls).toBe(0);
  });

  it('resets every non-idle scheduled stage with obviously malformed prerequisites', () => {
    const basePending = {
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
    };
    const cases = [
      { stage: 'weather-ready', pending: { ...basePending, weather: [], history: {} } },
      { stage: 'planners-ready', pending: { ...basePending, weather: {}, history: {}, planners: {} } },
      { stage: 'critic-ready', pending: { ...basePending, weather: {}, history: {}, planners: [], critic: {} } },
      {
        stage: 'critic-ready',
        pending: {
          ...basePending,
          weather: {},
          history: {},
          planners: dailyArchetypes.map(archetype => ({ archetype })),
          critic: { scores: [] },
        },
      },
      {
        stage: 'bundle-ready',
        pending: {
          ...basePending,
          weather: {},
          history: {},
          planners: dailyArchetypes.map(archetype => ({ archetype })),
          critic: { scores: [{ candidateId: 'selected-easy' }] },
          bundle: {
            qualityPolicyVersion: 4,
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
          },
        },
      },
    ];

    cases.forEach(({ stage, pending }) => {
      const stageCalls: string[] = [];
      const savedStates: Record<string, unknown>[] = [];
      const advance = evaluateAppsScript<(
        state: Record<string, unknown>,
        snapshot: Record<string, unknown>,
        startedAt: number,
      ) => { state: Record<string, unknown>; pending: unknown }>(
        ['JobState.gs', 'Scheduler.gs'],
        'advanceDailyJobV2_',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
          Date: { now: () => 0 },
          loadPendingV2_: () => structuredClone(pending),
          incrementAttemptV2_: () => undefined,
          runAllPlannersV2_: () => { stageCalls.push('planners'); throw new Error('malformed pending was reused'); },
          runCriticV2_: () => { stageCalls.push('critic'); throw new Error('malformed pending was reused'); },
          runSelectionV2_: () => { stageCalls.push('selection'); throw new Error('malformed pending was reused'); },
          savePendingV2_: () => 'pending-file',
          saveJobStateV2_: (value: Record<string, unknown>) => {
            savedStates.push(structuredClone(value));
            return 'job-file';
          },
        },
      );

      const result = advance({
        stage,
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
        attemptCounts: {},
      }, { wardrobeFingerprint: 'wardrobe-v3' }, 0);
      expect({ stage, result: result.state.stage, stageCalls }).toEqual({ stage, result: 'idle', stageCalls: [] });
      expect(savedStates).toContainEqual(expect.objectContaining({
        stage: 'idle',
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: 'wardrobe-v3',
      }));
    });
  });

  it('resets a non-idle scheduled job whose attempt-count storage is malformed', () => {
    const savedStates: Record<string, unknown>[] = [];
    const advance = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown>; pending: unknown }>(
      ['JobState.gs', 'Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: { now: () => 0 },
        loadPendingV2_: () => ({
          qualityPolicyVersion: 4,
          localDate: '2026-07-15',
          wardrobeFingerprint: 'wardrobe-v3',
          weather: {},
          history: {},
        }),
        runAllPlannersV2_: () => { throw new Error('malformed state was reused'); },
        savePendingV2_: () => 'pending-file',
        saveJobStateV2_: (value: Record<string, unknown>) => {
          savedStates.push(structuredClone(value));
          return 'job-file';
        },
      },
    );

    const result = advance({
      stage: 'weather-ready',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      attemptCounts: null,
    }, { wardrobeFingerprint: 'wardrobe-v3' }, 0);
    expect(result).toMatchObject({ state: { stage: 'idle', attemptCounts: {} }, pending: null });
    expect(savedStates).toContainEqual(expect.objectContaining({ stage: 'idle', attemptCounts: {} }));
  });

  it('recovers malformed scheduled job JSON as a persisted current idle job', () => {
    const savedStates: Record<string, unknown>[] = [];
    let nowCalls = 0;
    class SchedulerDate extends Date {
      static now() {
        nowCalls += 1;
        return nowCalls === 1 ? 0 : 300_000;
      }
    }
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['JobState.gs', 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: SchedulerDate,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
        getBooleanPropertyV2_: () => false,
        mergeEmailFeedbackIntoHistoryV2_: () => undefined,
        loadJobStateV2_: () => { throw new Error('Unable to read JOB_STATE_FILE_ID_V2: private raw JSON'); },
        loadPendingV2_: () => { throw new Error('Unable to read PENDING_BUNDLE_FILE_ID_V2: private raw JSON'); },
        saveJobStateV2_: (value: Record<string, unknown>) => {
          savedStates.push(structuredClone(value));
          return 'job-file';
        },
        savePendingV2_: () => 'pending-file',
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toMatchObject({ ok: true, stage: 'idle' });
    expect(savedStates).toContainEqual(expect.objectContaining({
      stage: 'idle',
      qualityPolicyVersion: 4,
      localDate: '2026-07-15',
      wardrobeFingerprint: 'wardrobe-v3',
      attemptCounts: {},
    }));
  });

  it('recovers a manual non-idle resume from malformed pending JSON without reusing it', () => {
    let curatorCalls = 0;
    let persisted: unknown;
    const generate = evaluateAppsScript<() => { complete: boolean; stage: string }>(
      ['JobState.gs', 'Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
        mergeEmailFeedbackIntoHistoryV2_: () => undefined,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => { throw new Error('Unable to read PENDING_BUNDLE_FILE_ID_V2: raw persisted JSON'); },
        fetchDailyWeatherV2: () => ({ localDate: '2026-07-15' }),
        dailyHistoryContextV2_: () => ({}),
        runCuratorV2_: () => { curatorCalls += 1; return {}; },
        savePendingV2_: (value: unknown) => { persisted = value; return 'pending-file'; },
      },
    );

    expect(generate()).toEqual({ complete: false, stage: 'weather-ready', bundle: null });
    expect(curatorCalls).toBe(0);
    expect(persisted).toMatchObject({ qualityPolicyVersion: 4, manualStage: 'weather-ready' });
  });

  it('returns only safe selection diagnostics and stage attempt counts', () => {
    const privateId = 'private-wardrobe-id';
    const inheritedAttempts = { 'weather-ready': 99 };
    const attemptCounts = Object.assign(Object.create(inheritedAttempts), {
      'critic-ready': 2,
      'selection-ready-error': 1,
      unknown: 7,
      'bundle-ready': -1,
    });
    const state = {
      localDate: '2026-07-15',
      qualityPolicyVersion: 4,
      stage: 'selection-ready',
      startedAt: 100,
      updatedAt: 200,
      wardrobeFingerprint: privateId,
      bundleFileId: privateId,
      lastError: 'raw storage detail',
      candidates: [{ candidateId: privateId }],
      scores: [{ candidateId: privateId }],
      attemptCounts,
    };
    const pending = currentPendingFixture();
    pending.wardrobeFingerprint = privateId;
    dailyArchetypes.forEach((_archetype, groupIndex) => {
      for (let offset = 1; offset <= 4; offset += 1) {
        const score = pending.critic.scores[groupIndex * 5 + offset];
        score.disqualified = true;
        score.criticalDefects = ['fixture leaves one eligible candidate'];
      }
    });
    const currentSnapshot = {
      ...persistedSnapshotFixture(pending),
      generatedAt: Date.now(),
    };
    pending.wardrobeFingerprint = alignSnapshotEasyAnchor(
      currentSnapshot,
      pending.localDate,
      pending.history,
      pending.selectedCandidates[0].shoeId,
      privateId,
    );
    state.wardrobeFingerprint = pending.wardrobeFingerprint;
    recomputePersistedSelectionFixture(pending, currentSnapshot);
    const snapshotValidation = {
      ok: true,
      errors: [`item ${privateId} appears on 0 atlas pages`],
      generatedAt: 50,
      wardrobeFingerprint: privateId,
      itemCount: 42,
      atlasPageCount: 5,
      unknown: privateId,
    };
    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => currentSnapshot,
        validateStoredSnapshotV2: () => snapshotValidation,
        loadJobStateV2_: () => state,
        loadPendingV2_: () => pending,
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        applySnapshotSettingsV2_: (config: unknown) => config,
        localDateV2_: () => '2026-07-15',
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
      },
    );
    const result = diagnostics();
    expect(result.snapshot).toEqual({
      ok: true,
      generatedAt: 50,
      itemCount: 42,
      atlasPageCount: 5,
    });
    expect(result.snapshot).not.toBe(snapshotValidation);
    expect(result.job).toEqual({
      localDate: '2026-07-15',
      qualityPolicyVersion: 4,
      stage: 'selection-ready',
      startedAt: 100,
      updatedAt: 200,
    });
    expect(result.job).not.toBe(state);
    expect(result.selection).toEqual({
      deliveryMode: 'complete',
      selectedCount: 3,
      selectedArchetypes: dailyArchetypes,
      omittedArchetypes: [],
      path: 'top2',
      eligibleCountByArchetype: { easy: 1, 'polished-casual': 1, expressive: 1 },
      feasibleSetCount: 1,
      replannedArchetypes: [],
      replanRounds: [],
      extremeHeatPolishedCasualActive: false,
      bundleReadyValidationPassed: false,
      recommendationSelectionOrderMatches: false,
      coverageSelectionOrderMatches: false,
    });
    expect(result.attemptCounts).toEqual({ 'critic-ready': 2, 'selection-ready-error': 1 });
    expect(result.attemptCounts).not.toBe(attemptCounts);
    (result.attemptCounts as Record<string, number>)['critic-ready'] = 40;
    expect(attemptCounts['critic-ready']).toBe(2);
    (result.selection as { replannedArchetypes: string[] }).replannedArchetypes.push('expressive');
    expect(pending.selection.replannedArchetypes).toEqual([]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(privateId);
    expect(serialized).not.toContain('compositeById');
    expect(serialized).not.toContain('candidates');
    expect(serialized).not.toContain('scores');
    expect(serialized).not.toContain('raw storage detail');
    expect(serialized).not.toContain('bundleFileId');
  });

  it('projects only redacted coverage and boolean bundle parity for a ready bundle', () => {
    const pending = sendablePendingFixture();
    const snapshotValue = sendableSnapshotFixture();
    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['ItemIndex.gs', 'Taste.gs', 'FinalValidation.gs', 'Selection.gs', 'JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: dailySelectionRuntime,
        loadSnapshotV2_: () => snapshotValue,
        validateStoredSnapshotV2: () => ({ ok: true, generatedAt: 50, itemCount: 45, atlasPageCount: 5 }),
        loadJobStateV2_: () => ({
          localDate: pending.localDate,
          qualityPolicyVersion: 4,
          stage: 'bundle-ready',
          wardrobeFingerprint: pending.wardrobeFingerprint,
          attemptCounts: {},
        }),
        loadPendingV2_: () => pending,
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        applySnapshotSettingsV2_: (config: unknown) => config,
        localDateV2_: () => pending.localDate,
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
      },
    );

    const result = diagnostics();
    expect(result.selection).toMatchObject({
      deliveryMode: 'complete',
      selectedCount: 3,
      selectedArchetypes: dailyArchetypes,
      omittedArchetypes: [],
      bundleReadyValidationPassed: true,
      recommendationSelectionOrderMatches: true,
      coverageSelectionOrderMatches: true,
    });
    const serialized = JSON.stringify(result.selection);
    pending.selectedCandidates.forEach(candidateValue => {
      expect(serialized).not.toContain(candidateValue.candidateId);
    });
    expect(serialized).not.toContain('returnedCandidates');
    expect(serialized).not.toContain('scores');
  });

  it('projects redacted shoe-rotation diagnostics for a current pending bundle', () => {
    const pending = currentPendingFixture();
    pending.qualityPolicyVersion = 5;
    pending.history = {
      ...persistedHistoryFixture(),
      exactOutfitsPrevious14Days: [{
        localDate: '2026-07-14',
        itemIds: ['sneaker_0'],
        archetype: 'easy',
      }],
    };
    const snapshot = {
      wardrobeFingerprint: pending.wardrobeFingerprint,
      generatedAt: Date.now(),
      settings: {},
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `sneaker_${index}`,
        slot: 'shoes',
        shortLabel: `S${index + 1}`,
        profile: { available: true, excludedFromDaily: false },
      })),
    };
    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['ItemIndex.gs', 'ShoeRotation.gs', 'JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 5, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => snapshot,
        validateStoredSnapshotV2: () => ({ ok: true, generatedAt: 50, itemCount: 5, atlasPageCount: 1 }),
        loadJobStateV2_: () => null,
        loadPendingV2_: () => pending,
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        applySnapshotSettingsV2_: (config: unknown) => config,
        localDateV2_: () => pending.localDate,
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
      },
    );

    const result = diagnostics();
    expect(result.shoeRotation).toEqual({
      easyAnchorLabel: expect.stringMatching(/^S/),
      availableShoeCount: 5,
      freshShoeCount: 4,
      coolingDownShoeCount: 1,
      allowedGeneratedShoeCount: 4,
      fallbackUsed: false,
    });
    expect(JSON.stringify(result.shoeRotation)).not.toContain('sneaker_');
  });

  it('fails closed for truthy but incomplete shoe-rotation history', () => {
    const pending = currentPendingFixture();
    pending.qualityPolicyVersion = 5;
    pending.history = { exactOutfitsPrevious14Days: [] } as unknown as typeof pending.history;
    const snapshot = {
      wardrobeFingerprint: pending.wardrobeFingerprint,
      generatedAt: Date.now(),
      settings: {},
      items: [{
        id: 'sneaker_0',
        slot: 'shoes',
        shortLabel: 'S1',
        profile: { available: true, excludedFromDaily: false },
      }],
    };
    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['ItemIndex.gs', 'ShoeRotation.gs', 'JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 5, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => snapshot,
        validateStoredSnapshotV2: () => ({ ok: true, generatedAt: 50, itemCount: 1, atlasPageCount: 1 }),
        loadJobStateV2_: () => null,
        loadPendingV2_: () => pending,
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        applySnapshotSettingsV2_: (config: unknown) => config,
        localDateV2_: () => pending.localDate,
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
      },
    );

    expect(diagnostics().shoeRotation).toBeNull();
  });

  it('returns safe defaults when persisted diagnostics JSON is malformed', () => {
    const properties = {
      getProperty: (key: string) => key === 'DAILY_PLANNER_MODEL' ? 'configured' : null,
    };
    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => { throw new Error('Unable to read SNAPSHOT_FILE_ID_V2: private raw JSON'); },
        validateStoredSnapshotV2: () => { throw new Error('private snapshot validation detail'); },
        loadJobStateV2_: () => { throw new Error('Unable to read JOB_STATE_FILE_ID_V2: private raw JSON'); },
        loadPendingV2_: () => { throw new Error('Unable to read PENDING_BUNDLE_FILE_ID_V2: private raw JSON'); },
        getDailyPropertiesV2_: () => properties,
      },
    );

    expect(() => diagnostics()).not.toThrow();
    const result = diagnostics();
    expect(result).toMatchObject({
      snapshot: null,
      job: null,
      selection: null,
      attemptCounts: {},
      lastSentDate: null,
      modelsConfigured: {
        DAILY_PLANNER_MODEL: true,
        DAILY_CRITIC_MODEL: false,
        DAILY_CURATOR_MODEL: false,
        DAILY_REPAIR_MODEL: false,
      },
      snapshotAgeHours: null,
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('requires current policy, date, and wardrobe identity independently for job and selection diagnostics', () => {
    const validState = {
      localDate: '2026-07-15',
      qualityPolicyVersion: 4,
      stage: 'selection-ready',
      wardrobeFingerprint: 'wardrobe-v3-28',
      startedAt: 100,
      updatedAt: 200,
      attemptCounts: { 'selection-ready': 1 },
    };
    const validPending = currentPendingFixture();
    const validSnapshot = {
      ...persistedSnapshotFixture(validPending),
      generatedAt: Date.now(),
    };
    const runDiagnostics = (state: unknown, pending: unknown) => evaluateAppsScript<() => Record<string, unknown>>(
      ['JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => validSnapshot,
        validateStoredSnapshotV2: () => ({ ok: true, generatedAt: 50, itemCount: 42, atlasPageCount: 5 }),
        loadJobStateV2_: () => state,
        loadPendingV2_: () => pending,
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        applySnapshotSettingsV2_: (config: unknown) => config,
        localDateV2_: () => '2026-07-15',
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
      },
    )();

    [
      { ...validState, qualityPolicyVersion: 3 },
      { ...validState, localDate: '2026-07-14' },
      { ...validState, wardrobeFingerprint: 'wardrobe-stale' },
      Object.assign(Object.create({ qualityPolicyVersion: 4 }), {
        localDate: validState.localDate,
        stage: validState.stage,
        wardrobeFingerprint: validState.wardrobeFingerprint,
        attemptCounts: validState.attemptCounts,
      }),
    ].forEach(state => {
      const result = runDiagnostics(state, validPending);
      expect(result.job).toBeNull();
      expect(result.attemptCounts).toEqual({});
      expect(result.selection).not.toBeNull();
    });

    [
      { ...validPending, qualityPolicyVersion: 3 },
      { ...validPending, localDate: '2026-07-14' },
      { ...validPending, wardrobeFingerprint: 'wardrobe-stale' },
    ].forEach(pending => {
      const result = runDiagnostics(validState, pending);
      expect(result.job).not.toBeNull();
      expect(result.attemptCounts).toEqual({ 'selection-ready': 1 });
      expect(result.selection).toBeNull();
    });
  });

  it('returns null for an invalid snapshot-validation scalar shape', () => {
    const validValidation = { ok: true, generatedAt: 50, itemCount: 42, atlasPageCount: 5 };
    const invalidValidations = [
      { ...validValidation, ok: 'true' },
      { ...validValidation, generatedAt: -1 },
      { ...validValidation, itemCount: 42.5 },
      { ok: true, generatedAt: 50, itemCount: 42 },
    ];

    invalidValidations.forEach(validation => {
      const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
        ['JobState.gs', 'Diagnostics.gs'],
        'getDailyOutfitDiagnosticsV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadSnapshotV2_: () => null,
          validateStoredSnapshotV2: () => validation,
          loadJobStateV2_: () => null,
          loadPendingV2_: () => null,
          getDailyPropertiesV2_: () => ({ getProperty: () => null }),
        },
      );
      expect(diagnostics().snapshot).toBeNull();
    });
  });

  it('returns LAST_SENT_DATE_V2 only when it is a real ISO calendar date', () => {
    ['not-a-date', '2026-7-15', '2026-02-30', ''].forEach(lastSentDate => {
      const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
        ['JobState.gs', 'Diagnostics.gs'],
        'getDailyOutfitDiagnosticsV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadSnapshotV2_: () => null,
          validateStoredSnapshotV2: () => null,
          loadJobStateV2_: () => null,
          loadPendingV2_: () => null,
          getDailyPropertiesV2_: () => ({
            getProperty: (key: string) => key === 'LAST_SENT_DATE_V2' ? lastSentDate : null,
          }),
        },
      );
      expect(diagnostics().lastSentDate).toBeNull();
    });

    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['JobState.gs', 'Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        loadSnapshotV2_: () => null,
        validateStoredSnapshotV2: () => null,
        loadJobStateV2_: () => null,
        loadPendingV2_: () => null,
        getDailyPropertiesV2_: () => ({
          getProperty: (key: string) => key === 'LAST_SENT_DATE_V2' ? '2026-07-15' : null,
        }),
      },
    );
    expect(diagnostics().lastSentDate).toBe('2026-07-15');
  });

  it('rejects invalid or inherited selection diagnostics instead of copying them', () => {
    const inheritedReplan = new Array(1);
    Object.setPrototypeOf(inheritedReplan, Object.assign(Object.create(Array.prototype), { 0: 'easy' }));
    const invalidSelections = [
      { path: 'top4', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: [] },
      { path: 'top2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2 }, feasibleSetCount: 1, replannedArchetypes: [] },
      { path: 'top2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2, rawId: 2 }, feasibleSetCount: 1, replannedArchetypes: [] },
      { path: 'top2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 0, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: [] },
      { path: 'top2', eligibleCountByArchetype: { easy: 2.5, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: [] },
      { path: 'top2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: Number.NaN, replannedArchetypes: [] },
      { path: 'top2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 0, replannedArchetypes: [] },
      { path: 'top3', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: ['easy'] },
      { path: 'replan-1', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: [] },
      { path: 'replan-2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: ['easy'] },
      { path: 'replan-2', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: ['easy', 'easy'] },
      { path: 'replan-1', eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 }, feasibleSetCount: 1, replannedArchetypes: inheritedReplan },
      Object.assign(Object.create({ path: 'top2' }), {
        eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 },
        feasibleSetCount: 1,
        replannedArchetypes: [],
      }),
    ];

    invalidSelections.forEach(selection => {
      const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
        ['JobState.gs', 'Diagnostics.gs'],
        'getDailyOutfitDiagnosticsV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadSnapshotV2_: () => ({ generatedAt: Date.now(), wardrobeFingerprint: 'wardrobe-v3', settings: {} }),
          validateStoredSnapshotV2: () => ({ ok: true, generatedAt: 50, itemCount: 42, atlasPageCount: 5 }),
          loadJobStateV2_: () => null,
          loadPendingV2_: () => ({
            qualityPolicyVersion: 4,
            localDate: '2026-07-15',
            wardrobeFingerprint: 'wardrobe-v3',
            selection,
          }),
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (config: unknown) => config,
          localDateV2_: () => '2026-07-15',
          getDailyPropertiesV2_: () => ({ getProperty: () => null }),
        },
      );
      expect(diagnostics().selection).toBeNull();
    });
  });

  it('fails closed before standalone curation, repair, or validation can use stale or malformed pending state', () => {
    const stalePending = {
      ...currentPendingFixture(),
      qualityPolicyVersion: 3,
      curated: { recommendations: [] },
    };
    const pendingSources = [
      () => stalePending,
      () => ({ ...currentPendingFixture(), curated: { recommendations: [] } }),
      () => { throw new Error('Unable to read PENDING_BUNDLE_FILE_ID_V2: private raw JSON'); },
    ];

    pendingSources.forEach(loadPendingV2_ => {
      const snapshotValue = { wardrobeFingerprint: 'wardrobe-v3', settings: {} };
      const curator = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'Curator.gs'],
        'runCuratorV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadPendingV2_,
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
        },
      );
      const repair = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'Repair.gs'],
        'repairFinalBundleV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadPendingV2_,
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
        },
      );
      const validate = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'FinalValidation.gs'],
        'validateFinalBundleV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadPendingV2_,
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
        },
      );
      expect(curator).toThrowError('Deterministic selection must be ready');
      expect(repair).toThrowError('Deterministic selection must be ready');
      expect(validate).toThrowError('Deterministic selection must be ready');
    });
  });

  it('rejects stale-date and stale-fingerprint standalone selection consumers before any boundary or save', () => {
    const staleCases = [
      { label: 'date', mutate: (pending: ReturnType<typeof sendablePendingFixture>) => { pending.localDate = '2026-07-14'; } },
      { label: 'fingerprint', mutate: (pending: ReturnType<typeof sendablePendingFixture>) => { pending.wardrobeFingerprint = 'wardrobe-stale'; } },
    ];
    staleCases.forEach(({ label, mutate }) => {
      const pendingValue = sendablePendingFixture();
      Object.assign(pendingValue, { curated: { recommendations: structuredClone(pendingValue.bundle.recommendations) } });
      mutate(pendingValue);
      const snapshotValue = sendableSnapshotFixture();

      const curatorEvents: string[] = [];
      const curator = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'Curator.gs'],
        'runCuratorV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadPendingV2_: () => structuredClone(pendingValue),
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          selectionScoreMapV2_: (scores: Array<{ candidateId: string }>) => Object.fromEntries(scores.map(score => [score.candidateId, score])),
          modelWeatherViewV2_: () => ({}),
          modelFacingHistoryV2_: () => ({}),
          historyGuidanceV2_: () => '',
          modelFacingCandidatesV2_: (value: unknown) => value,
          modelFacingCriticResponseV2_: (value: unknown) => value,
          candidateImagePartsV2_: () => [],
          callGeminiV2_: () => { curatorEvents.push('model'); return {}; },
          resolveLabelsV2_: (value: unknown) => value,
          savePendingV2_: () => { curatorEvents.push('save'); },
        },
      );
      expect({ label, run: curator }).toMatchObject({ label });
      expect(curator).toThrowError('Deterministic selection must be ready');
      expect(curatorEvents).toEqual([]);

      const repairEvents: string[] = [];
      const repair = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'Repair.gs'],
        'repairFinalBundleV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadPendingV2_: () => structuredClone(pendingValue),
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          validateFinalBundleV2_: () => { repairEvents.push('validation'); return []; },
          callGeminiV2_: () => { repairEvents.push('model'); return {}; },
          savePendingV2_: () => { repairEvents.push('save'); },
        },
      );
      expect(repair).toThrowError('Deterministic selection must be ready');
      expect(repairEvents).toEqual([]);

      const validationEvents: string[] = [];
      const validate = evaluateAppsScript<() => unknown>(
        ['JobState.gs', 'FinalValidation.gs'],
        'validateFinalBundleV2',
        {
          DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
          loadPendingV2_: () => structuredClone(pendingValue),
          loadSnapshotV2_: () => snapshotValue,
          assertFreshSnapshotV2_: () => snapshotValue,
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          itemMapV2_: () => { validationEvents.push('validation'); return {}; },
        },
      );
      expect(validate).toThrowError('Deterministic selection must be ready');
      expect(validationEvents).toEqual([]);
    });
  });

  it('defines the critic as a score-only contract', () => {
    expect(Object.keys(criticApi.schema.properties)).toEqual(['scores']);
    expect(criticApi.schema.required).toEqual(['scores']);
  });

  it('accepts honest below-floor critic scores when every candidate is scored once', () => {
    const candidates = [{ candidateId: 'easy-1', archetype: 'easy' }];
    const response = {
      scores: [{
        candidateId: 'easy-1', weather: 4, palette: 5, colorIntent: 3, silhouette: 5,
        formality: 5, visualInterest: 4, wearability: 6, freshness: 4, archetypeFit: 5,
        disqualified: true, criticalDefects: ['weather'], reservations: []
      }]
    };
    expect(criticValidator(response, candidates)).toEqual([]);
  });

  it('validates any candidate count structurally and fails closed on duplicate or malformed ids', () => {
    const candidates = Array.from({ length: 4 }, (_, index) => ({ candidateId: `c${index}`, archetype: 'easy' }));
    const scores = candidates.map(({ candidateId }) => ({
      candidateId, weather: 9, palette: 8, colorIntent: 8, silhouette: 8, formality: 8,
      visualInterest: 8, wearability: 8, freshness: 8, archetypeFit: 8,
      disqualified: false, criticalDefects: [], reservations: []
    }));
    expect(criticValidator({ scores }, candidates)).toEqual([]);
    expect(criticValidator({ scores }, [candidates[0], candidates[0]]).join(' ')).toMatch(/duplicate candidateId/);
    expect(criticValidator({ scores: [scores[0], scores[0]] }, [candidates[0]]).join(' ')).toMatch(/scored candidate twice|exactly once/);
    expect(criticValidator({ scores: [{ ...scores[0], disqualified: 'false' }] }, [candidates[0]]).join(' ')).toMatch(/disqualified.*boolean/);
    expect(() => criticValidator({ scores: [null] }, [candidates[0]])).not.toThrow();
  });

  it.each([1, 2, 3])('accepts an exact %i-look final payload', count => {
    const fixture = finalPolicyFixture();
    fixture.selected = fixture.selected.slice(0, count);
    fixture.curated.recommendations = fixture.curated.recommendations.slice(0, count);
    const selectedArchetypes = fixture.selected.map(candidate => candidate.archetype);
    fixture.selection = {
      ...fixture.selection,
      deliveryMode: count === 3 ? 'complete' : 'partial',
      selectedCount: count,
      selectedArchetypes,
      omittedArchetypes: dailyArchetypes.filter(archetype => !selectedArchetypes.includes(archetype)),
    };
    expect(finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    )).toEqual([]);
  });

  it('rejects final shoes outside the generated rotation pool and an Easy anchor mismatch', () => {
    const fixture = finalPolicyFixture();
    fixture.history.exactOutfitsPrevious14Days.push({
      localDate: '2026-07-14',
      itemIds: ['historical-top', 'historical-bottom', fixture.selected[0].shoeId],
      archetype: 'easy',
    });
    const errors = finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    );
    expect(errors).toContain('recommendation[0] uses a shoe outside the daily rotation pool');
    expect(errors).toContain('recommendation[0] does not use the daily Easy shoe anchor');
  });

  it('rejects mismatched partial coverage, order, identity, count, and unnecessary shoe reuse', () => {
    const base = finalPolicyFixture();
    const fixture = finalPolicyFixture();
    fixture.selected = fixture.selected.slice(0, 2);
    fixture.curated.recommendations = fixture.curated.recommendations.slice(0, 2);
    const selectedArchetypes = fixture.selected.map(candidate => candidate.archetype);
    fixture.selection = {
      ...fixture.selection,
      deliveryMode: 'partial',
      selectedCount: 2,
      selectedArchetypes,
      omittedArchetypes: dailyArchetypes.filter(archetype => !selectedArchetypes.includes(archetype)),
    };
    const validate = (value = fixture) => finalValidator(
      value.curated,
      value.snapshot,
      value.weather,
      value.history,
      value.selected,
      value.critic,
      value.selection,
    );

    const oneRecommendation = structuredClone(fixture);
    oneRecommendation.curated.recommendations = oneRecommendation.curated.recommendations.slice(0, 1);
    expect(validate(oneRecommendation)).toContain('final recommendation count must equal selected candidate count');

    const threeRecommendations = structuredClone(fixture);
    threeRecommendations.curated.recommendations.push(structuredClone(base.curated.recommendations[2]));
    expect(validate(threeRecommendations)).toContain('final recommendation count must equal selected candidate count');

    const reversedSelected = structuredClone(fixture);
    reversedSelected.selected.reverse();
    expect(validate(reversedSelected).length).toBeGreaterThan(0);

    const duplicateArchetype = structuredClone(fixture);
    duplicateArchetype.selected[1].archetype = duplicateArchetype.selected[0].archetype;
    expect(validate(duplicateArchetype).length).toBeGreaterThan(0);

    const swappedSelectionOrder = structuredClone(fixture);
    swappedSelectionOrder.selection.selectedArchetypes.reverse();
    expect(validate(swappedSelectionOrder).length).toBeGreaterThan(0);

    const changedCandidateId = structuredClone(fixture);
    changedCandidateId.curated.recommendations[0].candidateId = 'changed-candidate';
    expect(validate(changedCandidateId).length).toBeGreaterThan(0);

    const changedOmission = structuredClone(fixture);
    changedOmission.selection.omittedArchetypes[0] = 'easy';
    expect(validate(changedOmission).length).toBeGreaterThan(0);

    const repeatedShoe = structuredClone(fixture);
    const retainedShoeId = repeatedShoe.selected[0].shoeId;
    const replacedShoeId = repeatedShoe.selected[1].shoeId;
    repeatedShoe.selected[1].shoeId = retainedShoeId;
    repeatedShoe.selected[1].itemIds = repeatedShoe.selected[1].itemIds
      .map(id => id === replacedShoeId ? retainedShoeId : id);
    repeatedShoe.curated.recommendations[1].itemIds = repeatedShoe.curated.recommendations[1].itemIds
      .map(id => id === replacedShoeId ? retainedShoeId : id);
    expect(validate(repeatedShoe)).toContain('shoes must be unique when enough available options exist');
    repeatedShoe.snapshot.items.forEach(item => {
      if (item.slot === 'shoes' && item.id !== retainedShoeId) {
        item.profile = { ...item.profile, available: false };
      }
    });
    expect(validate(repeatedShoe)).not.toContain('shoes must be unique when enough available options exist');
  });

  it.each([1, 2, 3])('persists exact coverage for a %i-look bundle', count => {
    const fixture = finalPolicyFixture();
    fixture.selected = fixture.selected.slice(0, count);
    fixture.curated.recommendations = fixture.curated.recommendations.slice(0, count);
    const selectedArchetypes = fixture.selected.map(candidate => candidate.archetype);
    fixture.selection = {
      ...fixture.selection,
      deliveryMode: count === 3 ? 'complete' : 'partial',
      selectedCount: count,
      selectedArchetypes,
      omittedArchetypes: dailyArchetypes.filter(archetype => !selectedArchetypes.includes(archetype)),
    };
    const buildBundle = evaluateAppsScript<(
      curated: object,
      snapshotValue: object,
      weatherValue: object,
      historyValue: object,
      selection: typeof fixture.selection,
    ) => { coverage: object }>(
      ['JobState.gs'],
      'buildBundleV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4, ARCHETYPES: dailyArchetypes },
        newRunIdV2_: () => 'run-id',
      },
    );
    expect(buildBundle(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selection,
    ).coverage).toEqual({
      deliveryMode: fixture.selection.deliveryMode,
      selectedArchetypes: fixture.selection.selectedArchetypes,
      omittedArchetypes: fixture.selection.omittedArchetypes,
    });
  });

  it('passes every generated shoe to Encore as a same-day exclusion', () => {
    const exclusions: unknown[][] = [];
    const buildBundle = evaluateAppsScript<(
      curated: object,
      snapshotValue: object,
      weatherValue: object,
      historyValue: object,
      selection: object,
    ) => object>(
      ['ShoeRotation.gs', 'JobState.gs'],
      'buildBundleV2_',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 4 },
        newRunIdV2_: () => 'run-id',
        selectEncoreForBundleV2_: (_snapshot: object, _weather: object, _history: object, excludedShoeIds: unknown[]) => {
          exclusions.push(excludedShoeIds);
          return null;
        },
      },
    );
    const bundleSnapshot = {
      generatedAt: 100,
      wardrobeFingerprint: 'wardrobe-v3',
      items: [
        { id: 'top', slot: 'top' },
        { id: 'shoe', slot: 'shoes' },
        { id: 'shoe-2', slot: 'shoes' },
      ],
    };
    const selection = {
      deliveryMode: 'complete',
      selectedArchetypes: ['easy', 'polished-casual', 'expressive'],
      omittedArchetypes: [],
    };

    buildBundle({
      recommendations: [
        { itemIds: ['top', 'shoe'] },
        { itemIds: ['top', 'shoe-2'] },
        { itemIds: ['top'] },
      ],
    }, bundleSnapshot, { localDate: '2026-07-15' }, {}, selection);

    expect(exclusions).toEqual([['shoe', 'shoe-2']]);
  });

  it('uses the deterministic usable-shoe threshold and permits necessary reuse without a legacy setting', () => {
    const fixture = finalPolicyFixture();
    const sharedShoeId = fixture.selected[0].shoeId;
    const unavailableShoeId = fixture.selected[1].shoeId;
    const thirdSelectedShoeId = fixture.selected[2].shoeId;
    fixture.selected[1].shoeId = sharedShoeId;
    fixture.selected[1].itemIds = fixture.selected[1].itemIds.map(id => id === unavailableShoeId ? sharedShoeId : id);
    fixture.curated.recommendations[1].itemIds = fixture.curated.recommendations[1].itemIds
      .map(id => id === unavailableShoeId ? sharedShoeId : id);
    const retainedShoes = new Set([sharedShoeId, unavailableShoeId, thirdSelectedShoeId]);
    fixture.snapshot.items = fixture.snapshot.items.filter(item => item.slot !== 'shoes' || retainedShoes.has(item.id));
    const unavailable = fixture.snapshot.items.find(item => item.id === unavailableShoeId);
    if (!unavailable) throw new Error('fixture unavailable shoe is missing');
    unavailable.profile = { ...unavailable.profile, available: false };
    alignSnapshotEasyAnchor(
      fixture.snapshot,
      fixture.weather.localDate,
      fixture.history,
      sharedShoeId,
      'limited-shoe-fixture',
    );

    expect(deterministicCandidateSetErrors(fixture.selected, fixture.snapshot, fixture.weather)).toEqual([]);
    expect(finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    )).toEqual([]);
  });

  it('uses the deterministic credible-layer predicate for required-weather layer reuse', () => {
    const fixture = finalPolicyFixture();
    const repeatedLayerId = 'credible-layer';
    [0, 1].forEach(index => {
      (fixture.selected[index] as typeof fixture.selected[number] & { layerId?: string }).layerId = repeatedLayerId;
      fixture.selected[index].itemIds.push(repeatedLayerId);
      fixture.curated.recommendations[index].itemIds.push(repeatedLayerId);
    });
    fixture.snapshot.items.push(
      {
        id: repeatedLayerId,
        slot: 'layer',
        category: 'Jackets',
        profile: { warmth: 2, available: true, excludedFromDaily: false },
      } as unknown as typeof fixture.snapshot.items[number],
      {
        id: 'incomplete-layer',
        slot: 'layer',
        category: 'Jackets',
        profile: { available: true, excludedFromDaily: false },
      } as unknown as typeof fixture.snapshot.items[number],
    );
    fixture.weather.layerGuidance = 'required';

    expect(deterministicCandidateSetErrors(fixture.selected, fixture.snapshot, fixture.weather)).toEqual([]);
    expect(finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    )).toEqual([]);
  });

  it('keeps final exact-history identity injective for opaque ids containing delimiters', () => {
    const fixture = finalPolicyFixture();
    const sorted = fixture.selected[0].itemIds.slice().sort();
    fixture.history.exactOutfitsPrevious14Days = [{
      localDate: '2026-07-14',
      archetype: 'easy',
      itemIds: [`${sorted[0]}|${sorted[1]}`, sorted[2]],
    }];

    expect(finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    )).toEqual([]);

    fixture.history.exactOutfitsPrevious14Days[0].itemIds = fixture.selected[0].itemIds.slice().reverse();
    expect(finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    ).join(' ')).toMatch(/exactly repeats a prior-14-day outfit/);
  });

  it('keeps final diversity-story identity aligned with deterministic selection for delimiter values', () => {
    const fixture = finalPolicyFixture();
    const firstTop = fixture.snapshot.items.find(item => item.id === fixture.selected[0].topId);
    const firstBottom = fixture.snapshot.items.find(item => item.id === fixture.selected[0].bottomId);
    const secondTop = fixture.snapshot.items.find(item => item.id === fixture.selected[1].topId);
    const secondBottom = fixture.snapshot.items.find(item => item.id === fixture.selected[1].bottomId);
    if (!firstTop || !firstBottom || !secondTop || !secondBottom) throw new Error('fixture story items are missing');
    firstTop.profile = { ...firstTop.profile, primaryColorFamily: 'a', silhouette: 'd' };
    firstBottom.profile = { ...firstBottom.profile, primaryColorFamily: 'b|c', silhouette: 'e' };
    secondTop.profile = { ...secondTop.profile, primaryColorFamily: 'a|b', silhouette: 'd' };
    secondBottom.profile = { ...secondBottom.profile, primaryColorFamily: 'c', silhouette: 'e' };

    expect(deterministicCandidateSetErrors(fixture.selected, fixture.snapshot, fixture.weather)).toEqual([]);
    expect(finalValidator(
      fixture.curated,
      fixture.snapshot,
      fixture.weather,
      fixture.history,
      fixture.selected,
      fixture.critic,
      fixture.selection,
    )).toEqual([]);
  });

  it('enforces byte-exact opaque selected ids, true uniqueness, score integrity, and the top-bottom cooldown', () => {
    const archetypes = ['easy', 'polished-casual', 'expressive'];
    const opaqueIds = ['__proto__', 'constructor', 'toString'];
    const selected = archetypes.map((archetype, index) => ({
      candidateId: opaqueIds[index],
      archetype,
      topId: index === 0 ? '__proto__' : `selected-top-${index}`,
      bottomId: index === 1 ? 'constructor' : `selected-bottom-${index}`,
      shoeId: index === 2 ? 'toString' : `selected-shoe-${index}`,
      itemIds: [
        index === 0 ? '__proto__' : `selected-top-${index}`,
        index === 1 ? 'constructor' : `selected-bottom-${index}`,
        index === 2 ? 'toString' : `selected-shoe-${index}`
      ]
    }));
    const finalSnapshot = {
      wardrobeFingerprint: 'opaque-5',
      settings: {},
      items: selected.flatMap((candidate, index) => [
        { id: candidate.topId, slot: 'top', profile: { primaryColorFamily: `top-${index}`, silhouette: `top-shape-${index}`, warmth: 1, breathability: 4, available: true, excludedFromDaily: false } },
        { id: candidate.bottomId, slot: 'bottom', category: 'Pants', profile: { primaryColorFamily: `bottom-${index}`, silhouette: `bottom-shape-${index}`, available: true, excludedFromDaily: false } },
        { id: candidate.shoeId, slot: 'shoes', profile: { rainSafety: 'good', available: true, excludedFromDaily: false } }
      ])
    };
    const critic = {
      scores: selected.map(candidate => ({
        candidateId: candidate.candidateId, weather: 9, palette: 9, colorIntent: 9,
        silhouette: 9, formality: 9, visualInterest: 9, wearability: 9,
        freshness: 9, archetypeFit: 9, disqualified: false, criticalDefects: [], reservations: []
      }))
    };
    const curated = {
      recommendations: selected.map(candidate => ({
        candidateId: candidate.candidateId,
        archetype: candidate.archetype,
        itemIds: candidate.itemIds.slice(),
        colorHook: 'The exact blue trim on the top repeats in the shoes for a deliberate bridge.',
        whyItWorks: 'The proportions, formality, and palette align across all three selected pieces.',
        weatherNote: 'Breathable and comfortable across the forecast window.'
      }))
    };
    const weather = { localDate: '2026-07-15', morningFeelsLikeF: 60, middayFeelsLikeF: 70, eveningFeelsLikeF: 60, rainExpected: false, layerGuidance: 'none' };
    const history = { exactOutfitsPrevious14Days: [], cooldownItemIds: [] };
    const selection = {
      deliveryMode: 'complete',
      selectedCount: 3,
      selectedArchetypes: archetypes.slice(),
      omittedArchetypes: [] as string[],
    };
    expect(finalValidator(curated, finalSnapshot, weather, history, selected, critic, selection)).toEqual([]);

    const twoCoreSavedSnapshot = {
      ...finalSnapshot,
      tasteExamples: [{ id: 'saved-two', name: 'Two Core', itemIds: [selected[0].topId, selected[0].bottomId, selected[1].shoeId] }]
    };
    expect(finalValidator(curated, twoCoreSavedSnapshot, weather, history, selected, critic, selection)).toEqual([]);

    const exactManualSnapshot = {
      ...finalSnapshot,
      tasteExamples: [{ id: 'saved-exact', name: 'Exact Manual', itemIds: selected[0].itemIds.slice() }]
    };
    expect(finalValidator(curated, exactManualSnapshot, weather, history, selected, critic, selection).join(' '))
      .toMatch(/recommendation\[0\] exactly copies manual saved outfit "Exact Manual"/);

    const exactAiSnapshot = {
      ...finalSnapshot,
      tasteExamples: [{ id: 'saved-ai', name: 'Exact AI', source: 'ai', itemIds: selected[0].itemIds.slice() }]
    };
    expect(finalValidator(curated, exactAiSnapshot, weather, history, selected, critic, selection)).toEqual([]);

    const duplicateSelected = structuredClone(selected);
    const duplicateCurated = structuredClone(curated);
    duplicateSelected[1].candidateId = duplicateSelected[0].candidateId;
    duplicateCurated.recommendations[1].candidateId = duplicateCurated.recommendations[0].candidateId;
    expect(finalValidator(duplicateCurated, finalSnapshot, weather, history, duplicateSelected, critic, selection).join(' '))
      .toMatch(/duplicates a final candidate/);

    const duplicateItemsSelected = structuredClone(selected);
    const duplicateItemsCurated = structuredClone(curated);
    duplicateItemsSelected[1].topId = duplicateItemsSelected[0].topId;
    duplicateItemsSelected[1].itemIds[0] = duplicateItemsSelected[0].itemIds[0];
    duplicateItemsCurated.recommendations[1].itemIds[0] = duplicateItemsCurated.recommendations[0].itemIds[0];
    expect(finalValidator(duplicateItemsCurated, finalSnapshot, weather, history, duplicateItemsSelected, critic, selection).join(' '))
      .toMatch(/tops must be unique/);

    const duplicateScore = { scores: critic.scores.concat(structuredClone(critic.scores[0])) };
    expect(finalValidator(curated, finalSnapshot, weather, history, selected, duplicateScore, selection).join(' '))
      .toMatch(/no eligible critic score/);

    const malformedScore = structuredClone(critic);
    malformedScore.scores[0].candidateId = '';
    expect(finalValidator(curated, finalSnapshot, weather, history, selected, malformedScore, selection).join(' '))
      .toMatch(/no eligible critic score/);

    const invalidScoreShapes: Array<[string, (score: Record<string, unknown>) => void]> = [
      ['missing metric', score => { delete score.visualInterest; }],
      ['NaN metric', score => { score.visualInterest = Number.NaN; }],
      ['metric below zero', score => { score.visualInterest = -0.1; }],
      ['metric above ten', score => { score.visualInterest = 10.1; }],
      ['non-number metric', score => { score.visualInterest = '9'; }],
      ['non-boolean disqualified', score => { score.disqualified = 'false'; }],
      ['non-array critical defects', score => { score.criticalDefects = 'weather'; }],
      ['non-string critical defect', score => { score.criticalDefects = [9]; }],
      ['non-array reservations', score => { score.reservations = 'palette'; }],
      ['non-string reservation', score => { score.reservations = [{ issue: 'palette' }]; }]
    ];
    invalidScoreShapes.forEach(([label, mutate]) => {
      const invalidScore = structuredClone(critic);
      mutate(invalidScore.scores[0]);
      const scoreErrors = finalValidator(curated, finalSnapshot, weather, history, selected, invalidScore, selection)
        .filter(error => error.includes('has no eligible critic score'));
      expect({ label, scoreErrors }).toEqual({
        label,
        scoreErrors: [
          'recommendation[0] has no eligible critic score',
          'recommendation[1] has no eligible critic score',
          'recommendation[2] has no eligible critic score'
        ]
      });
    });

    const reordered = structuredClone(curated);
    reordered.recommendations[0].itemIds.reverse();
    expect(finalValidator(reordered, finalSnapshot, weather, history, selected, critic, selection)).toEqual([]);

    const swapped = structuredClone(curated);
    [swapped.recommendations[0], swapped.recommendations[1]] = [swapped.recommendations[1], swapped.recommendations[0]];
    expect(finalValidator(swapped, finalSnapshot, weather, history, selected, critic, selection).join(' '))
      .toMatch(/changed or reordered the selected candidateId/);

    expect(finalValidator(curated, finalSnapshot, weather, {
      ...history,
      cooldownItemIds: [selected[0].topId, selected[1].shoeId]
    }, selected, critic, selection).join(' ')).toMatch(/yesterday top\/bottom cooldown/);
  });
});

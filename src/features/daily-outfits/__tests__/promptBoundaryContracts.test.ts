import { describe, expect, it } from 'vitest';
import { apps, evaluateAppsScript } from './appsScriptTestHarness';

const sneakerId = 'user_sneaker_1783863184667';
const topId = 'user_closet_1783863184668';
const bottomId = 'user_closet_1783863184669';
const staleLongId = 'user_closet_1783863199999';
const staleItemId = 'item_archived_1783863199998';

const snapshot = {
  items: [
    {
      id: sneakerId,
      shortLabel: 'S009',
      slot: 'shoes',
      name: 'Mocha',
      brand: 'Jordan',
      category: 'Sneakers',
      color: 'brown',
      description: 'Leather high top',
      thumbnailDataUrl: 'data:image/jpeg;base64,QQ==',
      profile: {
        warmth: 2,
        breathability: 3,
        rainSafety: 'good',
        windProtection: 0,
        formality: 2,
        silhouette: 'regular',
        patternIntensity: 0,
        primaryColorFamily: 'brown',
        secondaryColorFamily: 'cream',
        accentColors: ['black'],
        available: true,
        excludedFromDaily: false,
        source: 'ai-inferred',
        confidence: 0.75,
        updatedAt: 1,
        privateNote: 'never expose this'
      }
    },
    {
      id: topId,
      shortLabel: 'T004',
      slot: 'top',
      name: 'Camp Shirt',
      brand: 'ACG',
      category: 'Shirts',
      color: 'cream',
      description: 'Textured camp collar',
      thumbnailDataUrl: 'data:image/png;base64,Qg==',
      profile: { warmth: 1, breathability: 4 }
    },
    {
      id: bottomId,
      shortLabel: 'B002',
      slot: 'bottom',
      name: 'Utility Pant',
      brand: 'Nike',
      category: 'Pants',
      color: 'olive',
      description: 'Relaxed utility pant',
      thumbnailDataUrl: 'data:image/png;base64,Qw==',
      profile: { warmth: 2, breathability: 3 }
    }
  ],
  atlasPages: [
    {
      pageId: 'atlas-1',
      slot: 'mixed',
      itemIds: [topId, sneakerId],
      imageDataUrl: 'data:image/jpeg;base64,RA=='
    }
  ],
  tasteExamples: [
    {
      id: 'saved-1',
      name: 'Utility Neutral',
      itemIds: [topId, bottomId, sneakerId],
      source: 'manual',
      note: 'Muted base with a stronger shoe',
      createdAt: 1
    }
  ]
};

const richWeather = {
  localDate: '2026-07-14',
  locationLabel: 'Brooklyn, NY',
  timezone: 'America/New_York',
  fetchedAt: 1,
  hourly: [{ localHour: 6, feelsLikeF: 70 }],
  morningFeelsLikeF: 70,
  middayFeelsLikeF: 80,
  eveningFeelsLikeF: 72,
  minFeelsLikeF: 68,
  maxFeelsLikeF: 82,
  highTemperatureF: 82,
  lowTemperatureF: 65,
  maxRainProbability: 0,
  totalPrecipitationInches: 0,
  maxWindMph: 5,
  maxGustMph: 8,
  averageHumidity: 50,
  rainExpected: false,
  windy: false,
  largeTemperatureSwing: false,
  layerGuidance: 'none',
  plainEnglishSummary: 'Light pieces.',
  weatherPhrase: 'clear'
};

const extremeHeatWeather = {
  ...richWeather,
  middayFeelsLikeF: 101
};

const EXACT_EXTREME_HEAT_CONTRACT = [
  'EXTREME-HEAT POLISHED-CASUAL CONTRACT:',
  '- Polish does not require trousers. Build polish through intentional palette, proportion, restrained graphics, and footwear.',
  '- At least 3 of your 5 candidates must use a Shorts bottom.',
  '- Every proposed top must have `warmth <= 2` and `breathability >= 4`.',
  '- A Pants bottom is allowed only when it has `warmth <= 2` and `breathability >= 4`.',
  '- Avoid heat-retaining layers. Include a removable layer only when the weather\'s edge-of-day layer guidance requires one, and only when that layer has `warmth <= 2`.',
  '- Do not lower archetype intent: the result must still read as polished-casual rather than a generic gym or lounge outfit.'
].join('\n');

const richHistory = {
  exactOutfitsPrevious14Days: [{ localDate: '2026-07-13', itemIds: [topId, sneakerId], archetype: 'easy' }],
  itemUsagePrevious7Days: { [topId]: 2, [sneakerId]: 1 },
  feedback: [],
  cooldownItemIds: [topId],
  wornItemIds: [sneakerId]
};

const richSnapshot = {
  ...snapshot,
  settings: { allowShoeReuseWhenNecessary: true, privateOperationalFlag: true }
};

const internalCandidate = (archetype = 'easy') => ({
  candidateId: `${archetype}-1`,
  archetype,
  topId,
  bottomId,
  shoeId: sneakerId,
  itemIds: [topId, bottomId, sneakerId],
  name: 'Utility Neutral',
  styleSummary: 'Relaxed proportions align across the outfit',
  colorStrategy: 'Cream and olive bridge the brown shoes through warm neutral accents.',
  weatherSummary: 'Breathable for today',
  potentialRisks: [],
  plannerConfidence: 0.9
});

const selectionCoverageFor = (selectedCandidates: Array<{ archetype: string }>) => {
  const selectedArchetypes = selectedCandidates.map(candidate => candidate.archetype);
  return {
    path: 'top2',
    deliveryMode: selectedCandidates.length === 3 ? 'complete' : 'partial',
    selectedCount: selectedCandidates.length,
    selectedArchetypes,
    omittedArchetypes: ['easy', 'polished-casual', 'expressive']
      .filter(archetype => !selectedArchetypes.includes(archetype))
  };
};

const cardinalityBoundaryFixture = () => {
  const secondIds = ['curator-top-2', 'curator-bottom-2', 'curator-shoe-2'];
  const thirdIds = ['curator-top-3', 'curator-bottom-3', 'curator-shoe-3'];
  const second = {
    ...internalCandidate('polished-casual'),
    candidateId: 'polished-casual-2',
    topId: secondIds[0],
    bottomId: secondIds[1],
    shoeId: secondIds[2],
    itemIds: secondIds.slice()
  };
  const third = {
    ...internalCandidate('expressive'),
    candidateId: 'expressive-3',
    topId: thirdIds[0],
    bottomId: thirdIds[1],
    shoeId: thirdIds[2],
    itemIds: thirdIds.slice()
  };
  const cloneItem = (sourceId: string, id: string, shortLabel: string) => ({
    ...richSnapshot.items.find(item => item.id === sourceId)!,
    id,
    shortLabel
  });
  const selectedCandidates = [internalCandidate(), second, third];
  return {
    snapshot: {
      ...richSnapshot,
      items: richSnapshot.items.concat([
        cloneItem(topId, secondIds[0], 'T005'),
        cloneItem(bottomId, secondIds[1], 'B003'),
        cloneItem(sneakerId, secondIds[2], 'S010'),
        cloneItem(topId, thirdIds[0], 'T006'),
        cloneItem(bottomId, thirdIds[1], 'B004'),
        cloneItem(sneakerId, thirdIds[2], 'S011')
      ])
    },
    selectedCandidates,
    labelItemIds: [
      ['T004', 'B002', 'S009'],
      ['T005', 'B003', 'S010'],
      ['T006', 'B004', 'S011']
    ],
    critic: {
      scores: selectedCandidates.concat([{ ...internalCandidate(), candidateId: 'overflow-4' }])
        .map(candidate => criticScore(candidate.candidateId))
    }
  };
};

const labelCandidate = (archetype = 'easy') => ({
  ...internalCandidate(archetype),
  topId: 'T004',
  bottomId: 'B002',
  shoeId: 'S009',
  itemIds: ['T004', 'B002', 'S009']
});

const labelPlannerResponse = (archetype = 'easy') => ({
  archetype,
  candidates: [labelCandidate(archetype)]
});

const criticCandidates = () => ['easy', 'polished-casual', 'expressive'].flatMap(archetype =>
  Array.from({ length: 2 }, (_, index) => ({
    ...internalCandidate(archetype),
    candidateId: `${archetype}-${index}`
  }))
);

const criticScore = (candidateId: string) => ({
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
  reservations: [] as string[]
});

const validCriticResponse = () => {
  const candidates = criticCandidates();
  return {
    scores: candidates.map(candidate => criticScore(candidate.candidateId))
  };
};

type CriticScore = ReturnType<typeof criticScore>;

const criticCandidateRunner = (callGeminiV2_: (stage: string) => unknown) => evaluateAppsScript<(
  snapshot: object,
  weather: object,
  history: object,
  candidates: object[]
) => { scores: CriticScore[] }>(
  ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'],
  'runCriticCandidatesV2_',
  {
    DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
    console,
    modelWeatherViewV2_: () => ({}),
    buildTasteSummaryV2_: () => [],
    callGeminiV2_
  }
);

const api = evaluateAppsScript<{
  modelWeatherViewV2_: (weather: object) => Record<string, unknown>;
  modelProfileViewV2_: (profile: object, snapshot?: object, slot?: string) => Record<string, unknown>;
  compactItemIndexV2_: (snapshot: object) => Array<Record<string, unknown>>;
  labelForItemIdV2_: (id: string, snapshot: object) => string | null;
  atlasPartsV2_: (snapshot: object) => Array<{ text?: string }>;
  candidateImagePartsV2_: (snapshot: object, candidates: object[]) => Array<{ text?: string }>;
  modelFacingCandidateV2_: (candidate: object, snapshot: object) => Record<string, unknown>;
  modelFacingHistoryV2_: (history: object | null | undefined, snapshot: object) => Record<string, unknown>;
  modelFacingCuratedV2_: (curated: object | null | undefined, snapshot: object) => Record<string, unknown>;
  resolveLabelsV2_: (response: object, snapshot: object) => {
    candidates: Array<{ shoeId: string; itemIds: string[] }>;
    recommendations: Array<{ itemIds: string[] }>;
  };
  tasteEvidenceV2_: ((snapshot: object) => Array<{ itemIds: string[]; coreItemIds: string[]; source: string; weight: number }>) | null;
  manualCoreTriosV2_: ((snapshot: object) => Array<{ itemIds: string[]; coreItemIds: string[] }>) | null;
  savedOutfitExactCopyV2_: ((itemIds: string[], snapshot: object) => { name: string } | null) | null;
  sharedTwoCoreSavedOutfitsV2_: ((itemIds: string[], snapshot: object) => Array<{ name: string }>) | null;
  buildTasteSummaryV2_: (snapshot: object) => Array<Record<string, unknown>>;
}>(
  ['Weather.gs', 'ItemIndex.gs', 'Taste.gs'],
  `({
    modelWeatherViewV2_, modelProfileViewV2_, compactItemIndexV2_, labelForItemIdV2_, atlasPartsV2_, candidateImagePartsV2_,
    modelFacingCandidateV2_, modelFacingHistoryV2_, modelFacingCuratedV2_, resolveLabelsV2_,
    tasteEvidenceV2_: typeof tasteEvidenceV2_ === 'function' ? tasteEvidenceV2_ : null,
    manualCoreTriosV2_: typeof manualCoreTriosV2_ === 'function' ? manualCoreTriosV2_ : null,
    savedOutfitExactCopyV2_: typeof savedOutfitExactCopyV2_ === 'function' ? savedOutfitExactCopyV2_ : null,
    sharedTwoCoreSavedOutfitsV2_: typeof sharedTwoCoreSavedOutfitsV2_ === 'function' ? sharedTwoCoreSavedOutfitsV2_ : null,
    buildTasteSummaryV2_
  })`,
  { console }
);

describe('model boundary views', () => {
  it('allowlists model weather and item profile fields', () => {
    const weather = api.modelWeatherViewV2_({
      localDate: '2026-07-14',
      locationLabel: 'New York',
      timezone: 'America/New_York',
      hourly: [{ localHour: 6 }],
      fetchedAt: 1,
      morningFeelsLikeF: 70,
      middayFeelsLikeF: 80,
      eveningFeelsLikeF: 72,
      rainExpected: false,
      privateNote: 'never expose this'
    });
    expect(weather).toEqual({
      morningFeelsLikeF: 70,
      middayFeelsLikeF: 80,
      eveningFeelsLikeF: 72,
      rainExpected: false,
      localDate: '2026-07-14',
      locationLabel: 'New York'
    });

    const item = api.compactItemIndexV2_(snapshot)[0];
    expect(item).toHaveProperty('label', 'S009');
    expect(item).not.toHaveProperty('id');
    expect(item.profile).toEqual({
      warmth: 2,
      breathability: 3,
      windProtection: 0,
      formality: 2,
      silhouette: 'regular',
      patternIntensity: 0,
      primaryColorFamily: 'brown',
      secondaryColorFamily: 'cream',
      accentColors: ['black']
    });
    expect(api.modelProfileViewV2_(snapshot.items[0].profile)).not.toHaveProperty('available');
    expect(api.modelProfileViewV2_(snapshot.items[0].profile, snapshot, 'top')).toHaveProperty('rainSafety', 'good');
  });

  it('uses labels in atlas and candidate-image text', () => {
    const atlasText = api.atlasPartsV2_(snapshot).map(part => part.text).filter(Boolean).join('\n');
    expect(atlasText).toContain('item labels=T004,S009');
    expect(atlasText).not.toContain(topId);
    expect(atlasText).not.toContain(sneakerId);

    const imageText = api.candidateImagePartsV2_(snapshot, [{
      candidateId: 'easy-1',
      itemIds: [topId, sneakerId]
    }]).map(part => part.text).filter(Boolean).join('\n');
    expect(imageText).toContain('ITEM T004 | slot=top');
    expect(imageText).toContain('ITEM S009 | slot=shoes');
    expect(imageText).not.toContain(topId);
    expect(imageText).not.toContain(sneakerId);
  });

  it('translates candidate, history, and curated copies without mutating internal ids', () => {
    const candidate = {
      candidateId: 'easy-1',
      topId,
      bottomId,
      shoeId: sneakerId,
      itemIds: [topId, bottomId, sneakerId]
    };
    const history = {
      exactOutfitsPrevious14Days: [{ localDate: '2026-07-13', itemIds: [topId, sneakerId] }],
      itemUsagePrevious7Days: { [topId]: 2, [sneakerId]: 1 },
      cooldownItemIds: [topId],
      wornItemIds: [sneakerId],
      feedback: []
    };
    const curated = { recommendations: [{ candidateId: 'easy-1', itemIds: [topId, sneakerId] }] };

    expect(api.modelFacingCandidateV2_(candidate, snapshot)).toEqual({
      candidateId: 'easy-1',
      topId: 'T004',
      bottomId: 'B002',
      shoeId: 'S009',
      itemIds: ['T004', 'B002', 'S009'],
      sharesTwoCoreWith: []
    });
    expect(api.modelFacingHistoryV2_(history, snapshot)).toEqual({
      exactOutfitsPrevious14Days: [{ localDate: '2026-07-13', itemIds: ['T004', 'S009'] }],
      itemUsagePrevious7Days: { T004: 2, S009: 1 },
      feedback: []
    });
    expect(api.modelFacingCuratedV2_(curated, snapshot)).toEqual({
      recommendations: [{ candidateId: 'easy-1', itemIds: ['T004', 'S009'] }]
    });
    expect(candidate.itemIds).toEqual([topId, bottomId, sneakerId]);
    expect(history.exactOutfitsPrevious14Days[0].itemIds).toEqual([topId, sneakerId]);
    expect(curated.recommendations[0].itemIds).toEqual([topId, sneakerId]);
  });

  it('constructs closed candidate, history, and curated model shapes', () => {
    const hiddenId = 'user_closet_9999999999999';
    const candidate = {
      candidateId: 'easy-1',
      archetype: 'easy',
      topId,
      bottomId,
      shoeId: sneakerId,
      itemIds: [topId, bottomId, sneakerId],
      name: 'Utility Neutral',
      styleSummary: 'Relaxed proportions',
      colorStrategy: 'Cream and olive bridge the brown shoes',
      weatherSummary: 'Breathable for today',
      potentialRisks: ['None'],
      plannerConfidence: 0.9,
      privateItemId: hiddenId,
      privateNested: { itemIds: [hiddenId] }
    };
    const history = {
      exactOutfitsPrevious14Days: [{
        localDate: '2026-07-13',
        itemIds: [topId, sneakerId],
        archetype: 'easy',
        privateItemId: hiddenId
      }],
      itemUsagePrevious7Days: { [topId]: 2 },
      feedback: [{
        localDate: '2026-07-13',
        candidateId: 'easy-1',
        value: 'wore',
        reason: 'other',
        note: 'Good proportions',
        createdAt: 1,
        privateNested: { itemId: hiddenId }
      }],
      privateNested: { itemIds: [hiddenId] }
    };
    const curated = {
      recommendations: [{
        candidateId: 'easy-1',
        archetype: 'easy',
        name: 'Utility Neutral',
        itemIds: [topId, sneakerId],
        colorHook: 'Cream and brown repeat across the shirt and shoes',
        whyItWorks: 'Relaxed proportions align across both garments',
        weatherNote: 'Breathable enough for today',
        privateItemId: hiddenId
      }],
      privateNested: { itemIds: [hiddenId] }
    };

    const modelCandidate = api.modelFacingCandidateV2_(candidate, snapshot);
    const modelHistory = api.modelFacingHistoryV2_(history, snapshot);
    const modelCurated = api.modelFacingCuratedV2_(curated, snapshot);

    expect(modelCandidate).toEqual({
      candidateId: 'easy-1',
      archetype: 'easy',
      topId: 'T004',
      bottomId: 'B002',
      shoeId: 'S009',
      itemIds: ['T004', 'B002', 'S009'],
      name: 'Utility Neutral',
      styleSummary: 'Relaxed proportions',
      colorStrategy: 'Cream and olive bridge the brown shoes',
      weatherSummary: 'Breathable for today',
      potentialRisks: ['None'],
      plannerConfidence: 0.9,
      sharesTwoCoreWith: []
    });
    expect(modelHistory).toEqual({
      exactOutfitsPrevious14Days: [{
        localDate: '2026-07-13',
        itemIds: ['T004', 'S009'],
        archetype: 'easy'
      }],
      itemUsagePrevious7Days: { T004: 2 },
      feedback: [{
        localDate: '2026-07-13',
        candidateId: 'easy-1',
        value: 'wore',
        reason: 'other',
        note: 'Good proportions',
        createdAt: 1
      }]
    });
    expect(modelCurated).toEqual({
      recommendations: [{
        candidateId: 'easy-1',
        archetype: 'easy',
        name: 'Utility Neutral',
        itemIds: ['T004', 'S009'],
        colorHook: 'Cream and brown repeat across the shirt and shoes',
        whyItWorks: 'Relaxed proportions align across both garments',
        weatherNote: 'Breathable enough for today'
      }]
    });
    expect(JSON.stringify({ modelCandidate, modelHistory, modelCurated })).not.toContain(hiddenId);
  });

  it('sanitizes every candidate-authored model string while preserving safe opaque candidate ids', () => {
    const candidate = {
      ...internalCandidate(),
      candidateId: '__proto__',
      archetype: `easy ${staleItemId}`,
      name: `Current ${topId}; stale ${staleLongId}`,
      styleSummary: `Current ${bottomId}; stale ${staleItemId}`,
      colorStrategy: `Current ${sneakerId}; stale img_9999`,
      weatherSummary: `Current ${topId}; stale sneaker_ZZ9999-404`,
      potentialRisks: [
        `Current ${bottomId}`,
        `Stale ${staleLongId}`,
        'Useful ordinary risk prose remains.',
        42,
      ],
    };

    const view = api.modelFacingCandidateV2_(candidate, richSnapshot);

    expect(view).toEqual(expect.objectContaining({
      candidateId: '__proto__',
      archetype: 'easy INVALID_LABEL',
      name: 'Current T004; stale INVALID_LABEL',
      styleSummary: 'Current B002; stale INVALID_LABEL',
      colorStrategy: 'Current S009; stale INVALID_LABEL',
      weatherSummary: 'Current T004; stale INVALID_LABEL',
      potentialRisks: ['Current B002', 'Stale INVALID_LABEL', 'Useful ordinary risk prose remains.'],
    }));
    ['constructor', 'toString'].forEach(candidateId => {
      expect(api.modelFacingCandidateV2_({ ...internalCandidate(), candidateId }, richSnapshot).candidateId)
        .toBe(candidateId);
    });
  });

  it('rejects candidate ids changed by shared sanitation before a critic, curator, or repair model call', () => {
    const unsafeCandidate = { ...internalCandidate(), candidateId: topId };
    const unsafeCritic = { scores: [criticScore(topId)] };
    let modelCalls = 0;
    const runCritic = criticCandidateRunner(() => {
      modelCalls += 1;
      return unsafeCritic;
    });
    const runCurator = evaluateAppsScript<(
      snapshotValue: object,
      weather: object,
      history: object,
      candidates: object[],
      critic: object
    ) => object>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Selection.gs', 'Curator.gs'],
      'runCuratorV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        callGeminiV2_: () => { modelCalls += 1; return { recommendations: [] }; },
      }
    );
    const runRepair = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshotValue: object,
      weather: object,
      history: object,
      candidates: object[],
      critic: object,
      selection: object
    ) => object>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        validateFinalBundleV2_: () => [],
        callGeminiV2_: () => { modelCalls += 1; return { recommendations: [] }; },
      }
    );

    expect(() => runCritic(richSnapshot, richWeather, richHistory, [unsafeCandidate]))
      .toThrow(/unsafe candidateId/);
    expect(() => runCurator(richSnapshot, richWeather, richHistory, [unsafeCandidate], unsafeCritic))
      .toThrow(/unsafe candidateId/);
    expect(() => runRepair(
      { recommendations: [] },
      ['copy needs repair'],
      richSnapshot,
      richWeather,
      richHistory,
      [unsafeCandidate],
      unsafeCritic,
      selectionCoverageFor([unsafeCandidate]),
    ))
      .toThrow(/unsafe candidateId/);
    expect(modelCalls).toBe(0);
  });

  it('fails closed for stale current references and omits stale history references', () => {
    const removedId = 'user_closet_1783863199999';

    expect(api.labelForItemIdV2_(removedId, snapshot)).toBeNull();
    expect(() => api.modelFacingCandidateV2_({
      candidateId: 'easy-stale',
      topId: removedId,
      bottomId,
      shoeId: sneakerId,
      itemIds: [removedId, bottomId, sneakerId]
    }, snapshot)).toThrow('Candidate references a missing wardrobe item');
    expect(() => api.atlasPartsV2_({
      ...snapshot,
      atlasPages: [{
        pageId: 'stale-atlas',
        slot: 'mixed',
        itemIds: [topId, removedId],
        imageDataUrl: 'data:image/jpeg;base64,RA=='
      }]
    })).toThrow('Atlas page references a missing wardrobe item');

    const modelHistory = api.modelFacingHistoryV2_({
      exactOutfitsPrevious14Days: [
        { localDate: '2026-07-12', itemIds: [topId, sneakerId], archetype: 'easy' },
        { localDate: '2026-07-13', itemIds: [topId, removedId], archetype: 'expressive' }
      ],
      itemUsagePrevious7Days: { [topId]: 2, [removedId]: 4 },
      feedback: []
    }, snapshot);
    expect(modelHistory).toEqual({
      exactOutfitsPrevious14Days: [
        { localDate: '2026-07-12', itemIds: ['T004', 'S009'], archetype: 'easy' }
      ],
      itemUsagePrevious7Days: { T004: 2 },
      feedback: []
    });
    expect(JSON.stringify(modelHistory)).not.toContain(removedId);
  });

  it('keeps a taste example with two current pieces while omitting a removed piece', () => {
    const removedId = 'user_closet_1783863199999';
    const tasteSnapshot = {
      ...snapshot,
      tasteExamples: [{
        id: 'saved-stale',
        name: 'Still Useful',
        itemIds: [topId, bottomId, removedId],
        source: 'manual',
        note: 'Keep the current silhouette',
        createdAt: 1
      }]
    };

    const summary = api.buildTasteSummaryV2_(tasteSnapshot)[0];
    expect(summary).toEqual(expect.objectContaining({
      itemLabels: ['T004', 'B002'],
      coreItemLabels: ['T004', 'B002'],
      pieces: [
        'T004 ACG Camp Shirt (top, cream)',
        'B002 Nike Utility Pant (bottom, olive)'
      ]
    }));
    expect(JSON.stringify(summary)).not.toContain(removedId);
  });

  it('resolves known labels immediately and preserves unknown tokens', () => {
    const response = {
      candidates: [{ shoeId: 'S009', itemIds: ['T999', 'S009'] }],
      recommendations: [{ itemIds: ['T004', 'X404'] }]
    };
    const resolved = api.resolveLabelsV2_(response, snapshot);
    expect(resolved.candidates[0]).toEqual({ shoeId: sneakerId, itemIds: ['T999', sneakerId] });
    expect(resolved.recommendations[0]).toEqual({ itemIds: [topId, 'X404'] });
    expect(response.candidates[0]).toEqual({ shoeId: 'S009', itemIds: ['T999', 'S009'] });
  });

  it('preserves prototype-key unknown tokens during label resolution', () => {
    const response = {
      candidates: [{ shoeId: 'constructor', itemIds: ['toString', '__proto__'] }],
      recommendations: [{ itemIds: ['constructor', 'toString', '__proto__'] }]
    };

    expect(api.resolveLabelsV2_(response, snapshot)).toEqual(response);
  });

  it('returns consistent empty history and curated model shapes for nullish inputs', () => {
    const emptyHistory = {
      exactOutfitsPrevious14Days: [],
      itemUsagePrevious7Days: {},
      feedback: []
    };
    expect(api.modelFacingHistoryV2_(null, snapshot)).toEqual(emptyHistory);
    expect(api.modelFacingHistoryV2_(undefined, snapshot)).toEqual(emptyHistory);
    expect(api.modelFacingCuratedV2_(null, snapshot)).toEqual({ recommendations: [] });
    expect(api.modelFacingCuratedV2_(undefined, snapshot)).toEqual({ recommendations: [] });
  });

  it('separates taste evidence from exact-manual blocking signatures', () => {
    expect(api.tasteEvidenceV2_).toBeTypeOf('function');
    expect(api.manualCoreTriosV2_).toBeTypeOf('function');
    expect(api.savedOutfitExactCopyV2_).toBeTypeOf('function');
    expect(api.sharedTwoCoreSavedOutfitsV2_).toBeTypeOf('function');
    if (!api.tasteEvidenceV2_ || !api.manualCoreTriosV2_ || !api.savedOutfitExactCopyV2_ || !api.sharedTwoCoreSavedOutfitsV2_) return;

    const policySnapshot = {
      ...snapshot,
      tasteExamples: [
        { id: 'manual', name: 'Manual', itemIds: [topId, bottomId, sneakerId], note: 'Keep this logic' },
        { id: 'ai', name: 'AI', source: 'ai', itemIds: [topId, bottomId, sneakerId] },
        { id: 'hidden', name: 'Hidden', seedStylist: false, itemIds: [topId, bottomId, sneakerId] },
        { id: 'two', name: 'Two', itemIds: [topId, bottomId] },
        { id: 'duplicate', name: 'Duplicate', itemIds: [topId, topId, bottomId, sneakerId, 'non-core'] }
      ]
    };
    const evidence = api.tasteEvidenceV2_(policySnapshot);
    expect(evidence.map(value => ({ name: (value as unknown as { name: string }).name, source: value.source, weight: value.weight }))).toEqual([
      { name: 'Manual', source: 'manual', weight: 1 },
      { name: 'AI', source: 'ai', weight: 0.3 },
      { name: 'Two', source: 'manual', weight: 1 },
      { name: 'Duplicate', source: 'manual', weight: 1 }
    ]);
    expect(evidence[0].itemIds).toEqual([topId, bottomId, sneakerId]);
    expect(evidence[0].itemIds).not.toBe(policySnapshot.tasteExamples[0].itemIds);
    expect(evidence[0].coreItemIds).toEqual([topId, bottomId, sneakerId]);

    expect(api.manualCoreTriosV2_(policySnapshot).map(value => (value as unknown as { name: string }).name)).toEqual([
      'Manual', 'Hidden', 'Duplicate'
    ]);
    expect(api.savedOutfitExactCopyV2_([topId, bottomId, sneakerId], policySnapshot)?.name).toBe('Manual');
    expect(api.savedOutfitExactCopyV2_([topId, bottomId], policySnapshot)).toBeNull();
    expect(api.sharedTwoCoreSavedOutfitsV2_([topId, bottomId, 'other'], policySnapshot).map(value => value.name)).toEqual([
      'Manual', 'AI', 'Two', 'Duplicate'
    ]);
  });

  it('normalizes every taste source to ai or manual before summaries without changing policy semantics', () => {
    expect(api.tasteEvidenceV2_).toBeTypeOf('function');
    expect(api.savedOutfitExactCopyV2_).toBeTypeOf('function');
    if (!api.tasteEvidenceV2_ || !api.savedOutfitExactCopyV2_) return;
    const tasteEvidence = api.tasteEvidenceV2_;
    const savedOutfitExactCopy = api.savedOutfitExactCopyV2_;
    const cases = [
      { label: 'AI', source: 'ai', expectedSource: 'ai', expectedWeight: 0.3, exactCopy: false },
      { label: 'Manual', source: 'manual', expectedSource: 'manual', expectedWeight: 1, exactCopy: true },
      { label: 'Malformed String', source: 'assistant', expectedSource: 'manual', expectedWeight: 1, exactCopy: true },
      { label: 'Malformed Object', source: { privateId: staleLongId }, expectedSource: 'manual', expectedWeight: 1, exactCopy: true },
    ];

    cases.forEach(value => {
      const sourceSnapshot = {
        ...snapshot,
        tasteExamples: [{
          id: `saved-${value.label}`,
          name: value.label,
          source: value.source,
          itemIds: [topId, bottomId, sneakerId],
          createdAt: 1,
        }],
      };
      const evidence = tasteEvidence(sourceSnapshot)[0];
      const summary = api.buildTasteSummaryV2_(sourceSnapshot)[0];

      expect({ source: evidence.source, weight: evidence.weight }).toEqual({
        source: value.expectedSource,
        weight: value.expectedWeight,
      });
      expect(summary).toEqual(expect.objectContaining({
        source: value.expectedSource,
        weight: value.expectedWeight,
      }));
      expect(Boolean(savedOutfitExactCopy([topId, bottomId, sneakerId], sourceSnapshot)))
        .toBe(value.exactCopy);
    });
  });

  it('keeps saved taste internals on real ids but emits label-only model summaries', () => {
    expect(api.tasteEvidenceV2_).toBeTypeOf('function');
    if (!api.tasteEvidenceV2_) return;
    expect(api.tasteEvidenceV2_(snapshot)[0].itemIds).toEqual([topId, bottomId, sneakerId]);

    const summary = api.buildTasteSummaryV2_(snapshot)[0];
    expect(summary).toEqual(expect.objectContaining({
      itemLabels: ['T004', 'B002', 'S009'],
      coreItemLabels: ['T004', 'B002', 'S009']
    }));
    expect(JSON.stringify(summary)).not.toContain(topId);
    expect(JSON.stringify(summary)).not.toContain(bottomId);
    expect(JSON.stringify(summary)).not.toContain(sneakerId);
    expect(summary.pieces).toEqual([
      'T004 ACG Camp Shirt (top, cream)',
      'B002 Nike Utility Pant (bottom, olive)',
      'S009 Jordan Mocha (shoes, brown)'
    ]);
  });

  it('sanitizes current wardrobe ids embedded in every composed taste piece metadata field', () => {
    const metadataSnapshot = {
      ...snapshot,
      items: snapshot.items.map(item => item.id === topId ? {
        ...item,
        brand: `ACG ${bottomId}`,
        name: `Camp ${sneakerId}`,
        color: `${topId} cream`
      } : item)
    };

    const summary = api.buildTasteSummaryV2_(metadataSnapshot)[0];

    expect(summary.pieces).toContain('T004 ACG B002 Camp S009 (top, T004 cream)');
    expect(JSON.stringify(summary.pieces)).not.toContain(topId);
    expect(JSON.stringify(summary.pieces)).not.toContain(bottomId);
    expect(JSON.stringify(summary.pieces)).not.toContain(sneakerId);
  });

  it('omits saved outfit ids and sanitizes saved names and notes at every model boundary', () => {
    const privateSavedId = 'saved-private-identifier';
    const removedId = 'user_closet_1783863199999';
    const tasteSnapshot = {
      ...snapshot,
      tasteExamples: [{
        id: privateSavedId,
        name: `Saved ${topId} with ${removedId}`,
        note: `Repeat ${bottomId}, not ${removedId}`,
        itemIds: [topId, bottomId, sneakerId],
        source: 'manual',
        createdAt: 1
      }]
    };

    const summary = api.buildTasteSummaryV2_(tasteSnapshot)[0];
    expect(summary).not.toHaveProperty('id');
    expect(summary).toEqual(expect.objectContaining({
      name: 'Saved T004 with INVALID_LABEL',
      note: 'Repeat B002, not INVALID_LABEL'
    }));

    const candidate = api.modelFacingCandidateV2_({
      candidateId: 'candidate',
      topId,
      bottomId,
      shoeId: 'other-shoe',
      itemIds: [topId, bottomId, 'other-shoe']
    }, {
      ...tasteSnapshot,
      items: [...tasteSnapshot.items, {
        ...snapshot.items[0],
        id: 'other-shoe',
        shortLabel: 'S010'
      }]
    });
    expect(candidate.sharesTwoCoreWith).toEqual(['Saved T004 with INVALID_LABEL']);
    expect(JSON.stringify({ summary, candidate })).not.toContain(privateSavedId);
    expect(JSON.stringify({ summary, candidate })).not.toContain(topId);
    expect(JSON.stringify({ summary, candidate })).not.toContain(bottomId);
    expect(JSON.stringify({ summary, candidate })).not.toContain(removedId);
  });

  it('scrubs stale sneaker and image ids without corrupting prose or current arbitrary ids', () => {
    const staleSneakerId = 'sneaker_ZZ9999-404';
    const staleImageId = 'img_9999';
    const arbitraryCurrentId = 'legacy.sneaker_QQ0001-101+img_0246';
    const safeProse = 'sneaker_rotation and img_reference stay readable';
    const tasteSnapshot = {
      ...snapshot,
      items: [...snapshot.items, {
        ...snapshot.items[1],
        id: arbitraryCurrentId,
        shortLabel: 'T099'
      }],
      tasteExamples: [{
        id: 'saved-stale-supported-ids',
        name: `Saved ${staleSneakerId} and ${staleImageId}; current ${arbitraryCurrentId}; ${safeProse}`,
        note: `Archive ${staleImageId} and ${staleSneakerId}; current ${arbitraryCurrentId}; ${safeProse}`,
        itemIds: [topId, bottomId, sneakerId],
        source: 'manual',
        createdAt: 1
      }]
    };

    const summary = api.buildTasteSummaryV2_(tasteSnapshot)[0];
    const candidate = api.modelFacingCandidateV2_({
      candidateId: 'candidate',
      topId,
      bottomId,
      shoeId: 'other-shoe',
      itemIds: [topId, bottomId, 'other-shoe']
    }, {
      ...tasteSnapshot,
      items: [...tasteSnapshot.items, {
        ...snapshot.items[0],
        id: 'other-shoe',
        shortLabel: 'S010'
      }]
    });

    expect(summary).toEqual(expect.objectContaining({
      name: `Saved INVALID_LABEL and INVALID_LABEL; current T099; ${safeProse}`,
      note: `Archive INVALID_LABEL and INVALID_LABEL; current T099; ${safeProse}`
    }));
    expect(candidate.sharesTwoCoreWith).toEqual([
      `Saved INVALID_LABEL and INVALID_LABEL; current T099; ${safeProse}`
    ]);
    const serialized = JSON.stringify({ summary, candidate });
    expect(serialized).not.toContain(staleSneakerId);
    expect(serialized).not.toContain(staleImageId);
    expect(serialized).not.toContain(arbitraryCurrentId);
    expect(serialized).toContain(safeProse);
  });

  it('emits two-core overlap names as critic context without long item ids', () => {
    const contextSnapshot = {
      ...snapshot,
      tasteExamples: [{ id: 'saved', name: 'Saved Look', itemIds: ['top-long-id', 'bottom-long-id', sneakerId], createdAt: 1 }],
      items: [...snapshot.items,
        { id: 'top-long-id', shortLabel: 'T001', slot: 'top' },
        { id: 'bottom-long-id', shortLabel: 'B001', slot: 'bottom' },
        { id: 'other', shortLabel: 'S010', slot: 'shoes' }
      ]
    };
    const view = api.modelFacingCandidateV2_({
      candidateId: 'c1',
      topId: 'top-long-id',
      bottomId: 'bottom-long-id',
      shoeId: 'other',
      itemIds: ['top-long-id', 'bottom-long-id', 'other']
    }, contextSnapshot);
    expect(view.sharesTwoCoreWith).toEqual(['Saved Look']);
    expect(JSON.stringify(view)).not.toContain('top-long-id');
    expect(JSON.stringify(view)).not.toContain('bottom-long-id');
    expect(JSON.stringify(view)).not.toContain(sneakerId);
  });
});

describe('prompt and response label boundary', () => {
  it('activates the exact extreme-heat contract only for numeric polished-casual heat above 90', () => {
    const extremeHeatContract = evaluateAppsScript<(
      archetype: string,
      weather: object
    ) => string>(
      ['Planner.gs'],
      'extremeHeatPolishedCasualContractV2_',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
    );

    expect(extremeHeatContract('polished-casual', { middayFeelsLikeF: 90 })).toBe('');
    expect(extremeHeatContract('polished-casual', { middayFeelsLikeF: 90.1 })).toBe(EXACT_EXTREME_HEAT_CONTRACT);
    expect(extremeHeatContract('polished-casual', { middayFeelsLikeF: 101 })).toBe(EXACT_EXTREME_HEAT_CONTRACT);
    expect(extremeHeatContract('polished-casual', { middayFeelsLikeF: '101' })).toBe('');
    expect(extremeHeatContract('easy', { middayFeelsLikeF: 101 })).toBe('');
    expect(extremeHeatContract('expressive', { middayFeelsLikeF: 101 })).toBe('');
  });

  it('assembles a planner prompt with labels and no long ids or full weather fields', () => {
    const plannerParts = evaluateAppsScript<(
      archetype: string,
      snapshot: object,
      weather: object,
      history: object
    ) => Array<{ text?: string }>>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'plannerPartsV2_',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
    );

    const serialized = JSON.stringify(plannerParts('easy', richSnapshot, richWeather, richHistory));
    expect(serialized).toContain('S009');
    expect(serialized).not.toContain(sneakerId);
    expect(serialized).not.toContain(topId);
    expect(serialized).not.toContain('hourly');
    expect(serialized).not.toContain('fetchedAt');
    expect(serialized).not.toContain('timezone');
    expect(serialized).not.toContain('excludedFromDaily');
    expect(serialized).not.toContain('privateOperationalFlag');
    expect(serialized).not.toContain('privateNote');
  });

  it('anchors every Easy candidate on a label-only shoe contract without shoe rain metadata', () => {
    const rotationSnapshot = {
      wardrobeFingerprint: 'easy-anchor-contract',
      atlasPages: [],
      tasteExamples: [],
      items: Array.from({ length: 5 }, (_, index) => [
        { id: `top-${index}`, shortLabel: `T${index + 1}`, slot: 'top', profile: { warmth: 1, breathability: 4, available: true, excludedFromDaily: false } },
        { id: `bottom-${index}`, shortLabel: `B${index + 1}`, slot: 'bottom', profile: { warmth: 1, breathability: 4, available: true, excludedFromDaily: false } },
        { id: `shoe-${index}`, shortLabel: `S${index + 1}`, slot: 'shoes', profile: { warmth: 1, breathability: 4, rainSafety: 'poor', available: true, excludedFromDaily: false } },
      ]).flat(),
    };
    const rotationHistory = { exactOutfitsPrevious14Days: [], cooldownItemIds: [], wornItemIds: [] };
    const planner = evaluateAppsScript<{
      plannerPartsV2_: (archetype: string, snapshot: object, weather: object, history: object) => Array<{ text?: string }>;
      shoeRotationContextV2_: (snapshot: object, localDate: string, history: object) => { easyAnchorShoeId: string };
    }>(
      ['Weather.gs', 'ItemIndex.gs', 'ShoeRotation.gs', 'Taste.gs', 'PlannerValidation.gs', 'Planner.gs'],
      '({ plannerPartsV2_, shoeRotationContextV2_ })',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
    );

    const rotation = planner.shoeRotationContextV2_(rotationSnapshot, richWeather.localDate, rotationHistory);
    const prompt = planner.plannerPartsV2_('easy', rotationSnapshot, richWeather, rotationHistory)
      .map(part => part.text || '').join('\n');
    const label = rotationSnapshot.items.find(item => item.id === rotation.easyAnchorShoeId)?.shortLabel;

    expect(prompt).toContain(`REQUIRED EASY SHOE ANCHOR: ${label}`);
    expect(prompt).toContain('Use this shoe in all five Easy candidates');
    expect(prompt).toContain('Precipitation must not influence footwear selection');
    expect(prompt).not.toContain(rotation.easyAnchorShoeId);
    expect(prompt).not.toContain('rainSafety');
  });

  it('keeps one deterministic Easy shoe anchor through both targeted replan rounds', () => {
    const rotationSnapshot = {
      wardrobeFingerprint: 'easy-replan-anchor',
      atlasPages: [],
      tasteExamples: [],
      items: Array.from({ length: 5 }, (_, index) => [
        { id: `top-${index}`, shortLabel: `T${index + 1}`, slot: 'top', profile: { warmth: 1, breathability: 4, available: true, excludedFromDaily: false } },
        { id: `bottom-${index}`, shortLabel: `B${index + 1}`, slot: 'bottom', profile: { warmth: 1, breathability: 4, available: true, excludedFromDaily: false } },
        { id: `shoe-${index}`, shortLabel: `S${index + 1}`, slot: 'shoes', profile: { warmth: 1, breathability: 4, rainSafety: 'poor', available: true, excludedFromDaily: false } },
      ]).flat(),
    };
    const rotationHistory = { exactOutfitsPrevious14Days: [], cooldownItemIds: [], wornItemIds: [] };
    const calls: string[] = [];
    let anchorLabel = '';
    const planner = evaluateAppsScript<{
      replanArchetypeV2_: (
        archetype: string, snapshot: object, weather: object, history: object, failureNotes: object[],
        avoidItemIds: string[], usedCandidateIds: string[], round: number
      ) => object;
      shoeRotationContextV2_: (snapshot: object, localDate: string, history: object) => { easyAnchorShoeId: string };
    }>(
      ['Weather.gs', 'ItemIndex.gs', 'ShoeRotation.gs', 'Taste.gs', 'PlannerValidation.gs', 'Planner.gs'],
      '({ replanArchetypeV2_, shoeRotationContextV2_ })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        getNumberPropertyV2_: () => 0.9,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          calls.push(parts.map(part => part.text || '').join('\n'));
          return {
            archetype: 'easy',
            candidates: Array.from({ length: 5 }, (_, index) => ({
              candidateId: `easy-${index}`,
              archetype: 'easy',
              topId: `top-${index}`,
              bottomId: `bottom-${index}`,
              shoeId: anchorLabel,
              itemIds: [`T${index + 1}`, `B${index + 1}`, anchorLabel],
              name: `Easy ${index}`,
              styleSummary: 'Easy proportions keep the outfit relaxed and deliberate.',
              colorStrategy: 'The top accent repeats through the shoe trim for a specific visible connection.',
              weatherSummary: 'Light layers suit the full forecast window.',
              potentialRisks: [],
              plannerConfidence: 0.9,
            })),
          };
        },
      }
    );
    const rotation = planner.shoeRotationContextV2_(rotationSnapshot, richWeather.localDate, rotationHistory);
    const label = rotationSnapshot.items.find(item => item.id === rotation.easyAnchorShoeId)?.shortLabel;
    anchorLabel = label || '';

    planner.replanArchetypeV2_('easy', rotationSnapshot, richWeather, rotationHistory, [], [], [], 1);
    planner.replanArchetypeV2_('easy', rotationSnapshot, richWeather, rotationHistory, [], [], [], 2);

    expect(calls).toHaveLength(2);
    calls.forEach(prompt => {
      expect(prompt).toContain(`REQUIRED EASY SHOE ANCHOR: ${label}`);
      expect(prompt).toContain('Use this shoe in all five Easy candidates');
      expect(prompt).not.toContain(rotation.easyAnchorShoeId);
    });
  });

  it('exposes the validator color-strategy bounds in initial and repair prompts', () => {
    const shortColorStrategy = 'Navy trim echoes white shoes.';
    const plannerSnapshot = {
      items: Array.from({ length: 5 }, (_, index) => [
        { id: `top-${index}`, shortLabel: `T10${index}`, slot: 'top', profile: {} },
        { id: `bottom-${index}`, shortLabel: `B10${index}`, slot: 'bottom', profile: {} },
        { id: `shoe-${index}`, shortLabel: `S10${index}`, slot: 'shoes', profile: {} }
      ]).flat(),
      atlasPages: [],
      tasteExamples: []
    };
    const invalidResponse = {
      archetype: 'polished-casual',
      candidates: Array.from({ length: 5 }, (_, index) => ({
        candidateId: `polished-casual-${index}`,
        archetype: 'polished-casual',
        topId: `top-${index}`,
        bottomId: `bottom-${index}`,
        shoeId: `shoe-${index}`,
        itemIds: [`top-${index}`, `bottom-${index}`, `shoe-${index}`],
        name: `Candidate ${index}`,
        styleSummary: 'The proportions align cleanly across all three pieces.',
        colorStrategy: index === 0
          ? shortColorStrategy
          : 'Navy trim on the top echoes the white shoes across the outfit.',
        weatherSummary: 'The pieces are comfortable across the full day.',
        potentialRisks: [],
        plannerConfidence: 0.9
      }))
    };
    const repairedResponse = {
      ...invalidResponse,
      candidates: invalidResponse.candidates.map((candidate, index) => ({
        ...candidate,
        topId: `T10${index}`,
        bottomId: `B10${index}`,
        shoeId: `S10${index}`,
        itemIds: [`T10${index}`, `B10${index}`, `S10${index}`],
        colorStrategy: 'Navy trim on the top echoes the white shoes across the outfit.'
      }))
    };
    let repairPrompt = '';
    const planner = evaluateAppsScript<{
      plannerPartsV2_: (archetype: string, snapshot: object, weather: object, history: object) => Array<{ text?: string }>;
      validatePlannerResponseV2_: (response: object, archetype: string, snapshot: object) => string[];
      repairPlannerResponseV2_: (
        archetype: string,
        response: object,
        errors: string[],
        snapshot: object,
        weather: object,
        history: object
      ) => object;
    }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'PlannerValidation.gs', 'Planner.gs'],
      '({ plannerPartsV2_, validatePlannerResponseV2_, repairPlannerResponseV2_ })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          repairPrompt = parts.map(part => part.text || '').join('\n');
          return repairedResponse;
        }
      }
    );

    expect(shortColorStrategy).toHaveLength(29);
    const initialPrompt = planner.plannerPartsV2_('polished-casual', plannerSnapshot, extremeHeatWeather, richHistory)[0].text || '';
    const errors = planner.validatePlannerResponseV2_(invalidResponse, 'polished-casual', plannerSnapshot);
    planner.repairPlannerResponseV2_('polished-casual', invalidResponse, errors, plannerSnapshot, extremeHeatWeather, richHistory);

    const contract = 'colorStrategy must be 30–280 characters and name a specific cross-item visual relationship';
    expect(errors).toEqual([`candidate[0].${contract}`]);
    expect(initialPrompt).toContain(contract);
    expect(repairPrompt).toContain(`candidate[0].${contract}`);
    [initialPrompt, repairPrompt].forEach(prompt => {
      expect(prompt.split(EXACT_EXTREME_HEAT_CONTRACT)).toHaveLength(2);
      expect(prompt.indexOf('WEATHER PROFILE:')).toBeLessThan(prompt.indexOf(EXACT_EXTREME_HEAT_CONTRACT));
      expect(prompt.indexOf(EXACT_EXTREME_HEAT_CONTRACT)).toBeLessThan(prompt.indexOf('DAILY ROTATION HISTORY:'));
    });

    const atThreshold = planner.plannerPartsV2_(
      'polished-casual',
      plannerSnapshot,
      { ...extremeHeatWeather, middayFeelsLikeF: 90 },
      richHistory
    )[0].text || '';
    const hotEasy = planner.plannerPartsV2_('easy', plannerSnapshot, extremeHeatWeather, richHistory)[0].text || '';
    const hotExpressive = planner.plannerPartsV2_('expressive', plannerSnapshot, extremeHeatWeather, richHistory)[0].text || '';
    [atThreshold, hotEasy, hotExpressive].forEach(prompt => {
      expect(prompt).not.toContain('EXTREME-HEAT POLISHED-CASUAL CONTRACT:');
    });
  });

  it('sanitizes every item-derived string in the planner complete item index', () => {
    const staleUserId = 'user_closet_1888888888888';
    const staleItemId = 'item_archived_1888888888887';
    const staleSneakerId = 'sneaker_ZZ9999-404';
    const staleImageId = 'img_9999';
    const safeProse = 'sneaker_rotation and img_reference stay readable';
    const leakingSnapshot = {
      ...richSnapshot,
      items: richSnapshot.items.map(item => item.id === topId ? {
        ...item,
        name: `Name ${topId} ${staleUserId}`,
        brand: `Brand ${bottomId} ${staleItemId}`,
        color: `Color ${sneakerId} ${staleSneakerId}`,
        description: `Description ${topId} ${staleImageId}; ${safeProse}`,
        category: `Category ${bottomId} ${staleUserId}`,
        styleCode: `Style ${sneakerId} ${staleImageId}`
      } : item)
    };
    const plannerParts = evaluateAppsScript<(
      archetype: string,
      snapshot: object,
      weather: object,
      history: object
    ) => Array<{ text?: string }>>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'plannerPartsV2_',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
    );

    const indexItem = api.compactItemIndexV2_(leakingSnapshot).find(item => item.label === 'T004');
    expect(indexItem).toEqual(expect.objectContaining({
      label: 'T004',
      slot: 'top',
      name: 'Name T004 INVALID_LABEL',
      brand: 'Brand B002 INVALID_LABEL',
      color: 'Color S009 INVALID_LABEL',
      description: `Description T004 INVALID_LABEL; ${safeProse}`,
      category: 'Category B002 INVALID_LABEL',
      styleCode: 'Style S009 INVALID_LABEL'
    }));

    const prompt = plannerParts('easy', leakingSnapshot, richWeather, richHistory)[0].text || '';
    expect(prompt).toContain('COMPLETE ITEM INDEX:');
    expect(prompt).toContain(safeProse);
    [topId, bottomId, sneakerId, staleUserId, staleItemId, staleSneakerId, staleImageId]
      .forEach(id => expect(prompt).not.toContain(id));
  });

  it('omits malformed top-level item metadata from the real planner index', () => {
    const staleUserId = 'user_closet_1555555555555';
    const staleItemId = 'item_archived_1555555555554';
    const staleSneakerId = 'sneaker_WW6666-101';
    const staleImageId = 'img_6666';
    const safeProse = 'sneaker_rotation and img_reference stay readable';
    const malformedSnapshot = {
      ...richSnapshot,
      tasteExamples: [],
      items: richSnapshot.items.map(item => {
        if (item.id === topId) {
          return {
            ...item,
            name: { current: topId, stale: staleUserId, marker: 'private malformed name' },
            brand: [bottomId, staleItemId, 'private malformed brand'],
            category: { current: sneakerId, stale: staleSneakerId, marker: 'private malformed category' },
            color: [topId, staleImageId, 'private malformed color'],
            description: {
              current: bottomId,
              stale: staleUserId,
              nested: [staleSneakerId, staleImageId],
              marker: 'private malformed description'
            },
            styleCode: [sneakerId, staleSneakerId, staleImageId, 'private malformed styleCode']
          };
        }
        if (item.id === bottomId) {
          return {
            ...item,
            name: `Valid name ${topId} ${staleUserId}`,
            brand: `Valid brand ${bottomId} ${staleItemId}`,
            category: `Valid category ${sneakerId} ${staleSneakerId}`,
            color: `valid olive ${topId} ${staleImageId}`,
            description: `Valid description ${bottomId} ${staleUserId}; ${safeProse}`,
            styleCode: `Valid style ${sneakerId} ${staleImageId}`
          };
        }
        return item;
      })
    };
    const plannerParts = evaluateAppsScript<(
      archetype: string,
      snapshot: object,
      weather: object,
      history: object
    ) => Array<{ text?: string }>>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'plannerPartsV2_',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
    );

    const index = api.compactItemIndexV2_(malformedSnapshot);
    const malformedItem = index.find(item => item.label === 'T004')!;
    expect(malformedItem).toEqual(expect.objectContaining({
      label: 'T004',
      slot: 'top',
      styleCode: null
    }));
    ['name', 'brand', 'category', 'color', 'description']
      .forEach(field => expect(malformedItem).not.toHaveProperty(field));

    expect(index.find(item => item.label === 'B002')).toEqual(expect.objectContaining({
      label: 'B002',
      slot: 'bottom',
      name: 'Valid name T004 INVALID_LABEL',
      brand: 'Valid brand B002 INVALID_LABEL',
      category: 'Valid category S009 INVALID_LABEL',
      color: 'valid olive T004 INVALID_LABEL',
      description: `Valid description B002 INVALID_LABEL; ${safeProse}`,
      styleCode: 'Valid style S009 INVALID_LABEL'
    }));

    const prompt = plannerParts('easy', malformedSnapshot, richWeather, richHistory)[0].text || '';
    expect(prompt).toContain('COMPLETE ITEM INDEX:');
    expect(prompt).toContain('"label":"T004","slot":"top","styleCode":null');
    expect(prompt).toContain(safeProse);
    expect(prompt).not.toContain('private malformed');
    [topId, bottomId, sneakerId, staleUserId, staleItemId, staleSneakerId, staleImageId]
      .forEach(id => expect(prompt).not.toContain(id));
  });

  it('sanitizes and type-filters every model-facing profile field in the planner item index', () => {
    const staleUserId = 'user_closet_1777777777777';
    const staleItemId = 'item_archived_1777777777776';
    const staleSneakerId = 'sneaker_YY8888-303';
    const staleImageId = 'img_8888';
    const profileSnapshot = {
      ...richSnapshot,
      items: richSnapshot.items.map(item => item.id === topId ? {
        ...item,
        profile: {
          warmth: 3,
          breathability: 4,
          rainSafety: `good ${topId} ${staleUserId}`,
          windProtection: 2,
          formality: 1,
          silhouette: `regular ${bottomId} ${staleItemId}`,
          patternIntensity: 5,
          primaryColorFamily: `warm brown ${sneakerId} ${staleSneakerId}`,
          secondaryColorFamily: `soft cream ${topId} ${staleImageId}`,
          accentColors: [
            `black ${topId} ${staleUserId}`,
            `rust ${bottomId} ${staleItemId}`,
            `cream ${sneakerId} ${staleSneakerId}`,
            `white ${topId} ${staleImageId}`,
            42,
            null,
            { color: 'private malformed entry' }
          ],
          privateNote: 'never expose this'
        }
      } : item)
    };
    const plannerParts = evaluateAppsScript<(
      archetype: string,
      snapshot: object,
      weather: object,
      history: object
    ) => Array<{ text?: string }>>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'plannerPartsV2_',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
    );

    const indexItem = api.compactItemIndexV2_(profileSnapshot).find(item => item.label === 'T004');
    expect(indexItem?.profile).toEqual({
      warmth: 3,
      breathability: 4,
      rainSafety: 'good T004 INVALID_LABEL',
      windProtection: 2,
      formality: 1,
      silhouette: 'regular B002 INVALID_LABEL',
      patternIntensity: 5,
      primaryColorFamily: 'warm brown S009 INVALID_LABEL',
      secondaryColorFamily: 'soft cream T004 INVALID_LABEL',
      accentColors: [
        'black T004 INVALID_LABEL',
        'rust B002 INVALID_LABEL',
        'cream S009 INVALID_LABEL',
        'white T004 INVALID_LABEL'
      ]
    });

    const prompt = plannerParts('easy', profileSnapshot, richWeather, richHistory)[0].text || '';
    expect(prompt).toContain('COMPLETE ITEM INDEX:');
    expect(prompt).toContain('good T004 INVALID_LABEL');
    expect(prompt).toContain('regular B002 INVALID_LABEL');
    expect(prompt).toContain('warm brown S009 INVALID_LABEL');
    expect(prompt).toContain('soft cream T004 INVALID_LABEL');
    expect(prompt).toContain('"warmth":3');
    expect(prompt).not.toContain('private malformed entry');
    [topId, bottomId, sneakerId, staleUserId, staleItemId, staleSneakerId, staleImageId]
      .forEach(id => expect(prompt).not.toContain(id));
  });

  it('resolves batch and standalone planner responses before deterministic validation', () => {
    const validated: Array<Record<string, unknown>> = [];
    const planner = evaluateAppsScript<{
      runAllPlannersV2_: (snapshot: object, weather: object, history: object) => Array<{ candidates: Array<{ shoeId: string }> }>;
      runPlannerV2: (archetype: string) => { candidates: Array<{ shoeId: string }> };
    }>(
      ['ItemIndex.gs', 'Planner.gs'],
      '({ runAllPlannersV2_, runPlannerV2 })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        sharedTwoCoreSavedOutfitsV2_: () => [],
        modelWeatherViewV2_: (weather: typeof richWeather) => ({
          localDate: weather.localDate,
          locationLabel: weather.locationLabel,
          morningFeelsLikeF: weather.morningFeelsLikeF,
          middayFeelsLikeF: weather.middayFeelsLikeF,
          eveningFeelsLikeF: weather.eveningFeelsLikeF,
          rainExpected: weather.rainExpected
        }),
        buildTasteSummaryV2_: () => [],
        getNumberPropertyV2_: () => 0.9,
        callGeminiBatchV2_: (_stage: string, calls: Array<{ context: string }>) => calls.map(call => labelPlannerResponse(call.context)),
        callGeminiV2_: () => labelPlannerResponse('easy'),
        validatePlannerResponseV2_: (response: Record<string, unknown>) => {
          validated.push(structuredClone(response));
          return [];
        },
        assertFreshSnapshotV2_: (value: object) => value,
        loadSnapshotV2_: () => richSnapshot,
        fetchDailyWeatherV2: () => richWeather,
        dailyHistoryContextV2_: () => richHistory
      }
    );

    const batch = planner.runAllPlannersV2_(richSnapshot, richWeather, richHistory);
    const standalone = planner.runPlannerV2('easy');
    expect(batch.every(response => response.candidates[0].shoeId === sneakerId)).toBe(true);
    expect(standalone.candidates[0].shoeId).toBe(sneakerId);
    expect(validated).toHaveLength(4);
    expect(validated.every(response => (response.candidates as Array<{ topId: string }>)[0].topId === topId)).toBe(true);
  });

  it('routes null and non-array planner outputs through repair in batch and standalone flows', () => {
    const malformed = [
      null,
      { archetype: 'easy', candidates: { malformed: true, wardrobeId: staleLongId } }
    ];
    let standaloneIndex = 0;
    let malformedValidated = 0;
    let repairCalls = 0;
    const planner = evaluateAppsScript<{
      runAllPlannersV2_: (snapshot: object, weather: object, history: object) => Array<Record<string, unknown>>;
      runPlannerV2: (archetype: string) => Record<string, unknown>;
    }>(
      ['ItemIndex.gs', 'Planner.gs'],
      '({ runAllPlannersV2_, runPlannerV2 })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        sharedTwoCoreSavedOutfitsV2_: () => [],
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        getNumberPropertyV2_: () => 0.9,
        callGeminiBatchV2_: () => [malformed[0], malformed[1], labelPlannerResponse('expressive')],
        callGeminiV2_: (stage: string) => {
          if (stage === 'repair') {
            repairCalls += 1;
            return labelPlannerResponse('easy');
          }
          const response = malformed[standaloneIndex];
          standaloneIndex += 1;
          return response;
        },
        validatePlannerResponseV2_: (response: unknown) => {
          if (!response || typeof response !== 'object' || !Array.isArray((response as { candidates?: unknown }).candidates)) {
            malformedValidated += 1;
            return ['exactly five candidates are required'];
          }
          return [];
        },
        assertFreshSnapshotV2_: (value: object) => value,
        loadSnapshotV2_: () => richSnapshot,
        fetchDailyWeatherV2: () => richWeather,
        dailyHistoryContextV2_: () => richHistory
      }
    );

    const batch = planner.runAllPlannersV2_(richSnapshot, richWeather, richHistory);
    const standaloneNull = planner.runPlannerV2('easy');
    const standaloneNonArray = planner.runPlannerV2('easy');

    expect(batch).toHaveLength(3);
    expect(standaloneNull).toHaveProperty('candidates');
    expect(standaloneNonArray).toHaveProperty('candidates');
    expect(malformedValidated).toBe(4);
    expect(repairCalls).toBe(4);
  });

  it.each([
    ['null candidate records', () => Array.from({ length: 5 }, () => null)],
    ['truthy non-array candidate fields', () => Array.from({ length: 5 }, (_, index) => ({
      candidateId: `easy-invalid-${index}`,
      archetype: 'easy',
      topId: `top-${index}`,
      bottomId: `bottom-${index}`,
      shoeId: `shoe-${index}`,
      itemIds: { malformed: true },
      name: 'Malformed candidate',
      styleSummary: 'Malformed candidate summary',
      colorStrategy: 'A deliberately long but structurally malformed color strategy.',
      weatherSummary: 'Malformed weather summary',
      potentialRisks: { malformed: true },
      plannerConfidence: 0.5
    }))]
  ])('routes nested planner output with %s through exactly one repair', (_case, malformedCandidates) => {
    const plannerSnapshot = {
      items: Array.from({ length: 5 }, (_, index) => [
        { id: `top-${index}`, shortLabel: `T10${index}`, slot: 'top', profile: {} },
        { id: `bottom-${index}`, shortLabel: `B10${index}`, slot: 'bottom', profile: {} },
        { id: `shoe-${index}`, shortLabel: `S10${index}`, slot: 'shoes', profile: {} }
      ]).flat(),
      atlasPages: [],
      tasteExamples: []
    };
    const validRepair = {
      archetype: 'easy',
      candidates: Array.from({ length: 5 }, (_, index) => ({
        candidateId: `easy-${index}`,
        archetype: 'easy',
        topId: `T10${index}`,
        bottomId: `B10${index}`,
        shoeId: `S10${index}`,
        itemIds: [`T10${index}`, `B10${index}`, `S10${index}`],
        name: `Valid candidate ${index}`,
        styleSummary: 'The proportions align cleanly across all three pieces.',
        colorStrategy: 'The top, bottom, and shoes share a deliberate tonal color relationship.',
        weatherSummary: 'The pieces are comfortable across the full day.',
        potentialRisks: [],
        plannerConfidence: 0.9
      }))
    };
    let repairCalls = 0;
    const planner = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object
    ) => Array<{ candidates: Array<{ itemIds: string[] }> }>>(
      ['ItemIndex.gs', 'Taste.gs', 'PlannerValidation.gs', 'Planner.gs'],
      'runAllPlannersV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy'] },
        console,
        modelWeatherViewV2_: () => ({}),
        getNumberPropertyV2_: () => 0.9,
        callGeminiBatchV2_: () => [{ archetype: 'easy', candidates: malformedCandidates() }],
        callGeminiV2_: () => {
          repairCalls += 1;
          return validRepair;
        }
      }
    );

    const result = planner(plannerSnapshot, richWeather, richHistory);

    expect(repairCalls).toBe(1);
    expect(result[0].candidates[0].itemIds).toEqual(['top-0', 'bottom-0', 'shoe-0']);
  });

  it.each([
    ['null candidate records', () => Array.from({ length: 5 }, () => null)],
    ['truthy non-array candidate fields', () => Array.from({ length: 5 }, (_, index) => ({
      ...labelCandidate(),
      candidateId: `easy-invalid-${index}`,
      itemIds: { malformed: true },
      potentialRisks: { malformed: true }
    }))]
  ])('rejects planner repair-model output with %s without a raw TypeError', (_case, malformedCandidates) => {
    let repairCalls = 0;
    const planner = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object
    ) => unknown>(
      ['ItemIndex.gs', 'Taste.gs', 'PlannerValidation.gs', 'Planner.gs'],
      'runAllPlannersV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy'] },
        console,
        modelWeatherViewV2_: () => ({}),
        getNumberPropertyV2_: () => 0.9,
        callGeminiBatchV2_: () => [{ archetype: 'easy', candidates: malformedCandidates() }],
        callGeminiV2_: () => {
          repairCalls += 1;
          return { archetype: 'easy', candidates: malformedCandidates() };
        }
      }
    );

    expect(() => planner(richSnapshot, richWeather, richHistory)).toThrow(/^easy planner repair failed:/);
    expect(repairCalls).toBe(1);
  });

  it('repairs invented planner labels through closed prompts in batch and standalone flows', () => {
    const invalidCandidate = {
      ...labelCandidate(),
      shoeId: 'S999',
      itemIds: ['T004', 'B002', { wardrobeId: staleLongId }],
      potentialRisks: [`Do not expose ${staleLongId}`]
    };
    const invalidResponse = { archetype: 'easy', candidates: [invalidCandidate] };
    const repairPrompts: string[] = [];
    const planner = evaluateAppsScript<{
      runAllPlannersV2_: (snapshot: object, weather: object, history: object) => Array<Record<string, unknown>>;
      runPlannerV2: (archetype: string) => Record<string, unknown>;
    }>(
      ['ItemIndex.gs', 'Planner.gs'],
      '({ runAllPlannersV2_, runPlannerV2 })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        sharedTwoCoreSavedOutfitsV2_: () => [],
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        getNumberPropertyV2_: () => 0.9,
        callGeminiBatchV2_: () => [invalidResponse, labelPlannerResponse('polished-casual'), labelPlannerResponse('expressive')],
        callGeminiV2_: (stage: string, parts: Array<{ text?: string }>) => {
          if (stage === 'repair') {
            repairPrompts.push(parts.map(part => part.text || '').join('\n'));
            return labelPlannerResponse('easy');
          }
          return invalidResponse;
        },
        validatePlannerResponseV2_: (response: { candidates?: Array<{ shoeId?: string }> } | null) => {
          const candidate = response?.candidates?.[0];
          return candidate?.shoeId === 'S999'
            ? [`candidate[0] contains invented item ${staleLongId}`]
            : [];
        },
        assertFreshSnapshotV2_: (value: object) => value,
        loadSnapshotV2_: () => richSnapshot,
        fetchDailyWeatherV2: () => richWeather,
        dailyHistoryContextV2_: () => richHistory
      }
    );

    planner.runAllPlannersV2_(richSnapshot, richWeather, richHistory);
    planner.runPlannerV2('easy');

    expect(repairPrompts).toHaveLength(2);
    repairPrompts.forEach(prompt => {
      expect(prompt).toContain('INVALID_LABEL');
      expect(prompt).not.toContain('S999');
      expect(prompt).not.toContain(staleLongId);
      expect(prompt).not.toContain('wardrobeId');
    });
  });

  it('captures a planner repair prompt without real ids and resolves its response before validation', () => {
    let capturedParts: Array<{ text?: string }> = [];
    let validatedResolvedResponse = false;
    const repairPlanner = evaluateAppsScript<(
      archetype: string,
      invalidResponse: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object
    ) => { candidates: Array<{ shoeId: string }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'repairPlannerResponseV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          capturedParts = parts;
          return labelPlannerResponse('easy');
        },
        validatePlannerResponseV2_: (response: { candidates: Array<{ shoeId: string }> }) => {
          validatedResolvedResponse = response.candidates[0].shoeId === sneakerId;
          return [];
        }
      }
    );

    const result = repairPlanner('easy', {
      archetype: 'easy',
      candidates: [internalCandidate()],
      privateNested: { wardrobeId: sneakerId }
    }, ['candidate[0].itemIds does not match its slots'], richSnapshot, richWeather, richHistory);
    const serialized = JSON.stringify(capturedParts);
    expect(serialized).toContain('S009');
    expect(serialized).not.toContain(sneakerId);
    expect(serialized).not.toContain(topId);
    expect(serialized).not.toContain('privateNested');
    expect(serialized).not.toContain('hourly');
    expect(validatedResolvedResponse).toBe(true);
    expect(result.candidates[0].shoeId).toBe(sneakerId);
  });

  it('keeps targeted replan guidance optional, closed, label-safe, and present in both rounds', () => {
    const calls: Array<{ stage: string; prompt: string }> = [];
    const response = {
      archetype: 'polished-casual',
      candidates: Array.from({ length: 5 }, (_, index) => ({
        ...labelCandidate('polished-casual'),
        candidateId: `polished-casual-targeted-${index}`
      }))
    };
    const planner = evaluateAppsScript<{
      plannerPartsV2_: (archetype: string, snapshot: object, weather: object, history: object, guidance?: string) => Array<{ text?: string }>;
      replanArchetypeV2_: (
        archetype: string,
        snapshot: object,
        weather: object,
        history: object,
        failureNotes: object[],
        avoidItemIds: string[],
        usedCandidateIds: string[],
        round: number
      ) => { candidates: Array<{ topId: string }> };
    }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      `({
        plannerPartsV2_,
        replanArchetypeV2_: typeof replanArchetypeV2_ === 'function' ? replanArchetypeV2_ : null
      })`,
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        getNumberPropertyV2_: () => 0.9,
        callGeminiV2_: (stage: string, parts: Array<{ text?: string }>) => {
          calls.push({ stage, prompt: parts.map(part => part.text || '').join('\n') });
          return response;
        },
        validatePlannerResponseV2_: () => []
      }
    );
    expect(planner.replanArchetypeV2_).toBeTypeOf('function');
    if (!planner.replanArchetypeV2_) return;

    const ordinary = JSON.stringify(planner.plannerPartsV2_('easy', richSnapshot, richWeather, richHistory));
    expect(ordinary).not.toContain('TARGETED RE-PLAN ROUND');
    const roundOne = planner.replanArchetypeV2_(
      'polished-casual',
      richSnapshot,
      extremeHeatWeather,
      richHistory,
      [{
        candidateId: 'polished-casual-previous',
        criticalDefects: [`Current ${topId}`, `stale ${staleLongId}`],
        reservations: ['ordinary reservation'],
        privateNested: { wardrobeId: sneakerId }
      }],
      [topId, sneakerId],
      ['easy-initial-0', 'polished-casual-initial-0', 'expressive-initial-0'],
      1
    );
    const roundOneReturnedIds = response.candidates.map(candidate => candidate.candidateId);
    const roundTwo = planner.replanArchetypeV2_(
      'polished-casual',
      richSnapshot,
      extremeHeatWeather,
      richHistory,
      [{
        candidateId: 'polished-casual-previous',
        criticalDefects: [`Current ${topId}`, `stale ${staleLongId}`],
        reservations: ['ordinary reservation'],
        privateNested: { wardrobeId: sneakerId }
      }],
      [topId, sneakerId],
      [
        'easy-initial-0',
        'polished-casual-initial-0',
        'expressive-initial-0',
        ...roundOneReturnedIds,
        'polished-casual-duplicate-disposition-0',
      ],
      2
    );

    expect(calls.map(call => call.stage)).toEqual(['planner', 'planner']);
    calls.forEach(({ prompt }, index) => {
      expect(prompt).toContain(`TARGETED RE-PLAN ROUND ${index + 1}`);
      expect(prompt).toContain('Do not reuse any candidateId from this run-wide list:');
      expect(prompt).toContain('T004, S009');
      expect(prompt).toContain('ordinary reservation');
      expect(prompt).not.toContain(topId);
      expect(prompt).not.toContain(sneakerId);
      expect(prompt).not.toContain(staleLongId);
      expect(prompt).not.toContain('privateNested');
      expect(prompt.split(EXACT_EXTREME_HEAT_CONTRACT)).toHaveLength(2);
      expect(prompt.indexOf('WEATHER PROFILE:')).toBeLessThan(prompt.indexOf(EXACT_EXTREME_HEAT_CONTRACT));
      expect(prompt.indexOf(EXACT_EXTREME_HEAT_CONTRACT)).toBeLessThan(prompt.indexOf('DAILY ROTATION HISTORY:'));
    });
    expect(calls[1].prompt).toContain(JSON.stringify([
      'easy-initial-0',
      'polished-casual-initial-0',
      'expressive-initial-0',
      ...roundOneReturnedIds,
      'polished-casual-duplicate-disposition-0',
    ]));
    expect(roundOne.candidates[0].topId).toBe(topId);
    expect(roundTwo.candidates[0].topId).toBe(topId);
  });

  it.each([
    ['null response', null, 'easy'],
    ['object-valued archetype', {
      archetype: { value: 'easy', privateNested: { wardrobeId: sneakerId } },
      candidates: []
    }, 'easy'],
    ['non-array candidates', {
      archetype: 'polished-casual',
      candidates: { malformed: true, privateNested: { wardrobeId: sneakerId } }
    }, 'polished-casual']
  ])('repairs malformed planner input (%s) through a closed envelope', (_case, invalidResponse, expectedArchetype) => {
    let capturedParts: Array<{ text?: string }> = [];
    const repairPlanner = evaluateAppsScript<(
      archetype: string,
      invalidResponse: unknown,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object
    ) => { candidates: Array<{ shoeId: string }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'repairPlannerResponseV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          capturedParts = parts;
          return labelPlannerResponse('easy');
        },
        validatePlannerResponseV2_: () => []
      }
    );

    const result = repairPlanner(
      'easy',
      invalidResponse,
      ['exactly five candidates are required'],
      richSnapshot,
      richWeather,
      richHistory
    );
    const repairInstruction = capturedParts[0]?.text || '';
    expect(repairInstruction).toContain('INVALID RESPONSE:\n' + JSON.stringify({ archetype: expectedArchetype, candidates: [] }));
    expect(repairInstruction).not.toContain(sneakerId);
    expect(repairInstruction).not.toContain('privateNested');
    expect(repairInstruction).not.toContain('malformed');
    expect(result.candidates[0].shoeId).toBe(sneakerId);
  });

  it('keeps the same exact score anchors in primary and repair critic prompts', () => {
    const calls: Array<{ stage: string; parts: Array<{ text?: string }> }> = [];
    const candidates = ['easy', 'polished-casual', 'expressive'].flatMap(archetype =>
      Array.from({ length: 2 }, (_, index) => ({ ...internalCandidate(archetype), candidateId: `${archetype}-${index}` }))
    );
    const validRepair = {
      scores: candidates.map(candidate => ({
        candidateId: candidate.candidateId,
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
        criticalDefects: [],
        reservations: []
      }))
    };
    const critic = evaluateAppsScript<{
      criticScoreAnchorsV2_: () => string;
      runCriticV2_: (snapshot: object, weather: object, history: object, planners: object[]) => object;
    }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'],
      '({ criticScoreAnchorsV2_, runCriticV2_ })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (stage: string, parts: Array<{ text?: string }>) => {
          calls.push({ stage, parts });
          return stage === 'critic'
            ? { scores: { malformed: true }, privateWardrobeId: sneakerId }
            : validRepair;
        }
      }
    );

    critic.runCriticV2_(richSnapshot, richWeather, richHistory, [{ candidates }]);
    const anchors = critic.criticScoreAnchorsV2_();
    const primary = calls[0].parts.map(part => part.text || '').join('\n');
    const repair = calls[1].parts.map(part => part.text || '').join('\n');
    expect(calls.map(call => call.stage)).toEqual(['critic', 'repair']);
    expect(primary.split(anchors)).toHaveLength(2);
    expect(repair.split(anchors)).toHaveLength(2);
    expect(primary).toContain('Score all 6 candidates independently');
    expect(primary).toContain('an honest low score is more useful than a generous one');
    expect(repair).toContain('an honest low score is more useful than a generous one');
    expect(primary).toContain('Precipitation must not lower weather, wearability, or any other score because of footwear. Judge weather suitability from garments and layers only.');
    expect(repair).toContain('Precipitation must not lower weather, wearability, or any other score because of footwear. Judge weather suitability from garments and layers only.');
    expect(primary).not.toMatch(/select exactly two|finalists per archetype/i);
    expect(repair).not.toMatch(/select exactly two|finalists per archetype|force a result/i);
    expect(primary).not.toContain(sneakerId);
    expect(repair).not.toContain(sneakerId);
    expect(primary).not.toContain('hourly');
    expect(repair).not.toContain('fetchedAt');

    const source = apps('Critic.gs');
    expect(source.match(/criticScoreAnchorsV2_\(\)/g)).toHaveLength(3);
    expect(source).toContain('weather: 10 = ideal across the whole 6:00–23:00 window');
    expect(source).toContain('wearability: 9–10 = zero-friction for an ordinary day');
  });

  it('states the exact saved-outfit planner and critic policy while preserving the freshness anchor', () => {
    const plannerSource = apps('Planner.gs');
    const criticSource = apps('Critic.gs');
    expect(plannerSource).toContain(
      'Saved outfits are style-grammar examples, never unlabeled templates. Never reproduce the exact core trio of a saved outfit. Sharing two core pieces is acceptable only when the third piece meaningfully changes the look.'
    );
    expect(criticSource).toContain(
      'Penalize weather risk heavily and disqualify clear weather mismatch, obvious color conflict, incoherent formality, uncertain item identification, an exact recent repeat, an exact manual saved-outfit core trio, or material duplication of a stronger candidate.'
    );
    expect(criticSource).toContain(
      '- freshness: 9–10 = a genuinely new combination of non-over-exposed items; 7–8 = familiar items in new relationships; 5–6 = leans on over-exposed items or echoes a recent look; ≤4 = barely differs from a recent email, or shares two core pieces with a saved outfit without transforming it. Verified wore/liked feedback on similar looks lifts this score.'
    );
  });

  it('returns a shuffled valid direct critic response in supplied candidate order without rewriting scores', () => {
    const candidates = criticCandidates();
    const orderedScores = candidates.map((candidate, index) => ({
      ...criticScore(candidate.candidateId),
      ...(index === 0 ? {
        weather: 2,
        palette: 3,
        colorIntent: 1,
        disqualified: true,
        criticalDefects: ['Unsafe across the forecast window.'],
        reservations: ['The palette is unresolved.']
      } : {})
    }));
    const shuffledResponse = { scores: orderedScores.slice().reverse() };
    const stages: string[] = [];
    const runCriticCandidates = criticCandidateRunner((stage: string) => {
      stages.push(stage);
      return shuffledResponse;
    });

    const result = runCriticCandidates(richSnapshot, richWeather, richHistory, candidates);

    expect(stages).toEqual(['critic']);
    expect(result.scores.map(score => score.candidateId)).toEqual(candidates.map(candidate => candidate.candidateId));
    result.scores.forEach((score, index) => expect(score).toBe(orderedScores[index]));
  });

  it('normalizes valid direct critic scores for opaque prototype-key candidate ids', () => {
    const opaqueIds = ['__proto__', 'constructor', 'toString'];
    const candidates = opaqueIds.map(candidateId => ({ ...internalCandidate(), candidateId }));
    const orderedScores = opaqueIds.map(candidateId => criticScore(candidateId));
    const runCriticCandidates = criticCandidateRunner(() => ({ scores: orderedScores.slice().reverse() }));

    const result = runCriticCandidates(richSnapshot, richWeather, richHistory, candidates);

    expect(result.scores.map(score => score.candidateId)).toEqual(opaqueIds);
    result.scores.forEach((score, index) => expect(score).toBe(orderedScores[index]));
  });

  it.each([
    ['missing', (scores: CriticScore[]) => scores.slice(1)],
    ['duplicate', (scores: CriticScore[]) => [scores[0], scores[0], ...scores.slice(2)]],
    ['unknown', (scores: CriticScore[]) => [{ ...scores[0], candidateId: 'unknown-candidate' }, ...scores.slice(1)]]
  ])('repairs a %s critic score set once and returns the shuffled repair in candidate order', (_case, invalidScores) => {
    const candidates = criticCandidates();
    const orderedScores = candidates.map(candidate => criticScore(candidate.candidateId));
    const stages: string[] = [];
    const runCriticCandidates = criticCandidateRunner((stage: string) => {
      stages.push(stage);
      return stage === 'critic'
        ? { scores: invalidScores(orderedScores) }
        : { scores: orderedScores.slice().reverse() };
    });

    const result = runCriticCandidates(richSnapshot, richWeather, richHistory, candidates);

    expect(stages).toEqual(['critic', 'repair']);
    expect(result.scores.map(score => score.candidateId)).toEqual(candidates.map(candidate => candidate.candidateId));
    result.scores.forEach((score, index) => expect(score).toBe(orderedScores[index]));
  });

  it('keeps a shuffled targeted critic batch aligned with candidate append order for persisted replay', () => {
    const archetypes = ['easy', 'polished-casual', 'expressive'];
    const candidate = (candidateId: string, archetype: string, itemIndex: number) => ({
      candidateId,
      archetype,
      topId: `target-top-${itemIndex}`,
      bottomId: `target-bottom-${itemIndex}`,
      shoeId: `target-shoe-${itemIndex}`,
      itemIds: [`target-top-${itemIndex}`, `target-bottom-${itemIndex}`, `target-shoe-${itemIndex}`]
    });
    const initial = archetypes.flatMap((archetype, groupIndex) =>
      Array.from({ length: 5 }, (_, index) => candidate(
        `${archetype}-${index}`,
        archetype,
        groupIndex * 5 + index
      ))
    );
    const additions = Array.from({ length: 5 }, (_, index) => candidate(
      `easy-replan-${index}`,
      'easy',
      15 + index
    ));
    const item = (id: string, slot: string) => ({
      id,
      slot,
      profile: {
        primaryColorFamily: id,
        silhouette: 'regular',
        warmth: 1,
        breathability: 4,
        rainSafety: 'good',
        available: true,
        excludedFromDaily: false
      }
    });
    const selectionSnapshot = {
      settings: {},
      tasteExamples: [],
      items: Array.from({ length: 20 }, (_, index) => [
        item(`target-top-${index}`, 'top'),
        item(`target-bottom-${index}`, 'bottom'),
        item(`target-shoe-${index}`, 'shoes')
      ]).flat()
    };
    const initialScores = initial.map(value => ({
      ...criticScore(value.candidateId),
      ...(value.archetype === 'easy' ? { weather: 2, disqualified: true } : {})
    }));
    const additionScores = additions.map(value => criticScore(value.candidateId));
    const runSelection = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      planners: object[],
      critic: object
    ) => { candidates: Array<{ candidateId: string }>; critic: { scores: CriticScore[] } }>(
      ['Config.gs', 'Critic.gs', 'Selection.gs'],
      'runSelectionV2_',
      {
        console,
        archetypeBriefV2_: () => 'brief',
        modelWeatherViewV2_: () => ({}),
        modelFacingHistoryV2_: () => ({}),
        historyGuidanceV2_: () => '',
        buildTasteSummaryV2_: () => [],
        modelFacingCandidatesV2_: (values: object[]) => values,
        candidateImagePartsV2_: () => [],
        replanArchetypeV2_: () => ({ archetype: 'easy', candidates: additions }),
        savedOutfitExactCopyV2_: () => null,
        weatherSafetyErrorsV2_: () => [],
        callGeminiV2_: () => ({ scores: additionScores.slice().reverse() })
      }
    );

    const result = runSelection(
      selectionSnapshot,
      { rainExpected: false, layerGuidance: 'none' },
      { exactOutfitsPrevious14Days: [], cooldownItemIds: [] },
      archetypes.map(archetype => ({
        archetype,
        candidates: initial.filter(value => value.archetype === archetype)
      })),
      { scores: initialScores }
    );
    const persistedCandidateOrder = result.candidates.map(value => value.candidateId);

    expect(result.critic.scores.map(score => score.candidateId)).toEqual(persistedCandidateOrder);
    expect(persistedCandidateOrder).toEqual(initial.concat(additions).map(value => value.candidateId));
  });

  it.each([
    ['scores containing only null', {
      scores: [null]
    }],
    ['a full score array containing null', {
      scores: [
        null,
        criticScore('easy-1'),
        criticScore('polished-casual-0'),
        criticScore('polished-casual-1'),
        criticScore('expressive-0'),
        criticScore('expressive-1')
      ]
    }],
    ['truthy non-array scores', {
      scores: { malformed: true }
    }]
  ])('routes critic output with %s through exactly one repair', (_case, malformedCritic) => {
    let repairCalls = 0;
    const critic = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      planners: object[]
    ) => ReturnType<typeof validCriticResponse>>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'],
      'runCriticV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        callGeminiV2_: (stage: string) => {
          if (stage === 'repair') {
            repairCalls += 1;
            return validCriticResponse();
          }
          return malformedCritic;
        }
      }
    );

    const result = critic(richSnapshot, richWeather, richHistory, [{ candidates: criticCandidates() }]);

    expect(repairCalls).toBe(1);
    expect(result.scores.map(score => score.candidateId)).toEqual(criticCandidates().map(candidate => candidate.candidateId));
  });

  it('rejects malformed critic repair-model records with a deterministic quality-gate error', () => {
    let repairCalls = 0;
    const malformedRepair = validCriticResponse();
    malformedRepair.scores[0] = null as never;
    const critic = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      planners: object[]
    ) => unknown>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'],
      'runCriticV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        callGeminiV2_: (stage: string) => {
          if (stage === 'repair') {
            repairCalls += 1;
            return malformedRepair;
          }
          return { scores: [] };
        }
      }
    );

    expect(() => critic(richSnapshot, richWeather, richHistory, [{ candidates: criticCandidates() }]))
      .toThrow(/^Critic repair failed quality gates:/);
    expect(repairCalls).toBe(1);
  });

  it('keeps the score-only critic model view total for malformed nested records', () => {
    const criticViews = evaluateAppsScript<{
      modelFacingCriticResponseV2_: (response: unknown, snapshot: object) => object;
    }>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'],
      '({ modelFacingCriticResponseV2_ })',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console
      }
    );

    expect(criticViews.modelFacingCriticResponseV2_({
      scores: [null, 'bad', { candidateId: 'easy-0', criticalDefects: { malformed: true } }],
      privateFinalists: { expressive: ['expressive-0'] }
    }, richSnapshot)).toEqual({
      scores: [{}, {}, { candidateId: 'easy-0' }]
    });
    expect(apps('Critic.gs')).not.toContain('criticFinalistIdsV2_');
  });

  it('scrubs current and stale wardrobe ids from critic repair, curator, and final-repair prompts', () => {
    const leakingCandidates = criticCandidates();
    Object.assign(leakingCandidates[0], {
      name: `Current ${topId}; stale ${staleLongId}`,
      styleSummary: `Current ${bottomId}; stale ${staleItemId}`,
      colorStrategy: `Current ${sneakerId}; stale img_9999`,
      weatherSummary: `Current ${topId}; stale sneaker_ZZ9999-404`,
      potentialRisks: [`Current ${bottomId}`, `Stale ${staleLongId}`, 'Useful ordinary candidate prose remains.'],
    });
    const leakingCritic = validCriticResponse();
    leakingCritic.scores[0] = {
      ...leakingCritic.scores[0],
      criticalDefects: [`Current ${topId}`, `Stale ${staleLongId}`, `Stale item ${staleItemId}`, 'Useful ordinary defect prose remains.'],
      reservations: [`Current ${sneakerId}`, `Stale ${staleLongId}`, `Stale item ${staleItemId}`, 'Useful ordinary reservation prose remains.']
    };
    leakingCritic.scores[1] = null as never;
    const captured: Record<string, string> = {};
    const critic = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      planners: object[]
    ) => object>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'],
      'runCriticV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        callGeminiV2_: (stage: string, parts: Array<{ text?: string }>) => {
          if (stage === 'repair') {
            captured.criticRepair = parts.map(part => part.text || '').join('\n');
            return validCriticResponse();
          }
          captured.critic = parts.map(part => part.text || '').join('\n');
          return leakingCritic;
        }
      }
    );
    critic(richSnapshot, richWeather, richHistory, [{ candidates: leakingCandidates }]);

    const curator = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object
    ) => object>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Selection.gs', 'Curator.gs'],
      'runCuratorV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          captured.curator = parts.map(part => part.text || '').join('\n');
          return { recommendations: [] };
        }
      }
    );
    const selectedCandidates = [
      leakingCandidates.find(candidate => candidate.candidateId === 'easy-0')!,
      leakingCandidates.find(candidate => candidate.candidateId === 'polished-casual-0')!,
      leakingCandidates.find(candidate => candidate.candidateId === 'expressive-0')!
    ];
    curator(richSnapshot, richWeather, richHistory, selectedCandidates, leakingCritic);

    const finalRepair = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object,
      selection: object
    ) => object>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        validateFinalBundleV2_: () => [],
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          captured.finalRepair = parts.map(part => part.text || '').join('\n');
          return { recommendations: [] };
        }
      }
    );
    finalRepair(
      { recommendations: [] },
      [`Current validation ${topId}`, `Stale validation ${staleLongId}`, `Stale item validation ${staleItemId}`],
      richSnapshot,
      richWeather,
      richHistory,
      selectedCandidates,
      leakingCritic,
      selectionCoverageFor(selectedCandidates),
    );

    expect(Object.keys(captured).sort()).toEqual(['critic', 'criticRepair', 'curator', 'finalRepair']);
    Object.values(captured).forEach(prompt => {
      expect(prompt).not.toContain(sneakerId);
      expect(prompt).not.toContain(topId);
      expect(prompt).not.toContain(staleLongId);
      expect(prompt).not.toContain(staleItemId);
      expect(prompt).toContain('polished-casual-0');
    });
    [captured.critic, captured.criticRepair, captured.curator, captured.finalRepair].forEach(prompt => {
      expect(prompt).not.toContain('img_9999');
      expect(prompt).not.toContain('sneaker_ZZ9999-404');
      expect(prompt).toContain('Useful ordinary candidate prose remains.');
    });
    [captured.criticRepair, captured.curator].forEach(prompt => {
      expect(prompt).toContain('Useful ordinary defect prose remains.');
      expect(prompt).toContain('Useful ordinary reservation prose remains.');
    });
    expect(captured.finalRepair).not.toContain('Useful ordinary defect prose remains.');
    expect(captured.finalRepair).not.toContain('Useful ordinary reservation prose remains.');
  });

  it('scrubs exact-copy saved names from planner and final repair error prompts', () => {
    const staleUserId = 'user_closet_1888888888888';
    const staleItemId = 'item_archived_1888888888887';
    const staleSneakerId = 'sneaker_ZZ9999-404';
    const staleImageId = 'img_9999';
    const safeProse = 'sneaker_rotation and img_reference stay readable';
    const savedName = `Saved ${topId} ${staleUserId} ${staleItemId} ${staleSneakerId} ${staleImageId}; ${safeProse}`;
    const exactCopyError = `candidate[0] exactly copies manual saved outfit "${savedName}"`;
    const tasteSnapshot = {
      ...richSnapshot,
      tasteExamples: [{
        id: 'saved-exact-copy-error',
        name: savedName,
        itemIds: [topId, bottomId, sneakerId],
        source: 'manual',
        createdAt: 1
      }]
    };
    const captured: Record<string, string> = {};
    const repairPlanner = evaluateAppsScript<(
      archetype: string,
      invalidResponse: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object
    ) => object>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
      'repairPlannerResponseV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        validatePlannerResponseV2_: () => [],
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          captured.planner = parts.map(part => part.text || '').join('\n');
          return labelPlannerResponse('easy');
        }
      }
    );
    repairPlanner('easy', { archetype: 'easy', candidates: [] }, [exactCopyError], tasteSnapshot, richWeather, richHistory);

    const repairFinal = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object,
      selection: object
    ) => object>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        validateFinalBundleV2_: () => [],
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          captured.final = parts.map(part => part.text || '').join('\n');
          return { recommendations: [] };
        }
      }
    );
    repairFinal(
      { recommendations: [] },
      [exactCopyError.replace('candidate[0]', 'recommendation[0]')],
      tasteSnapshot,
      richWeather,
      richHistory,
      [internalCandidate()],
      { scores: [] },
      selectionCoverageFor([internalCandidate()]),
    );

    expect(Object.keys(captured).sort()).toEqual(['final', 'planner']);
    Object.values(captured).forEach(prompt => {
      expect(prompt).toContain('Saved T004 INVALID_LABEL INVALID_LABEL INVALID_LABEL INVALID_LABEL');
      expect(prompt).toContain(safeProse);
      [topId, staleUserId, staleItemId, staleSneakerId, staleImageId]
        .forEach(id => expect(prompt).not.toContain(id));
    });
  });

  it('sanitizes item metadata in candidate image captions sent to final repair', () => {
    const staleUserId = 'user_closet_1666666666666';
    const staleItemId = 'item_archived_1666666666665';
    const staleSneakerId = 'sneaker_XX7777-202';
    const staleImageId = 'img_7777';
    const safeProse = 'sneaker_rotation and img_reference stay readable';
    const captionSnapshot = {
      ...richSnapshot,
      items: richSnapshot.items.map(item => item.id === topId ? {
        ...item,
        brand: `SafeBrand ${topId} ${staleUserId}`,
        name: `Camp Name ${bottomId} ${staleItemId}`,
        color: `warm cream ${sneakerId} ${staleSneakerId}`,
        description: `safe caption prose ${topId} ${staleImageId}; ${safeProse}`
      } : item)
    };
    let captured = '';
    const repairFinal = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object,
      selection: object
    ) => object>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        validateFinalBundleV2_: () => [],
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          captured = parts.map(part => part.text || '').join('\n');
          return { recommendations: [] };
        }
      }
    );

    repairFinal(
      { recommendations: [] },
      ['customer-facing copy needs repair'],
      captionSnapshot,
      richWeather,
      richHistory,
      [internalCandidate()],
      { scores: [] },
      selectionCoverageFor([internalCandidate()]),
    );

    expect(captured).toContain('ITEM T004 | slot=top');
    expect(captured).toContain('SafeBrand T004 INVALID_LABEL Camp Name B002 INVALID_LABEL');
    expect(captured).toContain('listed colors=warm cream S009 INVALID_LABEL');
    expect(captured).toContain(`description=safe caption prose T004 INVALID_LABEL; ${safeProse}`);
    [topId, bottomId, sneakerId, staleUserId, staleItemId, staleSneakerId, staleImageId]
      .forEach(id => expect(captured).not.toContain(id));
  });

  it('uses only the immutable selected set and its compact scores, then resolves curator output immediately', () => {
    const captured: Array<{
      parts: Array<{ text?: string }>;
      schema: { properties: { recommendations: { minItems: number; maxItems: number } } };
    }> = [];
    const fixture = cardinalityBoundaryFixture();
    const curator = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object
    ) => { recommendations: Array<{ itemIds: string[] }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Selection.gs', 'Curator.gs'],
      'runCuratorV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (
          _stage: string,
          parts: Array<{ text?: string }>,
          schema: { properties: { recommendations: { minItems: number; maxItems: number } } },
        ) => {
          captured.push({ parts, schema });
          const count = schema.properties.recommendations.minItems;
          return {
            recommendations: fixture.selectedCandidates.slice(0, count).map((candidate, index) => ({
              candidateId: candidate.candidateId, archetype: candidate.archetype, name: 'Utility Neutral',
              itemIds: fixture.labelItemIds[index], colorHook: 'Cream, olive, and brown connect.',
              whyItWorks: 'The relaxed proportions align.', weatherNote: 'Breathable today.'
            }))
          };
        }
      }
    );
    const results: Array<{ recommendations: Array<{ itemIds: string[] }> }> = [];
    [1, 2, 3].forEach(count => {
      const result = curator(
        fixture.snapshot,
        richWeather,
        richHistory,
        fixture.selectedCandidates.slice(0, count),
        fixture.critic,
      );
      results.push(result);
      expect(captured.at(-1)?.schema.properties.recommendations).toMatchObject({
        minItems: count,
        maxItems: count,
      });
      const prompt = captured.at(-1)?.parts.map(part => part.text || '').join('\n') || '';
      expect(prompt).toContain(
        `The ${count} selected outfit${count === 1 ? ' is' : 's are'} final and validated upstream.`,
      );
      expect(prompt).toContain(
        `Return exactly ${count} recommendation record${count === 1 ? '' : 's'} in the same order.`,
      );
    });
    const captureCount = captured.length;
    expect(() => curator(fixture.snapshot, richWeather, richHistory, [], fixture.critic))
      .toThrow(/Curator selected count must be between one and three/);
    const overflow = fixture.selectedCandidates.concat([{ ...internalCandidate(), candidateId: 'overflow-4' }]);
    expect(() => curator(fixture.snapshot, richWeather, richHistory, overflow, fixture.critic))
      .toThrow(/Curator selected count must be between one and three/);
    expect(captured).toHaveLength(captureCount);

    const serialized = JSON.stringify(captured[0].parts);
    expect(serialized).toContain('The 1 selected outfit is final');
    expect(serialized).toContain('Do not swap, reorder, add, remove, or modify any outfit or item');
    expect(serialized).toContain('S009');
    expect(serialized).toContain('easy-1');
    expect(serialized).not.toContain(sneakerId);
    expect(serialized).not.toContain(topId);
    expect(serialized).not.toContain('hourly');
    expect(serialized).not.toContain('cooldownItemIds');
    expect(results[0].recommendations[0].itemIds).toEqual([topId, bottomId, sneakerId]);
  });

  it.each([
    ['null response', null],
    ['non-array recommendations', { recommendations: { malformed: true, wardrobeId: staleLongId } }]
  ])('routes malformed curator output (%s) into final validation and repair', (_case, malformedCurated) => {
    let validated: unknown;
    let repaired: unknown;
    let curatorSelection: unknown;
    let curatorCritic: unknown;
    let validationSelection: unknown;
    let validationCritic: unknown;
    let validationCoverage: unknown;
    let repairCoverage: unknown;
    let bundleCoverage: unknown;
    const selectedCandidates = [internalCandidate()];
    const selectedCritic = { scores: [criticScore('easy-1')], selectionMarker: 'selected-critic' };
    const selectedCoverage = selectionCoverageFor(selectedCandidates);
    const pipeline = evaluateAppsScript<(snapshot: object, weather: object) => { curated: { recommendations: unknown[] } }>(
      ['Scheduler.gs'],
      'generationBundlePipelineV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        dailyHistoryContextV2_: () => richHistory,
        runAllPlannersV2_: () => [{ candidates: [internalCandidate()] }],
        runCriticV2_: () => ({ scores: [criticScore('easy-1')] }),
        runSelectionV2_: () => ({
          candidates: selectedCandidates,
          critic: selectedCritic,
          selectedCandidates,
          selection: selectedCoverage
        }),
        runCuratorV2_: (_snapshot: unknown, _weather: unknown, _history: unknown, selected: unknown, critic: unknown) => {
          curatorSelection = selected;
          curatorCritic = critic;
          return malformedCurated;
        },
        validateFinalBundleV2_: (curated: unknown, _snapshot: unknown, _weather: unknown, _history: unknown, selected: unknown, critic: unknown, selection: unknown) => {
          validated = curated;
          validationSelection = selected;
          validationCritic = critic;
          validationCoverage = selection;
          return ['exactly three final recommendations are required'];
        },
        repairFinalBundleV2_: (_curated: unknown, _errors: unknown, _snapshot: unknown, _weather: unknown, _history: unknown, _selected: unknown, _critic: unknown, selection: unknown) => {
          repairCoverage = selection;
          const curated = _curated;
          repaired = curated;
          return { recommendations: [] };
        },
        buildBundleV2_: (_curated: unknown, _snapshot: unknown, _weather: unknown, _history: unknown, selection: unknown) => {
          bundleCoverage = selection;
          return {};
        }
      }
    );

    const result = pipeline(richSnapshot, richWeather);
    expect(curatorSelection).toEqual(selectedCandidates);
    expect(curatorCritic).toEqual(selectedCritic);
    expect(validationSelection).toEqual(selectedCandidates);
    expect(validationCritic).toEqual(selectedCritic);
    expect(validationCoverage).toEqual(selectedCoverage);
    expect(repairCoverage).toEqual(selectedCoverage);
    expect(bundleCoverage).toEqual(selectedCoverage);
    expect(validated).toEqual(malformedCurated);
    expect(repaired).toEqual(malformedCurated);
    expect(result.curated).toEqual({ recommendations: [] });
  });

  it('routes null and non-array nested curator records into deterministic final repair', () => {
    const malformedCurated = {
      recommendations: [null, { itemIds: { malformed: true } }, { itemIds: 'bad' }]
    };
    let repaired: unknown;
    let validationErrors: string[] = [];
    let curatorSelection: unknown;
    let curatorCritic: unknown;
    let validationSelection: unknown;
    let validationCritic: unknown;
    let validationCoverage: unknown;
    let repairCoverage: unknown;
    let bundleCoverage: unknown;
    const selectedCandidates = [internalCandidate()];
    const selectedCritic = { ...validCriticResponse(), selectionMarker: 'selected-critic' };
    const selectedCoverage = selectionCoverageFor(selectedCandidates);
    const pipeline = evaluateAppsScript<(snapshot: object, weather: object) => { curated: { recommendations: unknown[] } }>(
      ['Scheduler.gs'],
      'generationBundlePipelineV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        dailyHistoryContextV2_: () => richHistory,
        runAllPlannersV2_: () => [{ candidates: criticCandidates() }],
        runCriticV2_: () => validCriticResponse(),
        runSelectionV2_: () => ({
          candidates: criticCandidates(),
          critic: selectedCritic,
          selectedCandidates,
          selection: selectedCoverage
        }),
        runCuratorV2_: (_snapshot: unknown, _weather: unknown, _history: unknown, selected: unknown, critic: unknown) => {
          curatorSelection = selected;
          curatorCritic = critic;
          return malformedCurated;
        },
        validateFinalBundleV2_: (_curated: unknown, _snapshot: unknown, _weather: unknown, _history: unknown, selected: unknown, critic: unknown, selection: unknown) => {
          validationSelection = selected;
          validationCritic = critic;
          validationCoverage = selection;
          return ['final recommendations must be object records with array itemIds'];
        },
        repairFinalBundleV2_: (curated: unknown, errors: string[], _snapshot: unknown, _weather: unknown, _history: unknown, _selected: unknown, _critic: unknown, selection: unknown) => {
          repaired = curated;
          validationErrors = errors;
          repairCoverage = selection;
          return { recommendations: [] };
        },
        buildBundleV2_: (_curated: unknown, _snapshot: unknown, _weather: unknown, _history: unknown, selection: unknown) => {
          bundleCoverage = selection;
          return {};
        }
      }
    );

    const result = pipeline(richSnapshot, richWeather);

    expect(curatorSelection).toEqual(selectedCandidates);
    expect(curatorCritic).toEqual(selectedCritic);
    expect(validationSelection).toEqual(selectedCandidates);
    expect(validationCritic).toEqual(selectedCritic);
    expect(validationCoverage).toEqual(selectedCoverage);
    expect(repairCoverage).toEqual(selectedCoverage);
    expect(bundleCoverage).toEqual(selectedCoverage);
    expect(validationErrors.length).toBeGreaterThan(0);
    expect(repaired).toEqual(malformedCurated);
    expect(result.curated).toEqual({ recommendations: [] });
  });

  it('captures final repair prompts on compact views and resolves before validation', () => {
    const captured: Array<{
      parts: Array<{ text?: string }>;
      schema: { properties: { recommendations: { minItems: number; maxItems: number } } };
    }> = [];
    let validatedResolvedResponse = false;
    const fixture = cardinalityBoundaryFixture();
    const repairFinal = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object,
      selection: object
    ) => { recommendations: Array<{ itemIds: string[] }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (
          _stage: string,
          parts: Array<{ text?: string }>,
          schema: { properties: { recommendations: { minItems: number; maxItems: number } } },
        ) => {
          captured.push({ parts, schema });
          const count = schema.properties.recommendations.minItems;
          return {
            recommendations: fixture.selectedCandidates.slice(0, count).map((candidate, index) => ({
              candidateId: candidate.candidateId, archetype: candidate.archetype, name: 'Utility Neutral',
              itemIds: fixture.labelItemIds[index], colorHook: 'Cream, olive, and brown connect.',
              whyItWorks: 'The relaxed proportions align.', weatherNote: 'Breathable today.'
            }))
          };
        },
        validateFinalBundleV2_: (response: { recommendations: Array<{ itemIds: string[] }> }) => {
          validatedResolvedResponse = JSON.stringify(response.recommendations[0].itemIds) === JSON.stringify([topId, bottomId, sneakerId]);
          return [];
        }
      }
    );
    const current = {
      recommendations: [{
        candidateId: 'easy-1', archetype: 'easy', name: 'Utility Neutral',
        itemIds: [topId, bottomId, sneakerId], colorHook: 'Too short',
        whyItWorks: 'Too short', weatherNote: 'Too short', privateWardrobeId: sneakerId
      }],
      privateNested: { wardrobeId: sneakerId }
    };
    const results: Array<{ recommendations: Array<{ itemIds: string[] }> }> = [];
    [1, 2, 3].forEach(count => {
      const selectedCandidates = fixture.selectedCandidates.slice(0, count);
      const result = repairFinal(
        current,
        ['recommendation[0].colorHook is too short'],
        fixture.snapshot,
        richWeather,
        richHistory,
        selectedCandidates,
        fixture.critic,
        selectionCoverageFor(selectedCandidates),
      );
      results.push(result);
      expect(captured.at(-1)?.schema.properties.recommendations).toMatchObject({
        minItems: count,
        maxItems: count,
      });
      const prompt = captured.at(-1)?.parts.map(part => part.text || '').join('\n') || '';
      expect(prompt).toContain(
        `The ${count} selected outfit${count === 1 ? ' is' : 's are'} final and validated upstream.`,
      );
      expect(prompt).toContain(
        `Return exactly ${count} recommendation record${count === 1 ? '' : 's'} in the same order.`,
      );
    });
    const captureCount = captured.length;
    expect(() => repairFinal(current, ['invalid'], fixture.snapshot, richWeather, richHistory, [], fixture.critic, {}))
      .toThrow(/Curator selected count must be between one and three/);
    const overflow = fixture.selectedCandidates.concat([{ ...internalCandidate(), candidateId: 'overflow-4' }]);
    expect(() => repairFinal(current, ['invalid'], fixture.snapshot, richWeather, richHistory, overflow, fixture.critic, {}))
      .toThrow(/Curator selected count must be between one and three/);
    expect(captured).toHaveLength(captureCount);

    const serialized = JSON.stringify(captured[0].parts);
    expect(serialized).toContain('candidate ids, archetypes, item ids, and order are immutable');
    expect(serialized).toContain('The 1 selected outfit is final');
    expect(serialized).toContain('Return exactly 1 recommendation record');
    expect(serialized).toContain('S009');
    expect(serialized).not.toContain(sneakerId);
    expect(serialized).not.toContain(topId);
    expect(serialized).not.toContain('privateNested');
    expect(serialized).not.toContain('hourly');
    expect(serialized).not.toContain('CRITIC:');
    expect(serialized).not.toContain('SAVED OUTFIT SIGNATURES:');
    expect(serialized).not.toContain('DAILY HISTORY:');
    expect(validatedResolvedResponse).toBe(true);
    expect(results[0].recommendations[0].itemIds).toEqual([topId, bottomId, sneakerId]);
  });

  it('repairs unknown final item labels through a closed invalid-curated prompt', () => {
    let capturedPrompt = '';
    let validatedResolvedResponse = false;
    const repairFinal = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object,
      selection: object
    ) => { recommendations: Array<{ itemIds: string[] }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          capturedPrompt = parts.map(part => part.text || '').join('\n');
          return {
            recommendations: [{
              candidateId: 'easy-1', archetype: 'easy', name: 'Utility Neutral',
              itemIds: ['T004', 'B002', 'S009'], colorHook: 'Cream, olive, and brown connect.',
              whyItWorks: 'The relaxed proportions align across every piece.', weatherNote: 'Breathable enough for today.'
            }]
          };
        },
        validateFinalBundleV2_: (response: { recommendations: Array<{ itemIds: string[] }> }) => {
          validatedResolvedResponse = JSON.stringify(response.recommendations[0].itemIds) === JSON.stringify([topId, bottomId, sneakerId]);
          return [];
        }
      }
    );
    const current = {
      recommendations: [{
        candidateId: 'easy-1', archetype: 'easy', name: 'Utility Neutral',
        itemIds: [topId, bottomId, 'X404', { wardrobeId: staleLongId }], colorHook: `Unsafe ${staleLongId}`,
        whyItWorks: 'The relaxed proportions align across every piece.', weatherNote: 'Breathable enough for today.'
      }]
    };
    const critic = { scores: [criticScore('easy-1')] };

    const result = repairFinal(
      current,
      [`recommendation[0] contains invented item ${staleLongId}`],
      richSnapshot,
      richWeather,
      richHistory,
      [internalCandidate()],
      critic,
      selectionCoverageFor([internalCandidate()]),
    );

    expect(capturedPrompt).toContain('INVALID_LABEL');
    expect(capturedPrompt).not.toContain('X404');
    expect(capturedPrompt).not.toContain(staleLongId);
    expect(capturedPrompt).not.toContain('wardrobeId');
    expect(validatedResolvedResponse).toBe(true);
    expect(result.recommendations[0].itemIds).toEqual([topId, bottomId, sneakerId]);
  });

  it('rejects malformed final-repair model records with deterministic errors', () => {
    const malformedRepair = {
      recommendations: [null, 'bad', { itemIds: { malformed: true } }]
    };
    let repairCalls = 0;
    const repairFinal = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      selectedCandidates: object[],
      critic: object,
      selection: object
    ) => unknown>(
      ['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Selection.gs', 'FinalValidation.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        modelWeatherViewV2_: () => ({}),
        buildTasteSummaryV2_: () => [],
        savedOutfitExactCopyV2_: () => null,
        callGeminiV2_: () => {
          repairCalls += 1;
          return malformedRepair;
        }
      }
    );

    expect(() => repairFinal(
      { recommendations: [] },
      ['exactly three final recommendations are required'],
      richSnapshot,
      richWeather,
      richHistory,
      criticCandidates().filter(candidate => candidate.candidateId.endsWith('-0')),
      validCriticResponse(),
      selectionCoverageFor(criticCandidates().filter(candidate => candidate.candidateId.endsWith('-0'))),
    )).toThrow(/^Final repair failed quality gates:/);
    expect(repairCalls).toBe(2);
  });

  it('does not directly stringify full prompt-boundary objects', () => {
    const sources = ['Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'].map(apps).join('\n');
    expect(sources).not.toMatch(/JSON\.stringify\((weather|history|candidates|finalists|current|curated|invalidResponse)\)/);
    expect(sources).not.toContain('JSON.stringify(tasteEvidenceV2_');
    expect(apps('Repair.gs')).toContain('modelFacingCuratedV2_(');
  });
});

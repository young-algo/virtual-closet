import { describe, expect, it } from 'vitest';
import { apps, evaluateAppsScript } from './appsScriptTestHarness';

const sneakerId = 'user_sneaker_1783863184667';
const topId = 'user_closet_1783863184668';
const bottomId = 'user_closet_1783863184669';

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

const api = evaluateAppsScript<{
  modelWeatherViewV2_: (weather: object) => Record<string, unknown>;
  modelProfileViewV2_: (profile: object) => Record<string, unknown>;
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
  savedTasteSignaturesV2_: (snapshot: object) => Array<{ itemIds: string[] }>;
  buildTasteSummaryV2_: (snapshot: object) => Array<Record<string, unknown>>;
}>(
  ['Weather.gs', 'ItemIndex.gs', 'Taste.gs'],
  `({
    modelWeatherViewV2_, modelProfileViewV2_, compactItemIndexV2_, labelForItemIdV2_, atlasPartsV2_, candidateImagePartsV2_,
    modelFacingCandidateV2_, modelFacingHistoryV2_, modelFacingCuratedV2_, resolveLabelsV2_,
    savedTasteSignaturesV2_, buildTasteSummaryV2_
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
      rainSafety: 'good',
      windProtection: 0,
      formality: 2,
      silhouette: 'regular',
      patternIntensity: 0,
      primaryColorFamily: 'brown',
      secondaryColorFamily: 'cream',
      accentColors: ['black']
    });
    expect(api.modelProfileViewV2_(snapshot.items[0].profile)).not.toHaveProperty('available');
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
      itemIds: ['T004', 'B002', 'S009']
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
      plannerConfidence: 0.9
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

  it('keeps saved taste internals on real ids but emits label-only model summaries', () => {
    expect(api.savedTasteSignaturesV2_(snapshot)[0].itemIds).toEqual([topId, bottomId, sneakerId]);

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
});

describe('prompt and response label boundary', () => {
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
      })),
      finalists: {
        easy: ['easy-0', 'easy-1'],
        polishedCasual: ['polished-casual-0', 'polished-casual-1'],
        expressive: ['expressive-0', 'expressive-1']
      }
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
            ? { scores: { malformed: true }, finalists: { easy: [], polishedCasual: [], expressive: [] }, privateWardrobeId: sneakerId }
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
    expect(primary).not.toContain(sneakerId);
    expect(repair).not.toContain(sneakerId);
    expect(primary).not.toContain('hourly');
    expect(repair).not.toContain('fetchedAt');

    const source = apps('Critic.gs');
    expect(source.match(/criticScoreAnchorsV2_\(\)/g)).toHaveLength(3);
    expect(source).toContain('weather: 10 = ideal across the whole 6:00–23:00 window');
    expect(source).toContain('wearability: 9–10 = zero-friction for an ordinary day');
  });

  it('uses compact curator inputs and resolves curator output immediately', () => {
    let capturedParts: Array<{ text?: string }> = [];
    const curator = evaluateAppsScript<(
      snapshot: object,
      weather: object,
      history: object,
      planners: object[],
      critic: object
    ) => { recommendations: Array<{ itemIds: string[] }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs'],
      'runCuratorV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          capturedParts = parts;
          return {
            recommendations: [{
              candidateId: 'easy-1', archetype: 'easy', name: 'Utility Neutral',
              itemIds: ['T004', 'B002', 'S009'], colorHook: 'Cream, olive, and brown connect.',
              whyItWorks: 'The relaxed proportions align.', weatherNote: 'Breathable today.'
            }]
          };
        }
      }
    );
    const critic = {
      scores: [],
      finalists: { easy: ['easy-1'], polishedCasual: [], expressive: [] },
      privateWardrobeId: sneakerId
    };

    const result = curator(richSnapshot, richWeather, richHistory, [{ candidates: [internalCandidate()] }], critic);
    const serialized = JSON.stringify(capturedParts);
    expect(serialized).toContain('S009');
    expect(serialized).not.toContain(sneakerId);
    expect(serialized).not.toContain(topId);
    expect(serialized).not.toContain('hourly');
    expect(serialized).not.toContain('cooldownItemIds');
    expect(result.recommendations[0].itemIds).toEqual([topId, bottomId, sneakerId]);
  });

  it('captures final repair prompts on compact views and resolves before validation', () => {
    let capturedParts: Array<{ text?: string }> = [];
    let validatedResolvedResponse = false;
    const repairFinal = evaluateAppsScript<(
      curated: object,
      errors: string[],
      snapshot: object,
      weather: object,
      history: object,
      planners: object[],
      critic: object
    ) => { recommendations: Array<{ itemIds: string[] }> }>(
      ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'],
      'repairFinalBundleV2_',
      {
        DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] },
        console,
        callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
          capturedParts = parts;
          return {
            recommendations: [{
              candidateId: 'easy-1', archetype: 'easy', name: 'Utility Neutral',
              itemIds: ['T004', 'B002', 'S009'], colorHook: 'Cream, olive, and brown connect.',
              whyItWorks: 'The relaxed proportions align.', weatherNote: 'Breathable today.'
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
        itemIds: [topId, bottomId, sneakerId], colorHook: 'Too short',
        whyItWorks: 'Too short', weatherNote: 'Too short', privateWardrobeId: sneakerId
      }],
      privateNested: { wardrobeId: sneakerId }
    };
    const critic = {
      scores: [],
      finalists: { easy: ['easy-1'], polishedCasual: [], expressive: [] },
      privateWardrobeId: sneakerId
    };

    const result = repairFinal(current, ['recommendation[0].colorHook is too short'], richSnapshot, richWeather, richHistory, [{ candidates: [internalCandidate()] }], critic);
    const serialized = JSON.stringify(capturedParts);
    expect(serialized).toContain('S009');
    expect(serialized).not.toContain(sneakerId);
    expect(serialized).not.toContain(topId);
    expect(serialized).not.toContain('privateNested');
    expect(serialized).not.toContain('hourly');
    expect(validatedResolvedResponse).toBe(true);
    expect(result.recommendations[0].itemIds).toEqual([topId, bottomId, sneakerId]);
  });

  it('does not directly stringify full prompt-boundary objects', () => {
    const sources = ['Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'].map(apps).join('\n');
    expect(sources).not.toMatch(/JSON\.stringify\((weather|history|candidates|finalists|current|curated|invalidResponse)\)/);
    expect(sources).not.toContain('JSON.stringify(savedTasteSignaturesV2_');
  });
});

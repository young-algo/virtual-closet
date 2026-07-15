import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

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

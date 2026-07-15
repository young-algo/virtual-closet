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
  atlasPartsV2_: (snapshot: object) => Array<{ text?: string }>;
  candidateImagePartsV2_: (snapshot: object, candidates: object[]) => Array<{ text?: string }>;
  modelFacingCandidateV2_: (candidate: object, snapshot: object) => Record<string, unknown>;
  modelFacingHistoryV2_: (history: object, snapshot: object) => Record<string, unknown>;
  modelFacingCuratedV2_: (curated: object, snapshot: object) => Record<string, unknown>;
  resolveLabelsV2_: (response: object, snapshot: object) => {
    candidates: Array<{ shoeId: string; itemIds: string[] }>;
    recommendations: Array<{ itemIds: string[] }>;
  };
  savedTasteSignaturesV2_: (snapshot: object) => Array<{ itemIds: string[] }>;
  buildTasteSummaryV2_: (snapshot: object) => Array<Record<string, unknown>>;
}>(
  ['Weather.gs', 'ItemIndex.gs', 'Taste.gs'],
  `({
    modelWeatherViewV2_, modelProfileViewV2_, compactItemIndexV2_, atlasPartsV2_, candidateImagePartsV2_,
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

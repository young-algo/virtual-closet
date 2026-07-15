import { describe, expect, it } from 'vitest';
import { apps, evaluateAppsScript } from './appsScriptTestHarness';

const topId = 'user_closet_1784000000001';
const bottomId = 'user_closet_1784000000002';
const shoeId = 'user_sneaker_1784000000003';
const layerId = 'user_closet_1784000000004';
const staleId = 'user_closet_1784000000999';
const staleItemId = 'item_archived_1784000000998';

const snapshot = {
  settings: { maxDailyHistoryDays: 30, timezone: 'America/New_York' },
  items: [
    {
      id: topId,
      shortLabel: 'T001',
      slot: 'top',
      brand: 'Nike',
      name: 'ACG Tee',
      category: 'Tees',
      color: 'cream',
      description: 'Cream trail tee',
      thumbnailDataUrl: 'data:image/png;base64,VA==',
      profile: {}
    },
    {
      id: bottomId,
      shortLabel: 'B001',
      slot: 'bottom',
      brand: 'Dickies',
      name: 'Double Knee',
      category: 'Pants',
      color: 'brown',
      description: 'Brown work pant',
      thumbnailDataUrl: 'data:image/png;base64,Qg==',
      profile: {}
    },
    {
      id: shoeId,
      shortLabel: 'S001',
      slot: 'shoes',
      brand: 'Jordan',
      name: 'Mocha',
      category: 'Sneakers',
      color: 'brown',
      description: 'Brown high top',
      thumbnailDataUrl: 'data:image/png;base64,Uw==',
      profile: {}
    },
    {
      id: layerId,
      shortLabel: 'L001',
      slot: 'layer',
      brand: 'Nike',
      name: 'Chore Jacket',
      category: 'Jackets',
      color: 'navy',
      description: 'Navy chore layer',
      thumbnailDataUrl: 'data:image/png;base64,TA==',
      profile: {}
    }
  ],
  atlasPages: [],
  tasteExamples: []
};

type HistorySnapshot = typeof snapshot;

const utilities = {
  parseDate: (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`),
  formatDate: (date: Date) => date.toISOString().slice(0, 10)
};

const contextFor = (entries: object[]) => evaluateAppsScript<(
  localDate: string,
  snapshotValue: HistorySnapshot
) => Record<string, any>>(
  ['ItemIndex.gs', 'Taste.gs'],
  'dailyHistoryContextV2_',
  { loadHistoryV2_: () => entries, Utilities: utilities, console }
);

const feedbackHistory = [
  {
    localDate: '2026-07-11',
    recommendations: [
      {
        candidateId: 'liked-look',
        name: 'Liked Look',
        archetype: 'easy',
        itemIds: [topId, bottomId, staleId]
      },
      {
        candidateId: 'disliked-look',
        name: 'Disliked Look',
        archetype: 'polished-casual',
        itemIds: [bottomId, shoeId]
      },
      {
        candidateId: 'worn-look',
        name: 'Worn Look',
        archetype: 'expressive',
        itemIds: [topId, shoeId]
      }
    ],
    feedback: [
      { candidateId: 'liked-look', value: 'liked', note: 'Good color' },
      { candidateId: 'disliked-look', value: 'disliked', reason: 'colors', note: 'Too muddy' },
      { candidateId: 'worn-look', value: 'wore', reason: 'other', note: 'Worked well' },
      { candidateId: 'missing-look', value: 'liked', note: staleId },
      { candidateId: 'liked-look', value: 'ignored', note: staleId }
    ]
  },
  {
    localDate: '2026-07-13',
    recommendations: [{
      candidateId: 'yesterday',
      name: 'Yesterday',
      archetype: 'expressive',
      itemIds: [topId, bottomId, shoeId, layerId]
    }],
    encore: {
      outfitId: 'saved-1',
      candidateId: 'encore:saved-1',
      name: 'Saved One',
      itemIds: [topId, bottomId, shoeId]
    },
    feedback: [{ candidateId: 'encore:saved-1', value: 'liked' }]
  }
];

const guidance = [
  'HOW TO USE DAILY HISTORY:',
  '- exactOutfitsPrevious14Days — combinations already emailed. Never repeat one exactly.',
  '- itemUsagePrevious7Days — how often each item appeared in the last seven emails (exposure, not wear). Treat 3+ appearances as over-exposed unless itemFeedbackSignals shows Kevin actually wore it.',
  '- feedback — Kevin\'s explicit reactions. wore is the strongest positive evidence for that outfit\'s styling logic and its items. liked is positive. disliked is negative, and reason names the failing dimension (colors, too-warm, too-formal, …). Do not rebuild a disliked combination or repeat its failure pattern; do favor the visual logic of worn and liked outfits without copying them.'
].join('\n');

describe('daily history context', () => {
  it('resolves liked, disliked, wore, and Encore feedback while dropping unresolved candidates and stale items', () => {
    const context = contextFor(feedbackHistory)('2026-07-14', snapshot);

    expect(context.feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 'liked',
        outfitName: 'Liked Look',
        archetype: 'easy',
        items: ['T001 Nike ACG Tee', 'B001 Dickies Double Knee']
      }),
      expect.objectContaining({
        value: 'disliked',
        outfitName: 'Disliked Look',
        reason: 'colors',
        items: ['B001 Dickies Double Knee', 'S001 Jordan Mocha']
      }),
      expect.objectContaining({
        value: 'wore',
        outfitName: 'Worn Look',
        note: 'Worked well'
      }),
      expect.objectContaining({
        value: 'liked',
        outfitName: 'Saved One',
        archetype: 'encore'
      })
    ]));
    expect(context.feedback).toHaveLength(4);
    expect(context.itemFeedbackSignals).toEqual({
      T001: { wore: 1, liked: 2, disliked: 0 },
      B001: { wore: 0, liked: 2, disliked: 1 },
      S001: { wore: 1, liked: 1, disliked: 1 }
    });
    expect(context.wornItemIds).toEqual(expect.arrayContaining([topId, shoeId]));
    expect(JSON.stringify({
      feedback: context.feedback,
      signals: context.itemFeedbackSignals,
      worn: context.wornItemIds
    })).not.toContain(staleId);
  });

  it('drops feedback for absent prototype-key candidate ids', () => {
    const context = contextFor([{
      localDate: '2026-07-11',
      recommendations: [{
        candidateId: 'sent-look',
        name: 'Sent Look',
        archetype: 'easy',
        itemIds: [topId, bottomId]
      }],
      feedback: ['constructor', 'toString', '__proto__'].map(candidateId => ({
        candidateId,
        value: 'liked'
      }))
    }])('2026-07-14', snapshot);

    expect(context.feedback).toEqual([]);
    expect(context.itemFeedbackSignals).toEqual({});
  });

  it('resolves unambiguous own prototype-key candidate ids', () => {
    const context = contextFor([{
      localDate: '2026-07-11',
      recommendations: [
        { candidateId: 'constructor', name: 'Constructor Look', archetype: 'easy', itemIds: [topId] },
        { candidateId: 'toString', name: 'To String Look', archetype: 'polished-casual', itemIds: [bottomId] }
      ],
      encore: { candidateId: '__proto__', name: 'Proto Encore', itemIds: [shoeId] },
      feedback: ['constructor', 'toString', '__proto__'].map(candidateId => ({
        candidateId,
        value: 'liked'
      }))
    }])('2026-07-14', snapshot);

    expect(context.feedback.map((entry: { outfitName: string }) => entry.outfitName)).toEqual([
      'Constructor Look',
      'To String Look',
      'Proto Encore'
    ]);
  });

  it('silently drops feedback for every duplicate candidate id', () => {
    const context = contextFor([
      {
        localDate: '2026-07-10',
        recommendations: [
          { candidateId: 'duplicate-rec', name: 'First Recommendation', itemIds: [topId] },
          { candidateId: 'duplicate-rec', name: 'Second Recommendation', itemIds: [bottomId] }
        ],
        feedback: [{ candidateId: 'duplicate-rec', value: 'liked' }]
      },
      {
        localDate: '2026-07-11',
        recommendations: [{ candidateId: 'duplicate-encore', name: 'Recommendation', itemIds: [topId] }],
        encore: { candidateId: 'duplicate-encore', name: 'Encore', itemIds: [shoeId] },
        feedback: [{ candidateId: 'duplicate-encore', value: 'wore' }]
      }
    ])('2026-07-14', snapshot);

    expect(context.feedback).toEqual([]);
    expect(context.itemFeedbackSignals).toEqual({});
    expect(context.wornItemIds).toEqual([]);
  });

  it('uses the configured retained window and defaults to the latest 30 entries', () => {
    const entries = Array.from({ length: 31 }, (_, index) => ({
      localDate: `2026-05-${String(index + 1).padStart(2, '0')}`,
      recommendations: [{
        candidateId: `look-${index}`,
        name: `Look ${index}`,
        archetype: 'easy',
        itemIds: [topId]
      }],
      feedback: [{ candidateId: `look-${index}`, value: 'liked' }]
    }));
    const defaultSnapshot = { ...snapshot, settings: { timezone: 'America/New_York' } };
    const defaultContext = contextFor(entries)('2026-07-14', defaultSnapshot as typeof snapshot);
    const shortContext = contextFor(entries)('2026-07-14', {
      ...snapshot,
      settings: { ...snapshot.settings, maxDailyHistoryDays: 2 }
    });

    expect(defaultContext.feedback).toHaveLength(30);
    expect(defaultContext.feedback[0].outfitName).toBe('Look 1');
    expect(shortContext.feedback.map((entry: { outfitName: string }) => entry.outfitName)).toEqual(['Look 29', 'Look 30']);
    expect(shortContext.itemFeedbackSignals).toEqual({ T001: { wore: 0, liked: 2, disliked: 0 } });
  });

  it('counts exposure from the last seven entries and exact looks from the last fourteen, including Encore', () => {
    const entries = Array.from({ length: 15 }, (_, index) => ({
      localDate: `2026-06-${String(index + 1).padStart(2, '0')}`,
      recommendations: [{
        candidateId: `look-${index}`,
        name: `Look ${index}`,
        archetype: 'easy',
        itemIds: [topId, shoeId]
      }],
      encore: {
        candidateId: `encore-${index}`,
        name: `Encore ${index}`,
        itemIds: [bottomId, shoeId]
      }
    }));
    const context = contextFor(entries)('2026-07-14', snapshot);

    expect(context.exactOutfitsPrevious14Days).toHaveLength(28);
    expect(context.exactOutfitsPrevious14Days[1]).toEqual(expect.objectContaining({ archetype: 'encore' }));
    expect(context.itemUsagePrevious7Days).toEqual({
      [topId]: 7,
      [shoeId]: 14,
      [bottomId]: 7
    });
  });

  it('uses only the exact previous calendar date and excludes shoes, layers, and verified-worn items from cooldown', () => {
    const context = contextFor(feedbackHistory)('2026-07-14', snapshot);
    expect(context.cooldownItemIds).toEqual([bottomId]);
    expect(context.cooldownItemLabels).toEqual(['B001']);

    const skipped = contextFor(feedbackHistory.slice(0, 1))('2026-07-14', snapshot);
    expect(skipped.cooldownItemIds).toEqual([]);
    expect(skipped.cooldownItemLabels).toEqual([]);
  });
});

describe('model-facing history boundary', () => {
  it('keeps resolved feedback, aggregates, and cooldown labels while excluding internal and stale ids', () => {
    const modelFacingHistoryV2_ = evaluateAppsScript<(
      history: Record<string, unknown>,
      snapshotValue: HistorySnapshot
    ) => Record<string, unknown>>(['ItemIndex.gs'], 'modelFacingHistoryV2_', { console });
    const context = {
      exactOutfitsPrevious14Days: [{ localDate: '2026-07-13', archetype: 'easy', itemIds: [topId, bottomId] }],
      itemUsagePrevious7Days: { [topId]: 2, [staleId]: 9 },
      feedback: [{
        localDate: '2026-07-11',
        value: 'liked',
        outfitName: 'Liked Look',
        archetype: 'easy',
        items: ['T001 Nike ACG Tee', 'B001 Dickies Double Knee', staleId]
      }],
      itemFeedbackSignals: {
        T001: { wore: 1, liked: 2, disliked: 0 },
        B001: { wore: 0, liked: 2, disliked: 1 },
        S001: { wore: 1, liked: 1, disliked: 1 },
        [staleId]: { wore: 9, liked: 9, disliked: 9 }
      },
      cooldownItemLabels: ['B001', staleId, 'Z999'],
      cooldownItemIds: [bottomId, staleId],
      wornItemIds: [topId, shoeId, staleId]
    };

    const model = modelFacingHistoryV2_(context, snapshot);

    expect(model).toEqual(expect.objectContaining({
      feedback: expect.arrayContaining([
        expect.objectContaining({
          outfitName: 'Liked Look',
          archetype: 'easy',
          items: ['T001 Nike ACG Tee', 'B001 Dickies Double Knee']
        })
      ]),
      itemFeedbackSignals: {
        T001: { wore: 1, liked: 2, disliked: 0 },
        B001: { wore: 0, liked: 2, disliked: 1 },
        S001: { wore: 1, liked: 1, disliked: 1 }
      },
      cooldownItemLabels: ['B001']
    }));
    expect(model).not.toHaveProperty('cooldownItemIds');
    expect(model).not.toHaveProperty('wornItemIds');
    expect(JSON.stringify(model)).not.toContain(topId);
    expect(JSON.stringify(model)).not.toContain(bottomId);
    expect(JSON.stringify(model)).not.toContain(shoeId);
    expect(JSON.stringify(model)).not.toContain(staleId);
  });

  it('sanitizes ids in resolved feedback strings and accepted item descriptions', () => {
    const modelFacingHistoryV2_ = evaluateAppsScript<(
      history: Record<string, unknown>,
      snapshotValue: HistorySnapshot
    ) => Record<string, any>>(['ItemIndex.gs'], 'modelFacingHistoryV2_', { console });
    const leakySnapshot = structuredClone(snapshot);
    leakySnapshot.items[0].name = `ACG ${topId} ${staleItemId}`;
    const context = contextFor([{
      localDate: '2026-07-11',
      recommendations: [{
        candidateId: 'leaky-look',
        name: `Look ${shoeId} ${staleId}`,
        archetype: `easy ${layerId}`,
        itemIds: [topId, bottomId]
      }],
      feedback: [{
        candidateId: 'leaky-look',
        value: 'liked',
        reason: `Reason ${bottomId} ${staleItemId}`,
        note: `Keep ordinary prose intact with ${topId}, ${staleId}, and ${staleItemId}.`
      }]
    }])('2026-07-14', leakySnapshot);

    const model = modelFacingHistoryV2_(context, leakySnapshot);

    expect(model.feedback[0]).toEqual(expect.objectContaining({
      outfitName: 'Look S001 INVALID_LABEL',
      archetype: 'easy L001',
      reason: 'Reason B001 INVALID_LABEL',
      note: 'Keep ordinary prose intact with T001, INVALID_LABEL, and INVALID_LABEL.',
      items: [
        'T001 Nike ACG T001 INVALID_LABEL',
        'B001 Dickies Double Knee'
      ]
    }));
    expect(JSON.stringify(model)).not.toContain(topId);
    expect(JSON.stringify(model)).not.toContain(bottomId);
    expect(JSON.stringify(model)).not.toContain(shoeId);
    expect(JSON.stringify(model)).not.toContain(layerId);
    expect(JSON.stringify(model)).not.toContain(staleId);
    expect(JSON.stringify(model)).not.toContain(staleItemId);
  });
});

describe('history prompt contracts', () => {
  it('defines the exact guidance and passes snapshot at every history context caller', () => {
    const historyGuidanceV2_ = evaluateAppsScript<() => string | null>(
      ['ItemIndex.gs', 'Taste.gs'],
      "typeof historyGuidanceV2_ === 'function' ? historyGuidanceV2_ : function() { return null; }",
      { loadHistoryV2_: () => [], Utilities: utilities, console }
    );
    expect(historyGuidanceV2_()).toBe(guidance);

    const callerSource = [apps('Planner.gs'), apps('Scheduler.gs')].join('\n');
    const calls = callerSource.match(/dailyHistoryContextV2_\([^)]*\)/g) || [];
    expect(calls).toHaveLength(5);
    expect(calls.every(call => /,\s*snapshot\)$/.test(call))).toBe(true);
  });

  it('places guidance immediately after every history JSON and gives the planner cooldown steering', () => {
    const planner = apps('Planner.gs');
    const critic = apps('Critic.gs');
    const curator = apps('Curator.gs');
    const repair = apps('Repair.gs');
    const adjacentGuidance = /JSON\.stringify\(modelFacingHistoryV2_\(history, snapshot\)\),\n\s*historyGuidanceV2_\(\)/g;

    expect(planner.match(adjacentGuidance)).toHaveLength(1);
    expect(critic.match(adjacentGuidance)).toHaveLength(2);
    expect(curator.match(adjacentGuidance)).toHaveLength(1);
    expect(repair.match(adjacentGuidance)).toHaveLength(1);
    expect(planner).toContain("Items listed in cooldownItemLabels headlined yesterday\\'s email; avoid them today unless history shows Kevin wore them.");
  });

  it('includes the exact guidance in every runtime prompt without leaking internal history ids', () => {
    const promptFeedbackHistory = structuredClone(feedbackHistory);
    (promptFeedbackHistory[0].feedback[0] as { note?: string }).note =
      `Keep ordinary prose intact with ${topId}, ${staleId}, and ${staleItemId}.`;
    const history = contextFor(promptFeedbackHistory)('2026-07-14', snapshot);
    const weather = { localDate: '2026-07-14', locationLabel: 'Brooklyn, NY' };
    const archetypes = ['easy', 'polished-casual', 'expressive'];
    const candidates = archetypes.flatMap(archetype => Array.from({ length: 2 }, (_, index) => ({
      candidateId: `${archetype}-${index}`,
      archetype,
      topId,
      bottomId,
      shoeId,
      layerId: null,
      itemIds: [topId, bottomId, shoeId],
      name: `${archetype} ${index}`,
      styleSummary: 'A concise styling summary',
      colorStrategy: 'Cream and brown bridge the tee and shoes.',
      weatherSummary: 'Suitable for today',
      potentialRisks: [],
      plannerConfidence: 0.9
    })));
    const critic = {
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
    const labelRecommendations = archetypes.map(archetype => ({
      candidateId: `${archetype}-0`,
      archetype,
      name: `${archetype} final`,
      itemIds: ['T001', 'B001', 'S001'],
      colorHook: 'Cream tee and brown shoes bridge the brown pants.',
      whyItWorks: 'The proportions and palette are coherent.',
      weatherNote: 'Comfortable today.'
    }));
    const captured: string[] = [];
    const common = {
      DAILY_V2: { ARCHETYPES: archetypes },
      modelWeatherViewV2_: (value: object) => value,
      historyGuidanceV2_: () => guidance,
      console
    };

    const plannerApi = evaluateAppsScript<{
      plannerPartsV2_: (archetype: string, snapshotValue: HistorySnapshot, weather: object, history: object) => Array<{ text?: string }>;
      repairPlannerResponseV2_: (archetype: string, invalid: object, errors: string[], snapshotValue: HistorySnapshot, weather: object, history: object) => object;
    }>(['ItemIndex.gs', 'Taste.gs', 'Planner.gs'], '({ plannerPartsV2_, repairPlannerResponseV2_ })', {
      ...common,
      loadHistoryV2_: () => [],
      Utilities: utilities,
      callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
        captured.push(parts.map(part => part.text || '').join('\n'));
        return { archetype: 'easy', candidates: [] };
      },
      validatePlannerResponseV2_: () => []
    });
    captured.push(plannerApi.plannerPartsV2_('easy', snapshot, weather, history)[0].text || '');
    plannerApi.repairPlannerResponseV2_('easy', {}, ['invalid'], snapshot, weather, history);

    const criticApi = evaluateAppsScript<{
      runCriticV2_: (snapshotValue: HistorySnapshot, weather: object, history: object, planners: object[]) => object;
      repairCriticResponseV2_: (snapshotValue: HistorySnapshot, weather: object, history: object, candidates: object[], invalid: object, errors: string[]) => object;
    }>(['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs'], '({ runCriticV2_, repairCriticResponseV2_ })', {
      ...common,
      loadHistoryV2_: () => [],
      Utilities: utilities,
      archetypeBriefV2_: (value: string) => value,
      callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
        captured.push(parts.map(part => part.text || '').join('\n'));
        return critic;
      }
    });
    criticApi.runCriticV2_(snapshot, weather, history, [{ candidates }]);
    criticApi.repairCriticResponseV2_(snapshot, weather, history, candidates, {}, ['invalid']);

    const curatorApi = evaluateAppsScript<{
      runCuratorV2_: (snapshotValue: HistorySnapshot, weather: object, history: object, planners: object[], critic: object) => object;
    }>(['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs'], '({ runCuratorV2_ })', {
      ...common,
      loadHistoryV2_: () => [],
      Utilities: utilities,
      callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
        captured.push(parts.map(part => part.text || '').join('\n'));
        return { recommendations: labelRecommendations };
      }
    });
    curatorApi.runCuratorV2_(snapshot, weather, history, [{ candidates }], critic);

    const repairApi = evaluateAppsScript<{
      repairFinalBundleV2_: (curated: object, errors: string[], snapshotValue: HistorySnapshot, weather: object, history: object, planners: object[], critic: object) => object;
    }>(['ItemIndex.gs', 'Taste.gs', 'Planner.gs', 'Critic.gs', 'Curator.gs', 'Repair.gs'], '({ repairFinalBundleV2_ })', {
      ...common,
      loadHistoryV2_: () => [],
      Utilities: utilities,
      callGeminiV2_: (_stage: string, parts: Array<{ text?: string }>) => {
        captured.push(parts.map(part => part.text || '').join('\n'));
        return { recommendations: labelRecommendations };
      },
      validateFinalBundleV2_: () => []
    });
    repairApi.repairFinalBundleV2_({ recommendations: [] }, ['invalid'], snapshot, weather, history, [{ candidates }], critic);

    expect(captured).toHaveLength(6);
    captured.forEach(prompt => {
      expect(prompt).toContain(guidance);
      expect(prompt).toContain('Keep ordinary prose intact with T001, INVALID_LABEL, and INVALID_LABEL.');
      expect(prompt).not.toContain(topId);
      expect(prompt).not.toContain(bottomId);
      expect(prompt).not.toContain(shoeId);
      expect(prompt).not.toContain(layerId);
      expect(prompt).not.toContain(staleId);
      expect(prompt).not.toContain(staleItemId);
      expect(prompt).not.toContain('cooldownItemIds');
      expect(prompt).not.toContain('wornItemIds');
    });
  });
});

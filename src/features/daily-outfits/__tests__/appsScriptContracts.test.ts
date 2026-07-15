import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apps = (file: string) => readFileSync(join(process.cwd(), 'apps-script/daily-outfits-v2', file), 'utf8');

const plannerValidator = new Function(`
  function itemMapV2_(snapshot) { var map = {}; snapshot.items.forEach(function(item) { map[item.id] = item; }); return map; }
  ${apps('Taste.gs')}
  ${apps('PlannerValidation.gs')}
  return validatePlannerResponseV2_;
`)() as (response: unknown, archetype: string, snapshot: unknown) => string[];

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
  var DAILY_V2 = { ARCHETYPES: ['easy','polished-casual','expressive'], REQUIRED_SLOTS: ['top','bottom','shoes'] };
  function itemMapV2_(snapshot) { var map = Object.create(null); snapshot.items.forEach(function(item) { map[item.id] = item; }); return map; }
  function savedOutfitNearCopyV2_() { return null; }
  ${apps('FinalValidation.gs')}
  return validateFinalBundleV2_;
`)() as (
  curated: unknown,
  snapshot: unknown,
  weather: unknown,
  history: unknown,
  selectedCandidates: unknown[],
  critic: unknown
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

  it('rejects saved-outfit near-copies and superficial planner variations', () => {
    const valid = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
    const nearCopy = structuredClone(valid);
    nearCopy.candidates[0] = { ...nearCopy.candidates[0], topId: 'top', bottomId: 'bottom', itemIds: ['top', 'bottom', 'shoe-0'] };
    expect(plannerValidator(nearCopy, 'easy', snapshot).join(' ')).toMatch(/near-copies saved outfit/);

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
    expect(weatherSafety({ itemIds: ['top', 'bottom', 'shoe'] }, byId, { ...weather, rainExpected: true }, snapshot).join(' ')).toMatch(/rain-unsafe/);
    expect(weatherSafety({ itemIds: ['top', 'bottom', 'safe-shoe', 'layer-w4'] }, byId, weather, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top', 'bottom', 'safe-shoe', 'layer-w4'] }, byId, { ...weather, middayFeelsLikeF: 85.1 }, snapshot).join(' ')).toMatch(/warmth-4 layer/);
    expect(weatherSafety({ itemIds: ['top-w4', 'bottom', 'safe-shoe'] }, byId, weather, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top-w4', 'bottom', 'safe-shoe'] }, byId, { ...weather, middayFeelsLikeF: 85.1 }, snapshot).join(' ')).toMatch(/warmth-4 top/);
    expect(weatherSafety({ itemIds: ['top-w3', 'bottom', 'safe-shoe'] }, byId, { ...weather, middayFeelsLikeF: 92 }, snapshot)).toEqual([]);
    expect(weatherSafety({ itemIds: ['top-w3', 'bottom', 'safe-shoe'] }, byId, { ...weather, middayFeelsLikeF: 92.1 }, snapshot).join(' ')).toMatch(/warmth-3 top/);
  });

  it('contains the lock, staged resume, and send-after-success duplicate protections', () => {
    const scheduler = apps('Scheduler.gs');
    expect(scheduler).toMatch(/LockService\.getScriptLock/);
    expect(scheduler).toMatch(/weather-ready/);
    expect(scheduler).toMatch(/planners-ready/);
    expect(scheduler).toMatch(/critic-ready/);
    const sendIndex = scheduler.indexOf('sendDailyBundleNowV2_');
    const sentDateIndex = scheduler.indexOf("setProperty('LAST_SENT_DATE_V2'", sendIndex);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(sentDateIndex).toBeGreaterThan(sendIndex);
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
    const weather = { morningFeelsLikeF: 60, middayFeelsLikeF: 70, eveningFeelsLikeF: 60, rainExpected: false, layerGuidance: 'none' };
    const history = { exactOutfitsPrevious14Days: [], cooldownItemIds: [] };
    expect(finalValidator(curated, finalSnapshot, weather, history, selected, critic)).toEqual([]);

    const duplicateSelected = structuredClone(selected);
    const duplicateCurated = structuredClone(curated);
    duplicateSelected[1].candidateId = duplicateSelected[0].candidateId;
    duplicateCurated.recommendations[1].candidateId = duplicateCurated.recommendations[0].candidateId;
    expect(finalValidator(duplicateCurated, finalSnapshot, weather, history, duplicateSelected, critic).join(' '))
      .toMatch(/duplicates a final candidate/);

    const duplicateItemsSelected = structuredClone(selected);
    const duplicateItemsCurated = structuredClone(curated);
    duplicateItemsSelected[1].topId = duplicateItemsSelected[0].topId;
    duplicateItemsSelected[1].itemIds[0] = duplicateItemsSelected[0].itemIds[0];
    duplicateItemsCurated.recommendations[1].itemIds[0] = duplicateItemsCurated.recommendations[0].itemIds[0];
    expect(finalValidator(duplicateItemsCurated, finalSnapshot, weather, history, duplicateItemsSelected, critic).join(' '))
      .toMatch(/tops must be unique/);

    const duplicateScore = { scores: critic.scores.concat(structuredClone(critic.scores[0])) };
    expect(finalValidator(curated, finalSnapshot, weather, history, selected, duplicateScore).join(' '))
      .toMatch(/no eligible critic score/);

    const malformedScore = structuredClone(critic);
    malformedScore.scores[0].candidateId = '';
    expect(finalValidator(curated, finalSnapshot, weather, history, selected, malformedScore).join(' '))
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
      const scoreErrors = finalValidator(curated, finalSnapshot, weather, history, selected, invalidScore)
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
    expect(finalValidator(reordered, finalSnapshot, weather, history, selected, critic).join(' '))
      .toMatch(/changed or reordered the selected itemIds/);

    const swapped = structuredClone(curated);
    [swapped.recommendations[0], swapped.recommendations[1]] = [swapped.recommendations[1], swapped.recommendations[0]];
    expect(finalValidator(swapped, finalSnapshot, weather, history, selected, critic).join(' '))
      .toMatch(/changed or reordered the selected candidateId/);

    expect(finalValidator(curated, finalSnapshot, weather, {
      ...history,
      cooldownItemIds: [selected[0].topId, selected[1].shoeId]
    }, selected, critic).join(' ')).toMatch(/yesterday top\/bottom cooldown/);
  });
});

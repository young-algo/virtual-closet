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

const criticValidator = new Function(`
  ${apps('Critic.gs')}
  return validateCriticResponseV2_;
`)() as (response: unknown, candidates: unknown[]) => string[];

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

  it('blocks critic finalists below the final weather or visual-coherence floor', () => {
    const candidates = ['easy', 'polished-casual', 'expressive'].flatMap(archetype =>
      Array.from({ length: 5 }, (_, index) => ({ candidateId: `${archetype}-${index}`, archetype }))
    );
    const scores = candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      weather: 9,
      palette: 8,
      colorIntent: 8.5,
      silhouette: 8,
      formality: 8,
      visualInterest: 8,
      wearability: 8,
      freshness: 8,
      archetypeFit: 8,
      disqualified: false,
      criticalDefects: [],
      reservations: []
    }));
    const response = {
      scores,
      finalists: {
        easy: ['easy-0', 'easy-1'],
        polishedCasual: ['polished-casual-0', 'polished-casual-1'],
        expressive: ['expressive-0', 'expressive-1']
      }
    };
    expect(criticValidator(response, candidates)).toEqual([]);
    scores.find(score => score.candidateId === 'expressive-1')!.weather = 7.9;
    expect(criticValidator(response, candidates).join(' ')).toMatch(/score floors/);
  });

  it('blocks finalists that are compatible but lack an intentional color hook', () => {
    const candidates = ['easy', 'polished-casual', 'expressive'].flatMap(archetype =>
      Array.from({ length: 5 }, (_, index) => ({ candidateId: `${archetype}-${index}`, archetype }))
    );
    const scores = candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      weather: 9,
      palette: 8,
      colorIntent: 8.5,
      silhouette: 8,
      formality: 8,
      visualInterest: 8,
      wearability: 8,
      freshness: 8,
      archetypeFit: 8,
      disqualified: false,
      criticalDefects: [],
      reservations: []
    }));
    const response = {
      scores,
      finalists: {
        easy: ['easy-0', 'easy-1'],
        polishedCasual: ['polished-casual-0', 'polished-casual-1'],
        expressive: ['expressive-0', 'expressive-1']
      }
    };
    scores.find(score => score.candidateId === 'easy-1')!.colorIntent = 7.9;
    expect(criticValidator(response, candidates).join(' ')).toMatch(/score floors/);
  });
});

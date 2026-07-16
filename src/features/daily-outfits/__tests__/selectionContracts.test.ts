import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

type Candidate = {
  candidateId: string;
  archetype: string;
  topId: string;
  bottomId: string;
  shoeId: string;
  layerId?: string;
  itemIds: string[];
};

type Item = {
  id: string;
  shortLabel: string;
  slot: 'top' | 'bottom' | 'shoes' | 'layer';
  category: string;
  profile: Record<string, unknown>;
};

const makeCandidate = (
  candidateId: string,
  archetype: string,
  topId: string,
  bottomId: string,
  shoeId: string,
  layerId?: string
): Candidate => ({
  candidateId,
  archetype,
  topId,
  bottomId,
  shoeId,
  ...(layerId ? { layerId } : {}),
  itemIds: [topId, bottomId, shoeId, ...(layerId ? [layerId] : [])]
});

const metrics = [
  'colorIntent',
  'palette',
  'weather',
  'archetypeFit',
  'visualInterest',
  'wearability',
  'freshness',
  'silhouette',
  'formality'
] as const;

const makeScore = (candidateId: string, overrides: Record<string, unknown> = {}) => ({
  candidateId,
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
  reservations: [],
  ...overrides
});

const flatScore = (candidateId: string, value: number, overrides: Record<string, unknown> = {}) =>
  makeScore(candidateId, {
    ...Object.fromEntries(metrics.map(metric => [metric, value])),
    ...overrides
  });

const item = (id: string, slot: Item['slot'], overrides: Partial<Item> = {}): Item => ({
  id,
  shortLabel: id.toUpperCase(),
  slot,
  category: slot === 'bottom' ? 'Pants' : slot === 'layer' ? 'Jackets' : 'Test',
  ...overrides,
  profile: {
    primaryColorFamily: id,
    silhouette: 'regular',
    warmth: slot === 'layer' ? 2 : 1,
    breathability: 4,
    rainSafety: 'good',
    available: true,
    excludedFromDaily: false,
    ...(overrides.profile || {})
  }
});

const idsBySlot = {
  top: Array.from({ length: 12 }, (_, index) => `t${index + 1}`),
  bottom: Array.from({ length: 12 }, (_, index) => `b${index + 1}`),
  shoes: Array.from({ length: 6 }, (_, index) => `s${index + 1}`),
  layer: Array.from({ length: 3 }, (_, index) => `l${index + 1}`)
};

const baseSnapshot = {
  settings: {},
  tasteExamples: [],
  items: [
    ...idsBySlot.top.map(id => item(id, 'top')),
    ...idsBySlot.bottom.map(id => item(id, 'bottom')),
    ...idsBySlot.shoes.map(id => item(id, 'shoes')),
    ...idsBySlot.layer.map(id => item(id, 'layer'))
  ]
};

const baseWeather = {
  rainExpected: false,
  layerGuidance: 'none',
  middayFeelsLikeF: 70,
  morningFeelsLikeF: 60,
  eveningFeelsLikeF: 60
};

const emptyHistory = { exactOutfitsPrevious14Days: [], cooldownItemIds: [] };

const updateItem = (snapshot: typeof baseSnapshot, id: string, patch: Partial<Item>) => ({
  ...structuredClone(snapshot),
  items: snapshot.items.map(existing => existing.id === id ? item(id, existing.slot, {
    ...existing,
    ...patch,
    profile: { ...existing.profile, ...(patch.profile || {}) }
  }) : structuredClone(existing))
});

const removeItemProfile = (snapshot: typeof baseSnapshot, id: string) => {
  const broken = structuredClone(snapshot) as unknown as {
    items: Array<{ id: string; profile?: Record<string, unknown> }>;
  };
  const selected = broken.items.find(existing => existing.id === id);
  if (selected) delete selected.profile;
  return broken;
};

const removeItemProfileField = (snapshot: typeof baseSnapshot, id: string, field: string) => {
  const broken = structuredClone(snapshot);
  const selected = broken.items.find(existing => existing.id === id);
  if (selected) delete selected.profile[field];
  return broken;
};

let forbiddenCalls = 0;
const forbidden = () => {
  forbiddenCalls += 1;
  throw new Error('selector crossed a model, network, or persistence boundary');
};

const api = evaluateAppsScript<{
  weights: Record<string, number>;
  compositeScoreV2_: (score: object) => number;
  selectFinalistsV2_: (
    candidates: unknown[],
    scores: unknown[],
    snapshot: object,
    weather: object,
    history: object
  ) => Record<string, unknown>;
  selectFinalSetV2_: (
    pools: Record<string, unknown[]>,
    scores: unknown[],
    snapshot: object,
    weather: object
  ) => Record<string, unknown>;
  candidateSetErrorsV2_: (
    set: Candidate[],
    snapshot: object,
    weather: object,
    expectedArchetypes?: string[]
  ) => string[];
  selectExhaustedFinalSetV2_: (
    pools: Record<string, Candidate[]>,
    scores: object[],
    snapshot: object,
    weather: object
  ) => {
    selectedCandidates: Candidate[];
    deliveryMode: 'complete' | 'partial';
    feasibleSetCount: number;
    needsReplan: null;
  } | null;
  deliveryCoverageForCandidatesV2_: (selected: Candidate[]) => {
    deliveryMode: 'complete' | 'partial';
    selectedCount: 1 | 2 | 3;
    selectedArchetypes: string[];
    omittedArchetypes: string[];
  };
  chooseReplanArchetypeV2_: (
    eligible: Record<string, unknown[]>,
    scores: unknown[],
    excluded: string[]
  ) => string | null;
}>(
  ['Config.gs', 'ItemIndex.gs', 'Critic.gs', 'Taste.gs', 'FinalValidation.gs', 'Selection.gs'],
  '({ weights: DAILY_V2.COMPOSITE_WEIGHTS, compositeScoreV2_, selectFinalistsV2_, selectFinalSetV2_, candidateSetErrorsV2_, selectExhaustedFinalSetV2_, deliveryCoverageForCandidatesV2_, chooseReplanArchetypeV2_ })',
  {
    console,
    callGeminiWithRepairV2_: forbidden,
    UrlFetchApp: { fetch: forbidden },
    DriveApp: { getFileById: forbidden },
    PropertiesService: { getScriptProperties: forbidden }
  }
);

const finalists = (
  candidates: unknown[],
  scores: unknown[],
  snapshot: object = baseSnapshot,
  weather: object = baseWeather,
  history: object = emptyHistory
) => api.selectFinalistsV2_(candidates, scores, snapshot, weather, history) as {
  needsReplan: string | null;
  finalistPools: Record<string, Candidate[]>;
  eligibleByArchetype: Record<string, Candidate[]>;
  eligibleCountByArchetype: Record<string, number>;
  compositeById: Record<string, number>;
};

const finalSet = (
  pools: Record<string, unknown[]>,
  scores: unknown[],
  snapshot: object = baseSnapshot,
  weather: object = baseWeather
) => api.selectFinalSetV2_(pools, scores, snapshot, weather) as {
  selectedCandidates: Candidate[] | null;
  path: 'top2' | 'top3';
  feasibleSetCount: number;
  needsReplan: string | null;
  deliveryMode: 'complete';
  selectedCount: 3;
  selectedArchetypes: string[];
  omittedArchetypes: string[];
};

const onePerArchetype = (overrides: Partial<Record<'easy' | 'polished-casual' | 'expressive', Candidate>> = {}) => ({
  easy: [overrides.easy || makeCandidate('e1', 'easy', 't1', 'b1', 's1')],
  'polished-casual': [overrides['polished-casual'] || makeCandidate('p1', 'polished-casual', 't2', 'b2', 's2')],
  expressive: [overrides.expressive || makeCandidate('x1', 'expressive', 't3', 'b3', 's3')]
});

const scoresForPools = (pools: Record<string, Candidate[]>) =>
  Object.values(pools).flat().map(candidate => makeScore(candidate.candidateId));

describe('deterministic selection weights', () => {
  const expectedWeights = {
    colorIntent: 0.20,
    palette: 0.15,
    weather: 0.12,
    archetypeFit: 0.10,
    visualInterest: 0.10,
    wearability: 0.10,
    freshness: 0.10,
    silhouette: 0.08,
    formality: 0.05
  };

  it.each(Object.entries(expectedWeights))('configures and applies the exact %s weight', (metric, weight) => {
    expect(api.weights[metric]).toBe(weight);
    const score = makeScore('weight', Object.fromEntries(metrics.map(name => [name, name === metric ? 10 : 0])));
    expect(api.compositeScoreV2_(score)).toBe(10 * weight);
  });

  it('sums the configured weights to one', () => {
    expect(Object.values(api.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(api.compositeScoreV2_(makeScore('all-tens', Object.fromEntries(metrics.map(metric => [metric, 10]))))).toBeCloseTo(10, 12);
  });
});

describe('candidate eligibility and per-archetype ordering', () => {
  it.each([
    ['critic disqualification', { disqualified: true }],
    ['weather floor', { weather: 7.99 }],
    ['palette floor', { palette: 7.49 }],
    ['color-intent floor', { colorIntent: 7.99 }],
    ['visual-coherence average', { palette: 7.5, silhouette: 7, formality: 7.9 }]
  ])('fails closed on the exact %s rule', (_name, scoreOverride) => {
    const candidate = makeCandidate('e1', 'easy', 't1', 'b1', 's1');
    expect(finalists([candidate], [makeScore('e1', scoreOverride)]).eligibleCountByArchetype.easy).toBe(0);
  });

  it('rejects an exact prior-14-day item combination regardless of item order', () => {
    const candidate = makeCandidate('e1', 'easy', 't1', 'b1', 's1');
    const history = { exactOutfitsPrevious14Days: [{ itemIds: ['s1', 't1', 'b1'] }], cooldownItemIds: [] };
    expect(finalists([candidate], [makeScore('e1')], baseSnapshot, baseWeather, history).eligibleCountByArchetype.easy).toBe(0);
  });

  it('does not confuse distinct exact-history item arrays containing delimiters', () => {
    const snapshot = {
      ...baseSnapshot,
      items: [
        ...baseSnapshot.items,
        item('a', 'top'),
        item('a|b', 'top'),
        item('b|c', 'bottom'),
        item('c', 'bottom'),
        item('d', 'shoes')
      ]
    };
    const candidate = makeCandidate('pipe-history', 'easy', 'a|b', 'c', 'd');
    const collidingHistory = {
      exactOutfitsPrevious14Days: [{ itemIds: ['a', 'b|c', 'd'] }],
      cooldownItemIds: []
    };
    expect(finalists([candidate], [makeScore(candidate.candidateId)], snapshot, baseWeather, collidingHistory)
      .eligibleCountByArchetype.easy).toBe(1);
  });

  it('rejects a true exact-history repeat whose item ids contain delimiters', () => {
    const snapshot = {
      ...baseSnapshot,
      items: [...baseSnapshot.items, item('a|b', 'top'), item('c', 'bottom'), item('d', 'shoes')]
    };
    const candidate = makeCandidate('pipe-exact', 'easy', 'a|b', 'c', 'd');
    const history = {
      exactOutfitsPrevious14Days: [{ itemIds: ['d', 'a|b', 'c'] }],
      cooldownItemIds: []
    };
    expect(finalists([candidate], [makeScore(candidate.candidateId)], snapshot, baseWeather, history)
      .eligibleCountByArchetype.easy).toBe(0);
  });

  it('rejects structurally different candidate itemIds that collide when joined', () => {
    const snapshot = {
      ...baseSnapshot,
      items: [
        ...baseSnapshot.items,
        item('a', 'top'),
        item('a|b', 'top'),
        item('b|c', 'bottom'),
        item('c', 'bottom'),
        item('d', 'shoes')
      ]
    };
    const malformed = {
      ...makeCandidate('pipe-malformed', 'easy', 'a', 'b|c', 'd'),
      itemIds: ['a|b', 'c', 'd']
    };
    expect(finalists([malformed], [makeScore(malformed.candidateId)], snapshot).eligibleCountByArchetype.easy).toBe(0);
    const pools = onePerArchetype({ easy: malformed });
    expect(finalSet(pools, scoresForPools(pools), snapshot).selectedCandidates).toBeNull();
  });

  it('blocks only exact manual saved core trios', () => {
    const candidate = makeCandidate('e1', 'easy', 't1', 'b1', 's1');
    const transformedSnapshot = { ...baseSnapshot, tasteExamples: [{ id: 'saved', name: 'Saved', itemIds: ['t1', 'b1', 's4'] }] };
    expect(finalists([candidate], [makeScore('e1')], transformedSnapshot).eligibleCountByArchetype.easy).toBe(1);

    const exactManualSnapshot = { ...baseSnapshot, tasteExamples: [{ id: 'manual', name: 'Manual', itemIds: ['t1', 'b1', 's1'] }] };
    expect(finalists([candidate], [makeScore('e1')], exactManualSnapshot).eligibleCountByArchetype.easy).toBe(0);

    const exactAiSnapshot = { ...baseSnapshot, tasteExamples: [{ id: 'ai', name: 'AI', source: 'ai', itemIds: ['t1', 'b1', 's1'] }] };
    expect(finalists([candidate], [makeScore('e1')], exactAiSnapshot).eligibleCountByArchetype.easy).toBe(1);

    const hiddenManualSnapshot = { ...baseSnapshot, tasteExamples: [{ id: 'hidden', name: 'Hidden', seedStylist: false, itemIds: ['t1', 'b1', 's1'] }] };
    expect(finalists([candidate], [makeScore('e1')], hiddenManualSnapshot).eligibleCountByArchetype.easy).toBe(0);

    const duplicateAndLayerSnapshot = { ...baseSnapshot, tasteExamples: [{ id: 'layered', name: 'Layered', itemIds: ['t1', 't1', 'b1', 's1', 'l1'] }] };
    expect(finalists([candidate], [makeScore('e1')], duplicateAndLayerSnapshot).eligibleCountByArchetype.easy).toBe(0);
  });

  it('applies cooldown only to tops and bottoms, not shoes or layers', () => {
    const candidates = [
      makeCandidate('top', 'easy', 't1', 'b1', 's1', 'l1'),
      makeCandidate('bottom', 'easy', 't2', 'b2', 's2', 'l2'),
      makeCandidate('shoe-layer', 'easy', 't3', 'b3', 's3', 'l3')
    ];
    const history = { exactOutfitsPrevious14Days: [], cooldownItemIds: ['t1', 'b2', 's3', 'l3'] };
    const result = finalists(candidates, candidates.map(value => makeScore(value.candidateId)), baseSnapshot, baseWeather, history);
    expect(result.finalistPools.easy.map(value => value.candidateId)).toEqual(['shoe-layer']);
  });

  it.each([
    ['shorts below 48F', 'b1', { category: 'Shorts' }, { middayFeelsLikeF: 47.9 }, undefined],
    ['missing layer below 40F with a light top', 't1', { profile: { warmth: 2 } }, { morningFeelsLikeF: 39.9 }, undefined],
    ['warmth-5 layer above 82F', 'l1', { profile: { warmth: 5 } }, { middayFeelsLikeF: 82.1 }, 'l1'],
    ['warmth-4 layer above 85F', 'l1', { profile: { warmth: 4 } }, { middayFeelsLikeF: 85.1 }, 'l1'],
    ['warmth-4 top above 85F', 't1', { profile: { warmth: 4 } }, { middayFeelsLikeF: 85.1 }, undefined],
    ['warmth-3 top above 92F', 't1', { profile: { warmth: 3 } }, { middayFeelsLikeF: 92.1 }, undefined],
    ['low-breathability top plus warm layer above 80F', 't1', { profile: { breathability: 2 } }, { middayFeelsLikeF: 80.1 }, 'l1']
  ])('enforces the %s deterministic weather guard', (_name, itemId, patch, weatherPatch, layerId) => {
    let snapshot = updateItem(baseSnapshot, itemId, patch as Partial<Item>);
    if (_name === 'low-breathability top plus warm layer above 80F') {
      snapshot = updateItem(snapshot, 'l1', { profile: { warmth: 4 } });
    }
    const candidate = makeCandidate('e1', 'easy', 't1', 'b1', 's1', layerId);
    const result = finalists([candidate], [makeScore('e1')], snapshot, { ...baseWeather, ...weatherPatch });
    expect(result.eligibleCountByArchetype.easy).toBe(0);
  });

  it.each([
    ['shorts at 48F', 'b1', { category: 'Shorts' }, { middayFeelsLikeF: 48 }, undefined],
    ['missing layer at 40F with a light top', 't1', { profile: { warmth: 2 } }, { morningFeelsLikeF: 40 }, undefined],
    ['warmth-5 layer at 82F', 'l1', { profile: { warmth: 5 } }, { middayFeelsLikeF: 82 }, 'l1'],
    ['warmth-4 layer at 85F', 'l1', { profile: { warmth: 4 } }, { middayFeelsLikeF: 85 }, 'l1'],
    ['warmth-4 top at 85F', 't1', { profile: { warmth: 4 } }, { middayFeelsLikeF: 85 }, undefined],
    ['warmth-3 top at 92F', 't1', { profile: { warmth: 3 } }, { middayFeelsLikeF: 92 }, undefined],
    ['low-breathability top plus warm layer at 80F', 't1', { profile: { breathability: 2 } }, { middayFeelsLikeF: 80 }, 'l1']
  ])('accepts the exact boundary for %s', (_name, itemId, patch, weatherPatch, layerId) => {
    let snapshot = updateItem(baseSnapshot, itemId, patch as Partial<Item>);
    if (_name === 'low-breathability top plus warm layer at 80F') {
      snapshot = updateItem(snapshot, 'l1', { profile: { warmth: 4 } });
    }
    const candidate = makeCandidate('e1', 'easy', 't1', 'b1', 's1', layerId);
    expect(finalists([candidate], [makeScore('e1')], snapshot, { ...baseWeather, ...weatherPatch }).eligibleCountByArchetype.easy).toBe(1);
  });

  it('rejects rain-unsafe shoes when a safer shoe exists and permits them otherwise', () => {
    const candidate = makeCandidate('e1', 'easy', 't1', 'b1', 's1');
    let snapshot = updateItem(baseSnapshot, 's1', { profile: { rainSafety: 'poor' } });
    expect(finalists([candidate], [makeScore('e1')], snapshot, { ...baseWeather, rainExpected: true }).eligibleCountByArchetype.easy).toBe(0);
    snapshot = {
      ...snapshot,
      items: snapshot.items.map(value => value.slot === 'shoes' ? item(value.id, 'shoes', { ...value, profile: { ...value.profile, rainSafety: 'poor' } }) : value)
    };
    expect(finalists([candidate], [makeScore('e1')], snapshot, { ...baseWeather, rainExpected: true }).eligibleCountByArchetype.easy).toBe(1);
  });

  it.each([
    ['unknown topId', makeCandidate('invalid', 'easy', 'unknown-top', 'b1', 's1'), baseSnapshot, baseWeather],
    ['unknown bottomId', makeCandidate('invalid', 'easy', 't1', 'unknown-bottom', 's1'), baseSnapshot, baseWeather],
    ['unknown shoeId', makeCandidate('invalid', 'easy', 't1', 'b1', 'unknown-shoe'), baseSnapshot, baseWeather],
    ['unknown layerId', makeCandidate('invalid', 'easy', 't1', 'b1', 's1', 'unknown-layer'), baseSnapshot, baseWeather],
    ['wrong-slot topId', makeCandidate('invalid', 'easy', 's2', 'b1', 's1'), baseSnapshot, baseWeather],
    ['wrong-slot bottomId', makeCandidate('invalid', 'easy', 't1', 't2', 's1'), baseSnapshot, baseWeather],
    ['wrong-slot shoeId', makeCandidate('invalid', 'easy', 't1', 'b1', 't2'), baseSnapshot, baseWeather],
    ['wrong-slot layerId', makeCandidate('invalid', 'easy', 't1', 'b1', 's1', 's2'), baseSnapshot, baseWeather],
    ['missing top profile', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfile(baseSnapshot, 't1'), baseWeather],
    ['missing bottom profile', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfile(baseSnapshot, 'b1'), baseWeather],
    ['missing shoe profile', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfile(baseSnapshot, 's1'), baseWeather],
    ['missing layer profile', makeCandidate('invalid', 'easy', 't1', 'b1', 's1', 'l1'), removeItemProfile(baseSnapshot, 'l1'), baseWeather],
    ['missing top story color', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfileField(baseSnapshot, 't1', 'primaryColorFamily'), baseWeather],
    ['missing bottom story silhouette', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfileField(baseSnapshot, 'b1', 'silhouette'), baseWeather],
    ['missing top warmth', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfileField(baseSnapshot, 't1', 'warmth'), baseWeather],
    ['missing top breathability', makeCandidate('invalid', 'easy', 't1', 'b1', 's1', 'l1'), removeItemProfileField(updateItem(baseSnapshot, 'l1', { profile: { warmth: 4 } }), 't1', 'breathability'), { ...baseWeather, middayFeelsLikeF: 80.1 }],
    ['missing shoe rainSafety', makeCandidate('invalid', 'easy', 't1', 'b1', 's1'), removeItemProfileField(baseSnapshot, 's1', 'rainSafety'), { ...baseWeather, rainExpected: true }],
    ['missing layer warmth', makeCandidate('invalid', 'easy', 't1', 'b1', 's1', 'l1'), removeItemProfileField(baseSnapshot, 'l1', 'warmth'), baseWeather]
  ])('fails closed without throwing for %s in finalists and direct final-set selection', (_name, candidate, snapshot, weather) => {
    const pools = onePerArchetype({ easy: candidate });
    const scores = scoresForPools(pools);
    expect(() => finalists([candidate], [makeScore(candidate.candidateId)], snapshot, weather)).not.toThrow();
    expect(finalists([candidate], [makeScore(candidate.candidateId)], snapshot, weather).eligibleCountByArchetype.easy).toBe(0);
    expect(() => finalSet(pools, scores, snapshot, weather)).not.toThrow();
    expect(finalSet(pools, scores, snapshot, weather).selectedCandidates).toBeNull();
  });

  it('tolerates an unrelated shoe with no profile during rainy finalist safety checks', () => {
    let snapshot = updateItem(baseSnapshot, 's1', { profile: { rainSafety: 'poor' } });
    snapshot = removeItemProfile(snapshot, 's2') as typeof baseSnapshot;
    const candidate = makeCandidate('rain-profile-gap', 'easy', 't1', 'b1', 's1');
    expect(() => finalists([candidate], [makeScore(candidate.candidateId)], snapshot, { ...baseWeather, rainExpected: true })).not.toThrow();
    expect(finalists([candidate], [makeScore(candidate.candidateId)], snapshot, { ...baseWeather, rainExpected: true })
      .eligibleCountByArchetype.easy).toBe(0);
  });

  it('orders each archetype by composite, color intent, then candidate id', () => {
    const candidates = [
      makeCandidate('composite-low', 'easy', 't1', 'b1', 's1'),
      makeCandidate('color-low', 'easy', 't2', 'b2', 's2'),
      makeCandidate('z-color-high', 'easy', 't3', 'b3', 's3'),
      makeCandidate('a-color-high', 'easy', 't4', 'b4', 's4')
    ];
    const scores = [
      makeScore('composite-low', { visualInterest: 7 }),
      makeScore('color-low', { colorIntent: 8, palette: 9 }),
      makeScore('z-color-high', { colorIntent: 8.75, palette: 8 }),
      makeScore('a-color-high', { colorIntent: 8.75, palette: 8 })
    ];
    expect(finalists(candidates, scores).finalistPools.easy.map(value => value.candidateId)).toEqual([
      'a-color-high',
      'z-color-high',
      'color-low',
      'composite-low'
    ]);
  });

  it('uses a raw total string order for canonically equivalent candidate ids', () => {
    const candidates = [
      makeCandidate('\u00e9', 'easy', 't1', 'b1', 's1'),
      makeCandidate('e\u0301', 'easy', 't2', 'b2', 's2')
    ];
    const scores = candidates.map(candidate => makeScore(candidate.candidateId));
    expect(finalists(candidates, scores).finalistPools.easy.map(value => value.candidateId)).toEqual(['e\u0301', '\u00e9']);
  });

  it('fails closed on duplicate candidate ids when the score id is unique', () => {
    const duplicate = makeCandidate('duplicate-candidate', 'easy', 't1', 'b1', 's1');
    const candidates = [
      duplicate,
      makeCandidate('duplicate-candidate', 'easy', 't2', 'b2', 's2')
    ];
    expect(finalists(candidates, [makeScore('duplicate-candidate')]).eligibleCountByArchetype.easy).toBe(0);
  });

  it('fails closed on duplicate score ids when the candidate id is unique', () => {
    const candidate = makeCandidate('duplicate-score', 'easy', 't1', 'b1', 's1');
    expect(finalists(
      [candidate],
      [makeScore('duplicate-score'), makeScore('duplicate-score')]
    ).eligibleCountByArchetype.easy).toBe(0);
  });

  it('fails closed without throwing on malformed candidate and score records', () => {
    const malformed = { candidateId: 'malformed', archetype: 'easy', itemIds: 'not-an-array' };
    expect(() => finalists(
      [malformed, null],
      [makeScore('malformed', { palette: Number.NaN }), null]
    )).not.toThrow();
    expect(finalists(
      [malformed, null],
      [makeScore('malformed', { palette: Number.NaN }), null]
    ).eligibleCountByArchetype.easy).toBe(0);
    expect(api.compositeScoreV2_({})).toBe(Number.NEGATIVE_INFINITY);
  });

  it('handles prototype-key candidate ids without corrupting score or candidate maps', () => {
    const candidates = [
      makeCandidate('__proto__', 'easy', 't1', 'b1', 's1'),
      makeCandidate('constructor', 'easy', 't2', 'b2', 's2')
    ];
    const result = finalists(candidates, candidates.map(value => makeScore(value.candidateId)));
    expect(result.finalistPools.easy.map(value => value.candidateId).sort()).toEqual(['__proto__', 'constructor'].sort());
    expect(Object.prototype.hasOwnProperty.call(result.compositeById, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.compositeById, 'constructor')).toBe(true);
  });
});

describe('final set constraints, widening, and rank order', () => {
  it('selects a complete trio when exactly one eligible candidate remains per archetype', () => {
    const pools = onePerArchetype();
    const candidates = Object.values(pools).flat();
    const scores = scoresForPools(pools);
    const finalistResult = finalists(candidates, scores);

    expect(finalistResult.needsReplan).toBeNull();
    const selectionResult = finalSet(finalistResult.finalistPools, scores);
    expect(selectionResult.selectedCandidates).toEqual(candidates);
    expect(selectionResult).toEqual(expect.objectContaining({
      deliveryMode: 'complete',
      selectedCount: 3,
      selectedArchetypes: ['easy', 'polished-casual', 'expressive'],
      omittedArchetypes: []
    }));
  });

  it('validates configured-order pairs and singletons with cardinality-aware shoe reuse', () => {
    const pools = onePerArchetype();
    const pair = [pools.easy[0], pools.expressive[0]];
    const singleton = [pools.expressive[0]];

    expect(api.candidateSetErrorsV2_(pair, baseSnapshot, baseWeather, ['easy', 'expressive'])).toEqual([]);
    expect(api.candidateSetErrorsV2_(singleton, baseSnapshot, baseWeather, ['expressive'])).toEqual([]);
    expect(api.candidateSetErrorsV2_(pair.slice().reverse(), baseSnapshot, baseWeather, ['easy', 'expressive']))
      .toContain('selected archetypes must follow configured order');
    expect(api.deliveryCoverageForCandidatesV2_(pair)).toEqual({
      deliveryMode: 'partial',
      selectedCount: 2,
      selectedArchetypes: ['easy', 'expressive'],
      omittedArchetypes: ['polished-casual']
    });
    expect(api.deliveryCoverageForCandidatesV2_(singleton)).toEqual({
      deliveryMode: 'partial',
      selectedCount: 1,
      selectedArchetypes: ['expressive'],
      omittedArchetypes: ['easy', 'polished-casual']
    });

    const repeatedShoe = [
      pools.easy[0],
      { ...pools.expressive[0], shoeId: pools.easy[0].shoeId, itemIds: ['t3', 'b3', pools.easy[0].shoeId] }
    ];
    expect(api.candidateSetErrorsV2_(repeatedShoe, baseSnapshot, baseWeather, ['easy', 'expressive']))
      .toContain('shoes must be unique');
    const forcedReuseSnapshot = structuredClone(baseSnapshot);
    forcedReuseSnapshot.items.forEach(value => {
      if (value.slot === 'shoes' && value.id !== 's1') value.profile.available = false;
    });
    expect(api.candidateSetErrorsV2_(repeatedShoe, forcedReuseSnapshot, baseWeather, ['easy', 'expressive']))
      .not.toContain('shoes must be unique');
  });

  it('preserves pairwise uniqueness, diversity, overlap, and layer constraints', () => {
    const topRepeat = [
      makeCandidate('easy-top', 'easy', 't1', 'b1', 's1'),
      makeCandidate('expressive-top', 'expressive', 't1', 'b2', 's2')
    ];
    expect(api.candidateSetErrorsV2_(topRepeat, baseSnapshot, baseWeather, ['easy', 'expressive']))
      .toContain('tops must be unique');

    const bottomRepeat = [
      makeCandidate('easy-bottom', 'easy', 't1', 'b1', 's1'),
      makeCandidate('expressive-bottom', 'expressive', 't2', 'b1', 's2')
    ];
    expect(api.candidateSetErrorsV2_(bottomRepeat, baseSnapshot, baseWeather, ['easy', 'expressive']))
      .toContain('bottoms must be unique');

    const diversityPair = [
      makeCandidate('easy-story', 'easy', 't1', 'b1', 's1'),
      makeCandidate('expressive-story', 'expressive', 't2', 'b2', 's2')
    ];
    let sameStorySnapshot = structuredClone(baseSnapshot);
    ['t1', 't2', 'b1', 'b2'].forEach(id => {
      sameStorySnapshot = updateItem(sameStorySnapshot, id, {
        profile: { primaryColorFamily: 'same', silhouette: 'same' }
      });
    });
    expect(api.candidateSetErrorsV2_(diversityPair, sameStorySnapshot, baseWeather, ['easy', 'expressive']))
      .toContain('diversity stories must be distinct');

    const sharedPair = [
      makeCandidate('easy-shared', 'easy', 't1', 'b1', 's1', 'l1'),
      makeCandidate('expressive-shared', 'expressive', 't2', 'b2', 's1', 'l1')
    ];
    expect(api.candidateSetErrorsV2_(sharedPair, baseSnapshot, baseWeather, ['easy', 'expressive']))
      .toContain('outfits share more than one item');

    const layerPair = [
      makeCandidate('easy-layer', 'easy', 't1', 'b1', 's1', 'l1'),
      makeCandidate('expressive-layer', 'expressive', 't2', 'b2', 's2', 'l1')
    ];
    expect(api.candidateSetErrorsV2_(layerPair, baseSnapshot, { ...baseWeather, layerGuidance: 'none' }, ['easy', 'expressive']))
      .toContain('layer repeat is not permitted');
  });

  it('ranks exhaustive sets by cardinality before score and supports singleton exhaustion', () => {
    const easy = makeCandidate('easy-pair', 'easy', 't1', 'b1', 's1');
    const expressive = makeCandidate('expressive-pair', 'expressive', 't2', 'b2', 's2');
    const polished = makeCandidate('polished-single', 'polished-casual', 't1', 'b2', 's3');
    const pools = { easy: [easy], 'polished-casual': [polished], expressive: [expressive] };
    const scores = [flatScore(easy.candidateId, 8), flatScore(polished.candidateId, 10), flatScore(expressive.candidateId, 8)];

    expect(api.selectExhaustedFinalSetV2_(pools, scores, baseSnapshot, baseWeather)).toEqual({
      selectedCandidates: [easy, expressive],
      deliveryMode: 'partial',
      feasibleSetCount: 1,
      needsReplan: null
    });
    expect(api.selectExhaustedFinalSetV2_(
      { easy: [], 'polished-casual': [], expressive: [expressive] },
      [flatScore(expressive.candidateId, 8)],
      baseSnapshot,
      baseWeather
    )).toEqual({
      selectedCandidates: [expressive],
      deliveryMode: 'partial',
      feasibleSetCount: 1,
      needsReplan: null
    });
    expect(api.selectExhaustedFinalSetV2_(
      { easy: [], 'polished-casual': [], expressive: [] },
      [],
      baseSnapshot,
      baseWeather
    )).toBeNull();
  });

  it('selects exactly one matching candidate per configured archetype', () => {
    const pools = onePerArchetype({ expressive: makeCandidate('x1', 'easy', 't3', 'b3', 's3') });
    expect(finalSet(pools, scoresForPools(pools)).selectedCandidates).toBeNull();
  });

  it.each([
    ['top', makeCandidate('p1', 'polished-casual', 't1', 'b2', 's2')],
    ['bottom', makeCandidate('p1', 'polished-casual', 't2', 'b1', 's2')]
  ])('requires unique %ss', (_slot, polished) => {
    const pools = onePerArchetype({ 'polished-casual': polished });
    expect(finalSet(pools, scoresForPools(pools)).selectedCandidates).toBeNull();
  });

  it('requires unique shoes when at least three currently usable weather-safe shoes exist', () => {
    const pools = onePerArchetype({ 'polished-casual': makeCandidate('p1', 'polished-casual', 't2', 'b2', 's1') });
    expect(finalSet(pools, scoresForPools(pools)).selectedCandidates).toBeNull();
  });

  it.each([
    ['unavailable shoes', { available: false }, false],
    ['excluded shoes', { excludedFromDaily: true }, false],
    ['rain-unsafe shoes during rain', { rainSafety: 'poor' }, true]
  ])('does not count %s toward the three-usable-shoe threshold', (_name, profilePatch, rainExpected) => {
    const pools = onePerArchetype({
      'polished-casual': makeCandidate('p1', 'polished-casual', 't2', 'b2', 's1'),
      expressive: makeCandidate('x1', 'expressive', 't3', 'b3', 's2')
    });
    let snapshot = structuredClone(baseSnapshot);
    snapshot.items = snapshot.items.filter(value => value.slot !== 'shoes' || ['s1', 's2', 's3'].includes(value.id));
    snapshot = updateItem(snapshot, 's3', { profile: profilePatch });
    const result = finalSet(pools, scoresForPools(pools), snapshot, { ...baseWeather, rainExpected });
    expect(result.selectedCandidates?.map(value => value.candidateId)).toEqual(['e1', 'p1', 'x1']);
  });

  it('rejects any pair that shares more than one item', () => {
    const pools = onePerArchetype({
      easy: makeCandidate('e1', 'easy', 't1', 'b1', 's1', 'l1'),
      'polished-casual': makeCandidate('p1', 'polished-casual', 't2', 'b2', 's1', 'l1'),
      expressive: makeCandidate('x1', 'expressive', 't3', 'b3', 's2')
    });
    let snapshot = structuredClone(baseSnapshot);
    snapshot.items = snapshot.items.filter(value => value.slot !== 'shoes' || ['s1', 's2'].includes(value.id));
    snapshot = updateItem(snapshot, 'l2', { profile: { excludedFromDaily: true } });
    expect(finalSet(pools, scoresForPools(pools), snapshot, { ...baseWeather, layerGuidance: 'required' }).selectedCandidates).toBeNull();
  });

  it('requires three distinct top-bottom color and silhouette stories', () => {
    const pools = onePerArchetype();
    let snapshot = structuredClone(baseSnapshot);
    ['t1', 't2', 't3', 'b1', 'b2', 'b3'].forEach(id => {
      snapshot = updateItem(snapshot, id, { profile: { primaryColorFamily: 'same', silhouette: 'same' } });
    });
    expect(finalSet(pools, scoresForPools(pools), snapshot).selectedCandidates).toBeNull();
  });

  it('permits a repeated layer only when required and fewer than two credible layers exist', () => {
    const pools = onePerArchetype({
      easy: makeCandidate('e1', 'easy', 't1', 'b1', 's1', 'l1'),
      'polished-casual': makeCandidate('p1', 'polished-casual', 't2', 'b2', 's2', 'l1'),
      expressive: makeCandidate('x1', 'expressive', 't3', 'b3', 's3', 'l1')
    });
    const scores = scoresForPools(pools);
    expect(finalSet(pools, scores).selectedCandidates).toBeNull();
    expect(finalSet(pools, scores, baseSnapshot, { ...baseWeather, layerGuidance: 'required' }).selectedCandidates).toBeNull();
    const snapshot = {
      ...baseSnapshot,
      items: baseSnapshot.items.map(value => value.slot === 'layer' && value.id !== 'l1'
        ? item(value.id, 'layer', { ...value, profile: { ...value.profile, excludedFromDaily: true } })
        : structuredClone(value))
    };
    expect(finalSet(pools, scores, snapshot, { ...baseWeather, layerGuidance: 'required' }).selectedCandidates?.map(value => value.candidateId)).toEqual(['e1', 'p1', 'x1']);
  });

  it('does not count a shoe with a missing profile in the usable-shoe scan', () => {
    const pools = onePerArchetype({
      'polished-casual': makeCandidate('p1', 'polished-casual', 't2', 'b2', 's1'),
      expressive: makeCandidate('x1', 'expressive', 't3', 'b3', 's2')
    });
    let snapshot = structuredClone(baseSnapshot);
    snapshot.items = snapshot.items.filter(existing => existing.slot !== 'shoes' || ['s1', 's2', 's3'].includes(existing.id));
    snapshot = removeItemProfile(snapshot, 's3') as typeof baseSnapshot;
    expect(() => finalSet(pools, scoresForPools(pools), snapshot)).not.toThrow();
    expect(finalSet(pools, scoresForPools(pools), snapshot)
      .selectedCandidates?.map(candidate => candidate.candidateId)).toEqual(['e1', 'p1', 'x1']);
  });

  it('does not count a layer with a missing profile in the credible-layer scan', () => {
    const pools = onePerArchetype({
      easy: makeCandidate('e1', 'easy', 't1', 'b1', 's1', 'l1'),
      'polished-casual': makeCandidate('p1', 'polished-casual', 't2', 'b2', 's2', 'l1'),
      expressive: makeCandidate('x1', 'expressive', 't3', 'b3', 's3', 'l1')
    });
    let snapshot = structuredClone(baseSnapshot);
    snapshot.items = snapshot.items.filter(existing => existing.slot !== 'layer' || ['l1', 'l2'].includes(existing.id));
    snapshot = removeItemProfile(snapshot, 'l2') as typeof baseSnapshot;
    expect(() => finalSet(pools, scoresForPools(pools), snapshot, { ...baseWeather, layerGuidance: 'required' })).not.toThrow();
    expect(finalSet(pools, scoresForPools(pools), snapshot, { ...baseWeather, layerGuidance: 'required' })
      .selectedCandidates?.map(candidate => candidate.candidateId)).toEqual(['e1', 'p1', 'x1']);
  });

  it('exhausts all finalists after the bounded window needs a replan', () => {
    const pools = {
      easy: [
        makeCandidate('e1', 'easy', 't1', 'b1', 's1'),
        makeCandidate('e2', 'easy', 't2', 'b2', 's1'),
        makeCandidate('e3', 'easy', 't3', 'b3', 's1'),
        makeCandidate('e4', 'easy', 't4', 'b4', 's1')
      ],
      'polished-casual': [
        makeCandidate('p1', 'polished-casual', 't5', 'b5', 's1'),
        makeCandidate('p2', 'polished-casual', 't6', 'b6', 's1'),
        makeCandidate('p3', 'polished-casual', 't7', 'b7', 's1'),
        makeCandidate('p4', 'polished-casual', 't8', 'b8', 's3')
      ],
      expressive: [
        makeCandidate('x1', 'expressive', 't9', 'b9', 's2'),
        makeCandidate('x2', 'expressive', 't10', 'b10', 's2'),
        makeCandidate('x3', 'expressive', 't11', 'b11', 's2'),
        makeCandidate('x4', 'expressive', 't12', 'b12', 's2')
      ]
    };
    const scores = scoresForPools(pools);
    const bounded = finalSet(pools, scores);
    expect(bounded.selectedCandidates).toBeNull();
    expect(bounded.needsReplan).not.toBeNull();

    const exhausted = api.selectExhaustedFinalSetV2_(pools, scores, baseSnapshot, baseWeather);
    expect(exhausted).toEqual(expect.objectContaining({
      deliveryMode: 'complete',
      needsReplan: null
    }));
    expect(exhausted?.selectedCandidates.map(value => value.candidateId)).toEqual(['e1', 'p4', 'x1']);
  });

  it('removes inventory-invalid finalists before taking the top two', () => {
    const pools = {
      easy: [
        makeCandidate('e-missing', 'easy', 'unknown-top', 'b4', 's4'),
        makeCandidate('e-wrong-slot', 'easy', 's4', 'b5', 's5'),
        makeCandidate('e-valid', 'easy', 't1', 'b1', 's1')
      ],
      'polished-casual': [makeCandidate('p1', 'polished-casual', 't2', 'b2', 's2')],
      expressive: [makeCandidate('x1', 'expressive', 't3', 'b3', 's3')]
    };

    expect(finalSet(pools, scoresForPools(pools))).toEqual(expect.objectContaining({
      path: 'top2',
      selectedCandidates: expect.arrayContaining([
        expect.objectContaining({ candidateId: 'e-valid' })
      ])
    }));
  });

  it('does not let inventory-invalid finalists hide the archetype that needs replanning', () => {
    const pools = {
      easy: [
        makeCandidate('e-missing', 'easy', 'unknown-top', 'b4', 's4'),
        makeCandidate('e-wrong-slot', 'easy', 's4', 'b5', 's5'),
        makeCandidate('e-valid', 'easy', 't1', 'b1', 's1')
      ],
      'polished-casual': [makeCandidate('p1', 'polished-casual', 't2', 'b2', 's1')],
      expressive: [
        makeCandidate('x1', 'expressive', 't3', 'b3', 's2'),
        makeCandidate('x2', 'expressive', 't4', 'b4', 's2')
      ]
    };

    expect(finalSet(pools, scoresForPools(pools))).toEqual(expect.objectContaining({
      selectedCandidates: null,
      needsReplan: 'easy',
      feasibleSetCount: 0
    }));
  });

  it('returns a deterministic needsReplan instead of throwing at a true dead end', () => {
    const pools = {
      easy: [makeCandidate('e1', 'easy', 't1', 'b1', 's1'), makeCandidate('e2', 'easy', 't2', 'b2', 's1')],
      'polished-casual': [makeCandidate('p1', 'polished-casual', 't4', 'b4', 's1'), makeCandidate('p2', 'polished-casual', 't5', 'b5', 's1')],
      expressive: [makeCandidate('x1', 'expressive', 't7', 'b7', 's2'), makeCandidate('x2', 'expressive', 't8', 'b8', 's2')]
    };
    expect(finalSet(pools, scoresForPools(pools))).toEqual(expect.objectContaining({
      selectedCandidates: null,
      needsReplan: 'easy',
      feasibleSetCount: 0
    }));
  });

  const conflictPools = () => ({
    easy: [
      makeCandidate('e-a', 'easy', 't1', 'b1', 's1'),
      makeCandidate('e-b', 'easy', 't2', 'b2', 's2')
    ],
    'polished-casual': [
      makeCandidate('p-a', 'polished-casual', 't3', 'b3', 's2'),
      makeCandidate('p-b', 'polished-casual', 't4', 'b4', 's1')
    ],
    expressive: [makeCandidate('x-a', 'expressive', 't5', 'b5', 's3')]
  });

  it('ranks feasible sets by composite sum first', () => {
    const pools = conflictPools();
    const scores = scoresForPools(pools).map(value => value.candidateId.endsWith('-b') ? flatScore(value.candidateId, 9) : flatScore(value.candidateId, 8));
    expect(finalSet(pools, scores).selectedCandidates?.map(value => value.candidateId)).toEqual(['e-b', 'p-b', 'x-a']);
  });

  it('ranks composite-sum ties by the weakest composite', () => {
    const pools = conflictPools();
    const values: Record<string, number> = { 'e-a': 9, 'p-a': 8, 'e-b': 8.5, 'p-b': 8.5, 'x-a': 8.5 };
    const scores = scoresForPools(pools).map(value => flatScore(value.candidateId, values[value.candidateId]));
    expect(finalSet(pools, scores).selectedCandidates?.map(value => value.candidateId)).toEqual(['e-b', 'p-b', 'x-a']);
  });

  it('ranks sum-and-weakest ties by color-intent sum', () => {
    const pools = conflictPools();
    const scores = scoresForPools(pools).map(value => makeScore(value.candidateId, value.candidateId.endsWith('-a')
      ? { colorIntent: 9.25, palette: 7.5 }
      : { colorIntent: 8.5, palette: 8.5 }));
    expect(finalSet(pools, scores).selectedCandidates?.map(value => value.candidateId)).toEqual(['e-a', 'p-a', 'x-a']);
  });

  it('breaks complete score ties by candidate ids', () => {
    const pools = {
      easy: [makeCandidate('e-b', 'easy', 't1', 'b1', 's1'), makeCandidate('e-a', 'easy', 't2', 'b2', 's4')],
      'polished-casual': [makeCandidate('p-a', 'polished-casual', 't4', 'b4', 's2'), makeCandidate('p-b', 'polished-casual', 't5', 'b5', 's4')],
      expressive: [makeCandidate('x-a', 'expressive', 't7', 'b7', 's3'), makeCandidate('x-b', 'expressive', 't8', 'b8', 's4')]
    };
    expect(finalSet(pools, scoresForPools(pools)).selectedCandidates?.map(value => value.candidateId).join('|')).toBe('e-a|p-a|x-a');
  });

  it('uses an injective total set order across genuinely permuted colliding inputs', () => {
    const pools = {
      easy: [
        makeCandidate('a', 'easy', 't1', 'b1', 's1'),
        makeCandidate('a|b', 'easy', 't2', 'b2', 's2')
      ],
      'polished-casual': [
        makeCandidate('b|c', 'polished-casual', 't3', 'b3', 's2'),
        makeCandidate('c', 'polished-casual', 't4', 'b4', 's1')
      ],
      expressive: [makeCandidate('d', 'expressive', 't5', 'b5', 's3')]
    };
    const scores = scoresForPools(pools);
    const permutedPools = {
      easy: pools.easy.slice().reverse(),
      'polished-casual': pools['polished-casual'].slice().reverse(),
      expressive: pools.expressive.slice().reverse()
    };
    const first = finalSet(pools, scores).selectedCandidates?.map(value => value.candidateId);
    const permuted = finalSet(permutedPools, scores.slice().reverse()).selectedCandidates?.map(value => value.candidateId);
    expect(first).toEqual(['a', 'b|c', 'd']);
    expect(permuted).toEqual(first);
  });

  it('fails closed on duplicate finalist candidate ids when score ids are unique', () => {
    const pools = onePerArchetype();
    pools.easy.push({ ...pools.easy[0], topId: 't4', bottomId: 'b4', shoeId: 's4', itemIds: ['t4', 'b4', 's4'] });
    const scores = scoresForPools(pools);
    expect(finalSet(pools, scores).selectedCandidates).toBeNull();
  });

  it('fails closed on duplicate finalist score ids when candidate ids are unique', () => {
    const pools = onePerArchetype();
    const scores = scoresForPools(pools);
    scores.push(makeScore('e1'));
    expect(finalSet(pools, scores).selectedCandidates).toBeNull();
  });

  it('fails closed without throwing on malformed finalist candidates', () => {
    const pools = onePerArchetype();
    const scores = scoresForPools(pools);
    expect(() => finalSet({ ...pools, easy: [null as unknown as Candidate] }, scores)).not.toThrow();
    expect(finalSet({ ...pools, easy: [null as unknown as Candidate] }, scores).selectedCandidates).toBeNull();
  });
});

describe('deterministic replan choice and purity', () => {
  const eligible = {
    easy: [makeCandidate('e1', 'easy', 't1', 'b1', 's1')],
    'polished-casual': [makeCandidate('p1', 'polished-casual', 't2', 'b2', 's2')],
    expressive: [
      makeCandidate('x1', 'expressive', 't3', 'b3', 's3'),
      makeCandidate('x2', 'expressive', 't4', 'b4', 's4')
    ]
  };

  it('chooses by eligible count, then lowest best composite, then configured archetype order', () => {
    const scores = [flatScore('e1', 9), flatScore('p1', 8), flatScore('x1', 7), flatScore('x2', 7)];
    expect(api.chooseReplanArchetypeV2_(eligible, scores, [])).toBe('polished-casual');
    expect(api.chooseReplanArchetypeV2_(eligible, [flatScore('e1', 8), flatScore('p1', 8), flatScore('x1', 7), flatScore('x2', 7)], [])).toBe('easy');
  });

  it('honors exclusions and returns null when every archetype is excluded', () => {
    const scores = Object.values(eligible).flat().map(value => makeScore(value.candidateId));
    expect(api.chooseReplanArchetypeV2_(eligible, scores, ['easy'])).toBe('polished-casual');
    expect(api.chooseReplanArchetypeV2_(eligible, scores, ['easy', 'polished-casual', 'expressive'])).toBeNull();
  });

  it('is deterministic, does not mutate inputs, and makes zero forbidden calls', () => {
    const pools = onePerArchetype();
    const scores = scoresForPools(pools);
    const inputs = [pools, scores, baseSnapshot, baseWeather, emptyHistory];
    const before = JSON.stringify(inputs);
    forbiddenCalls = 0;
    const first = finalSet(pools, scores);
    const second = finalSet(pools, scores);
    finalists(Object.values(pools).flat(), scores);
    api.chooseReplanArchetypeV2_(pools, scores, []);
    expect(second).toEqual(first);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(forbiddenCalls).toBe(0);
  });
});

describe('bounded targeted replan orchestration', () => {
  type SelectionRun = (
    snapshot: object,
    weather: object,
    history: object,
    planners: Array<{ archetype: string; candidates: Candidate[] }>,
    critic: { scores: object[] }
  ) => {
    candidates: Candidate[];
    critic: { scores: object[] };
    selectedCandidates: Candidate[];
    replanRounds: Array<{
      round: number;
      targetArchetype: string;
      structurallyValid: boolean;
      returnedCandidates: Candidate[];
      acceptedCandidateIds: string[];
      duplicateCandidateIds: string[];
    }>;
    selection: {
      path: string;
      replannedArchetypes: string[];
      feasibleSetCount: number;
      deliveryMode: 'complete' | 'partial';
      selectedCount: 1 | 2 | 3;
      selectedArchetypes: string[];
      omittedArchetypes: string[];
    };
  };

  const initialCandidates = () => ['easy', 'polished-casual', 'expressive'].flatMap((archetype, group) =>
    Array.from({ length: 5 }, (_, index) => makeCandidate(
      `${archetype}-${index}`,
      archetype,
      `t${group * 3 + 1}`,
      `b${group * 3 + 1}`,
      group < 2 ? 's1' : 's2'
    ))
  );

  const plannerResponses = (candidates: Candidate[]) => ['easy', 'polished-casual', 'expressive'].map(archetype => ({
    archetype,
    candidates: candidates.filter(candidate => candidate.archetype === archetype)
  }));

  const replannedCandidates = (
    archetype: string,
    shoeId: string,
    round: number,
    startIndex = 1
  ) => Array.from({ length: 5 }, (_, index) => makeCandidate(
    `${archetype}-r${round}-${index}`,
    archetype,
    `t${startIndex + index}`,
    `b${startIndex + index}`,
    shoeId
  ));

  const duplicateReplanCandidates = (candidates: Candidate[], label: string, round: number) =>
    candidates.filter(candidate => candidate.archetype === 'easy').map((candidate, index) => ({
      ...structuredClone(candidate),
      candidateId: `easy-${label}-duplicate-r${round}-${index}`,
    }));

  const orchestrationApi = (
    replan: (...args: unknown[]) => { archetype: string; candidates: Candidate[] },
    scoreNew: (...args: unknown[]) => { scores: object[] }
  ) => evaluateAppsScript<{
    runSelectionV2_: SelectionRun | null;
  }>(
    ['Config.gs', 'Selection.gs'],
    `({
      runSelectionV2_: typeof runSelectionV2_ === 'function' ? runSelectionV2_ : null
    })`,
    {
      replanArchetypeV2_: replan,
      runCriticCandidatesV2_: scoreNew,
      savedOutfitExactCopyV2_: () => null,
      weatherSafetyErrorsV2_: () => [],
      console
    }
  );

  it('merges five new candidates, scores only them, and records replan-1', () => {
    const initial = initialCandidates();
    const initialScores = initial.map(candidate => makeScore(candidate.candidateId));
    const replanned = replannedCandidates('easy', 's3', 1);
    const scoredBatches: string[][] = [];
    const api = orchestrationApi(
      () => ({ archetype: 'easy', candidates: replanned }),
      (_snapshot, _weather, _history, values) => {
        const additions = values as Candidate[];
        scoredBatches.push(additions.map(candidate => candidate.candidateId));
        return { scores: additions.map(candidate => makeScore(candidate.candidateId, { colorIntent: 9 })) };
      }
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    const result = api.runSelectionV2_(
      baseSnapshot,
      baseWeather,
      emptyHistory,
      plannerResponses(initial),
      { scores: initialScores }
    );

    expect(result.selection.path).toBe('replan-1');
    expect(result.selection.replannedArchetypes).toEqual(['easy']);
    expect(result.selection).toEqual(expect.objectContaining({
      deliveryMode: 'complete',
      selectedCount: 3,
      selectedArchetypes: ['easy', 'polished-casual', 'expressive'],
      omittedArchetypes: []
    }));
    expect(result.critic.scores).toHaveLength(20);
    expect(scoredBatches).toEqual([replanned.map(candidate => candidate.candidateId)]);
  });

  it('does not retain the obsolete pre-ledger merge helper', () => {
    const selectionSource = readFileSync(
      new URL('../../../../apps-script/daily-outfits-v2/Selection.gs', import.meta.url),
      'utf8',
    );

    expect(selectionSource).not.toContain('function mergeReplannedCandidatesV2_');
  });

  it('records a duplicate-only first round and scores only accepted round-two combinations', () => {
    const initial = initialCandidates();
    const duplicates = duplicateReplanCandidates(initial, 'ledger', 1);
    const accepted = replannedCandidates('easy', 's3', 2, 6);
    const scored: string[][] = [];
    const failureNotes: object[][] = [];
    const usedIds: string[][] = [];
    const api = orchestrationApi(
      (_archetype, _snapshot, _weather, _history, failed, _avoidIds, runWideIds, round) => {
        failureNotes.push(structuredClone(failed as object[]));
        usedIds.push((runWideIds as string[]).slice());
        return { archetype: 'easy', candidates: round === 1 ? duplicates : accepted };
      },
      (_snapshot, _weather, _history, values) => {
        const valuesToScore = values as Candidate[];
        scored.push(valuesToScore.map(candidate => candidate.candidateId));
        return { scores: valuesToScore.map(candidate => makeScore(candidate.candidateId, { colorIntent: 9 })) };
      }
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    const result = api.runSelectionV2_(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => makeScore(candidate.candidateId))
    });
    expect(scored).toEqual([accepted.map(candidate => candidate.candidateId)]);
    expect(result.critic.scores).toHaveLength(20);
    expect(result.replanRounds[0]).toMatchObject({
      round: 1,
      targetArchetype: 'easy',
      acceptedCandidateIds: [],
      duplicateCandidateIds: duplicates.map(candidate => candidate.candidateId),
    });
    expect(result.replanRounds[1]).toMatchObject({
      round: 2,
      targetArchetype: 'easy',
      acceptedCandidateIds: accepted.map(candidate => candidate.candidateId),
      duplicateCandidateIds: [],
    });
    expect(usedIds[1]).toEqual(expect.arrayContaining([
      ...initial.map(candidate => candidate.candidateId),
      ...duplicates.map(candidate => candidate.candidateId),
    ]));
    duplicates.forEach(candidate => {
      expect(failureNotes[1]).toContainEqual({
        candidateId: candidate.candidateId,
        criticalDefects: ['duplicate item combination'],
        reservations: [],
      });
    });
  });

  it('uses at most two deterministic same-archetype replans and can succeed on replan-2', () => {
    const initial = initialCandidates();
    const calls: Array<{ archetype: string; round: number }> = [];
    const first = replannedCandidates('easy', 's1', 1, 6);
    const second = replannedCandidates('easy', 's3', 2, 6);
    const scoredCounts: number[] = [];
    const api = orchestrationApi(
      (archetype, _snapshot, _weather, _history, _failureNotes, _avoidIds, _usedIds, round) => {
        calls.push({ archetype: archetype as string, round: round as number });
        return {
          archetype: archetype as string,
          candidates: round === 1 ? first : second
        };
      },
      (_snapshot, _weather, _history, values) => {
        const additions = values as Candidate[];
        scoredCounts.push(additions.length);
        return {
          scores: additions.map(candidate => candidate.candidateId.includes('-r1-')
            ? flatScore(candidate.candidateId, 2)
            : makeScore(candidate.candidateId, { colorIntent: 9 }))
        };
      }
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    const result = api.runSelectionV2_(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => makeScore(candidate.candidateId))
    });
    expect(result.selection.path).toBe('replan-2');
    expect(result.selection.replannedArchetypes).toEqual(['easy', 'easy']);
    expect(result.replanRounds.map(record => record.targetArchetype)).toEqual(['easy', 'easy']);
    expect(calls).toEqual([
      { archetype: 'easy', round: 1 },
      { archetype: 'easy', round: 2 }
    ]);
    expect(scoredCounts).toEqual([5, 5]);
  });

  it('returns the largest safe two-look result after exactly two valid no-solution rounds', () => {
    const initial = initialCandidates();
    const calls: Array<{ archetype: string; round: number }> = [];
    const api = orchestrationApi(
      (archetype, _snapshot, _weather, _history, _failureNotes, _avoidIds, _usedIds, round) => {
        calls.push({ archetype: archetype as string, round: round as number });
        return {
          archetype: archetype as string,
          candidates: duplicateReplanCandidates(initial, 'partial', round as number)
        };
      },
      (_snapshot, _weather, _history, values) => ({
        scores: (values as Candidate[]).map(candidate => makeScore(candidate.candidateId, { colorIntent: 9 }))
      })
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    const result = api.runSelectionV2_!(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => makeScore(candidate.candidateId))
    });
    expect(result.selection).toMatchObject({
      deliveryMode: 'partial',
      selectedCount: 2,
      selectedArchetypes: ['easy', 'expressive'],
      omittedArchetypes: ['polished-casual'],
      path: 'replan-2',
    });
    expect(calls).toEqual([
      { archetype: 'easy', round: 1 },
      { archetype: 'easy', round: 2 }
    ]);
  });

  it('returns a safe singleton after exactly two valid no-solution rounds', () => {
    const initial = initialCandidates();
    const api = orchestrationApi(
      (_archetype, _snapshot, _weather, _history, _failureNotes, _avoidIds, _usedIds, round) => ({
        archetype: 'easy',
        candidates: duplicateReplanCandidates(initial, 'singleton', round as number),
      }),
      () => ({ scores: [] })
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    const result = api.runSelectionV2_(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => candidate.archetype === 'expressive'
        ? makeScore(candidate.candidateId)
        : flatScore(candidate.candidateId, 2))
    });
    expect(result.selection).toMatchObject({
      deliveryMode: 'partial',
      selectedCount: 1,
      selectedArchetypes: ['expressive'],
      omittedArchetypes: ['easy', 'polished-casual'],
      path: 'replan-2',
    });
  });

  it('throws quality-exhausted-zero only when no safe candidate remains after round two', () => {
    const initial = initialCandidates();
    const api = orchestrationApi(
      (_archetype, _snapshot, _weather, _history, _failureNotes, _avoidIds, _usedIds, round) => ({
        archetype: 'easy',
        candidates: duplicateReplanCandidates(initial, 'zero', round as number),
      }),
      () => ({ scores: [] })
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    expect(() => api.runSelectionV2_!(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => flatScore(candidate.candidateId, 2))
    })).toThrow(/^quality-exhausted-zero:/);
  });

  it('returns the feasible easy plus expressive pair when polished is eligible but infeasible', () => {
    const initial = initialCandidates().map(candidate => candidate.archetype === 'polished-casual'
      ? { ...candidate, topId: 't1', bottomId: 'b7', itemIds: ['t1', 'b7', candidate.shoeId] }
      : candidate);
    const api = orchestrationApi(
      (_archetype, _snapshot, _weather, _history, _failureNotes, _avoidIds, _usedIds, round) => ({
        archetype: 'easy',
        candidates: duplicateReplanCandidates(initial, 'infeasible', round as number),
      }),
      () => ({ scores: [] })
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    const result = api.runSelectionV2_(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => makeScore(candidate.candidateId))
    });
    expect(result.selection).toMatchObject({
      deliveryMode: 'partial',
      selectedCount: 2,
      selectedArchetypes: ['easy', 'expressive'],
      omittedArchetypes: ['polished-casual'],
      path: 'replan-2',
    });
  });

  it('fails closed on malformed candidates, duplicate ids, and invalid replan score sets', () => {
    const initial = initialCandidates();
    const replanned = replannedCandidates('easy', 's3', 1);
    const duplicateId = initial.slice();
    duplicateId[1] = { ...duplicateId[1], candidateId: duplicateId[0].candidateId };
    const api = orchestrationApi(
      () => ({ archetype: 'easy', candidates: replanned }),
      () => ({ scores: [makeScore(replanned[0].candidateId), makeScore(replanned[0].candidateId)] })
    );
    expect(api.runSelectionV2_).toBeTypeOf('function');
    if (!api.runSelectionV2_) return;

    expect(() => api.runSelectionV2_!(baseSnapshot, baseWeather, emptyHistory, plannerResponses(duplicateId), {
      scores: duplicateId.map(candidate => makeScore(candidate.candidateId))
    })).toThrow(/duplicate candidateId/);
    const wrongPlannerGroup = plannerResponses(initial);
    wrongPlannerGroup[0].candidates[0] = { ...wrongPlannerGroup[0].candidates[0], archetype: 'expressive' };
    expect(() => api.runSelectionV2_!(baseSnapshot, baseWeather, emptyHistory, wrongPlannerGroup, {
      scores: initial.map(candidate => makeScore(candidate.candidateId))
    })).toThrow(/planner response.*wrong archetype/);
    expect(() => api.runSelectionV2_!(baseSnapshot, baseWeather, emptyHistory, plannerResponses(initial), {
      scores: initial.map(candidate => makeScore(candidate.candidateId))
    })).toThrow(/targeted critic scores|exactly once/);
  });
});

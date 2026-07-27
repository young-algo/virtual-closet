import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const archetypes = ['easy', 'polished-casual', 'expressive'];
const weights = {
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
const allNineComposite = Object.values(weights).reduce((total, weight) => total + 9 * weight, 0);
const daily = {
  QUALITY_POLICY_VERSION: 4,
  ARCHETYPES: archetypes,
  COMPOSITE_WEIGHTS: weights,
  GENERATION_CUTOFF_HOUR: 8,
  MIN_EXECUTION_REMAINING_MS: 45_000,
};
const utilities = {
  newBlob: (bytes: unknown, mimeType: string, name: string) => ({ bytes, mimeType, name }),
  base64Decode: (value: string) => Uint8Array.from(Buffer.from(value, 'base64')),
  formatDate: () => 'Wednesday, July 15',
};

const plannerCandidate = (archetype: string, index: number) => ({
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

const plannersFixture = () => archetypes.map(archetype => ({
  archetype,
  candidates: Array.from({ length: 5 }, (_, index) => plannerCandidate(archetype, index)),
}));

const criticFixture = (planners = plannersFixture()) => ({
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

const selectionFixture = () => {
  const planners = plannersFixture();
  const candidates = planners.flatMap(response => response.candidates).map(value => structuredClone(value));
  return {
    candidates,
    critic: criticFixture(planners),
    selectedCandidates: archetypes.map((_, index) => structuredClone(candidates[index * 5])),
    replanRounds: [] as Array<unknown>,
    selection: {
      path: 'top2',
      deliveryMode: 'complete' as 'complete' | 'partial',
      selectedCount: 3,
      selectedArchetypes: archetypes.slice(),
      omittedArchetypes: [] as string[],
      eligibleCountByArchetype: { easy: 1, 'polished-casual': 5, expressive: 5 },
      compositeById: Object.fromEntries(candidates.map(({ candidateId }) => [candidateId, allNineComposite])),
      feasibleSetCount: 4,
      replannedArchetypes: [] as string[],
    },
  };
};

const weatherFixture = (localDate: string) => ({
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

const historyContextFixture = () => ({
  exactOutfitsPrevious14Days: [] as Array<{ localDate: string; itemIds: string[]; archetype: string }>,
  itemUsagePrevious7Days: {} as Record<string, number>,
  feedback: [] as Array<{ localDate: string; value: string; outfitName: string; archetype: string; items: string[] }>,
  itemFeedbackSignals: {} as Record<string, { wore: number; liked: number; disliked: number }>,
  cooldownItemLabels: [] as string[],
  cooldownItemIds: [] as string[],
  wornItemIds: [] as string[],
});

const fixtureShoeRotationContext = evaluateAppsScript<(
  snapshot: Record<string, unknown>,
  localDate: string,
  history: Record<string, unknown>,
) => { easyAnchorShoeId: string }>(
  ['ShoeRotation.gs'],
  'shoeRotationContextV2_',
);

const fixtureFingerprintForEasyAnchor = (
  localDate: string,
  history: ReturnType<typeof historyContextFixture>,
  shoeIds: string[],
  targetShoeId: string,
) => {
  const snapshot = {
    wardrobeFingerprint: '',
    items: Array.from(new Set(shoeIds)).map(id => ({
      id,
      slot: 'shoes',
      profile: { available: true, excludedFromDaily: false },
    })),
  };
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const wardrobeFingerprint = `send-recovery-fixture-${attempt}`;
    snapshot.wardrobeFingerprint = wardrobeFingerprint;
    if (fixtureShoeRotationContext(snapshot, localDate, history).easyAnchorShoeId === targetShoeId) {
      return wardrobeFingerprint;
    }
  }
  throw new Error(`fixture cannot anchor Easy on ${targetShoeId}`);
};

const pendingFixture = (localDate: string, withEncore: boolean) => {
  const planners = plannersFixture();
  const selected = selectionFixture();
  const weather = weatherFixture(localDate);
  const recommendations = selected.selectedCandidates.map(candidate => ({
    candidateId: candidate.candidateId,
    archetype: candidate.archetype,
    name: `${candidate.archetype} daily look`,
    itemIds: candidate.itemIds.slice(),
    colorHook: 'The exact blue trim on the top repeats in the shoes for a deliberate bridge.',
    whyItWorks: 'The proportions, formality, and palette align across all three selected pieces.',
    weatherNote: 'Breathable and comfortable across the complete forecast window.',
  }));
  const pending = {
    qualityPolicyVersion: 4,
    localDate,
    wardrobeFingerprint: 'wardrobe-v3-15',
    weather,
    history: historyContextFixture(),
    planners,
    ...selected,
    bundle: {
      version: 2,
      qualityPolicyVersion: 4,
      localDate,
      weather: structuredClone(weather),
      coverage: {
        deliveryMode: selected.selection.deliveryMode,
        selectedArchetypes: selected.selection.selectedArchetypes.slice(),
        omittedArchetypes: selected.selection.omittedArchetypes.slice(),
      },
      recommendations,
      generatedAt: 200,
      snapshotGeneratedAt: 50,
      wardrobeFingerprint: 'wardrobe-v3-15',
      modelRunId: 'run-id',
    } as Record<string, unknown>,
  };
  if (withEncore) {
    pending.bundle.encore = {
      outfitId: 'saved-older',
      candidateId: 'encore:saved-older',
      name: 'Saved older look',
      itemIds: ['encore-top', 'encore-bottom', 'encore-shoe'],
    };
  }
  const wardrobeFingerprint = fixtureFingerprintForEasyAnchor(
    localDate,
    pending.history,
    pending.candidates.map(candidate => candidate.shoeId).concat(withEncore ? ['encore-shoe'] : []),
    pending.selectedCandidates[0].shoeId,
  );
  pending.wardrobeFingerprint = wardrobeFingerprint;
  pending.bundle.wardrobeFingerprint = wardrobeFingerprint;
  return pending;
};

const deterministicSelectionSelectors = {
  finalists: evaluateAppsScript<(
    candidates: Array<Record<string, unknown>>,
    scores: Array<Record<string, unknown>>,
    snapshot: Record<string, unknown>,
    weather: Record<string, unknown>,
    history: Record<string, unknown>,
  ) => Record<string, unknown>>(
    ['ItemIndex.gs', 'ShoeRotation.gs', 'Taste.gs', 'FinalValidation.gs', 'Selection.gs'],
    'selectFinalistsV2_',
    { DAILY_V2: daily },
  ),
  exhausted: evaluateAppsScript<(
    eligibleByArchetype: Record<string, Array<Record<string, unknown>>>,
    scores: Array<Record<string, unknown>>,
    snapshot: Record<string, unknown>,
    weather: Record<string, unknown>,
  ) => { selectedCandidates: Array<Record<string, unknown>>; feasibleSetCount: number } | null>(
    ['ItemIndex.gs', 'ShoeRotation.gs', 'Taste.gs', 'FinalValidation.gs', 'Selection.gs'],
    'selectExhaustedFinalSetV2_',
    { DAILY_V2: daily },
  ),
};

const snapshotFixture = (pending: ReturnType<typeof pendingFixture>) => {
  const itemById = new Map<string, Record<string, unknown>>();
  pending.candidates.forEach((candidate, index) => {
    const storyIndex = archetypes.indexOf(candidate.archetype) * 20 + index;
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
  const encore = pending.bundle.encore as { outfitId: string; name: string; itemIds: string[] } | undefined;
  if (encore) {
    itemById.set('encore-top', {
      id: 'encore-top', slot: 'top', category: 'T-Shirts', name: 'Encore top',
      thumbnailDataUrl: 'data:image/png;base64,AA==',
      profile: { warmth: 1, breathability: 4, available: true, excludedFromDaily: false },
    });
    itemById.set('encore-bottom', {
      id: 'encore-bottom', slot: 'bottom', category: 'Pants', name: 'Encore bottom',
      thumbnailDataUrl: 'data:image/png;base64,AA==',
      profile: { available: true, excludedFromDaily: false },
    });
    itemById.set('encore-shoe', {
      id: 'encore-shoe', slot: 'shoes', category: 'Sneakers', name: 'Encore shoe',
      thumbnailDataUrl: 'data:image/png;base64,AA==',
      profile: { rainSafety: 'good', available: true, excludedFromDaily: false },
    });
  }
  return {
    wardrobeFingerprint: pending.wardrobeFingerprint,
    generatedAt: 50,
    settings: {},
    tasteExamples: encore ? [{
      id: encore.outfitId,
      name: encore.name,
      itemIds: encore.itemIds.slice(),
      createdAt: 1,
      source: 'manual',
    }] : [],
    items: Array.from(itemById.values()),
  };
};

const partialPendingFixture = (count: 1 | 2, withEncore: boolean) => {
  const pending = pendingFixture('2026-07-14', withEncore);
  const selectedArchetypes = count === 2 ? ['easy', 'expressive'] : ['expressive'];
  const omittedArchetypes = archetypes.filter(archetype => !selectedArchetypes.includes(archetype));
  const targetArchetype = omittedArchetypes[0];
  const targetPlanner = pending.planners.find(value => value.archetype === targetArchetype);
  if (!targetPlanner) throw new Error('partial recovery fixture target planner is missing');
  pending.critic.scores.forEach(score => {
    const candidate = pending.candidates.find(value => value.candidateId === score.candidateId);
    if (candidate && omittedArchetypes.includes(candidate.archetype)) {
      score.disqualified = true;
      score.criticalDefects = ['fixture forces targeted re-plan'];
    }
  });
  pending.replanRounds = ([1, 2] as const).map(round => {
    const returnedCandidates = targetPlanner.candidates.map((candidate, index) => ({
      ...structuredClone(candidate),
      candidateId: `${targetArchetype}-duplicate-r${round}-${index}`,
    }));
    return {
      round,
      targetArchetype,
      structurallyValid: true,
      returnedCandidates,
      acceptedCandidateIds: [] as string[],
      duplicateCandidateIds: returnedCandidates.map(candidate => candidate.candidateId),
    };
  });
  const snapshot = snapshotFixture(pending);
  const finalists = deterministicSelectionSelectors.finalists(
    pending.candidates,
    pending.critic.scores,
    snapshot,
    pending.weather,
    pending.history,
  ) as {
    eligibleByArchetype: Record<string, Array<Record<string, unknown>>>;
    eligibleCountByArchetype: Record<string, number>;
    compositeById: Record<string, number>;
  };
  const exhausted = deterministicSelectionSelectors.exhausted(
    finalists.eligibleByArchetype,
    pending.critic.scores,
    snapshot,
    pending.weather,
  );
  if (!exhausted || exhausted.selectedCandidates.length !== count) {
    throw new Error('partial recovery fixture winner is missing');
  }
  pending.selectedCandidates = structuredClone(exhausted.selectedCandidates) as typeof pending.selectedCandidates;
  pending.selection = {
    path: 'replan-2',
    deliveryMode: 'partial',
    selectedCount: count,
    selectedArchetypes,
    omittedArchetypes,
    eligibleCountByArchetype: {
      easy: finalists.eligibleCountByArchetype.easy,
      'polished-casual': finalists.eligibleCountByArchetype['polished-casual'],
      expressive: finalists.eligibleCountByArchetype.expressive,
    },
    compositeById: { ...finalists.compositeById },
    feasibleSetCount: exhausted.feasibleSetCount,
    replannedArchetypes: [targetArchetype, targetArchetype],
  };
  const recommendationById = new Map(
    (pending.bundle.recommendations as Array<{ candidateId: string }>).map(value => [value.candidateId, value]),
  );
  pending.bundle.coverage = {
    deliveryMode: 'partial',
    selectedArchetypes: selectedArchetypes.slice(),
    omittedArchetypes: omittedArchetypes.slice(),
  };
  pending.bundle.recommendations = pending.selectedCandidates.map(candidate => {
    const recommendation = recommendationById.get(candidate.candidateId);
    if (!recommendation) throw new Error('partial recovery fixture recommendation is missing');
    return structuredClone(recommendation);
  });
  return { pending, snapshot };
};

const runtimeFiles = ['ItemIndex.gs', 'ShoeRotation.gs', 'Taste.gs', 'Selection.gs', 'FinalValidation.gs', 'Encore.gs', 'JobState.gs'];

const runResolvedRecovery = (
  pending: ReturnType<typeof pendingFixture>,
  snapshot: ReturnType<typeof snapshotFixture>,
) => {
  const values: Record<string, string> = {
    SEND_IN_PROGRESS_DATE_V2: '2026-07-14',
    LAST_SENT_DATE_V2: '2026-07-14',
  };
  const events: string[] = [];
  let history: Array<Record<string, unknown>> = [];
  let state: Record<string, unknown> | null = null;
  const properties = {
    getProperty: (key: string) => values[key] ?? null,
    setProperty: (key: string, value: string) => {
      events.push(`set:${key}:${value}`);
      values[key] = value;
    },
    deleteProperty: (key: string) => {
      events.push(`delete:${key}`);
      delete values[key];
    },
  };
  const scope = {
    DAILY_V2: daily,
    getDailyPropertiesV2_: () => properties,
    loadPendingV2_: () => structuredClone(pending),
    loadJobStateV2_: () => structuredClone(state),
    saveJobStateV2_: (next: Record<string, unknown>) => {
      events.push(`state:${String(next.stage)}`);
      state = structuredClone(next);
    },
    loadHistoryV2_: () => structuredClone(history),
    saveHistoryV2_: (next: Array<Record<string, unknown>>) => {
      events.push('history');
      history = structuredClone(next);
    },
    MailApp: { sendEmail: () => events.push('mail') },
  };
  const reconcile = evaluateAppsScript<(
    sentDate: string,
    snapshotValue: ReturnType<typeof snapshotFixture>,
  ) => Record<string, unknown>>(
    runtimeFiles,
    'reconcilePersistedSentBundleV2_',
    scope,
  );
  const finalizeAgain = evaluateAppsScript<(
    bundle: Record<string, unknown>,
    snapshotValue: ReturnType<typeof snapshotFixture>,
    stateValue: Record<string, unknown> | null,
  ) => Record<string, unknown>>(runtimeFiles, 'finalizeSentBundleV2_', scope);
  let result: Record<string, unknown> | undefined;
  let error: Error | null = null;
  try {
    result = reconcile('2026-07-14', snapshot);
  } catch (caught) {
    error = caught as Error;
  }
  return {
    error,
    events,
    finalizeAgain: () => finalizeAgain(pending.bundle, snapshot, state),
    getHistory: () => structuredClone(history),
    history,
    result,
    state,
    values,
  };
};

describe('resolved send recovery', () => {
  it('fails closed inside direct finalization before invalid coverage can mutate sent state or history', () => {
    const { pending, snapshot } = partialPendingFixture(2, false);
    pending.bundle.coverage = {
      deliveryMode: 'complete',
      selectedArchetypes: archetypes.slice(),
      omittedArchetypes: [],
    };
    snapshot.generatedAt = 75;
    const values: Record<string, string> = { SEND_IN_PROGRESS_DATE_V2: pending.localDate };
    const events: string[] = [];
    const properties = {
      getProperty: (key: string) => values[key] ?? null,
      setProperty: (key: string, value: string) => {
        events.push(`set:${key}:${value}`);
        values[key] = value;
      },
      deleteProperty: (key: string) => {
        events.push(`delete:${key}`);
        delete values[key];
      },
    };
    const finalize = evaluateAppsScript<(
      bundle: Record<string, unknown>,
      snapshotValue: ReturnType<typeof snapshotFixture>,
      stateValue: Record<string, unknown> | null,
    ) => Record<string, unknown>>(
      runtimeFiles,
      'finalizeSentBundleV2_',
      {
        DAILY_V2: daily,
        loadPendingV2_: () => structuredClone(pending),
        getDailyPropertiesV2_: () => properties,
        loadHistoryV2_: () => [],
        saveHistoryV2_: () => events.push('history'),
        saveJobStateV2_: () => events.push('state'),
      },
    );

    expect(() => finalize(pending.bundle, snapshot, null))
      .toThrowError('No current quality-gated bundle is ready to finalize');
    expect(events).toEqual([]);
    expect(values).toEqual({ SEND_IN_PROGRESS_DATE_V2: pending.localDate });
  });

  it.each([
    [2, false],
    [1, true],
  ] as const)('reconciles and idempotently records a valid %i-look partial bundle', (count, withEncore) => {
    const { pending, snapshot } = partialPendingFixture(count, withEncore);
    snapshot.generatedAt = 75;
    const existingFeedback = [{ candidateId: 'older-look', value: 'liked' }];
    const recovered = runResolvedRecovery(pending, snapshot);

    expect(recovered.error).toBeNull();
    expect(recovered.events).not.toContain('mail');
    expect(recovered.history).toEqual([expect.objectContaining({
      localDate: '2026-07-14',
      recommendations: pending.bundle.recommendations,
      encore: withEncore ? pending.bundle.encore : null,
    })]);
    expect(recovered.history[0].recommendations).toHaveLength(count);
    expect(recovered.state).toMatchObject({ stage: 'sent' });
    if (withEncore) {
      recovered.history[0].feedback = existingFeedback;
    }

    expect(recovered.finalizeAgain).not.toThrow();
    const finalizedHistory = recovered.getHistory();
    expect(finalizedHistory).toHaveLength(1);
    expect(finalizedHistory[0]).toMatchObject({
      recommendations: pending.bundle.recommendations,
      ...(withEncore ? { encore: pending.bundle.encore, feedback: existingFeedback } : {}),
    });
  });

  it('rejects a partial recovery when only bundle coverage is tampered', () => {
    const { pending, snapshot } = partialPendingFixture(2, false);
    pending.bundle.coverage = {
      deliveryMode: 'complete',
      selectedArchetypes: archetypes.slice(),
      omittedArchetypes: [],
    };
    snapshot.generatedAt = 75;

    const recovered = runResolvedRecovery(pending, snapshot);

    expect(recovered.error?.message)
      .toBe('Resolved sent date 2026-07-14 has no matching persisted bundle to reconcile');
    expect(recovered.events).not.toContain('history');
    expect(recovered.events).not.toContain('mail');
  });

  it('reconciles a valid marker-date bundle after a harmless snapshot resync', () => {
    const pending = pendingFixture('2026-07-14', true);
    const snapshot = snapshotFixture(pending);
    snapshot.generatedAt = 75;

    const recovered = runResolvedRecovery(pending, snapshot);

    expect(recovered.error).toBeNull();
    expect(recovered.result).toMatchObject({
      reconciled: true,
      localDate: '2026-07-14',
      bundle: pending.bundle,
    });
    expect(recovered.events).not.toContain('mail');
    expect(recovered.history).toEqual([expect.objectContaining({
      localDate: '2026-07-14',
      recommendations: pending.bundle.recommendations,
      encore: pending.bundle.encore,
    })]);
    expect(recovered.values).toMatchObject({
      LAST_SENT_DATE_V2: '2026-07-14',
      LAST_ENCORE_DATE_V2: '2026-07-14',
    });
    expect(recovered.values).not.toHaveProperty('SEND_IN_PROGRESS_DATE_V2');
    expect(recovered.events.indexOf('delete:SEND_IN_PROGRESS_DATE_V2'))
      .toBeGreaterThan(recovered.events.indexOf('history'));
  });

  it.each([
    ['cooling Encore shoe', (pending: ReturnType<typeof pendingFixture>) => {
      pending.history.exactOutfitsPrevious14Days.push({
        localDate: '2026-07-13',
        archetype: 'easy',
        itemIds: ['encore-shoe'],
      });
      const wardrobeFingerprint = fixtureFingerprintForEasyAnchor(
        pending.localDate,
        pending.history,
        pending.candidates.map(candidate => candidate.shoeId).concat(['encore-shoe']),
        pending.selectedCandidates[0].shoeId,
      );
      pending.wardrobeFingerprint = wardrobeFingerprint;
      pending.bundle.wardrobeFingerprint = wardrobeFingerprint;
    }],
    ['same-day generated Encore shoe', (pending: ReturnType<typeof pendingFixture>) => {
      const encore = pending.bundle.encore as { itemIds: string[] };
      encore.itemIds[2] = pending.selectedCandidates[1].shoeId;
    }],
  ] as const)('rejects a persisted %s at bundle-ready and resolved send recovery', (_name, mutate) => {
    const pending = pendingFixture('2026-07-14', true);
    mutate(pending);
    const snapshot = snapshotFixture(pending);
    const validateBundle = evaluateAppsScript<(
      pendingValue: ReturnType<typeof pendingFixture>,
      snapshotValue: ReturnType<typeof snapshotFixture>,
      localDate: string,
    ) => boolean>(runtimeFiles, 'validFullBundleReadyV2_', { DAILY_V2: daily });

    expect(validateBundle(pending, snapshot, pending.localDate)).toBe(false);

    snapshot.generatedAt = 75;
    const recovered = runResolvedRecovery(pending, snapshot);
    expect(recovered.error?.message)
      .toBe('Resolved sent date 2026-07-14 has no matching persisted bundle to reconcile');
    expect(recovered.events).not.toContain('history');
    expect(recovered.events).not.toContain('mail');
  });

  it('keeps the marker when the current wardrobe changed or the persisted bundle was tampered', () => {
    const pending = pendingFixture('2026-07-14', true);
    const changedSnapshot = snapshotFixture(pending);
    changedSnapshot.generatedAt = 75;
    changedSnapshot.wardrobeFingerprint = 'wardrobe-v4';

    const changed = runResolvedRecovery(pending, changedSnapshot);

    expect(changed.error?.message)
      .toBe('Resolved sent date 2026-07-14 has no matching persisted bundle to reconcile');
    expect(changed.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-14');
    expect(changed.events).not.toContain('history');
    expect(changed.events).not.toContain('mail');

    const tamperedPending = structuredClone(pending);
    const tamperedRecommendations = tamperedPending.bundle.recommendations as Array<{ itemIds: string[] }>;
    tamperedRecommendations[0].itemIds[0] = 'tampered-item';
    const currentSnapshot = snapshotFixture(tamperedPending);
    currentSnapshot.generatedAt = 75;

    const tampered = runResolvedRecovery(tamperedPending, currentSnapshot);

    expect(tampered.error?.message)
      .toBe('Resolved sent date 2026-07-14 has no matching persisted bundle to reconcile');
    expect(tampered.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-14');
    expect(tampered.events).not.toContain('history');
    expect(tampered.events).not.toContain('mail');
  });

  it('reconciles a prior-date marker through real Scheduler and public-send helpers without mailing', () => {
    const run = (endpoint: 'scheduler' | 'public', laterEncoreDate = false) => {
      const pending = pendingFixture('2026-07-14', true);
      const snapshot = snapshotFixture(pending);
      const currentState = {
        stage: 'idle',
        qualityPolicyVersion: 4,
        localDate: '2026-07-15',
        wardrobeFingerprint: snapshot.wardrobeFingerprint,
        attemptCounts: {},
      };
      let state = structuredClone(currentState);
      let history: Array<Record<string, unknown>> = [{
        localDate: '2026-07-14',
        weatherKey: 'old',
        generatedAt: 1,
        sentAt: 123,
        recommendations: [],
        encore: null,
        feedback: [{ candidateId: 'easy-candidate-0', value: 'liked' }],
      }];
      const values: Record<string, string> = {
        SEND_IN_PROGRESS_DATE_V2: '2026-07-14',
        LAST_SENT_DATE_V2: '2026-07-14',
        ...(laterEncoreDate ? { LAST_ENCORE_DATE_V2: '2026-07-15' } : {}),
      };
      const events: string[] = [];
      const properties = {
        getProperty: (key: string) => values[key] ?? null,
        setProperty: (key: string, value: string) => {
          events.push(`set:${key}:${value}`);
          values[key] = value;
        },
        deleteProperty: (key: string) => {
          events.push(`delete:${key}`);
          delete values[key];
        },
      };
      const scope = {
        DAILY_V2: daily,
        LockService: { getScriptLock: () => ({
          tryLock: () => { events.push('lock:try'); return true; },
          releaseLock: () => events.push('lock:release'),
        }) },
        assertFreshSnapshotV2_: () => snapshot,
        loadSnapshotV2_: () => snapshot,
        applySnapshotSettingsV2_: () => ({
          recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC',
          deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75,
        }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 300,
        getDailyPropertiesV2_: () => properties,
        getBooleanPropertyV2_: () => false,
        loadPendingV2_: () => { events.push('load-pending'); return structuredClone(pending); },
        loadJobStateV2_: () => { events.push('load-state'); return structuredClone(state); },
        saveJobStateV2_: (next: typeof state) => { events.push(`state:${next.localDate}:${next.stage}`); state = structuredClone(next); },
        loadHistoryV2_: () => structuredClone(history),
        saveHistoryV2_: (next: Array<Record<string, unknown>>) => { events.push('history'); history = structuredClone(next); },
        Utilities: utilities,
        MailApp: { sendEmail: () => events.push('mail') },
        sendDailyBundleNowV2_: () => events.push('mail'),
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      };
      const result = endpoint === 'scheduler'
        ? evaluateAppsScript<() => Record<string, unknown>>(
          [...runtimeFiles, 'Scheduler.gs'],
          'runDailyOutfitScheduler',
          scope,
        )()
        : evaluateAppsScript<() => Record<string, unknown>>(
          [...runtimeFiles, 'Email.gs'],
          'sendDailyBundleNowV2',
          scope,
        )();
      return { currentState, events, history, pending, result, state, values };
    };

    const scheduled = run('scheduler');
    expect(scheduled.result).toEqual({
      ok: true,
      reconciled: true,
      localDate: '2026-07-14',
      stage: 'idle',
    });
    expect(scheduled.events).not.toContain('mail');
    expect(scheduled.events.indexOf('delete:SEND_IN_PROGRESS_DATE_V2'))
      .toBeGreaterThan(scheduled.events.indexOf('history'));
    expect(scheduled.values).toMatchObject({
      LAST_SENT_DATE_V2: '2026-07-14',
      LAST_ENCORE_DATE_V2: '2026-07-14',
    });
    expect(scheduled.values).not.toHaveProperty('SEND_IN_PROGRESS_DATE_V2');
    expect(scheduled.state).toEqual(scheduled.currentState);
    expect(scheduled.events.some(event => event.startsWith('state:'))).toBe(false);
    expect(scheduled.history).toEqual([expect.objectContaining({
      localDate: '2026-07-14',
      sentAt: 123,
      recommendations: scheduled.pending.bundle.recommendations,
      encore: scheduled.pending.bundle.encore,
      feedback: [{ candidateId: 'easy-candidate-0', value: 'liked' }],
    })]);

    const manual = run('public', true);
    expect(manual.result).toMatchObject({
      reconciled: true,
      localDate: '2026-07-14',
      bundle: manual.pending.bundle,
      state: manual.currentState,
    });
    expect(manual.events).not.toContain('mail');
    expect(manual.values.LAST_ENCORE_DATE_V2).toBe('2026-07-15');
    expect(manual.values).not.toHaveProperty('SEND_IN_PROGRESS_DATE_V2');
    expect(manual.state).toEqual(manual.currentState);
    expect(manual.events.at(-1)).toBe('lock:release');
  });

  it('locks the full exported real-send flow and releases after success, failure, or a busy lock', () => {
    const run = (lockAvailable: boolean, mailFails = false) => {
      const pending = pendingFixture('2026-07-15', false);
      const snapshot = snapshotFixture(pending);
      const values: Record<string, string> = {};
      const events: string[] = [];
      const send = evaluateAppsScript<() => unknown>(
        [...runtimeFiles, 'Email.gs'],
        'sendDailyBundleNowV2',
        {
          DAILY_V2: daily,
          LockService: { getScriptLock: () => ({
            tryLock: () => { events.push('lock:try'); return lockAvailable; },
            releaseLock: () => events.push('lock:release'),
          }) },
          loadSnapshotV2_: () => snapshot,
          assertFreshSnapshotV2_: () => snapshot,
          loadPendingV2_: () => pending,
          loadJobStateV2_: () => null,
          saveJobStateV2_: () => events.push('state'),
          getDailyPropertiesV2_: () => ({
            getProperty: (key: string) => values[key] ?? null,
            setProperty: (key: string, value: string) => { events.push(`set:${key}`); values[key] = value; },
            deleteProperty: (key: string) => { events.push(`delete:${key}`); delete values[key]; },
          }),
          getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
          applySnapshotSettingsV2_: (value: unknown) => value,
          localDateV2_: () => '2026-07-15',
          feedbackLinkUrlV2_: () => 'https://example.com/feedback',
          Utilities: utilities,
          MailApp: { sendEmail: () => { events.push('mail'); if (mailFails) throw new Error('mail failed'); } },
          loadHistoryV2_: () => [],
          saveHistoryV2_: () => events.push('history'),
        },
      );
      return { events, send };
    };

    const busy = run(false);
    expect(busy.send).toThrowError('Another daily outfit job is already running');
    expect(busy.events).toEqual(['lock:try']);

    const success = run(true);
    expect(success.send).not.toThrow();
    expect(success.events.at(-1)).toBe('lock:release');
    expect(success.events).toContain('mail');

    const failure = run(true, true);
    expect(failure.send).toThrowError('mail failed');
    expect(failure.events.at(-1)).toBe('lock:release');
    expect(failure.events.filter(event => event === 'mail')).toHaveLength(1);
  });

  it('retains a resolved marker and fails closed when marker-date recovery is missing or invalid', () => {
    const run = (endpoint: 'scheduler' | 'public', pending: ReturnType<typeof pendingFixture> | null) => {
      const currentPending = pendingFixture('2026-07-15', false);
      const snapshot = snapshotFixture(currentPending);
      const values: Record<string, string> = {
        SEND_IN_PROGRESS_DATE_V2: '2026-07-14',
        LAST_SENT_DATE_V2: '2026-07-14',
      };
      const events: string[] = [];
      const properties = {
        getProperty: (key: string) => values[key] ?? null,
        setProperty: (key: string, value: string) => { events.push(`set:${key}`); values[key] = value; },
        deleteProperty: (key: string) => { events.push(`delete:${key}`); delete values[key]; },
      };
      const scope = {
        DAILY_V2: daily,
        LockService: { getScriptLock: () => ({
          tryLock: () => { events.push('lock:try'); return true; },
          releaseLock: () => events.push('lock:release'),
        }) },
        assertFreshSnapshotV2_: () => snapshot,
        loadSnapshotV2_: () => snapshot,
        applySnapshotSettingsV2_: () => ({
          recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC',
          deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75,
        }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        localDateV2_: () => '2026-07-15',
        localMinutesV2_: () => 300,
        getDailyPropertiesV2_: () => properties,
        getBooleanPropertyV2_: () => false,
        loadPendingV2_: () => pending,
        loadJobStateV2_: () => null,
        saveJobStateV2_: () => events.push('state'),
        loadHistoryV2_: () => [],
        saveHistoryV2_: () => events.push('history'),
        Utilities: utilities,
        MailApp: { sendEmail: () => events.push('mail') },
        sendDailyBundleNowV2_: () => events.push('mail'),
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      };
      let result: unknown;
      let error: Error | null = null;
      try {
        result = endpoint === 'scheduler'
          ? evaluateAppsScript<() => unknown>([...runtimeFiles, 'Scheduler.gs'], 'runDailyOutfitScheduler', scope)()
          : evaluateAppsScript<() => unknown>([...runtimeFiles, 'Email.gs'], 'sendDailyBundleNowV2', scope)();
      } catch (caught) {
        error = caught as Error;
      }
      return { error, events, result, values };
    };

    const scheduled = run('scheduler', pendingFixture('2026-07-15', false));
    expect(scheduled.result).toMatchObject({
      ok: false,
      error: 'Resolved sent date 2026-07-14 has no matching persisted bundle to reconcile',
    });
    expect(scheduled.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-14');
    expect(scheduled.events).not.toContain('mail');

    const manual = run('public', null);
    expect(manual.error?.message)
      .toBe('Resolved sent date 2026-07-14 has no matching persisted bundle to reconcile');
    expect(manual.values.SEND_IN_PROGRESS_DATE_V2).toBe('2026-07-14');
    expect(manual.events).not.toContain('mail');
    expect(manual.events.at(-1)).toBe('lock:release');
  });

  it('stays quiet for the rest of the day once the send is finalized and the wardrobe changes', () => {
    const pending = pendingFixture('2026-07-14', false);
    const snapshot = snapshotFixture(pending);
    // The morning send finalized completely: marker deleted, LAST_SENT_DATE_V2 recorded.
    const values: Record<string, string> = { LAST_SENT_DATE_V2: '2026-07-14' };
    // Kevin edits an item after the email arrives, so the wardrobe re-syncs.
    snapshot.wardrobeFingerprint = 'wardrobe-after-a-midday-edit';
    const events: string[] = [];
    const alerts: string[] = [];
    const scope = {
      DAILY_V2: daily,
      LockService: { getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => events.push('lock:release'),
      }) },
      assertFreshSnapshotV2_: () => snapshot,
      loadSnapshotV2_: () => snapshot,
      applySnapshotSettingsV2_: () => ({
        recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC',
        deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75,
      }),
      getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
      localDateV2_: () => '2026-07-14',
      localMinutesV2_: () => 780, // 13:00, well past the 08:00 alert cutoff
      getDailyPropertiesV2_: () => ({
        getProperty: (key: string) => values[key] ?? null,
        setProperty: (key: string, value: string) => { events.push(`set:${key}`); values[key] = value; },
        deleteProperty: (key: string) => { events.push(`delete:${key}`); delete values[key]; },
      }),
      getBooleanPropertyV2_: () => false,
      loadPendingV2_: () => structuredClone(pending),
      loadJobStateV2_: () => ({
        stage: 'sent',
        qualityPolicyVersion: daily.QUALITY_POLICY_VERSION,
        localDate: '2026-07-14',
        wardrobeFingerprint: pending.wardrobeFingerprint,
        attemptCounts: {},
      }),
      saveJobStateV2_: () => events.push('state'),
      loadHistoryV2_: () => [{ localDate: '2026-07-14', recommendations: pending.bundle.recommendations }],
      saveHistoryV2_: () => events.push('history'),
      Utilities: utilities,
      MailApp: { sendEmail: () => events.push('mail') },
      sendDailyBundleNowV2_: () => events.push('mail'),
      sendOperationalAlertV2_: (reason: string) => alerts.push(reason),
      console: { error: () => undefined },
    };

    const result = evaluateAppsScript<() => unknown>(
      [...runtimeFiles, 'Scheduler.gs'],
      'runDailyOutfitScheduler',
      scope,
    )();

    expect(result).toMatchObject({ ok: true, skipped: 'already-sent' });
    expect(alerts).toEqual([]);
    expect(events).not.toContain('mail');
    expect(events).not.toContain('history');
  });

  it('returns the finalized bundle from the public sender after a midday wardrobe change', () => {
    const pending = pendingFixture('2026-07-14', false);
    const snapshot = snapshotFixture(pending);
    const values: Record<string, string> = { LAST_SENT_DATE_V2: '2026-07-14' };
    snapshot.wardrobeFingerprint = 'wardrobe-after-a-midday-edit';
    const events: string[] = [];
    const scope = {
      DAILY_V2: daily,
      LockService: { getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => events.push('lock:release'),
      }) },
      assertFreshSnapshotV2_: () => snapshot,
      loadSnapshotV2_: () => snapshot,
      applySnapshotSettingsV2_: () => ({
        recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC',
      }),
      getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
      localDateV2_: () => '2026-07-14',
      getDailyPropertiesV2_: () => ({
        getProperty: (key: string) => values[key] ?? null,
        setProperty: (key: string, value: string) => { events.push(`set:${key}`); values[key] = value; },
        deleteProperty: (key: string) => { events.push(`delete:${key}`); delete values[key]; },
      }),
      loadPendingV2_: () => structuredClone(pending),
      loadJobStateV2_: () => null,
      saveJobStateV2_: () => events.push('state'),
      loadHistoryV2_: () => [{ localDate: '2026-07-14', recommendations: pending.bundle.recommendations }],
      saveHistoryV2_: () => events.push('history'),
      Utilities: utilities,
      MailApp: { sendEmail: () => events.push('mail') },
    };

    const result = evaluateAppsScript<() => unknown>(
      [...runtimeFiles, 'Email.gs'],
      'sendDailyBundleNowV2',
      scope,
    )();

    expect(result).toEqual(pending.bundle);
    expect(events).not.toContain('mail');
    expect(events).not.toContain('history');
    expect(events.at(-1)).toBe('lock:release');
  });

  it('still fails closed in the public sender when no finalized bundle survives', () => {
    const pending = pendingFixture('2026-07-14', false);
    const snapshot = snapshotFixture(pending);
    const values: Record<string, string> = { LAST_SENT_DATE_V2: '2026-07-14' };
    const events: string[] = [];
    const scope = {
      DAILY_V2: daily,
      LockService: { getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => events.push('lock:release'),
      }) },
      assertFreshSnapshotV2_: () => snapshot,
      loadSnapshotV2_: () => snapshot,
      applySnapshotSettingsV2_: () => ({
        recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC',
      }),
      getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
      localDateV2_: () => '2026-07-14',
      getDailyPropertiesV2_: () => ({
        getProperty: (key: string) => values[key] ?? null,
        setProperty: (key: string, value: string) => { events.push(`set:${key}`); values[key] = value; },
        deleteProperty: (key: string) => { events.push(`delete:${key}`); delete values[key]; },
      }),
      // The send finalized, but the persisted bundle is gone.
      loadPendingV2_: () => null,
      loadJobStateV2_: () => null,
      saveJobStateV2_: () => events.push('state'),
      loadHistoryV2_: () => [{ localDate: '2026-07-14', recommendations: pending.bundle.recommendations }],
      saveHistoryV2_: () => events.push('history'),
      Utilities: utilities,
      MailApp: { sendEmail: () => events.push('mail') },
    };

    expect(() => evaluateAppsScript<() => unknown>(
      [...runtimeFiles, 'Email.gs'],
      'sendDailyBundleNowV2',
      scope,
    )()).toThrowError('Sent bundle for 2026-07-14 is no longer available');
    expect(events).not.toContain('mail');
    expect(events).not.toContain('history');
    expect(events.at(-1)).toBe('lock:release');
  });

  it('does not let the internal sender replace a different resolved marker', () => {
    const pending = pendingFixture('2026-07-15', false);
    const snapshot = snapshotFixture(pending);
    const values: Record<string, string> = {
      SEND_IN_PROGRESS_DATE_V2: '2026-07-14',
      LAST_SENT_DATE_V2: '2026-07-14',
    };
    const events: string[] = [];
    const send = evaluateAppsScript<(
      bundle: unknown,
      snapshotValue: unknown,
      testMode: boolean,
      pendingValue: unknown,
      expectedLocalDate: string,
    ) => void>(
      [...runtimeFiles, 'Email.gs'],
      'sendDailyBundleNowV2_',
      {
        DAILY_V2: daily,
        getDailyPropertiesV2_: () => ({
          getProperty: (key: string) => values[key] ?? null,
          setProperty: (key: string, value: string) => { events.push(`set:${key}:${value}`); values[key] = value; },
          deleteProperty: (key: string) => { events.push(`delete:${key}`); delete values[key]; },
        }),
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        applySnapshotSettingsV2_: (value: unknown) => value,
        Utilities: utilities,
        MailApp: { sendEmail: () => events.push('mail') },
      },
    );

    expect(() => send(pending.bundle, snapshot, false, pending, '2026-07-15'))
      .toThrowError('Resolved daily email send state for 2026-07-14 must be reconciled before sending 2026-07-15');
    expect(values).toEqual({
      SEND_IN_PROGRESS_DATE_V2: '2026-07-14',
      LAST_SENT_DATE_V2: '2026-07-14',
    });
    expect(events).toEqual([]);
  });
});

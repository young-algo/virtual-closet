import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apps = (file: string) => readFileSync(join(process.cwd(), 'apps-script/daily-outfits-v2', file), 'utf8');

const evaluateAppsScript = <T>(
  files: string[],
  exported: string,
  globals: Record<string, unknown> = {},
) => {
  const names = Object.keys(globals);
  const values = names.map(name => globals[name]);
  return new Function(...names, `${files.map(apps).join('\n')}\nreturn ${exported};`)(...values) as T;
};

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

  it('contains policy-v3 selection resume and send-after-success duplicate protections', () => {
    const scheduler = apps('Scheduler.gs');
    const config = apps('Config.gs');
    const diagnostics = apps('Diagnostics.gs');
    expect(config).toMatch(/QUALITY_POLICY_VERSION:\s*3/);
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
    const sentDateIndex = scheduler.indexOf("setProperty('LAST_SENT_DATE_V2'", sendIndex);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(sentDateIndex).toBeGreaterThan(sendIndex);
  });

  it('persists manual selection output and resumes selection-ready without selecting again', () => {
    const snapshot = { wardrobeFingerprint: 'wardrobe-v3' };
    const selectedResult = {
      candidates: [{ candidateId: 'candidate-pool' }],
      critic: { scores: [{ candidateId: 'selected-easy' }] },
      selectedCandidates: [{ candidateId: 'selected-easy', archetype: 'easy', itemIds: ['top', 'bottom', 'shoe'] }],
      selection: {
        path: 'top2',
        eligibleCountByArchetype: { easy: 2, 'polished-casual': 2, expressive: 2 },
        feasibleSetCount: 1,
        replannedArchetypes: [],
      },
    };
    const basePending = {
      workflow: 'manual-v2',
      qualityPolicyVersion: 3,
      manualStage: 'critic-ready',
      localDate: '2026-07-15',
      wardrobeFingerprint: snapshot.wardrobeFingerprint,
      weather: { localDate: '2026-07-15' },
      history: {},
      planners: [{ archetype: 'easy' }],
      critic: { scores: [{ candidateId: 'initial-easy' }] },
    };
    let selectionRuns = 0;
    let persisted: Record<string, unknown> | null = null;
    const runCriticReady = evaluateAppsScript<() => { stage: string; complete: boolean }>(
      ['Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 3 },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => snapshot,
        loadSnapshotV2_: () => snapshot,
        mergeSnapshotFeedbackIntoHistoryV2_: () => undefined,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => structuredClone(basePending),
        runSelectionV2_: () => {
          selectionRuns += 1;
          return structuredClone(selectedResult);
        },
        savePendingV2_: (value: Record<string, unknown>) => {
          persisted = structuredClone(value);
          return 'pending-file';
        },
      },
    );

    expect(runCriticReady()).toEqual({ complete: false, stage: 'selection-ready', bundle: null });
    expect(selectionRuns).toBe(1);
    expect(persisted).toMatchObject({
      manualStage: 'selection-ready',
      candidates: selectedResult.candidates,
      critic: selectedResult.critic,
      selectedCandidates: selectedResult.selectedCandidates,
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
      ['Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: { QUALITY_POLICY_VERSION: 3 },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => snapshot,
        loadSnapshotV2_: () => snapshot,
        mergeSnapshotFeedbackIntoHistoryV2_: () => undefined,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => '2026-07-15',
        loadPendingV2_: () => structuredClone(selectionReadyPending),
        runSelectionV2_: () => { throw new Error('selection reran after resume'); },
        runCuratorV2_: (...args: unknown[]) => {
          curatorInputs.push(args);
          return { recommendations: [] };
        },
        validateFinalBundleV2_: (...args: unknown[]) => {
          validationInputs.push(args);
          return [];
        },
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: () => ({ localDate: '2026-07-15' }),
        savePendingV2_: () => 'pending-file',
      },
    );

    expect(runSelectionReady()).toEqual({
      complete: true,
      stage: 'bundle-ready',
      bundle: { localDate: '2026-07-15' },
    });
    expect(curatorInputs[0]?.slice(-2)).toEqual([selectedResult.selectedCandidates, selectedResult.critic]);
    expect(validationInputs[0]?.slice(-2)).toEqual([selectedResult.selectedCandidates, selectedResult.critic]);
  });

  it('persists the job selection transition and resumes it without rerunning selection', () => {
    const snapshot = { wardrobeFingerprint: 'wardrobe-v3' };
    const selectedResult = {
      candidates: [{ candidateId: 'pool' }],
      critic: { scores: [{ candidateId: 'final' }] },
      selectedCandidates: [{ candidateId: 'final', archetype: 'easy', itemIds: ['top', 'bottom', 'shoe'] }],
      selection: {
        path: 'top2',
        eligibleCountByArchetype: { easy: 2 },
        feasibleSetCount: 1,
        replannedArchetypes: [],
      },
    };
    const pending = {
      weather: {}, history: {}, planners: [], critic: { scores: [] },
    };
    const savedPending: unknown[] = [];
    let selectionRuns = 0;
    let clockIndex = 0;
    const clock = [0, 1, 2, 300_000];
    const advanceCritic = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown>; pending: Record<string, unknown> }>(
      ['Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: { now: () => clock[clockIndex++] ?? 300_000 },
        loadPendingV2_: () => structuredClone(pending),
        incrementAttemptV2_: (state: { attemptCounts: Record<string, number> }, stage: string) => {
          state.attemptCounts[stage] = (state.attemptCounts[stage] || 0) + 1;
        },
        runSelectionV2_: () => {
          selectionRuns += 1;
          return structuredClone(selectedResult);
        },
        savePendingV2_: (value: unknown) => {
          savedPending.push(structuredClone(value));
          return 'pending-file';
        },
        saveJobStateV2_: () => 'job-file',
      },
    );
    const selected = advanceCritic({ stage: 'critic-ready', attemptCounts: {} }, snapshot, 0);
    expect(selectionRuns).toBe(1);
    expect(selected.state.stage).toBe('selection-ready');
    expect(savedPending).toContainEqual(expect.objectContaining({
      candidates: selectedResult.candidates,
      critic: selectedResult.critic,
      selectedCandidates: selectedResult.selectedCandidates,
      selection: selectedResult.selection,
    }));

    const curatorInputs: unknown[][] = [];
    clockIndex = 0;
    const advanceSelection = evaluateAppsScript<(
      state: Record<string, unknown>,
      snapshot: Record<string, unknown>,
      startedAt: number,
    ) => { state: Record<string, unknown> }>(
      ['Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { MIN_EXECUTION_REMAINING_MS: 45_000 },
        Date: { now: () => clock[clockIndex++] ?? 300_000 },
        loadPendingV2_: () => structuredClone({ ...pending, ...selectedResult }),
        incrementAttemptV2_: (state: { attemptCounts: Record<string, number> }, stage: string) => {
          state.attemptCounts[stage] = (state.attemptCounts[stage] || 0) + 1;
        },
        runSelectionV2_: () => { throw new Error('selection reran after job resume'); },
        runCuratorV2_: (...args: unknown[]) => {
          curatorInputs.push(args);
          return { recommendations: [] };
        },
        validateFinalBundleV2_: () => [],
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: () => ({ localDate: '2026-07-15' }),
        savePendingV2_: () => 'pending-file',
        saveJobStateV2_: () => 'job-file',
      },
    );
    const bundled = advanceSelection({ stage: 'selection-ready', attemptCounts: {} }, snapshot, 0);
    expect(bundled.state.stage).toBe('bundle-ready');
    expect(curatorInputs[0]?.slice(-2)).toEqual([selectedResult.selectedCandidates, selectedResult.critic]);
  });

  it('writes the sent date only after the persisted bundle is sent successfully', () => {
    const runScheduler = (sendFails: boolean) => {
      const events: string[] = [];
      const state = {
        stage: 'bundle-ready',
        qualityPolicyVersion: 3,
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
          DAILY_V2: { QUALITY_POLICY_VERSION: 3, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
          LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
          assertFreshSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          loadSnapshotV2_: () => ({ wardrobeFingerprint: 'wardrobe-v3' }),
          applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
          getDailyConfigV2_: () => ({ timezone: 'UTC' }),
          localDateV2_: () => '2026-07-15',
          localMinutesV2_: () => 405,
          getDailyPropertiesV2_: () => properties,
          getBooleanPropertyV2_: () => false,
          mergeSnapshotFeedbackIntoHistoryV2_: () => undefined,
          loadJobStateV2_: () => structuredClone(state),
          loadPendingV2_: () => ({ bundle: { localDate: '2026-07-15' } }),
          incrementAttemptV2_: () => undefined,
          sendDailyBundleNowV2_: () => {
            events.push('send');
            if (sendFails) throw new Error('send failed');
          },
          recordSentBundleV2_: () => { events.push('record'); },
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

  it('returns only safe selection diagnostics and stage attempt counts', () => {
    const privateId = 'private-wardrobe-id';
    const diagnostics = evaluateAppsScript<() => Record<string, unknown>>(
      ['Diagnostics.gs'],
      'getDailyOutfitDiagnosticsV2',
      {
        loadSnapshotV2_: () => ({ generatedAt: Date.now() }),
        validateStoredSnapshotV2: () => ({ ok: true, errors: [] }),
        loadJobStateV2_: () => ({ stage: 'selection-ready', attemptCounts: { 'critic-ready': 2 } }),
        loadPendingV2_: () => ({
          candidates: [{ candidateId: privateId, prompt: 'private prompt' }],
          critic: { scores: [{ candidateId: privateId }] },
          selection: {
            path: 'replan-1',
            eligibleCountByArchetype: { easy: 3 },
            feasibleSetCount: 2,
            replannedArchetypes: ['easy'],
            compositeById: { [privateId]: 8.5 },
          },
        }),
        getDailyPropertiesV2_: () => ({ getProperty: () => null }),
      },
    );
    const result = diagnostics();
    expect(result.selection).toEqual({
      path: 'replan-1',
      eligibleCountByArchetype: { easy: 3 },
      feasibleSetCount: 2,
      replannedArchetypes: ['easy'],
    });
    expect(result.attemptCounts).toEqual({ 'critic-ready': 2 });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(privateId);
    expect(serialized).not.toContain('private prompt');
    expect(serialized).not.toContain('compositeById');
    expect(serialized).not.toContain('candidates');
    expect(serialized).not.toContain('scores');
  });

  it('fails closed when standalone curation, repair, or validation lacks persisted selection', () => {
    const loadPendingV2_ = () => ({ curated: { recommendations: [] }, critic: { scores: [] } });
    const curator = evaluateAppsScript<() => unknown>(
      ['Curator.gs'],
      'runCuratorV2',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, loadPendingV2_ },
    );
    const repair = evaluateAppsScript<() => unknown>(
      ['Repair.gs'],
      'repairFinalBundleV2',
      { loadPendingV2_ },
    );
    const validate = evaluateAppsScript<() => unknown>(
      ['FinalValidation.gs'],
      'validateFinalBundleV2',
      { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, loadPendingV2_ },
    );
    expect(curator).toThrowError('Deterministic selection must be ready');
    expect(repair).toThrowError('Deterministic selection must be ready');
    expect(validate).toThrowError('Deterministic selection must be ready');
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

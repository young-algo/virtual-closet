# Daily Outfits V2 Quality and Reliability Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Daily Outfits V2 reliably produce three deterministic, quality-gated recommendations, learn from resolved feedback and enriched item profiles, and optionally resurface one honestly labeled saved outfit.

**Architecture:** Keep models responsible for candidate generation, visual scoring, and customer-facing copy, while Apps Script code owns label translation, eligibility, finalist ranking, set feasibility, retry policy, cooldowns, and Encore selection. Persist the new selection stage and diagnostics between scheduler ticks; keep real wardrobe ids internal and serialize only compact weather, profile, history, and `shortLabel` views at every model boundary. The React app remains the snapshot/profile source and preview surface, with manifest-to-localStorage profile fill that never overwrites a local profile.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 3, Google Apps Script JavaScript, Gemini structured output, Open-Meteo, Node.js ESM enrichment scripts.

## Global Constraints

- `QUALITY_POLICY_VERSION` must change from `2` to `3`; stale pending bundles and job state must be rejected after deployment.
- Critic floors remain exactly: `weather >= 8`, `palette >= 7.5`, `colorIntent >= 8`, mean of `palette`, `silhouette`, and `formality` `>= 7.5`, and `disqualified === false`.
- Composite weights are exactly: `colorIntent 0.20`, `palette 0.15`, `weather 0.12`, `archetypeFit 0.10`, `visualInterest 0.10`, `wearability 0.10`, `freshness 0.10`, `silhouette 0.08`, `formality 0.05`.
- Selection tries top-two eligible pools first, widens to top three, then targets one archetype for re-planning; allow at most one re-plan per archetype and two re-plan rounds per run, then fail closed.
- Use all feedback values (`liked`, `disliked`, `wore`) across the full retained history window (`maxDailyHistoryDays`, default `30`); silently discard feedback that cannot resolve to a sent recommendation or Encore.
- Models see and emit `shortLabel` tokens only. Pending files, history, bundles, email, and app storage continue using real ids.
- No model prompt may contain `weather.hourly`, `weather.fetchedAt`, `weather.timezone`, full profile provenance, or long item ids.
- Rain safety uses `weather.rainExpected`, whose source-of-truth threshold remains probability `>= 50%` and precipitation `>= 0.01 in`.
- Profile enrichment writes only fields absent from `item.dailyProfile`; `--force` is the only overwrite path. New AI profiles use `source: 'ai-inferred'`, `confidence: 0.75`, and an `updatedAt` timestamp.
- Hydration adopts a manifest `dailyProfile` only when the local item has none; an existing local profile always wins as one object.
- Generated recommendations hard-block only exact top-bottom-shoe copies of manual saves. Two-of-three overlap is critic freshness context, and AI saves never block.
- Encore is optional, deterministic, uses zero model calls, appears at most once per seven calendar days, and never changes the three generated recommendations.
- Keep planner temperature unchanged; make no model-id changes; do not add a stale-weather re-check, split the primary critic call, or add an in-app profile editor.

---

## File Structure

### New production files

- `apps-script/daily-outfits-v2/Selection.gs` — composite scoring, candidate eligibility, set feasibility/ranking, targeted re-plan orchestration, and persisted selection diagnostics.
- `apps-script/daily-outfits-v2/Encore.gs` — pure saved-outfit eligibility, cadence, prior-surface checks, and deterministic Encore choice.
- `scripts/enrich_daily_profiles.mjs` — one-time Gemini photo enrichment for placeholder `dailyProfile` fields in both manifests.

### New test files

- `src/features/daily-outfits/__tests__/appsScriptTestHarness.ts` — evaluates real `.gs` sources with injected Apps Script stubs.
- `src/features/daily-outfits/__tests__/transportContracts.test.ts` — single-call retry and batch salvage.
- `src/features/daily-outfits/__tests__/resilienceContracts.test.ts` — weather exception fallback, scheduler secondary-failure handling, and no-op history merge.
- `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts` — weather/profile trimming, label resolution, prompt id hygiene, and score anchors.
- `src/features/daily-outfits/__tests__/historyContracts.test.ts` — feedback resolution, aggregates, retained window, and cooldown semantics.
- `src/features/daily-outfits/__tests__/selectionContracts.test.ts` — composite math, eligibility, top-two/top-three feasibility, deterministic tie-breaks, and re-plan limits.
- `src/features/daily-outfits/__tests__/itemProfile.test.ts` — accent-color normalization and manifest profile fill.
- `src/features/daily-outfits/__tests__/encoreContracts.test.ts` — every Encore eligibility clause and deterministic choice.
- `src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx` — Encore preview markup and feedback identity.

### Existing files with changed responsibilities

- `apps-script/daily-outfits-v2/Config.gs` — policy version and composite weights.
- `apps-script/daily-outfits-v2/GeminiTransport.gs` — retry decisions and failed-index batch salvage.
- `apps-script/daily-outfits-v2/Weather.gs` — fetch-exception fallback and prompt-only weather view.
- `apps-script/daily-outfits-v2/ItemIndex.gs` — trimmed model index, label maps/translations, model-facing candidate and bundle views.
- `apps-script/daily-outfits-v2/Taste.gs` — manual-vs-AI taste policy, resolved history, feedback aggregates, cooldown data, and shared history guidance.
- `apps-script/daily-outfits-v2/Planner.gs` — label-only prompts/output, score-aware targeted re-plan prompt, and immediate label resolution.
- `apps-script/daily-outfits-v2/Critic.gs` — honest score-only response and anchored rubrics.
- `apps-script/daily-outfits-v2/Curator.gs` — copywriter for an already-selected immutable set.
- `apps-script/daily-outfits-v2/Repair.gs` — copy-only repair with immutable candidate/item echoes.
- `apps-script/daily-outfits-v2/PlannerValidation.gs` — exact-manual-core copy block while retaining intra-response diversity.
- `apps-script/daily-outfits-v2/FinalValidation.gs` — defense-in-depth echo, score, set, cooldown, rain, and comfort checks.
- `apps-script/daily-outfits-v2/JobState.gs` — optional Encore assembly/history and selection-stage state.
- `apps-script/daily-outfits-v2/Scheduler.gs` — `selection-ready` stage in synchronous, manual-step, and scheduled flows; hardened catch path.
- `apps-script/daily-outfits-v2/Diagnostics.gs` — selection path/counts and stage attempt counts.
- `apps-script/daily-outfits-v2/Email.gs` — optional labeled Encore in HTML and plain text.
- `apps-script/daily-outfits-v2/README.md` — deployment, enrichment, diagnostics, and 3–5 morning shadow checklist.
- `src/features/daily-outfits/types.ts` — `accentColors`, removed `criticSummary`, and optional `DailyEncoreV2`.
- `src/features/daily-outfits/itemProfile.ts` — accent normalization and profile-fill hydration helper.
- `src/App.tsx` — apply profile fill in garment and sneaker localStorage hydration.
- `src/features/daily-outfits/DailyFeedbackControls.tsx` — accept the common `{candidateId, name}` feedback target shape.
- `src/features/daily-outfits/DailyBundlePreview.tsx` and `daily-outfits.css` — optional distinct Encore preview.
- `src/data/closet.json` and `src/data/sneakers.json` — reviewed generated `dailyProfile` values.

---

### Task 1: Add Gemini retry and failed-index batch salvage

**Files:**
- Create: `src/features/daily-outfits/__tests__/appsScriptTestHarness.ts`
- Create: `src/features/daily-outfits/__tests__/transportContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/GeminiTransport.gs:22-54`
- Modify: `apps-script/daily-outfits-v2/Planner.gs:66-76`

**Interfaces:**
- Consumes: existing `geminiRequestV2_(model, parts, schema, temperature)` and `parseGeminiResponseV2_(response, stage)`.
- Produces: `geminiRetryDelayV2_(error, attempt): number | null`, `fetchGeminiWithRetryV2_(request, stage): object`, and batch call entries with optional `context: string`.

- [ ] **Step 1: Create a reusable real-source Apps Script test harness**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const apps = (file: string): string =>
  readFileSync(join(process.cwd(), 'apps-script/daily-outfits-v2', file), 'utf8');

export const evaluateAppsScript = <T>(
  files: string[],
  returnExpression: string,
  scope: Record<string, unknown> = {}
): T => {
  const names = Object.keys(scope);
  const values = Object.values(scope);
  const source = files.map(apps).join('\n');
  return new Function(...names, `${source}\nreturn ${returnExpression};`)(...values) as T;
};
```

- [ ] **Step 2: Write transport tests that prove selective retry and contextual failures**

```ts
import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const response = (status: number, payload: object) => ({
  getResponseCode: () => status,
  getContentText: () => JSON.stringify(payload)
});
const ok = (value: object) => response(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
const failure = (status: number, message: string) => response(status, { error: { message } });

const transport = (fetch: ReturnType<typeof vi.fn>, fetchAll: ReturnType<typeof vi.fn>, sleep: ReturnType<typeof vi.fn>) =>
  evaluateAppsScript<{
    callGeminiV2_: (stage: string, parts: object[], schema: object, temperature: number) => object;
    callGeminiBatchV2_: (stage: string, calls: Array<{ context: string; parts: object[]; schema: object; temperature: number }>) => object[];
  }>(['GeminiTransport.gs'], '({ callGeminiV2_: callGeminiV2_, callGeminiBatchV2_: callGeminiBatchV2_ })', {
    UrlFetchApp: { fetch, fetchAll },
    Utilities: { sleep },
    getRequiredPropertyV2_: () => 'test-key',
    getModelNameV2_: () => 'test-model',
    console
  });

describe('Gemini transport retry policy', () => {
  it('retries one 5xx on a single call after four seconds', () => {
    const fetch = vi.fn().mockReturnValueOnce(failure(503, 'busy')).mockReturnValueOnce(ok({ done: true }));
    const sleep = vi.fn();
    const api = transport(fetch, vi.fn(), sleep);
    expect(api.callGeminiV2_('critic', [{ text: 'score' }], {}, 0.3)).toEqual({ done: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it('retries only failed planner indices and preserves successful responses', () => {
    const fetchAll = vi.fn()
      .mockReturnValueOnce([ok({ id: 'easy' }), failure(429, 'rate limited'), ok({ id: 'expressive' })])
      .mockReturnValueOnce([ok({ id: 'polished' })]);
    const sleep = vi.fn();
    const api = transport(vi.fn(), fetchAll, sleep);
    const calls = ['easy', 'polished-casual', 'expressive'].map(context => ({ context, parts: [], schema: {}, temperature: 0.9 }));
    expect(api.callGeminiBatchV2_('planner', calls)).toEqual([{ id: 'easy' }, { id: 'polished' }, { id: 'expressive' }]);
    expect(fetchAll.mock.calls[1][0]).toHaveLength(1);
    expect(sleep).toHaveBeenCalledWith(20000);
  });

  it('does not retry a non-429 4xx and names the archetype', () => {
    const fetchAll = vi.fn().mockReturnValueOnce([ok({ id: 'easy' }), failure(400, 'bad request'), ok({ id: 'expressive' })]);
    const api = transport(vi.fn(), fetchAll, vi.fn());
    const calls = ['easy', 'polished-casual', 'expressive'].map(context => ({ context, parts: [], schema: {}, temperature: 0.9 }));
    expect(() => api.callGeminiBatchV2_('planner', calls)).toThrow(/planner\[polished-casual\].*HTTP 400/);
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the focused tests and verify the missing retry implementation fails**

Run: `npm test -- --run src/features/daily-outfits/__tests__/transportContracts.test.ts`

Expected: FAIL because single calls are attempted once and batch parsing throws before a failed index can be salvaged.

- [ ] **Step 4: Replace transport execution with one-retry helpers and failed-index batch merging**

```js
function geminiRetryDelayV2_(error, attempt) {
  if (!error || !error.retryable || attempt >= 2) return null;
  return error.status === 429 ? 20000 : 4000;
}

function fetchGeminiWithRetryV2_(request, stage) {
  for (var attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return parseGeminiResponseV2_(UrlFetchApp.fetch(request.url, request), stage);
    } catch (error) {
      var delay = geminiRetryDelayV2_(error, attempt);
      if (delay === null) throw error;
      Utilities.sleep(delay);
    }
  }
  throw new Error(stage + ' model retry loop exited unexpectedly');
}

function geminiBatchStageV2_(stage, call, index) {
  return stage + '[' + (call.context || index) + ']';
}

function callGeminiV2_(stage, parts, schema, temperature) {
  var request = geminiRequestV2_(getModelNameV2_(stage), parts, schema, temperature);
  return fetchGeminiWithRetryV2_(request, stage);
}

function callGeminiBatchV2_(stage, calls) {
  var model = getModelNameV2_(stage);
  var requests = calls.map(function(call) { return geminiRequestV2_(model, call.parts, call.schema, call.temperature); });
  var results = new Array(calls.length);
  var failures = [];
  UrlFetchApp.fetchAll(requests).forEach(function(response, index) {
    try {
      results[index] = parseGeminiResponseV2_(response, geminiBatchStageV2_(stage, calls[index], index));
    } catch (error) {
      failures.push({ index: index, error: error });
    }
  });

  var retryable = failures.filter(function(failure) { return failure.error.retryable; });
  var remaining = failures.filter(function(failure) { return !failure.error.retryable; });
  if (retryable.length) {
    var delay = retryable.some(function(failure) { return failure.error.status === 429; }) ? 20000 : 4000;
    Utilities.sleep(delay);
    var retryResponses = UrlFetchApp.fetchAll(retryable.map(function(failure) { return requests[failure.index]; }));
    retryResponses.forEach(function(response, retryIndex) {
      var originalIndex = retryable[retryIndex].index;
      try {
        results[originalIndex] = parseGeminiResponseV2_(response, geminiBatchStageV2_(stage, calls[originalIndex], originalIndex));
      } catch (error) {
        remaining.push({ index: originalIndex, error: error });
      }
    });
  }
  if (remaining.length) {
    remaining.sort(function(a, b) { return a.index - b.index; });
    throw remaining[0].error;
  }
  return results;
}
```

Also set `error.status = status` beside `error.retryable = retryable` in `parseGeminiResponseV2_`, and add `context: archetype` to each planner batch call:

```js
return {
  context: archetype,
  parts: plannerPartsV2_(archetype, snapshot, weather, history),
  schema: PLANNER_SCHEMA_V2,
  temperature: temperature
};
```

- [ ] **Step 5: Run the focused tests and the existing Apps Script contracts**

Run: `npm test -- --run src/features/daily-outfits/__tests__/transportContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

Expected: PASS; the batch test shows a one-request second `fetchAll` and the error test includes `planner[polished-casual]`.

- [ ] **Step 6: Commit the transport gate**

```bash
git add apps-script/daily-outfits-v2/GeminiTransport.gs apps-script/daily-outfits-v2/Planner.gs src/features/daily-outfits/__tests__/appsScriptTestHarness.ts src/features/daily-outfits/__tests__/transportContracts.test.ts
git commit -m "fix: retry daily outfit model transport"
```

### Task 2: Harden weather fallback, scheduler failure handling, and feedback file writes

**Files:**
- Create: `src/features/daily-outfits/__tests__/resilienceContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Weather.gs:11-36`
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs:126-178`
- Modify: `apps-script/daily-outfits-v2/Taste.gs:67-76`

**Interfaces:**
- Consumes: `loadWeatherCacheV2_()`, `DAILY_V2.MAX_WEATHER_AGE_MS`, current scheduler result shape, and snapshot feedback entries.
- Produces: `mergeSnapshotFeedbackIntoHistoryV2_(snapshot): boolean`; scheduler catch always returns the original error even if timezone/config/state persistence fails.

- [ ] **Step 1: Write resilience tests for a thrown fetch, a broken catch dependency, and an unchanged feedback merge**

```ts
import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

describe('Daily V2 resilience contracts', () => {
  it('uses a same-day fresh cache when UrlFetchApp.fetch throws', () => {
    const cached = { localDate: '2026-07-14', fetchedAt: 9_000, highTemperatureF: 80 };
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', {
      DAILY_V2: { MAX_WEATHER_AGE_MS: 6 * 60 * 60 * 1000 },
      UrlFetchApp: { fetch: () => { throw new Error('DNS timeout'); } },
      applySnapshotSettingsV2_: (config: object) => config,
      getDailyConfigV2_: () => ({ latitude: 1, longitude: 2, timezone: 'America/New_York', locationLabel: 'Brooklyn, NY' }),
      loadSnapshotV2_: () => ({}),
      loadWeatherCacheV2_: () => cached,
      localDateV2_: () => '2026-07-14',
      Date: class extends Date { static now() { return 10_000; } },
      encodeURIComponent,
      console
    });
    expect(fetchDailyWeatherV2_()).toBe(cached);
  });

  it('returns the original scheduler error when config fallback also fails', () => {
    const lock = { tryLock: () => true, releaseLock: vi.fn() };
    const run = evaluateAppsScript<() => { ok: boolean; error: string }>(['Scheduler.gs'], 'runDailyOutfitScheduler', {
      LockService: { getScriptLock: () => lock },
      assertFreshSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      loadSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      getDailyConfigV2_: () => { throw new Error('properties unavailable'); },
      console
    });
    expect(run()).toEqual(expect.objectContaining({ ok: false, error: 'Drive unavailable' }));
    expect(lock.releaseLock).toHaveBeenCalledOnce();
  });

  it('does not rewrite history when synchronized feedback is byte-equal', () => {
    const feedback = { localDate: '2026-07-13', candidateId: 'easy-1', value: 'liked', createdAt: 1 };
    const saveHistoryV2_ = vi.fn();
    const merge = evaluateAppsScript<(snapshot: object) => boolean>(['Taste.gs'], 'mergeSnapshotFeedbackIntoHistoryV2_', {
      loadHistoryV2_: () => [{ localDate: '2026-07-13', feedback: [feedback] }],
      saveHistoryV2_,
      itemMapV2_: () => ({}),
      console
    });
    expect(merge({ dailyFeedback: [feedback] })).toBe(false);
    expect(saveHistoryV2_).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and verify all three defects are observable**

Run: `npm test -- --run src/features/daily-outfits/__tests__/resilienceContracts.test.ts`

Expected: FAIL because thrown weather exceptions bypass cache, the scheduler catch calls Drive-backed config assembly, and history always saves.

- [ ] **Step 3: Route thrown weather exceptions through the existing cache gate**

```js
var response;
try {
  response = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?' + query, { muteHttpExceptions: true });
} catch (error) {
  var exceptionCached = loadWeatherCacheV2_();
  if (exceptionCached && exceptionCached.localDate === localDateV2_(new Date(), config.timezone) && Date.now() - exceptionCached.fetchedAt <= DAILY_V2.MAX_WEATHER_AGE_MS) return exceptionCached;
  throw error;
}
```

Keep the existing HTTP-status cache path immediately after this block.

- [ ] **Step 4: Hoist scheduler config and isolate every secondary failure in the catch body**

At the start of `runDailyOutfitScheduler`, declare `var config = null;` next to `var state;`, then assign the existing happy-path value to that variable. Replace the catch body with:

```js
} catch (error) {
  console.error('Daily scheduler failed: ' + error.message);
  try {
    var timezone = config && config.timezone;
    if (!timezone) {
      try {
        timezone = getDailyConfigV2_().timezone;
      } catch (configError) {
        console.error('Daily scheduler could not read fallback timezone: ' + configError.message);
      }
    }
    var current = timezone ? localMinutesV2_(new Date(), timezone) : null;
    if (state) {
      state.lastError = error.message;
      state.updatedAt = Date.now();
      incrementAttemptV2_(state, state.stage + '-error');
      if (current !== null && current >= DAILY_V2.GENERATION_CUTOFF_HOUR * 60) state.stage = 'failed';
      saveJobStateV2_(state);
    }
    if (current !== null && current >= DAILY_V2.GENERATION_CUTOFF_HOUR * 60) sendOperationalAlertV2_('recommendation quality gate failed', error.message);
  } catch (handlerError) {
    console.error('Daily scheduler error handler failed: ' + handlerError.message);
  }
  return { ok: false, error: error.message, stage: state && state.stage };
```

- [ ] **Step 5: Save history only when an entry actually changes**

```js
function mergeSnapshotFeedbackIntoHistoryV2_(snapshot) {
  var history = loadHistoryV2_();
  var changed = false;
  (snapshot.dailyFeedback || []).forEach(function(feedback) {
    var entry = history.find(function(value) { return value.localDate === feedback.localDate; });
    if (!entry) return;
    var before = entry.feedback || [];
    var after = before.filter(function(value) { return value.candidateId !== feedback.candidateId; });
    after.push(feedback);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      entry.feedback = after;
      changed = true;
    }
  });
  if (changed) saveHistoryV2_(history);
  return changed;
}
```

- [ ] **Step 6: Run the resilience and existing contract suites**

Run: `npm test -- --run src/features/daily-outfits/__tests__/resilienceContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

Expected: PASS; the weather test returns the cached object, scheduler returns the original Drive error, and `saveHistoryV2_` remains untouched for identical feedback.

- [ ] **Step 7: Commit the resilience gate**

```bash
git add apps-script/daily-outfits-v2/Weather.gs apps-script/daily-outfits-v2/Scheduler.gs apps-script/daily-outfits-v2/Taste.gs src/features/daily-outfits/__tests__/resilienceContracts.test.ts
git commit -m "fix: harden daily outfit fallbacks"
```

### Task 3: Tighten deterministic weather guards and remove dead `criticSummary`

**Files:**
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts:68-75`
- Modify: `apps-script/daily-outfits-v2/FinalValidation.gs:13-29`
- Modify: `apps-script/daily-outfits-v2/Curator.gs:1-14`
- Modify: `src/features/daily-outfits/types.ts:129-138`

**Interfaces:**
- Consumes: full internal `DailyWeatherProfileV2.rainExpected` and item profile `warmth` values.
- Produces: unchanged `weatherSafetyErrorsV2_(recommendation, itemMap, weather, snapshot): string[]`; `DailyFinalRecommendationV2` without `criticSummary`.

- [ ] **Step 1: Replace the weather-guard test with explicit threshold boundary cases**

```ts
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
```

- [ ] **Step 2: Run the contract test and verify the new bands fail**

Run: `npm test -- --run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

Expected: FAIL because rain still uses the inline 60% condition and no warmth-4/top checks exist.

- [ ] **Step 3: Add the exact comfort gates and use `rainExpected`**

Insert after the existing warmth-5 gate:

```js
if (layer && layer.profile.warmth === 4 && weather.middayFeelsLikeF > 85) errors.push('a warmth-4 layer is unsafe above 85°F');
if (top && top.profile.warmth >= 4 && weather.middayFeelsLikeF > 85) errors.push('a warmth-4 top is unsafe above 85°F');
if (top && top.profile.warmth === 3 && weather.middayFeelsLikeF > 92) errors.push('a warmth-3 top is unsafe above 92°F');
```

Replace the rain condition with:

```js
if (shoes && shoes.profile.rainSafety === 'poor' && weather.rainExpected) {
  var safer = snapshot.items.filter(function(item) { return item.slot === 'shoes' && item.profile.rainSafety !== 'poor'; });
  if (safer.length) errors.push('rain-unsafe shoes selected while safer shoes are available');
}
```

- [ ] **Step 4: Remove `criticSummary` from both schemas and the TypeScript contract**

Use this final recommendation schema tail:

```js
weatherNote: { type: 'STRING' }
```

and this required list:

```js
required: ['candidateId', 'archetype', 'name', 'itemIds', 'colorHook', 'whyItWorks', 'weatherNote']
```

Use this TypeScript interface:

```ts
export interface DailyFinalRecommendationV2 {
  candidateId: string;
  archetype: DailyArchetype;
  name: string;
  itemIds: string[];
  colorHook: string;
  whyItWorks: string;
  weatherNote: string;
}
```

- [ ] **Step 5: Run tests, type-check through the build, and lint**

Run: `npm test -- --run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts && npm run build && npm run lint`

Expected: all commands exit `0`; no source reference to `criticSummary` remains when running `rg -n "criticSummary" apps-script src`.

- [ ] **Step 6: Commit the deterministic guard cleanup**

```bash
git add apps-script/daily-outfits-v2/FinalValidation.gs apps-script/daily-outfits-v2/Curator.gs src/features/daily-outfits/types.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "fix: tighten daily outfit weather guards"
```

### Task 4: Build the compact weather, profile, and label boundary helpers

**Files:**
- Create: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Weather.gs:111`
- Modify: `apps-script/daily-outfits-v2/ItemIndex.gs:1-56`
- Modify: `apps-script/daily-outfits-v2/Taste.gs:37-46`
- Modify: `src/features/daily-outfits/types.ts:94-127`

**Interfaces:**
- Consumes: full internal snapshot items, full weather profile, real-id candidates, and real-id history.
- Produces: `modelWeatherViewV2_(weather): object`, `modelProfileViewV2_(profile): object`, `labelForItemIdV2_(id, snapshot): string`, `modelFacingCandidateV2_(candidate, snapshot): object`, `modelFacingHistoryV2_(history, snapshot): object`, and `resolveLabelsV2_(response, snapshot): object`.

- [ ] **Step 1: Write boundary tests for compact views, known-label resolution, and unknown-token preservation**

```ts
import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const snapshot = {
  items: [{
    id: 'user_sneaker_1783863184667', shortLabel: 'S009', slot: 'shoes', name: 'Mocha', brand: 'Jordan',
    category: 'Sneakers', color: 'brown', description: 'Leather high top', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==',
    profile: { warmth: 2, breathability: 3, rainSafety: 'good', windProtection: 0, formality: 2, silhouette: 'regular', patternIntensity: 0, primaryColorFamily: 'brown', secondaryColorFamily: 'cream', accentColors: ['black'], available: true, excludedFromDaily: false, source: 'ai-inferred', confidence: 0.75, updatedAt: 1 }
  }],
  atlasPages: []
};

const api = evaluateAppsScript<{
  modelWeatherViewV2_: (weather: object) => object;
  compactItemIndexV2_: (snapshot: object) => object[];
  resolveLabelsV2_: (response: object, snapshot: object) => { candidates: Array<{ shoeId: string; itemIds: string[] }> };
}>(['Weather.gs', 'ItemIndex.gs'], '({ modelWeatherViewV2_, compactItemIndexV2_, resolveLabelsV2_ })', {
  console
});

describe('model boundary views', () => {
  it('removes hourly weather and profile provenance', () => {
    const weather = api.modelWeatherViewV2_({ localDate: '2026-07-14', timezone: 'America/New_York', hourly: [{ localHour: 6 }], fetchedAt: 1, morningFeelsLikeF: 70, middayFeelsLikeF: 80, eveningFeelsLikeF: 72, rainExpected: false });
    expect(weather).not.toHaveProperty('hourly');
    expect(weather).not.toHaveProperty('timezone');
    expect(weather).not.toHaveProperty('fetchedAt');
    const item = api.compactItemIndexV2_(snapshot)[0] as Record<string, unknown>;
    expect(item).toHaveProperty('label', 'S009');
    expect(item).not.toHaveProperty('id');
    expect(item.profile).toEqual(expect.objectContaining({ rainSafety: 'good', accentColors: ['black'] }));
    expect(item.profile).not.toHaveProperty('source');
    expect(item.profile).not.toHaveProperty('available');
  });

  it('resolves known labels immediately and leaves unknown labels for normal validation', () => {
    const resolved = api.resolveLabelsV2_({ candidates: [{ shoeId: 'S009', itemIds: ['T999', 'S009'] }] }, snapshot);
    expect(resolved.candidates[0]).toEqual({ shoeId: 'user_sneaker_1783863184667', itemIds: ['T999', 'user_sneaker_1783863184667'] });
  });
});
```

- [ ] **Step 2: Run the test and verify all compact-view helpers are absent**

Run: `npm test -- --run src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`

Expected: FAIL with missing `modelWeatherViewV2_` or `resolveLabelsV2_`.

- [ ] **Step 3: Add the prompt-only weather view with an explicit allowlist**

```js
function modelWeatherViewV2_(weather) {
  var keys = [
    'morningFeelsLikeF', 'middayFeelsLikeF', 'eveningFeelsLikeF', 'minFeelsLikeF', 'maxFeelsLikeF',
    'highTemperatureF', 'lowTemperatureF', 'maxRainProbability', 'totalPrecipitationInches',
    'maxWindMph', 'maxGustMph', 'averageHumidity', 'rainExpected', 'windy', 'largeTemperatureSwing',
    'layerGuidance', 'plainEnglishSummary', 'weatherPhrase', 'localDate', 'locationLabel'
  ];
  return keys.reduce(function(view, key) {
    if (Object.prototype.hasOwnProperty.call(weather, key)) view[key] = weather[key];
    return view;
  }, {});
}
```

Add `weatherPhrase: string;` immediately before `fetchedAt` in `DailyWeatherProfileV2` so the internal bundle type matches the existing weather producer.

- [ ] **Step 4: Replace `ItemIndex.gs` model serialization with explicit profile and label helpers**

```js
function itemMapV2_(snapshot) {
  var map = {};
  snapshot.items.forEach(function(item) { map[item.id] = item; });
  return map;
}

function itemLabelMapV2_(snapshot) {
  var map = {};
  snapshot.items.forEach(function(item) { map[item.shortLabel] = item.id; });
  return map;
}

function labelForItemIdV2_(id, snapshot) {
  var item = itemMapV2_(snapshot)[id];
  return item ? item.shortLabel : id;
}

function modelProfileViewV2_(profile) {
  var keys = ['warmth', 'breathability', 'rainSafety', 'windProtection', 'formality', 'silhouette', 'patternIntensity', 'primaryColorFamily', 'secondaryColorFamily', 'accentColors'];
  return keys.reduce(function(view, key) {
    if (profile && Object.prototype.hasOwnProperty.call(profile, key)) view[key] = profile[key];
    return view;
  }, {});
}

function compactItemIndexV2_(snapshot) {
  return snapshot.items.map(function(item) {
    return {
      label: item.shortLabel,
      slot: item.slot,
      name: item.name,
      brand: item.brand,
      category: item.category,
      color: item.color,
      description: item.description,
      styleCode: item.styleCode || null,
      profile: modelProfileViewV2_(item.profile)
    };
  });
}

function modelFacingCandidateV2_(candidate, snapshot) {
  var view = Object.assign({}, candidate);
  ['topId', 'bottomId', 'shoeId', 'layerId'].forEach(function(key) {
    if (view[key]) view[key] = labelForItemIdV2_(view[key], snapshot);
  });
  view.itemIds = (candidate.itemIds || []).map(function(id) { return labelForItemIdV2_(id, snapshot); });
  return view;
}

function modelFacingCandidatesV2_(candidates, snapshot) {
  return (candidates || []).map(function(candidate) { return modelFacingCandidateV2_(candidate, snapshot); });
}

function modelFacingHistoryV2_(history, snapshot) {
  var view = JSON.parse(JSON.stringify(history || {}));
  view.exactOutfitsPrevious14Days = (history.exactOutfitsPrevious14Days || []).map(function(entry) {
    return Object.assign({}, entry, { itemIds: entry.itemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }) });
  });
  view.itemUsagePrevious7Days = Object.keys(history.itemUsagePrevious7Days || {}).reduce(function(counts, id) {
    counts[labelForItemIdV2_(id, snapshot)] = history.itemUsagePrevious7Days[id];
    return counts;
  }, {});
  delete view.cooldownItemIds;
  delete view.wornItemIds;
  return view;
}

function modelFacingCuratedV2_(curated, snapshot) {
  return {
    recommendations: (curated.recommendations || []).map(function(rec) {
      return Object.assign({}, rec, { itemIds: rec.itemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }) });
    })
  };
}

function resolveLabelsV2_(response, snapshot) {
  var resolved = JSON.parse(JSON.stringify(response));
  var byLabel = itemLabelMapV2_(snapshot);
  var resolve = function(token) { return byLabel[token] || token; };
  (resolved.candidates || []).forEach(function(candidate) {
    ['topId', 'bottomId', 'shoeId', 'layerId'].forEach(function(key) { if (candidate[key]) candidate[key] = resolve(candidate[key]); });
    candidate.itemIds = (candidate.itemIds || []).map(resolve);
  });
  (resolved.recommendations || []).forEach(function(rec) { rec.itemIds = (rec.itemIds || []).map(resolve); });
  return resolved;
}
```

- [ ] **Step 5: Make atlas, candidate-image, and saved-taste text label-only**

Use label text in `atlasPartsV2_`:

```js
var itemMap = itemMapV2_(snapshot);
snapshot.atlasPages.forEach(function(page) {
  var labels = page.itemIds.map(function(id) { return itemMap[id] ? itemMap[id].shortLabel : id; });
  parts.push({ text: 'ATLAS ' + page.pageId + ' | slot=' + page.slot + ' | item labels=' + labels.join(',') });
  parts.push(inlineImagePartV2_(page.imageDataUrl));
});
```

Use this candidate image caption:

```js
parts.push({ text: 'ITEM ' + item.shortLabel + ' | slot=' + item.slot + ' | ' + item.brand + ' ' + item.name + ' | listed colors=' + item.color + ' | description=' + item.description + ' | candidates=' + memberships[id].join(',') });
```

Replace each taste summary object with a label-only object:

```js
return savedTasteSignaturesV2_(snapshot).map(function(outfit) {
  return {
    id: outfit.id,
    name: outfit.name,
    source: outfit.source,
    weight: outfit.weight,
    itemLabels: outfit.itemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }),
    coreItemLabels: outfit.coreItemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }),
    note: outfit.note,
    pieces: outfit.itemIds.map(function(id) { return items[id]; }).filter(Boolean).map(function(item) {
      return item.shortLabel + ' ' + item.brand + ' ' + item.name + ' (' + item.slot + ', ' + item.color + ')';
    })
  };
}).filter(function(example) { return example.pieces.length >= 2; }).slice(-12);
```

- [ ] **Step 6: Run the boundary tests and existing contracts**

Run: `npm test -- --run src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

Expected: PASS; compact entries contain `label` but not `id`, and the known `S009` token resolves to the internal sneaker id.

- [ ] **Step 7: Commit the model-view primitives**

```bash
git add apps-script/daily-outfits-v2/Weather.gs apps-script/daily-outfits-v2/ItemIndex.gs apps-script/daily-outfits-v2/Taste.gs src/features/daily-outfits/types.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
git commit -m "feat: add compact daily model views"
```

### Task 5: Move every prompt and model response onto the label boundary and add score anchors

**Files:**
- Modify: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Planner.gs:37-96`
- Modify: `apps-script/daily-outfits-v2/Critic.gs:80-114`
- Modify: `apps-script/daily-outfits-v2/Curator.gs:30-43`
- Modify: `apps-script/daily-outfits-v2/Repair.gs:1-21`

**Interfaces:**
- Consumes: Task 4 model views and label resolution helpers.
- Produces: `criticScoreAnchorsV2_(): string`; every model call accepts label-form payloads and resolves output before deterministic validation or persistence.

- [ ] **Step 1: Extend the boundary test to assemble a real planner prompt**

```ts
it('assembles a planner prompt with labels and no long ids or hourly weather', () => {
  const plannerParts = evaluateAppsScript<(archetype: string, snapshot: object, weather: object, history: object) => Array<{ text?: string }>>(
    ['Weather.gs', 'ItemIndex.gs', 'Taste.gs', 'Planner.gs'],
    'plannerPartsV2_',
    { DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'] }, console }
  );
  const richSnapshot = { ...snapshot, tasteExamples: [], settings: {}, atlasPages: [] };
  const parts = plannerParts('easy', richSnapshot, {
    localDate: '2026-07-14', locationLabel: 'Brooklyn, NY', timezone: 'America/New_York', fetchedAt: 1,
    hourly: [{ localHour: 6, feelsLikeF: 70 }], morningFeelsLikeF: 70, middayFeelsLikeF: 80,
    eveningFeelsLikeF: 72, minFeelsLikeF: 68, maxFeelsLikeF: 82, highTemperatureF: 82,
    lowTemperatureF: 65, maxRainProbability: 0, totalPrecipitationInches: 0, maxWindMph: 5,
    maxGustMph: 8, averageHumidity: 50, rainExpected: false, windy: false,
    largeTemperatureSwing: false, layerGuidance: 'none', plainEnglishSummary: 'Light pieces.', weatherPhrase: 'clear'
  }, { exactOutfitsPrevious14Days: [], itemUsagePrevious7Days: {}, feedback: [], cooldownItemIds: [], wornItemIds: [] });
  const serialized = JSON.stringify(parts);
  expect(serialized).toContain('S009');
  expect(serialized).not.toContain('user_sneaker_1783863184667');
  expect(serialized).not.toContain('hourly');
  expect(serialized).not.toContain('fetchedAt');
});

it('keeps the same score anchor block in critic and critic repair prompts', () => {
  const source = apps('Critic.gs');
  expect(source.match(/criticScoreAnchorsV2_\(\)/g)).toHaveLength(3);
  expect(source).toContain('weather: 10 = ideal across the whole 6:00–23:00 window');
  expect(source).toContain('wearability: 9–10 = zero-friction for an ordinary day');
});
```

Add `apps` to the test import from `appsScriptTestHarness.ts`.

- [ ] **Step 2: Run the test and verify the current prompt leaks the long id and hourly weather**

Run: `npm test -- --run src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`

Expected: FAIL because planner prompt serialization still uses the full weather/history objects and asks for exact listed ids.

- [ ] **Step 3: Add one shared exact score-anchor function to `Critic.gs`**

```js
function criticScoreAnchorsV2_() {
  return [
    'SCORE ANCHORS:',
    '- weather: 10 = ideal across the whole 6:00–23:00 window; 8 = comfortable morning, midday, and evening with at most one minor compromise — the minimum for a finalist; 6 = fine midday but wrong at the edges of the day; 4 = uncomfortable for a meaningful part of the day; ≤2 = unsafe or clearly wrong.',
    '- palette: 9–10 = every visible color sits in one deliberate scheme; 7–8 = coherent with one minor stray; 5–6 = colors merely coexist; ≤4 = at least one visible conflict.',
    '- silhouette: 9–10 = proportions read as deliberate, volumes balance; 7–8 = standard and unremarkable; 5–6 = slightly mismatched volumes; ≤4 = clearly fighting proportions.',
    '- formality: 9–10 = all pieces on one register; 7–8 = one register with a soft outlier; 5–6 = mixed registers; ≤4 = jarring mix.',
    '- freshness: 9–10 = a genuinely new combination of non-over-exposed items; 7–8 = familiar items in new relationships; 5–6 = leans on over-exposed items or echoes a recent look; ≤4 = barely differs from a recent email, or shares two core pieces with a saved outfit without transforming it. Verified wore/liked feedback on similar looks lifts this score.',
    '- archetypeFit: 9–10 = unmistakably this archetype next to the other two briefs; 5–6 = could belong to a neighboring archetype; ≤4 = wrong brief.',
    '- visualInterest: 9–10 = a specific reason to look twice (color idea, texture, proportion); 5–6 = pleasant but forgettable; ≤4 = inert.',
    '- wearability: 9–10 = zero-friction for an ordinary day; 5–6 = needs babying (delicate, fussy, impractical); ≤4 = impractical for the day described.'
  ].join('\n');
}
```

Append `criticScoreAnchorsV2_()` directly after the existing color-intent band language in both `runCriticV2_` and `repairCriticResponseV2_`.

- [ ] **Step 4: Change planner prompts to label-only views and resolve every response before validation**

Use these exact serialization lines in `plannerPartsV2_`:

```js
'Every available item is visible in the complete slot-specific atlases and JSON item index. Reference items only by their short label (T…, B…, L…, S…) exactly as printed in the index and atlases. Do not invent, shop, or omit an item because it is unfamiliar.',
'Each item profile lists primaryColorFamily, secondaryColorFamily, and accentColors verified from its photographs when available. Treat those profile colors as ground truth for what colors exist; use the images to judge how the colors relate.',
'WEATHER PROFILE:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
'DAILY ROTATION HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
'READ-ONLY SAVED TASTE EVIDENCE (weights indicate confidence; do not copy literally):\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
'COMPLETE ITEM INDEX:\n' + JSON.stringify(compactItemIndexV2_(snapshot))
```

Resolve initial, repair, and standalone planner output with this pattern:

```js
var raw = callGeminiV2_('planner', parts, PLANNER_SCHEMA_V2, temperature);
var response = resolveLabelsV2_(raw, snapshot);
var errors = validatePlannerResponseV2_(response, archetype, snapshot);
return errors.length ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history) : response;
```

Inside `repairPlannerResponseV2_`, preserve the response envelope while translating its candidates:

```js
var modelInvalidResponse = {
  archetype: invalidResponse.archetype,
  candidates: modelFacingCandidatesV2_(invalidResponse.candidates || [], snapshot)
};
```

Serialize `modelInvalidResponse`, resolve the repaired response through `resolveLabelsV2_`, then validate it.

- [ ] **Step 5: Change critic, curator, and final-repair prompt serialization to compact model views**

Use these substitutions in every prompt builder:

```js
'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
'CANDIDATES:\n' + JSON.stringify(modelFacingCandidatesV2_(candidates, snapshot))
```

For current critic prompts, replace the hardcoded count with:

```js
'Score all ' + candidates.length + ' candidates independently on every 0–10 rubric dimension.'
```

For current curator prompts, serialize `modelFacingCandidatesV2_(finalists, snapshot)`. Resolve the curator response immediately:

```js
var raw = callGeminiV2_('curator', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, finalists)), CURATOR_SCHEMA_V2, 0.4);
return resolveLabelsV2_(raw, snapshot);
```

For final repair, serialize `modelFacingCuratedV2_(current, snapshot)` and label-form finalists, then resolve each repair response before calling `validateFinalBundleV2_`.

- [ ] **Step 6: Run prompt-boundary tests and scan all prompt files for direct full-weather serialization**

Run: `npm test -- --run src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts && ! rg -n "JSON\.stringify\(weather\)" apps-script/daily-outfits-v2/{Planner,Critic,Curator,Repair}.gs`

Expected: PASS; the planner fixture contains `S009`, contains no long sneaker id, and contains no hourly or fetched-at weather fields.

- [ ] **Step 7: Commit the label-only prompt boundary**

```bash
git add apps-script/daily-outfits-v2/Planner.gs apps-script/daily-outfits-v2/Critic.gs apps-script/daily-outfits-v2/Curator.gs apps-script/daily-outfits-v2/Repair.gs src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
git commit -m "feat: enforce daily model label boundary"
```

### Task 6: Reconnect feedback, aggregates, history guidance, and yesterday cooldown data

**Files:**
- Create: `src/features/daily-outfits/__tests__/historyContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Taste.gs:48-76`
- Modify: `apps-script/daily-outfits-v2/Planner.gs:37-64`
- Modify: `apps-script/daily-outfits-v2/Critic.gs:80-114`
- Modify: `apps-script/daily-outfits-v2/Curator.gs:30-43`
- Modify: `apps-script/daily-outfits-v2/Repair.gs:1-21`
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs:13-178`

**Interfaces:**
- Consumes: `dailyHistoryContextV2_(localDate, snapshot)` at every caller, retained history entries, and optional `entry.encore`.
- Produces: history fields `feedback`, `itemFeedbackSignals`, `cooldownItemLabels`, internal `cooldownItemIds`, and internal `wornItemIds`; `historyGuidanceV2_(): string`.

- [ ] **Step 1: Write history fixtures that cover positive feedback, unresolved ids, Encore, skipped days, and wore exemptions**

```ts
import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const snapshot = {
  settings: { maxDailyHistoryDays: 30, timezone: 'America/New_York' },
  items: [
    { id: 'top', shortLabel: 'T001', slot: 'top', brand: 'Nike', name: 'ACG Tee' },
    { id: 'bottom', shortLabel: 'B001', slot: 'bottom', brand: 'Dickies', name: 'Double Knee' },
    { id: 'shoe', shortLabel: 'S001', slot: 'shoes', brand: 'Jordan', name: 'Mocha' },
    { id: 'layer', shortLabel: 'L001', slot: 'layer', brand: 'Nike', name: 'Chore Jacket' }
  ]
};

const history = [
  {
    localDate: '2026-07-12', recommendations: [{ candidateId: 'old', name: 'Old Look', archetype: 'easy', itemIds: ['top', 'bottom', 'shoe'] }],
    feedback: [{ candidateId: 'old', value: 'wore', reason: 'other', note: 'Worked well' }, { candidateId: 'missing', value: 'liked' }]
  },
  {
    localDate: '2026-07-13', recommendations: [{ candidateId: 'yesterday', name: 'Yesterday', archetype: 'expressive', itemIds: ['top', 'bottom', 'shoe', 'layer'] }],
    encore: { outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: ['top', 'bottom', 'shoe'] },
    feedback: [{ candidateId: 'encore:saved-1', value: 'liked' }]
  }
];

const contextFor = (entries: object[]) => evaluateAppsScript<(localDate: string, snapshot: object) => Record<string, unknown>>(
  ['ItemIndex.gs', 'Taste.gs'],
  'dailyHistoryContextV2_',
  {
    loadHistoryV2_: () => entries,
    Utilities: {
      parseDate: (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`),
      formatDate: (date: Date) => date.toISOString().slice(0, 10)
    },
    console
  }
);

describe('daily history context', () => {
  it('resolves all feedback values to labeled items and drops unresolved feedback', () => {
    const context = contextFor(history)('2026-07-14', snapshot);
    expect(context.feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'wore', outfitName: 'Old Look', items: ['T001 Nike ACG Tee', 'B001 Dickies Double Knee', 'S001 Jordan Mocha'] }),
      expect.objectContaining({ value: 'liked', outfitName: 'Saved One', archetype: 'encore' })
    ]));
    expect(JSON.stringify(context.feedback)).not.toContain('missing');
    expect(context.itemFeedbackSignals).toEqual(expect.objectContaining({ T001: { wore: 1, liked: 1, disliked: 0 } }));
  });

  it('uses the exact previous calendar day and exempts worn tops and bottoms', () => {
    const context = contextFor(history)('2026-07-14', snapshot);
    expect(context.wornItemIds).toEqual(expect.arrayContaining(['top', 'bottom', 'shoe']));
    expect(context.cooldownItemIds).toEqual([]);
    const skipped = contextFor(history.slice(0, 1))('2026-07-14', snapshot);
    expect(skipped.cooldownItemIds).toEqual([]);
  });

  it('does not put shoes or layers in the cooldown set', () => {
    const withoutWore = structuredClone(history);
    withoutWore[0].feedback = [];
    const context = contextFor(withoutWore)('2026-07-14', snapshot);
    expect(context.cooldownItemIds).toEqual(['top', 'bottom']);
    expect(context.cooldownItemLabels).toEqual(['T001', 'B001']);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the current 14-entry unresolved feedback fails**

Run: `npm test -- --run src/features/daily-outfits/__tests__/historyContracts.test.ts`

Expected: FAIL because current history feedback has no outfit/item join, drops `liked`, and has no cooldown or aggregate fields.

- [ ] **Step 3: Add shared history helpers and the exact guidance block**

```js
function historyLooksV2_(entry) {
  return (entry.recommendations || []).concat(entry.encore ? [Object.assign({ archetype: 'encore' }, entry.encore)] : []);
}

function previousLocalDateV2_(localDate, timezone) {
  var midday = Utilities.parseDate(localDate + ' 12:00', timezone, 'yyyy-MM-dd HH:mm');
  return Utilities.formatDate(new Date(midday.getTime() - 24 * 60 * 60 * 1000), timezone, 'yyyy-MM-dd');
}

function historyGuidanceV2_() {
  return [
    'HOW TO USE DAILY HISTORY:',
    '- exactOutfitsPrevious14Days — combinations already emailed. Never repeat one exactly.',
    '- itemUsagePrevious7Days — how often each item appeared in the last seven emails (exposure, not wear). Treat 3+ appearances as over-exposed unless itemFeedbackSignals shows Kevin actually wore it.',
    '- feedback — Kevin\'s explicit reactions. wore is the strongest positive evidence for that outfit\'s styling logic and its items. liked is positive. disliked is negative, and reason names the failing dimension (colors, too-warm, too-formal, …). Do not rebuild a disliked combination or repeat its failure pattern; do favor the visual logic of worn and liked outfits without copying them.'
  ].join('\n');
}
```

- [ ] **Step 4: Replace `dailyHistoryContextV2_` with a full-window resolved context**

```js
function dailyHistoryContextV2_(localDate, snapshot) {
  var allHistory = loadHistoryV2_().filter(function(entry) { return entry.localDate < localDate; });
  var maxDays = snapshot.settings && snapshot.settings.maxDailyHistoryDays ? snapshot.settings.maxDailyHistoryDays : 30;
  var history = allHistory.slice(-maxDays);
  var last14 = history.slice(-14);
  var last7 = history.slice(-7);
  var itemMap = itemMapV2_(snapshot);
  var usage = {};
  last7.forEach(function(entry) {
    historyLooksV2_(entry).forEach(function(look) {
      (look.itemIds || []).forEach(function(id) { usage[id] = (usage[id] || 0) + 1; });
    });
  });

  var feedback = [];
  var signals = {};
  var worn = {};
  history.forEach(function(entry) {
    var byCandidate = {};
    historyLooksV2_(entry).forEach(function(look) { byCandidate[look.candidateId] = look; });
    (entry.feedback || []).forEach(function(signal) {
      if (['liked', 'disliked', 'wore'].indexOf(signal.value) < 0) return;
      var look = byCandidate[signal.candidateId];
      if (!look) return;
      var itemIds = look.itemIds || [];
      var renderedItems = itemIds.map(function(id) {
        var item = itemMap[id];
        return item ? item.shortLabel + ' ' + item.brand + ' ' + item.name : id;
      });
      var resolvedSignal = {
        localDate: entry.localDate,
        value: signal.value,
        outfitName: look.name,
        archetype: look.archetype || 'encore',
        items: renderedItems
      };
      if (signal.reason) resolvedSignal.reason = signal.reason;
      if (signal.note) resolvedSignal.note = signal.note;
      feedback.push(resolvedSignal);
      itemIds.forEach(function(id) {
        var label = labelForItemIdV2_(id, snapshot);
        signals[label] = signals[label] || { wore: 0, liked: 0, disliked: 0 };
        signals[label][signal.value] += 1;
        if (signal.value === 'wore') worn[id] = true;
      });
    });
  });

  var yesterday = previousLocalDateV2_(localDate, (snapshot.settings && snapshot.settings.timezone) || 'America/New_York');
  var yesterdayEntry = history.find(function(entry) { return entry.localDate === yesterday; });
  var cooldown = {};
  if (yesterdayEntry) {
    historyLooksV2_(yesterdayEntry).forEach(function(look) {
      (look.itemIds || []).forEach(function(id) {
        var item = itemMap[id];
        if (item && (item.slot === 'top' || item.slot === 'bottom') && !worn[id]) cooldown[id] = true;
      });
    });
  }
  var cooldownItemIds = Object.keys(cooldown);
  return {
    exactOutfitsPrevious14Days: last14.flatMap(function(entry) {
      return historyLooksV2_(entry).map(function(look) { return { localDate: entry.localDate, itemIds: (look.itemIds || []).slice().sort(), archetype: look.archetype || 'encore' }; });
    }),
    itemUsagePrevious7Days: usage,
    feedback: feedback,
    itemFeedbackSignals: signals,
    cooldownItemLabels: cooldownItemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }),
    cooldownItemIds: cooldownItemIds,
    wornItemIds: Object.keys(worn)
  };
}
```

- [ ] **Step 5: Pass `snapshot` at every history call site and append guidance to every prompt**

Change every call to:

```js
var history = dailyHistoryContextV2_(weather.localDate, snapshot);
```

Immediately after each history JSON entry in planner, critic, curator/copywriter, planner repair, critic repair, and final repair prompts, add:

```js
historyGuidanceV2_()
```

Add the planner steering line before the history payload:

```js
'Items listed in cooldownItemLabels headlined yesterday\'s email; avoid them today unless history shows Kevin wore them.'
```

- [ ] **Step 6: Run history, prompt, and full contract tests**

Run: `npm test -- --run src/features/daily-outfits/__tests__/historyContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

Expected: PASS; `liked` and Encore feedback resolve, unresolved feedback disappears, and only non-worn yesterday tops/bottoms enter cooldown.

- [ ] **Step 7: Commit the feedback and cooldown context gate**

```bash
git add apps-script/daily-outfits-v2/Taste.gs apps-script/daily-outfits-v2/Planner.gs apps-script/daily-outfits-v2/Critic.gs apps-script/daily-outfits-v2/Curator.gs apps-script/daily-outfits-v2/Repair.gs apps-script/daily-outfits-v2/Scheduler.gs src/features/daily-outfits/__tests__/historyContracts.test.ts
git commit -m "feat: reconnect daily outfit feedback"
```

### Task 7: Implement and exhaustively test the pure deterministic selector

**Files:**
- Create: `apps-script/daily-outfits-v2/Selection.gs`
- Create: `src/features/daily-outfits/__tests__/selectionContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Config.gs:1-16`

**Interfaces:**
- Consumes: real-id candidates, critic score objects, full snapshot/weather/history, `criticScoreMeetsFinalFloorV2_`, `savedOutfitNearCopyV2_`, and `weatherSafetyErrorsV2_`.
- Produces: `compositeScoreV2_(score): number`, `selectFinalistsV2_(candidates, scores, snapshot, weather, history): object`, `selectFinalSetV2_(finalistPools, scores, snapshot, weather): object`, and `chooseReplanArchetypeV2_(eligibleByArchetype, scores, excluded): string | null`.

- [ ] **Step 1: Write selection tests for weights, cooldown eligibility, top-three widening, a true dead end, and total tie-breaks**

```ts
import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

type Candidate = { candidateId: string; archetype: string; topId: string; bottomId: string; shoeId: string; itemIds: string[] };
const candidate = (candidateId: string, archetype: string, top: string, bottom: string, shoe: string): Candidate => ({
  candidateId, archetype, topId: top, bottomId: bottom, shoeId: shoe, itemIds: [top, bottom, shoe]
});
const score = (candidateId: string, overrides: Record<string, unknown> = {}) => ({
  candidateId, weather: 9, palette: 8, colorIntent: 8.5, silhouette: 8, formality: 8,
  visualInterest: 8, wearability: 8, freshness: 8, archetypeFit: 8,
  disqualified: false, criticalDefects: [], reservations: [], ...overrides
});
const ids = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 's1', 's2', 's3', 's4'];
const snapshot = {
  settings: {}, tasteExamples: [],
  items: ids.map(id => ({ id, shortLabel: id.toUpperCase(), slot: id[0] === 't' ? 'top' : id[0] === 'b' ? 'bottom' : 'shoes', category: 'Test', profile: { primaryColorFamily: id, silhouette: 'regular', rainSafety: 'good', available: true, excludedFromDaily: false } }))
};
const api = evaluateAppsScript<{
  compositeScoreV2_: (score: object) => number;
  selectFinalistsV2_: (candidates: Candidate[], scores: object[], snapshot: object, weather: object, history: object) => Record<string, unknown>;
  selectFinalSetV2_: (pools: Record<string, Candidate[]>, scores: object[], snapshot: object, weather: object) => Record<string, unknown>;
}>(['Config.gs', 'ItemIndex.gs', 'Critic.gs', 'Taste.gs', 'FinalValidation.gs', 'Selection.gs'], '({ compositeScoreV2_, selectFinalistsV2_, selectFinalSetV2_ })', {
  console
});
const weather = { rainExpected: false, layerGuidance: 'none', middayFeelsLikeF: 70, morningFeelsLikeF: 60, eveningFeelsLikeF: 60 };

describe('deterministic selection', () => {
  it('uses every configured weight', () => {
    const allTens = score('x', { weather: 10, palette: 10, colorIntent: 10, silhouette: 10, formality: 10, visualInterest: 10, wearability: 10, freshness: 10, archetypeFit: 10 });
    expect(api.compositeScoreV2_(allTens)).toBe(10);
  });

  it('makes a cooldown top ineligible while leaving shoes exempt', () => {
    const candidates = [candidate('e1', 'easy', 't1', 'b1', 's1'), candidate('e2', 'easy', 't2', 'b2', 's1')];
    const result = api.selectFinalistsV2_(candidates, candidates.map(value => score(value.candidateId)), snapshot, weather, {
      exactOutfitsPrevious14Days: [], cooldownItemIds: ['t1', 's1']
    }) as { eligibleCountByArchetype: Record<string, number> };
    expect(result.eligibleCountByArchetype.easy).toBe(1);
  });

  it('widens from top two to top three when the top-two matrix has no unique-shoe set', () => {
    const pools = {
      easy: [candidate('e1', 'easy', 't1', 'b1', 's1'), candidate('e2', 'easy', 't2', 'b2', 's1'), candidate('e3', 'easy', 't3', 'b3', 's3')],
      'polished-casual': [candidate('p1', 'polished-casual', 't4', 'b4', 's1'), candidate('p2', 'polished-casual', 't5', 'b5', 's1'), candidate('p3', 'polished-casual', 't6', 'b6', 's2')],
      expressive: [candidate('x1', 'expressive', 't7', 'b7', 's2'), candidate('x2', 'expressive', 't8', 'b8', 's2'), candidate('x3', 'expressive', 't9', 'b9', 's4')]
    };
    const scores = Object.values(pools).flat().map(value => score(value.candidateId));
    const result = api.selectFinalSetV2_(pools, scores, snapshot, weather) as { path: string; selectedCandidates: Candidate[] };
    expect(result.path).toBe('top3');
    expect(new Set(result.selectedCandidates.map(value => value.shoeId)).size).toBe(3);
  });

  it('returns needsReplan instead of throwing when no top-three set is feasible', () => {
    const pools = {
      easy: [candidate('e1', 'easy', 't1', 'b1', 's1'), candidate('e2', 'easy', 't2', 'b2', 's1')],
      'polished-casual': [candidate('p1', 'polished-casual', 't4', 'b4', 's1'), candidate('p2', 'polished-casual', 't5', 'b5', 's1')],
      expressive: [candidate('x1', 'expressive', 't7', 'b7', 's2'), candidate('x2', 'expressive', 't8', 'b8', 's2')]
    };
    const scores = Object.values(pools).flat().map(value => score(value.candidateId));
    expect(api.selectFinalSetV2_(pools, scores, snapshot, weather)).toEqual(expect.objectContaining({ needsReplan: expect.any(String), feasibleSetCount: 0 }));
  });

  it('breaks complete score ties by joined candidate ids', () => {
    const pools = {
      easy: [candidate('e-b', 'easy', 't1', 'b1', 's1'), candidate('e-a', 'easy', 't2', 'b2', 's4')],
      'polished-casual': [candidate('p-a', 'polished-casual', 't4', 'b4', 's2'), candidate('p-b', 'polished-casual', 't5', 'b5', 's4')],
      expressive: [candidate('x-a', 'expressive', 't7', 'b7', 's3'), candidate('x-b', 'expressive', 't8', 'b8', 's4')]
    };
    const scores = Object.values(pools).flat().map(value => score(value.candidateId));
    const result = api.selectFinalSetV2_(pools, scores, snapshot, weather) as { selectedCandidates: Candidate[] };
    expect(result.selectedCandidates.map(value => value.candidateId).join('|')).toBe('e-a|p-a|x-a');
  });
});
```

- [ ] **Step 2: Run the focused test and verify `Selection.gs` is missing**

Run: `npm test -- --run src/features/daily-outfits/__tests__/selectionContracts.test.ts`

Expected: FAIL because the Apps Script source file and selector functions do not exist.

- [ ] **Step 3: Add the exact composite weights to configuration**

```js
COMPOSITE_WEIGHTS: Object.freeze({
  colorIntent: 0.20,
  palette: 0.15,
  weather: 0.12,
  archetypeFit: 0.10,
  visualInterest: 0.10,
  wearability: 0.10,
  freshness: 0.10,
  silhouette: 0.08,
  formality: 0.05
}),
```

- [ ] **Step 4: Implement candidate eligibility and deterministic per-archetype ordering in `Selection.gs`**

```js
function compositeScoreV2_(score) {
  return Object.keys(DAILY_V2.COMPOSITE_WEIGHTS).reduce(function(total, metric) {
    return total + score[metric] * DAILY_V2.COMPOSITE_WEIGHTS[metric];
  }, 0);
}

function selectionScoreMapV2_(scores) {
  return (scores || []).reduce(function(map, score) { map[score.candidateId] = score; return map; }, {});
}

function candidateEligibilityErrorsV2_(candidate, score, snapshot, weather, history) {
  var errors = [];
  if (!criticScoreMeetsFinalFloorV2_(score)) errors.push('critic score floors');
  var historyKeys = exactHistoryKeysV2_(history);
  if (historyKeys[(candidate.itemIds || []).slice().sort().join('|')]) errors.push('prior-14-day exact repeat');
  if (savedOutfitNearCopyV2_(candidate.itemIds || [], snapshot)) errors.push('saved-outfit near-copy');
  var cooldown = new Set(history.cooldownItemIds || []);
  if (cooldown.has(candidate.topId) || cooldown.has(candidate.bottomId)) errors.push('yesterday top/bottom cooldown');
  var items = itemMapV2_(snapshot);
  return errors.concat(weatherSafetyErrorsV2_(candidate, items, weather, snapshot));
}

function chooseReplanArchetypeV2_(eligibleByArchetype, scores, excluded) {
  var scoreMap = selectionScoreMapV2_(scores);
  var blocked = new Set(excluded || []);
  var choices = DAILY_V2.ARCHETYPES.filter(function(archetype) { return !blocked.has(archetype); }).map(function(archetype) {
    var eligible = eligibleByArchetype[archetype] || [];
    var best = eligible.length ? compositeScoreV2_(scoreMap[eligible[0].candidateId]) : -Infinity;
    return { archetype: archetype, count: eligible.length, best: best };
  });
  choices.sort(function(a, b) {
    if (a.count !== b.count) return a.count - b.count;
    if (a.best !== b.best) return a.best - b.best;
    return DAILY_V2.ARCHETYPES.indexOf(a.archetype) - DAILY_V2.ARCHETYPES.indexOf(b.archetype);
  });
  return choices.length ? choices[0].archetype : null;
}

function selectFinalistsV2_(candidates, scores, snapshot, weather, history) {
  var scoreMap = selectionScoreMapV2_(scores);
  var eligibleByArchetype = {};
  var compositeById = {};
  DAILY_V2.ARCHETYPES.forEach(function(archetype) { eligibleByArchetype[archetype] = []; });
  candidates.forEach(function(candidate) {
    var score = scoreMap[candidate.candidateId];
    if (score) compositeById[candidate.candidateId] = compositeScoreV2_(score);
    if (DAILY_V2.ARCHETYPES.indexOf(candidate.archetype) >= 0 && !candidateEligibilityErrorsV2_(candidate, score, snapshot, weather, history).length) {
      eligibleByArchetype[candidate.archetype].push(candidate);
    }
  });
  DAILY_V2.ARCHETYPES.forEach(function(archetype) {
    eligibleByArchetype[archetype].sort(function(a, b) {
      var scoreA = scoreMap[a.candidateId];
      var scoreB = scoreMap[b.candidateId];
      var compositeDelta = compositeById[b.candidateId] - compositeById[a.candidateId];
      if (compositeDelta) return compositeDelta;
      if (scoreB.colorIntent !== scoreA.colorIntent) return scoreB.colorIntent - scoreA.colorIntent;
      return a.candidateId.localeCompare(b.candidateId);
    });
  });
  var counts = DAILY_V2.ARCHETYPES.reduce(function(result, archetype) { result[archetype] = eligibleByArchetype[archetype].length; return result; }, {});
  var short = DAILY_V2.ARCHETYPES.some(function(archetype) { return counts[archetype] < 2; });
  return {
    needsReplan: short ? chooseReplanArchetypeV2_(eligibleByArchetype, scores, []) : null,
    finalistPools: eligibleByArchetype,
    eligibleByArchetype: eligibleByArchetype,
    eligibleCountByArchetype: counts,
    compositeById: compositeById
  };
}
```

- [ ] **Step 5: Implement set constraints, enumeration, widening, and rank tie-breaks**

```js
function candidateSetErrorsV2_(set, snapshot, weather) {
  var errors = [];
  var items = itemMapV2_(snapshot);
  var selected = set.map(function(candidate) { return candidate.itemIds.map(function(id) { return items[id]; }).filter(Boolean); });
  var tops = selected.map(function(group) { return group.find(function(item) { return item.slot === 'top'; }); });
  var bottoms = selected.map(function(group) { return group.find(function(item) { return item.slot === 'bottom'; }); });
  var shoes = selected.map(function(group) { return group.find(function(item) { return item.slot === 'shoes'; }); });
  if (new Set(tops.map(function(item) { return item && item.id; })).size < 3) errors.push('tops must be unique');
  if (new Set(bottoms.map(function(item) { return item && item.id; })).size < 3) errors.push('bottoms must be unique');
  var weatherSafeShoes = snapshot.items.filter(function(item) { return item.slot === 'shoes' && (!weather.rainExpected || item.profile.rainSafety !== 'poor'); });
  if (weatherSafeShoes.length >= 3 && new Set(shoes.map(function(item) { return item && item.id; })).size < 3) errors.push('shoes must be unique');
  var stories = selected.map(function(group) {
    var top = group.find(function(item) { return item.slot === 'top'; });
    var bottom = group.find(function(item) { return item.slot === 'bottom'; });
    return [top.profile.primaryColorFamily, bottom.profile.primaryColorFamily, top.profile.silhouette, bottom.profile.silhouette].join('|');
  });
  if (new Set(stories).size < 3) errors.push('diversity stories must be distinct');
  for (var i = 0; i < set.length; i += 1) {
    for (var j = i + 1; j < set.length; j += 1) {
      var shared = set[i].itemIds.filter(function(id) { return set[j].itemIds.indexOf(id) >= 0; });
      if (shared.length > 1) errors.push('outfits share more than one item');
    }
  }
  var layerCounts = {};
  selected.forEach(function(group) {
    var layer = group.find(function(item) { return item.slot === 'layer'; });
    if (layer) layerCounts[layer.id] = (layerCounts[layer.id] || 0) + 1;
  });
  var credibleLayers = snapshot.items.filter(function(item) { return item.slot === 'layer' && item.profile.available && !item.profile.excludedFromDaily; });
  Object.keys(layerCounts).forEach(function(id) {
    if (layerCounts[id] > 1 && (weather.layerGuidance !== 'required' || credibleLayers.length >= 2)) errors.push('layer repeat is not permitted');
  });
  return Array.from(new Set(errors));
}

function enumerateCandidateSetsV2_(pools, size) {
  var easy = (pools.easy || []).slice(0, size);
  var polished = (pools['polished-casual'] || []).slice(0, size);
  var expressive = (pools.expressive || []).slice(0, size);
  var sets = [];
  easy.forEach(function(a) { polished.forEach(function(b) { expressive.forEach(function(c) { sets.push([a, b, c]); }); }); });
  return sets;
}

function rankCandidateSetsV2_(sets, scores) {
  var scoreMap = selectionScoreMapV2_(scores);
  return sets.sort(function(a, b) {
    var compositesA = a.map(function(candidate) { return compositeScoreV2_(scoreMap[candidate.candidateId]); });
    var compositesB = b.map(function(candidate) { return compositeScoreV2_(scoreMap[candidate.candidateId]); });
    var sumA = compositesA.reduce(function(sum, value) { return sum + value; }, 0);
    var sumB = compositesB.reduce(function(sum, value) { return sum + value; }, 0);
    if (sumA !== sumB) return sumB - sumA;
    var minA = Math.min.apply(null, compositesA);
    var minB = Math.min.apply(null, compositesB);
    if (minA !== minB) return minB - minA;
    var colorA = a.reduce(function(sum, candidate) { return sum + scoreMap[candidate.candidateId].colorIntent; }, 0);
    var colorB = b.reduce(function(sum, candidate) { return sum + scoreMap[candidate.candidateId].colorIntent; }, 0);
    if (colorA !== colorB) return colorB - colorA;
    return a.map(function(candidate) { return candidate.candidateId; }).join('|').localeCompare(b.map(function(candidate) { return candidate.candidateId; }).join('|'));
  });
}

function selectFinalSetV2_(finalistPools, scores, snapshot, weather) {
  for (var size = 2; size <= 3; size += 1) {
    var feasible = enumerateCandidateSetsV2_(finalistPools, size).filter(function(set) { return candidateSetErrorsV2_(set, snapshot, weather).length === 0; });
    if (feasible.length) {
      rankCandidateSetsV2_(feasible, scores);
      return { selectedCandidates: feasible[0], path: size === 2 ? 'top2' : 'top3', feasibleSetCount: feasible.length, needsReplan: null };
    }
  }
  return {
    selectedCandidates: null,
    path: 'top3',
    feasibleSetCount: 0,
    needsReplan: chooseReplanArchetypeV2_(finalistPools, scores, [])
  };
}
```

- [ ] **Step 6: Run the selector tests and full suite**

Run: `npm test -- --run src/features/daily-outfits/__tests__/selectionContracts.test.ts && npm test`

Expected: PASS; top-two dead ends widen deterministically, true dead ends return `needsReplan`, and no selector test invokes a model.

- [ ] **Step 7: Commit the pure selector gate**

```bash
git add apps-script/daily-outfits-v2/Config.gs apps-script/daily-outfits-v2/Selection.gs src/features/daily-outfits/__tests__/selectionContracts.test.ts
git commit -m "feat: add deterministic daily outfit selection"
```

### Task 8: Cut critic to scoring, add bounded targeted re-plans, and turn curator into copywriter

**Files:**
- Modify: `src/features/daily-outfits/__tests__/selectionContracts.test.ts`
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts:89-150`
- Modify: `apps-script/daily-outfits-v2/Selection.gs`
- Modify: `apps-script/daily-outfits-v2/Planner.gs:37-96`
- Modify: `apps-script/daily-outfits-v2/Critic.gs:21-125`
- Modify: `apps-script/daily-outfits-v2/Curator.gs:1-54`
- Modify: `apps-script/daily-outfits-v2/Repair.gs:1-34`
- Modify: `apps-script/daily-outfits-v2/FinalValidation.gs:31-119`

**Interfaces:**
- Consumes: Task 7 pure selector, five-candidate planner schema, score-only critic schema, and Task 4 label views.
- Produces: `runCriticCandidatesV2_(snapshot, weather, history, candidates): {scores: object[]}`, `replanArchetypeV2_(archetype, snapshot, weather, history, failureNotes, avoidItemIds, round): plannerResponse`, `runSelectionV2_(snapshot, weather, history, plannerResponses, critic): selectionResult`, and `runCuratorV2_(snapshot, weather, history, selectedCandidates, critic): curated`.

- [ ] **Step 1: Add a bounded re-plan orchestration test**

```ts
it('merges five new candidates, scores only them, and records replan-1', () => {
  const initial = ['easy', 'polished-casual', 'expressive'].flatMap((archetype, group) =>
    Array.from({ length: 5 }, (_, index) => candidate(`${archetype}-${index}`, archetype, `t${group * 3 + 1}`, `b${group * 3 + 1}`, group === 0 ? 's1' : group === 1 ? 's1' : 's2'))
  );
  const initialScores = initial.map(value => score(value.candidateId));
  const replanned = Array.from({ length: 5 }, (_, index) => candidate(`easy-r-${index}`, 'easy', `t${index + 1}`, `b${index + 1}`, index === 0 ? 's3' : 's4'));
  const run = evaluateAppsScript<(snapshot: object, weather: object, history: object, planners: object[], critic: object) => Record<string, unknown>>(
    ['Config.gs', 'Selection.gs'],
    'runSelectionV2_',
    {
      replanArchetypeV2_: () => ({ archetype: 'easy', candidates: replanned }),
      runCriticCandidatesV2_: (_snapshot: object, _weather: object, _history: object, values: Candidate[]) => ({ scores: values.map(value => score(value.candidateId, { colorIntent: 9 })) }),
      exactHistoryKeysV2_: () => ({}),
      savedOutfitNearCopyV2_: () => null,
      weatherSafetyErrorsV2_: () => [],
      itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
      console
    }
  );
  const result = run(snapshot, weather, { exactOutfitsPrevious14Days: [], cooldownItemIds: [] }, [
    { archetype: 'easy', candidates: initial.filter(value => value.archetype === 'easy') },
    { archetype: 'polished-casual', candidates: initial.filter(value => value.archetype === 'polished-casual') },
    { archetype: 'expressive', candidates: initial.filter(value => value.archetype === 'expressive') }
  ], { scores: initialScores }) as { selection: { path: string; replannedArchetypes: string[] }; critic: { scores: object[] } };
  expect(result.selection.path).toBe('replan-1');
  expect(result.selection.replannedArchetypes).toEqual(['easy']);
  expect(result.critic.scores).toHaveLength(20);
});
```

- [ ] **Step 2: Change critic schema and validation to score-only, then update old finalist tests**

Use this schema:

```js
var CRITIC_SCHEMA_V2 = {
  type: 'OBJECT',
  properties: { scores: { type: 'ARRAY', items: CRITIC_SCORE_SCHEMA_V2 } },
  required: ['scores']
};
```

Delete `criticFinalistIdsV2_`. Move `criticScoreMeetsFinalFloorV2_` into `Selection.gs` unchanged. End `validateCriticResponseV2_` immediately after verifying that every candidate has one structurally valid score; do not inspect floors or select ids.

Replace both old finalist-floor tests in `appsScriptContracts.test.ts` with:

```ts
it('accepts honest below-floor critic scores when every candidate is scored once', () => {
  const candidates = [{ candidateId: 'easy-1', archetype: 'easy' }];
  const response = { scores: [{ candidateId: 'easy-1', weather: 4, palette: 5, colorIntent: 3, silhouette: 5, formality: 5, visualInterest: 4, wearability: 6, freshness: 4, archetypeFit: 5, disqualified: true, criticalDefects: ['weather'], reservations: [] }] };
  expect(criticValidator(response, candidates)).toEqual([]);
});
```

- [ ] **Step 3: Generalize critic execution to any candidate count and remove selection pressure from both prompts**

```js
function runCriticCandidatesV2_(snapshot, weather, history, candidates) {
  var prompt = [
    'Act as a demanding multimodal wardrobe critic. Judge the actual item images, not metadata alone.',
    'Each item profile lists primaryColorFamily, secondaryColorFamily, and accentColors verified from its photographs. Treat them as ground truth for what colors exist; use the images to judge how the colors relate.',
    'Score all ' + candidates.length + ' candidates independently on every 0–10 rubric dimension.',
    'Your scores feed a deterministic selector that applies quality floors downstream. Score each candidate faithfully against the anchors — an honest low score is more useful than a generous one. You are not responsible for ensuring any candidate qualifies.',
    'Penalize weather risk heavily and disqualify clear weather mismatch, obvious color conflict, incoherent formality, uncertain item identification, exact recent repeat, a candidate that retains two core pieces from a saved outfit, or material duplication of a stronger candidate.',
    'Palette measures harmony; colorIntent measures whether the outfit has a precise, visible cross-item color idea. Score colorIntent 0–4 for generic neutral safety or a top placed over unrelated black/grey/white bottoms and shoes; 5–7 for competent anchoring without a meaningful hook; 8–10 only for a clearly observable accent echo, tonal bridge, analogous relationship, complementary contrast, or trim/material link.',
    criticScoreAnchorsV2_(),
    'Do not rewrite candidate contents or expose chain-of-thought.',
    'ARCHETYPES:\n' + DAILY_V2.ARCHETYPES.map(function(value) { return value + ': ' + archetypeBriefV2_(value); }).join('\n'),
    'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    historyGuidanceV2_(),
    'SAVED OUTFIT SIGNATURES:\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
    'CANDIDATES:\n' + JSON.stringify(modelFacingCandidatesV2_(candidates, snapshot))
  ].join('\n\n');
  var response = callGeminiV2_('critic', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, candidates)), CRITIC_SCHEMA_V2, 0.3);
  var errors = validateCriticResponseV2_(response, candidates);
  return errors.length ? repairCriticResponseV2_(snapshot, weather, history, candidates, response, errors) : response;
}

function runCriticV2_(snapshot, weather, history, plannerResponses) {
  return runCriticCandidatesV2_(snapshot, weather, history, plannerResponses.flatMap(function(response) { return response.candidates; }));
}
```

The repair prompt must say `Repair this multimodal critic score response`, include the same profile-ground-truth sentence, the honest-scoring sentence, and `criticScoreAnchorsV2_()`, and contain no finalist count or floor-satisfaction instruction.

- [ ] **Step 4: Add targeted planner guidance without changing the five-candidate schema**

Allow `plannerPartsV2_` and `repairPlannerResponseV2_` to accept a final optional `selectionGuidance` string. Append it only when truthy. Add:

```js
function replanArchetypeV2_(archetype, snapshot, weather, history, failureNotes, avoidItemIds, round) {
  var guidance = [
    'TARGETED RE-PLAN ROUND ' + round + ': Return five new ' + archetype + ' candidates with candidateIds not used in the prior response.',
    'Your previous five candidates failed because:\n' + JSON.stringify(failureNotes),
    'Other looks in today\'s set already use these items; prefer alternatives:\n' + avoidItemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }).join(', ')
  ].join('\n\n');
  var parts = plannerPartsV2_(archetype, snapshot, weather, history, guidance);
  var raw = callGeminiV2_('planner', parts, PLANNER_SCHEMA_V2, getNumberPropertyV2_('DAILY_MODEL_TEMPERATURE', 0.9));
  var response = resolveLabelsV2_(raw, snapshot);
  var errors = validatePlannerResponseV2_(response, archetype, snapshot);
  return errors.length ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history, guidance) : response;
}
```

- [ ] **Step 5: Implement bounded selection orchestration and exact-duplicate merging**

```js
function mergeReplannedCandidatesV2_(existing, additions) {
  var ids = new Set(existing.map(function(candidate) { return candidate.candidateId; }));
  var combinations = new Set(existing.map(function(candidate) { return candidate.itemIds.slice().sort().join('|'); }));
  var merged = existing.slice();
  additions.forEach(function(candidate) {
    var key = candidate.itemIds.slice().sort().join('|');
    if (combinations.has(key)) return;
    if (ids.has(candidate.candidateId)) throw new Error('Targeted re-plan reused candidateId ' + candidate.candidateId);
    ids.add(candidate.candidateId);
    combinations.add(key);
    merged.push(candidate);
  });
  return merged;
}

function runSelectionV2_(snapshot, weather, history, plannerResponses, critic) {
  var candidates = plannerResponses.flatMap(function(response) { return response.candidates; });
  var scores = critic.scores.slice();
  var replannedArchetypes = [];
  for (var round = 0; round <= 2; round += 1) {
    var finalists = selectFinalistsV2_(candidates, scores, snapshot, weather, history);
    var setResult = finalists.needsReplan ? { needsReplan: finalists.needsReplan, feasibleSetCount: 0 } : selectFinalSetV2_(finalists.finalistPools, scores, snapshot, weather);
    if (!setResult.needsReplan && setResult.selectedCandidates) {
      return {
        candidates: candidates,
        critic: { scores: scores },
        selectedCandidates: setResult.selectedCandidates,
        selection: {
          eligibleCountByArchetype: finalists.eligibleCountByArchetype,
          compositeById: finalists.compositeById,
          path: round ? 'replan-' + round : setResult.path,
          feasibleSetCount: setResult.feasibleSetCount,
          replannedArchetypes: replannedArchetypes.slice()
        }
      };
    }
    if (round === 2) throw new Error('Daily selection exhausted two targeted re-plan rounds');
    var archetype = setResult.needsReplan;
    if (replannedArchetypes.indexOf(archetype) >= 0) archetype = chooseReplanArchetypeV2_(finalists.eligibleByArchetype, scores, replannedArchetypes);
    if (!archetype) throw new Error('No unreplanned archetype remains for targeted re-plan');
    var scoreMap = selectionScoreMapV2_(scores);
    var failed = candidates.filter(function(candidate) { return candidate.archetype === archetype; }).map(function(candidate) {
      var score = scoreMap[candidate.candidateId] || {};
      return { candidateId: candidate.candidateId, criticalDefects: score.criticalDefects || [], reservations: score.reservations || [] };
    });
    var claimed = DAILY_V2.ARCHETYPES.filter(function(value) { return value !== archetype; }).flatMap(function(value) {
      return (finalists.finalistPools[value] || []).slice(0, 2).flatMap(function(candidate) { return candidate.itemIds; });
    });
    var replanned = replanArchetypeV2_(archetype, snapshot, weather, history, failed, Array.from(new Set(claimed)), round + 1);
    var priorLength = candidates.length;
    candidates = mergeReplannedCandidatesV2_(candidates, replanned.candidates);
    var additions = candidates.slice(priorLength);
    if (!additions.length) throw new Error('Targeted re-plan returned only duplicate combinations');
    scores = scores.concat(runCriticCandidatesV2_(snapshot, weather, history, additions).scores);
    replannedArchetypes.push(archetype);
  }
  throw new Error('Daily selection loop exited unexpectedly');
}
```

- [ ] **Step 6: Rewrite curator and repair as immutable-set copywriting**

Replace `runCuratorV2_` with:

```js
function runCuratorV2_(snapshot, weather, history, selectedCandidates, critic) {
  var scoreMap = selectionScoreMapV2_(critic.scores);
  var selectedScores = selectedCandidates.map(function(candidate) { return scoreMap[candidate.candidateId]; });
  var prompt = [
    'These three outfits are final — selected and validated upstream. Do not swap, reorder, or modify them. Write the customer-facing copy for each.',
    'Copy each candidateId, archetype, and itemIds exactly in the same order. In colorHook, name the exact visible colors/details and at least two items that create the relationship.',
    'Do not use generic language such as "keeps it clean," "lets the top pop," or "ties everything together." Produce concise customer-facing explanations only; do not reveal chain-of-thought.',
    'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    historyGuidanceV2_(),
    'FINAL SELECTED OUTFITS:\n' + JSON.stringify(modelFacingCandidatesV2_(selectedCandidates, snapshot)),
    'CRITIC SCORES:\n' + JSON.stringify(selectedScores)
  ].join('\n\n');
  var raw = callGeminiV2_('curator', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, selectedCandidates)), CURATOR_SCHEMA_V2, 0.4);
  return resolveLabelsV2_(raw, snapshot);
}
```

Change `repairFinalBundleV2_` to accept `selectedCandidates` instead of planner responses. Its prompt must state that candidate ids, archetypes, item ids, and order are immutable; serialize only `modelFacingCuratedV2_(current, snapshot)` and `modelFacingCandidatesV2_(selectedCandidates, snapshot)`. Keep the two-attempt loop and temperature `0.25`.

- [ ] **Step 7: Make final validation enforce byte-exact echoes from the selected set**

Change the signature to:

```js
function validateFinalBundleV2_(curated, snapshot, weather, history, selectedCandidates, critic)
```

At the start of each recommendation iteration, use:

```js
var candidate = selectedCandidates[index];
if (!candidate || rec.candidateId !== candidate.candidateId) errors.push(path + ' changed or reordered the selected candidateId');
if (!candidate || rec.archetype !== candidate.archetype) errors.push(path + ' changed the selected archetype');
if (!candidate || JSON.stringify(rec.itemIds) !== JSON.stringify(candidate.itemIds)) errors.push(path + ' changed or reordered the selected itemIds');
```

Delete the six-finalist map. Keep all downstream slot, uniqueness, history, saved-outfit, prose, score, weather, diversity, and shared-item checks. Add the mirrored cooldown defense inside the recommendation loop:

```js
var cooldown = new Set(history.cooldownItemIds || []);
if (candidate && (cooldown.has(candidate.topId) || cooldown.has(candidate.bottomId))) errors.push(path + ' violates the yesterday top/bottom cooldown');
```

- [ ] **Step 8: Run selection, contract, prompt, build, and lint gates**

Run: `npm test -- --run src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts && npm run build && npm run lint`

Expected: all commands exit `0`; `CRITIC_SCHEMA_V2` has only `scores`, low honest scores validate structurally, and the orchestration test records `replan-1` after scoring five new candidates.

- [ ] **Step 9: Commit the model-role cutover**

```bash
git add apps-script/daily-outfits-v2/Selection.gs apps-script/daily-outfits-v2/Planner.gs apps-script/daily-outfits-v2/Critic.gs apps-script/daily-outfits-v2/Curator.gs apps-script/daily-outfits-v2/Repair.gs apps-script/daily-outfits-v2/FinalValidation.gs src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "feat: select daily outfits deterministically"
```

### Task 9: Persist the `selection-ready` stage, policy version 3, and selection diagnostics

**Files:**
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts:77-87`
- Modify: `apps-script/daily-outfits-v2/Config.gs:1-16`
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs:13-124`
- Modify: `apps-script/daily-outfits-v2/Diagnostics.gs:1-15`
- Modify: `apps-script/daily-outfits-v2/Curator.gs:45-54`
- Modify: `apps-script/daily-outfits-v2/Repair.gs:24-34`
- Modify: `apps-script/daily-outfits-v2/FinalValidation.gs:113-119`

**Interfaces:**
- Consumes: Task 8 `runSelectionV2_` result `{candidates, critic, selectedCandidates, selection}`.
- Produces: stage order `idle -> weather-ready -> planners-ready -> critic-ready -> selection-ready -> bundle-ready -> sent`; `pending.selection`; diagnostics `{selection, attemptCounts}`.

- [ ] **Step 1: Update the stage contract test before changing the scheduler**

```ts
it('contains policy-v3 selection resume and send-after-success duplicate protections', () => {
  const scheduler = apps('Scheduler.gs');
  const config = apps('Config.gs');
  const diagnostics = apps('Diagnostics.gs');
  expect(config).toMatch(/QUALITY_POLICY_VERSION:\s*3/);
  expect(scheduler).toMatch(/LockService\.getScriptLock/);
  expect(scheduler).toMatch(/critic-ready/);
  expect(scheduler).toMatch(/selection-ready/);
  expect(scheduler).not.toMatch(/curated-ready/);
  expect(diagnostics).toMatch(/eligibleCountByArchetype/);
  expect(diagnostics).toMatch(/attemptCounts/);
  const sendIndex = scheduler.indexOf('sendDailyBundleNowV2_');
  const sentDateIndex = scheduler.indexOf("setProperty('LAST_SENT_DATE_V2'", sendIndex);
  expect(sendIndex).toBeGreaterThan(-1);
  expect(sentDateIndex).toBeGreaterThan(sendIndex);
});
```

- [ ] **Step 2: Run the stage contract and verify policy/stage expectations fail**

Run: `npm test -- --run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

Expected: FAIL because policy is `2`, selection is not persisted, and `curated-ready` still exists.

- [ ] **Step 3: Change policy version to 3 and wire the synchronous pipeline**

Set:

```js
QUALITY_POLICY_VERSION: 3,
```

Replace `generationBundlePipelineV2_` with:

```js
function generationBundlePipelineV2_(snapshot, weather) {
  var history = dailyHistoryContextV2_(weather.localDate, snapshot);
  var planners = runAllPlannersV2_(snapshot, weather, history);
  var initialCritic = runCriticV2_(snapshot, weather, history, planners);
  var selected = runSelectionV2_(snapshot, weather, history, planners, initialCritic);
  var curated = runCuratorV2_(snapshot, weather, history, selected.selectedCandidates, selected.critic);
  var errors = validateFinalBundleV2_(curated, snapshot, weather, history, selected.selectedCandidates, selected.critic);
  if (errors.length) curated = repairFinalBundleV2_(curated, errors, snapshot, weather, history, selected.selectedCandidates, selected.critic);
  return {
    history: history,
    planners: planners,
    candidates: selected.candidates,
    critic: selected.critic,
    selectedCandidates: selected.selectedCandidates,
    selection: selected.selection,
    curated: curated,
    bundle: buildBundleV2_(curated, snapshot, weather)
  };
}
```

- [ ] **Step 4: Replace manual `critic-ready`/`curated-ready` branches with selection and bundle branches**

```js
} else if (pending.manualStage === 'critic-ready') {
  var selected = runSelectionV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
  pending.candidates = selected.candidates;
  pending.critic = selected.critic;
  pending.selectedCandidates = selected.selectedCandidates;
  pending.selection = selected.selection;
  pending.manualStage = 'selection-ready';
} else if (pending.manualStage === 'selection-ready') {
  pending.curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  if (errors.length) pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather);
  pending.manualStage = 'bundle-ready';
}
```

The manual step remains complete only at `bundle-ready`; the UI's existing eight-iteration maximum still exceeds the six stage advances.

- [ ] **Step 5: Add the same persisted transition to `advanceDailyJobV2_`**

```js
} else if (state.stage === 'critic-ready') {
  var selected = runSelectionV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
  pending.candidates = selected.candidates;
  pending.critic = selected.critic;
  pending.selectedCandidates = selected.selectedCandidates;
  pending.selection = selected.selection;
  pending.updatedAt = Date.now();
  state.stage = 'selection-ready';
} else if (state.stage === 'selection-ready') {
  pending.curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  if (errors.length) pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather);
  pending.updatedAt = Date.now();
  state.stage = 'bundle-ready';
  state.bundleFileId = savePendingV2_(pending);
}
```

Keep the existing execution-budget loop, state save after every transition, and bundle-ready send guard unchanged.

- [ ] **Step 6: Update standalone curator, repair, and validation entry points to require persisted selection**

Use `pending.selectedCandidates` in all three calls and fail with this message when it is absent:

```js
if (!pending || !pending.selectedCandidates || !pending.critic) throw new Error('Deterministic selection must be ready');
```

- [ ] **Step 7: Surface safe selection diagnostics without dumping full candidate payloads**

```js
function getDailyOutfitDiagnosticsV2() {
  var snapshot = loadSnapshotV2_();
  var validation = validateStoredSnapshotV2();
  var state = loadJobStateV2_();
  var pending = loadPendingV2_();
  var selection = pending && pending.selection;
  return {
    snapshot: validation,
    job: state,
    selection: selection ? {
      path: selection.path,
      eligibleCountByArchetype: selection.eligibleCountByArchetype,
      feasibleSetCount: selection.feasibleSetCount,
      replannedArchetypes: selection.replannedArchetypes
    } : null,
    attemptCounts: state ? state.attemptCounts : {},
    lastSentDate: getDailyPropertiesV2_().getProperty('LAST_SENT_DATE_V2'),
    modelsConfigured: ['DAILY_PLANNER_MODEL', 'DAILY_CRITIC_MODEL', 'DAILY_CURATOR_MODEL', 'DAILY_REPAIR_MODEL'].reduce(function(result, key) {
      result[key] = Boolean(getDailyPropertiesV2_().getProperty(key));
      return result;
    }, {}),
    snapshotAgeHours: snapshot ? (Date.now() - snapshot.generatedAt) / 3600000 : null
  };
}
```

- [ ] **Step 8: Run the full automated gate**

Run: `npm test && npm run build && npm run lint`

Expected: all commands exit `0`; the stage contract finds `selection-ready`, rejects `curated-ready`, and finds policy version `3`.

- [ ] **Step 9: Commit the stage-machine cutover**

```bash
git add apps-script/daily-outfits-v2/Config.gs apps-script/daily-outfits-v2/Scheduler.gs apps-script/daily-outfits-v2/Diagnostics.gs apps-script/daily-outfits-v2/Curator.gs apps-script/daily-outfits-v2/Repair.gs apps-script/daily-outfits-v2/FinalValidation.gs src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "feat: persist daily selection stage"
```

### Task 10: Enrich wardrobe profiles and hydrate them without overwriting local profiles

**Files:**
- Create: `scripts/enrich_daily_profiles.mjs`
- Create: `src/features/daily-outfits/__tests__/itemProfile.test.ts`
- Modify: `src/features/daily-outfits/types.ts:25-40`
- Modify: `src/features/daily-outfits/itemProfile.ts:15-50`
- Modify: `src/App.tsx:41-131`
- Modify after script review: `src/data/closet.json`
- Modify after script review: `src/data/sneakers.json`

**Interfaces:**
- Consumes: `GEMINI_API_KEY`, manifest image paths under `public/`, and optional partial `dailyProfile` objects.
- Produces: optional `accentColors?: string[]`; `fillManifestDailyProfiles<T>(localItems, manifestItems): T[]`; placeholder-only manifest profiles.

- [ ] **Step 1: Write normalization and object-level hydration tests**

```ts
import { describe, expect, it } from 'vitest';
import { categoryDefaultProfile, fillManifestDailyProfiles } from '../itemProfile';
import type { DailySourceItem } from '../types';

const item = (dailyProfile?: DailySourceItem['dailyProfile']): DailySourceItem => ({
  id: 'one', name: 'Graphic Tee', category: 'T-Shirts', color: 'navy', brand: 'Nike', image: '/one.jpg', description: 'graphic', dailyProfile
});

describe('daily profile enrichment hydration', () => {
  it('trims accent colors to four plain non-empty names', () => {
    expect(categoryDefaultProfile(item({ accentColors: [' cream ', '', 'red', 'sky blue', 'black', 'fifth'] })).accentColors)
      .toEqual(['cream', 'red', 'sky blue', 'black']);
  });

  it('fills a missing local profile from the manifest', () => {
    const profile = { silhouette: 'relaxed' as const, source: 'ai-inferred' as const, confidence: 0.75, updatedAt: 1 };
    expect(fillManifestDailyProfiles([item()], [item(profile)])[0].dailyProfile).toEqual(profile);
  });

  it('never merges over an existing local profile object', () => {
    const local = item({ silhouette: 'slim', source: 'manual' });
    const manifest = item({ silhouette: 'relaxed', accentColors: ['cream'], source: 'ai-inferred' });
    expect(fillManifestDailyProfiles([local], [manifest])[0].dailyProfile).toEqual(local.dailyProfile);
  });
});
```

- [ ] **Step 2: Run the profile test and verify type/helper gaps fail**

Run: `npm test -- --run src/features/daily-outfits/__tests__/itemProfile.test.ts`

Expected: FAIL because `accentColors` and `fillManifestDailyProfiles` are not defined.

- [ ] **Step 3: Add `accentColors` and sanitize the override at snapshot-build time**

Add to `DailyRecommendationProfileV2`:

```ts
accentColors?: string[];
```

Add before the final return in `categoryDefaultProfile`:

```ts
const accentColors = Array.isArray(override.accentColors)
  ? override.accentColors
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(value => /^[a-z][a-z -]*$/i.test(value))
      .slice(0, 4)
  : undefined;
```

Add this property to the returned profile:

```ts
accentColors,
```

- [ ] **Step 4: Add a generic object-level manifest profile fill helper**

```ts
type ProfileHydratable = {
  id: string;
  dailyProfile?: Partial<DailyRecommendationProfileV2>;
};

export const fillManifestDailyProfiles = <T extends ProfileHydratable>(localItems: T[], manifestItems: T[]): T[] => {
  const manifestById = new Map(manifestItems.map(item => [item.id, item]));
  return localItems.map(item => {
    const manifest = manifestById.get(item.id);
    if (item.dailyProfile || !manifest?.dailyProfile) return item;
    return { ...item, dailyProfile: manifest.dailyProfile };
  });
};
```

- [ ] **Step 5: Apply profile fill in both localStorage hydration paths**

Import the helper:

```ts
import { fillManifestDailyProfiles } from './features/daily-outfits/itemProfile';
```

For garments, replace the manifest id set with a map and fill immediately after filtering:

```ts
const baseManifestById = new Map((closetData as ClosetItem[]).map(item => [item.id, item]));
localItems = localItems.filter(item => item.id.startsWith('user_') || baseManifestById.has(item.id));
localItems = fillManifestDailyProfiles(localItems, closetData as ClosetItem[]);
```

For sneakers, apply the same fill after the existing image/name/color/description map and before computing `localIds`:

```ts
localSneakers = fillManifestDailyProfiles(localSneakers, sneakerData as SneakerItem[]);
```

The existing `useEffect` persistence writes the adopted profile back to localStorage after initial render; do not add a second direct storage write.

- [ ] **Step 6: Create the structured-output enrichment script**

```js
// One-time placeholder-only dailyProfile enrichment for both wardrobe manifests.
// Set GEMINI_API_KEY in the environment, then run this script with [--dry-run] or [--force].
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTS = [path.join(ROOT, 'src/data/closet.json'), path.join(ROOT, 'src/data/sneakers.json')];
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODEL = 'gemini-3.5-flash';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(1);
}

const MIME_BY_EXT = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const PROFILE_FIELDS = ['silhouette', 'secondaryColorFamily', 'accentColors', 'patternIntensity', 'formality', 'warmth', 'breathability', 'windProtection'];
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    silhouette: { type: 'STRING', enum: ['slim', 'regular', 'relaxed', 'oversized', 'unknown'] },
    secondaryColorFamily: { type: 'STRING' },
    accentColors: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 4 },
    patternIntensity: { type: 'INTEGER', minimum: 0, maximum: 2 },
    formality: { type: 'INTEGER', minimum: 1, maximum: 5 },
    warmth: { type: 'INTEGER', minimum: 1, maximum: 5 },
    breathability: { type: 'INTEGER', minimum: 1, maximum: 5 },
    windProtection: { type: 'INTEGER', minimum: 0, maximum: 2 },
    rainSafety: { type: 'STRING', enum: ['poor', 'acceptable', 'good', 'unknown'] }
  },
  required: ['silhouette', 'secondaryColorFamily', 'accentColors', 'patternIntensity', 'formality', 'warmth', 'breathability', 'windProtection', 'rainSafety'],
  propertyOrdering: ['silhouette', 'secondaryColorFamily', 'accentColors', 'patternIntensity', 'formality', 'warmth', 'breathability', 'windProtection', 'rainSafety']
};

const imagePart = async publicPath => {
  const relative = publicPath.replace(/^\/+/, '');
  const mimeType = MIME_BY_EXT[path.extname(relative).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image extension: ${publicPath}`);
  return { inlineData: { mimeType, data: (await readFile(path.join(PUBLIC_DIR, relative))).toString('base64') } };
};

const promptFor = item => [
  'Infer recommendation metadata only from the supplied wardrobe photographs.',
  `Item: ${item.brand || 'Unknown brand'} ${item.name}; category=${item.category}; listed color=${item.color || 'unknown'}.`,
  'accentColors must contain zero to four plain visible color names for secondary trim or graphics.',
  'Use the numeric scales exactly: warmth/breathability/formality 1–5, windProtection 0–2, patternIntensity 0–2.',
  item.category === 'Sneakers' ? 'Judge rainSafety from visible materials: sealed leather is safer; knit, canvas, and suede are poor.' : 'Return rainSafety as unknown for non-shoes.',
  'Return only the structured profile.'
].join('\n');

const callGemini = async parts => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA } });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (response.ok) {
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return JSON.parse(text);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      continue;
    }
    let detail = `HTTP ${response.status}`;
    try { detail = (await response.json())?.error?.message ?? detail; } catch { detail = `HTTP ${response.status}`; }
    throw new Error(`Gemini request failed: ${detail}`);
  }
  throw new Error('Gemini retry loop exited unexpectedly');
};

const manifests = await Promise.all(MANIFESTS.map(async file => ({ file, items: JSON.parse(await readFile(file, 'utf8')) })));
const targets = manifests.flatMap(manifest => manifest.items.map(item => ({ manifest, item }))).filter(({ item }) => {
  const fields = item.category === 'Sneakers' ? [...PROFILE_FIELDS, 'rainSafety'] : PROFILE_FIELDS;
  return FORCE || fields.some(field => !Object.prototype.hasOwnProperty.call(item.dailyProfile ?? {}, field));
});
console.log(`${manifests.reduce((sum, manifest) => sum + manifest.items.length, 0)} items in manifests; ${targets.length} to enrich${DRY_RUN ? ' (dry run)' : ''}.`);

let enriched = 0;
let failed = 0;
for (const { item } of targets) {
  process.stdout.write(`${item.id} … `);
  try {
    const parts = [{ text: promptFor(item) }, await imagePart(item.image)];
    if (item.imageTop) parts.push(await imagePart(item.imageTop));
    const result = await callGemini(parts);
    const profile = { ...(item.dailyProfile ?? {}) };
    const fields = item.category === 'Sneakers' ? [...PROFILE_FIELDS, 'rainSafety'] : PROFILE_FIELDS;
    let changed = false;
    fields.forEach(field => {
      if (FORCE || !Object.prototype.hasOwnProperty.call(profile, field)) {
        profile[field] = result[field];
        changed = true;
      }
    });
    if (changed) {
      if (FORCE || !profile.source) profile.source = 'ai-inferred';
      if (FORCE || typeof profile.confidence !== 'number') profile.confidence = 0.75;
      profile.updatedAt = Date.now();
      item.dailyProfile = profile;
      enriched += 1;
    }
    console.log(`${profile.silhouette} | ${profile.secondaryColorFamily} | ${(profile.accentColors || []).join(', ')}`);
  } catch (error) {
    failed += 1;
    console.log(`FAILED: ${error.message}`);
  }
  await new Promise(resolve => setTimeout(resolve, 300));
}

if (!DRY_RUN) {
  await Promise.all(manifests.map(manifest => writeFile(manifest.file, `${JSON.stringify(manifest.items, null, 2)}\n`)));
}
console.log(`Done: ${enriched} enriched, ${failed} failed${DRY_RUN ? ', nothing written' : ''}.`);
```

- [ ] **Step 7: Run local code gates before making external enrichment calls**

Run: `node --check scripts/enrich_daily_profiles.mjs && npm test -- --run src/features/daily-outfits/__tests__/itemProfile.test.ts && npm run build && npm run lint`

Expected: all commands exit `0`.

- [ ] **Step 8: Preview all 116 current placeholder profiles and inspect the output**

Run: `node scripts/enrich_daily_profiles.mjs --dry-run`

Precondition: `GEMINI_API_KEY` is already present in the executor's environment.

Expected first line: `116 items in manifests; 116 to enrich (dry run).` Expected final line: `Done: 116 enriched, 0 failed, nothing written.` Check that non-shoes report `rainSafety: unknown`, accents contain at most four plain color names, and numeric values remain inside their schema bounds.

- [ ] **Step 9: Generate and mechanically validate the manifest profiles**

Run: `node scripts/enrich_daily_profiles.mjs`

Expected final line: `Done: 116 enriched, 0 failed.`

Run:

```bash
node -e "const fs=require('fs');const files=['src/data/closet.json','src/data/sneakers.json'];const items=files.flatMap(f=>JSON.parse(fs.readFileSync(f)));if(items.length!==116||items.some(x=>!x.dailyProfile||x.dailyProfile.source!=='ai-inferred'||x.dailyProfile.confidence!==0.75||(x.dailyProfile.accentColors||[]).length>4))process.exit(1);console.log('validated 116 daily profiles')"
```

Expected: `validated 116 daily profiles`.

- [ ] **Step 10: Review every generated manifest diff against its photograph and commit profiles separately**

Run: `git diff -- src/data/closet.json src/data/sneakers.json`

Accept a profile only when silhouette, secondary color, accents, pattern, formality, warmth, breathability, wind protection, and shoe rain safety are visually defensible. Correct a wrong generated value directly in the JSON while preserving `source: "ai-inferred"`, `confidence: 0.75`, and the generated timestamp.

Run: `npm test && npm run build && npm run lint`

Expected: all commands exit `0` after the reviewed data changes.

- [ ] **Step 11: Commit code and reviewed profile data**

```bash
git add scripts/enrich_daily_profiles.mjs src/features/daily-outfits/types.ts src/features/daily-outfits/itemProfile.ts src/App.tsx src/features/daily-outfits/__tests__/itemProfile.test.ts
git commit -m "feat: support enriched daily profiles"
git add src/data/closet.json src/data/sneakers.json
git commit -m "data: enrich wardrobe daily profiles"
```

### Task 11: Replace permanent near-copy bans with manual exact-core blocking and critic context

**Files:**
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts:57-66`
- Modify: `src/features/daily-outfits/__tests__/selectionContracts.test.ts`
- Modify: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Taste.gs:1-46`
- Modify: `apps-script/daily-outfits-v2/ItemIndex.gs`
- Modify: `apps-script/daily-outfits-v2/PlannerValidation.gs:36-37`
- Modify: `apps-script/daily-outfits-v2/Selection.gs`
- Modify: `apps-script/daily-outfits-v2/FinalValidation.gs`
- Modify: `apps-script/daily-outfits-v2/Planner.gs:39-46`
- Modify: `apps-script/daily-outfits-v2/Critic.gs`

**Interfaces:**
- Consumes: snapshot `tasteExamples`, `source?: 'ai'`, and real candidate core ids.
- Produces: `tasteEvidenceV2_(snapshot)`, `manualCoreTriosV2_(snapshot)`, `savedOutfitExactCopyV2_(itemIds, snapshot)`, and `sharedTwoCoreSavedOutfitsV2_(itemIds, snapshot)`.

- [ ] **Step 1: Rewrite the saved-outfit contract test to express the new policy**

```ts
it('blocks exact manual core trios but permits transformed and AI-sourced saves', () => {
  const valid = { archetype: 'easy', candidates: Array.from({ length: 5 }, (_, index) => candidate(index)) };
  const twoOfThree = structuredClone(valid);
  twoOfThree.candidates[0] = { ...twoOfThree.candidates[0], topId: 'top', bottomId: 'bottom', itemIds: ['top', 'bottom', 'shoe-0'] };
  expect(plannerValidator(twoOfThree, 'easy', snapshot)).toEqual([]);

  const exactManual = structuredClone(valid);
  exactManual.candidates[0] = { ...exactManual.candidates[0], topId: 'top', bottomId: 'bottom', shoeId: 'shoe', itemIds: ['top', 'bottom', 'shoe'] };
  expect(plannerValidator(exactManual, 'easy', snapshot).join(' ')).toMatch(/exactly copies manual saved outfit/);

  const aiSnapshot = { ...snapshot, tasteExamples: [{ id: 'ai-1', name: 'AI Save', itemIds: ['top', 'bottom', 'shoe'], createdAt: 1, source: 'ai' }] };
  expect(plannerValidator(exactManual, 'easy', aiSnapshot)).toEqual([]);
});
```

Add this boundary assertion:

```ts
it('emits two-core overlap names as critic context without long item ids', () => {
  const modelFacingCandidateV2_ = evaluateAppsScript<(candidate: object, snapshot: object) => Record<string, unknown>>(
    ['ItemIndex.gs', 'Taste.gs'], 'modelFacingCandidateV2_', { console }
  );
  const contextSnapshot = {
    ...snapshot,
    tasteExamples: [{ id: 'saved', name: 'Saved Look', itemIds: ['top-long-id', 'bottom-long-id', 'user_sneaker_1783863184667'], createdAt: 1 }],
    items: snapshot.items.concat([
      { id: 'top-long-id', shortLabel: 'T001', slot: 'top' },
      { id: 'bottom-long-id', shortLabel: 'B001', slot: 'bottom' }
    ])
  };
  const view = modelFacingCandidateV2_({ candidateId: 'c1', topId: 'top-long-id', bottomId: 'bottom-long-id', shoeId: 'other', itemIds: ['top-long-id', 'bottom-long-id', 'other'] }, contextSnapshot);
  expect(view.sharesTwoCoreWith).toEqual(['Saved Look']);
  expect(JSON.stringify(view)).not.toContain('top-long-id');
});
```

- [ ] **Step 2: Run affected tests and verify the old two-of-three ban fails the new contract**

Run: `npm test -- --run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/selectionContracts.test.ts`

Expected: FAIL because two-of-three overlap still blocks and no critic context is emitted.

- [ ] **Step 3: Split taste evidence from manual blocking signatures**

```js
function tasteEvidenceV2_(snapshot) {
  return (snapshot.tasteExamples || []).filter(function(outfit) {
    return outfit.seedStylist !== false;
  }).map(function(outfit) {
    return {
      id: outfit.id,
      name: outfit.name,
      source: outfit.source || 'manual',
      weight: outfit.source === 'ai' ? 0.3 : 1,
      itemIds: (outfit.itemIds || []).slice(),
      coreItemIds: coreTasteItemIdsV2_(outfit.itemIds, snapshot),
      note: outfit.note || null
    };
  }).filter(function(outfit) { return outfit.coreItemIds.length >= 2; });
}

function manualCoreTriosV2_(snapshot) {
  return (snapshot.tasteExamples || []).filter(function(outfit) {
    return outfit.source !== 'ai';
  }).map(function(outfit) {
    return {
      id: outfit.id,
      name: outfit.name,
      source: 'manual',
      itemIds: (outfit.itemIds || []).slice(),
      coreItemIds: coreTasteItemIdsV2_(outfit.itemIds, snapshot)
    };
  }).filter(function(outfit) { return outfit.coreItemIds.length === 3; });
}

function savedOutfitExactCopyV2_(itemIds, snapshot) {
  var coreIds = coreTasteItemIdsV2_(itemIds, snapshot);
  return manualCoreTriosV2_(snapshot).find(function(saved) {
    return saved.coreItemIds.every(function(id) { return coreIds.indexOf(id) >= 0; });
  }) || null;
}

function sharedTwoCoreSavedOutfitsV2_(itemIds, snapshot) {
  var coreIds = coreTasteItemIdsV2_(itemIds, snapshot);
  return tasteEvidenceV2_(snapshot).filter(function(saved) {
    return coreIds.filter(function(id) { return saved.coreItemIds.indexOf(id) >= 0; }).length === 2;
  });
}
```

Change `buildTasteSummaryV2_` to iterate `tasteEvidenceV2_(snapshot)`. Remove `savedTasteSignaturesV2_` and `savedOutfitNearCopyV2_` after all callers below are migrated.

- [ ] **Step 4: Use exact manual copies in all three deterministic blocking layers**

Planner validation:

```js
var exactCopy = savedOutfitExactCopyV2_(coreIds, snapshot);
if (exactCopy) errors.push(path + ' exactly copies manual saved outfit "' + exactCopy.name + '"');
```

Candidate eligibility:

```js
if (savedOutfitExactCopyV2_(candidate.itemIds || [], snapshot)) errors.push('exact manual saved-outfit copy');
```

Final validation:

```js
var savedExactCopy = savedOutfitExactCopyV2_(rec.itemIds || [], snapshot);
if (savedExactCopy) errors.push(path + ' exactly copies manual saved outfit "' + savedExactCopy.name + '"');
```

- [ ] **Step 5: Add two-core overlap names only to model-facing candidate context**

At the end of `modelFacingCandidateV2_`, add:

```js
view.sharesTwoCoreWith = sharedTwoCoreSavedOutfitsV2_(candidate.itemIds || [], snapshot).map(function(outfit) { return outfit.name; });
```

This field contains names only and does not change candidate eligibility.

- [ ] **Step 6: Change planner and critic policy language to match the deterministic rule**

Planner:

```js
'Saved outfits are style-grammar examples, never unlabeled templates. Never reproduce the exact core trio of a saved outfit. Sharing two core pieces is acceptable only when the third piece meaningfully changes the look.'
```

Critic disqualification sentence:

```js
'Penalize weather risk heavily and disqualify clear weather mismatch, obvious color conflict, incoherent formality, uncertain item identification, an exact recent repeat, an exact manual saved-outfit core trio, or material duplication of a stronger candidate.'
```

Keep the Task 5 freshness anchor unchanged so `sharesTwoCoreWith` has an explicit score consequence rather than a hard block.

- [ ] **Step 7: Run all policy and prompt gates**

Run: `npm test -- --run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/selectionContracts.test.ts && ! rg -n "savedOutfitNearCopyV2_|savedTasteSignaturesV2_" apps-script/daily-outfits-v2`

Expected: PASS; manual exact copies fail, two-of-three transformations pass, AI exact saves pass, and the removed function names have no matches.

- [ ] **Step 8: Commit the saved-outfit policy gate**

```bash
git add apps-script/daily-outfits-v2/Taste.gs apps-script/daily-outfits-v2/ItemIndex.gs apps-script/daily-outfits-v2/PlannerValidation.gs apps-script/daily-outfits-v2/Selection.gs apps-script/daily-outfits-v2/FinalValidation.gs apps-script/daily-outfits-v2/Planner.gs apps-script/daily-outfits-v2/Critic.gs src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
git commit -m "feat: refine saved outfit copy policy"
```

### Task 12: Add pure deterministic Encore selection and history persistence

**Files:**
- Create: `apps-script/daily-outfits-v2/Encore.gs`
- Create: `src/features/daily-outfits/__tests__/encoreContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/JobState.gs:22-52`
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs`
- Modify: `src/features/daily-outfits/types.ts:140-150`

**Interfaces:**
- Consumes: manual snapshot taste examples, full weather safety checks, retained history, and script property `LAST_ENCORE_DATE_V2`.
- Produces: `selectEncoreV2_(snapshot, weather, history, lastEncoreDate): object | null`, wrapper `selectEncoreForBundleV2_`, optional `bundle.encore`, and history `entry.encore`.

- [ ] **Step 1: Write one falsification table for every Encore clause and a deterministic-choice test**

```ts
import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const items = [
  { id: 'top', slot: 'top', profile: { available: true, excludedFromDaily: false, warmth: 2 } },
  { id: 'bottom', slot: 'bottom', category: 'Pants', profile: { available: true, excludedFromDaily: false } },
  { id: 'shoe', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'good' } },
  { id: 'top-2', slot: 'top', profile: { available: true, excludedFromDaily: false, warmth: 2 } },
  { id: 'bottom-2', slot: 'bottom', category: 'Pants', profile: { available: true, excludedFromDaily: false } },
  { id: 'shoe-2', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'good' } },
  { id: 'unsafe', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'poor' } }
];
const saved = (id: string, createdAt: number, itemIds = ['top', 'bottom', 'shoe'], source?: 'ai') => ({ id, name: id, itemIds, createdAt, source });
const snapshot = { settings: { timezone: 'America/New_York' }, items, tasteExamples: [saved('older', 1), saved('newer', 2, ['top-2', 'bottom-2', 'shoe-2'])] };
const weather = { localDate: '2026-07-14', rainExpected: false, morningFeelsLikeF: 60, eveningFeelsLikeF: 60, middayFeelsLikeF: 70 };
const selectEncoreV2_ = evaluateAppsScript<(snapshot: object, weather: object, history: object[], lastEncoreDate: string | null) => Record<string, unknown> | null>(
  ['Taste.gs', 'FinalValidation.gs', 'Encore.gs'], 'selectEncoreV2_',
  {
    DAILY_V2: { ARCHETYPES: ['easy', 'polished-casual', 'expressive'], REQUIRED_SLOTS: ['top', 'bottom', 'shoes'] },
    itemMapV2_: (value: { items: Array<{ id: string }> }) => Object.fromEntries(value.items.map(item => [item.id, item])),
    Utilities: { parseDate: (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`) },
    console
  }
);

describe('Encore selection', () => {
  it('chooses the oldest never-surfaced manual save deterministically', () => {
    expect(selectEncoreV2_(snapshot, weather, [], null)).toEqual(expect.objectContaining({ outfitId: 'older', candidateId: 'encore:older' }));
  });

  it.each([
    ['AI source', { ...snapshot, tasteExamples: [saved('ai', 1, ['top', 'bottom', 'shoe'], 'ai')] }, weather, [], null],
    ['missing item', { ...snapshot, tasteExamples: [saved('missing', 1, ['top', 'bottom', 'absent'])] }, weather, [], null],
    ['weather unsafe', { ...snapshot, tasteExamples: [saved('wet', 1, ['top', 'bottom', 'unsafe'])] }, { ...weather, rainExpected: true }, [], null],
    ['recent core trio', { ...snapshot, tasteExamples: [saved('older', 1)] }, weather, [{ localDate: '2026-07-10', recommendations: [{ candidateId: 'past', itemIds: ['top', 'bottom', 'shoe'] }] }], null],
    ['disliked encore', snapshot, weather, [{ localDate: '2026-06-01', feedback: [{ candidateId: 'encore:older', value: 'disliked' }, { candidateId: 'encore:newer', value: 'disliked' }] }], null],
    ['seven-day cadence', snapshot, weather, [], '2026-07-08']
  ])('returns null when %s fails', (_name, candidateSnapshot, candidateWeather, history, lastEncoreDate) => {
    expect(selectEncoreV2_(candidateSnapshot, candidateWeather, history, lastEncoreDate)).toBeNull();
  });

  it('permits the exact seven-day cadence boundary', () => {
    expect(selectEncoreV2_(snapshot, weather, [], '2026-07-07')).toEqual(expect.objectContaining({ outfitId: 'older' }));
  });

  it('chooses the longest-ago surface when every option was surfaced more than 30 days ago', () => {
    const history = [
      { localDate: '2026-05-20', encore: { outfitId: 'older', candidateId: 'encore:older', itemIds: ['top', 'bottom', 'shoe'] } },
      { localDate: '2026-05-30', encore: { outfitId: 'newer', candidateId: 'encore:newer', itemIds: ['top-2', 'bottom-2', 'shoe-2'] } }
    ];
    expect(selectEncoreV2_(snapshot, weather, history, null)).toEqual(expect.objectContaining({ outfitId: 'older' }));
  });
});
```

- [ ] **Step 2: Run the focused test and verify `Encore.gs` is missing**

Run: `npm test -- --run src/features/daily-outfits/__tests__/encoreContracts.test.ts`

Expected: FAIL because the Encore selector does not exist.

- [ ] **Step 3: Implement pure cadence, eligibility, prior-core, dislike, and deterministic-choice helpers**

```js
function encoreDayDistanceV2_(fromDate, toDate, timezone) {
  if (!fromDate) return Infinity;
  var from = Utilities.parseDate(fromDate + ' 12:00', timezone, 'yyyy-MM-dd HH:mm');
  var to = Utilities.parseDate(toDate + ' 12:00', timezone, 'yyyy-MM-dd HH:mm');
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function encoreCoreKeyV2_(itemIds, snapshot) {
  return coreTasteItemIdsV2_(itemIds, snapshot).slice().sort().join('|');
}

function encoreLastSurfacedDateV2_(outfitId, history) {
  var dates = history.filter(function(entry) {
    return entry.encore && (entry.encore.outfitId === outfitId || entry.encore.candidateId === 'encore:' + outfitId);
  }).map(function(entry) { return entry.localDate; }).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function selectEncoreV2_(snapshot, weather, history, lastEncoreDate) {
  var timezone = (snapshot.settings && snapshot.settings.timezone) || 'America/New_York';
  if (encoreDayDistanceV2_(lastEncoreDate, weather.localDate, timezone) < 7) return null;
  var items = itemMapV2_(snapshot);
  var retained = history || [];
  var recent = retained.filter(function(entry) {
    var age = encoreDayDistanceV2_(entry.localDate, weather.localDate, timezone);
    return age >= 0 && age <= 30;
  });
  var recentCoreKeys = {};
  recent.forEach(function(entry) {
    historyLooksV2_(entry).forEach(function(look) { recentCoreKeys[encoreCoreKeyV2_(look.itemIds || [], snapshot)] = true; });
  });
  var eligible = (snapshot.tasteExamples || []).filter(function(outfit) {
    if (outfit.source === 'ai') return false;
    var coreIds = coreTasteItemIdsV2_(outfit.itemIds, snapshot);
    if (coreIds.length !== 3) return false;
    var selected = (outfit.itemIds || []).map(function(id) { return items[id]; });
    if (selected.some(function(item) { return !item || !item.profile.available || item.profile.excludedFromDaily; })) return false;
    if (weatherSafetyErrorsV2_({ itemIds: outfit.itemIds }, items, weather, snapshot).length) return false;
    if (recentCoreKeys[encoreCoreKeyV2_(outfit.itemIds, snapshot)]) return false;
    var disliked = retained.some(function(entry) {
      return (entry.feedback || []).some(function(signal) { return signal.candidateId === 'encore:' + outfit.id && signal.value === 'disliked'; });
    });
    return !disliked;
  }).map(function(outfit) {
    return { outfit: outfit, lastSurfaced: encoreLastSurfacedDateV2_(outfit.id, retained) };
  });
  eligible.sort(function(a, b) {
    if (a.lastSurfaced === null && b.lastSurfaced !== null) return -1;
    if (a.lastSurfaced !== null && b.lastSurfaced === null) return 1;
    if (a.lastSurfaced !== b.lastSurfaced) return String(a.lastSurfaced).localeCompare(String(b.lastSurfaced));
    if (a.outfit.createdAt !== b.outfit.createdAt) return a.outfit.createdAt - b.outfit.createdAt;
    return a.outfit.id.localeCompare(b.outfit.id);
  });
  if (!eligible.length) return null;
  var chosen = eligible[0].outfit;
  return { outfitId: chosen.id, name: chosen.name, itemIds: chosen.itemIds.slice(), candidateId: 'encore:' + chosen.id };
}

function selectEncoreForBundleV2_(snapshot, weather, history) {
  return selectEncoreV2_(snapshot, weather, history, getDailyPropertiesV2_().getProperty('LAST_ENCORE_DATE_V2'));
}
```

- [ ] **Step 4: Add Encore to the bundle type and assembly without changing the generated trio**

```ts
export interface DailyEncoreV2 {
  outfitId: string;
  name: string;
  itemIds: string[];
  candidateId: string;
}
```

Add to `DailyBundleV2`:

```ts
encore?: DailyEncoreV2;
```

Change bundle assembly to accept history and attach only when selected:

```js
function buildBundleV2_(curated, snapshot, weather, history) {
  var bundle = {
    version: 2,
    qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION,
    localDate: weather.localDate,
    weather: weather,
    recommendations: curated.recommendations,
    generatedAt: Date.now(),
    snapshotGeneratedAt: snapshot.generatedAt,
    wardrobeFingerprint: snapshot.wardrobeFingerprint,
    modelRunId: newRunIdV2_()
  };
  var encore = selectEncoreForBundleV2_(snapshot, weather, history);
  if (encore) bundle.encore = encore;
  return bundle;
}
```

Use the already-built history object at all three call sites:

```js
bundle: buildBundleV2_(curated, snapshot, weather, history)
```

```js
pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather, pending.history);
```

The second line is the exact replacement in both the manual-step and scheduled `selection-ready` branches.

- [ ] **Step 5: Persist sent Encore and advance cadence only after a successful send**

Add to the history entry:

```js
encore: bundle.encore || null,
```

After `saveHistoryV2_`, add:

```js
if (bundle.encore) getDailyPropertiesV2_().setProperty('LAST_ENCORE_DATE_V2', bundle.localDate);
```

Do not set the property during bundle generation or test email rendering; failed/unsent bundles do not consume cadence.

- [ ] **Step 6: Run Encore, history, build, and lint gates**

Run: `npm test -- --run src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/historyContracts.test.ts && npm run build && npm run lint`

Expected: all commands exit `0`; the six falsification cases return `null`, the exact seven-day boundary passes, and generated recommendations remain a three-entry tuple.

- [ ] **Step 7: Commit the Encore domain gate**

```bash
git add apps-script/daily-outfits-v2/Encore.gs apps-script/daily-outfits-v2/JobState.gs apps-script/daily-outfits-v2/Scheduler.gs src/features/daily-outfits/types.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts
git commit -m "feat: add deterministic saved outfit encore"
```

### Task 13: Render Encore in email and React preview with standard feedback controls

**Files:**
- Create: `src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx`
- Modify: `src/features/daily-outfits/__tests__/encoreContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Email.gs:15-51`
- Modify: `src/features/daily-outfits/DailyFeedbackControls.tsx:1-18`
- Modify: `src/features/daily-outfits/DailyBundlePreview.tsx:1-49`
- Modify: `src/features/daily-outfits/daily-outfits.css:23-28`

**Interfaces:**
- Consumes: optional `DailyBundleV2.encore` from Task 12 and existing feedback persistence keyed by `{localDate, candidateId}`.
- Produces: HTML/plain-text kicker `ENCORE — FROM YOUR SAVED OUTFITS`; React preview with `candidateId = encore:<outfitId>` feedback.

- [ ] **Step 1: Add an Apps Script email-rendering assertion to the Encore contract file**

```ts
it('renders a distinct Encore in HTML and plain text', () => {
  const render = evaluateAppsScript<(bundle: object, snapshot: object, testMode: boolean) => { html: string; plain: string; inlineImages: Record<string, unknown> }>(
    ['ItemIndex.gs', 'Email.gs'], 'renderDailyEmailV2_',
    {
      Utilities: {
        newBlob: () => ({}),
        base64Decode: () => [],
        formatDate: () => 'Tuesday, July 14'
      },
      getDailyConfigV2_: () => ({ appUrl: '' }),
      console
    }
  );
  const emailSnapshot = {
    items: [
      { id: 'top', slot: 'top', name: 'ACG Tee', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
      { id: 'bottom', slot: 'bottom', name: 'Double Knee', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
      { id: 'shoe', slot: 'shoes', name: 'Mocha', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' }
    ]
  };
  const rendered = render({
    localDate: '2026-07-14',
    weather: { locationLabel: 'Brooklyn, NY', timezone: 'America/New_York', morningFeelsLikeF: 70, highTemperatureF: 82, maxRainProbability: 0, plainEnglishSummary: 'Light pieces.', windy: false },
    recommendations: [],
    encore: { outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: ['top', 'bottom', 'shoe'] }
  }, emailSnapshot, true);
  expect(rendered.html).toContain('ENCORE — FROM YOUR SAVED OUTFITS');
  expect(rendered.html).toContain('Saved One');
  expect(rendered.plain).toContain("One of yours, back in rotation for today's weather.");
  expect(Object.keys(rendered.inlineImages)).toEqual(['encoreitem0', 'encoreitem1', 'encoreitem2']);
});
```

- [ ] **Step 2: Write a server-rendered React preview test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DailyBundlePreview from '../DailyBundlePreview';
import type { DailyBundleV2, DailySourceItem } from '../types';

const items: DailySourceItem[] = ['top', 'bottom', 'shoe'].map(id => ({
  id, name: id, category: id === 'shoe' ? 'Sneakers' : id === 'bottom' ? 'Pants' : 'T-Shirts', color: 'navy', brand: 'Test', image: `/${id}.jpg`, description: ''
}));

describe('DailyBundlePreview Encore', () => {
  it('shows the honest label, static copy, items, and Encore feedback identity', () => {
    const bundle = {
      localDate: '2026-07-14', recommendations: [],
      weather: { morningFeelsLikeF: 70, highTemperatureF: 82, maxRainProbability: 0, plainEnglishSummary: 'Light pieces.' },
      encore: { outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: ['top', 'bottom', 'shoe'] }
    } as unknown as DailyBundleV2;
    const html = renderToStaticMarkup(<DailyBundlePreview bundle={bundle} items={items} feedback={[]} onFeedback={() => undefined} />);
    expect(html).toContain('Encore — from your saved outfits');
    expect(html).toContain('Saved One');
    expect(html).toContain("One of yours, back in rotation for today&#x27;s weather.");
    expect(html).toContain('Feedback for Saved One');
  });
});
```

- [ ] **Step 3: Run both rendering tests and verify Encore is absent**

Run: `npm test -- --run src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx`

Expected: FAIL because neither rendering path reads `bundle.encore`.

- [ ] **Step 4: Generalize feedback controls to the common identity/name shape**

```ts
import type { DailyFeedbackV2, DailyFinalRecommendationV2 } from './types';

type DailyFeedbackTarget = Pick<DailyFinalRecommendationV2, 'candidateId' | 'name'>;

interface Props {
  localDate: string;
  recommendation: DailyFeedbackTarget;
  feedback?: DailyFeedbackV2;
  onChange: (feedback: DailyFeedbackV2) => void;
}
```

The component body remains unchanged because it uses only `candidateId` and `name`.

- [ ] **Step 5: Append one static Encore section after the three React looks**

Immediately after the `.daily-looks` div, add:

```tsx
{bundle.encore && (() => {
  const encoreItems = bundle.encore.itemIds.map(id => byId.get(id)).filter((item): item is DailySourceItem => Boolean(item));
  const selectedFeedback = feedback.find(entry => entry.localDate === bundle.localDate && entry.candidateId === bundle.encore!.candidateId);
  return (
    <article className="daily-encore">
      <div className="daily-look-label">Encore — from your saved outfits</div>
      <h4>{bundle.encore.name}</h4>
      <div className="daily-look-images">
        {encoreItems.map(item => <img key={item.id} src={item.image} alt={item.name} />)}
      </div>
      <p>One of yours, back in rotation for today's weather.</p>
      <ul>{encoreItems.map(item => <li key={item.id}>{item.name}</li>)}</ul>
      <DailyFeedbackControls localDate={bundle.localDate} recommendation={bundle.encore} feedback={selectedFeedback} onChange={onFeedback} />
    </article>
  );
})()}
```

- [ ] **Step 6: Add a visually distinct but system-consistent Encore style**

```css
.daily-encore { margin-top: 34px; padding: 28px; border: 1px solid #9b8f73; background: #ece7da; }
.daily-encore h4 { margin: 8px 0 16px; font-size: 1.35rem; font-weight: 400; }
.daily-encore .daily-look-images { width: min(100%, 420px); }
.daily-encore > p { margin-top: 16px; font-size: .78rem; line-height: 1.6; }
.daily-encore ul { list-style: none; margin-top: 14px; font-size: .68rem; color: #77746a; line-height: 1.7; }
```

- [ ] **Step 7: Add one HTML/plain-text Encore renderer after generated recommendation sections**

```js
function renderEncoreEmailV2_(bundle, snapshot, plain, inlineImages) {
  if (!bundle.encore) return '';
  var items = itemMapV2_(snapshot);
  var pieces = bundle.encore.itemIds.map(function(id) { return items[id]; }).filter(Boolean);
  var images = pieces.map(function(item, index) {
    var key = 'encoreitem' + index;
    inlineImages[key] = dataUrlBlobV2_(item.thumbnailDataUrl, key + '.jpg');
    return '<td style="width:25%;padding:6px;background:#f4f3ef"><img src="cid:' + key + '" alt="' + escapeHtmlV2_(item.name) + '" style="display:block;width:100%;height:auto"></td>';
  }).join('');
  while ((images.match(/<td/g) || []).length < 4) images += '<td style="width:25%;padding:6px;background:#f4f3ef"></td>';
  plain.push('ENCORE — FROM YOUR SAVED OUTFITS', bundle.encore.name, "One of yours, back in rotation for today's weather.");
  pieces.forEach(function(item) { plain.push(item.slot.toUpperCase() + ' — ' + item.name); });
  plain.push('');
  return '<section style="margin-top:24px;padding:28px;border:1px solid #9b8f73;background:#ece7da">' +
    '<div style="font:600 10px monospace;letter-spacing:2px;color:#665d49">ENCORE — FROM YOUR SAVED OUTFITS</div>' +
    '<h2 style="margin:8px 0 18px;font:400 28px Arial,sans-serif;color:#111">' + escapeHtmlV2_(bundle.encore.name) + '</h2>' +
    '<table role="presentation" cellpadding="0" cellspacing="4" style="width:100%;table-layout:fixed"><tr>' + images + '</tr></table>' +
    '<p style="margin:20px 0 8px;font:400 15px/1.6 Arial,sans-serif;color:#222">One of yours, back in rotation for today\'s weather.</p>' +
    '<p style="margin:0;font:400 12px/1.7 monospace;color:#777">' + pieces.map(function(item) { return escapeHtmlV2_(item.slot.toUpperCase() + ' — ' + item.name); }).join('<br>') + '</p>' +
    '</section>';
}
```

In `renderDailyEmailV2_`, after building `sections`, compute:

```js
var encoreSection = renderEncoreEmailV2_(bundle, snapshot, plain, inlineImages);
```

Append `encoreSection` immediately after `sections` in the HTML body.

- [ ] **Step 8: Run rendering, type, lint, and full test gates**

Run: `npm test -- --run src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx && npm test && npm run build && npm run lint`

Expected: all commands exit `0`; both HTML surfaces contain the Encore kicker and static copy, while a bundle without `encore` renders exactly the existing three-look structure.

- [ ] **Step 9: Commit the Encore presentation gate**

```bash
git add apps-script/daily-outfits-v2/Email.gs src/features/daily-outfits/DailyFeedbackControls.tsx src/features/daily-outfits/DailyBundlePreview.tsx src/features/daily-outfits/daily-outfits.css src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx
git commit -m "feat: render saved outfit encore"
```

### Task 14: Document deployment and complete end-to-end shadow verification

**Files:**
- Modify: `apps-script/daily-outfits-v2/README.md:5-38`

**Interfaces:**
- Consumes: complete policy-v3 code, reviewed enriched manifests, Apps Script deployment, synchronized browser snapshot, and `SHADOW_MODE=true`.
- Produces: deployment runbook and verified shadow bundle/email/diagnostics behavior.

- [ ] **Step 1: Add enrichment and policy-v3 rollout instructions to the sidecar README**

```markdown
## Profile enrichment before policy-v3 rollout

1. Run `node scripts/enrich_daily_profiles.mjs --dry-run` with `GEMINI_API_KEY` in the environment.
2. Run `node scripts/enrich_daily_profiles.mjs`, review every `src/data/closet.json` and `src/data/sneakers.json` profile against its image, and commit the reviewed manifests.
3. In **Wardrobe → Daily email**, run **Build visual inventory**, **Sync now**, then **Validate server snapshot**. Profile data participates in `wardrobeFingerprint`, so the sync intentionally invalidates stale pending/job state.

## Policy-v3 shadow rollout

Set `SHADOW_MODE=true` and keep automatic delivery disabled for 3–5 mornings after deploying every `.gs` file, including `Selection.gs` and `Encore.gs`.

- `getDailyOutfitDiagnosticsV2()` must show `selection.path`, `eligibleCountByArchetype`, `feasibleSetCount`, and per-stage `attemptCounts`.
- Review critic score distributions for clustering at exactly `8.0` and `7.5`.
- Record how often selection uses `top2`, `top3`, `replan-1`, or `replan-2`.
- Confirm the job fails closed without sending when two targeted re-plan rounds cannot produce a feasible set.
- Enable delivery only after the generated trio, copy, email layout, and optional Encore pass review across the shadow window.
```

Change the existing seven-morning paragraph to the 3–5 morning policy above. Document `LAST_ENCORE_DATE_V2` as a script-managed property beside `LAST_SENT_DATE_V2`.

- [ ] **Step 2: Run the complete local verification suite from a clean command invocation**

Run:

```bash
npm test
npm run build
npm run lint
node --check scripts/enrich_daily_profiles.mjs
```

Expected: every command exits `0`. Vitest covers transport salvage, weather fallback, feedback resolution, label hygiene, selection, cooldown, near-copy policy, comfort bands, Encore, and React rendering.

- [ ] **Step 3: Run static policy scans**

Run:

```bash
! rg -n "criticSummary|savedOutfitNearCopyV2_|savedTasteSignaturesV2_|JSON\.stringify\(weather\)" apps-script/daily-outfits-v2 src
rg -n "QUALITY_POLICY_VERSION:\s*3|selection-ready|LAST_ENCORE_DATE_V2|modelWeatherViewV2_|resolveLabelsV2_" apps-script/daily-outfits-v2
```

Expected: the negative scan exits `0` with no matches; the positive scan finds policy version 3, selection stage transitions, Encore cadence, compact weather, and label translation.

- [ ] **Step 4: Deploy all sidecar sources and refresh the synchronized snapshot**

Copy or push every file in `apps-script/daily-outfits-v2/` to the standalone Apps Script project. In the React app, run these actions in order:

1. **Build visual inventory** — expected status contains `116 items` and a new wardrobe fingerprint.
2. **Sync now** — expected status is `synced` with the same fingerprint.
3. **Validate server snapshot** — expected message is `Stored snapshot passes every structural check.`

Do not enable automatic delivery; keep `SHADOW_MODE=true`.

- [ ] **Step 5: Exercise the manual stage machine one transition at a time**

Use **Generate test bundle** or call `generateDailyBundleStepV2` five times. Expected returned stages in order:

```text
weather-ready
planners-ready
critic-ready
selection-ready
bundle-ready
```

At `bundle-ready`, verify exactly three recommendations, one per archetype, real ids in the persisted bundle, and either no Encore or one `candidateId` beginning `encore:`.

- [ ] **Step 6: Inspect selection diagnostics and fail-closed observability**

Run `getDailyOutfitDiagnosticsV2()` in the Apps Script editor.

Expected:

```json
{
  "selection": {
    "path": "top2",
    "eligibleCountByArchetype": { "easy": 2, "polished-casual": 2, "expressive": 2 },
    "feasibleSetCount": 1,
    "replannedArchetypes": []
  },
  "attemptCounts": { "idle": 1, "weather-ready": 1, "planners-ready": 1, "critic-ready": 1, "selection-ready": 1 }
}
```

Counts may be higher and `path` may be `top3`, `replan-1`, or `replan-2`; keys must be present and no secrets or item thumbnails may appear.

- [ ] **Step 7: Render and inspect test emails with and without Encore**

First send the current pending bundle with **Send test email**. Verify:

- The three generated sections are unchanged in count and order.
- Every generated look names exact colors and at least two items in its color hook.
- When Encore exists, it appears after the trio with `ENCORE — FROM YOUR SAVED OUTFITS`, static copy, the correct item strip, and no model-authored rationale.
- Plain text contains the same three looks and optional Encore.

For the no-Encore case, render a test bundle whose `encore` field is absent through `renderDailyEmailV2_`; verify no Encore heading, images, or blank section appears.

- [ ] **Step 8: Perform in-browser preview QA at desktop and mobile widths**

Open **Wardrobe → Daily email** in the local app and inspect the latest bundle at a desktop width and below `760px`.

Expected: all three generated cards remain aligned; optional Encore is visually distinct, follows the trio, uses the same item imagery, stacks without horizontal overflow, and exposes Like / Not for me / I wore this controls keyed to `encore:<outfitId>`.

- [ ] **Step 9: Begin the 3–5 morning shadow run and commit the runbook**

Keep `SHADOW_MODE=true`. For each morning, record critic floor clustering, `selection.path`, eligible counts, re-planned archetypes, stage attempt counts, final trio quality, repair use, and Encore cadence. A failed quality gate must result in no email.

```bash
git add apps-script/daily-outfits-v2/README.md docs/superpowers/specs/2026-07-14-daily-outfits-v2-quality-design.md docs/superpowers/plans/2026-07-14-daily-outfits-v2-quality.md
git commit -m "docs: add policy v3 rollout runbook"
```

- [ ] **Step 10: Confirm the final worktree scope**

Run: `git status --short && git diff --stat HEAD~15..HEAD`

Expected: no uncommitted implementation files remain; the commit range contains the planned Apps Script, React, tests, enrichment script/data, and README changes, while unrelated user files are untouched.

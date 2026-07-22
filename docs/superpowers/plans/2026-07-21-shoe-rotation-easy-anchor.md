# Shoe Rotation and Shoe-Led Easy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a seven-calendar-day global shoe rotation, make Easy build every candidate around one stable pseudorandom daily shoe, and remove precipitation from every shoe eligibility path.

**Architecture:** Add a pure `ShoeRotation.gs` policy unit that derives fresh, cooling, fallback, allowed, and Easy-anchor shoe sets from the snapshot, local date, and history. Planner, selection, final validation, Encore, and diagnostics consume that single context, so retries are deterministic and no random state is persisted. Existing staged persistence stays structurally unchanged apart from a quality-policy version bump.

**Tech Stack:** Google Apps Script JavaScript, Gemini structured-output prompts, TypeScript, Vitest, pnpm, clasp.

**Design Spec:** `docs/superpowers/specs/2026-07-21-shoe-rotation-easy-anchor-design.md`

## Global Constraints

- Cooldown covers calendar ages one through seven inclusive; skipped email dates do not extend it.
- Easy, Polished casual, Expressive, and Encore exposures count.
- `wore` and `liked` never override shoe cooldown.
- One stable shoe anchors all five Easy candidates, repairs, and both targeted replans.
- Precipitation and `rainSafety` never remove or penalize shoes.
- If fewer than three fresh shoes exist, admit the least-recent cooling shoes only until capacity reaches `min(3, availableShoeCount)`.
- Encore receives no fallback and must avoid shoes used in the same day's generated recommendations.
- Preserve garment weather rules, critic floors, repeat protection, saved-outfit protection, partial delivery, send recovery, and unrelated worktree changes.
- Do not edit the user's current `Weather.gs`, daily README, `package.json`, resilience test, or `.pnpm-store/` changes.
- Do not send a test or real email during verification without fresh authorization.

## File Map

- Create `apps-script/daily-outfits-v2/ShoeRotation.gs`: sole owner of calendar exposure, pool construction, fallback, seeded anchor, and safe summaries.
- Create `src/features/daily-outfits/__tests__/shoeRotationContracts.test.ts`: pure policy contracts.
- Modify `Taste.gs` and `ItemIndex.gs`: calendar usage and model boundary.
- Modify `Planner.gs`, `PlannerValidation.gs`, and `Critic.gs`: shoe-led Easy and rain-exempt footwear prompts.
- Modify `Selection.gs` and `FinalValidation.gs`: generated enforcement and rain decoupling.
- Modify `Encore.gs` and `JobState.gs`: strict Encore rotation and same-day distinctness.
- Modify `Diagnostics.gs` and `Config.gs`: redacted summary and policy version 5.

---

### Task 1: Pure Calendar-Day Rotation Context

**Files:**
- Create: `apps-script/daily-outfits-v2/ShoeRotation.gs`
- Create: `src/features/daily-outfits/__tests__/shoeRotationContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/Taste.gs:91-103`
- Modify: `apps-script/daily-outfits-v2/ItemIndex.gs:31-37`
- Modify: `src/features/daily-outfits/__tests__/historyContracts.test.ts:79-88,132-138,275-303`

**Interfaces:**
- Produces `shoeRotationCalendarOrdinalV2_(value)`.
- Produces `shoeRotationContextV2_(snapshot, localDate, history)` with `availableShoeIds`, `recentShoeIds`, `freshShoeIds`, `allowedGeneratedShoeIds`, `blockedGeneratedShoeIds`, `easyAnchorShoeId`, `fallbackUsed`, and `lastRecommendedDateById`.
- Produces `shoeRotationModelViewV2_`, `shoeRotationDiagnosticSummaryV2_`, and `shoeIdFromItemIdsV2_`.

- [ ] **Step 1: Write failing pure-policy tests**

Create a five-shoe fixture and evaluate `shoeRotationContextV2_`. The test body must cover these cases:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const shoe = (id: string, profile: Record<string, unknown> = {}) => ({
  id,
  shortLabel: id.toUpperCase(),
  slot: 'shoes',
  profile: { available: true, excludedFromDaily: false, ...profile },
});

const snapshot = {
  wardrobeFingerprint: 'rotation-fixture',
  items: ['s1', 's2', 's3', 's4', 's5'].map(id => shoe(id)),
};

const context = evaluateAppsScript<(
  snapshotValue: object,
  localDate: string,
  history: object | object[],
) => {
  availableShoeIds: string[];
  recentShoeIds: string[];
  freshShoeIds: string[];
  allowedGeneratedShoeIds: string[];
  easyAnchorShoeId: string;
  fallbackUsed: boolean;
}>(['ShoeRotation.gs'], 'shoeRotationContextV2_', { console });

describe('shoe rotation policy', () => {
it('uses calendar ages one through seven', () => {
  const result = context(snapshot, '2026-07-21', {
    exactOutfitsPrevious14Days: [
      { localDate: '2026-07-21', itemIds: ['s5'] },
      { localDate: '2026-07-20', itemIds: ['s1'] },
      { localDate: '2026-07-14', itemIds: ['s2'] },
      { localDate: '2026-07-13', itemIds: ['s3'] },
    ],
  });
  expect(result.recentShoeIds).toEqual(['s1', 's2']);
  expect(result.freshShoeIds).toEqual(['s3', 's4', 's5']);
  expect(result.allowedGeneratedShoeIds).toEqual(['s3', 's4', 's5']);
});

it('counts generated and Encore exposure without feedback overrides', () => {
  const result = context(snapshot, '2026-07-21', [{
    localDate: '2026-07-19',
    recommendations: [{ itemIds: ['s1'] }],
    encore: { itemIds: ['s2'] },
    feedback: [{ value: 'wore' }, { value: 'liked' }],
  }]);
  expect(result.recentShoeIds).toEqual(['s1', 's2']);
});

it('admits least-recent shoes only to restore capacity', () => {
  const result = context(snapshot, '2026-07-21', {
    exactOutfitsPrevious14Days: [
      { localDate: '2026-07-20', itemIds: ['s1'] },
      { localDate: '2026-07-15', itemIds: ['s2'] },
      { localDate: '2026-07-16', itemIds: ['s3'] },
      { localDate: '2026-07-17', itemIds: ['s4'] },
    ],
  });
  expect(result.freshShoeIds).toEqual(['s5']);
  expect(result.allowedGeneratedShoeIds).toEqual(['s5', 's2', 's3']);
  expect(result.easyAnchorShoeId).toBe('s5');
  expect(result.fallbackUsed).toBe(true);
});

it('uses the oldest tier if all shoes are cooling', () => {
  const result = context(snapshot, '2026-07-21', {
    exactOutfitsPrevious14Days: [
      { localDate: '2026-07-20', itemIds: ['s1'] },
      { localDate: '2026-07-15', itemIds: ['s2'] },
      { localDate: '2026-07-16', itemIds: ['s3'] },
      { localDate: '2026-07-17', itemIds: ['s4'] },
      { localDate: '2026-07-18', itemIds: ['s5'] },
    ],
  });
  expect(result.easyAnchorShoeId).toBe('s2');
  expect(result.allowedGeneratedShoeIds).toEqual(['s2', 's3', 's4']);
});

it('fails clearly when no shoe is available', () => {
  expect(() => context(
    { wardrobeFingerprint: 'empty', items: [shoe('s1', { available: false })] },
    '2026-07-21',
    { exactOutfitsPrevious14Days: [] },
  )).toThrow('No available daily shoes');
});
});
```

Also assert: poor and absent `rainSafety` remain available; unavailable and excluded shoes do not; identical inputs return the same anchor; 14 consecutive dates produce more than one anchor; zero available shoes throws `No available daily shoes`.

- [ ] **Step 2: Verify RED**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/shoeRotationContracts.test.ts`.

Expected: FAIL because `ShoeRotation.gs` does not exist.

- [ ] **Step 3: Implement calendar parsing, inventory, exposure, and seeding**

Use strict `YYYY-MM-DD` parsing through `Date.UTC`, sort available ids, accept processed `exactOutfitsPrevious14Days` or raw history entries, and use this seed implementation:

```js
function shoeRotationCalendarOrdinalV2_(value) {
  if (typeof value !== 'string') return null;
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var stamp = Date.UTC(year, month - 1, day);
  var parsed = new Date(stamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day) return null;
  return Math.floor(stamp / 86400000);
}

function shoeRotationAvailableShoeIdsV2_(snapshot) {
  var seen = Object.create(null);
  return (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).reduce(function(ids, item) {
    var profile = item && item.profile;
    if (!item || item.slot !== 'shoes' || typeof item.id !== 'string' || !item.id ||
        Object.prototype.hasOwnProperty.call(seen, item.id) || !profile ||
        profile.available !== true || profile.excludedFromDaily === true) return ids;
    seen[item.id] = true;
    ids.push(item.id);
    return ids;
  }, []).sort();
}

function shoeRotationExposureRecordsV2_(history) {
  if (Array.isArray(history)) {
    return history.flatMap(function(entry) {
      if (!entry || typeof entry.localDate !== 'string') return [];
      var looks = (Array.isArray(entry.recommendations) ? entry.recommendations : [])
        .concat(entry.encore && typeof entry.encore === 'object' ? [entry.encore] : []);
      return looks.map(function(look) {
        return { localDate: entry.localDate, itemIds: Array.isArray(look.itemIds) ? look.itemIds.slice() : [] };
      });
    });
  }
  return (history && Array.isArray(history.exactOutfitsPrevious14Days)
    ? history.exactOutfitsPrevious14Days
    : []).map(function(entry) {
      return {
        localDate: entry && entry.localDate,
        itemIds: entry && Array.isArray(entry.itemIds) ? entry.itemIds.slice() : []
      };
    });
}

function shoeRotationStableHashV2_(value) {
  var hash = 2166136261;
  for (var index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shoeRotationSeededPickV2_(ids, localDate, wardrobeFingerprint) {
  if (!ids.length) return null;
  var sorted = ids.slice().sort();
  var seed = [localDate, wardrobeFingerprint || '', sorted.join('|')].join('|');
  return sorted[shoeRotationStableHashV2_(seed) % sorted.length];
}
```

- [ ] **Step 4: Implement the exact pool algorithm**

Implement `shoeRotationContextV2_` as:

```js
function shoeRotationContextV2_(snapshot, localDate, history) {
  var currentOrdinal = shoeRotationCalendarOrdinalV2_(localDate);
  if (currentOrdinal === null) throw new Error('Invalid local date for shoe rotation');
  var available = shoeRotationAvailableShoeIdsV2_(snapshot);
  if (!available.length) throw new Error('No available daily shoes');
  var availableSet = new Set(available);
  var itemSlots = Object.create(null);
  (snapshot.items || []).forEach(function(item) {
    if (item && typeof item.id === 'string') itemSlots[item.id] = item.slot;
  });
  var lastDateById = Object.create(null);
  shoeRotationExposureRecordsV2_(history).forEach(function(entry) {
    var ordinal = shoeRotationCalendarOrdinalV2_(entry.localDate);
    var age = ordinal === null ? null : currentOrdinal - ordinal;
    if (age === null || age < 1 || age > 7) return;
    entry.itemIds.forEach(function(id) {
      if (!availableSet.has(id) || itemSlots[id] !== 'shoes') return;
      if (!lastDateById[id] || entry.localDate > lastDateById[id]) lastDateById[id] = entry.localDate;
    });
  });
var recent = available.filter(function(id) { return Boolean(lastDateById[id]); });
var fresh = available.filter(function(id) { return !lastDateById[id]; });
var target = Math.min(3, available.length);
var allowed = fresh.slice();
if (allowed.length < target) {
  recent.slice().sort(function(left, right) {
    if (lastDateById[left] !== lastDateById[right]) {
      return lastDateById[left] < lastDateById[right] ? -1 : 1;
    }
    return left < right ? -1 : left > right ? 1 : 0;
  }).some(function(id) {
    allowed.push(id);
    return allowed.length >= target;
  });
}
var anchorPool = fresh.slice();
if (!anchorPool.length) {
  var oldestDate = recent.reduce(function(oldest, id) {
    return oldest === null || lastDateById[id] < oldest ? lastDateById[id] : oldest;
  }, null);
  anchorPool = recent.filter(function(id) { return lastDateById[id] === oldestDate; });
}
  var allowedSet = new Set(allowed);
  return {
    availableShoeIds: available,
    recentShoeIds: recent,
    freshShoeIds: fresh,
    allowedGeneratedShoeIds: allowed,
    blockedGeneratedShoeIds: available.filter(function(id) { return !allowedSet.has(id); }),
    easyAnchorShoeId: shoeRotationSeededPickV2_(anchorPool, localDate, snapshot.wardrobeFingerprint),
    fallbackUsed: allowed.length > fresh.length,
    lastRecommendedDateById: lastDateById
  };
}
```

Add safe projections that translate ids only via `labelForItemIdV2_`.

Use these exact projection shapes:

```js
function shoeRotationModelViewV2_(rotation, snapshot) {
  var label = function(id) { return labelForItemIdV2_(id, snapshot); };
  return {
    easyAnchorLabel: label(rotation.easyAnchorShoeId),
    allowedShoeLabels: rotation.allowedGeneratedShoeIds.map(label).filter(Boolean),
    blockedShoeLabels: rotation.blockedGeneratedShoeIds.map(label).filter(Boolean)
  };
}

function shoeRotationDiagnosticSummaryV2_(rotation, snapshot) {
  return {
    easyAnchorLabel: labelForItemIdV2_(rotation.easyAnchorShoeId, snapshot),
    availableShoeCount: rotation.availableShoeIds.length,
    freshShoeCount: rotation.freshShoeIds.length,
    coolingDownShoeCount: rotation.recentShoeIds.length,
    allowedGeneratedShoeCount: rotation.allowedGeneratedShoeIds.length,
    fallbackUsed: rotation.fallbackUsed
  };
}

function shoeIdFromItemIdsV2_(itemIds, snapshot) {
  var itemMap = Object.create(null);
  (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).forEach(function(item) {
    if (item && typeof item.id === 'string') itemMap[item.id] = item;
  });
  var shoes = (Array.isArray(itemIds) ? itemIds : []).filter(function(id) {
    return itemMap[id] && itemMap[id].slot === 'shoes';
  });
  return shoes.length === 1 ? shoes[0] : null;
}
```

- [ ] **Step 5: Make item usage calendar-based**

Replace `history.slice(-7)` in `dailyHistoryContextV2_` with:

```js
var currentOrdinal = shoeRotationCalendarOrdinalV2_(localDate);
var last7 = history.filter(function(entry) {
  var ordinal = shoeRotationCalendarOrdinalV2_(entry && entry.localDate);
  var age = currentOrdinal === null || ordinal === null ? null : currentOrdinal - ordinal;
  return age !== null && age >= 1 && age <= 7;
});
```

Change history guidance from `last seven emails` to `previous seven calendar dates`. Load `ShoeRotation.gs` in history tests and add an eight-day/skipped-date regression.

- [ ] **Step 6: Verify GREEN and commit**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/shoeRotationContracts.test.ts src/features/daily-outfits/__tests__/historyContracts.test.ts`.

Expected: PASS.

```bash
git add apps-script/daily-outfits-v2/ShoeRotation.gs apps-script/daily-outfits-v2/Taste.gs apps-script/daily-outfits-v2/ItemIndex.gs src/features/daily-outfits/__tests__/shoeRotationContracts.test.ts src/features/daily-outfits/__tests__/historyContracts.test.ts
git commit -m "feat: add calendar-day shoe rotation policy"
```

---

### Task 2: Shoe-Led Easy Planner and Model Boundary

**Files:**
- Modify: `apps-script/daily-outfits-v2/Planner.gs:30-76,100-242`
- Modify: `apps-script/daily-outfits-v2/PlannerValidation.gs:1-45`
- Modify: `apps-script/daily-outfits-v2/ItemIndex.gs:73-103`
- Modify: `apps-script/daily-outfits-v2/Critic.gs:139-175`
- Modify: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

**Interfaces:**
- Consumes Task 1 rotation and model-view functions.
- Changes `validatePlannerResponseV2_(response, archetype, snapshot, expectedEasyShoeId?)`.
- Changes `plannerPartsV2_(archetype, snapshot, weather, history, selectionGuidance?, rotation?)` and the corresponding repair helper.
- Keeps public batch, standalone, and replan entry-point signatures unchanged.

- [ ] **Step 1: Write failing prompt and validator tests**

Assert the Easy prompt contains a model-safe anchor and never the internal id:

```ts
const rotation = shoeRotationContext(snapshot, weather.localDate, history);
const prompt = plannerParts('easy', snapshot, weather, history).map(part => part.text || '').join('\n');
const label = snapshot.items.find(item => item.id === rotation.easyAnchorShoeId)?.shortLabel;
expect(prompt).toContain(`REQUIRED EASY SHOE ANCHOR: ${label}`);
expect(prompt).toContain('Use this shoe in all five Easy candidates');
expect(prompt).toContain('Precipitation must not influence footwear selection');
expect(prompt).not.toContain(rotation.easyAnchorShoeId);
```

Change one of five valid Easy candidates to another real shoe and require `candidate[2].shoeId must use the required Easy shoe anchor`. Capture both targeted Easy replan prompts and require the same anchor in both.

- [ ] **Step 2: Verify RED**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`.

Expected: FAIL because the prompt and validator do not enforce an anchor.

- [ ] **Step 3: Hide rain metadata for shoes**

Change `modelProfileViewV2_(profile, snapshot, slot)` so it removes `rainSafety` from its key list only when `slot === 'shoes'`. Pass `item.slot` from `compactItemIndexV2_`. Preserve all color, silhouette, formality, warmth, and breathability fields.

- [ ] **Step 4: Add model-safe planner guidance**

Add:

```js
function plannerShoeRotationGuidanceV2_(archetype, rotation, snapshot) {
  var view = shoeRotationModelViewV2_(rotation, snapshot);
  var lines = [
    'FOOTWEAR ROTATION CONTRACT:',
    '- Precipitation must not influence footwear selection, candidate risks, or weather summaries.',
    '- Use only these allowed shoe labels today: ' + view.allowedShoeLabels.join(', ') + '.',
    '- Do not use these cooling-down shoe labels: ' + (view.blockedShoeLabels.join(', ') || 'none') + '.'
  ];
  if (archetype === 'easy') {
    lines.push('REQUIRED EASY SHOE ANCHOR: ' + view.easyAnchorLabel + '.');
    lines.push('- Use this shoe in all five Easy candidates and build each top-bottom combination around its visible colors and character.');
    lines.push('- Keep the shoe fixed while varying palette, proportion, silhouette, and optional layer materially.');
  }
  return lines.join('\n');
}
```

Compute a missing optional rotation inside `plannerPartsV2_` and insert this contract immediately after weather. Clarify that garment weather suitability remains mandatory while footwear is precipitation-exempt.

- [ ] **Step 5: Thread anchor enforcement through all planner paths**

Add this per-candidate validation:

```js
if (archetype === 'easy' && typeof expectedEasyShoeId === 'string' &&
    expectedEasyShoeId && candidate.shoeId !== expectedEasyShoeId) {
  errors.push(path + '.shoeId must use the required Easy shoe anchor');
}
```

Thread the optional expected id through safe validation and repairs. Initial batch, standalone planner, repair, and targeted replan each derive the same pure context from snapshot/date/history. `runAllPlannersV2_` logs `shoeRotationDiagnosticSummaryV2_` once before building the batch.

- [ ] **Step 6: Exempt footwear in both critic prompts**

Insert exactly:

```js
'Precipitation must not lower weather, wearability, or any other score because of footwear. Judge weather suitability from garments and layers only.'
```

- [ ] **Step 7: Verify and commit**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`.

Expected: PASS, including batch repairs and both replan rounds.

```bash
git add apps-script/daily-outfits-v2/Planner.gs apps-script/daily-outfits-v2/PlannerValidation.gs apps-script/daily-outfits-v2/ItemIndex.gs apps-script/daily-outfits-v2/Critic.gs src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "feat: anchor Easy planning on a daily shoe"
```

---

### Task 3: Generated Rotation Enforcement and Rain Decoupling

**Files:**
- Modify: `apps-script/daily-outfits-v2/Selection.gs:82-94,199-220,309-320,410-413`
- Modify: `apps-script/daily-outfits-v2/FinalValidation.gs:62-83,110-185`
- Modify: `src/features/daily-outfits/__tests__/selectionContracts.test.ts`
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`
- Modify: `src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts`

**Interfaces:**
- Changes `candidateEligibilityErrorsV2_(candidate, score, snapshot, weather, history, rotation?)`.
- Replaces `usableWeatherSafeShoeCountV2_` with `usableShoeCountV2_(snapshot)`.
- Keeps selection and persistence result shapes unchanged.

- [ ] **Step 1: Write failing selection tests**

Load `ShoeRotation.gs` in selection evaluators. Give the shared snapshot `wardrobeFingerprint: 'wardrobe-9'` and weather `localDate: '2026-07-14'`; the fresh anchor for `s1` through `s6` is `s1`.

```ts
it('rejects cooling shoes globally and requires the Easy anchor', () => {
  const history = {
    exactOutfitsPrevious14Days: [{ localDate: '2026-07-13', itemIds: ['t9', 'b9', 's2'] }],
    cooldownItemIds: [],
  };
  const cooled = makeCandidate('cooled', 'polished-casual', 't2', 'b2', 's2');
  expect(finalists([cooled], [makeScore('cooled')], baseSnapshot, baseWeather, history)
    .eligibleCountByArchetype['polished-casual']).toBe(0);
  const wrongEasy = makeCandidate('wrong-easy', 'easy', 't1', 'b1', 's3');
  expect(finalists([wrongEasy], [makeScore('wrong-easy')], baseSnapshot, baseWeather, emptyHistory)
    .eligibleCountByArchetype.easy).toBe(0);
});
```

Also require poor and missing `rainSafety` to remain eligible during rain. Replace rain-safe-count tests with all-available-shoe expectations while retaining unavailable/excluded cases.

- [ ] **Step 2: Verify RED**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/selectionContracts.test.ts`.

Expected: FAIL on rotation and rain expectations.

- [ ] **Step 3: Remove deterministic shoe-rain gates**

Make a present shoe profile valid without `rainSafety`, remove the shoe branch from `weatherSafetyErrorsV2_`, and replace the count with:

```js
function usableShoeCountV2_(snapshot) {
  var ids = new Set();
  (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).forEach(function(item) {
    var profile = item && item.profile;
    if (item && item.slot === 'shoes' && typeof item.id === 'string' && item.id &&
        profile && profile.available === true && profile.excludedFromDaily !== true) ids.add(item.id);
  });
  return ids.size;
}
```

Use this count for same-day shoe uniqueness.

- [ ] **Step 4: Enforce rotation at finalist eligibility**

Compute one context in `selectFinalistsV2_`, pass it into eligibility, and add:

```js
var allowedShoes = new Set(rotation.allowedGeneratedShoeIds);
if (!allowedShoes.has(candidate.shoeId)) errors.push('shoe is inside the seven-calendar-day rotation block');
if (candidate.archetype === 'easy' && candidate.shoeId !== rotation.easyAnchorShoeId) {
  errors.push('Easy candidate does not use the daily shoe anchor');
}
```

- [ ] **Step 5: Recheck at final validation**

Derive the context once:

```js
var rotation = null;
try {
  rotation = shoeRotationContextV2_(snapshot, weather.localDate, history);
} catch (error) {
  errors.push('shoe rotation context is invalid: ' + error.message);
}
var allowedShoes = new Set(rotation ? rotation.allowedGeneratedShoeIds : []);
```

For each recommendation, add:

```js
if (shoe && !allowedShoes.has(shoe.id)) {
  errors.push(path + ' uses a shoe outside the daily rotation pool');
}
if (candidate && candidate.archetype === 'easy' && rotation &&
    candidate.shoeId !== rotation.easyAnchorShoeId) {
  errors.push(path + ' does not use the daily Easy shoe anchor');
}
```

Keep garment weather validation unchanged.

- [ ] **Step 6: Update broad evaluators, verify, and commit**

Add `ShoeRotation.gs` to every evaluator that loads selection/final validation. Add valid local date, fingerprint, and history to final-policy fixtures. Change the broad rain assertion to expect no error.

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts`.

Expected: PASS.

```bash
git add apps-script/daily-outfits-v2/Selection.gs apps-script/daily-outfits-v2/FinalValidation.gs src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts
git commit -m "fix: enforce shoe rotation without rain filtering"
```

---

### Task 4: Encore Rotation and Same-Day Distinctness

**Files:**
- Modify: `apps-script/daily-outfits-v2/Encore.gs:64-116,266-375`
- Modify: `apps-script/daily-outfits-v2/JobState.gs:754-775`
- Modify: `src/features/daily-outfits/__tests__/encoreContracts.test.ts`
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

**Interfaces:**
- Changes `selectEncoreV2_(snapshot, weather, history, lastEncoreDate, excludedShoeIds?)`.
- Changes `selectEncoreForBundleV2_(snapshot, weather, history, excludedShoeIds?)`.
- Keeps `buildBundleV2_` public signature unchanged.

- [ ] **Step 1: Write failing Encore tests**

Load `ShoeRotation.gs` in the Encore evaluator. Add:

```ts
it('accepts poor and missing rainSafety during rain', () => {
  const changed = clone(snapshot);
  changed.items.find(item => item.id === 'shoe')!.profile.rainSafety = 'poor';
  expect(select(changed, { ...weather, rainExpected: true }))
    .toEqual(expect.objectContaining({ outfitId: 'manual' }));
  delete changed.items.find(item => item.id === 'shoe')!.profile.rainSafety;
  expect(select(changed, { ...weather, rainExpected: true }))
    .toEqual(expect.objectContaining({ outfitId: 'manual' }));
});

it('rejects a cooling or same-day generated shoe', () => {
  const history = [{
    localDate: '2026-07-13',
    recommendations: [{ candidateId: 'other', itemIds: ['top-2', 'bottom-2', 'shoe'] }],
    feedback: [],
  }];
  expect(select(snapshot, weather, history)).toBeNull();
  expect(selectEncoreV2_(snapshot, weather, [], null, ['shoe'])).toBeNull();
});
```

Use a saved outfit whose full core is not a recent exact repeat, so the first null proves shoe cooldown.

- [ ] **Step 2: Verify RED**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/encoreContracts.test.ts`.

Expected: FAIL because Encore still requires rain metadata and accepts same-day generated shoes.

- [ ] **Step 3: Remove Encore's rain requirement**

Delete the `item.slot === 'shoes'` `rainSafety` branch from `validEncoreProfileV2_`. Keep the call to `weatherSafetyErrorsV2_`; after Task 3 it validates garments only.

- [ ] **Step 4: Enforce strict fresh and same-day exclusions**

After retained history validation in `selectEncoreV2_`, compute:

```js
var rotation = shoeRotationContextV2_(snapshot, weather.localDate, retained);
var freshShoes = new Set(rotation.freshShoeIds);
var excludedShoes = new Set(Array.isArray(excludedShoeIds) ? excludedShoeIds : []);
```

Inside saved-outfit eligibility:

```js
var shoeId = shoeIdFromItemIdsV2_(outfit.itemIds, snapshot);
if (!shoeId || !freshShoes.has(shoeId) || excludedShoes.has(shoeId)) return false;
```

Thread exclusions through `selectEncoreForBundleV2_`.

- [ ] **Step 5: Pass generated shoes from bundle construction**

Replace the Encore call in `buildBundleV2_` with:

```js
var generatedShoeIds = curated.recommendations.map(function(recommendation) {
  return shoeIdFromItemIdsV2_(recommendation.itemIds, snapshot);
}).filter(Boolean);
var encore = typeof selectEncoreForBundleV2_ === 'function'
  ? selectEncoreForBundleV2_(snapshot, weather, history, generatedShoeIds)
  : null;
```

- [ ] **Step 6: Verify and commit**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`.

Expected: PASS.

```bash
git add apps-script/daily-outfits-v2/Encore.gs apps-script/daily-outfits-v2/JobState.gs src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "fix: apply global shoe rotation to Encore"
```

---

### Task 5: Redacted Diagnostics and Policy Version 5

**Files:**
- Modify: `apps-script/daily-outfits-v2/Diagnostics.gs:120-184`
- Modify: `apps-script/daily-outfits-v2/Config.gs:1-5`
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

**Interfaces:**
- Adds diagnostics property `shoeRotation` or `null`.
- Changes `DAILY_V2.QUALITY_POLICY_VERSION` from 4 to 5; existing validators reject stale policy-4 state.

- [ ] **Step 1: Write failing diagnostics and stale-policy tests**

For valid snapshot/pending/history, require:

```ts
expect(result.shoeRotation).toEqual({
  easyAnchorLabel: expect.stringMatching(/^S/),
  availableShoeCount: 5,
  freshShoeCount: 4,
  coolingDownShoeCount: 1,
  allowedGeneratedShoeCount: 4,
  fallbackUsed: false,
});
expect(JSON.stringify(result.shoeRotation)).not.toContain('sneaker_');
```

Change the source contract to expect version 5. Evaluate a structurally valid pending object at version 4 against runtime version 5 and expect `validCurrentPendingV2_` to return false.

- [ ] **Step 2: Verify RED**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`.

Expected: FAIL because diagnostics lacks the projection and Config remains version 4.

- [ ] **Step 3: Add fail-closed diagnostics**

Add:

```js
function safeDailyShoeRotationProjectionV2_(pending, context, snapshot) {
  if (!context || !snapshot || !validCurrentPendingV2_(
    pending,
    context.localDate,
    context.wardrobeFingerprint
  ) || !pending.history) return null;
  return safeDailyDiagnosticLoadV2_(function() {
    return shoeRotationDiagnosticSummaryV2_(
      shoeRotationContextV2_(snapshot, context.localDate, pending.history),
      snapshot
    );
  }, null);
}
```

Add `shoeRotation: safeDailyShoeRotationProjectionV2_(pending, context, snapshot)` to `getDailyOutfitDiagnosticsV2()`. Expose labels and counts only.

- [ ] **Step 4: Bump policy version and verify**

Change `QUALITY_POLICY_VERSION: 4` to `QUALITY_POLICY_VERSION: 5` in production Config. Update only tests that assert the production version or construct a full current-policy fixture; isolated tests may keep an internally consistent injected value.

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts`.

Expected: PASS, including stale version rejection and send recovery.

- [ ] **Step 5: Commit diagnostics and version**

```bash
git add apps-script/daily-outfits-v2/Diagnostics.gs apps-script/daily-outfits-v2/Config.gs src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "feat: expose policy-v5 shoe rotation diagnostics"
```

---

### Task 6: Complete Regression Verification

**Files:**
- Modify only task-owned files if a direct regression is found.
- Never modify the user's unrelated files merely to make a check pass.

**Interfaces:**
- Consumes all previous tasks and produces deployable Apps Script source.

- [ ] **Step 1: Audit for obsolete shoe-weather logic**

Run:

```bash
rg -n "rain-unsafe shoes|usableWeatherSafeShoeCount|shoe.*rainSafety|rainSafety.*shoe" apps-script/daily-outfits-v2 src/features/daily-outfits/__tests__
```

Expected: no production shoe-rain eligibility branch. Test fixture occurrences exist only to prove the values are ignored.

- [ ] **Step 2: Run focused daily-outfit tests**

Run `corepack pnpm exec vitest run src/features/daily-outfits/__tests__`.

Expected: all daily-outfit test files PASS.

- [ ] **Step 3: Run complete verification**

Run each command separately:

```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm build
git diff --check
```

Expected: tests, lint, and build exit 0; diff check prints nothing.

- [ ] **Step 4: Audit ownership and behavior**

Run `git status --short` and `git diff --stat`. Confirm the user's pre-existing README, Weather, package, resilience-test, and package-store changes remain untouched. Inspect task-owned diffs and confirm there is one rotation algorithm, no raw-id diagnostic output, and no rain-based shoe gate.

- [ ] **Step 5: Commit direct regression corrections only if needed**

Stage only corrected task-owned files and run `git commit -m "test: close shoe rotation regressions"`. If no correction was necessary, do not make an empty commit.

---

### Task 7: Deploy Without Sending and Verify Live Diagnostics

**Files:**
- No source edits.
- Deploy from `apps-script/daily-outfits-v2/` using its existing `.clasp.json` script id.

**Interfaces:**
- Produces updated Apps Script source and the existing web-app deployment; does not authorize email delivery.

- [ ] **Step 1: Confirm deploy scope**

Run `git status --short` and `git log -6 --oneline`.

Expected: implementation commits are present; only user-owned changes and this plan may remain uncommitted.

- [ ] **Step 2: Push Apps Script source**

From `apps-script/daily-outfits-v2/`, run:

```bash
corepack pnpm dlx @google/clasp push
corepack pnpm dlx @google/clasp status
```

Expected: push succeeds for the existing script id and status lists `ShoeRotation.gs`.

- [ ] **Step 3: Preserve the existing web-app URL**

Open Apps Script **Deploy → Manage deployments**, edit the existing Web app deployment, choose **New version**, and deploy. Do not create a second deployment or alter the `/exec` URL.

- [ ] **Step 4: Run read-only production diagnostics**

Use **Inspect diagnostics**; do not click **Send test email**. Require `shoeRotation.easyAnchorLabel` to match `/^S\d{3}$/`, all counts to be finite and non-negative, `availableShoeCount` to match the synchronized snapshot, `allowedGeneratedShoeCount >= min(3, availableShoeCount)`, and no internal ids. If pending state has no history and returns `shoeRotation: null`, wait for the ordinary scheduler to reach `weather-ready` and inspect again.

- [ ] **Step 5: Verify a generated bundle without sending it manually**

After ordinary generation or **Generate test bundle** reaches `bundle-ready`, require: final Easy uses the diagnostic anchor when present; generated shoes are distinct when three looks are delivered; no shoe was excluded solely for rain; rotation diagnostics remain redacted; and no test or real email was sent by verification.

- [ ] **Step 6: Record deployment evidence**

Report clasp push status, retained web-app URL, policy version 5, live rotation summary, final coverage, and fallback status. If live generation has not finished, say so instead of claiming it was verified.

---

## Completion Checklist

- [ ] One shared rotation context serves every consumer.
- [ ] Calendar dates, generated looks, and Encore drive cooldown.
- [ ] Easy candidates, repairs, and replans share one anchor.
- [ ] Generated selection and final validation enforce the allowed pool.
- [ ] Encore avoids cooling and same-day generated shoes.
- [ ] Shoe rain filtering and rain-based model influence are absent.
- [ ] Garment weather behavior still passes.
- [ ] Policy version 5 invalidates stale pending state.
- [ ] Diagnostics are redacted and actionable.
- [ ] Focused tests, full tests, lint, build, and diff checks pass.
- [ ] Deployment keeps the existing `/exec` URL and sends no verification email.

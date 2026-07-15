# Daily Outfits V2 Partial Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the three-archetype daily bundle as the preferred result, allow one eligible candidate per archetype to complete it, and after two structurally valid targeted re-plans deliver the largest safe one- or two-look subset rather than suppressing every look. Make polished-casual planning viable above 90°F without lowering any existing quality, novelty, or weather floor.

**Architecture:** `Selection.gs` remains the single source of truth. Pure cardinality-aware helpers land before the runtime cutover, then every curator/validator/bundle consumer learns the one-to-three contract while production still emits trios. The final Apps Script cutover atomically adds an explicit re-plan ledger, policy-v4 deterministic replay, and partial fallback. Email and React render the persisted coverage contract; diagnostics expose parity booleans and counts without candidate ids.

**Tech Stack:** Google Apps Script JavaScript, Gemini structured output, React 19, TypeScript 6, Vitest 3, Vite 8, npm, clasp.

**Source Design:** `docs/superpowers/specs/2026-07-15-daily-outfits-v2-partial-delivery-design.md`

## Global constraints

- `QUALITY_POLICY_VERSION` becomes `4` only in the runtime-cutover task. Policy-v3 state must not resume after that commit.
- Archetype order is always `easy`, `polished-casual`, `expressive`. A selected list is a non-empty configured-order subsequence with no duplicate archetype.
- A complete trio always outranks every partial set. Partial fallback is legal only after exactly two structurally valid targeted re-plan rounds.
- The same deterministic weakest archetype may be targeted in both rounds. Target order remains: fewest eligible candidates, lowest best composite, then configured archetype order.
- One eligible candidate per archetype is sufficient for the bounded complete search. A count of zero, not a count below two, creates a shortage.
- Existing quality floors remain unchanged: weather `>= 8`, palette `>= 7.5`, color intent `>= 8`, visual coherence `>= 7.5`, and `disqualified === false`.
- Existing item validity, weather, cooldown, history, saved-outfit, color-intent, overlap, diversity-story, and layer rules remain in force for every cardinality.
- At `weather.middayFeelsLikeF > 90`, and only for `polished-casual`, initial, repair, round-one, and round-two planner prompts contain the identical heat contract. Exactly `90` does not trigger it.
- Zero safe recommendations throws `quality-exhausted-zero` and sends nothing. Model, transport, persistence, snapshot, curator, validation, history, and email failures never unlock partial fallback.
- Encore is separate from generated count and coverage.
- Omission copy is cause-neutral: quality, weather, and outfit-distinctness checks. It must not claim the omitted archetype had zero eligible candidates.
- Keep this sidecar isolated from `src/services/stylist.ts`, `generateOutfit`, and on-demand stylist storage.
- Never print or commit `.env`, `.clasp.json`, API keys, Script Properties, deployment ids, or raw wardrobe payloads.
- Keep `SHADOW_MODE=true` through deployment and verification. A test or real email requires fresh action-time confirmation.
- Each task follows red-green TDD, runs the full suite after cross-cutting signature changes, passes a spec review and code-quality review, and ends in a focused commit.

## Shared policy-v4 contracts

```ts
type DailyDeliveryModeV2 = 'complete' | 'partial';

type DailySelectionSummaryV4 = {
  deliveryMode: DailyDeliveryModeV2;
  selectedCount: 1 | 2 | 3;
  selectedArchetypes: DailyArchetype[];
  omittedArchetypes: DailyArchetype[];
  eligibleCountByArchetype: Record<DailyArchetype, number>;
  compositeById: Record<string, number>;
  path: 'top2' | 'top3' | 'replan-1' | 'replan-2';
  feasibleSetCount: number;
  replannedArchetypes: DailyArchetype[];
};

type DailyReplanRoundV4 = {
  round: 1 | 2;
  targetArchetype: DailyArchetype;
  structurallyValid: true;
  returnedCandidates: [PlannerCandidateV2, PlannerCandidateV2, PlannerCandidateV2, PlannerCandidateV2, PlannerCandidateV2];
  acceptedCandidateIds: string[];
  duplicateCandidateIds: string[];
};

type DailyBundleCoverageV2 = {
  deliveryMode: DailyDeliveryModeV2;
  selectedArchetypes: DailyArchetype[];
  omittedArchetypes: DailyArchetype[];
};
```

`pending.replanRounds` is present at `selection-ready`, including `[]` for a no-replan complete result. `pending.candidates` is the initial fifteen candidates followed by accepted re-plan candidates in ledger order. Critic scores cover that exact accepted array in the same order. Duplicate-disposition candidates live only in the ledger and receive no score.

---

### Task 1: Add one shared extreme-heat polished-casual prompt contract

**Files:**
- Modify: `apps-script/daily-outfits-v2/Planner.gs`
- Test: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`

**Interfaces:**
- Add `extremeHeatPolishedCasualContractV2_(archetype, weather): string`.
- Keep `plannerPartsV2_` as the only insertion point used by initial, repair, and targeted re-plan calls.

- [ ] **Step 1: Write boundary tests against the existing evaluated Planner fixture**

Extend the fixture's exported expression with `extremeHeatPolishedCasualContractV2_`. Define one test-local `EXACT_EXTREME_HEAT_CONTRACT` string containing these seven lines joined with `\n`:

```text
EXTREME-HEAT POLISHED-CASUAL CONTRACT:
- Polish does not require trousers. Build polish through intentional palette, proportion, restrained graphics, and footwear.
- At least 3 of your 5 candidates must use a Shorts bottom.
- Every proposed top must have `warmth <= 2` and `breathability >= 4`.
- A Pants bottom is allowed only when it has `warmth <= 2` and `breathability >= 4`.
- Avoid heat-retaining layers. Include a removable layer only when the weather's edge-of-day layer guidance requires one, and only when that layer has `warmth <= 2`.
- Do not lower archetype intent: the result must still read as polished-casual rather than a generic gym or lounge outfit.
```

Assert exact helper results for polished casual at `90`, `90.1`, numeric `101`, string `'101'`, and for easy/expressive at numeric `101`. The only non-empty cases are polished casual with numeric values strictly above `90`.

- [ ] **Step 2: Prove propagation with the existing prompt-capture tests**

In the current targeted-replan prompt test, retain its `callGeminiV2_` capture array, change the requested archetype and all returned fixture candidates from `easy` to `polished-casual`, and make two calls to `replanArchetypeV2_`, one with `round = 1` and one with `round = 2`, using the same hot polished-casual weather. In the current planner-repair test, change both its archetype/returned candidates to `polished-casual` and its weather fixture to the same hot weather. Call `plannerPartsV2_` directly once for `polished-casual` with that test's existing snapshot, hot weather, history, and guidance arguments.

For each of those four captured strings, assert:

```ts
expect(prompt.split(EXACT_EXTREME_HEAT_CONTRACT)).toHaveLength(2);
expect(prompt.indexOf('WEATHER PROFILE:')).toBeLessThan(prompt.indexOf(EXACT_EXTREME_HEAT_CONTRACT));
expect(prompt.indexOf(EXACT_EXTREME_HEAT_CONTRACT)).toBeLessThan(prompt.indexOf('DAILY ROTATION HISTORY:'));
```

Also call `plannerPartsV2_` at exactly `90`, and for hot easy and expressive, and assert the marker is absent.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
```

Expected: failure because the helper and prompt block do not exist.

- [ ] **Step 4: Implement the helper and single insertion point**

```js
function extremeHeatPolishedCasualContractV2_(archetype, weather) {
  if (archetype !== 'polished-casual' || !weather ||
      typeof weather.middayFeelsLikeF !== 'number' ||
      !Number.isFinite(weather.middayFeelsLikeF) ||
      weather.middayFeelsLikeF <= 90) return '';
  return [
    'EXTREME-HEAT POLISHED-CASUAL CONTRACT:',
    '- Polish does not require trousers. Build polish through intentional palette, proportion, restrained graphics, and footwear.',
    '- At least 3 of your 5 candidates must use a Shorts bottom.',
    '- Every proposed top must have `warmth <= 2` and `breathability >= 4`.',
    '- A Pants bottom is allowed only when it has `warmth <= 2` and `breathability >= 4`.',
    '- Avoid heat-retaining layers. Include a removable layer only when the weather\'s edge-of-day layer guidance requires one, and only when that layer has `warmth <= 2`.',
    '- Do not lower archetype intent: the result must still read as polished-casual rather than a generic gym or lounge outfit.'
  ].join('\n');
}
```

In `plannerPartsV2_`, end the initial array after `WEATHER PROFILE`, conditionally push the helper result, then append the unchanged rotation history, guidance, taste evidence, and item index. Do not add branches inside repair or re-plan functions.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
git diff --check
git add apps-script/daily-outfits-v2/Planner.gs src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
git commit -m "feat: guide polished outfits through extreme heat"
```

---

### Task 2: Add cardinality-aware selector primitives without enabling partial runtime delivery

**Files:**
- Modify: `apps-script/daily-outfits-v2/Selection.gs`
- Modify: `apps-script/daily-outfits-v2/JobState.gs`
- Modify: `apps-script/daily-outfits-v2/Diagnostics.gs`
- Test: `src/features/daily-outfits/__tests__/selectionContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

**Interfaces:**
- Change the per-archetype shortage rule from `< 2` to `=== 0`.
- Add `deliveryCoverageForCandidatesV2_`, generalized `candidateSetErrorsV2_`, `archetypeSubsetsV2_`, `enumerateArchetypeSetsV2_`, and `selectExhaustedFinalSetV2_`.
- Keep `runSelectionV2_` fail-closed after its current two rounds; do not wire partial fallback or ledger persistence in this task.
- Add complete coverage fields to every existing full-trio selection result so downstream consumers can change safely in Task 3.
- Relax persisted/diagnostic eligible-count validation from two to one so a complete `{1,1,1}` selection can resume safely; selected cardinality remains exactly three in this task.

- [ ] **Step 1: Extend the existing selector API with real helper exports**

Add these exact members to the type and evaluated expression already named `api` in `selectionContracts.test.ts`:

```ts
candidateSetErrorsV2_: (set: Candidate[], snapshot: object, weather: object, expectedArchetypes?: string[]) => string[];
selectExhaustedFinalSetV2_: (pools: Record<string, Candidate[]>, scores: object[], snapshot: object, weather: object) => {
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
```

- [ ] **Step 2: Write RED tests using only existing builders**

Use `const pools = onePerArchetype()`, `const candidates = Object.values(pools).flat()`, and `const scores = scoresForPools(pools)` for the `{1,1,1}` test. Set `const finalistResult = finalists(candidates, scores)` and assert `finalistResult.needsReplan === null`. Set `const selectionResult = finalSet(finalistResult.finalistPools, scores)` and assert `selectionResult.selectedCandidates` equals `candidates`.

Use `pools.easy[0]` and `pools.expressive[0]` for a configured-order pair, and `pools.expressive[0]` for a singleton. Assert the generalized validator accepts both. Reverse the pair and assert `selected archetypes must follow configured order`. Replace the expressive shoe with `pools.easy[0].shoeId`; assert the repeated-shoe error when `baseSnapshot` has at least two safe shoes and no repeated-shoe error after cloning the snapshot and marking all shoes except `s1` unavailable.

Construct the cardinality-first ranking test from three explicit `makeCandidate` calls: easy uses `t1/b1/s1`, expressive uses `t2/b2/s2`, and polished casual uses `t1/b2/s3`. The polished candidate conflicts with easy on top uniqueness and expressive on bottom uniqueness, while easy+expressive is feasible. Give polished casual a flat score of `10` and the feasible pair flat scores of `8`; assert the exhaustive helper chooses the pair before considering the higher-scored singleton. Construct the singleton test with only the expressive pool. Pass three empty pools and assert the helper returns `null`.

For exhaustive-trio coverage beyond the bounded window, reuse the existing four-candidate-per-archetype selector fixture in the test that distinguishes top-two from top-three search; move the sole compatible polished candidate to index `3`, call the exhaustive helper, and assert a complete trio while the bounded helper still reports `needsReplan`.

For cardinality-two regressions, call the generalized validator directly with `['easy', 'expressive']`: one case gives both candidates top `t1`; one gives both bottom `b1`; one uses distinct ids but clones the snapshot and sets `t1`, `t2`, `b1`, and `b2` to the same `primaryColorFamily` and `silhouette`; one uses easy `t1/b1/s1/l1` and expressive `t2/b2/s1/l1` to share two items; and one gives both candidates layer `l1` with `layerGuidance: 'none'`. Assert the same existing error strings already asserted by the trio tests.

In `appsScriptContracts.test.ts`, create `const pending = currentPendingFixture()` and disqualify candidates at offsets `1..4` in each five-candidate archetype group by mutating their matching critic scores. Create `const snapshot = persistedSnapshotFixture(pending)`, then call `recomputePersistedSelectionFixture(pending, snapshot)` so selected records, eligible counts, composite map, and feasible count all come from the actual replay. Assert every recomputed eligible count is `1` and `policyConsistentSelectionGuard(pending, pending.localDate, pending.wardrobeFingerprint, snapshot)` returns `pending`. In the existing `returns only safe selection diagnostics and stage attempt counts` test, apply the same score mutations and recomputation before calling `getDailyOutfitDiagnosticsV2()`, then expect projected counts of `1`. This test remains exact-three: it proves the new shortage threshold is resumable without enabling partial persistence early.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/features/daily-outfits/__tests__/selectionContracts.test.ts
npm test -- src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
```

Expected: `{1,1,1}` requests a re-plan; dynamic helpers are absent; partial sets fail exact-three validation.

- [ ] **Step 4: Implement coverage and dynamic set validation**

```js
function deliveryCoverageForCandidatesV2_(selectedCandidates) {
  if (!Array.isArray(selectedCandidates) || selectedCandidates.length < 1 || selectedCandidates.length > 3) {
    throw new Error('Selected recommendation count must be between one and three');
  }
  var selectedArchetypes = selectedCandidates.map(function(candidate) { return candidate.archetype; });
  var configuredOrder = DAILY_V2.ARCHETYPES.filter(function(archetype) {
    return selectedArchetypes.indexOf(archetype) >= 0;
  });
  if (JSON.stringify(selectedArchetypes) !== JSON.stringify(configuredOrder)) {
    throw new Error('Selected archetypes must be a configured-order subsequence');
  }
  return {
    deliveryMode: selectedCandidates.length === 3 ? 'complete' : 'partial',
    selectedCount: selectedCandidates.length,
    selectedArchetypes: selectedArchetypes,
    omittedArchetypes: DAILY_V2.ARCHETYPES.filter(function(archetype) {
      return selectedArchetypes.indexOf(archetype) < 0;
    })
  };
}
```

In `selectFinalistsV2_`, replace `< 2` with `=== 0`. Replace `candidateSetErrorsV2_` with:

```js
function candidateSetErrorsV2_(set, snapshot, weather, expectedArchetypes) {
  var errors = [];
  expectedArchetypes = Array.isArray(expectedArchetypes)
    ? expectedArchetypes.slice()
    : DAILY_V2.ARCHETYPES.slice();
  var configuredSubsequence = DAILY_V2.ARCHETYPES.filter(function(archetype) {
    return expectedArchetypes.indexOf(archetype) >= 0;
  });
  if (expectedArchetypes.length < 1 || expectedArchetypes.length > 3 ||
      JSON.stringify(expectedArchetypes) !== JSON.stringify(configuredSubsequence)) {
    return ['selected archetypes must follow configured order'];
  }
  var cardinalityError = expectedArchetypes.length === DAILY_V2.ARCHETYPES.length
    ? 'one candidate per archetype is required'
    : 'one candidate per selected archetype is required';
  if (!Array.isArray(set) || set.length !== expectedArchetypes.length) {
    return [cardinalityError];
  }
  var seenArchetypes = Object.create(null);
  var tops = [];
  var bottoms = [];
  var shoes = [];
  var layers = [];
  var stories = [];
  set.forEach(function(candidate, index) {
    if (!validSelectionCandidateV2_(candidate) ||
        ownSelectionKeyV2_(seenArchetypes, candidate && candidate.archetype)) {
      errors.push(cardinalityError);
      return;
    }
    if (candidate.archetype !== expectedArchetypes[index]) {
      errors.push('selected archetypes must follow configured order');
      return;
    }
    seenArchetypes[candidate.archetype] = true;
    var inventory = selectionCandidateInventoryV2_(candidate, snapshot);
    if (!inventory) {
      errors.push('candidate contains missing, wrong-slot, or incomplete-profile inventory');
      return;
    }
    tops.push(inventory.top.id);
    bottoms.push(inventory.bottom.id);
    shoes.push(inventory.shoe.id);
    if (inventory.layer) layers.push(inventory.layer.id);
    stories.push(JSON.stringify([
      inventory.top.profile.primaryColorFamily,
      inventory.bottom.profile.primaryColorFamily,
      inventory.top.profile.silhouette,
      inventory.bottom.profile.silhouette
    ]));
  });
  if (Object.keys(seenArchetypes).length !== expectedArchetypes.length) {
    errors.push(cardinalityError);
  }
  if (new Set(tops).size !== set.length) errors.push('tops must be unique');
  if (new Set(bottoms).size !== set.length) errors.push('bottoms must be unique');
  if (usableWeatherSafeShoeCountV2_(snapshot, weather) >= set.length &&
      new Set(shoes).size !== set.length) errors.push('shoes must be unique');
  if (new Set(stories).size !== set.length) errors.push('diversity stories must be distinct');
  for (var left = 0; left < set.length; left += 1) {
    for (var right = left + 1; right < set.length; right += 1) {
      if (!validSelectionCandidateV2_(set[left]) || !validSelectionCandidateV2_(set[right])) continue;
      var rightItems = new Set(set[right].itemIds);
      var shared = set[left].itemIds.filter(function(id) { return rightItems.has(id); });
      if (shared.length > 1) errors.push('outfits share more than one item');
    }
  }
  var layerCounts = Object.create(null);
  layers.forEach(function(id) { layerCounts[id] = (layerCounts[id] || 0) + 1; });
  Object.keys(layerCounts).forEach(function(id) {
    if (layerCounts[id] > 1 &&
        (!(weather && weather.layerGuidance === 'required') || credibleLayerCountV2_(snapshot) >= 2)) {
      errors.push('layer repeat is not permitted');
    }
  });
  return Array.from(new Set(errors));
}
```

Add these complete helpers:

```js
function archetypeSubsetsV2_(count) {
  var subsets = [];
  function visit(start, selected) {
    if (selected.length === count) {
      subsets.push(selected.slice());
      return;
    }
    for (var index = start; index < DAILY_V2.ARCHETYPES.length; index += 1) {
      selected.push(DAILY_V2.ARCHETYPES[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return subsets;
}

function enumerateArchetypeSetsV2_(pools, archetypes, limit) {
  var sets = [[]];
  archetypes.forEach(function(archetype) {
    var values = Array.isArray(pools[archetype]) ? pools[archetype] : [];
    if (Number.isInteger(limit)) values = values.slice(0, limit);
    var next = [];
    sets.forEach(function(set) {
      values.forEach(function(candidate) { next.push(set.concat([candidate])); });
    });
    sets = next;
  });
  return sets;
}

function selectExhaustedFinalSetV2_(eligiblePools, scores, snapshot, weather) {
  var scoreIndex = selectionScoreIndexV2_(scores);
  var pools = normalizeFinalistPoolsV2_(eligiblePools || {}, scoreIndex, snapshot);
  for (var cardinality = DAILY_V2.ARCHETYPES.length; cardinality >= 1; cardinality -= 1) {
    var feasible = [];
    archetypeSubsetsV2_(cardinality).forEach(function(archetypes) {
      enumerateArchetypeSetsV2_(pools, archetypes).forEach(function(set) {
        if (!candidateSetErrorsV2_(set, snapshot, weather, archetypes).length) feasible.push(set);
      });
    });
    if (feasible.length) {
      var ranked = rankCandidateSetsV2_(feasible, scores);
      return {
        selectedCandidates: ranked[0],
        deliveryMode: deliveryCoverageForCandidatesV2_(ranked[0]).deliveryMode,
        feasibleSetCount: feasible.length,
        needsReplan: null
      };
    }
  }
  return null;
}
```

Merge `deliveryCoverageForCandidatesV2_(selectedCandidates)` into existing full selection summaries, but leave the terminal `runSelectionV2_` exhaustion throw unchanged.

In `validPersistedSelectionSummaryV2_` and `safeDailySelectionProjectionV2_`, change only the per-archetype count lower bound from `2` to `1`. Keep every exact-three `selectedCandidates` and recommendation assertion until Tasks 3 and 4.

- [ ] **Step 5: Run GREEN, the full suite, and commit**

```bash
npm test -- src/features/daily-outfits/__tests__/selectionContracts.test.ts
npm test -- src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
npm test
git diff --check
git add apps-script/daily-outfits-v2/Selection.gs apps-script/daily-outfits-v2/JobState.gs apps-script/daily-outfits-v2/Diagnostics.gs src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
git commit -m "feat: generalize daily outfit set selection"
```

---

### Task 3: Make every downstream consumer cardinality-aware while runtime still emits trios

**Files:**
- Modify: `apps-script/daily-outfits-v2/Curator.gs`
- Modify: `apps-script/daily-outfits-v2/Repair.gs`
- Modify: `apps-script/daily-outfits-v2/FinalValidation.gs`
- Modify: `apps-script/daily-outfits-v2/JobState.gs`
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs`
- Test: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/historyContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/encoreContracts.test.ts`

**Interfaces:**
- Replace static curator schema use with `curatorSchemaV2_(selectedCount)`.
- Change final validation to `validateFinalBundleV2_(curated, snapshot, weather, history, selectedCandidates, critic, selection)`.
- Change repair and safe-validation wrappers to carry `selection`.
- Change bundle construction to `buildBundleV2_(curated, snapshot, weather, history, selection)` and persist exact coverage.
- Update every production call site and every test stub/argument assertion in this same task.
- Keep persisted selection readiness and runtime output complete-only until Task 4, making this commit backward-safe and fully green.

- [ ] **Step 1: Write RED curator and repair schema tests with current capture arrays**

In the existing curator describe block, change its single selected candidate assertion from `These three outfits are final` to singular copy. Reuse its existing candidate object to call the curator with arrays of length one, two, and three; capture the third `callGeminiV2_` argument and assert `minItems === maxItems === selectedCandidates.length`. Clone the same candidate while changing `candidateId`, `archetype`, and item ids to build the second and third records. Assert arrays of length zero and four throw before the capture array grows.

Repeat the same 1/2/3 schema assertions in the existing repair describe block by capturing the schema argument passed to its `callGeminiV2_` stub. Assert the prompt says `The 1 selected outfit is final`/`Return exactly 1 recommendation record` for one and pluralizes for two/three.

- [ ] **Step 2: Write RED final-validation and bundle tests**

Extend the `finalPolicyFixture()` result already used by `appsScriptContracts.test.ts`. For counts one and two, slice `selected` and `curated.recommendations` to the same count, build selection coverage from the selected archetypes in configured order, and pass that selection as the seventh validator argument. Keep the current three-look fixture as the count-three case.

Update the centralized complete fixtures in the same RED diff. In `appsScriptContracts.test.ts`, add `deliveryMode: 'complete'`, `selectedCount: 3`, all three configured archetypes, and `omittedArchetypes: []` to the selection built by both `persistedSelectionFixture` and `recomputePersistedSelectionFixture`. Add matching `coverage` to `sendablePendingFixture().bundle`, and make `finalPolicyFixture()` return `selection: structuredClone(pending.selection)`. Add the same four selection fields to the direct complete selection used by the bundle block in `encoreContracts.test.ts` and to Scheduler selection stubs in `promptBoundaryContracts.test.ts`. Do not hand-edit each derived pending fixture when it already consumes one of these central builders.

Add this table test after making `finalPolicyFixture()` return `selection`:

```ts
it.each([1, 2, 3])('accepts an exact %i-look final payload', count => {
  const fixture = finalPolicyFixture();
  fixture.selected = fixture.selected.slice(0, count);
  fixture.curated.recommendations = fixture.curated.recommendations.slice(0, count);
  const selectedArchetypes = fixture.selected.map(candidate => candidate.archetype);
  fixture.selection = {
    ...fixture.selection,
    deliveryMode: count === 3 ? 'complete' : 'partial',
    selectedCount: count,
    selectedArchetypes,
    omittedArchetypes: dailyArchetypes.filter(archetype => !selectedArchetypes.includes(archetype)),
  };
  expect(finalValidator(
    fixture.curated,
    fixture.snapshot,
    fixture.weather,
    fixture.history,
    fixture.selected,
    fixture.critic,
    fixture.selection,
  )).toEqual([]);
});
```

For a separate `const fixture = finalPolicyFixture()` sliced to two as above, assert one and three curated recommendations return a count error; reversing `fixture.selected`, duplicating its second archetype, swapping the selection archetype order, changing the first curated candidate id, and changing one omitted archetype each produce a non-empty error list. For the shoe rule, set both selected `shoeId` values and corresponding item ids to the first shoe: it returns the shoe error with the existing snapshot and stops returning that error after every other shoe profile is changed to `available: false`.

Evaluate `buildBundleV2_` from `JobState.gs` in the existing Apps Script graph fixture. Call it for the complete selection and assert `bundle.coverage` equals the three coverage fields. Do the same with the one- and two-look validator fixtures; these direct builder tests do not change runtime selection readiness yet.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/historyContracts.test.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts
```

Expected: static schema, exact-three final validation, missing selection argument, missing bundle coverage, and old four-argument integration assertions fail.

- [ ] **Step 4: Add exact-count schemas and prompts**

```js
function curatorSchemaV2_(selectedCount) {
  if ([1, 2, 3].indexOf(selectedCount) < 0) {
    throw new Error('Curator selected count must be between one and three');
  }
  return {
    type: 'OBJECT',
    properties: {
      recommendations: {
        type: 'ARRAY',
        items: FINAL_RECOMMENDATION_SCHEMA_V2,
        minItems: selectedCount,
        maxItems: selectedCount
      }
    },
    required: ['recommendations']
  };
}
```

`runCuratorV2_` and every `repairFinalBundleV2_` attempt call `curatorSchemaV2_(selectedCandidates.length)`. Both prompts use:

```js
'The ' + selectedCount + ' selected outfit' + (selectedCount === 1 ? ' is' : 's are') + ' final and validated upstream.',
'Return exactly ' + selectedCount + ' recommendation record' + (selectedCount === 1 ? '' : 's') + ' in the same order. Do not swap, reorder, add, remove, or modify any outfit or item.'
```

- [ ] **Step 5: Generalize validation and bundle coverage**

At the start of `validateFinalBundleV2_`, replace the exact-three guard and missing-archetype loop with this code, then leave every existing per-recommendation and pairwise rule in place:

```js
var selectedCount = Array.isArray(selectedCandidates) ? selectedCandidates.length : 0;
if (selectedCount < 1 || selectedCount > 3) {
  errors.push('selected recommendation count must be between one and three');
}
var recommendations = curated && Array.isArray(curated.recommendations)
  ? curated.recommendations
  : [];
if (recommendations.length !== selectedCount) {
  errors.push('final recommendation count must equal selected candidate count');
}
var selectedArchetypes = Array.isArray(selectedCandidates)
  ? selectedCandidates.map(function(candidate) { return candidate.archetype; })
  : [];
var configuredSubsequence = DAILY_V2.ARCHETYPES.filter(function(archetype) {
  return selectedArchetypes.indexOf(archetype) >= 0;
});
var omittedArchetypes = DAILY_V2.ARCHETYPES.filter(function(archetype) {
  return selectedArchetypes.indexOf(archetype) < 0;
});
if (!selection || selection.selectedCount !== selectedCount ||
    JSON.stringify(selectedArchetypes) !== JSON.stringify(configuredSubsequence) ||
    JSON.stringify(selection.selectedArchetypes) !== JSON.stringify(selectedArchetypes) ||
    JSON.stringify(selection.omittedArchetypes) !== JSON.stringify(omittedArchetypes) ||
    selection.deliveryMode !== (selectedCount === 3 ? 'complete' : 'partial')) {
  errors.push('selection coverage does not match selected candidates');
}
```

Scale shoe uniqueness with:

```js
if (Object.keys(shoes).length < selectedCount &&
    usableWeatherSafeShoeCountV2_(snapshot, weather) >= selectedCount) {
  errors.push('shoes must be unique when enough weather-safe options exist');
}
```

`buildBundleV2_` persists:

```js
coverage: {
  deliveryMode: selection.deliveryMode,
  selectedArchetypes: selection.selectedArchetypes.slice(),
  omittedArchetypes: selection.omittedArchetypes.slice()
}
```

For the still-complete runtime path, `validFullBundleReadyV2_` requires coverage equality with `pending.selection`, then passes `pending.selection` to final validation. Task 4 will relax persisted readiness from three to one-through-three only when ledger replay is ready.

- [ ] **Step 6: Update every signature consumer in the same diff**

Pass selection through all three Scheduler pipelines, `validateFinalBundleSafelyV2_`, `repairFinalBundleV2_`, standalone curator/repair/validator functions, and `validFullBundleReadyV2_`. Update `historyContracts.test.ts` validation stubs to accept the seventh argument.

In `encoreContracts.test.ts`, update the scheduler-source regex and all `syncArgs`, `manualArgs`, and `scheduledArgs` assertions at the current `buildBundleV2_` integration block to expect five arguments, with the fifth equal to the selection object. Update every test stub that records validator arguments to accept seven. There must be no four-argument `buildBundleV2_` assertion left.

- [ ] **Step 7: Run focused tests, the full suite, build, lint, and commit**

```bash
npm test -- src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/historyContracts.test.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts
npm test
npm run build
npm run lint
git diff --check
git add apps-script/daily-outfits-v2/Curator.gs apps-script/daily-outfits-v2/Repair.gs apps-script/daily-outfits-v2/FinalValidation.gs apps-script/daily-outfits-v2/JobState.gs apps-script/daily-outfits-v2/Scheduler.gs src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/historyContracts.test.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts
git commit -m "feat: support variable daily outfit bundles"
```

---

### Task 4: Cut over policy-v4 runtime, delivery, and presentation atomically

This task has three red-green phases but one commit. Do not commit or deploy after Phase 4A or 4B: partial runtime output becomes a valid deployable increment only after email, React, and the authenticated diagnostics path are ready in Phase 4C.

#### Phase 4A: Add policy-v4 ledger replay and graceful partial selection

**Files:**
- Modify: `apps-script/daily-outfits-v2/Config.gs`
- Modify: `apps-script/daily-outfits-v2/Planner.gs`
- Modify: `apps-script/daily-outfits-v2/Selection.gs`
- Modify: `apps-script/daily-outfits-v2/JobState.gs`
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs`
- Modify: `apps-script/daily-outfits-v2/Diagnostics.gs`
- Test: `src/features/daily-outfits/__tests__/selectionContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

**Interfaces:**
- `replanArchetypeV2_` gains run-wide used candidate ids before `round`.
- `runSelectionV2_` returns `replanRounds` and a one-to-three winner after round two.
- `pending.replanRounds` becomes mandatory and replayable at selection-ready.
- Policy becomes `4`; stale policy-v3 state regenerates.
- Diagnostics expose counts, archetypes, paths, and three boolean parity proofs, never ids or returned candidate bodies.

- [ ] **Step 1: Replace the conflicting orchestration expectations with concrete policy-v4 tests**

Inside the existing `describe('bounded targeted replan orchestration')`, reuse its actual helpers `initialCandidates`, `plannerResponses`, `replannedCandidates`, `orchestrationApi`, `makeScore`, and `baseSnapshot`.

Change the current “two distinct archetype replans” test so both deterministic rounds target the same weakest archetype; assert calls `[{ archetype: 'easy', round: 1 }, { archetype: 'easy', round: 2 }]`, `replannedArchetypes` contains `['easy', 'easy']`, and ledger targets match.

Change the current duplicate-only test so round one returns five same-combination/new-id candidates, round two returns accepted new combinations, and the critic capture receives only round-two ids. Assert round one has empty accepted ids and all five duplicate ids.

Change the current terminal-throw test so its unchanged safe easy/expressive candidates produce a two-look partial result after two valid rounds. Add a singleton version by lowering every initial and re-plan score except expressive below an unchanged floor. Add a zero-safe version by lowering every score; assert only that version throws `/^quality-exhausted-zero:/`.

Create the “eligible but infeasible archetype” case by keeping at least one eligible candidate in all three pools while making every polished candidate reuse the easy top and expressive bottom. That makes easy+polished fail top uniqueness and polished+expressive fail bottom uniqueness while easy+expressive remains feasible. Assert the exhaustive winner has count two and one omission. Keep malformed response and invalid targeted critic tests as operational throws; neither may return partial.

- [ ] **Step 2: Add prompt and run-wide-id RED assertions**

Update the existing re-plan prompt capture for the new signature. Assert round two receives every initial candidate id and every round-one returned id, including duplicate-disposition ids. Assert each duplicate-disposition candidate appears in failure notes with `criticalDefects: ['duplicate item combination']` and no critic score is fabricated.

- [ ] **Step 3: Replace inferred persistence fixtures with explicit ledger records**

In `appsScriptContracts.test.ts`, modify the existing `persistedReplanFixture` rather than introducing a parallel fixture family:

- add `replanRounds` to its returned pending state;
- put each existing five-candidate re-plan batch in `returnedCandidates`;
- derive accepted ids from the candidates already appended to `pending.candidates`;
- use `duplicateCandidateIds: []` for the current valid fixture;
- add complete coverage fields to `pending.selection`;
- retain the current exact candidate and score order.

In the same fixture migration, change the central current-policy values from `3` to `4`: `dailySelectionRuntime`, `currentPendingFixture`, `sendablePendingFixture` including its bundle, and scheduled/manual state stubs that represent resumable current state. Add `replanRounds: []` to `persistedSelectionFixture` and every no-replan `runSelectionV2_` stub. Keep separate tests that intentionally prove staleness at literal policy `3`; do not mechanically change those stale inputs to `4`.

Extend `deterministicSelectionSelectors` with `exhausted: selectExhaustedFinalSetV2_`, then add this fully connected duplicate-only partial fixture for valid/tamper/recovery tests:

```ts
const persistedDuplicateOnlyPartialFixture = (
  selectedArchetypes: string[] = ['easy', 'expressive'],
) => {
  const pending = currentPendingFixture();
  pending.qualityPolicyVersion = 4;
  const omittedArchetypes = dailyArchetypes.filter(archetype => !selectedArchetypes.includes(archetype));
  const targetArchetype = omittedArchetypes[0];
  const targetPlanner = pending.planners.find(value => value.archetype === targetArchetype);
  if (!targetPlanner || !targetArchetype) throw new Error('fixture re-plan target is missing');
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
  const snapshot = persistedSnapshotFixture(pending);
  const finalists = deterministicSelectionSelectors.finalists(
    pending.candidates,
    pending.critic.scores,
    snapshot,
    pending.weather,
    pending.history,
  );
  const exhausted = deterministicSelectionSelectors.exhausted(
    finalists.eligibleByArchetype,
    pending.critic.scores,
    snapshot,
    pending.weather,
  );
  if (!exhausted || exhausted.selectedCandidates.length !== selectedArchetypes.length) {
    throw new Error('fixture partial winner is missing');
  }
  pending.selectedCandidates = structuredClone(exhausted.selectedCandidates);
  pending.selection = {
    deliveryMode: 'partial',
    selectedCount: selectedArchetypes.length,
    selectedArchetypes: selectedArchetypes.slice(),
    omittedArchetypes,
    eligibleCountByArchetype: { ...finalists.eligibleCountByArchetype },
    compositeById: { ...finalists.compositeById },
    path: 'replan-2',
    feasibleSetCount: exhausted.feasibleSetCount,
    replannedArchetypes: [targetArchetype, targetArchetype],
  };
  return { pending, snapshot };
};
```

Add these valid same-target cardinality assertions:

```ts
it.each([
  [['easy', 'expressive'], 2, ['polished-casual']],
  [['expressive'], 1, ['easy', 'polished-casual']],
] as const)('replays a duplicate-only partial selection for %j', (selected, count, omitted) => {
  const { pending, snapshot } = persistedDuplicateOnlyPartialFixture([...selected]);
  expect(pending.replanRounds.map(round => round.targetArchetype))
    .toEqual([pending.replanRounds[0].targetArchetype, pending.replanRounds[0].targetArchetype]);
  expect(pending.replanRounds[0].acceptedCandidateIds).toEqual([]);
  expect(pending.selection).toMatchObject({
    deliveryMode: 'partial',
    selectedCount: count,
    selectedArchetypes: [...selected],
    omittedArchetypes: [...omitted],
    path: 'replan-2',
  });
  expect(policyConsistentSelectionGuard(
    pending,
    pending.localDate,
    pending.wardrobeFingerprint,
    snapshot,
  )).toBe(pending);
});
```

Add this concrete tamper table; each mutation starts from a fresh two-look fixture:

```ts
const ledgerTamperCases: Array<[
  string,
  (pending: ReturnType<typeof persistedDuplicateOnlyPartialFixture>['pending']) => void,
]> = [
  ['noncontiguous round', pending => { pending.replanRounds[1].round = 3; }],
  ['wrong target', pending => { pending.replanRounds[0].targetArchetype = 'expressive'; }],
  ['reused id', pending => {
    pending.replanRounds[0].returnedCandidates[0].candidateId = pending.candidates[0].candidateId;
  }],
  ['overlapping disposition', pending => {
    pending.replanRounds[0].acceptedCandidateIds.push(
      pending.replanRounds[0].duplicateCandidateIds[0],
    );
  }],
  ['missing disposition', pending => { pending.replanRounds[0].duplicateCandidateIds.pop(); }],
  ['reordered disposition', pending => { pending.replanRounds[0].duplicateCandidateIds.reverse(); }],
  ['candidate universe drift', pending => {
    pending.candidates.push(structuredClone(pending.replanRounds[0].returnedCandidates[0]));
  }],
  ['targeted score drift', pending => {
    pending.critic.scores.push({
      ...structuredClone(pending.critic.scores[0]),
      candidateId: pending.replanRounds[0].duplicateCandidateIds[0],
    });
  }],
  ['partial before two rounds', pending => { pending.replanRounds.pop(); }],
  ['coverage count drift', pending => { pending.selection.selectedCount = 1; }],
  ['coverage order drift', pending => { pending.selection.selectedArchetypes.reverse(); }],
  ['omission drift', pending => { pending.selection.omittedArchetypes = ['expressive']; }],
  ['path drift', pending => { pending.selection.path = 'top2'; }],
];

it.each(ledgerTamperCases)('rejects ledger tampering: %s', (_label, mutate) => {
  const { pending, snapshot } = persistedDuplicateOnlyPartialFixture();
  mutate(pending);
  expect(() => policyConsistentSelectionGuard(
    pending,
    pending.localDate,
    pending.wardrobeFingerprint,
    snapshot,
  )).toThrow('Deterministic selection must be ready');
});

it('rejects ledger rounds appended after an initial bounded winner', () => {
  const pending = currentPendingFixture();
  pending.qualityPolicyVersion = 4;
  const easy = pending.planners.find(value => value.archetype === 'easy');
  if (!easy) throw new Error('fixture easy planner is missing');
  pending.replanRounds = ([1, 2] as const).map(round => {
    const returnedCandidates = easy.candidates.map((candidate, index) => ({
      ...structuredClone(candidate),
      candidateId: `easy-false-round-${round}-${index}`,
    }));
    return {
      round,
      targetArchetype: 'easy',
      structurallyValid: true,
      returnedCandidates,
      acceptedCandidateIds: [] as string[],
      duplicateCandidateIds: returnedCandidates.map(candidate => candidate.candidateId),
    };
  });
  const snapshot = persistedSnapshotFixture(pending);
  expect(() => policyConsistentSelectionGuard(
    pending,
    pending.localDate,
    pending.wardrobeFingerprint,
    snapshot,
  )).toThrow('Deterministic selection must be ready');
});
```

Add this exhaustive-trio fixture and test:

```ts
const persistedExhaustiveTrioFixture = () => {
  const pending = currentPendingFixture();
  pending.qualityPolicyVersion = 4;
  const replaceShoe = (candidate: ReturnType<typeof persistedPlannerCandidateFixture>, shoeId: string) => {
    candidate.shoeId = shoeId;
    candidate.itemIds = [candidate.topId, candidate.bottomId, shoeId];
  };
  pending.planners.flatMap(value => value.candidates).forEach(candidate => {
    const shoeId = candidate.archetype === 'easy'
      ? 'easy-shared'
      : candidate.archetype === 'expressive'
        ? 'expressive-shared'
        : candidate.shoeId;
    replaceShoe(candidate, shoeId);
    const persisted = pending.candidates.find(value => value.candidateId === candidate.candidateId);
    if (!persisted) throw new Error('fixture initial candidate is disconnected');
    replaceShoe(persisted, shoeId);
  });
  pending.critic.scores.forEach(score => {
    if (score.candidateId.startsWith('polished-casual-')) {
      score.disqualified = true;
      score.criticalDefects = ['fixture forces targeted re-plan'];
    }
  });
  const roundOne = Array.from({ length: 5 }, (_, index) =>
    persistedPlannerCandidateFixture('polished-casual', index + 5));
  const roundTwo = Array.from({ length: 5 }, (_, index) => {
    const candidate = persistedPlannerCandidateFixture('polished-casual', index + 10);
    replaceShoe(
      candidate,
      index < 3 ? 'easy-shared' : index === 3 ? 'polished-unique' : 'expressive-shared',
    );
    return candidate;
  });
  const scoreFor = (
    candidate: ReturnType<typeof persistedPlannerCandidateFixture>,
    value: number,
    disqualified: boolean,
  ) => ({
    ...Object.fromEntries(Object.keys(dailyCompositeWeights).map(metric => [metric, value])),
    candidateId: candidate.candidateId,
    disqualified,
    criticalDefects: disqualified ? ['fixture forces targeted re-plan'] : [],
    reservations: [] as string[],
  });
  pending.candidates.push(...structuredClone(roundOne), ...structuredClone(roundTwo));
  pending.critic.scores.push(
    ...roundOne.map(candidate => scoreFor(candidate, 9, true)),
    ...roundTwo.map((candidate, index) => scoreFor(candidate, index < 3 ? 9 : index === 3 ? 8 : 7, false)),
  );
  pending.replanRounds = [roundOne, roundTwo].map((returnedCandidates, index) => ({
    round: index + 1,
    targetArchetype: 'polished-casual',
    structurallyValid: true,
    returnedCandidates: structuredClone(returnedCandidates),
    acceptedCandidateIds: returnedCandidates.map(candidate => candidate.candidateId),
    duplicateCandidateIds: [] as string[],
  }));
  const snapshot = persistedSnapshotFixture(pending);
  const finalists = deterministicSelectionSelectors.finalists(
    pending.candidates,
    pending.critic.scores,
    snapshot,
    pending.weather,
    pending.history,
  );
  const bounded = deterministicSelectionSelectors.finalSet(
    finalists.finalistPools,
    pending.critic.scores,
    snapshot,
    pending.weather,
  );
  if (bounded.selectedCandidates) throw new Error('fixture unexpectedly has a bounded trio');
  const exhausted = deterministicSelectionSelectors.exhausted(
    finalists.eligibleByArchetype,
    pending.critic.scores,
    snapshot,
    pending.weather,
  );
  if (!exhausted || exhausted.selectedCandidates.length !== 3) {
    throw new Error('fixture exhaustive trio is missing');
  }
  pending.selectedCandidates = structuredClone(exhausted.selectedCandidates);
  pending.selection = {
    deliveryMode: 'complete',
    selectedCount: 3,
    selectedArchetypes: [...dailyArchetypes],
    omittedArchetypes: [] as string[],
    eligibleCountByArchetype: { ...finalists.eligibleCountByArchetype },
    compositeById: { ...finalists.compositeById },
    path: 'replan-2',
    feasibleSetCount: exhausted.feasibleSetCount,
    replannedArchetypes: ['polished-casual', 'polished-casual'],
  };
  return { pending, snapshot };
};

it('replays a complete trio found only by the post-round-two exhaustive search', () => {
  const { pending, snapshot } = persistedExhaustiveTrioFixture();
  expect(pending.selectedCandidates.map(candidate => candidate.candidateId))
    .toContain('polished-casual-candidate-13');
  expect(policyConsistentSelectionGuard(
    pending,
    pending.localDate,
    pending.wardrobeFingerprint,
    snapshot,
  )).toBe(pending);
});
```

For zero-safe scheduler coverage, reuse the existing scheduler catch test and make its `runSelectionV2_` stub throw `new Error('quality-exhausted-zero: no eligible daily outfit recommendation remains')`; assert the logged reason is `quality-exhausted-zero`, no `bundle` is saved, and `MailApp.sendEmail` is never called.

- [ ] **Step 4: Run RED**

```bash
npm test -- src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
```

Expected: repeated targets, duplicate-only rounds, explicit ledger replay, policy 4, and partial fallback fail.

- [ ] **Step 5: Add explicit round classification and prompts**

Add this classifier; keep `validateReplanResponseV2_`'s exact-five, target-archetype, structurally valid, response-local unique-id checks:

```js
function classifyReplanCandidatesV2_(existing, priorRounds, returnedCandidates) {
  var seenIds = Object.create(null);
  var seenCombinations = Object.create(null);
  existing.forEach(function(candidate) {
    seenIds[candidate.candidateId] = true;
    seenCombinations[canonicalSelectionIdListV2_(candidate.itemIds)] = true;
  });
  priorRounds.forEach(function(round) {
    round.returnedCandidates.forEach(function(candidate) {
      seenIds[candidate.candidateId] = true;
      seenCombinations[canonicalSelectionIdListV2_(candidate.itemIds)] = true;
    });
  });
  var acceptedCandidates = [];
  var acceptedCandidateIds = [];
  var duplicateCandidateIds = [];
  returnedCandidates.forEach(function(candidate) {
    if (seenIds[candidate.candidateId]) {
      throw new Error('Targeted re-plan reused candidateId ' + candidate.candidateId);
    }
    seenIds[candidate.candidateId] = true;
    var combination = canonicalSelectionIdListV2_(candidate.itemIds);
    if (seenCombinations[combination]) {
      duplicateCandidateIds.push(candidate.candidateId);
    } else {
      seenCombinations[combination] = true;
      acceptedCandidates.push(candidate);
      acceptedCandidateIds.push(candidate.candidateId);
    }
  });
  return {
    acceptedCandidates: acceptedCandidates,
    acceptedCandidateIds: acceptedCandidateIds,
    duplicateCandidateIds: duplicateCandidateIds
  };
}
```

Pass `candidates.map(candidate => candidate.candidateId)` concatenated with every prior round's returned ids to `replanArchetypeV2_` and its repair path. Add `Do not reuse any candidateId from this run-wide list: ` plus the JSON list to `plannerPartsV2_`. Build failure notes from scored target candidates and append `{ candidateId, criticalDefects: ['duplicate item combination'], reservations: [] }` for every duplicate-disposition ledger candidate. Call the targeted critic only when `classification.acceptedCandidates.length > 0`.

- [ ] **Step 6: Rewrite the bounded loop and terminal fallback**

Replace the current orchestration loop with this structure; keep the current initial planner/critic structural checks before it and the current targeted critic structural check where indicated:

```js
var replanRounds = [];
var replannedArchetypes = [];
for (var round = 0; round <= 2; round += 1) {
  var finalists = selectFinalistsV2_(candidates, scores, snapshot, weather, history);
  var setResult = finalists.needsReplan
    ? { needsReplan: finalists.needsReplan, feasibleSetCount: 0 }
    : selectFinalSetV2_(finalists.finalistPools, scores, snapshot, weather);

  if (!setResult.needsReplan && setResult.selectedCandidates) {
    var boundedCoverage = deliveryCoverageForCandidatesV2_(setResult.selectedCandidates);
    return {
      candidates: candidates,
      critic: { scores: scores },
      selectedCandidates: setResult.selectedCandidates,
      replanRounds: replanRounds,
      selection: Object.assign({
        eligibleCountByArchetype: finalists.eligibleCountByArchetype,
        compositeById: finalists.compositeById,
        path: round ? 'replan-' + round : setResult.path,
        feasibleSetCount: setResult.feasibleSetCount,
        replannedArchetypes: replannedArchetypes.slice()
      }, boundedCoverage)
    };
  }

  if (round === 2) {
    var exhausted = selectExhaustedFinalSetV2_(
      finalists.eligibleByArchetype,
      scores,
      snapshot,
      weather
    );
    if (!exhausted) {
      throw new Error('quality-exhausted-zero: no eligible daily outfit recommendation remains');
    }
    var exhaustedCoverage = deliveryCoverageForCandidatesV2_(exhausted.selectedCandidates);
    return {
      candidates: candidates,
      critic: { scores: scores },
      selectedCandidates: exhausted.selectedCandidates,
      replanRounds: replanRounds,
      selection: Object.assign({
        eligibleCountByArchetype: finalists.eligibleCountByArchetype,
        compositeById: finalists.compositeById,
        path: 'replan-2',
        feasibleSetCount: exhausted.feasibleSetCount,
        replannedArchetypes: replannedArchetypes.slice()
      }, exhaustedCoverage)
    };
  }

  var archetype = setResult.needsReplan;
  if (!archetype || DAILY_V2.ARCHETYPES.indexOf(archetype) < 0) {
    throw new Error('No archetype remains for targeted re-plan');
  }
  var usedCandidateIds = Array.from(new Set(candidates.map(function(candidate) {
    return candidate.candidateId;
  }).concat(replanRounds.flatMap(function(record) {
    return record.returnedCandidates.map(function(candidate) { return candidate.candidateId; });
  }))));
  var scoreMap = selectionScoreMapV2_(scores);
  var failed = candidates.filter(function(candidate) {
    return candidate.archetype === archetype;
  }).map(function(candidate) {
    var score = scoreMap[candidate.candidateId] || {};
    return {
      candidateId: candidate.candidateId,
      criticalDefects: Array.isArray(score.criticalDefects) ? score.criticalDefects.slice() : [],
      reservations: Array.isArray(score.reservations) ? score.reservations.slice() : []
    };
  });
  replanRounds.forEach(function(record) {
    record.returnedCandidates.forEach(function(candidate) {
      if (candidate.archetype === archetype &&
          record.duplicateCandidateIds.indexOf(candidate.candidateId) >= 0) {
        failed.push({
          candidateId: candidate.candidateId,
          criticalDefects: ['duplicate item combination'],
          reservations: []
        });
      }
    });
  });
  var claimed = DAILY_V2.ARCHETYPES.filter(function(value) {
    return value !== archetype;
  }).flatMap(function(value) {
    return (finalists.finalistPools[value] || []).slice(0, 2).flatMap(function(candidate) {
      return candidate.itemIds;
    });
  });
  var replanned = replanArchetypeV2_(
    archetype,
    snapshot,
    weather,
    history,
    failed,
    Array.from(new Set(claimed)),
    usedCandidateIds,
    round + 1
  );
  validateReplanResponseV2_(replanned, archetype);
  var classification = classifyReplanCandidatesV2_(candidates, replanRounds, replanned.candidates);
  replanRounds.push({
    round: round + 1,
    targetArchetype: archetype,
    structurallyValid: true,
    returnedCandidates: replanned.candidates.slice(),
    acceptedCandidateIds: classification.acceptedCandidateIds.slice(),
    duplicateCandidateIds: classification.duplicateCandidateIds.slice()
  });
  if (classification.acceptedCandidates.length) {
    var targetedCritic = runCriticCandidatesV2_(snapshot, weather, history, classification.acceptedCandidates);
    var targetedScores = targetedCritic && Array.isArray(targetedCritic.scores)
      ? targetedCritic.scores
      : [];
    var targetedErrors = selectionOrchestrationErrorsV2_(
      classification.acceptedCandidates,
      targetedScores,
      'Targeted critic scores'
    );
    if (targetedErrors.length) throw new Error(targetedErrors.join('; '));
    candidates = candidates.concat(classification.acceptedCandidates);
    scores = scores.concat(targetedScores);
  }
  replannedArchetypes.push(archetype);
}
```

- [ ] **Step 7: Persist and replay the exact policy-v4 graph**

Set `QUALITY_POLICY_VERSION: 4`. Persist `selected.replanRounds` in direct, manual, and scheduled paths. Remove the current global combination rejection from `persistedSelectionCandidatesV2_`; keep its global id check and exact initial-candidate prefix check.

Replace the inferred-round parser with this explicit ledger parser:

```js
function persistedReplanRoundsV2_(pending, plannerCandidates, snapshot) {
  if (!ownDailyJobKeyV2_(pending, 'replanRounds') || !Array.isArray(pending.replanRounds) ||
      pending.replanRounds.length > 2) return null;
  var replayCandidates = plannerCandidates.slice();
  var replayRounds = [];
  for (var index = 0; index < pending.replanRounds.length; index += 1) {
    if (!ownDailyJobKeyV2_(pending.replanRounds, index)) return null;
    var record = pending.replanRounds[index];
    if (!validOwnDailyRecordV2_(record) || record.round !== index + 1 ||
        DAILY_V2.ARCHETYPES.indexOf(record.targetArchetype) < 0 ||
        record.structurallyValid !== true ||
        !validOwnDailyArrayV2_(record.returnedCandidates, 5) ||
        !validPersistedCandidateGroupQualityV2_(
          record.returnedCandidates,
          record.targetArchetype,
          snapshot
        ) ||
        !validOwnDailyStringArrayV2_(record.acceptedCandidateIds) ||
        !validOwnDailyStringArrayV2_(record.duplicateCandidateIds)) return null;
    var classification;
    try {
      classification = classifyReplanCandidatesV2_(
        replayCandidates,
        replayRounds,
        record.returnedCandidates
      );
    } catch (_ignored) {
      return null;
    }
    if (!exactPersistedDailyValueV2_(
      record.acceptedCandidateIds,
      classification.acceptedCandidateIds
    ) || !exactPersistedDailyValueV2_(
      record.duplicateCandidateIds,
      classification.duplicateCandidateIds
    )) return null;
    replayRounds.push(record);
    replayCandidates = replayCandidates.concat(classification.acceptedCandidates);
  }
  return { rounds: replayRounds, candidates: replayCandidates };
}
```

Replace `validRecomputedPersistedSelectionV2_` with:

```js
function validRecomputedPersistedSelectionV2_(pending, plannerCandidates, snapshot) {
  if (!validPersistedSelectionSummaryV2_(pending.selection) ||
      typeof selectFinalistsV2_ !== 'function' ||
      typeof selectFinalSetV2_ !== 'function' ||
      typeof selectExhaustedFinalSetV2_ !== 'function') return false;
  var ledger = persistedReplanRoundsV2_(pending, plannerCandidates, snapshot);
  if (!ledger || !exactPersistedCandidateArrayV2_(pending.candidates, ledger.candidates) ||
      !validPersistedCriticForCandidatesV2_(pending.critic, ledger.candidates)) return false;

  var replayCandidates = plannerCandidates.slice();
  var replayScores = pending.critic.scores.slice(0, plannerCandidates.length);
  var scoreCursor = plannerCandidates.length;
  var replayRounds = [];
  var targets = [];

  function matches(finalists, result, path) {
    if (!result || !Array.isArray(result.selectedCandidates)) return false;
    var coverage;
    try { coverage = deliveryCoverageForCandidatesV2_(result.selectedCandidates); }
    catch (_ignoredCoverage) { return false; }
    return pending.selection.path === path &&
      pending.selection.feasibleSetCount === result.feasibleSetCount &&
      pending.selection.deliveryMode === coverage.deliveryMode &&
      pending.selection.selectedCount === coverage.selectedCount &&
      exactPersistedDailyValueV2_(pending.selection.selectedArchetypes, coverage.selectedArchetypes) &&
      exactPersistedDailyValueV2_(pending.selection.omittedArchetypes, coverage.omittedArchetypes) &&
      exactPersistedDailyValueV2_(pending.selection.replannedArchetypes, targets) &&
      exactPersistedSelectionMapV2_(
        pending.selection.eligibleCountByArchetype,
        finalists.eligibleCountByArchetype
      ) &&
      exactPersistedSelectionMapV2_(pending.selection.compositeById, finalists.compositeById) &&
      exactPersistedCandidateArrayV2_(pending.selectedCandidates, result.selectedCandidates);
  }

  for (var attempt = 0; attempt <= ledger.rounds.length; attempt += 1) {
    var finalists = selectFinalistsV2_(
      replayCandidates,
      replayScores,
      snapshot,
      pending.weather,
      pending.history
    );
    var bounded = finalists.needsReplan
      ? { needsReplan: finalists.needsReplan, feasibleSetCount: 0 }
      : selectFinalSetV2_(finalists.finalistPools, replayScores, snapshot, pending.weather);
    if (!bounded.needsReplan && bounded.selectedCandidates) {
      return attempt === ledger.rounds.length && matches(
        finalists,
        bounded,
        attempt ? 'replan-' + attempt : bounded.path
      );
    }
    if (attempt === ledger.rounds.length) {
      if (ledger.rounds.length !== 2) return false;
      var exhausted = selectExhaustedFinalSetV2_(
        finalists.eligibleByArchetype,
        replayScores,
        snapshot,
        pending.weather
      );
      return Boolean(exhausted) && matches(finalists, exhausted, 'replan-2');
    }
    var record = ledger.rounds[attempt];
    if (!bounded.needsReplan || record.targetArchetype !== bounded.needsReplan) return false;
    var classification = classifyReplanCandidatesV2_(
      replayCandidates,
      replayRounds,
      record.returnedCandidates
    );
    var acceptedScores = pending.critic.scores.slice(
      scoreCursor,
      scoreCursor + classification.acceptedCandidates.length
    );
    if (!validPersistedCriticForCandidatesV2_(acceptedScores.length
      ? { scores: acceptedScores }
      : { scores: [] }, classification.acceptedCandidates)) return false;
    replayCandidates = replayCandidates.concat(classification.acceptedCandidates);
    replayScores = replayScores.concat(acceptedScores);
    scoreCursor += classification.acceptedCandidates.length;
    replayRounds.push(record);
    targets.push(record.targetArchetype);
  }
  return false;
}
```

Update its caller to pass `plannerCandidates` rather than the old inferred candidate array. `validPersistedSelectionSummaryV2_` requires all four coverage fields and enforces the exact complete/partial partition. `assertDeterministicSelectionReadyV2_` accepts selected length `1..3`; partial requires two rounds and `replan-2`. `validFullBundleReadyV2_` requires recommendation length equal to `selection.selectedCount` and exact candidate/coverage parity. Policy-v3 pending state is stale and regenerates.

- [ ] **Step 8: Add safe boolean-only parity diagnostics**

Project these fields after calling the same strict bundle-ready validator. Compute `bundleReady` first so selection-ready diagnostics never dereference an absent bundle:

```js
var bundleReady = Boolean(pending.bundle) &&
  validFullBundleReadyV2_(pending, snapshot, pending.localDate);
var recommendationSelectionOrderMatches = bundleReady &&
  pending.bundle.recommendations.every(function(value, index) {
    return value.candidateId === pending.selectedCandidates[index].candidateId;
  });
var coverageSelectionOrderMatches = bundleReady &&
  JSON.stringify(pending.bundle.coverage.selectedArchetypes) ===
    JSON.stringify(selection.selectedArchetypes);

return {
  deliveryMode: selection.deliveryMode,
  selectedCount: selection.selectedCount,
  selectedArchetypes: selection.selectedArchetypes.slice(),
  omittedArchetypes: selection.omittedArchetypes.slice(),
  eligibleCountByArchetype: Object.assign({}, selection.eligibleCountByArchetype),
  path: selection.path,
  feasibleSetCount: selection.feasibleSetCount,
  replannedArchetypes: selection.replannedArchetypes.slice(),
  replanRounds: pending.replanRounds.map(function(round) {
    return {
      round: round.round,
      targetArchetype: round.targetArchetype,
      acceptedCandidateCount: round.acceptedCandidateIds.length,
      duplicateCandidateCount: round.duplicateCandidateIds.length
    };
  }),
  extremeHeatPolishedCasualActive: pending.weather.middayFeelsLikeF > 90,
  bundleReadyValidationPassed: bundleReady,
  recommendationSelectionOrderMatches: recommendationSelectionOrderMatches,
  coverageSelectionOrderMatches: coverageSelectionOrderMatches
};
```

Return no ids, recommendation bodies, scores, or returned candidates. Invalid state returns no selection diagnostics. Log reason is `quality-exhausted-zero` only for the stable prefix; every other catch remains `generation-failed`.

- [ ] **Step 9: Run the Phase 4A checkpoint without committing**

```bash
npm test -- src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
npm test
npm run build
npm run lint
git diff --check
```

---

#### Phase 4B: Render, send, reconcile, and record partial bundles honestly

**Files:**
- Modify: `apps-script/daily-outfits-v2/Email.gs`
- Modify: `apps-script/daily-outfits-v2/JobState.gs`
- Test: `src/features/daily-outfits/__tests__/encoreContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`

**Interfaces:**
- Add `generatedOutfitCountCopyV2_` and `coverageNoteV2_`.
- Generated count comes only from `bundle.recommendations.length`.
- Recovery/history preserves the exact validated partial array; Encore remains separate.

- [ ] **Step 1: Write RED email tests from existing bundle fixtures**

In `encoreContracts.test.ts`, change the artificial zero-generated renderer fixture to one valid generated recommendation plus matching partial coverage. From that fixture create count-two and count-three variants by cloning existing recommendation records and changing candidate/archetype/item ids consistently.

For count copies `Today's outfit`, `Today's 2 outfits`, and `Today's 3 outfits`, assert the captured full subject equals ``[TEST] ${countCopy} — ${Math.round(weatherForEmail.highTemperatureF)}° / ${weatherForEmail.weatherPhrase || 'daily forecast'}``; assert the HTML/plain headings equal `countCopy` without the test prefix or weather suffix. For one omission assert exactly one identical cause-neutral sentence in HTML and plain text. For two omissions assert configured-order labels joined by `and` plus `were omitted`. Complete coverage has no omission sentence. Add Encore to the one-look fixture and assert the subject/heading stays singular and the Encore section follows the generated card.

In `sendRecoveryContracts.test.ts`, clone the existing valid pending send fixture, slice selected candidates and recommendations to two, and replace selection/bundle coverage with matching partial coverage. Assert reconciliation sends no second email, records exactly those two recommendations once, reaches `sent`, and a second finalization does not append history. Repeat at count one with Encore and existing feedback. Mutate only bundle coverage and assert reconciliation writes no history.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
```

Expected: hardcoded three-outfit copy and missing omission note fail.

- [ ] **Step 3: Add exact count and omission helpers**

```js
function generatedOutfitCountCopyV2_(count) {
  if (count === 1) return "Today's outfit";
  if (count === 2 || count === 3) return "Today's " + count + " outfits";
  throw new Error('Generated recommendation count must be between one and three');
}

function humanArchetypeLabelV2_(value) {
  return value === 'polished-casual'
    ? 'Polished casual'
    : value.charAt(0).toUpperCase() + value.slice(1);
}

function coverageNoteV2_(coverage) {
  if (!coverage || coverage.deliveryMode !== 'partial') return '';
  var labels = coverage.omittedArchetypes.map(humanArchetypeLabelV2_);
  var subject = labels.length === 1 ? labels[0] : labels.join(' and ');
  return subject + (labels.length === 1 ? ' was' : ' were') +
    " omitted after today's quality, weather, and outfit-distinctness checks.";
}
```

At the start of `renderDailyEmailV2_`, immediately after the strict readiness guard, add:

```js
var generatedCopy = generatedOutfitCountCopyV2_(bundle.recommendations.length);
var omissionCopy = coverageNoteV2_(bundle.coverage);
```

After creating `plain`, append `generatedCopy`; append `omissionCopy` only when non-empty; then append a blank line before mapping cards. In the HTML header, after the weather summary and before `sections`, insert:

```js
'<h2 style="margin:24px 0 8px;font:400 24px Arial,sans-serif">' +
  escapeHtmlV2_(generatedCopy) + '</h2>' +
(omissionCopy
  ? '<p style="margin:0 0 24px;color:#666;font:400 13px/1.6 Arial,sans-serif">' +
      escapeHtmlV2_(omissionCopy) + '</p>'
  : '')
```

Replace the hardcoded subject with:

```js
var subject = (testMode ? '[TEST] ' : '') +
  generatedOutfitCountCopyV2_(bundle.recommendations.length) + ' — ' +
  Math.round(bundle.weather.highTemperatureF) + '° / ' +
  (bundle.weather.weatherPhrase || 'daily forecast');
```

Never derive omissions from recommendations and never inspect Encore in count helpers.

- [ ] **Step 4: Keep send and history boundaries strict**

Do not change `recordSentBundleV2_`'s recommendation mapping: it already persists the input array generically. In `sendDailyBundleNowV2_`, `sendDailyBundleNowV2`, `sendDailyTestEmailV2`, `reconcilePersistedSentBundleV2_`, and `finalizeSentBundleV2_`, retain or add `validFullBundleReadyV2_` before the first `MailApp.sendEmail`, property mutation, or history write. Keep the existing `history.filter(entry.localDate !== bundle.localDate)` replacement path so retrying finalization replaces rather than appends. Persist `bundle.encore` only through its current separate field and feedback path.

- [ ] **Step 5: Run the Phase 4B checkpoint without committing**

```bash
npm test -- src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
npm test
git diff --check
```

---

#### Phase 4C: Present one through three looks and expose safe diagnostics in React

**Files:**
- Modify: `apps-script/daily-outfits-v2/WebApp.gs`
- Modify: `src/features/daily-outfits/types.ts`
- Modify: `src/features/daily-outfits/syncClient.ts`
- Modify: `src/features/daily-outfits/DailyBundlePreview.tsx`
- Modify: `src/features/daily-outfits/DailyOutfitSettings.tsx`
- Modify: `src/features/daily-outfits/daily-outfits.css`
- Test: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`
- Test: `src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx`
- Create: `src/features/daily-outfits/__tests__/DailyOutfitSettings.test.tsx`

**Interfaces:**
- `DailyBundleV2.recommendations` becomes a strict one/two/three tuple union.
- `DailyBundleV2.coverage` is required for server data; the preview alone tolerates missing coverage for a legacy cached three-look bundle.
- Grid class is `is-1`, `is-2`, or `is-3`.
- Authenticated server action `getDailyOutfitDiagnosticsV2` returns only the safe diagnostics projection and the settings dialog renders it for shadow verification.

- [ ] **Step 1: Write RED preview tests with the current `bundle` fixture**

In `DailyBundlePreview.test.tsx`, import `DailyBundleCoverageV2` with the existing type imports and add this real builder beside the existing `bundle` helper:

```ts
const recommendation = (archetype: 'easy' | 'polished-casual' | 'expressive', index: number) => ({
  candidateId: `look-${index}`,
  archetype,
  name: `Look ${index + 1}`,
  itemIds: ['top', 'bottom', 'shoe'],
  colorHook: 'Navy against cream.',
  whyItWorks: 'The proportions and colors work together.',
  weatherNote: 'Comfortable for the forecast.',
});
```

Build the two-look fixture with `recommendations: [recommendation('easy', 0), recommendation('expressive', 1)]` and partial coverage selecting easy/expressive and omitting polished casual. Assert exactly two `.daily-look` articles in static markup, `Today's 2 outfits`, class `daily-looks is-2`, and the cause-neutral omission sentence.

Build the one-look fixture with `[recommendation('expressive', 0)]`, partial coverage selecting expressive and omitting easy/polished casual, plus the existing Encore object. Assert singular heading and Encore after the generated article. Build the three-look fixture from all three helper calls plus complete coverage and assert no omission note. For legacy cache, clone the complete fixture to `const legacy = structuredClone(complete) as Omit<DailyBundleV2, 'coverage'> & { coverage?: DailyBundleCoverageV2 }`, delete `legacy.coverage`, cast only at the `render(legacy as DailyBundleV2)` boundary, and assert render does not throw or render a coverage note.

Read the CSS source in the existing source-contract style and assert selectors `.daily-looks.is-1`, `.is-2`, `.is-3`, plus the mobile one-column rule. Create `DailyOutfitSettings.test.tsx`, render with the same required props used by existing settings call sites, and assert the approved two-sentence promise, an `Inspect diagnostics` button, and absence of `Three full-wardrobe`.

In `appsScriptContracts.test.ts`, add an authenticated `doPost` test. Evaluate `WebApp.gs` with `DAILY_V2.MAX_POST_BYTES = 100000`, `getRequiredPropertyV2_` returning `test-secret-value`, `getDailyOutfitDiagnosticsV2` returning `{ selection: { bundleReadyValidationPassed: true } }`, and a `ContentService.createTextOutput` stub whose `setMimeType` returns the same captured output object. Send an event whose JSON body is `{ action: 'getDailyOutfitDiagnosticsV2', secret: 'test-secret-value' }`; parse the captured response text and assert it equals:

```ts
{
  ok: true,
  action: 'getDailyOutfitDiagnosticsV2',
  diagnostics: { selection: { bundleReadyValidationPassed: true } }
}
```

Call the same evaluator with a wrong secret and assert `ok` is false and the diagnostic function was not called.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx src/features/daily-outfits/__tests__/DailyOutfitSettings.test.tsx
npm test -- src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
```

Expected: tuple/coverage contracts, dynamic heading, classes, settings copy, and authenticated diagnostics action are absent.

- [ ] **Step 3: Add strict types and dynamic rendering**

```ts
export type DailyRecommendationSetV2 =
  | [DailyFinalRecommendationV2]
  | [DailyFinalRecommendationV2, DailyFinalRecommendationV2]
  | [DailyFinalRecommendationV2, DailyFinalRecommendationV2, DailyFinalRecommendationV2];
```

Add these types, make `DailyBundleV2.coverage` required, and set `recommendations: DailyRecommendationSetV2`:

```ts
export type DailyDeliveryModeV2 = 'complete' | 'partial';

export interface DailyBundleCoverageV2 {
  deliveryMode: DailyDeliveryModeV2;
  selectedArchetypes: DailyArchetype[];
  omittedArchetypes: DailyArchetype[];
}
```

At the start of `DailyBundlePreview`, add:

```ts
const generatedCountCopy = bundle.recommendations.length === 1
  ? "Today's outfit"
  : `Today's ${bundle.recommendations.length} outfits`;
const omittedLabels = (bundle.coverage?.omittedArchetypes ?? [])
  .map(archetype => ARCHETYPE_LABELS[archetype]);
const coverageNote = bundle.coverage?.deliveryMode === 'partial' && omittedLabels.length
  ? `${omittedLabels.join(' and ')} ${omittedLabels.length === 1 ? 'was' : 'were'} omitted after today's quality, weather, and outfit-distinctness checks.`
  : '';
```

After `.daily-weather-copy`, render `<h4 className="daily-generated-count">{generatedCountCopy}</h4>` and a `.daily-coverage-note` paragraph only when `coverageNote` is non-empty. Change the grid to `<div className={`daily-looks is-${bundle.recommendations.length}`}>`. Optional coverage access is intentional only for old browser cache.

- [ ] **Step 4: Add intentional layouts and truthful settings copy**

Add these rules after the existing `.daily-looks` base rule:

```css
.daily-looks.is-1 { grid-template-columns: minmax(0,420px); justify-content: center; }
.daily-looks.is-2 { grid-template-columns: repeat(2,minmax(0,1fr)); max-width: 760px; }
.daily-looks.is-3 { grid-template-columns: repeat(3,minmax(0,1fr)); }
.daily-generated-count { margin: 20px 0 0; }
.daily-coverage-note { margin: 8px 0 20px; color: #6a685f; font-size: .74rem; }
.daily-diagnostics { max-height: 320px; overflow: auto; white-space: pre-wrap; }
```

Inside the existing `@media (max-width: 760px)` block, set `.daily-looks.is-1,.daily-looks.is-2,.daily-looks.is-3 { grid-template-columns:1fr; max-width:none; }`. Replace the settings paragraph with:

```text
Up to three distinct looks: Easy, Polished casual, and Expressive. If a complete set cannot meet the day's quality, weather, and outfit-distinctness bars after re-planning, the safe looks are still delivered.
```

- [ ] **Step 5: Add the authenticated diagnostics action and visible safe projection**

Add `'getDailyOutfitDiagnosticsV2'` to `DailyServerAction`. Export `DailyServerResponse` and add `diagnostics?: DailyOutfitDiagnosticsV2`. Add this type in `types.ts`:

```ts
export interface DailyOutfitDiagnosticsV2 {
  snapshot: { ok: boolean; generatedAt: number; itemCount: number; atlasPageCount: number } | null;
  job: {
    localDate: string;
    qualityPolicyVersion: number;
    stage: string;
    startedAt?: number;
    updatedAt?: number;
  } | null;
  selection: {
    deliveryMode: DailyDeliveryModeV2;
    selectedCount: 1 | 2 | 3;
    selectedArchetypes: DailyArchetype[];
    omittedArchetypes: DailyArchetype[];
    eligibleCountByArchetype: Record<DailyArchetype, number>;
    path: 'top2' | 'top3' | 'replan-1' | 'replan-2';
    feasibleSetCount: number;
    replannedArchetypes: DailyArchetype[];
    replanRounds: Array<{
      round: 1 | 2;
      targetArchetype: DailyArchetype;
      acceptedCandidateCount: number;
      duplicateCandidateCount: number;
    }>;
    extremeHeatPolishedCasualActive: boolean;
    bundleReadyValidationPassed: boolean;
    recommendationSelectionOrderMatches: boolean;
    coverageSelectionOrderMatches: boolean;
  } | null;
  attemptCounts: Record<string, number>;
  lastSentDate: string | null;
  modelsConfigured: Record<string, boolean>;
  snapshotAgeHours: number | null;
}
```

In `WebApp.gs`, after snapshot validation and before generation actions, add:

```js
if (request.action === 'getDailyOutfitDiagnosticsV2') {
  return jsonResponseV2_({
    ok: true,
    action: request.action,
    diagnostics: getDailyOutfitDiagnosticsV2()
  });
}
```

In `DailyOutfitSettings.tsx`, add `diagnostics` state. In `runAction`, handle `getDailyOutfitDiagnosticsV2` with `callDailyServer`, require `response.diagnostics`, store it, and set notice to `Diagnostics refreshed.` Render an `Inspect diagnostics` button beside the existing validate/generate controls and render `JSON.stringify(diagnostics, null, 2)` in a `.daily-diagnostics` `<pre>` only after a successful response. This payload is safe because the server action returns only the redacted diagnostics projection; do not read browser settings, sync secret, candidate ids, or raw pending state into it.

- [ ] **Step 6: Run the complete Task 4 suite and commit the atomic cutover**

```bash
npm test -- src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx src/features/daily-outfits/__tests__/DailyOutfitSettings.test.tsx
npm test
npm run build
npm run lint
git diff --check
git add apps-script/daily-outfits-v2/Config.gs apps-script/daily-outfits-v2/Planner.gs apps-script/daily-outfits-v2/Selection.gs apps-script/daily-outfits-v2/JobState.gs apps-script/daily-outfits-v2/Scheduler.gs apps-script/daily-outfits-v2/Diagnostics.gs apps-script/daily-outfits-v2/Email.gs apps-script/daily-outfits-v2/WebApp.gs src/features/daily-outfits/types.ts src/features/daily-outfits/syncClient.ts src/features/daily-outfits/DailyBundlePreview.tsx src/features/daily-outfits/DailyOutfitSettings.tsx src/features/daily-outfits/daily-outfits.css src/features/daily-outfits/__tests__/selectionContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts src/features/daily-outfits/__tests__/appsScriptContracts.test.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts src/features/daily-outfits/__tests__/sendRecoveryContracts.test.ts src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx src/features/daily-outfits/__tests__/DailyOutfitSettings.test.tsx
git commit -m "feat: deliver graceful partial daily outfits"
```

---

### Task 5: Document, review, deploy the existing web app, and inspect shadow behavior

**Files:**
- Modify: `apps-script/daily-outfits-v2/README.md`

**Interfaces:**
- Deploy only through the existing Apps Script deployment; preserve its `/exec` URL.
- Use the authenticated **Inspect diagnostics** action backed by `getDailyOutfitDiagnosticsV2()` rather than printing persisted ids.
- Keep shadow mode and do not send email.

- [ ] **Step 1: Update the policy-v4 runbook**

Document: one-to-three coverage parity; exactly two rounds before partial; repeated and duplicate-only rounds; strict `90`/`90.1` heat boundary; `{1,1,1}` no-replan completion; exhaustive post-round-two trio/pair/singleton/zero outcomes; fail-closed operational errors; dynamic email/preview/Encore behavior; parity booleans; unchanged shadow mode; and fresh confirmation before a test email. Reviewed wardrobe-profile enrichment remains a prerequisite, not a step to repeat.

- [ ] **Step 2: Run fresh complete verification and policy scans**

```bash
npm test
npm run build
npm run lint
git diff --check
rg -n "QUALITY_POLICY_VERSION:\s*4|middayFeelsLikeF > 90|quality-exhausted-zero|deliveryMode|selectedCount|omittedArchetypes|replanRounds|bundleReadyValidationPassed" apps-script/daily-outfits-v2 src/features/daily-outfits
! rg -n "Today's 3 outfits|These three outfits are final|exactly three final recommendations|QUALITY_POLICY_VERSION:\s*3" apps-script/daily-outfits-v2 src/features/daily-outfits -g '!**/__tests__/**' -g '!README.md'
```

Expected: all commands exit `0`; obsolete exact-three production copy is gone.

- [ ] **Step 3: Commit the runbook and obtain two-stage review**

```bash
git add apps-script/daily-outfits-v2/README.md
git commit -m "docs: update policy v4 rollout guide"
```

Use `superpowers:requesting-code-review` for one spec-compliance review and one code-quality review over the full implementation range. Resolve every critical/important finding with focused red-green commits, then repeat Step 2.

- [ ] **Step 4: Copy only ignored clasp config and inspect push scope**

```bash
cp /Users/kevinturner/Documents/Code/Personal/virtual-closet/apps-script/daily-outfits-v2/.clasp.json apps-script/daily-outfits-v2/.clasp.json
git check-ignore -q apps-script/daily-outfits-v2/.clasp.json
cd apps-script/daily-outfits-v2
npx @google/clasp status
```

Expected: exactly the existing twenty `.gs` files plus `appsscript.json`; no README, config secret, or environment file.

- [ ] **Step 5: Push source and update the existing deployment in the Apps Script UI**

```bash
npx @google/clasp push
```

Then use `browser:control-in-app-browser` on the already authenticated Apps Script project page:

1. Open **Deploy → Manage deployments**. Do not open **New deployment**.
2. Select the web-app deployment whose displayed `/exec` URL exactly matches the URL already configured in the local Daily Outfits settings.
3. If no exact match is present, stop without deploying.
4. Click edit, choose **New version**, enter description `Daily Outfits V2 policy v4`, and deploy.
5. Confirm the displayed `/exec` URL is unchanged. Do not expose the deployment id in commentary, logs, or tracked files.

- [ ] **Step 6: Prove remote source parity in a disposable directory**

```bash
tmpdir=$(mktemp -d)
cp .clasp.json "$tmpdir/.clasp.json"
(cd "$tmpdir" && npx @google/clasp pull)
for file in *.gs appsscript.json; do cmp "$file" "$tmpdir/$file" || exit 1; done
rm -rf "$tmpdir"
cd ../..
git status --short
```

Expected: every comparison exits `0`; ignored config remains untracked.

- [ ] **Step 7: Refresh wardrobe state and generate one shadow bundle**

Use `browser:control-in-app-browser` at `http://127.0.0.1:5173/`:

1. **Build visual inventory**: require `116 items` and a current fingerprint.
2. **Sync now**: require `synced` with the same fingerprint.
3. **Validate server snapshot**: require exactly `Stored snapshot passes every structural check.`
4. **Generate test bundle** until `bundle-ready`. This uses the already approved Gemini calls and wardrobe upload, but does not send email.

Click the Phase 4C **Inspect diagnostics** action and read its authenticated, server-redacted projection. Require `selectedCount` in `1..3`, exact configured-order archetype coverage, a valid path, redacted round counts, the correct heat-active boolean, and all three parity booleans `true`. A partial result requires two ledger summaries. The browser bundle must show the same count/archetype order; no raw candidate ids need to be exposed. Zero-quality or operational failure must have no bundle.

- [ ] **Step 8: Perform responsive browser QA and leave rollout safe**

At desktop width and below `760px`, require correct generated-count copy, no empty column, no horizontal overflow, cause-neutral omission copy only for partial, configured order, and Encore after generated cards without changing count. Automated fixtures cover cardinalities not produced by the live shadow run.

Finish by confirming: `SHADOW_MODE=true`; one ten-minute trigger remains; the original `/exec` URL remains active; no test or real email was sent; worktree is clean. Ask for fresh confirmation only when the user wants a test email or live delivery after the observation window.

---

## Execution order and review gates

1. Task 1 is independent.
2. Task 2 changes pure selector behavior and complete-selection metadata but does not enable partial runtime delivery.
3. Task 3 changes every downstream signature and consumer together, then proves the full suite green while runtime still emits trios.
4. Task 4 is one atomic runtime, persistence, email, React, and diagnostics cutover. Its Phase 4A/4B checkpoints are never committed or deployed alone.
5. Task 5 starts only after Task 4's focused tests, full tests, build, lint, atomic commit, and two-stage code review pass.

For subagent-driven execution, dispatch one fresh implementation subagent per task. After each implementation subagent finishes, dispatch a spec-compliance reviewer, then a code-quality reviewer. The primary agent owns integration, full-suite verification, browser QA, deployment, wardrobe upload, Gemini calls, and every external side effect.

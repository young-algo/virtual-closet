# Daily Outfits V2 — Complete-First Partial Delivery — Design

**Date:** 2026-07-15
**Status:** Approved
**Supersedes:** Only the cardinality, re-plan-exhaustion, and extreme-heat planner rules in `2026-07-14-daily-outfits-v2-quality-design.md`. All other policy-v3 quality, safety, novelty, transport, persistence, and Encore rules remain in force.

## Summary

Daily Outfits V2 should still try to produce one easy, one polished-casual, and
one expressive recommendation. It should no longer suppress every useful look
because one archetype cannot clear the quality bar.

Policy v4 adopts **complete-first, graceful partial delivery**:

1. One eligible candidate per archetype is sufficient to attempt a complete
   three-look set.
2. A missing archetype or infeasible complete set receives up to two targeted
   re-plan rounds. Both rounds may target the same archetype.
3. Only after two structurally valid re-plan rounds are exhausted, selection
   may return the largest feasible safe subset: two looks before one.
4. Zero safe looks still fails closed.
5. No critic floor, weather guard, novelty rule, or set-level safety rule is
   weakened to make partial delivery possible.

The polished-casual planner also gains an explicit extreme-heat contract. At
adjusted midday temperatures above 90°F, it must express polish through
palette, proportion, restrained graphics, and footwear instead of assuming
that polish requires trousers or a heat-retaining layer.

## Problem and evidence

The policy-v3 selector currently treats fewer than two eligible candidates in
any archetype as a re-plan condition and throws after two failed rounds. That
creates two avoidable failure modes:

- A complete trio is blocked even when each archetype has one safe,
  floor-clearing candidate.
- One weak archetype blocks strong recommendations from the other archetypes
  after re-plans are exhausted.

The first live shadow run made the second failure concrete. At roughly 101°F
adjusted midday, easy produced three eligible candidates, expressive produced
one, and polished-casual produced none. The polished candidates leaned on long
or heavy pants and failed the unchanged weather floor. Selection correctly
refused the unsafe trio, but it also discarded the four recommendations that
did clear their individual floors.

This design preserves that weather judgment while changing the delivery
decision and improving the planner contract that created the polished-casual
bottleneck.

## Goals

- Preserve the three-archetype bundle as the primary outcome.
- Attempt a complete bundle when every archetype has at least one eligible
  candidate.
- Spend both targeted re-plan rounds trying to restore missing coverage before
  returning a partial bundle.
- Deliver one or two genuinely safe, floor-clearing looks when no safe trio can
  be built after valid re-plans.
- Make polished-casual candidates viable in extreme heat without lowering the
  weather floor.
- Persist enough coverage and re-plan metadata to replay, diagnose, and safely
  reconcile partial sends.
- Make email and preview copy truthful about the number of generated looks and
  the archetypes that did not clear the bar.
- Preserve existing three-look behavior when a feasible trio exists.

## Non-goals

- Lowering critic score floors or deterministic weather thresholds.
- Allowing a model to decide whether a low-quality candidate is "good enough."
- Sending a recommendation that fails any item-level or set-level guard.
- Falling back after malformed model output, exhausted transport retries,
  corrupt state, snapshot failure, curator failure, or send failure.
- Inventing a fourth archetype or replacing a missing archetype with a second
  recommendation from another archetype.
- Counting Encore as one of the generated daily recommendations.
- Guaranteeing that every run sends an email; zero safe looks still produces
  no bundle and no send.

## Considered approaches

### A. Deliver a partial bundle immediately

Return any safe looks as soon as an archetype has no eligible candidates. This
maximizes send rate but gives up too early on the primary three-look promise and
makes targeted re-planning mostly irrelevant.

### B. Build a separate partial-delivery pipeline

Keep the three-look pipeline unchanged and invoke a new pipeline after it
throws. This duplicates selection, validation, curation, persistence, and send
logic. The two paths would inevitably drift at the quality boundary.

### C. Lower floors until all archetypes qualify

Relax weather or critic thresholds for the difficult archetype. This raises
bundle completion by accepting the exact recommendations the policy is meant
to reject, especially during dangerous heat.

### Chosen: complete-first, graceful partial fallback

Use one selector and one bundle pipeline for cardinalities one through three.
Full coverage is attempted first and receives two re-plan rounds. Only quality
or feasibility exhaustion unlocks the partial search. All quality and safety
rules remain shared.

## Policy version and archetype order

`QUALITY_POLICY_VERSION` increases from `3` to `4`. Any pending policy-v3 job,
selection, or bundle is stale and must be invalidated through the existing
policy-version reset behavior.

The configured archetype order remains:

1. `easy`
2. `polished-casual`
3. `expressive`

Every selected-archetype list and every recommendation list must be a
subsequence of this order. A valid two-look bundle may therefore be
`easy + expressive`, and a valid one-look bundle may contain any one of the
three archetypes. It may never contain two looks from the same archetype.

## Extreme-heat polished-casual planner contract

### Trigger

The special contract applies only when both conditions are true:

- the current planner archetype is `polished-casual`; and
- `weather.middayFeelsLikeF > 90`.

Exactly 90°F does not trigger it. Easy and expressive never receive this
archetype-specific block.

### Prompt contract

The planner appends this instruction after the shared weather context:

> EXTREME-HEAT POLISHED-CASUAL CONTRACT:
> - Polish does not require trousers. Build polish through intentional palette, proportion, restrained graphics, and footwear.
> - At least 3 of your 5 candidates must use a Shorts bottom.
> - Every proposed top must have `warmth <= 2` and `breathability >= 4`.
> - A Pants bottom is allowed only when it has `warmth <= 2` and `breathability >= 4`.
> - Avoid heat-retaining layers. Include a removable layer only when the weather's edge-of-day layer guidance requires one, and only when that layer has `warmth <= 2`.
> - Do not lower archetype intent: the result must still read as polished-casual rather than a generic gym or lounge outfit.

The block must be produced by one shared helper used by the initial planner,
planner-response repair, and every targeted re-plan. A re-plan therefore
cannot silently lose the heat requirements.

These are generation constraints, not replacements for deterministic weather
validation. Every candidate still passes the existing weather guards and the
critic's `weather >= 8` floor.

## Candidate eligibility

Policy v4 keeps the policy-v3 eligibility predicate unchanged. A candidate is
eligible only when it passes all of the following:

- every existing critic floor, including `weather >= 8`, `palette >= 7.5`,
  `colorIntent >= 8`, the existing three-dimension mean floor, and no critic
  disqualification;
- deterministic weather safety;
- history exact-repeat protection;
- manual saved-outfit exact-core protection and freshness rules;
- cooldown rules; and
- every other existing candidate-level invariant.

Eligible candidates retain the existing deterministic composite ordering and
tie-breakers.

The only eligibility-count change is this: **one eligible candidate is enough
for an archetype to participate in complete-set selection.** The current
`< 2` shortage rule becomes `=== 0`.

## Complete-set selection

For each selection attempt:

1. Build the sorted eligible pool for each archetype.
2. If every archetype has at least one candidate, enumerate complete sets from
   up to the top two eligible candidates per archetype. A one-item pool is
   valid.
3. Apply every existing set-level constraint and rank feasible sets with the
   existing deterministic ordering.
4. If no set is feasible, widen each pool to up to its top three candidates
   and retry.
5. Return the best feasible trio immediately when one exists.
6. Otherwise request a targeted re-plan while rounds remain.

The search remains bounded and deterministic. A `{1, 1, 1}` eligibility shape
can produce a complete set without a re-plan. A `{1, 0, 2}` shape cannot.

## Targeted re-plan semantics

A targeted re-plan is requested when either:

- at least one archetype has zero eligible candidates; or
- all archetypes have candidates but no feasible complete set exists after the
  top-three search.

The target is chosen deterministically using the policy-v3 rule: fewest
eligible candidates, then lowest best composite, then configured archetype
order. An archetype is not excluded merely because it was already targeted.
The ordered target list may therefore be
`["polished-casual", "polished-casual"]`.

Each round still:

- invokes only the targeted planner;
- includes failures from that archetype's earlier candidates;
- includes the full run-wide used candidate-id list from the initial planners
  and every earlier returned re-plan record, including candidates later
  classified as duplicate combinations, and explicitly forbids reusing any id;
- gives every duplicate-disposition candidate an explicit
  `duplicate item combination` failure note even when it was not sent to the
  critic and therefore has no critic defects or reservations;
- includes the avoid-list derived from other archetypes' current leaders;
- scores only the new structurally valid candidates;
- removes exact duplicate combinations before merging; and
- reruns complete-set selection from the merged pool.

There are at most two rounds total. A structurally valid round counts even if
all of its candidates fail quality floors or collapse to duplicate
combinations. A malformed planner or critic response after its existing repair
and retry policy does not count as quality exhaustion; it is an operational
failure and stops the run.

### Persisted re-plan round ledger

The current replay code infers round boundaries from contiguous added
candidates. That cannot represent two consecutive rounds for the same
archetype, and it cannot prove that a duplicate-only round happened because
that round adds no candidate to the merged pool.

Policy v4 therefore persists an authoritative `pending.replanRounds` ledger:

```ts
type ReplanRoundV4 = {
  round: 1 | 2;
  targetArchetype: DailyArchetype;
  structurallyValid: true;
  returnedCandidates: [
    PlannerCandidateV2,
    PlannerCandidateV2,
    PlannerCandidateV2,
    PlannerCandidateV2,
    PlannerCandidateV2
  ];
  acceptedCandidateIds: string[];
  duplicateCandidateIds: string[];
};

type PendingReplanRoundsV4 = ReplanRoundV4[];
```

The complete candidate records are persisted, not just their ids, so replay
can revalidate their structure and recompute canonical item-combination
deduplication. The accepted and duplicate id arrays must form an exact,
order-preserving partition of the five returned candidate ids. Classification
is recomputed against the initial candidates and every earlier round; persisted
classification is never trusted by itself.

Additional ledger invariants:

- `round` is one-based, contiguous, and at most two;
- `targetArchetype` is exactly the deterministic target requested at that
  replay point;
- every returned record is structurally valid for the target archetype and no
  candidate id is reused anywhere in the run;
- `pending.candidates` equals the original 15 candidates followed by each
  round's accepted candidates in order;
- `pending.critic.scores` exactly covers `pending.candidates` in the same order;
- a round with no accepted candidates has no targeted critic scores but still
  counts as a structurally valid re-plan round; and
- `selection.replannedArchetypes` exactly equals
  `replanRounds.map(round => round.targetArchetype)`, including duplicates.

Replay consumes this ledger one round at a time. It must prove that selection
still needed a re-plan before each recorded round, that the recorded target was
the deterministic target, and that the bounded top-three complete-set search
returned no result before a later round was requested. Candidate-array runs
are no longer used to infer round boundaries. This does not conflict with the
final exhaustive search finding a complete trio beyond the top-three pools
after round two.

## Partial fallback algorithm

Partial fallback is enabled only after two structurally valid targeted re-plan
rounds have completed and complete-set selection still has no result.

The selector then searches all eligible candidates accumulated for the run,
including initial and re-planned candidates:

1. Enumerate all feasible three-archetype sets. If this exhaustive final pass
   finds a trio beyond the normal top-three pools, return it as `complete`.
2. Otherwise enumerate every two-archetype subset in configured order and one
   candidate per included archetype.
3. If no pair is feasible, enumerate each eligible singleton.
4. Rank results by cardinality first, then by the existing set ranking:
   composite sum descending, minimum composite descending, color-intent sum
   descending, and joined candidate ids ascending.
5. Return two recommendations before one. If no eligible singleton exists,
   throw and send nothing.

Every set-level rule is evaluated against the actual selected count:

- unique tops and bottoms apply across all selected looks;
- shoe uniqueness is required when the snapshot contains at least as many
  weather-safe shoes as the selected count;
- pairwise overlap and distinct diversity-story rules apply to every selected
  pair;
- the existing layer-repeat exception remains unchanged and is evaluated only
  for selected pairs; and
- final validation rechecks all applicable rules as defense in depth.

This algorithm maximizes safe usefulness, not merely score. A high-scoring
singleton cannot beat a lower-scoring feasible pair.

## Selection data contract

`pending.selection` retains its existing fields and adds explicit delivery
coverage:

```json
{
  "deliveryMode": "complete",
  "selectedCount": 3,
  "selectedArchetypes": ["easy", "polished-casual", "expressive"],
  "omittedArchetypes": [],
  "eligibleCountByArchetype": {
    "easy": 3,
    "polished-casual": 1,
    "expressive": 2
  },
  "compositeById": { "candidate-id": 8.31 },
  "path": "top2",
  "feasibleSetCount": 2,
  "replannedArchetypes": []
}
```

Allowed `path` values remain `top2`, `top3`, `replan-1`, and `replan-2`.
`path` records how far the attempt progressed; it does not encode cardinality.
`deliveryMode` and `selectedCount` do that without multiplying path states.

For a partial selection:

- `deliveryMode` is `partial`;
- `selectedCount` is `1` or `2`;
- `path` is `replan-2`;
- `replannedArchetypes` has exactly two entries, with duplicates allowed;
- `selectedArchetypes` is the ordered archetype subsequence represented by the
  selected candidates; and
- `omittedArchetypes` is the ordered complement.

For a complete selection, `selectedCount` is `3`, `selectedArchetypes` contains
all configured archetypes, and `omittedArchetypes` is empty. A complete result
may have any allowed path depending on when it became feasible.

`feasibleSetCount` describes the final search scope that produced the selected
set. Diagnostics may separately expose counts by search phase if useful, but
that is not part of persisted correctness.

## Bundle coverage contract

The final bundle persists the delivery facts required outside the selection
stage:

```json
{
  "coverage": {
    "deliveryMode": "partial",
    "selectedArchetypes": ["easy", "expressive"],
    "omittedArchetypes": ["polished-casual"]
  },
  "recommendations": [
    { "archetype": "easy" },
    { "archetype": "expressive" }
  ]
}
```

The recommendation count is derived from `recommendations.length`. Persisted
state validation enforces all of these invariants:

- recommendation count is between one and three;
- recommendation order exactly matches `coverage.selectedArchetypes`;
- selected and omitted archetypes are disjoint ordered subsequences whose union
  is the configured archetype list;
- `complete` means three recommendations and no omitted archetypes;
- `partial` means one or two recommendations and at least one omitted
  archetype;
- selection coverage and bundle coverage agree exactly;
- a partial selection proves two completed valid re-plan rounds; and
- the authoritative re-plan ledger exactly proves every round boundary,
  target, returned candidate, accepted/duplicate disposition, and targeted
  critic score;
- the selected candidate ids, archetypes, and items still match the persisted
  selection output.

Tampered count, order, coverage, path, or archetype data is corrupt state and
fails closed. It is never interpreted as permission to send a smaller bundle.

## Curator and final validation

The curator remains a copywriter and cannot alter selection.

Its response schema is constructed for the actual selected count, with
`minItems` and `maxItems` both equal to one, two, or three as appropriate. The
prompt says the exact number of selected recommendations and repeats that they
must not be swapped, reordered, added, or removed.

`runCuratorV2_` and every `repairFinalBundleV2_` attempt must call the same
exact-cardinality schema builder with `selectedCandidates.length`. No initial
or repair path may use the old static three-item `CURATOR_SCHEMA_V2`.

Curator response validation requires:

- exactly the selected count;
- byte-exact candidate id, archetype, and item echoes in selected order; and
- every existing copy-quality constraint.

Final validation accepts one through three generated recommendations, verifies
the coverage contract, and applies candidate and set rules at actual
cardinality. It no longer requires every configured archetype for a partial
bundle, but it does require every archetype claimed by `selectedArchetypes`
exactly once.

A curator or copy-repair failure is an operational failure after selection and
still fails closed. The pipeline must not bypass curation or drop another look
to salvage malformed copy.

## Stage machine, replay, and reconciliation

The policy-v3 stage machine remains:

```text
idle -> weather-ready -> planners-ready -> critic-ready
     -> selection-ready -> bundle-ready -> sent
```

Partial delivery changes cardinality, not stage meaning. Deterministic replay
must not treat a feasible pair as early success during initial selection or
after re-plan round one. A partial result is terminal only when persisted state
proves both valid re-plan rounds were exhausted.

Resume and reconciliation paths must preserve the exact recommendation array
and coverage metadata. Existing idempotency rules still apply:

- a resumed partial bundle is not sent twice;
- a sent partial bundle writes exactly its one or two recommendations to
  history;
- feedback candidate ids resolve against those exact history entries;
- partial coverage survives job-state serialization and deserialization; and
- consecutive same-archetype and duplicate-only re-plan rounds replay from the
  explicit round ledger; and
- corrupt or contradictory state resets or fails according to the existing
  policy-version and corruption rules rather than being silently normalized.

## Email and React preview

Both renderers already iterate recommendations; their surrounding contracts
must stop assuming three.

Generated-count copy is truthful and grammatical:

- one: `Today's outfit`
- two: `Today's 2 outfits`
- three: `Today's 3 outfits`

The email subject uses the same generated count. If a bundle is partial, email
and preview also render one concise coverage note, using the persisted omitted
archetypes. The cause-neutral template is:

> Polished casual was omitted after today's quality, weather, and outfit-distinctness checks.

For two omitted archetypes, join both human-readable labels in configured
order. The wording must stay cause-neutral because an archetype may have
individually eligible candidates yet be omitted when no complete set satisfies
the cross-outfit rules. This is a quality explanation, not an error alert; it
must not expose scores, retries, model names, or internal failure text.

The React recommendation type changes from an exact three-element tuple to a
non-empty one-to-three contract. Layout must remain intentional at one and two
cards instead of reserving three empty columns.

Settings copy must describe the actual promise rather than an unconditional
three-look result: `Up to three distinct looks: Easy, Polished casual, and
Expressive. If a complete set cannot meet the day's quality, weather, and
outfit-distinctness bars after re-planning, the safe looks are still
delivered.` The primary aspiration remains all three; the copy simply makes
graceful partial delivery honest.

## Encore behavior

Encore remains an optional bonus section selected by its existing independent
rules. It is never included in `selectedCount`, `selectedArchetypes`, the
generated recommendation array, or generated-count copy.

A one-look generated bundle plus an Encore is still described as
`Today's outfit`, not `Today's 2 outfits`. Encore feedback and history
resolution continue through the existing Encore-specific path.

## Failure boundary

Partial delivery is a fallback for **quality and set feasibility only**.

The following may lead to partial delivery after two valid re-plans:

- candidates honestly scoring below unchanged floors;
- deterministic weather or novelty rejection;
- structurally valid candidates collapsing to exact duplicates;
- an archetype retaining zero eligible candidates; or
- no feasible complete set under unchanged cross-outfit constraints.

The following always fail closed and never unlock partial delivery:

- malformed planner, critic, curator, or repair responses after bounded
  repair;
- Gemini or other transport failure after bounded retry;
- invalid wardrobe snapshot or weather state;
- corrupt, missing, or contradictory persisted selection/bundle state;
- final validation failure;
- history persistence failure; or
- email send failure.

This boundary prevents operational faults from masquerading as an intentional
quality decision.

## Diagnostics and rollout

Diagnostics add:

- `deliveryMode` and `selectedCount`;
- selected and omitted archetypes;
- eligible counts by archetype;
- ordered re-plan targets, including repeated targets;
- per-round accepted and duplicate candidate counts;
- selection path and final feasible-set count; and
- whether the extreme-heat polished-casual contract was active.

Logs and alerts distinguish `quality-exhausted-zero` from operational errors.
One- and two-look sends are successful partial deliveries, not scheduler
failures.

Policy v4 follows the existing shadow rollout sequence:

1. Deploy with shadow mode enabled.
2. Exercise ordinary weather, exact-threshold weather, and extreme heat.
3. Inspect planner prompts, eligibility counts, re-plan targets, coverage,
   replay, and final validation.
4. Verify email and preview rendering at one, two, and three generated looks,
   with and without Encore.
5. Enable live scheduling only after the complete and partial paths satisfy the
   regression matrix.

## Regression matrix

### Extreme-heat prompting

- `90°F` does not add the special contract; `90.1°F` does.
- Only polished-casual receives the block.
- Initial, response-repair, first re-plan, and second re-plan prompts retain the
  identical block when active.
- The block requires at least three Shorts candidates, cool/breathable tops,
  conditional cool/breathable pants, and no optional heat-retaining layer.

### Complete selection

- `{1, 1, 1}` eligible candidates produces a complete trio without re-plan.
- Existing `{2+, 2+, 2+}` top-two and top-three behavior is unchanged.
- `{1, 0, 2}` targets the zero-candidate archetype.
- A previously targeted archetype may be targeted again in round two.
- A duplicate-only structurally valid round is persisted and counts toward the
  two-round limit.
- The second re-plan receives every previously returned candidate id and
  duplicate-combination note, including unscored duplicate-disposition
  candidates.
- A feasible trio after either re-plan remains a complete delivery.
- A trio found only by the post-round-two exhaustive search is a valid complete
  delivery, and replay proves only that each earlier bounded top-three search
  had no result.

### Partial selection

- No partial result is returned before two valid re-plan rounds.
- After round two, a feasible pair is returned instead of throwing.
- If only one archetype has eligible candidates, one recommendation is
  returned.
- If no candidate is eligible, the run throws and sends nothing.
- Cardinality outranks score: every feasible pair beats every singleton.
- A two-look subset may omit the middle archetype while preserving configured
  order.
- When all archetypes have individually eligible candidates but no feasible
  trio exists, fallback may select the best feasible pair and the omission copy
  remains cause-neutral.
- Item-level and pairwise rules reject the same violations at partial
  cardinality that they reject in a trio.
- Shoe uniqueness scales to available weather-safe shoes and selected count.

### Error boundary

- Malformed or exhausted planner, critic, or curator calls fail closed even if
  an earlier stage contained eligible looks.
- Corrupt selection, path, count, and coverage data fail closed.
- Missing or tampered re-plan round boundaries, targets, returned candidates,
  or deduplication dispositions fail closed.
- Final-validation failure cannot be converted to a smaller bundle.

### Curation and persistence

- Initial curator and every copy-repair schema enforce the selected exact count
  of one, two, or three.
- Curator echo validation rejects added, removed, reordered, or substituted
  recommendations.
- One- and two-look job state round-trip without normalization to three.
- Consecutive same-archetype rounds and a zero-accepted-candidate round replay
  exactly from the persisted ledger.
- Partial selection can resume from `selection-ready` and `bundle-ready`.
- Reconciliation sends a partial bundle at most once and records exactly its
  recommendations in history.
- Feedback resolves for every partial recommendation.

### Presentation

- Email subject, heading, cards, and omitted-archetype note render correctly
  for one, two, and three generated recommendations.
- React preview types and layouts accept one, two, and three cards.
- Daily Outfit settings promise up to three looks and explain the partial
  quality fallback instead of guaranteeing three.
- Encore never changes the generated count or omitted-archetype calculation.
- The existing three-look email and preview remain visually and semantically
  unchanged except for shared dynamic-count code.

## Acceptance criteria

- No unchanged quality or safety floor is weakened.
- A safe `{1, 1, 1}` pool can produce the normal complete bundle.
- The system spends at most two valid targeted re-plan rounds and may target
  the same archetype twice.
- After those rounds, the selector returns the highest-ranked largest feasible
  subset of one to three looks.
- Zero safe looks and every operational failure still fail closed.
- Polished-casual planning above 90°F follows the explicit extreme-heat
  contract in initial, repair, and re-plan prompts.
- Curator, final validation, persistence, diagnostics, email, preview, history,
  reconciliation, and feedback all support exactly one through three generated
  recommendations.
- Partial coverage is explicit, replay-safe, and visible to the user without
  exposing internal errors.
- Policy-v3 pending state cannot be resumed under policy v4.

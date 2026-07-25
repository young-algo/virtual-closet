# Task 3 Report: Drain the inbox into daily history

## What I implemented

1. **`apps-script/daily-outfits-v2/Taste.gs`**: Deleted `mergeSnapshotFeedbackIntoHistoryV2_(snapshot)` and replaced it with `mergeEmailFeedbackIntoHistoryV2_()` (no arguments), exactly as specified in the brief. It reads the email feedback store via `readEmailFeedbackStoreV2_()`, and for each stored signal:
   - If no history entry exists for that `localDate`, the signal is retained in the store (queued) rather than dropped — this is the race-survival behavior for signals arriving before `finalizeSentBundleV2_` writes history.
   - If a history entry exists but the signal's `candidateId` is not among that date's `historyLooksV2_(entry)`, the signal is dropped (the `known` guard — the fix for the silent-corruption hole the old code had).
   - Otherwise it merges/replaces the signal into `entry.feedback`, skipping a no-op write when the existing signal is already byte-identical.
   - History is saved only if something changed; the store is re-saved (drained) only if the retained set differs in size from what was read.

2. **`apps-script/daily-outfits-v2/Scheduler.gs`**: Repointed all three callsites (lines 39, 82, 143) from `mergeSnapshotFeedbackIntoHistoryV2_(snapshot)` to `mergeEmailFeedbackIntoHistoryV2_()`, preserving each line's original indentation (4-space, 6-space, 6-space respectively).

3. **`apps-script/daily-outfits-v2/Encore.gs`**: Removed the `snapshot.dailyFeedback` branch (5 lines) inside `mergeDislikedEncoreIdsV2_`. Left the rest of the ledger machinery (`DISLIKED_ENCORE_IDS_V2`, `retained.forEach(...)`) untouched, per the brief's explicit instruction — it now has no feed from the snapshot but still drains disliked signals recorded in history.

4. **Tests**:
   - Appended the brief's 5-test `describe('feedback drain', ...)` block verbatim to `feedbackContracts.test.ts`.
   - Replaced the stale `resilienceContracts.test.ts` merge test (lines 243–256) with the brief's byte-equal-no-rewrite test against the new zero-arg function.
   - Ran the brief's `sed` rename across `appsScriptContracts.test.ts` (16 stub occurrences renamed, not ~20 as the brief estimated — verified the count and that nothing unintended matched).
   - **Not listed in the brief but required for `npm test` to pass fully**: `encoreContracts.test.ts` had two pre-existing tests that injected a disliked signal via `snapshot.dailyFeedback` (the exact branch removed in step 5). I updated both to inject the same signal through the history/`retained` array instead (the pattern already used by a third scenario in the same test, and by another test at line 714 in the same file), preserving each test's original intent (ledger persists across a subsequent call with pruned history; ledger write happens before an uncertain-cadence property suppresses the pick). This is a direct, unavoidable consequence of the mandated Encore.gs change — the brief's own Step 7 instructions say a `dailyFeedback`-related failure must be grepped and fixed, and "npm test must pass fully" is a hard constraint.

## What I tested and the results

- Focused test file throughout iteration: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "feedback drain"`
- Full suite before committing: `npm test` — **675 passed, 0 failed, 19 test files**.

## TDD Evidence

### RED

Command:
```
npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "feedback drain"
```

Relevant output:
```
FAIL  src/features/daily-outfits/__tests__/feedbackContracts.test.ts > feedback drain > replaces a prior signal for the same candidate
ReferenceError: mergeEmailFeedbackIntoHistoryV2_ is not defined
...
Test Files  1 failed (1)
     Tests  5 failed | 22 skipped (27)
```

Why expected: the new function didn't exist yet in `Taste.gs` (only the old `mergeSnapshotFeedbackIntoHistoryV2_` did), so every test in the new `describe('feedback drain', ...)` block that calls `evaluateAppsScript(..., 'mergeEmailFeedbackIntoHistoryV2_', ...)` fails with a `ReferenceError` inside the sandboxed `Function` evaluator — exactly the failure mode the brief predicted.

### GREEN

Command:
```
npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "feedback drain"
```

Output:
```
✓ src/features/daily-outfits/__tests__/feedbackContracts.test.ts (27 tests | 22 skipped)
Test Files  1 passed (1)
     Tests  5 passed | 22 skipped (27)
```

Full suite:
```
npm test
...
Test Files  19 passed (19)
     Tests  675 passed (675)
```

## Files changed

- `apps-script/daily-outfits-v2/Taste.gs` (function replaced)
- `apps-script/daily-outfits-v2/Scheduler.gs` (3 callsites repointed)
- `apps-script/daily-outfits-v2/Encore.gs` (5-line `dailyFeedback` branch removed)
- `src/features/daily-outfits/__tests__/feedbackContracts.test.ts` (5 new tests appended)
- `src/features/daily-outfits/__tests__/resilienceContracts.test.ts` (1 test replaced)
- `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts` (16 stub keys renamed via sed)
- `src/features/daily-outfits/__tests__/encoreContracts.test.ts` (2 tests updated to stop relying on the removed `snapshot.dailyFeedback` branch — outside the brief's listed file set, but required for a full green `npm test`)

## Final grep check

```
$ grep -rn "mergeSnapshotFeedbackIntoHistoryV2_" apps-script/ src/
(no output — zero matches)
```

Also confirmed zero remaining `dailyFeedback` references anywhere under `apps-script/`.

## Self-review findings

- **All three Scheduler.gs callsites repointed**: confirmed via `grep -n "mergeEmailFeedbackIntoHistoryV2_" apps-script/daily-outfits-v2/Scheduler.gs` → lines 39, 82, 143, each at its original indentation depth.
- **No dangling references**: the mandated grep returns nothing; a secondary grep for `dailyFeedback` across `apps-script/` also returns nothing.
- **Queued-signal behavior genuinely tested**: `feedbackContracts.test.ts`'s "retains a signal whose history entry does not exist yet" test asserts `drain()` returns `false` and that *neither* `saveHistoryV2_` *nor* `saveEmailFeedbackV2_` is called — i.e., the signal is left untouched in the store for a later run, not silently dropped. This directly exercises the send-before-finalize race the task description calls out as the most important behavior.
- **ES5 style**: the new `mergeEmailFeedbackIntoHistoryV2_` uses only `var`, `function(){}` closures, and no template literals, arrow functions, or `let`/`const`. Verified by reading the final source.
- **The `known` guard**: verified directly by the "drops a signal whose candidate is absent from that date, without stalling the queue" test — it asserts the store is drained to `[]` (not left queued) even though nothing was written to history, matching the brief's intent that this is a deliberate drop, not a stall.

## Concerns

- `encoreContracts.test.ts` was not in the brief's declared file list, but two of its pre-existing tests directly exercised the `snapshot.dailyFeedback` branch that Step 5 mandates removing. Leaving them broken would violate "npm test must pass fully" (a hard constraint), so I updated them to inject the same dislike signal through the history/`retained` array — the mechanism the same test file already uses elsewhere for equivalent scenarios — rather than through the now-nonexistent snapshot field. I'm flagging this explicitly since it's a scope addition beyond the brief's file list, even though the fix itself is narrow and mechanical (swap the injection point, not the assertions).
- An unrelated `impeccable` design-hook finding fired on `encoreContracts.test.ts` (a literal color at line 613, pre-existing, untouched by my edits, in a non-UI Apps Script test fixture file). I left it as-is — out of scope for this task and not something my change introduced.

## Fix round 1

Addressed all five review findings.

### 1. Drain never pruned aged entries (spec miss, highest priority)

`apps-script/daily-outfits-v2/Taste.gs:181-218` — `mergeEmailFeedbackIntoHistoryV2_()` now derives `todayLocalDate` via `localDateV2_(new Date(), getDailyConfigV2_().timezone)` (the same pattern `Email.gs` uses in `sendDailyBundleNowV2`/`sendDailyTestEmailV2`), and checks each stored signal with the existing Task 1 helper `feedbackDateWithinWindowV2_(signal.localDate, todayLocalDate)` from `Feedback.gs` before doing anything else. A signal outside the window is dropped silently (not pushed to `retained`, not merged into history) — no new date math was written. This runs before the `!entry` check, so a signal that ages out before its history entry ever appears is pruned instead of queued forever, matching `docs/superpowers/specs/2026-07-25-emailed-outfit-feedback-design.md:61`.

Added test `feedbackContracts.test.ts` → `feedback drain` → `'prunes a signal whose localDate has aged out of the retention window, without writing history'`: a signal dated `2026-06-01` against a mocked "today" of `2026-07-25` (55 days old, window is 30 days). Asserts `drain()` returns `false`, `saves.history` is never called, and `saves.store` is called with `[]` (dropped, not retained).

### 2. Queued-signal invariant not pinned by tests

Added `feedbackContracts.test.ts` → `'queues exactly the pending signal and drains the other from a mixed store'`: a two-element store — one signal (`easy-1`/`2026-07-25`) whose history entry exists and drains, one signal (`easy-2`/`2026-07-24`) whose history entry does not exist and must stay queued. Asserts `saveEmailFeedbackV2_` is called with exactly `[queuedSignal]` (not `[]`), `history[0].feedback` equals `[drainable]`, and `saveHistoryV2_` is called once.

Also strengthened the pre-existing `resilienceContracts.test.ts` no-op test (see finding 4 below) into a two-signal case that likewise asserts array identity rather than emptiness.

Both new drain tests, plus every existing drain test, needed `getDailyConfigV2_: () => ({ timezone: 'America/New_York' })` and `localDateV2_: () => '2026-07-25'` added to `drainScope()` in `feedbackContracts.test.ts` (and the equivalent inline scope in `resilienceContracts.test.ts`) since `mergeEmailFeedbackIntoHistoryV2_` now has those two new dependencies. `shoeRotationCalendarOrdinalV2_` was already present in `storeScope()`, which `feedbackDateWithinWindowV2_` needs; I added the equivalent mock inline to the `resilienceContracts.test.ts` test since that file doesn't share `storeScope()`.

**Mutation experiment**: temporarily changed `apps-script/daily-outfits-v2/Taste.gs:216` from `saveEmailFeedbackV2_(retained);` to `saveEmailFeedbackV2_([]);` (keeping the `if (retained.length !== stored.length)` guard). Ran `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts`: **28 passed, 1 failed** — the new mixed-store test failed exactly as expected, asserting `saveEmailFeedbackV2_` was called with `[]` instead of `[{ candidateId: "easy-2", createdAt: 5, localDate: "2026-07-24", value: "liked" }]`. All other 28 tests (including the four pre-existing single-element drain tests) still passed under the mutation, confirming they genuinely cannot detect this class of bug. Reverted the mutation immediately after; re-ran the full covering suite to confirm 138/138 pass again on the real implementation.

### 3. Dead `snapshot` parameter

`apps-script/daily-outfits-v2/Encore.gs:223` — changed `mergeDislikedEncoreIdsV2_(ledger, snapshot, retained)` to `mergeDislikedEncoreIdsV2_(ledger, retained)`. Updated the sole caller at `Encore.gs:335` from `mergeDislikedEncoreIdsV2_(ledger, snapshot, historical)` to `mergeDislikedEncoreIdsV2_(ledger, historical)`. Left `validEncoreArrayV2_` untouched (still has its other 16 callers in the file).

### 4. Lost reordering coverage

`src/features/daily-outfits/__tests__/resilienceContracts.test.ts:243` — restored a second byte-equal entry (`signalA`/`easy-1` and `signalB`/`expressive-2`, both dated `2026-07-13`) in `history[0].feedback`, matching `recommendations`, and re-asserted `history[0].feedback` equals `[signalA, signalB]` in that exact order (not just non-empty / not `saveHistoryV2_` called). Since the merge implementation does `before.filter(...)` then `after.push(signal)` per-signal, a reordering bug (e.g., processing signals out of stored order, or rebuilding the array instead of filtering-and-appending) would now show up as an array-identity mismatch, not just a wrong `saveHistoryV2_` call count.

### 5. Silent dropped-signal branch

`apps-script/daily-outfits-v2/Taste.gs:201-206` — the `known` guard now calls `console.log('mergeEmailFeedbackIntoHistoryV2_: dropping signal for unknown candidate ' + signal.candidateId + ' on ' + signal.localDate);` before returning (not `console.error`, since this is an expected/benign case — a stale link naming a candidate that's no longer in that date's looks — not a bug condition). Verified it fires: `feedbackContracts.test.ts`'s existing `'drops a signal whose candidate is absent from that date, without stalling the queue'` test now prints `mergeEmailFeedbackIntoHistoryV2_: dropping signal for unknown candidate ghost-9 on 2026-07-25` to stdout during the test run (visible in the `npx vitest run` output below).

### Test commands run and output

```
$ npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts src/features/daily-outfits/__tests__/resilienceContracts.test.ts src/features/daily-outfits/__tests__/encoreContracts.test.ts

stdout | src/features/daily-outfits/__tests__/feedbackContracts.test.ts > feedback drain > drops a signal whose candidate is absent from that date, without stalling the queue
mergeEmailFeedbackIntoHistoryV2_: dropping signal for unknown candidate ghost-9 on 2026-07-25

 ✓ src/features/daily-outfits/__tests__/feedbackContracts.test.ts (29 tests) 9ms
 ✓ src/features/daily-outfits/__tests__/resilienceContracts.test.ts (13 tests) 13ms
 ✓ src/features/daily-outfits/__tests__/encoreContracts.test.ts (96 tests) 27ms

 Test Files  3 passed (3)
      Tests  138 passed (138)
```

```
$ npm test

 Test Files  19 passed (19)
      Tests  677 passed (677)
```

(677 vs. the 675 reported in round 1 reflects the two new tests added for findings 1 and 2; the resilience test count stayed at 13 since finding 4 replaced one test in place rather than adding one.)

### Disagreements

None. All five findings matched what I found reading the code; no pushback needed.

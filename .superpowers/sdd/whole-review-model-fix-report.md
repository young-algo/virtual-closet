# Whole-review model-boundary fix report

## Scope

This lane changes only the Gemini batch transport boundary and model-facing saved-outfit history fields. It does not change scheduler, job-state, Encore, enrichment, or frontend behavior.

## Root causes

- `callGeminiBatchV2_` invoked `UrlFetchApp.fetchAll` directly for both the initial batch and the follow-up HTTP retry batch. A transport-level exception therefore escaped immediately, without the required single retry, four-second delay, or sanitized stage/archetype context.
- `buildTasteSummaryV2_` exposed the saved-outfit `id` and copied saved names and notes directly into model-facing data.
- `modelFacingCandidateV2_` copied `sharesTwoCoreWith` saved-outfit names directly instead of routing them through the existing model-history sanitizer.

## TDD evidence

The focused RED run added four transport contracts and one prompt-boundary contract before production changes:

```text
npm test -- --run src/features/daily-outfits/__tests__/transportContracts.test.ts src/features/daily-outfits/__tests__/promptBoundaryContracts.test.ts
Test Files: 2 failed
Tests: 5 failed, 51 passed
```

The failures demonstrated that initial and follow-up `fetchAll` exceptions escaped raw, and that a saved-outfit identifier remained present in the model-facing summary.

## Implementation

- Added one batch transport helper that retries a thrown `fetchAll` exception exactly once after `Utilities.sleep(4000)`.
- Applied that helper to both the initial batch and the follow-up retry batch.
- Built contextual error labels from allowlisted archetype/context characters and discarded raw exception text.
- Removed saved-outfit IDs from taste summaries.
- Sanitized saved-outfit names, notes, and two-core overlap names with `historyTextForModelV2_`.

## Verification

```text
Focused GREEN: 2 files passed, 56 tests passed
Full suite: 13 files passed, 351 tests passed
npm run build: passed
npm run lint: passed
git diff --check: passed
```

Commit message: `fix: close model transport and taste boundaries`

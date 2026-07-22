# Daily Outfit Shoe Rotation and Shoe-Led Easy Design

## Goal

Make footwear selection reflect the size of the actual shoe collection. A shoe that appears in any emailed outfit must rotate out for seven calendar days, precipitation must never disqualify footwear, and the Easy archetype must begin with one stable pseudorandom shoe and build the outfit around it.

## Current Failure

The daily history records seven-email item exposure, but the deterministic cooldown is built and enforced only for yesterday's tops and bottoms. Shoes therefore receive a soft model hint but no rotation guard. A frequently useful colorway such as the Jordan Air Ship Green Stone can recur with different tops and bottoms while still passing exact-outfit repeat protection.

Shoes also pass through a separate deterministic rain rule. A shoe with `rainSafety: "poor"` is rejected when rain is expected and any nominally safer shoe exists. The same rain predicate reduces the shoe count used by same-day uniqueness. On July 21, 2026, this rule rejected the only two Easy candidates that had cleared the critic floors and caused Easy to be omitted from the partial email.

## Requirements

- A shoe exposed in Easy, Polished casual, Expressive, or Encore is cooling down for the following seven calendar dates, except for the explicit capacity fallback needed when fewer than three fresh shoes are available.
- Calendar distance, not the number of prior emails, defines the window. Skipped email dates do not extend it.
- `wore` and `liked` feedback do not override shoe rotation.
- The policy applies globally to generated candidates and Encore.
- Easy uses one shoe anchor per local date. All five initial Easy candidates and every Easy targeted replan use that anchor.
- The Easy anchor is stable across retries, repairs, manual generation, and scheduler resumes for the same date, wardrobe fingerprint, history, and eligible pool.
- If rotation pressure leaves too few shoes to support three distinct generated outfits, the system admits the least-recently exposed shoes needed to restore capacity.
- Rain probability, precipitation amount, and shoe `rainSafety` never affect shoe eligibility, critic scoring, or same-day uniqueness.
- Existing garment temperature, breathability, layer, critic-floor, exact-repeat, saved-outfit, and partial-delivery rules remain intact.

## Chosen Approach

Use a pure shoe-rotation context derived from the current snapshot, local date, and persisted daily history. Choose the Easy anchor with a stable date-based pseudorandom seed rather than mutable random job state.

This keeps every entry point reproducible without adding a new persisted random field. It also lets planner prompts, candidate selection, final validation, Encore, diagnostics, and tests consume one policy definition.

## Rotation Context

A focused helper will build a rotation context with these values:

- `availableShoeIds`: every unique shoe whose profile is available and not excluded from daily recommendations.
- `recentShoeIds`: available shoes found in a generated recommendation or Encore on a prior date whose calendar age is from one through seven days inclusive.
- `freshShoeIds`: available shoes not present in `recentShoeIds`.
- `allowedGeneratedShoeIds`: the fresh pool plus an availability-aware fallback when necessary.
- `easyAnchorShoeId`: the required shoe for Easy.
- diagnostic counts and a `fallbackUsed` flag.

The helper will derive exposure from dated history records and resolve slots through the current snapshot. It will ignore future entries, the current date, malformed item references, feedback values, and shoe rain metadata.

The existing `itemUsagePrevious7Days` history field will also be corrected to use the previous seven calendar dates rather than the last seven history entries. Its name and model-facing shape stay stable.

### Availability-Aware Fallback

The generated system should be able to form three same-day looks whenever the inventory contains at least three available shoes.

1. Begin with all fresh shoes.
2. Set the capacity target to the smaller of three and the total available-shoe count.
3. If the fresh pool is below that target, append cooling-down shoes ordered by their oldest most-recent exposure date.
4. Break equal-recency ties by stable item-id order.
5. Stop as soon as the capacity target is reached.

If at least one fresh shoe exists, the Easy anchor comes from the fresh pool. If every available shoe is cooling down, the anchor comes from the oldest exposure tier, with the daily seed breaking ties. Zero available shoes is an unrecoverable inventory configuration and produces a clear error because no required outfit can be formed.

Encore is optional and does not use fallback relaxation. It must use a fresh shoe that is also distinct from every shoe selected in that day's generated outfits; otherwise Encore is omitted.

## Stable Pseudorandom Easy Anchor

The anchor selector will sort its candidate shoe ids, hash the local date, wardrobe fingerprint, and sorted pool identity into a stable integer, and use that value to select a pool index. The exact same inputs always select the same shoe. A new date, wardrobe fingerprint, or eligible pool naturally changes the result.

This is intentionally pseudorandom rather than a fixed rotation order: the Easy shoe varies without making retries or diagnostics nondeterministic.

## Planner and Replan Flow

The daily pipeline computes the rotation context before the planner batch. Planner calls receive model-safe short labels rather than internal item ids.

For Easy, the prompt declares one required anchor shoe and instructs the model to:

- use that shoe in all five candidates;
- choose the top, bottom, and optional layer around the shoe's visible colors and character;
- vary top-bottom palettes, proportions, silhouettes, and layers materially across the five candidates;
- treat the deliberately shared shoe as the anchor rather than a superficial repeated hero-piece shortcut.

Both targeted Easy replan rounds receive the same anchor and requirement. Structural planner validation and repair validation reject any Easy candidate whose `shoeId` differs from the anchor, so the prompt cannot silently drift.

Polished casual and Expressive remain outfit-led. Their prompts receive the global rotation exclusions and fallback allowance, and deterministic candidate eligibility rejects a shoe outside `allowedGeneratedShoeIds`.

## Deterministic Enforcement

Rotation will be enforced at multiple existing trust boundaries:

- Planner validation requires the Easy anchor when an expected anchor is supplied.
- Candidate eligibility requires every generated shoe to be in `allowedGeneratedShoeIds`.
- Final bundle validation recomputes the rotation context and rechecks both the Easy anchor and global shoe eligibility.
- Existing final-set logic continues to require distinct generated shoes whenever enough available shoes exist.
- Encore selection rejects cooling-down shoes and shoes already selected in the current generated bundle.
- Persisted selection replay uses the same pure context, so a mixed-policy pending job cannot bypass the rule.

The daily quality-policy version will increase. This invalidates pending state created under the previous shoe policy and forces a clean regeneration instead of resuming with incompatible candidates.

## Removing Shoe Weather Filtering

Shoe weather influence will be removed across every path, not only the final error message:

- Delete the shoe-rain branch from deterministic weather safety validation.
- Count all available, non-excluded shoes for same-day uniqueness, regardless of forecast or `rainSafety`.
- Stop requiring `rainSafety` for a shoe profile to be considered complete daily inventory.
- Stop requiring `rainSafety` when validating an Encore saved outfit.
- Omit shoe `rainSafety` from model-facing item profiles.
- Tell planners and the critic explicitly that precipitation must not affect footwear selection or footwear-related weather scores.

Garment and layer weather rules remain unchanged. The implementation will not modify weather-provider behavior or the user's current `Weather.gs` work.

## Diagnostics

Daily diagnostics will include a compact shoe-rotation projection:

- Easy anchor short label;
- available-shoe count;
- fresh-shoe count;
- cooling-down count;
- allowed-generated count;
- fallback-used status.

The planner-stage execution log will emit the same summary once per run. Diagnostics expose labels and counts, not a new mutable source of truth; the values are recomputed from persisted date, fingerprint, history, and snapshot.

## Error Handling

- Malformed or stale persisted prerequisites continue to invalidate the resumable stage and restart the daily job.
- A changed wardrobe fingerprint starts a new daily job and therefore a new anchor calculation.
- A planner response that changes the Easy shoe is repaired once through the existing repair path and fails clearly if the repair still violates the anchor.
- A targeted replan cannot select a new Easy anchor.
- Too few fresh shoes triggers the deterministic least-recent fallback rather than reducing the generated email count.
- No valid Encore under the strict fresh-and-distinct rule omits Encore without affecting generated delivery.
- No available shoes produces an explicit generation error rather than an arbitrary partial outfit.

## Testing

Automated tests will be written before production changes and will cover:

### Calendar History

- Exposures from ages one through seven calendar days are included.
- Age eight and the current date are excluded.
- Skipped dates do not extend cooldown.
- Generated and Encore shoe exposures both count.
- `wore` and `liked` feedback do not alter shoe cooldown.
- `itemUsagePrevious7Days` follows calendar dates rather than entry count.

### Rotation and Anchor Selection

- Only available, non-excluded shoes enter the pool.
- Rain and missing `rainSafety` do not change the pool.
- Identical inputs select the identical Easy anchor across repeated calls and retries.
- A date or eligible-pool change can select a different anchor.
- Fresh shoes are preferred.
- Exhausted and undersized fresh pools expand with least-recent shoes in deterministic order.
- All five Easy candidates, repairs, and both replan rounds retain the anchor.

### Global Enforcement

- Easy, Polished casual, and Expressive candidates outside the allowed shoe set are rejected.
- Final validation catches a persisted or curated bypass.
- Same-day generated shoes remain distinct when inventory supports it.
- Encore rejects cooled-down and same-day generated shoes and is omitted when no strict option remains.

### Weather Decoupling

- A `rainSafety: "poor"` shoe remains eligible during rain even when nominally safer shoes exist.
- A shoe without `rainSafety` remains valid daily and Encore inventory.
- Model-facing shoe profiles omit `rainSafety`.
- Planner and critic prompts state the footwear precipitation preference.
- Existing non-shoe weather errors still fire at their established boundaries.

### Persistence and Regression

- Scheduled and manual stage resumes recompute the same rotation context.
- The quality-policy bump rejects old pending state.
- Critic floors, exact-repeat rules, saved-outfit rules, replans, partial delivery, send recovery, and bundle validation remain covered.
- The focused daily-outfit suites, complete test suite, lint, and production build pass.

## Scope Boundaries

This work does not rename the Easy archetype, change the other archetype briefs beyond shoe-rotation guidance, alter shoe catalog metadata, change weather acquisition, or modify email layout. It preserves unrelated working-tree changes, including the current README, `Weather.gs`, `package.json`, resilience-test, and local package-store changes.

## Success Criteria

- The Jordan Air Ship Green Stone, or any other shoe, cannot reappear in an emailed generated outfit or Encore during the next seven calendar dates unless capacity fallback is necessary.
- Easy is always designed around one stable daily shoe anchor.
- All Easy candidates and replans use that anchor.
- Rain never removes or penalizes a shoe.
- Normal inventory supports three distinct generated shoes without reducing email count.
- Diagnostics make the anchor and rotation capacity visible.
- Existing recommendation-quality and delivery safeguards continue to pass.

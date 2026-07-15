# Daily Outfits V2 — Recommendation Quality & Reliability Overhaul — Design

**Date:** 2026-07-14
**Status:** Proposed — awaiting approval
**Source:** Code review of `apps-script/daily-outfits-v2` (quality review items Q1–Q6, reliability items R1–R4, design decisions D1–D2). Excluded by request: stale-weather re-check at send time, planner temperature tuning.

## Summary

The V2 pipeline (3 planners → multimodal critic → curator → deterministic
validation → LLM repair) is architecturally sound. This overhaul redistributes
work along one principle: **models generate, judge, and write; code selects
and enforces.** Every place the current design asks a model to *satisfy
constraints* — pick exactly two floor-clearing finalists, assemble a
set-valid trio — is converted to deterministic code, and the models' honest
outputs (candidates, scores, prose) become the inputs. Alongside that, the
feedback loop is reconnected (it currently cannot map feedback to items and
discards likes), item color metadata gains ground truth via an enrichment
pass, rotation gets a real cooldown rule, model payloads shrink to what
matters, and the transport/scheduler layer stops losing mornings to
single transient errors.

## Decisions

| Decision | Choice |
|---|---|
| Finalist selection | Moved from critic to code (top-2 eligible per archetype by weighted composite) |
| Final-set selection | Moved from curator to code (brute-force 2×2×2 → 3×3×3 sets against set constraints) |
| Curator role | Reduced to copywriter for a pre-selected, pre-validated set |
| Infeasibility handling | Targeted re-plan of one archetype (max 2 re-plan rounds per run), then fail closed |
| Score floors | Unchanged values; now applied by code, removing inflation pressure |
| Feedback exposure | All three values (`liked`/`disliked`/`wore`), resolved to item labels, full 30-day window, plus per-item aggregates |
| Item ids at the model boundary | Models see and emit `shortLabel`s only (`T012`); code translates to real ids |
| Weather payload to models | Derived summary only; `hourly` array never leaves the script |
| `criticSummary` field | Dropped (rendered nowhere — checked email and app) |
| Rain thresholds | Unified on `weather.rainExpected` (≥50% probability ∧ ≥0.01 in) |
| Enrichment target | `dailyProfile` written into `src/data/closet.json` + `src/data/sneakers.json`; placeholder-only |
| Hydration gap | App merge adopts manifest `dailyProfile` when the localStorage item has none |
| D1 near-copy policy | Hard-block only exact core trios of **manual** saves; 2-of-3 overlap becomes a critic freshness penalty; AI saves never block |
| D2 saved-outfit resurfacing | New optional, honestly-labeled **Encore** email section, deterministic, ≤1 per 7 days; the three generated looks are untouched |
| Policy version | `QUALITY_POLICY_VERSION` 2 → 3 (invalidates stale pending bundles / job state) |

---

## Q1 — Feedback loop repair

### Current defects

1. `dailyHistoryContextV2_` (Taste.gs) exposes past outfits as
   `{localDate, itemIds, archetype}` — dropping `candidateId` — while feedback
   entries carry only `candidateId`. The join key never reaches the prompt, so
   no model can tell **which items** were disliked or worn.
2. The filter keeps only `disliked` and `wore`; `liked` — the only explicit
   positive rating — is discarded.
3. No prompt explains what any feedback value or `reason` means, or what to do
   about it.

### Changes

**Data (Taste.gs, `dailyHistoryContextV2_`):**

- Resolve every feedback entry against its day's history entry by
  `candidateId` (and, once D2 lands, against that day's encore). Emit:

  ```json
  feedback: [{
    "localDate": "2026-07-10",
    "value": "disliked",
    "reason": "colors",
    "note": "…",                      // when present
    "outfitName": "Court Minimal",
    "archetype": "polished-casual",
    "items": ["T012 Nike ACG tee", "B004 Dickies double knee", "S009 AJ1 Mocha"]
  }]
  ```

  Items are rendered as `shortLabel + brand + name` strings (Q6 label rules).
  Feedback that cannot be resolved (e.g., left on a test bundle that was never
  recorded) is silently dropped — explicit non-goal to recover it.
- Window: full retained history (`maxDailyHistoryDays`, default 30), not the
  previous 14 entries. Feedback is sparse and precious; 30 days is still
  bounded.
- Include all three values. The existing `disliked|wore` filter is deleted.
- Add per-item aggregates over the same window (only items with ≥1 signal):

  ```json
  itemFeedbackSignals: { "T012": { "wore": 2, "liked": 1, "disliked": 0 }, … }
  ```

- Add `wornItemIds` (internal, real ids): every item appearing in any
  recommendation whose `candidateId` has a `wore` entry. Consumed by the Q5
  cooldown rule; not sent to models.

**Prompts:** a single shared guidance block, `historyGuidanceV2_()`, appended
immediately after the history JSON in the planner, critic, copywriter, and all
repair prompts:

> HOW TO USE DAILY HISTORY:
> - `exactOutfitsPrevious14Days` — combinations already emailed. Never repeat one exactly.
> - `itemUsagePrevious7Days` — how often each item appeared in the last seven **emails** (exposure, not wear). Treat 3+ appearances as over-exposed unless `itemFeedbackSignals` shows Kevin actually wore it.
> - `feedback` — Kevin's explicit reactions. `wore` is the strongest positive evidence for that outfit's styling logic and its items. `liked` is positive. `disliked` is negative, and `reason` names the failing dimension (colors, too-warm, too-formal, …). Do not rebuild a disliked combination or repeat its failure pattern; do favor the visual logic of worn and liked outfits without copying them.

**Files:** `Taste.gs`, `Planner.gs`, `Critic.gs`, `Curator.gs`, `Repair.gs`.

---

## Q2 — Deterministic finalist & set selection

### Critic becomes a pure scorer

- `CRITIC_SCHEMA_V2` drops the `finalists` object entirely. The response is
  `{ scores: [...] }` only.
- `validateCriticResponseV2_` keeps every structural check on scores (each
  candidate scored exactly once, all nine metrics 0–10, defect/reservation
  arrays) and drops all finalist checks.
- Prompt changes (`runCriticV2_`):
  - Remove: "Select exactly two non-disqualified finalists per archetype" and
    all floor language tied to selection.
  - Add: *"Your scores feed a deterministic selector that applies quality
    floors downstream. Score each candidate faithfully against the anchors —
    an honest low score is more useful than a generous one. You are not
    responsible for ensuring any candidate qualifies."*
  - Replace the hardcoded "all 15 candidates" with the actual count
    (re-plan calls score 5).
- `criticScoreMeetsFinalFloorV2_` (unchanged values: `weather ≥ 8`,
  `palette ≥ 7.5`, `colorIntent ≥ 8`, mean of palette/silhouette/formality
  ≥ 7.5, not disqualified) moves from validation duty to selection duty.

This removes the contradiction where the critic (and its repair prompt) was
told both "do not inflate scores" and "produce two floor-clearing finalists."
Expected observable effect: score histograms stop clustering at exactly 8.0
and 7.5.

### Composite score

`compositeScoreV2_(score)` — weighted sum over all nine dimensions, so the
four currently-unused dimensions (visualInterest, wearability, freshness,
archetypeFit) start doing work:

| Dimension | Weight | Note |
|---|---|---|
| colorIntent | 0.20 | The system's signature judgment |
| palette | 0.15 | |
| weather | 0.12 | Low weight is safe: the ≥8 floor already gates eligibility |
| archetypeFit | 0.10 | |
| visualInterest | 0.10 | |
| wearability | 0.10 | |
| freshness | 0.10 | Gains teeth via Q5 + D1 anchors |
| silhouette | 0.08 | |
| formality | 0.05 | |

Weights live in `DAILY_V2` so tuning is a config edit, not a prompt edit.

### Selection algorithm (new file `Selection.gs`)

```
selectFinalistsV2_(candidates, scores, snapshot, weather, history):
  per archetype:
    eligible = candidates passing ALL candidate-level checks:
      - criticScoreMeetsFinalFloorV2_ (floors + not disqualified)
      - not an exact prior-14-day repeat (existing history key check)
      - not a saved-outfit copy (near-copy rule today; exact manual
        core-trio after D1 lands)
      - contains no Q5 cooldown top/bottom
      - passes weatherSafetyErrorsV2_ (free to check here; fail early)
    sort by composite desc (tie: colorIntent desc, then candidateId asc)
  if any archetype has < 2 eligible → return { needsReplan: archetype }
  finalists = top 2 per archetype

selectFinalSetV2_(finalistPools, snapshot, weather):
  enumerate one-per-archetype sets from top-2 pools (8 sets)
  feasible = sets passing ALL set-level constraints:
    - unique tops, unique bottoms across the set
    - unique shoes when ≥ 3 weather-safe shoes exist in the snapshot
      (weather-safe = !rainExpected ∨ rainSafety ≠ 'poor', as today)
    - no two outfits share more than one item
    - distinct diversity stories (existing primaryColorFamily|silhouette key)
    - layer repeat only when layerGuidance === 'required' and < 2 credible layers
  if none feasible → widen pools to top-3 eligible (≤ 27 sets), retry
  if still none → return { needsReplan: <archetype chosen below> }
  rank feasible: Σ composite desc → min composite desc → Σ colorIntent desc
                 → joined candidateIds asc (total determinism)
  return best set
```

Candidate-level rules live in eligibility (a candidate violating them can
never belong to any feasible set); only genuinely cross-outfit rules are set
constraints. `validateFinalBundleV2_` continues to re-check both layers as
defense-in-depth.

### Targeted re-plan

Triggered when an archetype has <2 eligible candidates, or no feasible set
exists even at top-3 pools.

- Archetype choice: the one with the fewest eligible candidates (tie: lowest
  best-composite).
- Re-run **that planner only**, appending to its prompt:
  - the critic's `criticalDefects`/`reservations` for that archetype's failed
    candidates ("your previous five candidates failed because: …"),
  - an avoid-list of shortLabels currently claimed by the other two
    archetypes' top finalists ("other looks in today's set already use these
    items; prefer alternatives: …").
- Critic scores **only the 5 new candidates** (same rubric, same anchors);
  results merge into the score map. New candidates merge into the archetype's
  pool (exact-duplicate combinations dropped).
- Re-run selection from the top.
- Caps: 1 re-plan per archetype, 2 re-plan rounds per run. Exhausted →
  throw. Fail-closed is intentional: no email beats a bad email, and the
  existing scheduler retry/alert behavior takes over.

### Curator becomes a copywriter

- Input: the 3 selected candidates (label-form, per Q6), their critic scores,
  weather view, history + guidance block, and per-item images
  (`candidateImagePartsV2_` unchanged).
- Prompt (rewrite of `runCuratorV2_`): *"These three outfits are final —
  selected and validated upstream. Do not swap, reorder, or modify them. Write
  the customer-facing copy for each."* All existing copy-quality language
  (name exact visible colors and the two+ items creating the relationship; ban
  "keeps it clean" / "lets the top pop" genericisms) carries over verbatim.
- Schema: `FINAL_RECOMMENDATION_SCHEMA_V2` minus `criticSummary` (dropped —
  see R4). `candidateId`, `archetype`, `itemIds` must echo the selected set;
  validation enforces byte-exact echo.
- Temperature stays 0.4.
- `repairFinalBundleV2_` keeps its 2-attempt loop but is now copy-only: the
  set cannot be wrong, so repairs fix lengths/genericisms — a dramatically
  easier task with a correspondingly higher success rate.
- `validateFinalBundleV2_` is retained unchanged as defense-in-depth (minus
  the criticSummary field). Most of its set-level errors become unreachable;
  that is the point.

### Stage machine

New stage between `critic-ready` and bundle assembly, in all three flows
(`generationBundlePipelineV2_`, `generateDailyBundleStepV2`,
`advanceDailyJobV2_`):

```
idle → weather-ready → planners-ready → critic-ready → selection-ready → bundle-ready → sent
```

`selection-ready` encompasses finalist selection, set selection, and any
re-plan rounds (the model-call-heavy part that needs its own execution-budget
slot). `pending.selection` persists observability data:

```json
{
  "eligibleCountByArchetype": { "easy": 4, "polished-casual": 2, "expressive": 3 },
  "compositeById": { "…": 8.1 },
  "path": "top2" | "top3" | "replan-1" | "replan-2",
  "feasibleSetCount": 3,
  "replannedArchetypes": []
}
```

`getDailyOutfitDiagnosticsV2()` surfaces `selection.path`,
`eligibleCountByArchetype`, and per-stage `attemptCounts` — the raw material
for judging score inflation and repair rates during the shadow re-run.

**Policy version:** `QUALITY_POLICY_VERSION` → 3, invalidating any in-flight
pending bundle or job state at deploy time.

**Files:** `Critic.gs`, `Curator.gs`, `Repair.gs`, new `Selection.gs`,
`Scheduler.gs`, `Config.gs`, `Diagnostics.gs`, `FinalValidation.gs`.

---

## Q3 — Wardrobe-wide profile enrichment

All 75 garments currently have zero `dailyProfile` overrides: every
`silhouette` is `'unknown'`, no `secondaryColorFamily` exists, and sneaker
`rainSafety` is `'unknown'`. Three quality mechanisms are therefore dormant:
color-hook grounding, the diversity-story check (degenerates to color-only),
and the rain-shoe gate (only fires on `'poor'`, which nothing sets).

### Type change (`src/features/daily-outfits/types.ts`)

`DailyRecommendationProfileV2` gains `accentColors?: string[]` (0–4 plain
color names — the visible secondary/trim/graphic colors that the color-hook
system is built around). Flows through `compactItemIndexV2_` automatically
(it ships the whole profile) and is included in the Q6 trimmed profile view.

### New script `scripts/enrich_daily_profiles.mjs`

Mirrors `enrich_sneakers.mjs` conventions exactly: `GEMINI_API_KEY` env var,
`--dry-run` / `--force` flags, same model id as the existing script, reads
`public/` images, one structured-output call per item.

- **Targets:** every item in `src/data/closet.json` and
  `src/data/sneakers.json`.
- **Fields inferred per item:** `silhouette`, `secondaryColorFamily`,
  `accentColors`, `patternIntensity`, `formality`, `warmth`, `breathability`,
  `windProtection`, and for shoes `rainSafety` (judged from visible
  materials: leather/sealed vs knit/canvas/suede).
- **Placeholder-only rule:** a field is written into `item.dailyProfile` only
  if not already present there (object may not exist at all today). Written
  fields get `source: 'ai-inferred'`, `confidence: 0.75`, `updatedAt`.
  `--force` regenerates everything. Review the diff and edit freely, as with
  the sneaker script.

### Hydration gap fix (`src/App.tsx`)

The manifest merge only *adds new items*; localStorage wins wholesale for
existing ids, so enriched JSON would never reach a browser that already has
the items. Add a **profile-fill merge** to the closet and sneaker hydration
paths: for every local item whose id exists in the manifest, if the local
item has no `dailyProfile` and the manifest item does, adopt the manifest's.
Object-level, not field-level (no UI writes `dailyProfile` today, so this is
safe; field-level merging can follow if a profile editor ever lands). Never
overwrites an existing local `dailyProfile` — future manual edits win.

### Prompt updates

Planner and critic color instructions add: *"Each item's profile lists
`primaryColorFamily`, `secondaryColorFamily`, and `accentColors` verified
from its photographs. Treat them as ground truth for what colors exist; use
the images to judge how the colors relate."* The existing instruction to
inspect graphic tops' accent colors now has data to lean on instead of
12-per-page atlas crops.

### Operational steps after merging

1. Run the script; review the `src/data/*.json` diff; commit.
2. In the app: **Build visual inventory** → **Sync now** (the
   `wardrobeFingerprint` changes because profiles are fingerprinted —
   `snapshotBuilder.ts:59` — which correctly invalidates stale job state).
3. `validateStoredSnapshotV2` as usual.

**Files:** `scripts/enrich_daily_profiles.mjs` (new), `types.ts`,
`itemProfile.ts` (accept/clamp `accentColors`), `App.tsx`, `Planner.gs`,
`Critic.gs`.

---

## Q4 — Score anchors

Only `colorIntent` currently has band definitions — and it is visibly the
best-behaved dimension. Every other gate-relevant dimension gets one anchor
line, added to the critic prompt (and the critic repair prompt) directly
after the existing colorIntent bands. `colorIntent` bands are unchanged.

> - **weather:** 10 = ideal across the whole 6:00–23:00 window; 8 = comfortable morning, midday, and evening with at most one minor compromise — the minimum for a finalist; 6 = fine midday but wrong at the edges of the day; 4 = uncomfortable for a meaningful part of the day; ≤2 = unsafe or clearly wrong.
> - **palette:** 9–10 = every visible color sits in one deliberate scheme; 7–8 = coherent with one minor stray; 5–6 = colors merely coexist; ≤4 = at least one visible conflict.
> - **silhouette:** 9–10 = proportions read as deliberate, volumes balance; 7–8 = standard and unremarkable; 5–6 = slightly mismatched volumes; ≤4 = clearly fighting proportions.
> - **formality:** 9–10 = all pieces on one register; 7–8 = one register with a soft outlier; 5–6 = mixed registers; ≤4 = jarring mix.
> - **freshness:** 9–10 = a genuinely new combination of non-over-exposed items; 7–8 = familiar items in new relationships; 5–6 = leans on over-exposed items or echoes a recent look; ≤4 = barely differs from a recent email, or shares two core pieces with a saved outfit without transforming it. Verified `wore`/`liked` feedback on similar looks lifts this score.
> - **archetypeFit:** 9–10 = unmistakably this archetype next to the other two briefs; 5–6 = could belong to a neighboring archetype; ≤4 = wrong brief.
> - **visualInterest:** 9–10 = a specific reason to look twice (color idea, texture, proportion); 5–6 = pleasant but forgettable; ≤4 = inert.
> - **wearability:** 9–10 = zero-friction for an ordinary day; 5–6 = needs babying (delicate, fussy, impractical); ≤4 = impractical for the day described.

**Files:** `Critic.gs` (both prompts).

---

## Q5 — Rotation cooldown

The only hard rotation rule today is "no exact combination from the prior 14
days," and `itemUsagePrevious7Days` counts recommendations (not wears) with
no interpretation guidance.

### Rule

> A **top or bottom** that appeared in yesterday's sent email (any of the
> three looks, or the encore once D2 lands) may not appear in today's final
> three unless that item has at least one `wore` feedback entry in retained
> history.

- Shoes exempt (weather-safe shoe inventory is small; uniqueness rules
  already rotate them). Layers exempt (weather-driven necessities).
- "Yesterday" = the history entry whose `localDate` is exactly the calendar
  day before today (computed in the configured timezone). No entry (skipped
  day) → empty cooldown.

### Data & enforcement

- `dailyHistoryContextV2_` gains `cooldownItemLabels` (model-facing) and the
  internal `cooldownItemIds` / `wornItemIds` sets.
- **Hard enforcement:** a candidate-eligibility check in
  `selectFinalistsV2_` (Q2) and a mirrored check in
  `validateFinalBundleV2_` (defense).
- **Soft steering:** one planner-prompt line — *"Items listed in
  `cooldownItemLabels` headlined yesterday's email; avoid them today unless
  history shows Kevin wore them"* — plus the freshness anchor (Q4) and the
  usage-count interpretation line (Q1). If planners ignore the steering and
  an archetype's whole pool violates cooldown, the Q2 re-plan loop repairs it
  with an explicit avoid-list.

**Files:** `Taste.gs`, `Selection.gs`, `FinalValidation.gs`, `Planner.gs`.

---

## Q6 — Model-boundary hygiene (payload + labels)

### Weather view

New `modelWeatherViewV2_(weather)` used by every prompt builder: all derived
fields (`morning/midday/eveningFeelsLikeF`, min/max, high/low, rain, wind,
humidity, flags, `layerGuidance`, `plainEnglishSummary`, `weatherPhrase`,
`localDate`, `locationLabel`) and **no `hourly` array**, no `fetchedAt`, no
`timezone`. Storage, history, and the email keep the full profile — this is
a prompt-serialization view only. Cuts ~160 numbers of hourly minutiae from
every one of the 5+ model calls per run.

### Profile view

`compactItemIndexV2_` serializes profiles through a trimmed view: keep
`warmth`, `breathability`, `rainSafety`, `windProtection`, `formality`,
`silhouette`, `patternIntensity`, `primaryColorFamily`,
`secondaryColorFamily`, `accentColors`; drop `available`,
`excludedFromDaily` (snapshot validation already guarantees their values),
`source`, `confidence`, `updatedAt`.

### shortLabels are the only model-facing id

Real ids are strings like `user_sneaker_1783863184667` — 20+ characters the
model must transcribe exactly, at temperature 0.9, across ~20 references per
planner response. `shortLabel` (`T012`, `B004`, `S009`) exists precisely for
model-facing use and is validated unique per snapshot.

- **Every** model-facing surface renders labels and omits long ids: the
  compact item index (`label` replaces `id`), atlas part text
  (`item labels=…`), per-candidate image part text, candidate/finalist JSON
  serialized into critic and copywriter prompts
  (`modelFacingCandidateV2_`), taste signatures, history outfits, feedback
  items, cooldown lists. An item referenced by history but no longer in the
  snapshot falls back to its raw id string as an opaque token.
- **Planner output** (`topId`, `bottomId`, `shoeId`, `layerId`, `itemIds`)
  is expected in label form. A translation layer (`resolveLabelsV2_`,
  ItemIndex.gs) maps labels → real ids immediately after parse, before
  validation; an unknown token becomes a normal validation error naming it
  (existing repair path handles it). Everything downstream of the planner
  boundary — pending files, history, bundle, email — continues to use real
  ids exclusively.
- `candidateId` remains a model-invented opaque string (unchanged).
- Prompt line (planner): *"Reference items only by their short label (T…,
  B…, L…, S…) exactly as printed in the index and atlases."*

**Files:** `ItemIndex.gs`, `Planner.gs`, `Critic.gs`, `Curator.gs`,
`Repair.gs`, `Taste.gs`, `Weather.gs` (view helper location optional).

---

## R1 — Retry & batch salvage (GeminiTransport.gs)

`parseGeminiResponseV2_` already marks `error.retryable` for 429/5xx; nothing
consumes it, so one transient error kills a whole stage — and the next
10-minute tick re-runs **all three planners** even if two succeeded.

- New `fetchGeminiWithRetryV2_(request, stage)`: attempt → on retryable
  failure, `Utilities.sleep(status === 429 ? 20000 : 4000)` → one retry →
  rethrow the second failure. Non-retryable errors (4xx ≠ 429) throw
  immediately. `callGeminiV2_` routes through it.
- `callGeminiBatchV2_`: after `fetchAll`, parse each response individually,
  collecting per-index failures. Retryable failures are re-issued **once**,
  only for the failed indices (single follow-up `fetchAll` after one
  backoff sleep, 20s if any 429 else 4s), and merged. Any remaining failure
  throws with stage + archetype context (`"planner[expressive] …"`), so two
  good planner responses are never discarded because the third hit a 429.
- Budget note: worst case adds ~2×20s to a stage; the existing
  `MIN_EXECUTION_REMAINING_MS` (45s) guard in `advanceDailyJobV2_` already
  bounds stage work and needs no change.

## R2 — Weather fetch exception fallback (Weather.gs)

The cache fallback only covers HTTP error *statuses*; a thrown network
exception (DNS, timeout) bypasses it. Wrap `UrlFetchApp.fetch` in try/catch
and route exceptions through the same fallback: same-`localDate` cache ≤
`MAX_WEATHER_AGE_MS` old → use it; otherwise rethrow the original error.

## R3 — Scheduler catch hardening (Scheduler.gs)

The catch block calls `applySnapshotSettingsV2_(getDailyConfigV2_(),
loadSnapshotV2_())` — if Drive was the original failure, the handler throws,
losing the state save and the operational alert.

- Hoist `var config = null` above the try; the happy path assigns it where it
  does today.
- In the catch: timezone = `config ? config.timezone :` a properties-only
  `getDailyConfigV2_().timezone` inside its own try; if even that fails,
  skip the cutoff logic (still save state and log).
- Wrap the entire error-handler body so a secondary failure is logged via
  `console.error` without masking the original error in the return value.

## R4 — Minors

| Item | Change |
|---|---|
| History file churn | `mergeSnapshotFeedbackIntoHistoryV2_` runs every scheduler tick and rewrites the Drive file (create + trash) even when nothing changed. Track a `changed` flag (compare each entry's feedback JSON before/after); call `saveHistoryV2_` only when true. |
| `criticSummary` | Required, validated for presence, rendered nowhere (checked `Email.gs` and the React app — only the type mentions it). Remove from `FINAL_RECOMMENDATION_SCHEMA_V2`, the copywriter prompt, and `DailyFinalRecommendationV2` in `types.ts`. |
| Rain threshold | `weatherSafetyErrorsV2_` shoe gate uses ≥60% ∧ ≥0.01 in while `rainExpected` uses ≥50% ∧ ≥0.01 in. Replace the gate's inline condition with `weather.rainExpected` — one source of truth, marginally stricter. |
| Comfort-band gates | `weatherSafetyErrorsV2_` gains three checks (existing rules unchanged): **layer warmth 4 blocked above 85°F midday** (extends the existing warmth-5 > 82°F rule), **top warmth ≥ 4 blocked above 85°F midday**, **top warmth 3 blocked above 92°F midday**. Bands intentionally catch only absurdities — a warmth-4 hoodie at 88°F currently passes every deterministic check — while borderline calls stay with the critic's weather floor. |

---

## D1 — Near-copy policy v2 (recommended)

**Problem:** any 2-of-3 core overlap with *any* saved outfit — including
AI-generated saves, whose 0.3 weight is shown to models but ignored by the
blocking code — is banned forever, at both planner validation and final
validation. Every save permanently fences off its good pairings; the feasible
space shrinks monotonically as the app is used. Saving an outfit you love
guarantees never being recommended anything close to it.

**Recommendation:**

- **Hard block** (planner validation + final validation + Q2 set constraint):
  only an **exact core-trio copy** — candidate's top, bottom, and shoes all
  matching a **manual** saved outfit's core trio
  (`sharedCoreItemIds.length >= 3`). Implemented as
  `savedOutfitExactCopyV2_`, replacing `savedOutfitNearCopyV2_` in blocking
  positions.
- **Soft penalty:** 2-of-3 overlap becomes critic context. Candidate
  serialization gains `sharesTwoCoreWith: ["<outfit name>", …]` when
  applicable, and the Q4 freshness anchor already prices it (≤4 "without
  transforming it"). Planner prompt language changes from the flat ban to:
  *"Never reproduce the exact core trio of a saved outfit. Sharing two core
  pieces is acceptable only when the third piece meaningfully changes the
  look."*
- **AI-sourced saves** (`source: 'ai'`): removed from blocking entirely.
  Split `savedTasteSignaturesV2_` into `tasteEvidenceV2_` (all saves,
  weighted, for prompts) and `manualCoreTriosV2_` (manual-only, for
  blocking).
- Unchanged and unrelated: the planner-internal rule that candidates within a
  response may not share 2+ core pieces **with each other** — that is
  intra-batch diversity and stays.

**Rationale:** preserves the anti-template intent (exact copies still never
appear unlabeled) while stopping the monotonic shrinkage; the model regains
access to proven-good pairings as raw material, priced by freshness instead
of forbidden.

## D2 — Encore: saved-outfit resurfacing (recommended)

**Problem:** the system treats Kevin's explicit taste (hand-built outfits) as
a thing to avoid rather than occasionally serve. The strongest positive
signal in the dataset can never appear in a daily email.

**Recommendation:** an optional, honestly-labeled fourth email section —
**ENCORE** — deterministic, zero model calls, leaving the three generated
looks untouched.

- **Eligibility** (all required):
  1. Manual saved outfit (`source !== 'ai'`) with a full core trio whose
     items are all present and available in the snapshot.
  2. Passes `weatherSafetyErrorsV2_` for today's weather.
  3. Its core trio has not appeared in retained history (as a
     recommendation or a prior encore) in the last 30 days.
  4. No `disliked` feedback ever recorded against this outfit's encores.
  5. Cadence: ≥7 calendar days since `LAST_ENCORE_DATE_V2` (new script
     property).
- **Choice among eligible:** longest since last surfaced (never surfaced
  first), tie → oldest `createdAt`. Deterministic.
- **Mechanics:** computed during bundle assembly (`buildBundleV2_`);
  `bundle.encore = { outfitId, name, itemIds, candidateId: "encore:<outfitId>" }`
  (optional field on `DailyBundleV2`). `recordSentBundleV2_` stores it on the
  history entry; encore items count toward `itemUsagePrevious7Days` and the
  Q5 cooldown source (they "appeared yesterday"), steering the next day's
  generation away naturally.
- **Email:** a visually distinct section after the three looks — kicker
  `ENCORE — FROM YOUR SAVED OUTFITS`, outfit name, item strip, one static
  line (e.g., "One of yours, back in rotation for today's weather."). No
  model-written copy. Plain-text version included.
- **App:** `DailyBundlePreview` renders the encore when present, with the
  standard feedback controls (feedback `candidateId` = `encore:<outfitId>`,
  which flows through the existing merge and the Q1 resolution).
- **Interplay with D1:** an encore *is* an exact copy — served honestly under
  its own label rather than laundered through the generation pipeline. The
  two decisions are complementary halves of one policy: generation never
  copies; the encore slot openly repeats.

**Files:** new `Encore.gs`, `JobState.gs` (`buildBundleV2_`,
`recordSentBundleV2_`), `Email.gs`, `Taste.gs`, `types.ts`,
`DailyBundlePreview.tsx`.

---

## Rollout sequencing

Each phase is independently deployable and testable; order minimizes risk.

| Phase | Contents | Risk |
|---|---|---|
| **A** | R1–R4 reliability set; Q6 payload trim + label boundary; Q4 anchors | Low — no behavioral policy change |
| **B** | Q1 feedback repair; Q5 cooldown data (context only, soft steering) | Low |
| **C** | Q2 deterministic selection + Q5 hard enforcement + policy version 3 | The big one |
| **D** | Q3 enrichment script + hydration merge + re-sync | Isolated; can run in parallel with A–C |
| **E** | D1 near-copy v2; D2 encore | Product-behavior changes |

After Phase C, re-enter shadow mode for 3–5 mornings. The scorecard gains
three inflation/health signals from the new diagnostics: distribution of
critic scores near the floor values (pre-change baseline: clustering at
exactly 8.0/7.5), `selection.path` distribution (how often top-3 widening or
re-plans fire), and per-stage `attemptCounts` (repair pressure).

## Testing

`appsScriptContracts.test.ts` already evals real `.gs` source via
`new Function` under vitest; every new deterministic unit follows that
pattern:

- **Selection:** composite math; top-2/top-3 pool construction; full
  feasibility matrix including the "both easy finalists share the polished
  finalist's sneaker" dead-end (asserts `needsReplan`, not an exception);
  deterministic tie-breaks.
- **Cooldown:** yesterday resolution across skipped days; `wore` exemption;
  shoes/layers exempt.
- **Feedback resolution:** candidateId join, `liked` inclusion, unresolvable
  entries dropped, aggregates, encore feedback ids.
- **Labels:** `resolveLabelsV2_` round-trip, unknown-label error text,
  no long ids present in any assembled prompt string (regex assertion on
  `plannerPartsV2_` output against a fixture snapshot).
- **Comfort bands:** each new threshold at, above, and below the boundary.
- **Near-copy v2:** exact-trio blocks manual saves only; 2-of-3 passes
  validation; AI saves never block; `sharesTwoCoreWith` context emitted.
- **Encore:** each eligibility clause independently falsified; cadence;
  deterministic choice.
- **Transport:** retry paths unit-tested by extracting the
  retry decision (`retryable` × attempt count → sleep ms | throw) into a pure
  function; `fetchAll` salvage tested with stubbed response objects.

Manual checklist: one full shadow generation via `generateDailyBundleStepV2`
stage-by-stage; test email rendering with and without an encore section;
diagnostics shows `selection` block; enrichment `--dry-run` diff review.

## Out of scope

- Stale-weather re-check at send time (explicitly excluded).
- Planner temperature tuning (Q7 from the review) — the new diagnostics
  enable the experiment; no value change here.
- Splitting the 15-candidate critic call (kept single-call for cross-candidate
  comparability; re-plan calls are naturally smaller).
- An in-app `dailyProfile` editor (the `'manual'` source path is
  future-proofed by the object-level hydration merge).
- Any model id changes.

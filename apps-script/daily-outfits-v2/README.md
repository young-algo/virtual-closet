# Daily Outfits V2 — Google Apps Script

This directory is the private scheduled sidecar for the Virtual Closet. It does not import, invoke, or write state used by the browser's on-demand stylist.

## Deploy

1. Create a standalone Google Apps Script project owned by the Gmail account that will send the email.
2. Copy every `.gs` file and `appsscript.json` into the project. With clasp, place this directory's contents at the clasp project root and run `clasp push`.
3. Add these Script Properties in **Project settings → Script properties**:

   - `GEMINI_API_KEY`
   - `SYNC_SECRET` — at least 16 random characters, matching the browser setting
   - `RECIPIENT_EMAIL` — defaults to `kevincollinsturner@gmail.com`
   - `LOCATION_LABEL`, `LATITUDE`, `LONGITUDE`, `TIME_ZONE`
   - `DELIVERY_HOUR`, `DELIVERY_MINUTE`, `GENERATION_LEAD_MINUTES`
   - `APP_URL` — optional read-only link back to the closet
   - `DAILY_PLANNER_MODEL`, `DAILY_CRITIC_MODEL`, `DAILY_CURATOR_MODEL`, `DAILY_REPAIR_MODEL`
   - `DAILY_MODEL_TEMPERATURE` — optional; defaults to `0.9` for planners
   - `SEND_OPERATIONAL_ALERTS` — `true` or `false`
   - `SHADOW_MODE` — set `true` during the 3–5 morning rollout to generate and persist without sending

   Drive file IDs, job state, pending bundle ID, `LAST_SENT_DATE_V2`, `SEND_IN_PROGRESS_DATE_V2`, `LAST_ENCORE_DATE_V2`, and `DISLIKED_ENCORE_IDS_V2` are managed by the script. Do not pre-populate or routinely edit them.

4. Deploy as a Web app that executes as the owner. Copy its `/exec` URL into **Wardrobe → Daily email** in the React app.
5. Run `installDailyOutfitTrigger()` once from the Apps Script editor and approve Drive, external-request, email, and trigger scopes.
6. In the React settings, run **Build visual inventory**, **Sync now**, **Validate server snapshot**, and **Generate test bundle** in order.
7. Use **Send test email** only after the generated bundle passes review.

## Profile enrichment before policy-v3 rollout

1. Run `node scripts/enrich_daily_profiles.mjs --dry-run` with `GEMINI_API_KEY` in the environment.
2. Run `node scripts/enrich_daily_profiles.mjs`, review every `src/data/closet.json` and `src/data/sneakers.json` profile against its image, and commit the reviewed manifests.
3. In **Wardrobe → Daily email**, run **Build visual inventory**, **Sync now**, then **Validate server snapshot**. Profile data participates in `wardrobeFingerprint`, so the sync intentionally invalidates stale pending/job state.

## Policy-v3 shadow rollout

Deploy every `.gs` file, including `Selection.gs` and `Encore.gs`. For the 3–5-morning shadow window, keep both the React **Daily Email** toggle and the installed Apps Script trigger enabled, and set only `SHADOW_MODE=true`. Shadow mode continues scheduled generation and persistence while suppressing the real email send.

- In **Wardrobe → Daily email**, run **Build visual inventory**, **Sync now**, then **Validate server snapshot** in that exact order. After Build, require `116 items` and a new `wardrobeFingerprint` that reflects the enriched profiles. After Sync, require sync state `synced` with that same fingerprint. Validation must report exactly `Stored snapshot passes every structural check.`
- Use **Generate test bundle**, or call `generateDailyBundleStepV2` exactly five times. The returned stages must be `weather-ready`, `planners-ready`, `critic-ready`, `selection-ready`, then `bundle-ready`, in order. At `bundle-ready`, inspect the persisted pending bundle: it must contain exactly three recommendations whose real persisted `candidateId` values match the corresponding `pending.selectedCandidates`, one each for `easy`, `polished-casual`, and `expressive`; if Encore is present, its `candidateId` must begin `encore:`.
- `getDailyOutfitDiagnosticsV2()` must show `selection.path`, `eligibleCountByArchetype`, `feasibleSetCount`, `replannedArchetypes`, and per-stage `attemptCounts`, without secrets or thumbnails.
- Review critic score distributions for clustering at exactly `8.0` and `7.5`.
- Record how often selection uses `top2`, `top3`, `replan-1`, or `replan-2`, including which archetypes were replanned.
- Confirm the job fails closed without sending when two targeted re-plan rounds cannot produce a feasible set.
- Reproduce both email cases. With Encore, send/render the current pending bundle using **Send test email** and confirm the three-look order, exact-color hooks, item strip, HTML/plain-text parity, and the static Encore copy `One of yours, back in rotation for today's weather.` after the trio; Encore must contain no model-generated rationale. Without Encore, separately render an otherwise valid Encore-absent bundle through `renderDailyEmailV2_` in the Apps Script editor or test harness; require no Encore heading, Encore images, or blank Encore section, with HTML/plain-text parity intact. Confirm that both test rendering and test sending leave `LAST_SENT_DATE_V2` and `LAST_ENCORE_DATE_V2` unchanged.
- Perform browser QA at desktop width and below `760px`, checking card alignment, Encore identity and feedback controls, imagery, stacking, and horizontal overflow.
- Set `SHADOW_MODE=false` only after the generated trio, copy, email layout, optional Encore, diagnostics, re-plan behavior, and fail-closed behavior pass review across the 3–5 morning shadow window. Leave the **Daily Email** toggle and trigger enabled throughout.

For each morning, record critic floor clustering, `selection.path`, eligible counts, replanned archetypes, stage attempt counts, final trio quality, repair use, and Encore cadence. The system intentionally sends no outfit email when weather, snapshot freshness, model, critic, curator, or deterministic quality gates fail.

## Ambiguous-send recovery

If `SEND_IN_PROGRESS_DATE_V2` remains set and does not match `LAST_SENT_DATE_V2`, the scheduler and manual real-send entry point fail closed because Apps Script cannot prove whether Gmail accepted the message. A marker that does match `LAST_SENT_DATE_V2` is never discarded merely because the calendar advanced: before any new send, the script must load the persisted bundle for that exact marker date, repair sent history and Encore cadence idempotently, and only then clear the marker. If that marker-date bundle is absent or invalid, the marker remains set and all real sends stay blocked. Inspect the mailbox for the marker date before changing either property:

- If the email was delivered, set `LAST_SENT_DATE_V2` to the exact `SEND_IN_PROGRESS_DATE_V2` date, then rerun the scheduler or **Send now**. The script reconciles the persisted marker-date bundle into history and Encore cadence without sending again; it preserves any newer job state or later Encore date, then clears the marker only after reconciliation succeeds.
- If the email was definitely not delivered, delete `SEND_IN_PROGRESS_DATE_V2`, then rerun. The script may perform a new real send.

Do not delete an unresolved marker merely because it is from a prior day; stale unresolved markers also fail closed until the mailbox check establishes which recovery path is safe.

## Diagnostics

- `getDailyOutfitDiagnosticsV2()` reports configuration presence, snapshot status, job state, and last sent date without exposing secrets.
- `validateStoredSnapshotV2()` verifies every item, label, slot, thumbnail, and atlas membership.
- `resetDailyJobStateV2()` restarts today's staged job without clearing history or snapshot data.
- `removeDailyOutfitTriggers()` removes only this feature's scheduler triggers.

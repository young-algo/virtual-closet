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

   Drive file IDs, job state, pending bundle ID, `LAST_SENT_DATE_V2`, and `LAST_ENCORE_DATE_V2` are managed by the script.

4. Deploy as a Web app that executes as the owner. Copy its `/exec` URL into **Wardrobe → Daily email** in the React app.
5. Run `installDailyOutfitTrigger()` once from the Apps Script editor and approve Drive, external-request, email, and trigger scopes.
6. In the React settings, run **Build visual inventory**, **Sync now**, **Validate server snapshot**, and **Generate test bundle** in order.
7. Use **Send test email** only after the generated bundle passes review.

## Profile enrichment before policy-v3 rollout

1. Run `node scripts/enrich_daily_profiles.mjs --dry-run` with `GEMINI_API_KEY` in the environment.
2. Run `node scripts/enrich_daily_profiles.mjs`, review every `src/data/closet.json` and `src/data/sneakers.json` profile against its image, and commit the reviewed manifests.
3. In **Wardrobe → Daily email**, run **Build visual inventory**, **Sync now**, then **Validate server snapshot**. Profile data participates in `wardrobeFingerprint`, so the sync intentionally invalidates stale pending/job state.

## Policy-v3 shadow rollout

Deploy every `.gs` file, including `Selection.gs` and `Encore.gs`. Set `SHADOW_MODE=true` and keep automatic delivery disabled for 3–5 mornings.

- In **Wardrobe → Daily email**, run **Build visual inventory**, **Sync now**, then **Validate server snapshot** in that exact order. Confirm the inventory reports `116 items`, Sync uses the identical wardrobe fingerprint, and validation reports `Stored snapshot passes every structural check.`
- Advance the manual stage machine through `weather-ready`, `planners-ready`, `critic-ready`, `selection-ready`, and `bundle-ready`. At `bundle-ready`, require exactly three real recommendations, one per archetype, and at most one optional identity beginning `encore:`.
- `getDailyOutfitDiagnosticsV2()` must show `selection.path`, `eligibleCountByArchetype`, `feasibleSetCount`, `replannedArchetypes`, and per-stage `attemptCounts`, without secrets or thumbnails.
- Review critic score distributions for clustering at exactly `8.0` and `7.5`.
- Record how often selection uses `top2`, `top3`, `replan-1`, or `replan-2`, including which archetypes were replanned.
- Confirm the job fails closed without sending when two targeted re-plan rounds cannot produce a feasible set.
- Render and review the test email with and without Encore; confirm the three-look order, exact-color hooks, plain-text parity, and the static Encore section after the trio.
- Perform browser QA at desktop width and below `760px`, checking card alignment, Encore identity and feedback controls, imagery, stacking, and horizontal overflow.
- Enable delivery only after the generated trio, copy, email layout, optional Encore, diagnostics, re-plan behavior, and fail-closed behavior pass review across the 3–5 morning shadow window.

For each morning, record critic floor clustering, `selection.path`, eligible counts, replanned archetypes, stage attempt counts, final trio quality, repair use, and Encore cadence. The system intentionally sends no outfit email when weather, snapshot freshness, model, critic, curator, or deterministic quality gates fail.

## Diagnostics

- `getDailyOutfitDiagnosticsV2()` reports configuration presence, snapshot status, job state, and last sent date without exposing secrets.
- `validateStoredSnapshotV2()` verifies every item, label, slot, thumbnail, and atlas membership.
- `resetDailyJobStateV2()` restarts today's staged job without clearing history or snapshot data.
- `removeDailyOutfitTriggers()` removes only this feature's scheduler triggers.

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
   - `SHADOW_MODE` — set `true` during the seven-day rollout to generate and persist without sending

   Drive file IDs, job state, pending bundle ID, and `LAST_SENT_DATE_V2` are managed by the script.

4. Deploy as a Web app that executes as the owner. Copy its `/exec` URL into **Wardrobe → Daily email** in the React app.
5. Run `installDailyOutfitTrigger()` once from the Apps Script editor and approve Drive, external-request, email, and trigger scopes.
6. In the React settings, run **Build visual inventory**, **Sync now**, **Validate server snapshot**, and **Generate test bundle** in order.
7. Use **Send test email** only after the generated bundle passes review.

## Shadow rollout

Keep automatic delivery disabled at first. Let the 10-minute trigger generate and persist bundles for seven mornings, review the scorecard in the specification, and only enable delivery after five of seven days meet the quality threshold. The system intentionally sends no outfit email when weather, snapshot freshness, model, critic, curator, or deterministic quality gates fail.

## Diagnostics

- `getDailyOutfitDiagnosticsV2()` reports configuration presence, snapshot status, job state, and last sent date without exposing secrets.
- `validateStoredSnapshotV2()` verifies every item, label, slot, thumbnail, and atlas membership.
- `resetDailyJobStateV2()` restarts today's staged job without clearing history or snapshot data.
- `removeDailyOutfitTriggers()` removes only this feature's scheduler triggers.

# Daily Outfits V2 — Google Apps Script

This directory is the private scheduled sidecar for the Virtual Closet. It does not import, invoke, or write state used by the browser's on-demand stylist.

## Deploy

1. Create a standalone Google Apps Script project owned by the Gmail account that will send the email.
2. Copy every `.gs` file and `appsscript.json` into the project. With clasp, place this directory's contents at the clasp project root and run `clasp push`.
3. Add these Script Properties in **Project settings → Script properties**:

   - `GEMINI_API_KEY`
   - `SYNC_SECRET` — at least 16 random characters, matching the browser setting
   - `FEEDBACK_SECRET` — at least 16 random characters, distinct from `SYNC_SECRET`; signs the one-tap feedback links in the daily email
   - `WEB_APP_URL` — the deployment's `/exec` URL, used to build feedback links
   - `RECIPIENT_EMAIL` — defaults to `kevincollinsturner@gmail.com`
   - `LOCATION_LABEL`, `LATITUDE`, `LONGITUDE`, `TIME_ZONE`
   - `DELIVERY_HOUR`, `DELIVERY_MINUTE`, `GENERATION_LEAD_MINUTES`
   - `OPEN_METEO_API_KEY` — optional paid Open-Meteo key; when set, weather requests use `customer-api.open-meteo.com` with a per-key quota instead of the free per-IP endpoint
   - `DAILY_PLANNER_MODEL`, `DAILY_CRITIC_MODEL`, `DAILY_CURATOR_MODEL`, `DAILY_REPAIR_MODEL`
   - `DAILY_MODEL_TEMPERATURE` — optional; defaults to `0.9` for planners
   - `SEND_OPERATIONAL_ALERTS` — `true` or `false`
   - `SHADOW_MODE` — set `true` during the 3–5 morning rollout to generate and persist without sending

   Drive file IDs, job state, pending bundle ID, `LAST_SENT_DATE_V2`, `SEND_IN_PROGRESS_DATE_V2`, `LAST_ENCORE_DATE_V2`, `DISLIKED_ENCORE_IDS_V2`, and `EMAIL_FEEDBACK_FILE_ID_V2` are managed by the script. Do not pre-populate or routinely edit them. `DISLIKED_ENCORE_IDS_V2` has had no feed since this branch removed the in-app feedback path: a `disliked` signal on an Encore look was its only source, Encore looks carry no feedback links by design, and the ledger now stays `[]` permanently. Unsaving an outfit in the app is the way to retire a recurring Encore.

4. Deploy as a Web app that executes as the owner, with access set to **Anyone**. Anonymous access is already required for the React app's `doPost` calls, and the feedback links depend on it too. Copy its `/exec` URL into both **Wardrobe → Daily email** in the React app and the `WEB_APP_URL` Script Property. Once both `FEEDBACK_SECRET` and `WEB_APP_URL` are set, run the authenticated **Inspect diagnostics** action and confirm both keys read `true` under `feedbackConfigured` before moving on.
5. Run `installDailyOutfitTrigger()` once from the Apps Script editor and approve Drive, external-request, email, and trigger scopes.
6. In the React settings, run **Build visual inventory**, **Sync now**, **Validate server snapshot**, and **Generate test bundle** in order.
7. Review the generated bundle without sending it. **Send test email** is a separate, opt-in action: obtain fresh confirmation immediately before using it, even if an earlier rollout discussion mentioned a test send.

Redeploying matters for the feedback links specifically. The time-driven trigger runs HEAD, but the web app serves the *deployed* version, so `clasp push` alone leaves `doGet` unreachable and every link in the morning email dead. Pin clasp to v3 and redeploy in two steps, which preserves the `/exec` URL the app is configured with:

```
npx --yes @google/clasp@3 create-version "<description>"
npx --yes @google/clasp@3 update-deployment <deploymentId> --versionNumber <N>
```

Get `<deploymentId>` from `list-deployments`, which lists every deployment with its id and current version; use the id of the existing web app deployment, not a newly created one. Creating a deployment without targeting that id mints a new URL the app is not pointing at.

Use `--versionNumber`, never `-v`. Lowercase `-v` is clasp's global `--version` flag: it prints the clasp version, exits successfully, and leaves the deployment untouched. Because it fails silently, always re-run `list-deployments` afterward and confirm the version advanced. A deployment left on the old version serves an email whose links all resolve to code that cannot handle them.

To confirm `doGet` is live without sending mail, `curl -sL` the `/exec` URL with no query parameters. The response embeds the rendered page in its `userHtml` field — a working deployment returns the `This link isn't valid` page — and the runtime's `functionNames` list shows whether `doGet` is registered.

After deploying, send a test delivery and confirm the links render and report `Test delivery — not recorded`. Then confirm that a real morning email records a tap, and that the signal was drained into history: check the Apps Script execution log for the tap's `doGet` invocation and the next scheduler run's `mergeEmailFeedbackIntoHistoryV2_` drain, or read `virtual-closet-daily-v2-history.json` directly in Drive and confirm the entry for that date has a matching `feedback` array. **Inspect diagnostics** cannot show this: `getDailyOutfitDiagnosticsV2()` returns no `feedback`, `itemFeedbackSignals`, or `wornItemIds` field, and the runbook's own redaction rule forbids exposing candidate ids through diagnostics.

## Weather providers

`fetchDailyWeatherV2()` returns a fresh same-day cached profile when one exists, then tries providers in order: Open-Meteo (free endpoint, or the customer endpoint when `OPEN_METEO_API_KEY` is set) and the National Weather Service (`api.weather.gov`, keyless, US coverage only). Open-Meteo's free tier limits by source IP, and Apps Script's `UrlFetchApp` egresses from Google's shared IP pool, so chronic HTTP 429 responses there are expected and are why the NWS fallback exists. Transport errors and 5xx responses get one in-run retry; 429 skips straight to the next provider. When every provider fails, the thrown error (and therefore the operational alert email) lists each provider's failure detail. The NWS path derives apparent temperature via NOAA heat-index/wind-chill formulas and represents hourly precipitation as a nominal 0.02 in when the precipitation probability is at least 50%, since its hourly feed omits amounts.

## Outfit feedback

Every generated look in the daily email carries three one-tap links: `LIKE`, `NOT FOR ME`, `WORE THIS`. Encore looks carry none, because saving an outfit is already the taste signal and unsaving it is the way to retire one.

Each link is an HMAC-signed token naming exactly one `(localDate, candidateId, value)` triple, verified by `doGet` against `FEEDBACK_SECRET`. `doGet` serves feedback only; generation and sending remain `doPost` actions behind `SYNC_SECRET`. Every failure mode — bad signature, malformed payload, unknown verb, out-of-window date, missing parameters — renders one identical invalid-link page, so the endpoint reveals nothing to a prober.

A tap upserts into `virtual-closet-daily-v2-email-feedback.json` and lands on a page confirming what was stored, with the other two verbs as one-tap corrections. Last write wins per `(localDate, candidateId)`.

The store is a durable inbox rather than a direct history write. The daily email is sent before `finalizeSentBundleV2_` creates the history entry, so a tap in that window has nothing to attach to. `mergeEmailFeedbackIntoHistoryV2_()` drains the inbox at the start of each generation run: a signal whose history entry exists is merged and removed, and one whose entry does not yet exist stays queued for a later run. A signal naming a candidate absent from that date's looks is dropped rather than written.

Tokens do not expire. Replay is bounded by `DAILY_V2.MAX_EMAIL_FEEDBACK_AGE_DAYS` (30), checked against the current local date without loading the wardrobe snapshot.

Test deliveries render the links for layout parity, but their tokens carry a test flag: the landing page reports `Test delivery — not recorded` and writes nothing.

`upsertEmailFeedbackV2_` is a read-modify-write with no `LockService` guard, and `doGet` takes none either. Its contention detector warns when a *differing* verb lands on the same `(localDate, candidateId)` within `DAILY_V2.FEEDBACK_CONTENTION_MS` (10000 ms) — enough to catch a link scanner that fetches the three links sequentially. It does not catch two requests executing in parallel: both read the store before either writes, neither sees the other's entry, and one write is lost with no warning at all. A quiet log is not proof that no contention happened. The same unguarded read-modify-write shape applies to the drain's own `saveEmailFeedbackV2_(retained)` at the end of `mergeEmailFeedbackIntoHistoryV2_()`: it is not only two taps that can race each other, a tap landing while a drain is mid-run can be clobbered by the drain's write of its own stale read of the store, same as two concurrent taps would clobber each other.

## Prerequisite — reviewed wardrobe profiles

Policy v4 assumes the wardrobe-profile enrichment has already been completed: every profile written to `src/data/closet.json` and `src/data/sneakers.json` was checked against its image, and the reviewed manifests were committed. Treat that reviewed state as a rollout gate, not a step to repeat during each rollout or shadow morning. If it is not true, stop and complete the enrichment/review workflow before starting this runbook. Profile data participates in `wardrobeFingerprint`, so a later reviewed profile change requires a fresh Build/Sync/Validate cycle and intentionally invalidates stale pending/job state.

## Policy-v4 shadow rollout

Update the existing Apps Script deployment with every `.gs` file, including `Selection.gs` and `Encore.gs`, and preserve its current `/exec` URL. For the 3–5-morning shadow window, keep both the React **Daily Email** toggle and the single ten-minute Apps Script trigger enabled, and keep `SHADOW_MODE=true`. Shadow mode continues scheduled generation and persistence while suppressing the real outfit email. Do not use **Send test email** during this observation window without separate, fresh confirmation.

- In **Wardrobe → Daily email**, run **Build visual inventory**, **Sync now**, then **Validate server snapshot** in that exact order. After Build, require `116 items` and a new `wardrobeFingerprint` that reflects the enriched profiles. After Sync, require sync state `synced` with that same fingerprint. Validation must report exactly `Stored snapshot passes every structural check.`
- Use **Generate test bundle** until it reaches `bundle-ready`; from a fresh manual job, the returned stages are `weather-ready`, `planners-ready`, `critic-ready`, `selection-ready`, then `bundle-ready`. An operational failure or zero-quality outcome must not produce a bundle. Inspect selection state only through the authenticated **Inspect diagnostics** action backed by `getDailyOutfitDiagnosticsV2()`; do not print persisted candidate IDs.
- Require policy-v4 one-to-three coverage parity. `selectedCount` must be `1..3`; `deliveryMode` must be `complete` exactly when the count is three and `partial` otherwise; and `selectedArchetypes` plus `omittedArchetypes` must be an exact partition of `easy`, `polished-casual`, and `expressive` in configured order. The pending selection, bundle coverage, recommendation count/order, browser preview, and eventual email rendering must all agree. A `{1,1,1}` eligible pool whose three candidates form a feasible set is sufficient and must finish without a re-plan.
- A partial bundle is allowed only after exactly two structurally valid targeted re-plan rounds. The same weakest archetype may be targeted in both rounds. Each round records returned, accepted, and duplicate-combination dispositions; a duplicate-only round with zero accepted candidates is still a completed round, its duplicate IDs are not sent to the critic, and it does not permit early partial delivery.
- After round two, selection exhaustively searches every eligible combination by cardinality: first a complete trio, then configured-order pairs, then configured-order singletons. A feasible trio remains `complete`; a pair or singleton is `partial` with exact omissions; no feasible singleton throws `quality-exhausted-zero: no eligible daily outfit recommendation remains` and leaves no bundle to send. This exhaustive search is not limited to the earlier top-two/top-three window.
- Malformed or wrong-archetype re-plan responses, reused candidate IDs, invalid targeted critic responses, persistence/parity mismatches, and curator or final-validation errors are operational failures. They fail closed with no partial fallback, no bundle, and no outfit email; partial delivery is only a quality-exhaustion result after both valid rounds.
- The extreme-heat polished-casual contract uses the strict finite-number boundary `middayFeelsLikeF > 90`: exactly `90` is inactive and `90.1` is active. In diagnostics, `extremeHeatPolishedCasualActive` must match that same boundary.
- Diagnostics must show `selection.path`, `eligibleCountByArchetype`, `feasibleSetCount`, `replannedArchetypes`, redacted `replanRounds`, and per-stage `attemptCounts`, without candidate IDs, scores, bodies, secrets, or thumbnails. A partial result must have two round summaries. At `bundle-ready`, all three parity booleans must be `true`: `bundleReadyValidationPassed`, `recommendationSelectionOrderMatches`, and `coverageSelectionOrderMatches`.
- Review critic score distributions for clustering at exactly `8.0` and `7.5`.
- Record how often selection uses `top2`, `top3`, `replan-1`, or `replan-2`, which archetypes were replanned, and each round's accepted/duplicate counts. Repeated targets and duplicate-only rounds are valid observations; partial selection always uses `replan-2`.
- Check dynamic presentation for every generated cardinality. Email subjects and HTML/plain-text headings must say `Today's outfit`, `Today's 2 outfits`, or `Today's 3 outfits` from the generated recommendation count alone. The React preview must use the matching one-, two-, or three-column layout without an empty column. Only partial coverage renders the cause-neutral omitted-archetype sentence, and HTML/plain text must agree on both count and omission copy.
- Encore is separate from generated coverage. When present, it appears after all generated cards in email and preview, does not change the one-to-three count or omissions, and keeps the static copy `One of yours, back in rotation for today's weather.` without model-generated rationale. When absent, no Encore heading, images, or blank section may render; HTML/plain-text presence must remain in parity.
- Perform browser QA at desktop width and below `760px`, checking generated-count copy, configured archetype order, no empty column, Encore identity, imagery, single-column stacking, and horizontal overflow. The in-app daily feedback controls were retired on the emailed-outfit-feedback branch; there is nothing left to check in the browser preview itself. Feedback links are email-only — verify them per the "Outfit feedback" section above, in the email, not the browser.
- Keep `SHADOW_MODE=true` after the review. Set it to `false` only after the one-to-three rendering, optional Encore, diagnostics parity, two-round behavior, and fail-closed behavior pass review across the 3–5 morning shadow window and live delivery receives separate authorization. Leave the **Daily Email** toggle and trigger enabled throughout.

For each morning, record critic floor clustering, `selection.path`, eligible counts, replanned archetypes and round counts, stage attempt counts, final generated count and coverage, repair use, and Encore cadence. The system intentionally sends no outfit email when weather, snapshot freshness, model, critic, curator, persistence, or deterministic quality gates fail. Shadow review does not authorize a test email: ask for fresh confirmation immediately before any future use of **Send test email**.

## Ambiguous-send recovery

If `SEND_IN_PROGRESS_DATE_V2` remains set and does not match `LAST_SENT_DATE_V2`, the scheduler and manual real-send entry point fail closed because Apps Script cannot prove whether Gmail accepted the message. A marker that does match `LAST_SENT_DATE_V2` is never discarded merely because the calendar advanced: before any new send, the script must load the persisted bundle for that exact marker date, repair sent history and Encore cadence idempotently, and only then clear the marker. A newer snapshot generation timestamp alone does not block reconciliation when the current wardrobe fingerprint, contents, persisted selection, and final policy still validate; a changed fingerprint or an invalid or tampered bundle remains blocked. If that marker-date bundle is absent or invalid, the marker remains set and all real sends stay blocked. Inspect the mailbox for the marker date before changing either property:

- If the email was delivered, set `LAST_SENT_DATE_V2` to the exact `SEND_IN_PROGRESS_DATE_V2` date, then rerun the scheduler or run `sendDailyBundleNowV2()` from the Apps Script editor. The script reconciles the persisted marker-date bundle into history and Encore cadence without sending again; it preserves any newer job state or later Encore date, then clears the marker only after reconciliation succeeds.
- If the email was definitely not delivered, delete `SEND_IN_PROGRESS_DATE_V2`, then rerun. The script may perform a new real send.

Do not delete an unresolved marker merely because it is from a prior day; stale unresolved markers also fail closed until the mailbox check establishes which recovery path is safe.

## Diagnostics

- `getDailyOutfitDiagnosticsV2()` returns redacted snapshot validation, current valid job and selection projections, stage attempt counts, model-configuration booleans, snapshot age, and the last sent date.
- `validateStoredSnapshotV2()` verifies every item, label, slot, thumbnail, and atlas membership.
- `resetDailyJobStateV2()` restarts today's staged job without clearing history or snapshot data.
- `removeDailyOutfitTriggers()` removes only this feature's scheduler triggers.

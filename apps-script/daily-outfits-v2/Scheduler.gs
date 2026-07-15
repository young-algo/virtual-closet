function installDailyOutfitTrigger() {
  removeDailyOutfitTriggers();
  ScriptApp.newTrigger('runDailyOutfitScheduler').timeBased().everyMinutes(10).create();
  return 'Installed a 10-minute daily outfit scheduler trigger.';
}

function removeDailyOutfitTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runDailyOutfitScheduler') ScriptApp.deleteTrigger(trigger);
  });
}

function generationBundlePipelineV2_(snapshot, weather) {
  var history = dailyHistoryContextV2_(weather.localDate, snapshot);
  var planners = runAllPlannersV2_(snapshot, weather, history);
  var initialCritic = runCriticV2_(snapshot, weather, history, planners);
  var selected = runSelectionV2_(snapshot, weather, history, planners, initialCritic);
  var curated = runCuratorV2_(snapshot, weather, history, selected.selectedCandidates, selected.critic);
  var errors = validateFinalBundleV2_(curated, snapshot, weather, history, selected.selectedCandidates, selected.critic);
  if (errors.length) curated = repairFinalBundleV2_(curated, errors, snapshot, weather, history, selected.selectedCandidates, selected.critic);
  return {
    history: history,
    planners: planners,
    candidates: selected.candidates,
    critic: selected.critic,
    selectedCandidates: selected.selectedCandidates,
    selection: selected.selection,
    curated: curated,
    bundle: buildBundleV2_(curated, snapshot, weather, history)
  };
}

function generateDailyBundleNowV2() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another daily outfit job is already running');
  try {
    var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
    mergeSnapshotFeedbackIntoHistoryV2_(snapshot);
    var weather = fetchDailyWeatherV2();
    var result = generationBundlePipelineV2_(snapshot, weather);
    savePendingV2_(Object.assign({ localDate: weather.localDate, qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION, wardrobeFingerprint: snapshot.wardrobeFingerprint, updatedAt: Date.now() }, result));
    return result.bundle;
  } finally {
    lock.releaseLock();
  }
}

function generateDailyBundleStepV2() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another daily outfit job is already running');
  try {
    var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
    var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
    var localDate = localDateV2_(new Date(), config.timezone);
    var pending = null;
    try { pending = loadPendingV2_(); } catch (_ignored) {}
    var manualStages = ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready'];
    var currentManualPending = validCurrentPendingV2_(pending, localDate, snapshot.wardrobeFingerprint) &&
      Object.prototype.hasOwnProperty.call(pending, 'workflow') && pending.workflow === 'manual-v2' &&
      Object.prototype.hasOwnProperty.call(pending, 'manualStage') && manualStages.indexOf(pending.manualStage) >= 0 &&
      validPersistedStagePrerequisitesV2_(
        pending.manualStage,
        pending,
        localDate,
        snapshot.wardrobeFingerprint,
        snapshot
      );
    if (!currentManualPending) {
      pending = {
        workflow: 'manual-v2',
        qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION,
        manualStage: 'idle',
        localDate: localDate,
        wardrobeFingerprint: snapshot.wardrobeFingerprint,
        updatedAt: Date.now()
      };
      savePendingV2_(pending);
    }

    if (pending.manualStage === 'idle') {
      mergeSnapshotFeedbackIntoHistoryV2_(snapshot);
      pending.weather = fetchDailyWeatherV2();
      pending.history = dailyHistoryContextV2_(pending.weather.localDate, snapshot);
      pending.manualStage = 'weather-ready';
    } else if (pending.manualStage === 'weather-ready') {
      pending.planners = runAllPlannersV2_(snapshot, pending.weather, pending.history);
      pending.manualStage = 'planners-ready';
    } else if (pending.manualStage === 'planners-ready') {
      pending.critic = runCriticV2_(snapshot, pending.weather, pending.history, pending.planners);
      pending.manualStage = 'critic-ready';
    } else if (pending.manualStage === 'critic-ready') {
      var selected = runSelectionV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      pending.candidates = selected.candidates;
      pending.critic = selected.critic;
      pending.selectedCandidates = selected.selectedCandidates;
      pending.selection = selected.selection;
      pending.manualStage = 'selection-ready';
    } else if (pending.manualStage === 'selection-ready') {
      assertDeterministicSelectionReadyV2_(pending, localDate, snapshot.wardrobeFingerprint, snapshot);
      assertPersistedSelectionContextV2_(pending);
      pending.curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
      var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
      if (errors.length) pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
      pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather, pending.history);
      pending.manualStage = 'bundle-ready';
    }
    pending.updatedAt = Date.now();
    savePendingV2_(pending);
    return {
      complete: pending.manualStage === 'bundle-ready',
      stage: pending.manualStage,
      bundle: pending.manualStage === 'bundle-ready' ? pending.bundle : null
    };
  } finally {
    lock.releaseLock();
  }
}

function advanceDailyJobV2_(state, snapshot, startedAt) {
  var pending = null;
  try { pending = loadPendingV2_(); } catch (_ignored) {}
  var currentResume = state && typeof state === 'object' && !Array.isArray(state) &&
    Object.prototype.hasOwnProperty.call(state, 'stage') && DAILY_JOB_STAGES_V2_.indexOf(state.stage) >= 0 &&
    Object.prototype.hasOwnProperty.call(state, 'qualityPolicyVersion') &&
    state.qualityPolicyVersion === DAILY_V2.QUALITY_POLICY_VERSION &&
    Object.prototype.hasOwnProperty.call(state, 'localDate') &&
    typeof state.localDate === 'string' && state.localDate.length > 0 &&
    Object.prototype.hasOwnProperty.call(state, 'wardrobeFingerprint') &&
    state.wardrobeFingerprint === snapshot.wardrobeFingerprint &&
    validScheduledStageResumeV2_(state, pending, snapshot, state.localDate);
  if (!currentResume) {
    state = newJobStateV2_(state.localDate, snapshot.wardrobeFingerprint);
    pending = null;
    saveJobStateV2_(state);
    return { state: state, pending: pending };
  }
  var enoughTime = function() { return Date.now() - startedAt < 5 * 60 * 1000 - DAILY_V2.MIN_EXECUTION_REMAINING_MS; };
  while (enoughTime()) {
    incrementAttemptV2_(state, state.stage);
    if (state.stage === 'idle') {
      mergeSnapshotFeedbackIntoHistoryV2_(snapshot);
      var weather = fetchDailyWeatherV2();
      var history = dailyHistoryContextV2_(weather.localDate, snapshot);
      pending = { localDate: weather.localDate, qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION, wardrobeFingerprint: snapshot.wardrobeFingerprint, weather: weather, history: history, updatedAt: Date.now() };
      state.stage = 'weather-ready';
    } else if (state.stage === 'weather-ready') {
      pending.planners = runAllPlannersV2_(snapshot, pending.weather, pending.history);
      pending.updatedAt = Date.now();
      state.stage = 'planners-ready';
    } else if (state.stage === 'planners-ready') {
      pending.critic = runCriticV2_(snapshot, pending.weather, pending.history, pending.planners);
      pending.updatedAt = Date.now();
      state.stage = 'critic-ready';
    } else if (state.stage === 'critic-ready') {
      var selected = runSelectionV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      pending.candidates = selected.candidates;
      pending.critic = selected.critic;
      pending.selectedCandidates = selected.selectedCandidates;
      pending.selection = selected.selection;
      pending.updatedAt = Date.now();
      state.stage = 'selection-ready';
    } else if (state.stage === 'selection-ready') {
      assertDeterministicSelectionReadyV2_(pending, state.localDate, snapshot.wardrobeFingerprint, snapshot);
      assertPersistedSelectionContextV2_(pending);
      pending.curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
      var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
      if (errors.length) pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
      pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather, pending.history);
      pending.updatedAt = Date.now();
      state.stage = 'bundle-ready';
      state.bundleFileId = savePendingV2_(pending);
    } else {
      break;
    }
    state.updatedAt = Date.now();
    state.lastError = null;
    if (state.stage !== 'bundle-ready') savePendingV2_(pending);
    saveJobStateV2_(state);
  }
  return { state: state, pending: pending };
}

function logDailySchedulerErrorV2_(message) {
  try {
    console.error(message);
  } catch (_ignored) {}
}

function runDailyOutfitScheduler() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: true, skipped: 'lock-busy' };
  var startedAt = Date.now();
  var state;
  var config = null;
  try {
    var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
    config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
    var now = new Date();
    var localDate = localDateV2_(now, config.timezone);
    var currentMinutes = localMinutesV2_(now, config.timezone);
    var deliveryMinutes = config.deliveryHour * 60 + config.deliveryMinute;
    var generationStart = deliveryMinutes - config.generationLeadMinutes;
    if (config.enabled === false) return { ok: true, skipped: 'daily-email-disabled' };
    var properties = getDailyPropertiesV2_();
    var sendState = assertUnambiguousDailySendStateV2_(properties, localDate);
    var resolvedSentDate = sendState.marker || (sendState.lastSentDate === localDate ? localDate : null);
    if (resolvedSentDate) {
      var reconciliation = reconcilePersistedSentBundleV2_(resolvedSentDate, snapshot);
      state = reconciliation.state;
      if (resolvedSentDate === localDate) {
        return { ok: true, skipped: 'already-sent', stage: state && state.stage };
      }
      return { ok: true, reconciled: true, localDate: resolvedSentDate, stage: state && state.stage };
    }
    if (currentMinutes < generationStart) return { ok: true, skipped: 'before-generation-window' };

    try { state = loadJobStateV2_(); } catch (_ignored) { state = null; }
    if (!validScheduledJobStateV2_(state, localDate, snapshot.wardrobeFingerprint)) {
      state = newJobStateV2_(localDate, snapshot.wardrobeFingerprint);
      saveJobStateV2_(state);
      return { ok: true, stage: state.stage };
    }
    if (state.stage === 'sent') return { ok: true, skipped: 'state-sent' };
    var advanced = advanceDailyJobV2_(state, snapshot, startedAt);
    state = advanced.state;
    if (state.stage === 'bundle-ready' && currentMinutes >= deliveryMinutes && !getBooleanPropertyV2_('SHADOW_MODE', false)) {
      if (!validFullBundleReadyV2_(advanced.pending, snapshot, localDate)) {
        throw new Error('Bundle-ready state has no current persisted bundle');
      }
      sendDailyBundleNowV2_(advanced.pending.bundle, snapshot, false, advanced.pending, localDate);
      state = finalizeSentBundleV2_(advanced.pending.bundle, snapshot, state);
    }
    return { ok: true, stage: state.stage };
  } catch (error) {
    logDailySchedulerErrorV2_('Daily scheduler failed: ' + error.message);
    try {
      var timezone = config && config.timezone;
      if (!timezone) {
        try {
          timezone = getDailyConfigV2_().timezone;
        } catch (configError) {
          logDailySchedulerErrorV2_('Daily scheduler could not read fallback timezone: ' + configError.message);
        }
      }
      var current = timezone ? localMinutesV2_(new Date(), timezone) : null;
      if (state) {
        state.lastError = error.message;
        state.updatedAt = Date.now();
        incrementAttemptV2_(state, state.stage + '-error');
        if (current !== null && current >= DAILY_V2.GENERATION_CUTOFF_HOUR * 60) state.stage = 'failed';
        saveJobStateV2_(state);
      }
      if (current !== null && current >= DAILY_V2.GENERATION_CUTOFF_HOUR * 60) sendOperationalAlertV2_('recommendation quality gate failed', error.message);
    } catch (handlerError) {
      logDailySchedulerErrorV2_('Daily scheduler error handler failed: ' + handlerError.message);
    }
    return { ok: false, error: error.message, stage: state && state.stage };
  } finally {
    lock.releaseLock();
  }
}

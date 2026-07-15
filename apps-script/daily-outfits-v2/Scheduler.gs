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
  var history = dailyHistoryContextV2_(weather.localDate);
  var planners = runAllPlannersV2_(snapshot, weather, history);
  var critic = runCriticV2_(snapshot, weather, history, planners);
  var curated = runCuratorV2_(snapshot, weather, history, planners, critic);
  var errors = validateFinalBundleV2_(curated, snapshot, weather, history, planners, critic);
  if (errors.length) curated = repairFinalBundleV2_(curated, errors, snapshot, weather, history, planners, critic);
  return { history: history, planners: planners, critic: critic, curated: curated, bundle: buildBundleV2_(curated, snapshot, weather) };
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
    mergeSnapshotFeedbackIntoHistoryV2_(snapshot);
    var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
    var localDate = localDateV2_(new Date(), config.timezone);
    var pending = loadPendingV2_();
    if (!pending || pending.workflow !== 'manual-v2' || pending.qualityPolicyVersion !== DAILY_V2.QUALITY_POLICY_VERSION || pending.localDate !== localDate || pending.wardrobeFingerprint !== snapshot.wardrobeFingerprint) {
      pending = {
        workflow: 'manual-v2',
        qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION,
        manualStage: 'idle',
        localDate: localDate,
        wardrobeFingerprint: snapshot.wardrobeFingerprint,
        updatedAt: Date.now()
      };
    }

    if (pending.manualStage === 'idle') {
      pending.weather = fetchDailyWeatherV2();
      pending.history = dailyHistoryContextV2_(pending.weather.localDate);
      pending.manualStage = 'weather-ready';
    } else if (pending.manualStage === 'weather-ready') {
      pending.planners = runAllPlannersV2_(snapshot, pending.weather, pending.history);
      pending.manualStage = 'planners-ready';
    } else if (pending.manualStage === 'planners-ready') {
      pending.critic = runCriticV2_(snapshot, pending.weather, pending.history, pending.planners);
      pending.manualStage = 'critic-ready';
    } else if (pending.manualStage === 'critic-ready') {
      pending.curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      pending.manualStage = 'curated-ready';
    } else if (pending.manualStage === 'curated-ready') {
      var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      if (errors.length) pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather);
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
  var pending = loadPendingV2_();
  var enoughTime = function() { return Date.now() - startedAt < 5 * 60 * 1000 - DAILY_V2.MIN_EXECUTION_REMAINING_MS; };
  while (enoughTime()) {
    incrementAttemptV2_(state, state.stage);
    if (state.stage === 'idle') {
      var weather = fetchDailyWeatherV2();
      var history = dailyHistoryContextV2_(weather.localDate);
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
      pending.curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      if (errors.length) pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
      pending.bundle = buildBundleV2_(pending.curated, snapshot, pending.weather);
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
    if (getDailyPropertiesV2_().getProperty('LAST_SENT_DATE_V2') === localDate) return { ok: true, skipped: 'already-sent' };
    if (currentMinutes < generationStart) return { ok: true, skipped: 'before-generation-window' };

    mergeSnapshotFeedbackIntoHistoryV2_(snapshot);
    state = loadJobStateV2_();
    if (!state || state.qualityPolicyVersion !== DAILY_V2.QUALITY_POLICY_VERSION || state.localDate !== localDate || state.wardrobeFingerprint !== snapshot.wardrobeFingerprint) {
      state = newJobStateV2_(localDate, snapshot.wardrobeFingerprint);
      saveJobStateV2_(state);
    }
    if (state.stage === 'sent') return { ok: true, skipped: 'state-sent' };
    var advanced = advanceDailyJobV2_(state, snapshot, startedAt);
    state = advanced.state;
    if (state.stage === 'bundle-ready' && currentMinutes >= deliveryMinutes && !getBooleanPropertyV2_('SHADOW_MODE', false)) {
      if (!advanced.pending || !advanced.pending.bundle) throw new Error('Bundle-ready state has no persisted bundle');
      sendDailyBundleNowV2_(advanced.pending.bundle, snapshot, false);
      getDailyPropertiesV2_().setProperty('LAST_SENT_DATE_V2', localDate);
      recordSentBundleV2_(advanced.pending.bundle, snapshot);
      state.stage = 'sent';
      state.updatedAt = Date.now();
      saveJobStateV2_(state);
    }
    return { ok: true, stage: state.stage };
  } catch (error) {
    console.error('Daily scheduler failed: ' + error.message);
    try {
      var timezone = config && config.timezone;
      if (!timezone) {
        try {
          timezone = getDailyConfigV2_().timezone;
        } catch (configError) {
          console.error('Daily scheduler could not read fallback timezone: ' + configError.message);
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
      console.error('Daily scheduler error handler failed: ' + handlerError.message);
    }
    return { ok: false, error: error.message, stage: state && state.stage };
  } finally {
    lock.releaseLock();
  }
}

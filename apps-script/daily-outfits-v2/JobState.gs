function newJobStateV2_(localDate, wardrobeFingerprint) {
  var now = Date.now();
  return {
    localDate: localDate,
    qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION,
    stage: 'idle',
    wardrobeFingerprint: wardrobeFingerprint,
    startedAt: now,
    updatedAt: now,
    attemptCounts: {},
    lastError: null,
    bundleFileId: null
  };
}

function incrementAttemptV2_(state, stage) {
  state.attemptCounts[stage] = (state.attemptCounts[stage] || 0) + 1;
  state.updatedAt = Date.now();
  return state;
}

function buildBundleV2_(curated, snapshot, weather) {
  return {
    version: 2,
    qualityPolicyVersion: DAILY_V2.QUALITY_POLICY_VERSION,
    localDate: weather.localDate,
    weather: weather,
    recommendations: curated.recommendations,
    generatedAt: Date.now(),
    snapshotGeneratedAt: snapshot.generatedAt,
    wardrobeFingerprint: snapshot.wardrobeFingerprint,
    modelRunId: newRunIdV2_()
  };
}

function recordSentBundleV2_(bundle, snapshot) {
  var history = loadHistoryV2_();
  var existing = history.find(function(entry) { return entry.localDate === bundle.localDate; });
  var next = {
    localDate: bundle.localDate,
    weatherKey: [Math.round(bundle.weather.highTemperatureF), Math.round(bundle.weather.maxRainProbability), bundle.weather.layerGuidance].join('|'),
    generatedAt: bundle.generatedAt,
    sentAt: Date.now(),
    recommendations: bundle.recommendations,
    feedback: existing ? (existing.feedback || []) : []
  };
  history = history.filter(function(entry) { return entry.localDate !== bundle.localDate; });
  history.push(next);
  history.sort(function(a, b) { return a.localDate.localeCompare(b.localDate); });
  var maxDays = snapshot.settings && snapshot.settings.maxDailyHistoryDays ? snapshot.settings.maxDailyHistoryDays : 30;
  saveHistoryV2_(history.slice(-maxDays));
}

function resetDailyJobStateV2() {
  var snapshot = loadSnapshotV2_();
  var config = getDailyConfigV2_();
  var localDate = localDateV2_(new Date(), config.timezone);
  var state = newJobStateV2_(localDate, snapshot ? snapshot.wardrobeFingerprint : 'none');
  saveJobStateV2_(state);
  return state;
}

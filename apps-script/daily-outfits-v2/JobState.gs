var DAILY_JOB_STAGES_V2_ = Object.freeze([
  'idle',
  'weather-ready',
  'planners-ready',
  'critic-ready',
  'selection-ready',
  'bundle-ready',
  'sent',
  'failed'
]);

var PERSISTED_SELECTION_SCORE_METRICS_V2_ = Object.freeze([
  'colorIntent',
  'palette',
  'weather',
  'archetypeFit',
  'visualInterest',
  'wearability',
  'freshness',
  'silhouette',
  'formality'
]);

function ownDailyJobKeyV2_(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function ownNonEmptyDailyStringV2_(value, key) {
  return ownDailyJobKeyV2_(value, key) && typeof value[key] === 'string' && value[key].length > 0;
}

function validOwnDailyStringArrayV2_(value) {
  if (!Array.isArray(value)) return false;
  for (var index = 0; index < value.length; index += 1) {
    if (!ownDailyJobKeyV2_(value, index) || typeof value[index] !== 'string') return false;
  }
  return true;
}

function validCurrentPendingV2_(pending, localDate, wardrobeFingerprint) {
  if (!pending || typeof pending !== 'object' || Array.isArray(pending) ||
      !ownDailyJobKeyV2_(pending, 'qualityPolicyVersion') ||
      pending.qualityPolicyVersion !== DAILY_V2.QUALITY_POLICY_VERSION ||
      !ownNonEmptyDailyStringV2_(pending, 'localDate') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(pending.localDate) ||
      !ownNonEmptyDailyStringV2_(pending, 'wardrobeFingerprint')) return false;
  if (localDate !== undefined && pending.localDate !== localDate) return false;
  if (wardrobeFingerprint !== undefined && pending.wardrobeFingerprint !== wardrobeFingerprint) return false;
  return true;
}

function validCurrentBundlePayloadV2_(bundle) {
  return Boolean(bundle) && typeof bundle === 'object' && !Array.isArray(bundle) &&
    ownDailyJobKeyV2_(bundle, 'qualityPolicyVersion') &&
    bundle.qualityPolicyVersion === DAILY_V2.QUALITY_POLICY_VERSION &&
    ownNonEmptyDailyStringV2_(bundle, 'localDate') &&
    ownNonEmptyDailyStringV2_(bundle, 'wardrobeFingerprint');
}

function validCurrentBundleV2_(pending, bundle, expectedLocalDate) {
  return validCurrentPendingV2_(pending) && validCurrentBundlePayloadV2_(bundle) &&
    pending.localDate === bundle.localDate &&
    pending.wardrobeFingerprint === bundle.wardrobeFingerprint &&
    (expectedLocalDate === undefined || pending.localDate === expectedLocalDate);
}

function validPersistedSelectionCandidateV2_(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  var requiredStrings = ['candidateId', 'archetype', 'topId', 'bottomId', 'shoeId'];
  if (requiredStrings.some(function(key) { return !ownNonEmptyDailyStringV2_(candidate, key); }) ||
      !ownDailyJobKeyV2_(candidate, 'itemIds') || !Array.isArray(candidate.itemIds)) return false;
  if (!ownDailyJobKeyV2_(candidate, 'layerId') && 'layerId' in candidate) return false;
  if (ownDailyJobKeyV2_(candidate, 'layerId') && candidate.layerId !== undefined && candidate.layerId !== null &&
      (typeof candidate.layerId !== 'string' || !candidate.layerId)) return false;
  var expected = [candidate.topId, candidate.bottomId, candidate.shoeId];
  if (candidate.layerId) expected.push(candidate.layerId);
  if (candidate.itemIds.length !== expected.length || candidate.itemIds.some(function(id, index) {
    return !ownDailyJobKeyV2_(candidate.itemIds, index) || typeof id !== 'string' || !id || id !== expected[index];
  })) return false;
  var seenItems = Object.create(null);
  for (var index = 0; index < candidate.itemIds.length; index += 1) {
    var id = candidate.itemIds[index];
    if (!ownDailyJobKeyV2_(candidate.itemIds, index) || typeof id !== 'string' || !id ||
        id !== expected[index] || ownDailyJobKeyV2_(seenItems, id)) return false;
    seenItems[id] = true;
  }
  if (typeof validSelectionCandidateV2_ === 'function' && !validSelectionCandidateV2_(candidate)) return false;
  return true;
}

function validPersistedSelectionScoreV2_(score) {
  if (!score || typeof score !== 'object' || Array.isArray(score) ||
      !ownNonEmptyDailyStringV2_(score, 'candidateId') ||
      !ownDailyJobKeyV2_(score, 'disqualified') || typeof score.disqualified !== 'boolean' ||
      !ownDailyJobKeyV2_(score, 'criticalDefects') || !validOwnDailyStringArrayV2_(score.criticalDefects) ||
      !ownDailyJobKeyV2_(score, 'reservations') || !validOwnDailyStringArrayV2_(score.reservations)) return false;
  if (!PERSISTED_SELECTION_SCORE_METRICS_V2_.every(function(metric) {
    return ownDailyJobKeyV2_(score, metric) && typeof score[metric] === 'number' &&
      Number.isFinite(score[metric]) && score[metric] >= 0 && score[metric] <= 10;
  })) return false;
  if (typeof validFinalValidationScoreV2_ === 'function' && !validFinalValidationScoreV2_(score)) return false;
  return true;
}

function assertDeterministicSelectionReadyV2_(pending) {
  var valid = validCurrentPendingV2_(pending) &&
    ownDailyJobKeyV2_(pending, 'selectedCandidates') && Array.isArray(pending.selectedCandidates) &&
    pending.selectedCandidates.length === 3 && DAILY_V2.ARCHETYPES.length === 3 &&
    ownDailyJobKeyV2_(pending, 'critic') && pending.critic &&
    typeof pending.critic === 'object' && !Array.isArray(pending.critic) &&
    ownDailyJobKeyV2_(pending.critic, 'scores') && Array.isArray(pending.critic.scores) &&
    pending.critic.scores.length > 0;
  if (!valid) throw new Error('Deterministic selection must be ready');

  var seenCandidates = Object.create(null);
  var seenArchetypes = Object.create(null);
  for (var candidateIndex = 0; candidateIndex < pending.selectedCandidates.length; candidateIndex += 1) {
    if (!ownDailyJobKeyV2_(pending.selectedCandidates, candidateIndex)) {
      throw new Error('Deterministic selection must be ready');
    }
    var candidate = pending.selectedCandidates[candidateIndex];
    if (!validPersistedSelectionCandidateV2_(candidate) ||
        DAILY_V2.ARCHETYPES.indexOf(candidate.archetype) < 0 ||
        ownDailyJobKeyV2_(seenCandidates, candidate.candidateId) ||
        ownDailyJobKeyV2_(seenArchetypes, candidate.archetype)) {
      throw new Error('Deterministic selection must be ready');
    }
    seenCandidates[candidate.candidateId] = true;
    seenArchetypes[candidate.archetype] = true;
  }
  if (DAILY_V2.ARCHETYPES.some(function(archetype) { return !ownDailyJobKeyV2_(seenArchetypes, archetype); })) {
    throw new Error('Deterministic selection must be ready');
  }

  var scoreById = Object.create(null);
  for (var scoreIndex = 0; scoreIndex < pending.critic.scores.length; scoreIndex += 1) {
    if (!ownDailyJobKeyV2_(pending.critic.scores, scoreIndex)) {
      throw new Error('Deterministic selection must be ready');
    }
    var score = pending.critic.scores[scoreIndex];
    if (!validPersistedSelectionScoreV2_(score) || ownDailyJobKeyV2_(scoreById, score.candidateId)) {
      throw new Error('Deterministic selection must be ready');
    }
    scoreById[score.candidateId] = score;
  }
  if (pending.selectedCandidates.some(function(selected) {
    return !ownDailyJobKeyV2_(scoreById, selected.candidateId);
  })) throw new Error('Deterministic selection must be ready');
  return pending;
}

function assertPersistedSelectionContextV2_(pending) {
  var valid = ['weather', 'history'].every(function(key) {
    return ownDailyJobKeyV2_(pending, key) && pending[key] &&
      typeof pending[key] === 'object' && !Array.isArray(pending[key]);
  });
  if (!valid) throw new Error('Deterministic selection must be ready');
  return pending;
}

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

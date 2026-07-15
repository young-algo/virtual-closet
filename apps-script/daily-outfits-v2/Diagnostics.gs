function safeDailyDiagnosticLoadV2_(loader, fallback) {
  try {
    return loader();
  } catch (_ignored) {
    return fallback;
  }
}

function safeDailyJobProjectionV2_(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  var projected = {};
  if (Object.prototype.hasOwnProperty.call(state, 'localDate') &&
      typeof state.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.localDate)) {
    projected.localDate = state.localDate;
  }
  if (Object.prototype.hasOwnProperty.call(state, 'qualityPolicyVersion') &&
      Number.isInteger(state.qualityPolicyVersion) && state.qualityPolicyVersion >= 0) {
    projected.qualityPolicyVersion = state.qualityPolicyVersion;
  }
  if (Object.prototype.hasOwnProperty.call(state, 'stage') &&
      typeof state.stage === 'string' && DAILY_JOB_STAGES_V2_.indexOf(state.stage) >= 0) {
    projected.stage = state.stage;
  }
  ['startedAt', 'updatedAt'].forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(state, key) && typeof state[key] === 'number' &&
        Number.isFinite(state[key]) && state[key] >= 0) projected[key] = state[key];
  });
  return projected;
}

function safeDailySnapshotValidationProjectionV2_(validation) {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) return null;
  var projected = {};
  if (Object.prototype.hasOwnProperty.call(validation, 'ok') && typeof validation.ok === 'boolean') {
    projected.ok = validation.ok;
  }
  if (Object.prototype.hasOwnProperty.call(validation, 'generatedAt') &&
      typeof validation.generatedAt === 'number' && Number.isFinite(validation.generatedAt) &&
      validation.generatedAt >= 0) projected.generatedAt = validation.generatedAt;
  ['itemCount', 'atlasPageCount'].forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(validation, key) &&
        Number.isInteger(validation[key]) && validation[key] >= 0) projected[key] = validation[key];
  });
  return projected;
}

function safeDailyAttemptCountsV2_(state) {
  var projected = {};
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !Object.prototype.hasOwnProperty.call(state, 'attemptCounts') ||
      !state.attemptCounts || typeof state.attemptCounts !== 'object' || Array.isArray(state.attemptCounts)) {
    return projected;
  }
  DAILY_JOB_STAGES_V2_.forEach(function(stage) {
    [stage, stage + '-error'].forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(state.attemptCounts, key) &&
          Number.isInteger(state.attemptCounts[key]) && state.attemptCounts[key] >= 0) {
        projected[key] = state.attemptCounts[key];
      }
    });
  });
  return projected;
}

function safeDailySelectionProjectionV2_(pending) {
  if (!validCurrentPendingV2_(pending) || !Object.prototype.hasOwnProperty.call(pending, 'selection')) return null;
  var selection = pending.selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  var required = ['path', 'eligibleCountByArchetype', 'feasibleSetCount', 'replannedArchetypes'];
  if (required.some(function(key) { return !Object.prototype.hasOwnProperty.call(selection, key); })) return null;
  if (['top2', 'top3', 'replan-1', 'replan-2'].indexOf(selection.path) < 0 ||
      !selection.eligibleCountByArchetype || typeof selection.eligibleCountByArchetype !== 'object' ||
      Array.isArray(selection.eligibleCountByArchetype) ||
      typeof selection.feasibleSetCount !== 'number' || !Number.isFinite(selection.feasibleSetCount) ||
      selection.feasibleSetCount < 0 || !Array.isArray(selection.replannedArchetypes) ||
      selection.replannedArchetypes.length > 2) return null;

  var countKeys = Object.keys(selection.eligibleCountByArchetype);
  if (countKeys.length !== DAILY_V2.ARCHETYPES.length || countKeys.some(function(key) {
    return DAILY_V2.ARCHETYPES.indexOf(key) < 0;
  })) return null;
  var eligibleCountByArchetype = {};
  for (var index = 0; index < DAILY_V2.ARCHETYPES.length; index += 1) {
    var archetype = DAILY_V2.ARCHETYPES[index];
    if (!Object.prototype.hasOwnProperty.call(selection.eligibleCountByArchetype, archetype) ||
        !Number.isInteger(selection.eligibleCountByArchetype[archetype]) ||
        selection.eligibleCountByArchetype[archetype] < 0) return null;
    eligibleCountByArchetype[archetype] = selection.eligibleCountByArchetype[archetype];
  }

  var seenReplans = Object.create(null);
  for (var replanIndex = 0; replanIndex < selection.replannedArchetypes.length; replanIndex += 1) {
    if (!Object.prototype.hasOwnProperty.call(selection.replannedArchetypes, replanIndex)) return null;
    var replanned = selection.replannedArchetypes[replanIndex];
    if (typeof replanned !== 'string' || DAILY_V2.ARCHETYPES.indexOf(replanned) < 0 ||
        Object.prototype.hasOwnProperty.call(seenReplans, replanned)) return null;
    seenReplans[replanned] = true;
  }
  return {
    path: selection.path,
    eligibleCountByArchetype: eligibleCountByArchetype,
    feasibleSetCount: selection.feasibleSetCount,
    replannedArchetypes: selection.replannedArchetypes.slice()
  };
}

function getDailyOutfitDiagnosticsV2() {
  var snapshot = safeDailyDiagnosticLoadV2_(function() { return loadSnapshotV2_(); }, null);
  var validation = safeDailyDiagnosticLoadV2_(function() { return validateStoredSnapshotV2(); }, null);
  var state = safeDailyDiagnosticLoadV2_(function() { return loadJobStateV2_(); }, null);
  var pending = safeDailyDiagnosticLoadV2_(function() { return loadPendingV2_(); }, null);
  var properties = safeDailyDiagnosticLoadV2_(function() { return getDailyPropertiesV2_(); }, null);
  var modelKeys = ['DAILY_PLANNER_MODEL', 'DAILY_CRITIC_MODEL', 'DAILY_CURATOR_MODEL', 'DAILY_REPAIR_MODEL'];
  var modelsConfigured = modelKeys.reduce(function(result, key) {
    result[key] = Boolean(properties && safeDailyDiagnosticLoadV2_(function() { return properties.getProperty(key); }, null));
    return result;
  }, {});
  var lastSentDate = properties
    ? safeDailyDiagnosticLoadV2_(function() { return properties.getProperty('LAST_SENT_DATE_V2'); }, null)
    : null;
  if (typeof lastSentDate !== 'string' || !lastSentDate) lastSentDate = null;
  var snapshotAgeHours = null;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
      Object.prototype.hasOwnProperty.call(snapshot, 'generatedAt') &&
      typeof snapshot.generatedAt === 'number' && Number.isFinite(snapshot.generatedAt)) {
    var snapshotAgeMs = Date.now() - snapshot.generatedAt;
    if (Number.isFinite(snapshotAgeMs) && snapshotAgeMs >= 0) snapshotAgeHours = snapshotAgeMs / 3600000;
  }
  return {
    snapshot: safeDailySnapshotValidationProjectionV2_(validation),
    job: safeDailyJobProjectionV2_(state),
    selection: safeDailySelectionProjectionV2_(pending),
    attemptCounts: safeDailyAttemptCountsV2_(state),
    lastSentDate: lastSentDate,
    modelsConfigured: modelsConfigured,
    snapshotAgeHours: snapshotAgeHours
  };
}

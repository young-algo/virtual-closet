function safeDailyDiagnosticLoadV2_(loader, fallback) {
  try {
    return loader();
  } catch (_ignored) {
    return fallback;
  }
}

function validDailyDiagnosticIsoDateV2_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var parts = value.split('-').map(Number);
  var year = parts[0];
  var month = parts[1];
  var day = parts[2];
  if (month < 1 || month > 12 || day < 1) return false;
  var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function safeDailyDiagnosticContextV2_(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !Object.prototype.hasOwnProperty.call(snapshot, 'wardrobeFingerprint') ||
      typeof snapshot.wardrobeFingerprint !== 'string' || !snapshot.wardrobeFingerprint) return null;
  return safeDailyDiagnosticLoadV2_(function() {
    var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        typeof config.timezone !== 'string' || !config.timezone) return null;
    var localDate = localDateV2_(new Date(), config.timezone);
    if (!validDailyDiagnosticIsoDateV2_(localDate)) return null;
    return { localDate: localDate, wardrobeFingerprint: snapshot.wardrobeFingerprint };
  }, null);
}

function safeDailyJobProjectionV2_(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || !context ||
      !Object.prototype.hasOwnProperty.call(state, 'qualityPolicyVersion') ||
      state.qualityPolicyVersion !== DAILY_V2.QUALITY_POLICY_VERSION ||
      !Object.prototype.hasOwnProperty.call(state, 'localDate') ||
      !validDailyDiagnosticIsoDateV2_(state.localDate) || state.localDate !== context.localDate ||
      !Object.prototype.hasOwnProperty.call(state, 'stage') ||
      typeof state.stage !== 'string' || DAILY_JOB_STAGES_V2_.indexOf(state.stage) < 0 ||
      !Object.prototype.hasOwnProperty.call(state, 'wardrobeFingerprint') ||
      typeof state.wardrobeFingerprint !== 'string' || !state.wardrobeFingerprint ||
      state.wardrobeFingerprint !== context.wardrobeFingerprint) return null;
  var projected = {
    localDate: state.localDate,
    qualityPolicyVersion: state.qualityPolicyVersion,
    stage: state.stage
  };
  ['startedAt', 'updatedAt'].forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(state, key) && typeof state[key] === 'number' &&
        Number.isFinite(state[key]) && state[key] >= 0) projected[key] = state[key];
  });
  return projected;
}

function safeDailySnapshotValidationProjectionV2_(validation) {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation) ||
      !Object.prototype.hasOwnProperty.call(validation, 'ok') || typeof validation.ok !== 'boolean' ||
      !Object.prototype.hasOwnProperty.call(validation, 'generatedAt') ||
      typeof validation.generatedAt !== 'number' || !Number.isFinite(validation.generatedAt) ||
      validation.generatedAt < 0 ||
      !Object.prototype.hasOwnProperty.call(validation, 'itemCount') ||
      !Number.isInteger(validation.itemCount) || validation.itemCount < 0 ||
      !Object.prototype.hasOwnProperty.call(validation, 'atlasPageCount') ||
      !Number.isInteger(validation.atlasPageCount) || validation.atlasPageCount < 0) return null;
  return {
    ok: validation.ok,
    generatedAt: validation.generatedAt,
    itemCount: validation.itemCount,
    atlasPageCount: validation.atlasPageCount
  };
}

function safeDailyAttemptCountsV2_(state, validJob) {
  var projected = {};
  if (!validJob || !state || typeof state !== 'object' || Array.isArray(state) ||
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

function safeDailySelectionProjectionV2_(pending, context, snapshot) {
  if (!context || !validCurrentPendingV2_(pending, context.localDate, context.wardrobeFingerprint) ||
      !Object.prototype.hasOwnProperty.call(pending, 'selection')) return null;
  try {
    assertDeterministicSelectionReadyV2_(pending, context.localDate, context.wardrobeFingerprint, snapshot);
  } catch (_ignored) {
    return null;
  }
  var selection = pending.selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  var required = ['path', 'eligibleCountByArchetype', 'feasibleSetCount', 'replannedArchetypes'];
  if (required.some(function(key) { return !Object.prototype.hasOwnProperty.call(selection, key); })) return null;
  if (['top2', 'top3', 'replan-1', 'replan-2'].indexOf(selection.path) < 0 ||
      !selection.eligibleCountByArchetype || typeof selection.eligibleCountByArchetype !== 'object' ||
      Array.isArray(selection.eligibleCountByArchetype) ||
      !Number.isInteger(selection.feasibleSetCount) || selection.feasibleSetCount <= 0 ||
      !Array.isArray(selection.replannedArchetypes)) return null;

  var replanCountByPath = { top2: 0, top3: 0, 'replan-1': 1, 'replan-2': 2 };
  if (selection.replannedArchetypes.length !== replanCountByPath[selection.path]) return null;

  var countKeys = Object.keys(selection.eligibleCountByArchetype);
  if (countKeys.length !== DAILY_V2.ARCHETYPES.length || countKeys.some(function(key) {
    return DAILY_V2.ARCHETYPES.indexOf(key) < 0;
  })) return null;
  var eligibleCountByArchetype = {};
  for (var index = 0; index < DAILY_V2.ARCHETYPES.length; index += 1) {
    var archetype = DAILY_V2.ARCHETYPES[index];
    if (!Object.prototype.hasOwnProperty.call(selection.eligibleCountByArchetype, archetype) ||
        !Number.isInteger(selection.eligibleCountByArchetype[archetype]) ||
        selection.eligibleCountByArchetype[archetype] < 1) return null;
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
  var context = safeDailyDiagnosticContextV2_(snapshot);
  var job = safeDailyJobProjectionV2_(state, context);
  var properties = safeDailyDiagnosticLoadV2_(function() { return getDailyPropertiesV2_(); }, null);
  var modelKeys = ['DAILY_PLANNER_MODEL', 'DAILY_CRITIC_MODEL', 'DAILY_CURATOR_MODEL', 'DAILY_REPAIR_MODEL'];
  var modelsConfigured = modelKeys.reduce(function(result, key) {
    result[key] = Boolean(properties && safeDailyDiagnosticLoadV2_(function() { return properties.getProperty(key); }, null));
    return result;
  }, {});
  var lastSentDate = properties
    ? safeDailyDiagnosticLoadV2_(function() { return properties.getProperty('LAST_SENT_DATE_V2'); }, null)
    : null;
  if (!validDailyDiagnosticIsoDateV2_(lastSentDate)) lastSentDate = null;
  var snapshotAgeHours = null;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
      Object.prototype.hasOwnProperty.call(snapshot, 'generatedAt') &&
      typeof snapshot.generatedAt === 'number' && Number.isFinite(snapshot.generatedAt)) {
    var snapshotAgeMs = Date.now() - snapshot.generatedAt;
    if (Number.isFinite(snapshotAgeMs) && snapshotAgeMs >= 0) snapshotAgeHours = snapshotAgeMs / 3600000;
  }
  return {
    snapshot: safeDailySnapshotValidationProjectionV2_(validation),
    job: job,
    selection: safeDailySelectionProjectionV2_(pending, context, snapshot),
    attemptCounts: safeDailyAttemptCountsV2_(state, job !== null),
    lastSentDate: lastSentDate,
    modelsConfigured: modelsConfigured,
    snapshotAgeHours: snapshotAgeHours
  };
}

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

function validOwnDailyRecordV2_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (var key in value) {
    if (!ownDailyJobKeyV2_(value, key)) return false;
  }
  return true;
}

function validOwnDailyArrayV2_(value, expectedLength, validator) {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength)) return false;
  for (var key in value) {
    if (!ownDailyJobKeyV2_(value, key) || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return false;
  }
  for (var index = 0; index < value.length; index += 1) {
    if (!ownDailyJobKeyV2_(value, index) || (validator && !validator(value[index], index))) return false;
  }
  return true;
}

function validOwnDailyStringArrayV2_(value, requireNonEmpty) {
  return validOwnDailyArrayV2_(value, undefined, function(entry) {
    return typeof entry === 'string' && (!requireNonEmpty || entry.length > 0);
  });
}

function validOwnDailyMapV2_(value, validator) {
  if (!validOwnDailyRecordV2_(value)) return false;
  var keys = Object.keys(value);
  for (var index = 0; index < keys.length; index += 1) {
    if (!validator(value[keys[index]], keys[index])) return false;
  }
  return true;
}

function exactPersistedDailyValueV2_(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!validOwnDailyArrayV2_(left) || !validOwnDailyArrayV2_(right) || left.length !== right.length) return false;
    for (var arrayIndex = 0; arrayIndex < left.length; arrayIndex += 1) {
      if (!exactPersistedDailyValueV2_(left[arrayIndex], right[arrayIndex])) return false;
    }
    return true;
  }
  if (!validOwnDailyRecordV2_(left) || !validOwnDailyRecordV2_(right)) return false;
  var leftKeys = Object.keys(left).sort();
  var rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (var keyIndex = 0; keyIndex < leftKeys.length; keyIndex += 1) {
    var key = leftKeys[keyIndex];
    if (key !== rightKeys[keyIndex] || !exactPersistedDailyValueV2_(left[key], right[key])) return false;
  }
  return true;
}

function validCurrentPendingV2_(pending, localDate, wardrobeFingerprint) {
  if (!validOwnDailyRecordV2_(pending) ||
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
  return validOwnDailyRecordV2_(bundle) &&
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

function validOwnDailyObjectV2_(value, key) {
  return ownDailyJobKeyV2_(value, key) && validOwnDailyRecordV2_(value[key]);
}

function validOwnDailyObjectArrayV2_(value, key, expectedLength) {
  return ownDailyJobKeyV2_(value, key) && validOwnDailyArrayV2_(value[key], expectedLength, function(entry) {
    return validOwnDailyRecordV2_(entry);
  });
}

function validPersistedWeatherV2_(weather, expectedLocalDate) {
  if (!validOwnDailyRecordV2_(weather) ||
      !ownNonEmptyDailyStringV2_(weather, 'localDate') || weather.localDate !== expectedLocalDate ||
      !['locationLabel', 'timezone', 'plainEnglishSummary', 'weatherPhrase'].every(function(key) {
        return ownNonEmptyDailyStringV2_(weather, key);
      }) || !ownNonEmptyDailyStringV2_(weather, 'layerGuidance') ||
      ['none', 'optional', 'recommended', 'required'].indexOf(weather.layerGuidance) < 0) return false;
  var numericKeys = [
    'morningFeelsLikeF', 'middayFeelsLikeF', 'eveningFeelsLikeF', 'minFeelsLikeF', 'maxFeelsLikeF',
    'highTemperatureF', 'lowTemperatureF', 'maxRainProbability', 'totalPrecipitationInches',
    'maxWindMph', 'maxGustMph', 'averageHumidity', 'fetchedAt'
  ];
  if (!numericKeys.every(function(key) {
    return ownDailyJobKeyV2_(weather, key) && typeof weather[key] === 'number' && Number.isFinite(weather[key]);
  }) || weather.fetchedAt < 0 || !['rainExpected', 'windy', 'largeTemperatureSwing'].every(function(key) {
    return ownDailyJobKeyV2_(weather, key) && typeof weather[key] === 'boolean';
  })) return false;
  return ownDailyJobKeyV2_(weather, 'hourly') && validOwnDailyArrayV2_(weather.hourly, undefined, function(hour) {
    if (!validOwnDailyRecordV2_(hour) || !ownDailyJobKeyV2_(hour, 'localHour') ||
        !Number.isInteger(hour.localHour) || hour.localHour < 0 || hour.localHour > 23) return false;
    return [
      'temperatureF', 'feelsLikeF', 'precipitationProbability', 'precipitationInches',
      'humidity', 'windMph', 'gustMph', 'weatherCode'
    ].every(function(key) {
      return ownDailyJobKeyV2_(hour, key) && typeof hour[key] === 'number' && Number.isFinite(hour[key]);
    });
  }) && weather.hourly.length > 0;
}

function validPersistedHistoryV2_(history) {
  if (!validOwnDailyRecordV2_(history)) return false;
  var validExactOutfits = ownDailyJobKeyV2_(history, 'exactOutfitsPrevious14Days') &&
    validOwnDailyArrayV2_(history.exactOutfitsPrevious14Days, undefined, function(entry) {
      return validOwnDailyRecordV2_(entry) && ownNonEmptyDailyStringV2_(entry, 'localDate') &&
        ownNonEmptyDailyStringV2_(entry, 'archetype') && ownDailyJobKeyV2_(entry, 'itemIds') &&
        validOwnDailyStringArrayV2_(entry.itemIds, true) && entry.itemIds.length > 0;
    });
  var validUsage = ownDailyJobKeyV2_(history, 'itemUsagePrevious7Days') &&
    validOwnDailyMapV2_(history.itemUsagePrevious7Days, function(count) {
      return typeof count === 'number' && Number.isFinite(count) && Number.isInteger(count) && count >= 0;
    });
  var validFeedback = ownDailyJobKeyV2_(history, 'feedback') &&
    validOwnDailyArrayV2_(history.feedback, undefined, function(entry) {
      if (!validOwnDailyRecordV2_(entry) ||
          !['localDate', 'value', 'outfitName', 'archetype'].every(function(key) {
            return ownNonEmptyDailyStringV2_(entry, key);
          }) || ['liked', 'disliked', 'wore'].indexOf(entry.value) < 0 ||
          !ownDailyJobKeyV2_(entry, 'items') || !validOwnDailyStringArrayV2_(entry.items, true)) return false;
      return ['reason', 'note'].every(function(key) {
        if (!ownDailyJobKeyV2_(entry, key)) return !(key in entry);
        return typeof entry[key] === 'string';
      });
    });
  var validSignals = ownDailyJobKeyV2_(history, 'itemFeedbackSignals') &&
    validOwnDailyMapV2_(history.itemFeedbackSignals, function(signal) {
      if (!validOwnDailyRecordV2_(signal) || Object.keys(signal).length !== 3) return false;
      return ['wore', 'liked', 'disliked'].every(function(key) {
        return ownDailyJobKeyV2_(signal, key) && typeof signal[key] === 'number' &&
          Number.isFinite(signal[key]) && Number.isInteger(signal[key]) && signal[key] >= 0;
      });
    });
  return validExactOutfits && validUsage && validFeedback && validSignals &&
    ['cooldownItemLabels', 'cooldownItemIds', 'wornItemIds'].every(function(key) {
      return ownDailyJobKeyV2_(history, key) && validOwnDailyStringArrayV2_(history[key], true);
    });
}

function validPersistedPlannerCandidateV2_(candidate, archetype) {
  return validOwnDailyRecordV2_(candidate) && validPersistedSelectionCandidateV2_(candidate) &&
    candidate.archetype === archetype && ['name', 'styleSummary', 'colorStrategy', 'weatherSummary'].every(function(key) {
      return ownNonEmptyDailyStringV2_(candidate, key);
    }) && ownDailyJobKeyV2_(candidate, 'potentialRisks') &&
    validOwnDailyStringArrayV2_(candidate.potentialRisks, false) &&
    ownDailyJobKeyV2_(candidate, 'plannerConfidence') && typeof candidate.plannerConfidence === 'number' &&
    Number.isFinite(candidate.plannerConfidence) && candidate.plannerConfidence >= 0 && candidate.plannerConfidence <= 1;
}

function persistedCandidateNearCopiesSavedOutfitV2_(candidate, snapshot) {
  var inventory = selectionInventoryIndexV2_(snapshot);
  if (!inventory) return true;
  var coreIds = [candidate.topId, candidate.bottomId, candidate.shoeId];
  var examples = snapshot && Array.isArray(snapshot.tasteExamples) ? snapshot.tasteExamples : [];
  return examples.some(function(outfit) {
    if (!outfit || typeof outfit !== 'object' || Array.isArray(outfit) || outfit.seedStylist === false ||
        !Array.isArray(outfit.itemIds)) return false;
    var savedCore = Object.create(null);
    outfit.itemIds.forEach(function(id) {
      var item = typeof id === 'string' && ownDailyJobKeyV2_(inventory, id) ? inventory[id] : null;
      if (item && ['top', 'bottom', 'shoes'].indexOf(item.slot) >= 0) savedCore[id] = true;
    });
    return coreIds.filter(function(id) { return ownDailyJobKeyV2_(savedCore, id); }).length >= 2;
  });
}

function validPersistedPlannerCandidateQualityV2_(candidate, archetype, snapshot) {
  return validPersistedPlannerCandidateV2_(candidate, archetype) &&
    candidate.colorStrategy.length >= 30 && candidate.colorStrategy.length <= 280 &&
    selectionCandidateInventoryV2_(candidate, snapshot) !== null &&
    !persistedCandidateNearCopiesSavedOutfitV2_(candidate, snapshot);
}

function validPersistedCandidateGroupQualityV2_(candidates, archetype, snapshot) {
  if (!validOwnDailyArrayV2_(candidates) || candidates.length === 0) return false;
  var combinations = Object.create(null);
  var coreSelections = [];
  for (var index = 0; index < candidates.length; index += 1) {
    var candidate = candidates[index];
    if (!validPersistedPlannerCandidateQualityV2_(candidate, archetype, snapshot)) return false;
    var combination = canonicalSelectionIdListV2_(candidate.itemIds);
    if (combination === null || ownDailyJobKeyV2_(combinations, combination)) return false;
    combinations[combination] = true;
    var coreIds = [candidate.topId, candidate.bottomId, candidate.shoeId];
    for (var priorIndex = 0; priorIndex < coreSelections.length; priorIndex += 1) {
      var priorIds = new Set(coreSelections[priorIndex]);
      if (coreIds.filter(function(id) { return priorIds.has(id); }).length >= 2) return false;
    }
    coreSelections.push(coreIds);
  }
  return true;
}

function persistedPlannerCandidatesV2_(planners, snapshot) {
  if (!validOwnDailyArrayV2_(planners, DAILY_V2.ARCHETYPES.length)) return null;
  var seenArchetypes = Object.create(null);
  var seenCandidates = Object.create(null);
  var candidates = [];
  for (var responseIndex = 0; responseIndex < planners.length; responseIndex += 1) {
    var response = planners[responseIndex];
    if (!validOwnDailyRecordV2_(response) || !ownNonEmptyDailyStringV2_(response, 'archetype') ||
        response.archetype !== DAILY_V2.ARCHETYPES[responseIndex] ||
        ownDailyJobKeyV2_(seenArchetypes, response.archetype) || !ownDailyJobKeyV2_(response, 'candidates') ||
        !validOwnDailyArrayV2_(response.candidates, 5) ||
        !validPersistedCandidateGroupQualityV2_(response.candidates, response.archetype, snapshot)) return null;
    seenArchetypes[response.archetype] = true;
    for (var candidateIndex = 0; candidateIndex < response.candidates.length; candidateIndex += 1) {
      var candidate = response.candidates[candidateIndex];
      if (!validPersistedPlannerCandidateQualityV2_(candidate, response.archetype, snapshot) ||
          ownDailyJobKeyV2_(seenCandidates, candidate.candidateId)) return null;
      seenCandidates[candidate.candidateId] = true;
      candidates.push(candidate);
    }
  }
  if (DAILY_V2.ARCHETYPES.some(function(archetype) {
    return !ownDailyJobKeyV2_(seenArchetypes, archetype);
  })) return null;
  return candidates;
}

function validPersistedCriticForCandidatesV2_(critic, candidates) {
  if (!validOwnDailyRecordV2_(critic) || !ownDailyJobKeyV2_(critic, 'scores') ||
      !validOwnDailyArrayV2_(critic.scores, candidates.length)) return false;
  var candidateIds = Object.create(null);
  candidates.forEach(function(candidate) { candidateIds[candidate.candidateId] = true; });
  var seenScores = Object.create(null);
  for (var index = 0; index < critic.scores.length; index += 1) {
    var score = critic.scores[index];
    if (!validPersistedSelectionScoreV2_(score) ||
        score.candidateId !== candidates[index].candidateId ||
        !ownDailyJobKeyV2_(candidateIds, score.candidateId) ||
        ownDailyJobKeyV2_(seenScores, score.candidateId)) return false;
    seenScores[score.candidateId] = true;
  }
  return Object.keys(candidateIds).every(function(candidateId) {
    return ownDailyJobKeyV2_(seenScores, candidateId);
  });
}

function validPersistedSelectionSummaryV2_(selection) {
  if (!validOwnDailyRecordV2_(selection) || !ownNonEmptyDailyStringV2_(selection, 'path') ||
      ['top2', 'top3', 'replan-1', 'replan-2'].indexOf(selection.path) < 0 ||
      !ownDailyJobKeyV2_(selection, 'eligibleCountByArchetype') ||
      !validOwnDailyRecordV2_(selection.eligibleCountByArchetype) ||
      Object.keys(selection.eligibleCountByArchetype).length !== DAILY_V2.ARCHETYPES.length ||
      !ownDailyJobKeyV2_(selection, 'feasibleSetCount') || !Number.isInteger(selection.feasibleSetCount) ||
      selection.feasibleSetCount <= 0 || !ownDailyJobKeyV2_(selection, 'replannedArchetypes') ||
      !validOwnDailyArrayV2_(selection.replannedArchetypes) ||
      !ownDailyJobKeyV2_(selection, 'compositeById') ||
      !validOwnDailyMapV2_(selection.compositeById, function(value) {
        return typeof value === 'number' && Number.isFinite(value);
      })) return false;
  if (!DAILY_V2.ARCHETYPES.every(function(archetype) {
    var count = selection.eligibleCountByArchetype[archetype];
    return ownDailyJobKeyV2_(selection.eligibleCountByArchetype, archetype) &&
      typeof count === 'number' && Number.isFinite(count) && Number.isInteger(count) && count >= 2;
  })) return false;
  var replanned = Object.create(null);
  for (var index = 0; index < selection.replannedArchetypes.length; index += 1) {
    var archetype = selection.replannedArchetypes[index];
    if (typeof archetype !== 'string' || DAILY_V2.ARCHETYPES.indexOf(archetype) < 0 ||
        ownDailyJobKeyV2_(replanned, archetype)) return false;
    replanned[archetype] = true;
  }
  var expectedReplans = selection.path === 'replan-1' ? 1 : selection.path === 'replan-2' ? 2 : 0;
  return selection.replannedArchetypes.length === expectedReplans;
}

function persistedSelectionCandidatesV2_(pending, plannerCandidates, snapshot) {
  if (!ownDailyJobKeyV2_(pending, 'candidates') ||
      !validOwnDailyArrayV2_(pending.candidates, undefined, function(candidate) {
        return validPersistedPlannerCandidateQualityV2_(candidate, candidate && candidate.archetype, snapshot) &&
          DAILY_V2.ARCHETYPES.indexOf(candidate.archetype) >= 0;
      }) || pending.candidates.length < plannerCandidates.length) return null;
  var candidateById = Object.create(null);
  var combinations = Object.create(null);
  for (var index = 0; index < pending.candidates.length; index += 1) {
    var candidate = pending.candidates[index];
    var combination = JSON.stringify(candidate.itemIds.slice().sort());
    if (ownDailyJobKeyV2_(candidateById, candidate.candidateId) ||
        ownDailyJobKeyV2_(combinations, combination)) return null;
    candidateById[candidate.candidateId] = candidate;
    combinations[combination] = true;
  }
  for (var plannerIndex = 0; plannerIndex < plannerCandidates.length; plannerIndex += 1) {
    var plannerCandidate = plannerCandidates[plannerIndex];
    if (!exactPersistedDailyValueV2_(pending.candidates[plannerIndex], plannerCandidate)) return null;
  }
  return pending.candidates;
}

function persistedReplanRoundsV2_(candidates, plannerCandidates, snapshot) {
  var rounds = [];
  var roundCandidates = [];
  var seenArchetypes = Object.create(null);
  for (var index = plannerCandidates.length; index < candidates.length; index += 1) {
    var candidate = candidates[index];
    if (!rounds.length || rounds[rounds.length - 1].archetype !== candidate.archetype) {
      if (ownDailyJobKeyV2_(seenArchetypes, candidate.archetype)) return null;
      if (roundCandidates.length && !validPersistedCandidateGroupQualityV2_(
        roundCandidates,
        rounds[rounds.length - 1].archetype,
        snapshot
      )) return null;
      rounds.push({ archetype: candidate.archetype, candidates: [] });
      seenArchetypes[candidate.archetype] = true;
      roundCandidates = rounds[rounds.length - 1].candidates;
    }
    roundCandidates.push(candidate);
    if (roundCandidates.length > 5) return null;
  }
  if (roundCandidates.length && !validPersistedCandidateGroupQualityV2_(
    roundCandidates,
    rounds[rounds.length - 1].archetype,
    snapshot
  )) return null;
  return rounds.length <= 2 ? rounds : null;
}

function exactPersistedSelectionMapV2_(persisted, recomputed) {
  if (!validOwnDailyRecordV2_(persisted) || !recomputed || typeof recomputed !== 'object' ||
      Array.isArray(recomputed)) return false;
  var persistedKeys = Object.keys(persisted).sort();
  var recomputedKeys = Object.keys(recomputed).sort();
  if (persistedKeys.length !== recomputedKeys.length) return false;
  for (var index = 0; index < persistedKeys.length; index += 1) {
    var key = persistedKeys[index];
    if (key !== recomputedKeys[index] || persisted[key] !== recomputed[key]) return false;
  }
  return true;
}

function validRecomputedPersistedSelectionV2_(pending, candidates, plannerCandidates, snapshot) {
  if (!validPersistedSelectionSummaryV2_(pending.selection) ||
      typeof selectFinalistsV2_ !== 'function' || typeof selectFinalSetV2_ !== 'function' ||
      typeof chooseReplanArchetypeV2_ !== 'function') return false;
  var rounds = persistedReplanRoundsV2_(candidates, plannerCandidates, snapshot);
  var actualReplans = rounds && rounds.map(function(round) { return round.archetype; });
  if (actualReplans === null || !exactPersistedDailyValueV2_(pending.selection.replannedArchetypes, actualReplans)) {
    return false;
  }
  var replayCandidates = plannerCandidates.slice();
  var replayScores = pending.critic.scores.slice(0, plannerCandidates.length);
  var replayedArchetypes = [];
  for (var attempt = 0; attempt <= rounds.length; attempt += 1) {
    var finalists = selectFinalistsV2_(
      replayCandidates,
      replayScores,
      snapshot,
      pending.weather,
      pending.history
    );
    if (!finalists) return false;
    var finalSet = finalists.needsReplan
      ? { needsReplan: finalists.needsReplan, feasibleSetCount: 0 }
      : selectFinalSetV2_(
        finalists.finalistPools,
        replayScores,
        snapshot,
        pending.weather
      );
    if (!finalSet) return false;
    if (!finalSet.needsReplan && Array.isArray(finalSet.selectedCandidates)) {
      if (attempt !== rounds.length) return false;
      var expectedPath = rounds.length ? 'replan-' + rounds.length : finalSet.path;
      return pending.selection.path === expectedPath &&
        pending.selection.feasibleSetCount === finalSet.feasibleSetCount &&
        exactPersistedSelectionMapV2_(pending.selection.eligibleCountByArchetype, finalists.eligibleCountByArchetype) &&
        exactPersistedSelectionMapV2_(pending.selection.compositeById, finalists.compositeById) &&
        exactPersistedDailyValueV2_(pending.selectedCandidates, finalSet.selectedCandidates);
    }
    if (attempt >= rounds.length) return false;
    var requestedArchetype = finalSet.needsReplan;
    if (replayedArchetypes.indexOf(requestedArchetype) >= 0) {
      requestedArchetype = chooseReplanArchetypeV2_(
        finalists.eligibleByArchetype,
        replayScores,
        replayedArchetypes
      );
    }
    if (!requestedArchetype || requestedArchetype !== rounds[attempt].archetype) return false;
    var scoreStart = replayCandidates.length;
    replayCandidates = replayCandidates.concat(rounds[attempt].candidates);
    replayScores = replayScores.concat(pending.critic.scores.slice(
      scoreStart,
      scoreStart + rounds[attempt].candidates.length
    ));
    replayedArchetypes.push(requestedArchetype);
  }
  return false;
}

function validDailyAttemptCountsV2_(attemptCounts) {
  if (!validOwnDailyRecordV2_(attemptCounts)) return false;
  var allowed = Object.create(null);
  DAILY_JOB_STAGES_V2_.forEach(function(stage) {
    allowed[stage] = true;
    allowed[stage + '-error'] = true;
  });
  return Object.keys(attemptCounts).every(function(key) {
    var value = attemptCounts[key];
    return ownDailyJobKeyV2_(allowed, key) && typeof value === 'number' &&
      Number.isFinite(value) && Number.isInteger(value) && value >= 0;
  });
}

function validPersistedStagePrerequisitesV2_(stage, pending, localDate, wardrobeFingerprint, snapshot) {
  if (!validCurrentPendingV2_(pending, localDate, wardrobeFingerprint)) return false;
  if (stage === 'idle') return true;
  if (!validOwnDailyObjectV2_(pending, 'weather') ||
      !validPersistedWeatherV2_(pending.weather, localDate) ||
      !validOwnDailyObjectV2_(pending, 'history') || !validPersistedHistoryV2_(pending.history)) return false;
  if (stage === 'weather-ready') return true;
  if (stage === 'planners-ready' || stage === 'critic-ready') {
    if (!ownDailyJobKeyV2_(pending, 'planners')) return false;
    var candidates = persistedPlannerCandidatesV2_(pending.planners, snapshot);
    if (!candidates) return false;
    if (stage === 'planners-ready') return true;
    return validOwnDailyObjectV2_(pending, 'critic') && validPersistedCriticForCandidatesV2_(pending.critic, candidates);
  }
  if (stage === 'selection-ready') {
    if (!validOwnDailyObjectV2_(pending, 'selection') || !validPersistedSelectionSummaryV2_(pending.selection)) return false;
    try {
      assertDeterministicSelectionReadyV2_(pending, localDate, wardrobeFingerprint, snapshot);
      return true;
    } catch (_ignored) {
      return false;
    }
  }
  return stage === 'bundle-ready' && validFullBundleReadyV2_(pending, snapshot, localDate);
}

function validScheduledStageResumeV2_(state, pending, snapshot, expectedLocalDate) {
  if (!validScheduledJobStateV2_(state, expectedLocalDate, snapshot && snapshot.wardrobeFingerprint)) return false;
  if (state.stage === 'idle' || state.stage === 'sent' || state.stage === 'failed') return true;
  return validPersistedStagePrerequisitesV2_(
    state.stage,
    pending,
    state.localDate,
    state.wardrobeFingerprint,
    snapshot
  );
}

function validScheduledJobStateV2_(state, expectedLocalDate, expectedWardrobeFingerprint) {
  return validOwnDailyRecordV2_(state) &&
      ownDailyJobKeyV2_(state, 'stage') && DAILY_JOB_STAGES_V2_.indexOf(state.stage) >= 0 &&
      ownDailyJobKeyV2_(state, 'qualityPolicyVersion') &&
      state.qualityPolicyVersion === DAILY_V2.QUALITY_POLICY_VERSION &&
      ownNonEmptyDailyStringV2_(state, 'localDate') &&
      (expectedLocalDate === undefined || state.localDate === expectedLocalDate) &&
      ownNonEmptyDailyStringV2_(state, 'wardrobeFingerprint') &&
      (expectedWardrobeFingerprint === undefined || state.wardrobeFingerprint === expectedWardrobeFingerprint) &&
      ownDailyJobKeyV2_(state, 'attemptCounts') && validDailyAttemptCountsV2_(state.attemptCounts);
}

function validPersistedSelectionCandidateV2_(candidate) {
  if (!validOwnDailyRecordV2_(candidate)) return false;
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
  if (!validOwnDailyRecordV2_(score) ||
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

function assertDeterministicSelectionReadyV2_(pending, expectedLocalDate, wardrobeFingerprint, snapshot) {
  var valid = validCurrentPendingV2_(pending, expectedLocalDate, wardrobeFingerprint) &&
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
    ownNonEmptyDailyStringV2_(snapshot, 'wardrobeFingerprint') &&
    snapshot.wardrobeFingerprint === wardrobeFingerprint &&
    validOwnDailyObjectV2_(pending, 'weather') && validPersistedWeatherV2_(pending.weather, pending.localDate) &&
    validOwnDailyObjectV2_(pending, 'history') && validPersistedHistoryV2_(pending.history) &&
    ownDailyJobKeyV2_(pending, 'planners') &&
    ownDailyJobKeyV2_(pending, 'candidates') &&
    ownDailyJobKeyV2_(pending, 'selectedCandidates') &&
    validOwnDailyArrayV2_(pending.selectedCandidates, 3) &&
    pending.selectedCandidates.length === 3 && DAILY_V2.ARCHETYPES.length === 3 &&
    ownDailyJobKeyV2_(pending, 'critic') && validOwnDailyRecordV2_(pending.critic) &&
    ownDailyJobKeyV2_(pending, 'selection') && validOwnDailyRecordV2_(pending.selection);
  if (!valid) throw new Error('Deterministic selection must be ready');

  var plannerCandidates = persistedPlannerCandidatesV2_(pending.planners, snapshot);
  var candidates = plannerCandidates && persistedSelectionCandidatesV2_(pending, plannerCandidates, snapshot);
  if (!plannerCandidates || !candidates ||
      !validPersistedCriticForCandidatesV2_(pending.critic, candidates) ||
      !validRecomputedPersistedSelectionV2_(pending, candidates, plannerCandidates, snapshot)) {
    throw new Error('Deterministic selection must be ready');
  }

  var candidateById = Object.create(null);
  candidates.forEach(function(candidate) { candidateById[candidate.candidateId] = candidate; });
  for (var candidateIndex = 0; candidateIndex < pending.selectedCandidates.length; candidateIndex += 1) {
    if (!ownDailyJobKeyV2_(pending.selectedCandidates, candidateIndex)) {
      throw new Error('Deterministic selection must be ready');
    }
    var candidate = pending.selectedCandidates[candidateIndex];
    if (!validPersistedPlannerCandidateV2_(candidate, DAILY_V2.ARCHETYPES[candidateIndex]) ||
        !ownDailyJobKeyV2_(candidateById, candidate.candidateId) ||
        !exactPersistedDailyValueV2_(candidate, candidateById[candidate.candidateId])) {
      throw new Error('Deterministic selection must be ready');
    }
  }
  return pending;
}

function assertPersistedSelectionContextV2_(pending) {
  var valid = validCurrentPendingV2_(pending) && validOwnDailyObjectV2_(pending, 'weather') &&
    validPersistedWeatherV2_(pending.weather, pending.localDate) && validOwnDailyObjectV2_(pending, 'history') &&
    validPersistedHistoryV2_(pending.history);
  if (!valid) throw new Error('Deterministic selection must be ready');
  return pending;
}

function validPersistedRecommendationV2_(recommendation, selectedCandidate) {
  if (!validOwnDailyRecordV2_(recommendation) || !selectedCandidate ||
      !['candidateId', 'archetype', 'name', 'colorHook', 'whyItWorks', 'weatherNote'].every(function(key) {
        return ownNonEmptyDailyStringV2_(recommendation, key);
      }) || !ownDailyJobKeyV2_(recommendation, 'itemIds') ||
      !validOwnDailyStringArrayV2_(recommendation.itemIds, true)) return false;
  if (recommendation.candidateId !== selectedCandidate.candidateId ||
      recommendation.archetype !== selectedCandidate.archetype ||
      recommendation.itemIds.length !== selectedCandidate.itemIds.length) return false;
  for (var index = 0; index < recommendation.itemIds.length; index += 1) {
    if (recommendation.itemIds[index] !== selectedCandidate.itemIds[index]) return false;
  }
  return true;
}

function validFullBundleReadyV2_(pending, snapshot, expectedLocalDate) {
  try {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
        !ownNonEmptyDailyStringV2_(snapshot, 'wardrobeFingerprint') ||
        !validCurrentPendingV2_(pending, expectedLocalDate, snapshot.wardrobeFingerprint) ||
        !ownDailyJobKeyV2_(pending, 'bundle') || !validCurrentBundleV2_(pending, pending.bundle, expectedLocalDate) ||
        !validOwnDailyObjectV2_(pending, 'weather') || !validPersistedWeatherV2_(pending.weather, pending.localDate) ||
        !validOwnDailyObjectV2_(pending, 'history') || !validPersistedHistoryV2_(pending.history)) return false;
    var bundle = pending.bundle;
    if (!ownDailyJobKeyV2_(bundle, 'version') || bundle.version !== 2 ||
        !ownDailyJobKeyV2_(bundle, 'generatedAt') || typeof bundle.generatedAt !== 'number' ||
        !Number.isFinite(bundle.generatedAt) || bundle.generatedAt < 0 ||
        !ownDailyJobKeyV2_(bundle, 'snapshotGeneratedAt') || typeof bundle.snapshotGeneratedAt !== 'number' ||
        !Number.isFinite(bundle.snapshotGeneratedAt) || bundle.snapshotGeneratedAt < 0 ||
        !ownDailyJobKeyV2_(snapshot, 'generatedAt') || bundle.snapshotGeneratedAt !== snapshot.generatedAt ||
        !ownNonEmptyDailyStringV2_(bundle, 'modelRunId') ||
        !validOwnDailyObjectV2_(bundle, 'weather') ||
        !validPersistedWeatherV2_(bundle.weather, bundle.localDate) ||
        JSON.stringify(bundle.weather) !== JSON.stringify(pending.weather)) return false;
    assertDeterministicSelectionReadyV2_(pending, expectedLocalDate, snapshot.wardrobeFingerprint, snapshot);
    if (!validOwnDailyObjectV2_(pending, 'selection') || !validPersistedSelectionSummaryV2_(pending.selection) ||
        !ownDailyJobKeyV2_(bundle, 'recommendations') ||
        !validOwnDailyArrayV2_(bundle.recommendations, DAILY_V2.ARCHETYPES.length)) return false;
    for (var index = 0; index < bundle.recommendations.length; index += 1) {
      if (!validPersistedRecommendationV2_(bundle.recommendations[index], pending.selectedCandidates[index])) return false;
    }
    if (typeof validateFinalBundleV2_ !== 'function') return false;
    return validateFinalBundleV2_(
      { recommendations: bundle.recommendations },
      snapshot,
      bundle.weather,
      pending.history,
      pending.selectedCandidates,
      pending.critic
    ).length === 0;
  } catch (_ignored) {
    return false;
  }
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

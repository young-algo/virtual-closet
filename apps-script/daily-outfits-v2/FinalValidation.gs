function ownFinalValidationKeyV2_(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

var FINAL_VALIDATION_SCORE_METRICS_V2_ = [
  'colorIntent',
  'palette',
  'weather',
  'archetypeFit',
  'visualInterest',
  'wearability',
  'freshness',
  'silhouette',
  'formality'
];

function validFinalValidationScoreV2_(score) {
  return Boolean(score) && typeof score === 'object' && !Array.isArray(score) &&
    typeof score.candidateId === 'string' && score.candidateId.length > 0 &&
    typeof score.disqualified === 'boolean' &&
    Array.isArray(score.criticalDefects) && score.criticalDefects.every(function(entry) {
      return typeof entry === 'string';
    }) &&
    Array.isArray(score.reservations) && score.reservations.every(function(entry) {
      return typeof entry === 'string';
    }) &&
    FINAL_VALIDATION_SCORE_METRICS_V2_.every(function(metric) {
      return typeof score[metric] === 'number' && Number.isFinite(score[metric]) &&
        score[metric] >= 0 && score[metric] <= 10;
    });
}

function scoreMapV2_(critic) {
  var map = Object.create(null);
  var seen = Object.create(null);
  var valid = true;
  var scores = critic && Array.isArray(critic.scores) ? critic.scores : [];
  scores.forEach(function(score) {
    if (!validFinalValidationScoreV2_(score)) {
      valid = false;
      return;
    }
    if (ownFinalValidationKeyV2_(seen, score.candidateId)) {
      valid = false;
      return;
    }
    seen[score.candidateId] = true;
    map[score.candidateId] = score;
  });
  return valid ? map : Object.create(null);
}

function exactHistoryKeysV2_(history) {
  var keys = Object.create(null);
  (history.exactOutfitsPrevious14Days || []).forEach(function(entry) {
    var key = canonicalSelectionIdListV2_(entry && entry.itemIds);
    if (key !== null) keys[key] = true;
  });
  return keys;
}

function weatherSafetyErrorsV2_(recommendation, itemMap, weather, snapshot) {
  var errors = [];
  var selected = recommendation.itemIds.map(function(id) {
    return ownFinalValidationKeyV2_(itemMap, id) ? itemMap[id] : null;
  }).filter(Boolean);
  var top = selected.find(function(item) { return item.slot === 'top'; });
  var bottom = selected.find(function(item) { return item.slot === 'bottom'; });
  var layer = selected.find(function(item) { return item.slot === 'layer'; });
  if (bottom && bottom.category === 'Shorts' && weather.middayFeelsLikeF < 48) errors.push('shorts are unsafe below a 48°F adjusted midday apparent temperature');
  if (!layer && Math.min(weather.morningFeelsLikeF, weather.eveningFeelsLikeF) < 40 && top && top.profile.warmth <= 2) errors.push('a layer is required for a cold morning or evening');
  if (layer && layer.profile.warmth === 5 && weather.middayFeelsLikeF > 82) errors.push('warmth-5 outerwear is unsafe above 82°F');
  if (layer && layer.profile.warmth === 4 && weather.middayFeelsLikeF > 85) errors.push('a warmth-4 layer is unsafe above 85°F');
  if (top && top.profile.warmth >= 4 && weather.middayFeelsLikeF > 85) errors.push('a warmth-4 top is unsafe above 85°F');
  if (top && top.profile.warmth === 3 && weather.middayFeelsLikeF > 92) errors.push('a warmth-3 top is unsafe above 92°F');
  if (top && layer && top.profile.breathability <= 2 && layer.profile.warmth >= 4 && weather.middayFeelsLikeF > 80) errors.push('the top and layer combination is not breathable enough');
  return errors;
}

function validateFinalBundleV2_(curated, snapshot, weather, history, selectedCandidates, critic, selection) {
  var errors = [];
  var selectedCount = Array.isArray(selectedCandidates) ? selectedCandidates.length : 0;
  if (selectedCount < 1 || selectedCount > 3) {
    errors.push('selected recommendation count must be between one and three');
  }
  var recommendations = curated && Array.isArray(curated.recommendations)
    ? curated.recommendations
    : [];
  if (recommendations.length !== selectedCount) {
    errors.push('final recommendation count must equal selected candidate count');
  }
  var selectedArchetypes = Array.isArray(selectedCandidates)
    ? selectedCandidates.map(function(candidate) { return candidate.archetype; })
    : [];
  var configuredSubsequence = DAILY_V2.ARCHETYPES.filter(function(archetype) {
    return selectedArchetypes.indexOf(archetype) >= 0;
  });
  var omittedArchetypes = DAILY_V2.ARCHETYPES.filter(function(archetype) {
    return selectedArchetypes.indexOf(archetype) < 0;
  });
  if (!selection || selection.selectedCount !== selectedCount ||
      JSON.stringify(selectedArchetypes) !== JSON.stringify(configuredSubsequence) ||
      JSON.stringify(selection.selectedArchetypes) !== JSON.stringify(selectedArchetypes) ||
      JSON.stringify(selection.omittedArchetypes) !== JSON.stringify(omittedArchetypes) ||
      selection.deliveryMode !== (selectedCount === 3 ? 'complete' : 'partial')) {
    errors.push('selection coverage does not match selected candidates');
  }
  var itemMap = itemMapV2_(snapshot);
  selectedCandidates = Array.isArray(selectedCandidates) ? selectedCandidates : [];
  var scoreMap = scoreMapV2_(critic);
  var seenCandidate = Object.create(null);
  var seenArchetype = Object.create(null);
  var tops = Object.create(null);
  var bottoms = Object.create(null);
  var shoes = Object.create(null);
  var diversityStories = Object.create(null);
  var layerUse = Object.create(null);
  var historyKeys = exactHistoryKeysV2_(history);
  var rotation = null;
  try {
    rotation = shoeRotationContextV2_(snapshot, weather.localDate, history);
  } catch (error) {
    errors.push('shoe rotation context is invalid: ' + error.message);
  }
  var allowedShoes = new Set(rotation ? rotation.allowedGeneratedShoeIds : []);

  recommendations.forEach(function(rec, index) {
    var path = 'recommendation[' + index + ']';
    var candidate = selectedCandidates[index];
    if (!candidate || rec.candidateId !== candidate.candidateId) errors.push(path + ' changed or reordered the selected candidateId');
    if (!candidate || rec.archetype !== candidate.archetype) errors.push(path + ' changed the selected archetype');
    if (!candidate || canonicalSelectionIdListV2_(rec.itemIds) === null ||
        canonicalSelectionIdListV2_(rec.itemIds) !== canonicalSelectionIdListV2_(candidate.itemIds)) {
      errors.push(path + ' changed the selected itemIds');
    }
    if (ownFinalValidationKeyV2_(seenCandidate, rec.candidateId)) errors.push(path + ' duplicates a final candidate');
    seenCandidate[rec.candidateId] = true;
    if (DAILY_V2.ARCHETYPES.indexOf(rec.archetype) < 0 || ownFinalValidationKeyV2_(seenArchetype, rec.archetype)) errors.push(path + ' has a missing or duplicate archetype');
    seenArchetype[rec.archetype] = true;
    var selected = (rec.itemIds || []).map(function(id) {
      return ownFinalValidationKeyV2_(itemMap, id) ? itemMap[id] : null;
    });
    if (selected.some(function(item) { return !item; })) errors.push(path + ' contains an invented item id');
    ['top', 'bottom', 'shoes'].forEach(function(slot) {
      if (selected.filter(function(item) { return item && item.slot === slot; }).length !== 1) errors.push(path + ' must contain exactly one ' + slot);
    });
    if (selected.filter(function(item) { return item && item.slot === 'layer'; }).length > 1) errors.push(path + ' contains more than one layer');
    var top = selected.find(function(item) { return item && item.slot === 'top'; });
    var bottom = selected.find(function(item) { return item && item.slot === 'bottom'; });
    var shoe = selected.find(function(item) { return item && item.slot === 'shoes'; });
    if (shoe && !allowedShoes.has(shoe.id)) {
      errors.push(path + ' uses a shoe outside the daily rotation pool');
    }
    if (candidate && candidate.archetype === 'easy' && rotation &&
        candidate.shoeId !== rotation.easyAnchorShoeId) {
      errors.push(path + ' does not use the daily Easy shoe anchor');
    }
    if (top && ownFinalValidationKeyV2_(tops, top.id)) errors.push('tops must be unique across final recommendations');
    if (bottom && ownFinalValidationKeyV2_(bottoms, bottom.id)) errors.push('bottoms must be unique across final recommendations');
    if (top) tops[top.id] = true;
    if (bottom) bottoms[bottom.id] = true;
    if (shoe) shoes[shoe.id] = (ownFinalValidationKeyV2_(shoes, shoe.id) ? shoes[shoe.id] : 0) + 1;
    var layer = selected.find(function(item) { return item && item.slot === 'layer'; });
    if (layer) layerUse[layer.id] = (ownFinalValidationKeyV2_(layerUse, layer.id) ? layerUse[layer.id] : 0) + 1;
    if (top && bottom) {
      var story = JSON.stringify([
        top.profile.primaryColorFamily,
        bottom.profile.primaryColorFamily,
        top.profile.silhouette,
        bottom.profile.silhouette
      ]);
      if (ownFinalValidationKeyV2_(diversityStories, story)) errors.push('final recommendations need materially different color or silhouette stories');
      diversityStories[story] = true;
    }
    var savedExactCopy = savedOutfitExactCopyV2_(rec.itemIds || [], snapshot);
    if (savedExactCopy) errors.push(path + ' exactly copies manual saved outfit "' + savedExactCopy.name + '"');
    var historyKey = canonicalSelectionIdListV2_(rec.itemIds || []);
    if (historyKey !== null && ownFinalValidationKeyV2_(historyKeys, historyKey)) errors.push(path + ' exactly repeats a prior-14-day outfit');
    var cooldown = new Set(history.cooldownItemIds || []);
    if (candidate && (cooldown.has(candidate.topId) || cooldown.has(candidate.bottomId))) {
      errors.push(path + ' violates the yesterday top/bottom cooldown');
    }
    if (!rec.colorHook || rec.colorHook.length < 30 || rec.colorHook.length > 240) errors.push(path + '.colorHook must name a specific cross-item color relationship');
    if (!rec.whyItWorks || rec.whyItWorks.length < 30 || rec.whyItWorks.length > 320) errors.push(path + '.whyItWorks must be concise and specific');
    if (!rec.weatherNote || rec.weatherNote.length < 12 || rec.weatherNote.length > 220) errors.push(path + '.weatherNote must be concise and specific');
    var score = ownFinalValidationKeyV2_(scoreMap, rec.candidateId) ? scoreMap[rec.candidateId] : null;
    if (!score || score.disqualified) errors.push(path + ' has no eligible critic score');
    else {
      if (score.weather < 8) errors.push(path + ' critic weather score is below 8');
      if (score.palette < 7.5) errors.push(path + ' critic palette score is below 7.5');
      if (score.colorIntent < 8) errors.push(path + ' critic color-intent score is below 8');
      if ((score.palette + score.silhouette + score.formality) / 3 < 7.5) errors.push(path + ' critic visual-coherence score is below 7.5');
    }
    errors = errors.concat(weatherSafetyErrorsV2_(rec, itemMap, weather, snapshot).map(function(error) { return path + ': ' + error; }));
  });
  if (Object.keys(shoes).length < selectedCount &&
      usableShoeCountV2_(snapshot) >= selectedCount) {
    errors.push('shoes must be unique when enough available options exist');
  }
  Object.keys(layerUse).forEach(function(id) {
    if (layerUse[id] > 1 &&
        (weather.layerGuidance !== 'required' || credibleLayerCountV2_(snapshot) >= 2)) {
      errors.push('a layer may repeat only when weather requires it and alternatives are too limited');
    }
  });
  for (var i = 0; i < recommendations.length; i += 1) {
    for (var j = i + 1; j < recommendations.length; j += 1) {
      var shared = recommendations[i].itemIds.filter(function(id) { return recommendations[j].itemIds.indexOf(id) >= 0; });
      if (shared.length > 1) errors.push('no two final outfits may share more than one item');
    }
  }
  return Array.from(new Set(errors));
}

function validateFinalBundleV2() {
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
  var localDate = localDateV2_(new Date(), config.timezone);
  var pending = null;
  try { pending = loadPendingV2_(); } catch (_ignored) {}
  assertDeterministicSelectionReadyV2_(pending, localDate, snapshot.wardrobeFingerprint, snapshot);
  assertPersistedSelectionContextV2_(pending);
  if (!validOwnDailyObjectV2_(pending, 'selection') || !validPersistedSelectionSummaryV2_(pending.selection)) {
    throw new Error('Deterministic selection must be ready');
  }
  if (!ownDailyJobKeyV2_(pending, 'curated') || !pending.curated) throw new Error('No curated response is ready');
  var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic, pending.selection);
  return { ok: errors.length === 0, errors: errors };
}

function scoreMapV2_(critic) {
  var map = {};
  critic.scores.forEach(function(score) { map[score.candidateId] = score; });
  return map;
}

function exactHistoryKeysV2_(history) {
  var keys = {};
  (history.exactOutfitsPrevious14Days || []).forEach(function(entry) { keys[entry.itemIds.slice().sort().join('|')] = true; });
  return keys;
}

function weatherSafetyErrorsV2_(recommendation, itemMap, weather, snapshot) {
  var errors = [];
  var selected = recommendation.itemIds.map(function(id) { return itemMap[id]; }).filter(Boolean);
  var top = selected.find(function(item) { return item.slot === 'top'; });
  var bottom = selected.find(function(item) { return item.slot === 'bottom'; });
  var shoes = selected.find(function(item) { return item.slot === 'shoes'; });
  var layer = selected.find(function(item) { return item.slot === 'layer'; });
  if (bottom && bottom.category === 'Shorts' && weather.middayFeelsLikeF < 48) errors.push('shorts are unsafe below a 48°F adjusted midday apparent temperature');
  if (!layer && Math.min(weather.morningFeelsLikeF, weather.eveningFeelsLikeF) < 40 && top && top.profile.warmth <= 2) errors.push('a layer is required for a cold morning or evening');
  if (layer && layer.profile.warmth === 5 && weather.middayFeelsLikeF > 82) errors.push('warmth-5 outerwear is unsafe above 82°F');
  if (top && layer && top.profile.breathability <= 2 && layer.profile.warmth >= 4 && weather.middayFeelsLikeF > 80) errors.push('the top and layer combination is not breathable enough');
  if (shoes && shoes.profile.rainSafety === 'poor' && weather.maxRainProbability >= 60 && weather.totalPrecipitationInches >= 0.01) {
    var safer = snapshot.items.filter(function(item) { return item.slot === 'shoes' && item.profile.rainSafety !== 'poor'; });
    if (safer.length) errors.push('rain-unsafe shoes selected while safer shoes are available');
  }
  return errors;
}

function validateFinalBundleV2_(curated, snapshot, weather, history, plannerResponses, critic) {
  var errors = [];
  if (!curated || !Array.isArray(curated.recommendations) || curated.recommendations.length !== 3) return ['exactly three final recommendations are required'];
  var itemMap = itemMapV2_(snapshot);
  var finalists = finalistsV2_(plannerResponses, critic);
  var finalistMap = {};
  finalists.forEach(function(candidate) { finalistMap[candidate.candidateId] = candidate; });
  var scoreMap = scoreMapV2_(critic);
  var seenCandidate = {};
  var seenArchetype = {};
  var tops = {};
  var bottoms = {};
  var shoes = {};
  var diversityStories = {};
  var layerUse = {};
  var historyKeys = exactHistoryKeysV2_(history);

  curated.recommendations.forEach(function(rec, index) {
    var path = 'recommendation[' + index + ']';
    var candidate = finalistMap[rec.candidateId];
    if (!candidate) errors.push(path + ' was not selected from the six critic finalists');
    if (seenCandidate[rec.candidateId]) errors.push(path + ' duplicates a final candidate');
    seenCandidate[rec.candidateId] = true;
    if (DAILY_V2.ARCHETYPES.indexOf(rec.archetype) < 0 || seenArchetype[rec.archetype]) errors.push(path + ' has a missing or duplicate archetype');
    seenArchetype[rec.archetype] = true;
    if (!candidate || rec.archetype !== candidate.archetype) errors.push(path + ' archetype does not match its finalist');
    if (!Array.isArray(rec.itemIds) || !candidate || rec.itemIds.slice().sort().join('|') !== candidate.itemIds.slice().sort().join('|')) errors.push(path + ' changed the finalist itemIds');
    var selected = (rec.itemIds || []).map(function(id) { return itemMap[id]; });
    if (selected.some(function(item) { return !item; })) errors.push(path + ' contains an invented item id');
    ['top', 'bottom', 'shoes'].forEach(function(slot) {
      if (selected.filter(function(item) { return item && item.slot === slot; }).length !== 1) errors.push(path + ' must contain exactly one ' + slot);
    });
    if (selected.filter(function(item) { return item && item.slot === 'layer'; }).length > 1) errors.push(path + ' contains more than one layer');
    var top = selected.find(function(item) { return item && item.slot === 'top'; });
    var bottom = selected.find(function(item) { return item && item.slot === 'bottom'; });
    var shoe = selected.find(function(item) { return item && item.slot === 'shoes'; });
    if (top && tops[top.id]) errors.push('tops must be unique across final recommendations');
    if (bottom && bottoms[bottom.id]) errors.push('bottoms must be unique across final recommendations');
    if (top) tops[top.id] = true;
    if (bottom) bottoms[bottom.id] = true;
    if (shoe) shoes[shoe.id] = (shoes[shoe.id] || 0) + 1;
    var layer = selected.find(function(item) { return item && item.slot === 'layer'; });
    if (layer) layerUse[layer.id] = (layerUse[layer.id] || 0) + 1;
    if (top && bottom) {
      var story = [top.profile.primaryColorFamily, bottom.profile.primaryColorFamily, top.profile.silhouette, bottom.profile.silhouette].join('|');
      if (diversityStories[story]) errors.push('final recommendations need materially different color or silhouette stories');
      diversityStories[story] = true;
    }
    var savedNearCopy = savedOutfitNearCopyV2_(rec.itemIds || [], snapshot);
    if (savedNearCopy) errors.push(path + ' near-copies saved outfit "' + savedNearCopy.name + '" by retaining ' + savedNearCopy.sharedCoreItemIds.length + ' core pieces');
    if (historyKeys[(rec.itemIds || []).slice().sort().join('|')]) errors.push(path + ' exactly repeats a prior-14-day outfit');
    if (!rec.colorHook || rec.colorHook.length < 30 || rec.colorHook.length > 240) errors.push(path + '.colorHook must name a specific cross-item color relationship');
    if (!rec.whyItWorks || rec.whyItWorks.length < 30 || rec.whyItWorks.length > 320) errors.push(path + '.whyItWorks must be concise and specific');
    if (!rec.weatherNote || rec.weatherNote.length < 12 || rec.weatherNote.length > 220) errors.push(path + '.weatherNote must be concise and specific');
    var score = scoreMap[rec.candidateId];
    if (!score || score.disqualified) errors.push(path + ' has no eligible critic score');
    else {
      if (score.weather < 8) errors.push(path + ' critic weather score is below 8');
      if (score.palette < 7.5) errors.push(path + ' critic palette score is below 7.5');
      if (score.colorIntent < 8) errors.push(path + ' critic color-intent score is below 8');
      if ((score.palette + score.silhouette + score.formality) / 3 < 7.5) errors.push(path + ' critic visual-coherence score is below 7.5');
    }
    errors = errors.concat(weatherSafetyErrorsV2_(rec, itemMap, weather, snapshot).map(function(error) { return path + ': ' + error; }));
  });
  DAILY_V2.ARCHETYPES.forEach(function(archetype) { if (!seenArchetype[archetype]) errors.push('missing archetype: ' + archetype); });
  var weatherSafeShoes = snapshot.items.filter(function(item) { return item.slot === 'shoes' && (!weather.rainExpected || item.profile.rainSafety !== 'poor'); });
  var allowReuse = snapshot.settings && snapshot.settings.allowShoeReuseWhenNecessary;
  if (Object.keys(shoes).length < 3 && weatherSafeShoes.length >= 3) errors.push('shoes must be unique when at least three weather-safe options exist');
  if (Object.keys(shoes).length < 3 && weatherSafeShoes.length < 3 && !allowReuse) errors.push('shoe reuse is disabled even when the weather-safe inventory is small');
  var credibleLayers = snapshot.items.filter(function(item) { return item.slot === 'layer' && item.profile.available && !item.profile.excludedFromDaily; });
  Object.keys(layerUse).forEach(function(id) {
    if (layerUse[id] > 1 && (weather.layerGuidance !== 'required' || credibleLayers.length >= 2)) errors.push('a layer may repeat only when weather requires it and alternatives are too limited');
  });
  for (var i = 0; i < curated.recommendations.length; i += 1) {
    for (var j = i + 1; j < curated.recommendations.length; j += 1) {
      var shared = curated.recommendations[i].itemIds.filter(function(id) { return curated.recommendations[j].itemIds.indexOf(id) >= 0; });
      if (shared.length > 1) errors.push('no two final outfits may share more than one item');
    }
  }
  return Array.from(new Set(errors));
}

function validateFinalBundleV2() {
  var pending = loadPendingV2_();
  if (!pending || !pending.curated) throw new Error('No curated response is ready');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var errors = validateFinalBundleV2_(pending.curated, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
  return { ok: errors.length === 0, errors: errors };
}

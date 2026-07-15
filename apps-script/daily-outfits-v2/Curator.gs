var FINAL_RECOMMENDATION_SCHEMA_V2 = {
  type: 'OBJECT',
  properties: {
    candidateId: { type: 'STRING' },
    archetype: { type: 'STRING', enum: DAILY_V2.ARCHETYPES },
    name: { type: 'STRING' },
    itemIds: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 4 },
    colorHook: { type: 'STRING' },
    whyItWorks: { type: 'STRING' },
    weatherNote: { type: 'STRING' }
  },
  required: ['candidateId', 'archetype', 'name', 'itemIds', 'colorHook', 'whyItWorks', 'weatherNote']
};

var CURATOR_SCHEMA_V2 = {
  type: 'OBJECT',
  properties: {
    recommendations: { type: 'ARRAY', items: FINAL_RECOMMENDATION_SCHEMA_V2, minItems: 3, maxItems: 3 }
  },
  required: ['recommendations']
};

function curatorResponseCanResolveLabelsV2_(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response) || !Array.isArray(response.recommendations)) return false;
  var recordsAreIterable = function(records) {
    if (records === undefined || records === null) return true;
    if (!Array.isArray(records)) return false;
    return records.every(function(record) {
      return record && typeof record === 'object' && !Array.isArray(record) &&
        (record.itemIds === undefined || record.itemIds === null || Array.isArray(record.itemIds));
    });
  };
  return recordsAreIterable(response.recommendations) && recordsAreIterable(response.candidates);
}

function resolveCuratorResponseForValidationV2_(response, snapshot) {
  if (curatorResponseCanResolveLabelsV2_(response)) return resolveLabelsV2_(response, snapshot);
  if (!response || typeof response !== 'object' || Array.isArray(response) || !Array.isArray(response.recommendations)) return response;
  var normalized = Object.assign({}, response);
  normalized.recommendations = response.recommendations.map(function(recommendation) {
    recommendation = recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) ? recommendation : {};
    var safeRecommendation = Object.assign({}, recommendation);
    safeRecommendation.itemIds = Array.isArray(recommendation.itemIds) ? recommendation.itemIds.slice() : [];
    return safeRecommendation;
  });
  return normalized;
}

function runCuratorV2_(snapshot, weather, history, selectedCandidates, critic) {
  selectedCandidates = Array.isArray(selectedCandidates) ? selectedCandidates : [];
  var scoreMap = selectionScoreMapV2_(critic && critic.scores);
  var selectedScores = selectedCandidates.map(function(candidate) {
    return candidate && scoreMap[candidate.candidateId];
  });
  if (selectedScores.some(function(score) { return !score; })) {
    throw new Error('Curator selected set is missing a unique critic score');
  }
  var prompt = [
    'These three outfits are final — selected and validated upstream. Do not swap, reorder, or modify them. Write the customer-facing copy for each.',
    'Copy each candidateId, archetype, and itemIds exactly in the same order. In colorHook, name the exact visible colors/details and at least two items that create the relationship.',
    'Do not use generic language such as "keeps it clean," "lets the top pop," or "ties everything together." Produce concise customer-facing explanations only; do not reveal chain-of-thought.',
    'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    historyGuidanceV2_(),
    'FINAL SELECTED OUTFITS:\n' + JSON.stringify(modelFacingCandidatesV2_(selectedCandidates, snapshot)),
    'CRITIC SCORES:\n' + JSON.stringify(modelFacingCriticResponseV2_({ scores: selectedScores }, snapshot).scores)
  ].join('\n\n');
  var raw = callGeminiV2_('curator', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, selectedCandidates)), CURATOR_SCHEMA_V2, 0.4);
  return resolveCuratorResponseForValidationV2_(raw, snapshot);
}

function runCuratorV2() {
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
  var localDate = localDateV2_(new Date(), config.timezone);
  var pending = null;
  try { pending = loadPendingV2_(); } catch (_ignored) {}
  assertDeterministicSelectionReadyV2_(pending, localDate, snapshot.wardrobeFingerprint);
  assertPersistedSelectionContextV2_(pending);
  if (!validOwnDailyObjectV2_(pending, 'selection') || !validPersistedSelectionSummaryV2_(pending.selection)) {
    throw new Error('Deterministic selection must be ready');
  }
  var curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  pending.curated = curated;
  pending.updatedAt = Date.now();
  savePendingV2_(pending);
  return curated;
}

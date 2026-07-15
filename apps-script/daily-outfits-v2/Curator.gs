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

function finalistsV2_(plannerResponses, critic) {
  var byId = {};
  plannerResponses.flatMap(function(response) { return response.candidates; }).forEach(function(candidate) { byId[candidate.candidateId] = candidate; });
  return criticFinalistIdsV2_(critic).map(function(id) { return byId[id]; });
}

function runCuratorV2_(snapshot, weather, history, plannerResponses, critic) {
  var finalists = finalistsV2_(plannerResponses, critic);
  var prompt = [
    'Curate the final three daily recommendations from only these six multimodal-critic finalists.',
    'Choose exactly one Easy, one Polished casual, and one Expressive look. Treat the three as a set: unique tops and bottoms, unique shoes when at least three weather-safe shoes exist, no pair sharing more than one item, distinct color or silhouette stories, and no exact prior-14-day repeat.',
    'Favor finalists with the strongest real colorIntent, not the safest quantity of black, grey, and white. Each selected look must have a visible cross-item hook—accent echo, tonal bridge, analogous color, controlled complement, or precise trim/material link. A graphic top with unrelated achromatic bottoms and shoes is not thoughtful styling merely because it does not clash.',
    'Weather suitability is non-negotiable. Do not modify a finalist. Copy its exact itemIds and candidateId. In colorHook, name the exact visible colors/details and at least two items that create the relationship. Do not use generic language such as "keeps it clean," "lets the top pop," or "ties everything together." Produce concise customer-facing explanations only; do not reveal chain-of-thought.',
    'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    'FINALISTS:\n' + JSON.stringify(modelFacingCandidatesV2_(finalists, snapshot)),
    'CRITIC SCORES AND COMMENTS:\n' + JSON.stringify(modelFacingCriticResponseV2_(critic))
  ].join('\n\n');
  var raw = callGeminiV2_('curator', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, finalists)), CURATOR_SCHEMA_V2, 0.4);
  return resolveLabelsV2_(raw, snapshot);
}

function runCuratorV2() {
  var pending = loadPendingV2_();
  if (!pending || !pending.planners || !pending.critic) throw new Error('Planner and critic stages must be ready');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var curated = runCuratorV2_(snapshot, pending.weather, pending.history, pending.planners, pending.critic);
  pending.curated = curated;
  pending.updatedAt = Date.now();
  savePendingV2_(pending);
  return curated;
}

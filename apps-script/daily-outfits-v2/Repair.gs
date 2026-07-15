function modelFacingInvalidCuratedV2_(curated, snapshot) {
  curated = curated && typeof curated === 'object' && !Array.isArray(curated) ? curated : {};
  return {
    recommendations: (Array.isArray(curated.recommendations) ? curated.recommendations : []).map(function(recommendation) {
      recommendation = recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) ? recommendation : {};
      var view = {};
      ['candidateId', 'archetype', 'name', 'colorHook', 'whyItWorks', 'weatherNote'].forEach(function(field) {
        var value = repairPromptStringV2_(recommendation[field], snapshot);
        if (value !== null) view[field] = value;
      });
      view.itemIds = (Array.isArray(recommendation.itemIds) ? recommendation.itemIds : []).map(function(token) {
        return repairItemTokenV2_(token, snapshot);
      });
      return view;
    })
  };
}

function validateFinalBundleSafelyV2_(curated, snapshot, weather, history, plannerResponses, critic) {
  if (curated && typeof curated === 'object' && !Array.isArray(curated) && Array.isArray(curated.recommendations)) {
    var recordsAreSafe = curated.recommendations.every(function(recommendation) {
      return recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) && Array.isArray(recommendation.itemIds);
    });
    if (!recordsAreSafe) return ['final recommendations must be object records with array itemIds'];
  }
  return validateFinalBundleV2_(curated, snapshot, weather, history, plannerResponses, critic);
}

function repairFinalBundleV2_(curated, errors, snapshot, weather, history, plannerResponses, critic) {
  var finalists = finalistsV2_(plannerResponses, critic);
  var current = curated;
  var currentErrors = errors;
  for (var attempt = 1; attempt <= 2; attempt += 1) {
    var prompt = [
      'Repair only what is required in this invalid final-curator response. Select only from the six unchanged finalists; copy exact itemIds. Return exactly one recommendation per archetype.',
      'Apply weather, palette, colorIntent, saved-outfit near-copy, history, and cross-outfit diversity constraints. Every recommendation needs a specific colorHook naming the visible relationship between at least two items. Do not explain the repair or expose chain-of-thought.',
      'VALIDATION ERRORS:\n' + repairPromptErrorsV2_(currentErrors, snapshot).join('\n'),
      'INVALID RESPONSE:\n' + JSON.stringify(modelFacingInvalidCuratedV2_(current, snapshot)),
      'SIX FINALISTS:\n' + JSON.stringify(modelFacingCandidatesV2_(finalists, snapshot)),
      'CRITIC:\n' + JSON.stringify(modelFacingCriticResponseV2_(critic, snapshot)),
      'SAVED OUTFIT SIGNATURES:\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
      'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
      'HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot))
    ].join('\n\n');
    var raw = callGeminiV2_('repair', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, finalists)), CURATOR_SCHEMA_V2, 0.25);
    current = resolveCuratorResponseForValidationV2_(raw, snapshot);
    currentErrors = validateFinalBundleSafelyV2_(current, snapshot, weather, history, plannerResponses, critic);
    if (!currentErrors.length) return current;
  }
  throw new Error('Final repair failed quality gates: ' + currentErrors.join('; '));
}

function repairFinalBundleV2() {
  var pending = loadPendingV2_();
  if (!pending || !pending.curated) throw new Error('No invalid curated response is ready');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var errors = validateFinalBundleSafelyV2_(pending.curated, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
  if (!errors.length) return pending.curated;
  pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.planners, pending.critic);
  pending.updatedAt = Date.now();
  savePendingV2_(pending);
  return pending.curated;
}

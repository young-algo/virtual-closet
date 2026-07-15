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

function closedCuratedForRepairV2_(curated, snapshot) {
  var resolved = resolveLabelsV2_(modelFacingInvalidCuratedV2_(curated, snapshot), snapshot);
  var items = itemMapV2_(snapshot);
  resolved.recommendations.forEach(function(recommendation) {
    recommendation.itemIds = recommendation.itemIds.filter(function(id) {
      return Object.prototype.hasOwnProperty.call(items, id);
    });
  });
  return resolved;
}

function validateFinalBundleSafelyV2_(curated, snapshot, weather, history, selectedCandidates, critic) {
  if (curated && typeof curated === 'object' && !Array.isArray(curated) && Array.isArray(curated.recommendations)) {
    var recordsAreSafe = curated.recommendations.every(function(recommendation) {
      return recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) && Array.isArray(recommendation.itemIds);
    });
    if (!recordsAreSafe) return ['final recommendations must be object records with array itemIds'];
  }
  return validateFinalBundleV2_(curated, snapshot, weather, history, selectedCandidates, critic);
}

function repairFinalBundleV2_(curated, errors, snapshot, weather, history, selectedCandidates, critic) {
  selectedCandidates = Array.isArray(selectedCandidates) ? selectedCandidates : [];
  var current = curated;
  var currentErrors = errors;
  for (var attempt = 1; attempt <= 2; attempt += 1) {
    var prompt = [
      'Repair only the customer-facing copy in this invalid final-curator response. The candidate ids, archetypes, item ids, and order are immutable. Do not select, swap, reorder, add, remove, or alter any outfit or item.',
      'Every recommendation needs a specific colorHook naming the visible relationship between at least two items. Do not explain the repair or expose chain-of-thought.',
      'VALIDATION ERRORS:\n' + repairPromptErrorsV2_(currentErrors, snapshot).join('\n'),
      'INVALID RESPONSE:\n' + JSON.stringify(modelFacingCuratedV2_(closedCuratedForRepairV2_(current, snapshot), snapshot)),
      'IMMUTABLE SELECTED OUTFITS:\n' + JSON.stringify(modelFacingCandidatesV2_(selectedCandidates, snapshot))
    ].join('\n\n');
    var raw = callGeminiV2_('repair', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, selectedCandidates)), CURATOR_SCHEMA_V2, 0.25);
    current = resolveCuratorResponseForValidationV2_(raw, snapshot);
    currentErrors = validateFinalBundleSafelyV2_(current, snapshot, weather, history, selectedCandidates, critic);
    if (!currentErrors.length) return current;
  }
  throw new Error('Final repair failed quality gates: ' + currentErrors.join('; '));
}

function repairFinalBundleV2() {
  var pending = null;
  try { pending = loadPendingV2_(); } catch (_ignored) {}
  assertDeterministicSelectionReadyV2_(pending);
  assertPersistedSelectionContextV2_(pending);
  if (!ownDailyJobKeyV2_(pending, 'curated') || !pending.curated) throw new Error('No invalid curated response is ready');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var errors = validateFinalBundleSafelyV2_(pending.curated, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  if (!errors.length) return pending.curated;
  pending.curated = repairFinalBundleV2_(pending.curated, errors, snapshot, pending.weather, pending.history, pending.selectedCandidates, pending.critic);
  pending.updatedAt = Date.now();
  savePendingV2_(pending);
  return pending.curated;
}

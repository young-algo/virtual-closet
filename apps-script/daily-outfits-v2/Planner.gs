var PLANNER_SCHEMA_V2 = {
  type: 'OBJECT',
  properties: {
    archetype: { type: 'STRING', enum: DAILY_V2.ARCHETYPES },
    candidates: {
      type: 'ARRAY', minItems: 5, maxItems: 5,
      items: {
        type: 'OBJECT',
        properties: {
          candidateId: { type: 'STRING' },
          archetype: { type: 'STRING', enum: DAILY_V2.ARCHETYPES },
          topId: { type: 'STRING' },
          bottomId: { type: 'STRING' },
          shoeId: { type: 'STRING' },
          layerId: { type: 'STRING', nullable: true },
          itemIds: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 4 },
          name: { type: 'STRING' },
          styleSummary: { type: 'STRING' },
          colorStrategy: { type: 'STRING' },
          weatherSummary: { type: 'STRING' },
          potentialRisks: { type: 'ARRAY', items: { type: 'STRING' } },
          plannerConfidence: { type: 'NUMBER', minimum: 0, maximum: 1 }
        },
        required: ['candidateId', 'archetype', 'topId', 'bottomId', 'shoeId', 'itemIds', 'name', 'styleSummary', 'colorStrategy', 'weatherSummary', 'potentialRisks', 'plannerConfidence']
      }
    }
  },
  required: ['archetype', 'candidates']
};

function archetypeBriefV2_(archetype) {
  if (archetype === 'easy') return 'Relaxed and uncomplicated without feeling generic. Prioritize comfort and natural wardrobe combinations. Assume no gym, work, or errands. A restrained sneaker may anchor the look.';
  if (archetype === 'polished-casual') return 'Cleaner and more intentional than Easy, with coherent proportions and slightly sharper pieces. Do not assume an office, date, suit, or formal event. Sneakers are welcome when intentional.';
  return 'Use the strongest controlled color, graphic, jersey, pattern, or sneaker colorway. Prefer one dominant statement. Keep it wearable for an ordinary day and unmistakably different from Easy and Polished casual.';
}

function plannerPartsV2_(archetype, snapshot, weather, history, selectionGuidance) {
  var prompt = [
    "You are planning Kevin's real wardrobe for an ordinary day with no inferred special event.",
    'Every available item is visible in the complete slot-specific atlases and JSON item index. Reference items only by their short label (T…, B…, L…, S…) exactly as printed in the index and atlases. Do not invent, shop, or omit an item because it is unfamiliar.',
    'Each item profile lists primaryColorFamily, secondaryColorFamily, and accentColors verified from its photographs when available. Treat those profile colors as ground truth for what colors exist; use the images to judge how the colors relate.',
    'Weather appropriateness is mandatory. Visual coherence matters more than novelty. Daily history is a rotation signal, not an absolute prohibition, except exact combinations from the prior 14 days may not repeat.',
    'Saved outfits are style-grammar examples, never unlabeled templates. Never reproduce the exact core trio of a saved outfit. Sharing two core pieces is acceptable only when the third piece meaningfully changes the look.',
    'Build a deliberate palette before choosing ids. Every candidate needs a concrete cross-item color hook: an accent echo, tonal bridge, analogous relationship, complementary contrast, or precise trim/material link visible in the images. Merely saying that black, grey, or white pieces "let the top stand out" is not a color strategy.',
    'For a graphic, patterned, jersey, or multicolor top, inspect its secondary and accent colors. Prefer a bottom or shoe that subtly picks up one of those colors, or creates a controlled complementary relationship. Do not default both the bottom and shoes to achromatic black/grey/white when a more intentional color connection is available in the wardrobe.',
    'A predominantly neutral outfit is allowed only when it has a specific tonal, texture, trim, or silhouette relationship strong enough to be the point of the look. colorStrategy must be 30–280 characters and name a specific cross-item visual relationship using the exact visible colors and items connecting them; do not invent colors from metadata or product lore.',
    'Return five genuinely viable and materially distinct candidates for the ' + archetype + ' direction—not superficial variations and not the same hero piece with small substitutions. Each needs one top, one bottom, one shoe, and zero or one layer.',
    'Do not reveal chain-of-thought. Return only the requested concise structured fields.',
    'ARCHETYPE BRIEF: ' + archetypeBriefV2_(archetype),
    'WEATHER PROFILE:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'Items listed in cooldownItemLabels headlined yesterday\'s email; avoid them today unless history shows Kevin wore them.',
    'DAILY ROTATION HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    historyGuidanceV2_(),
    'READ-ONLY SAVED TASTE EVIDENCE (weights indicate confidence; do not copy literally):\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
    'COMPLETE ITEM INDEX:\n' + JSON.stringify(compactItemIndexV2_(snapshot))
  ];
  if (selectionGuidance) prompt.push(repairPromptStringV2_(selectionGuidance, snapshot));
  prompt = prompt.join('\n\n');
  return [{ text: prompt }].concat(atlasPartsV2_(snapshot));
}

function plannerResponseCanResolveLabelsV2_(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response) || !Array.isArray(response.candidates)) return false;
  var recordsAreIterable = function(records) {
    if (records === undefined || records === null) return true;
    if (!Array.isArray(records)) return false;
    return records.every(function(record) {
      return record && typeof record === 'object' && !Array.isArray(record) &&
        (record.itemIds === undefined || record.itemIds === null || Array.isArray(record.itemIds));
    });
  };
  return recordsAreIterable(response.candidates) && recordsAreIterable(response.recommendations);
}

function resolvePlannerResponseForValidationV2_(response, snapshot) {
  return plannerResponseCanResolveLabelsV2_(response) ? resolveLabelsV2_(response, snapshot) : response;
}

function validatePlannerResponseSafelyV2_(response, archetype, snapshot) {
  if (response && typeof response === 'object' && !Array.isArray(response) && Array.isArray(response.candidates)) {
    var recordsAreSafe = response.candidates.every(function(candidate) {
      return candidate && typeof candidate === 'object' && !Array.isArray(candidate) &&
        (candidate.itemIds === undefined || candidate.itemIds === null || Array.isArray(candidate.itemIds)) &&
        (candidate.potentialRisks === undefined || candidate.potentialRisks === null || Array.isArray(candidate.potentialRisks));
    });
    if (!recordsAreSafe) return ['planner candidates must be object records with array itemIds and potentialRisks'];
  }
  return validatePlannerResponseV2_(response, archetype, snapshot);
}

function repairPromptStringV2_(value, snapshot) {
  return typeof value === 'string' ? historyTextForModelV2_(value, snapshot) : null;
}

function repairPromptErrorsV2_(errors, snapshot) {
  return (Array.isArray(errors) ? errors : []).map(function(error) {
    return repairPromptStringV2_(error, snapshot) || 'Invalid response field requires repair';
  });
}

function repairItemTokenV2_(token, snapshot) {
  if (typeof token !== 'string') return 'INVALID_LABEL';
  var label = labelForItemIdV2_(token, snapshot);
  if (label) return label;
  return Object.prototype.hasOwnProperty.call(itemLabelMapV2_(snapshot), token) ? token : 'INVALID_LABEL';
}

function modelFacingInvalidPlannerCandidateV2_(candidate, snapshot) {
  candidate = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  var view = {};
  ['candidateId', 'archetype', 'name', 'styleSummary', 'colorStrategy', 'weatherSummary'].forEach(function(field) {
    var value = repairPromptStringV2_(candidate[field], snapshot);
    if (value !== null) view[field] = value;
  });
  ['topId', 'bottomId', 'shoeId', 'layerId'].forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) return;
    if (field === 'layerId' && candidate[field] === null) view[field] = null;
    else view[field] = repairItemTokenV2_(candidate[field], snapshot);
  });
  view.itemIds = (Array.isArray(candidate.itemIds) ? candidate.itemIds : []).map(function(token) {
    return repairItemTokenV2_(token, snapshot);
  });
  if (Array.isArray(candidate.potentialRisks)) {
    view.potentialRisks = candidate.potentialRisks.reduce(function(values, value) {
      var sanitized = repairPromptStringV2_(value, snapshot);
      if (sanitized !== null) values.push(sanitized);
      return values;
    }, []);
  }
  if (typeof candidate.plannerConfidence === 'number' && isFinite(candidate.plannerConfidence)) view.plannerConfidence = candidate.plannerConfidence;
  return view;
}

function modelFacingInvalidPlannerCandidatesV2_(candidates, snapshot) {
  return (Array.isArray(candidates) ? candidates : []).map(function(candidate) {
    return modelFacingInvalidPlannerCandidateV2_(candidate, snapshot);
  });
}

function repairPlannerResponseV2_(archetype, invalidResponse, errors, snapshot, weather, history, selectionGuidance) {
  var parts = plannerPartsV2_(archetype, snapshot, weather, history, selectionGuidance);
  invalidResponse = invalidResponse && typeof invalidResponse === 'object' && !Array.isArray(invalidResponse) ? invalidResponse : {};
  var modelInvalidResponse = {
    archetype: typeof invalidResponse.archetype === 'string' ? repairPromptStringV2_(invalidResponse.archetype, snapshot) : archetype,
    candidates: modelFacingInvalidPlannerCandidatesV2_(invalidResponse.candidates, snapshot)
  };
  parts.unshift({ text: 'Repair the planner response below. Fix every listed structural error while preserving strong valid candidates. Do not locally explain the repair.\nERRORS:\n' + repairPromptErrorsV2_(errors, snapshot).join('\n') + '\nINVALID RESPONSE:\n' + JSON.stringify(modelInvalidResponse) });
  var raw = callGeminiV2_('repair', parts, PLANNER_SCHEMA_V2, 0.25);
  var repaired = resolvePlannerResponseForValidationV2_(raw, snapshot);
  var repairedErrors = validatePlannerResponseSafelyV2_(repaired, archetype, snapshot);
  if (repairedErrors.length) throw new Error(archetype + ' planner repair failed: ' + repairedErrors.join('; '));
  return repaired;
}

function modelFacingReplanFailureNotesV2_(failureNotes, snapshot) {
  return (Array.isArray(failureNotes) ? failureNotes : []).map(function(note) {
    note = note && typeof note === 'object' && !Array.isArray(note) ? note : {};
    var view = {};
    var candidateId = repairPromptStringV2_(note.candidateId, snapshot);
    if (candidateId !== null) view.candidateId = candidateId;
    ['criticalDefects', 'reservations'].forEach(function(field) {
      view[field] = (Array.isArray(note[field]) ? note[field] : []).reduce(function(values, value) {
        var sanitized = repairPromptStringV2_(value, snapshot);
        if (sanitized !== null) values.push(sanitized);
        return values;
      }, []);
    });
    return view;
  });
}

function replanArchetypeV2_(archetype, snapshot, weather, history, failureNotes, avoidItemIds, round) {
  if (DAILY_V2.ARCHETYPES.indexOf(archetype) < 0) throw new Error('Unknown targeted re-plan archetype');
  if (round !== 1 && round !== 2) throw new Error('Targeted re-plan round must be 1 or 2');
  var avoidLabels = (Array.isArray(avoidItemIds) ? avoidItemIds : []).map(function(id) {
    return requiredItemLabelV2_(id, snapshot, 'Targeted re-plan avoid list');
  });
  var guidance = [
    'TARGETED RE-PLAN ROUND ' + round + ': Return five new ' + archetype + ' candidates with candidateIds not used in the prior response.',
    'Your previous five candidates failed because:\n' + JSON.stringify(modelFacingReplanFailureNotesV2_(failureNotes, snapshot)),
    'Other looks in today\'s set already use these items; prefer alternatives:\n' + avoidLabels.join(', ')
  ].join('\n\n');
  var parts = plannerPartsV2_(archetype, snapshot, weather, history, guidance);
  var raw = callGeminiV2_('planner', parts, PLANNER_SCHEMA_V2, getNumberPropertyV2_('DAILY_MODEL_TEMPERATURE', 0.9));
  var response = resolvePlannerResponseForValidationV2_(raw, snapshot);
  var errors = validatePlannerResponseSafelyV2_(response, archetype, snapshot);
  return errors.length
    ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history, guidance)
    : response;
}

function runAllPlannersV2_(snapshot, weather, history) {
  var temperature = getNumberPropertyV2_('DAILY_MODEL_TEMPERATURE', 0.9);
  var calls = DAILY_V2.ARCHETYPES.map(function(archetype) {
    return {
      context: archetype,
      parts: plannerPartsV2_(archetype, snapshot, weather, history),
      schema: PLANNER_SCHEMA_V2,
      temperature: temperature
    };
  });
  var rawResponses = callGeminiBatchV2_('planner', calls);
  return rawResponses.map(function(raw, index) {
    var archetype = DAILY_V2.ARCHETYPES[index];
    var response = resolvePlannerResponseForValidationV2_(raw, snapshot);
    var errors = validatePlannerResponseSafelyV2_(response, archetype, snapshot);
    return errors.length ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history) : response;
  });
}

function runPlannerV2(archetype) {
  if (DAILY_V2.ARCHETYPES.indexOf(archetype) < 0) throw new Error('Unknown archetype');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var weather = fetchDailyWeatherV2();
  var history = dailyHistoryContextV2_(weather.localDate, snapshot);
  var raw = callGeminiV2_('planner', plannerPartsV2_(archetype, snapshot, weather, history), PLANNER_SCHEMA_V2, getNumberPropertyV2_('DAILY_MODEL_TEMPERATURE', 0.9));
  var response = resolvePlannerResponseForValidationV2_(raw, snapshot);
  var errors = validatePlannerResponseSafelyV2_(response, archetype, snapshot);
  return errors.length ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history) : response;
}

function runAllPlannersV2() {
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var weather = fetchDailyWeatherV2();
  var history = dailyHistoryContextV2_(weather.localDate, snapshot);
  var planners = runAllPlannersV2_(snapshot, weather, history);
  savePendingV2_({ localDate: weather.localDate, wardrobeFingerprint: snapshot.wardrobeFingerprint, weather: weather, history: history, planners: planners, updatedAt: Date.now() });
  return planners;
}

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

function plannerPartsV2_(archetype, snapshot, weather, history) {
  var prompt = [
    "You are planning Kevin's real wardrobe for an ordinary day with no inferred special event.",
    'Every available item is visible in the complete slot-specific atlases and JSON item index. Use only exact listed ids. Do not invent, shop, or omit an item because it is unfamiliar.',
    'Weather appropriateness is mandatory. Visual coherence matters more than novelty. Daily history is a rotation signal, not an absolute prohibition, except exact combinations from the prior 14 days may not repeat.',
    'Saved outfits are style-grammar examples, never templates. A candidate may not retain two of the three core pieces (top, bottom, shoes) from any saved outfit and merely swap the third. Express the same taste through a genuinely new combination.',
    'Build a deliberate palette before choosing ids. Every candidate needs a concrete cross-item color hook: an accent echo, tonal bridge, analogous relationship, complementary contrast, or precise trim/material link visible in the images. Merely saying that black, grey, or white pieces "let the top stand out" is not a color strategy.',
    'For a graphic, patterned, jersey, or multicolor top, inspect its secondary and accent colors. Prefer a bottom or shoe that subtly picks up one of those colors, or creates a controlled complementary relationship. Do not default both the bottom and shoes to achromatic black/grey/white when a more intentional color connection is available in the wardrobe.',
    'A predominantly neutral outfit is allowed only when it has a specific tonal, texture, trim, or silhouette relationship strong enough to be the point of the look. Name the exact visible colors and the items connecting them in colorStrategy; do not invent colors from metadata or product lore.',
    'Return five genuinely viable and materially distinct candidates for the ' + archetype + ' direction—not superficial variations and not the same hero piece with small substitutions. Each needs one top, one bottom, one shoe, and zero or one layer.',
    'Do not reveal chain-of-thought. Return only the requested concise structured fields.',
    'ARCHETYPE BRIEF: ' + archetypeBriefV2_(archetype),
    'WEATHER PROFILE:\n' + JSON.stringify(weather),
    'DAILY ROTATION HISTORY:\n' + JSON.stringify(history),
    'READ-ONLY SAVED TASTE EVIDENCE (weights indicate confidence; do not copy literally):\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
    'COMPLETE ITEM INDEX:\n' + JSON.stringify(compactItemIndexV2_(snapshot))
  ].join('\n\n');
  return [{ text: prompt }].concat(atlasPartsV2_(snapshot));
}

function repairPlannerResponseV2_(archetype, invalidResponse, errors, snapshot, weather, history) {
  var parts = plannerPartsV2_(archetype, snapshot, weather, history);
  parts.unshift({ text: 'Repair the planner response below. Fix every listed structural error while preserving strong valid candidates. Do not locally explain the repair.\nERRORS:\n' + errors.join('\n') + '\nINVALID RESPONSE:\n' + JSON.stringify(invalidResponse) });
  var repaired = callGeminiV2_('repair', parts, PLANNER_SCHEMA_V2, 0.25);
  var repairedErrors = validatePlannerResponseV2_(repaired, archetype, snapshot);
  if (repairedErrors.length) throw new Error(archetype + ' planner repair failed: ' + repairedErrors.join('; '));
  return repaired;
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
  var responses = callGeminiBatchV2_('planner', calls);
  return responses.map(function(response, index) {
    var archetype = DAILY_V2.ARCHETYPES[index];
    var errors = validatePlannerResponseV2_(response, archetype, snapshot);
    return errors.length ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history) : response;
  });
}

function runPlannerV2(archetype) {
  if (DAILY_V2.ARCHETYPES.indexOf(archetype) < 0) throw new Error('Unknown archetype');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var weather = fetchDailyWeatherV2();
  var history = dailyHistoryContextV2_(weather.localDate);
  var response = callGeminiV2_('planner', plannerPartsV2_(archetype, snapshot, weather, history), PLANNER_SCHEMA_V2, getNumberPropertyV2_('DAILY_MODEL_TEMPERATURE', 0.9));
  var errors = validatePlannerResponseV2_(response, archetype, snapshot);
  return errors.length ? repairPlannerResponseV2_(archetype, response, errors, snapshot, weather, history) : response;
}

function runAllPlannersV2() {
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var weather = fetchDailyWeatherV2();
  var history = dailyHistoryContextV2_(weather.localDate);
  var planners = runAllPlannersV2_(snapshot, weather, history);
  savePendingV2_({ localDate: weather.localDate, wardrobeFingerprint: snapshot.wardrobeFingerprint, weather: weather, history: history, planners: planners, updatedAt: Date.now() });
  return planners;
}

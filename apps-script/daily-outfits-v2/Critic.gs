var CRITIC_SCORE_SCHEMA_V2 = {
  type: 'OBJECT',
  properties: {
    candidateId: { type: 'STRING' },
    weather: { type: 'NUMBER' },
    palette: { type: 'NUMBER' },
    colorIntent: { type: 'NUMBER' },
    silhouette: { type: 'NUMBER' },
    formality: { type: 'NUMBER' },
    visualInterest: { type: 'NUMBER' },
    wearability: { type: 'NUMBER' },
    freshness: { type: 'NUMBER' },
    archetypeFit: { type: 'NUMBER' },
    disqualified: { type: 'BOOLEAN' },
    criticalDefects: { type: 'ARRAY', items: { type: 'STRING' } },
    reservations: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['candidateId', 'weather', 'palette', 'colorIntent', 'silhouette', 'formality', 'visualInterest', 'wearability', 'freshness', 'archetypeFit', 'disqualified', 'criticalDefects', 'reservations']
};

var CRITIC_SCHEMA_V2 = {
  type: 'OBJECT',
  properties: {
    scores: { type: 'ARRAY', items: CRITIC_SCORE_SCHEMA_V2 },
    finalists: {
      type: 'OBJECT',
      properties: {
        easy: { type: 'ARRAY', items: { type: 'STRING' } },
        polishedCasual: { type: 'ARRAY', items: { type: 'STRING' } },
        expressive: { type: 'ARRAY', items: { type: 'STRING' } }
      },
      required: ['easy', 'polishedCasual', 'expressive']
    }
  },
  required: ['scores', 'finalists']
};

function criticFinalistIdsV2_(response) {
  return response.finalists.easy.concat(response.finalists.polishedCasual, response.finalists.expressive);
}

function criticScoreMeetsFinalFloorV2_(score) {
  return Boolean(score) && !score.disqualified && score.weather >= 8 &&
    score.palette >= 7.5 && score.colorIntent >= 8 &&
    (score.palette + score.silhouette + score.formality) / 3 >= 7.5;
}

function validateCriticResponseV2_(response, candidates) {
  var errors = [];
  if (!response || !Array.isArray(response.scores) || response.scores.length !== candidates.length) return ['critic must score every candidate exactly once'];
  var byCandidate = {};
  candidates.forEach(function(candidate) { byCandidate[candidate.candidateId] = candidate; });
  var scoreById = {};
  response.scores.forEach(function(score) {
    if (!byCandidate[score.candidateId]) errors.push('critic scored unknown candidate ' + score.candidateId);
    if (scoreById[score.candidateId]) errors.push('critic scored candidate twice: ' + score.candidateId);
    scoreById[score.candidateId] = score;
    ['weather', 'palette', 'colorIntent', 'silhouette', 'formality', 'visualInterest', 'wearability', 'freshness', 'archetypeFit'].forEach(function(metric) {
      if (typeof score[metric] !== 'number' || score[metric] < 0 || score[metric] > 10) errors.push('critic score ' + score.candidateId + '.' + metric + ' must be between 0 and 10');
    });
    if (!Array.isArray(score.criticalDefects) || !Array.isArray(score.reservations)) errors.push('critic comments must be arrays for ' + score.candidateId);
  });
  candidates.forEach(function(candidate) { if (!scoreById[candidate.candidateId]) errors.push('critic omitted ' + candidate.candidateId); });
  var groups = response.finalists || {};
  [['easy', 'easy'], ['polishedCasual', 'polished-casual'], ['expressive', 'expressive']].forEach(function(pair) {
    var finalists = groups[pair[0]];
    if (!Array.isArray(finalists) || finalists.length !== 2 || new Set(finalists).size !== 2) {
      errors.push(pair[0] + ' must have two unique finalists');
      return;
    }
    finalists.forEach(function(id) {
      if (!byCandidate[id] || byCandidate[id].archetype !== pair[1]) errors.push(id + ' is not a candidate for ' + pair[1]);
      if (scoreById[id] && scoreById[id].disqualified) errors.push('disqualified candidate selected as finalist: ' + id);
      if (scoreById[id] && !criticScoreMeetsFinalFloorV2_(scoreById[id])) errors.push('finalist ' + id + ' does not meet the final weather and visual-coherence score floors');
    });
  });
  return errors;
}

function repairCriticResponseV2_(snapshot, weather, history, candidates, invalidResponse, errors) {
  var prompt = [
    'Repair this multimodal critic response without changing any candidate contents. Re-evaluate only where necessary and select two valid finalists per archetype.',
    'Every finalist must be non-disqualified, have weather at least 8, palette at least 7.5, colorIntent at least 8, and an average of palette, silhouette, and formality of at least 7.5. Do not inflate scores to force a result; judge the actual images and weather faithfully.',
    'ColorIntent measures a specific cross-item visual relationship, not mere absence of clashing. Black/grey/white bottoms and shoes around an unrelated top are not intentional by default. Require a visible accent echo, tonal bridge, analogous relationship, controlled contrast, or precise trim/material link.',
    'VALIDATION ERRORS:\n' + errors.join('\n'),
    'INVALID CRITIC RESPONSE:\n' + JSON.stringify(invalidResponse),
    'WEATHER:\n' + JSON.stringify(weather),
    'DAILY HISTORY:\n' + JSON.stringify(history),
    'SAVED OUTFIT SIGNATURES (near-copy reference only):\n' + JSON.stringify(savedTasteSignaturesV2_(snapshot)),
    'CANDIDATES:\n' + JSON.stringify(candidates)
  ].join('\n\n');
  var repaired = callGeminiV2_('repair', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, candidates)), CRITIC_SCHEMA_V2, 0.25);
  var repairedErrors = validateCriticResponseV2_(repaired, candidates);
  if (repairedErrors.length) throw new Error('Critic repair failed quality gates: ' + repairedErrors.join('; '));
  return repaired;
}

function runCriticV2_(snapshot, weather, history, plannerResponses) {
  var candidates = plannerResponses.flatMap(function(response) { return response.candidates; });
  var prompt = [
    'Act as a demanding multimodal wardrobe critic. Judge the actual item images, not metadata alone.',
    'Score all 15 candidates independently on every 0–10 rubric dimension. Penalize weather risk heavily and disqualify clear weather mismatch, obvious color conflict, incoherent formality, uncertain item identification, exact recent repeat, a candidate that retains two core pieces from a saved outfit, or material duplication of a stronger candidate.',
    'Palette measures harmony; colorIntent measures whether the outfit has a precise, visible cross-item color idea. Score colorIntent 0–4 for generic neutral safety or a top placed over unrelated black/grey/white bottoms and shoes; 5–7 for competent anchoring without a meaningful hook; 8–10 only for a clearly observable accent echo, tonal bridge, analogous relationship, complementary contrast, or trim/material link. For graphic, patterned, jersey, or multicolor tops, look for a bottom or shoe that subtly connects to a secondary/accent color. "The neutrals let the top stand out" is insufficient by itself.',
    'Do not disqualify simple item reuse by itself. Prefer a strong familiar piece over weak novelty, but never a near-copy of a saved outfit. Select exactly two non-disqualified finalists per archetype. Every finalist must have weather at least 8, palette at least 7.5, colorIntent at least 8, and an average of palette, silhouette, and formality of at least 7.5. Do not rewrite any candidate contents. Do not expose chain-of-thought.',
    'ARCHETYPES:\n' + DAILY_V2.ARCHETYPES.map(function(value) { return value + ': ' + archetypeBriefV2_(value); }).join('\n'),
    'WEATHER:\n' + JSON.stringify(weather),
    'DAILY HISTORY:\n' + JSON.stringify(history),
    'SAVED OUTFIT SIGNATURES (style evidence and near-copy reference):\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
    'CANDIDATES:\n' + JSON.stringify(candidates)
  ].join('\n\n');
  var response = callGeminiV2_('critic', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, candidates)), CRITIC_SCHEMA_V2, 0.3);
  var errors = validateCriticResponseV2_(response, candidates);
  return errors.length ? repairCriticResponseV2_(snapshot, weather, history, candidates, response, errors) : response;
}

function runCriticV2() {
  var pending = loadPendingV2_();
  if (!pending || !pending.planners) throw new Error('No persisted planner candidates');
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var critic = runCriticV2_(snapshot, pending.weather, pending.history, pending.planners);
  pending.critic = critic;
  pending.updatedAt = Date.now();
  savePendingV2_(pending);
  return critic;
}

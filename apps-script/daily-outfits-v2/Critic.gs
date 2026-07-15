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

function criticScoreAnchorsV2_() {
  return [
    'SCORE ANCHORS:',
    '- weather: 10 = ideal across the whole 6:00–23:00 window; 8 = comfortable morning, midday, and evening with at most one minor compromise — the minimum for a finalist; 6 = fine midday but wrong at the edges of the day; 4 = uncomfortable for a meaningful part of the day; ≤2 = unsafe or clearly wrong.',
    '- palette: 9–10 = every visible color sits in one deliberate scheme; 7–8 = coherent with one minor stray; 5–6 = colors merely coexist; ≤4 = at least one visible conflict.',
    '- silhouette: 9–10 = proportions read as deliberate, volumes balance; 7–8 = standard and unremarkable; 5–6 = slightly mismatched volumes; ≤4 = clearly fighting proportions.',
    '- formality: 9–10 = all pieces on one register; 7–8 = one register with a soft outlier; 5–6 = mixed registers; ≤4 = jarring mix.',
    '- freshness: 9–10 = a genuinely new combination of non-over-exposed items; 7–8 = familiar items in new relationships; 5–6 = leans on over-exposed items or echoes a recent look; ≤4 = barely differs from a recent email, or shares two core pieces with a saved outfit without transforming it. Verified wore/liked feedback on similar looks lifts this score.',
    '- archetypeFit: 9–10 = unmistakably this archetype next to the other two briefs; 5–6 = could belong to a neighboring archetype; ≤4 = wrong brief.',
    '- visualInterest: 9–10 = a specific reason to look twice (color idea, texture, proportion); 5–6 = pleasant but forgettable; ≤4 = inert.',
    '- wearability: 9–10 = zero-friction for an ordinary day; 5–6 = needs babying (delicate, fussy, impractical); ≤4 = impractical for the day described.'
  ].join('\n');
}

function modelFacingCriticResponseV2_(response, snapshot) {
  response = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
  var scoreFields = ['weather', 'palette', 'colorIntent', 'silhouette', 'formality', 'visualInterest', 'wearability', 'freshness', 'archetypeFit'];
  var scores = (Array.isArray(response.scores) ? response.scores : []).map(function(score) {
    score = score && typeof score === 'object' && !Array.isArray(score) ? score : {};
    var view = {};
    var candidateId = repairPromptStringV2_(score.candidateId, snapshot);
    if (candidateId !== null) view.candidateId = candidateId;
    scoreFields.forEach(function(field) {
      if (typeof score[field] === 'number') view[field] = score[field];
    });
    if (typeof score.disqualified === 'boolean') view.disqualified = score.disqualified;
    ['criticalDefects', 'reservations'].forEach(function(field) {
      if (Array.isArray(score[field])) {
        view[field] = score[field].reduce(function(values, value) {
          var sanitized = repairPromptStringV2_(value, snapshot);
          if (sanitized !== null) values.push(sanitized);
          return values;
        }, []);
      }
    });
    return view;
  });
  var finalists = response.finalists && typeof response.finalists === 'object' && !Array.isArray(response.finalists) ? response.finalists : {};
  var finalistView = function(values) {
    return (Array.isArray(values) ? values : []).reduce(function(ids, value) {
      var sanitized = repairPromptStringV2_(value, snapshot);
      if (sanitized !== null) ids.push(sanitized);
      return ids;
    }, []);
  };
  return {
    scores: scores,
    finalists: {
      easy: finalistView(finalists.easy),
      polishedCasual: finalistView(finalists.polishedCasual),
      expressive: finalistView(finalists.expressive)
    }
  };
}

function criticFinalistIdsV2_(response) {
  response = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
  var finalists = response.finalists && typeof response.finalists === 'object' && !Array.isArray(response.finalists) ? response.finalists : {};
  return ['easy', 'polishedCasual', 'expressive'].reduce(function(ids, group) {
    return ids.concat((Array.isArray(finalists[group]) ? finalists[group] : []).filter(function(value) {
      return typeof value === 'string';
    }));
  }, []);
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

function validateCriticResponseSafelyV2_(response, candidates) {
  if (response && typeof response === 'object' && !Array.isArray(response) && Array.isArray(response.scores)) {
    var scoresAreSafe = response.scores.every(function(score) {
      return score && typeof score === 'object' && !Array.isArray(score) &&
        (score.criticalDefects === undefined || score.criticalDefects === null || Array.isArray(score.criticalDefects)) &&
        (score.reservations === undefined || score.reservations === null || Array.isArray(score.reservations));
    });
    if (!scoresAreSafe) return ['critic scores must be object records with array comments'];
  }
  return validateCriticResponseV2_(response, candidates);
}

function repairCriticResponseV2_(snapshot, weather, history, candidates, invalidResponse, errors) {
  var prompt = [
    'Repair this multimodal critic response without changing any candidate contents. Re-evaluate only where necessary and select two valid finalists per archetype.',
    'Every finalist must be non-disqualified, have weather at least 8, palette at least 7.5, colorIntent at least 8, and an average of palette, silhouette, and formality of at least 7.5. Do not inflate scores to force a result; judge the actual images and weather faithfully.',
    'ColorIntent measures a specific cross-item visual relationship, not mere absence of clashing. Black/grey/white bottoms and shoes around an unrelated top are not intentional by default. Require a visible accent echo, tonal bridge, analogous relationship, controlled contrast, or precise trim/material link.',
    criticScoreAnchorsV2_(),
    'VALIDATION ERRORS:\n' + repairPromptErrorsV2_(errors, snapshot).join('\n'),
    'INVALID CRITIC RESPONSE:\n' + JSON.stringify(modelFacingCriticResponseV2_(invalidResponse, snapshot)),
    'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    'SAVED OUTFIT SIGNATURES (near-copy reference only):\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
    'CANDIDATES:\n' + JSON.stringify(modelFacingCandidatesV2_(candidates, snapshot))
  ].join('\n\n');
  var repaired = callGeminiV2_('repair', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, candidates)), CRITIC_SCHEMA_V2, 0.25);
  var repairedErrors = validateCriticResponseSafelyV2_(repaired, candidates);
  if (repairedErrors.length) throw new Error('Critic repair failed quality gates: ' + repairedErrors.join('; '));
  return repaired;
}

function runCriticV2_(snapshot, weather, history, plannerResponses) {
  var candidates = plannerResponses.flatMap(function(response) { return response.candidates; });
  var prompt = [
    'Act as a demanding multimodal wardrobe critic. Judge the actual item images, not metadata alone.',
    'Score all ' + candidates.length + ' candidates independently on every 0–10 rubric dimension. Penalize weather risk heavily and disqualify clear weather mismatch, obvious color conflict, incoherent formality, uncertain item identification, exact recent repeat, a candidate that retains two core pieces from a saved outfit, or material duplication of a stronger candidate.',
    'Palette measures harmony; colorIntent measures whether the outfit has a precise, visible cross-item color idea. Score colorIntent 0–4 for generic neutral safety or a top placed over unrelated black/grey/white bottoms and shoes; 5–7 for competent anchoring without a meaningful hook; 8–10 only for a clearly observable accent echo, tonal bridge, analogous relationship, complementary contrast, or trim/material link. For graphic, patterned, jersey, or multicolor tops, look for a bottom or shoe that subtly connects to a secondary/accent color. "The neutrals let the top stand out" is insufficient by itself.',
    criticScoreAnchorsV2_(),
    'Do not disqualify simple item reuse by itself. Prefer a strong familiar piece over weak novelty, but never a near-copy of a saved outfit. Select exactly two non-disqualified finalists per archetype. Every finalist must have weather at least 8, palette at least 7.5, colorIntent at least 8, and an average of palette, silhouette, and formality of at least 7.5. Do not rewrite any candidate contents. Do not expose chain-of-thought.',
    'ARCHETYPES:\n' + DAILY_V2.ARCHETYPES.map(function(value) { return value + ': ' + archetypeBriefV2_(value); }).join('\n'),
    'WEATHER:\n' + JSON.stringify(modelWeatherViewV2_(weather)),
    'DAILY HISTORY:\n' + JSON.stringify(modelFacingHistoryV2_(history, snapshot)),
    'SAVED OUTFIT SIGNATURES (style evidence and near-copy reference):\n' + JSON.stringify(buildTasteSummaryV2_(snapshot)),
    'CANDIDATES:\n' + JSON.stringify(modelFacingCandidatesV2_(candidates, snapshot))
  ].join('\n\n');
  var response = callGeminiV2_('critic', [{ text: prompt }].concat(candidateImagePartsV2_(snapshot, candidates)), CRITIC_SCHEMA_V2, 0.3);
  var errors = validateCriticResponseSafelyV2_(response, candidates);
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

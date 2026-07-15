var SELECTION_SCORE_METRICS_V2_ = Object.freeze([
  'colorIntent',
  'palette',
  'weather',
  'archetypeFit',
  'visualInterest',
  'wearability',
  'freshness',
  'silhouette',
  'formality'
]);

function ownSelectionKeyV2_(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function compareSelectionStringsV2_(left, right) {
  left = String(left);
  right = String(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

function validSelectionScoreV2_(score) {
  return Boolean(score) && typeof score === 'object' && !Array.isArray(score) &&
    typeof score.candidateId === 'string' && score.candidateId.length > 0 &&
    typeof score.disqualified === 'boolean' &&
    Array.isArray(score.criticalDefects) && Array.isArray(score.reservations) &&
    SELECTION_SCORE_METRICS_V2_.every(function(metric) {
      return typeof score[metric] === 'number' && Number.isFinite(score[metric]) &&
        score[metric] >= 0 && score[metric] <= 10;
    });
}

function validSelectionCandidateV2_(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
      typeof candidate.candidateId !== 'string' || !candidate.candidateId ||
      typeof candidate.archetype !== 'string' || !candidate.archetype ||
      typeof candidate.topId !== 'string' || !candidate.topId ||
      typeof candidate.bottomId !== 'string' || !candidate.bottomId ||
      typeof candidate.shoeId !== 'string' || !candidate.shoeId ||
      !Array.isArray(candidate.itemIds)) return false;
  if (candidate.layerId !== undefined && candidate.layerId !== null &&
      (typeof candidate.layerId !== 'string' || !candidate.layerId)) return false;
  var expected = [candidate.topId, candidate.bottomId, candidate.shoeId];
  if (candidate.layerId) expected.push(candidate.layerId);
  if (candidate.itemIds.length !== expected.length || candidate.itemIds.some(function(id) {
    return typeof id !== 'string' || !id;
  })) return false;
  var actual = candidate.itemIds.slice().sort();
  expected.sort();
  if (actual.join('|') !== expected.join('|')) return false;
  return new Set(candidate.itemIds).size === candidate.itemIds.length;
}

function compositeScoreV2_(score) {
  if (!validSelectionScoreV2_(score)) return -Infinity;
  return SELECTION_SCORE_METRICS_V2_.reduce(function(total, metric) {
    return total + score[metric] * DAILY_V2.COMPOSITE_WEIGHTS[metric];
  }, 0);
}

function selectionScoreIndexV2_(scores) {
  var byId = Object.create(null);
  var seen = Object.create(null);
  var invalid = Object.create(null);
  (Array.isArray(scores) ? scores : []).forEach(function(score) {
    if (!score || typeof score !== 'object' || Array.isArray(score) ||
        typeof score.candidateId !== 'string' || !score.candidateId) return;
    var id = score.candidateId;
    if (ownSelectionKeyV2_(seen, id)) {
      invalid[id] = true;
      delete byId[id];
      return;
    }
    seen[id] = true;
    if (validSelectionScoreV2_(score)) byId[id] = score;
    else invalid[id] = true;
  });
  return { byId: byId, invalid: invalid };
}

function selectionScoreMapV2_(scores) {
  return selectionScoreIndexV2_(scores).byId;
}

function selectionCandidateCountsV2_(groups) {
  var counts = Object.create(null);
  (groups || []).forEach(function(group) {
    (Array.isArray(group) ? group : []).forEach(function(candidate) {
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) &&
          typeof candidate.candidateId === 'string' && candidate.candidateId) {
        counts[candidate.candidateId] = (counts[candidate.candidateId] || 0) + 1;
      }
    });
  });
  return counts;
}

function candidateEligibilityErrorsV2_(candidate, score, snapshot, weather, history) {
  if (!validSelectionCandidateV2_(candidate)) return ['malformed candidate'];
  var errors = [];
  if (!validSelectionScoreV2_(score) || !criticScoreMeetsFinalFloorV2_(score)) {
    errors.push('critic score floors');
  }
  history = history && typeof history === 'object' && !Array.isArray(history) ? history : {};
  var historyKeys = exactHistoryKeysV2_(history);
  var historyKey = candidate.itemIds.slice().sort().join('|');
  if (ownSelectionKeyV2_(historyKeys, historyKey)) errors.push('prior-14-day exact repeat');
  if (savedOutfitNearCopyV2_(candidate.itemIds, snapshot)) errors.push('saved-outfit near-copy');
  var cooldown = new Set(Array.isArray(history.cooldownItemIds) ? history.cooldownItemIds : []);
  if (cooldown.has(candidate.topId) || cooldown.has(candidate.bottomId)) {
    errors.push('yesterday top/bottom cooldown');
  }
  var items = itemMapV2_(snapshot);
  return errors.concat(weatherSafetyErrorsV2_(candidate, items, weather || {}, snapshot || {}));
}

function eligibleReplanCandidatesV2_(eligibleByArchetype, scoreIndex) {
  var groups = DAILY_V2.ARCHETYPES.map(function(archetype) {
    var values = eligibleByArchetype && eligibleByArchetype[archetype];
    return Array.isArray(values) ? values : [];
  });
  var counts = selectionCandidateCountsV2_(groups);
  return DAILY_V2.ARCHETYPES.reduce(function(result, archetype, index) {
    result[archetype] = groups[index].filter(function(candidate) {
      return validSelectionCandidateV2_(candidate) && candidate.archetype === archetype &&
        counts[candidate.candidateId] === 1 && ownSelectionKeyV2_(scoreIndex.byId, candidate.candidateId);
    });
    return result;
  }, Object.create(null));
}

function chooseReplanArchetypeV2_(eligibleByArchetype, scores, excluded) {
  var scoreIndex = selectionScoreIndexV2_(scores);
  var eligible = eligibleReplanCandidatesV2_(eligibleByArchetype || {}, scoreIndex);
  var blocked = new Set(Array.isArray(excluded) ? excluded : []);
  var choices = DAILY_V2.ARCHETYPES.filter(function(archetype) {
    return !blocked.has(archetype);
  }).map(function(archetype, order) {
    var candidates = eligible[archetype];
    var best = candidates.reduce(function(value, candidate) {
      return Math.max(value, compositeScoreV2_(scoreIndex.byId[candidate.candidateId]));
    }, -Infinity);
    return { archetype: archetype, count: candidates.length, best: best, order: order };
  });
  choices.sort(function(left, right) {
    if (left.count !== right.count) return left.count - right.count;
    if (left.best !== right.best) return left.best - right.best;
    return left.order - right.order;
  });
  return choices.length ? choices[0].archetype : null;
}

function selectFinalistsV2_(candidates, scores, snapshot, weather, history) {
  candidates = Array.isArray(candidates) ? candidates : [];
  var scoreIndex = selectionScoreIndexV2_(scores);
  var candidateCounts = selectionCandidateCountsV2_([candidates]);
  var eligibleByArchetype = DAILY_V2.ARCHETYPES.reduce(function(result, archetype) {
    result[archetype] = [];
    return result;
  }, Object.create(null));
  var compositeById = Object.create(null);

  candidates.forEach(function(candidate) {
    if (!validSelectionCandidateV2_(candidate) || candidateCounts[candidate.candidateId] !== 1 ||
        DAILY_V2.ARCHETYPES.indexOf(candidate.archetype) < 0 ||
        !ownSelectionKeyV2_(scoreIndex.byId, candidate.candidateId)) return;
    var score = scoreIndex.byId[candidate.candidateId];
    compositeById[candidate.candidateId] = compositeScoreV2_(score);
    if (!candidateEligibilityErrorsV2_(candidate, score, snapshot, weather, history).length) {
      eligibleByArchetype[candidate.archetype].push(candidate);
    }
  });

  DAILY_V2.ARCHETYPES.forEach(function(archetype) {
    eligibleByArchetype[archetype].sort(function(left, right) {
      var compositeDelta = compositeById[right.candidateId] - compositeById[left.candidateId];
      if (compositeDelta) return compositeDelta;
      var scoreLeft = scoreIndex.byId[left.candidateId];
      var scoreRight = scoreIndex.byId[right.candidateId];
      if (scoreLeft.colorIntent !== scoreRight.colorIntent) {
        return scoreRight.colorIntent - scoreLeft.colorIntent;
      }
      return compareSelectionStringsV2_(left.candidateId, right.candidateId);
    });
  });

  var eligibleCountByArchetype = DAILY_V2.ARCHETYPES.reduce(function(result, archetype) {
    result[archetype] = eligibleByArchetype[archetype].length;
    return result;
  }, Object.create(null));
  var short = DAILY_V2.ARCHETYPES.some(function(archetype) {
    return eligibleCountByArchetype[archetype] < 2;
  });
  return {
    needsReplan: short ? chooseReplanArchetypeV2_(eligibleByArchetype, scores, []) : null,
    finalistPools: eligibleByArchetype,
    eligibleByArchetype: eligibleByArchetype,
    eligibleCountByArchetype: eligibleCountByArchetype,
    compositeById: compositeById
  };
}

function usableWeatherSafeShoeCountV2_(snapshot, weather) {
  var ids = new Set();
  var rainExpected = Boolean(weather && weather.rainExpected);
  (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).forEach(function(item) {
    var profile = item && item.profile;
    if (item && item.slot === 'shoes' && typeof item.id === 'string' && item.id &&
        profile && profile.available === true && profile.excludedFromDaily !== true &&
        (!rainExpected || profile.rainSafety !== 'poor')) ids.add(item.id);
  });
  return ids.size;
}

function credibleLayerCountV2_(snapshot) {
  var ids = new Set();
  (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).forEach(function(item) {
    var profile = item && item.profile;
    if (item && item.slot === 'layer' && typeof item.id === 'string' && item.id &&
        profile && profile.available === true && profile.excludedFromDaily !== true) ids.add(item.id);
  });
  return ids.size;
}

function candidateSetErrorsV2_(set, snapshot, weather) {
  var errors = [];
  if (!Array.isArray(set) || set.length !== DAILY_V2.ARCHETYPES.length) {
    return ['one candidate per archetype is required'];
  }
  var items = itemMapV2_(snapshot);
  var seenArchetypes = Object.create(null);
  var tops = [];
  var bottoms = [];
  var shoes = [];
  var layers = [];
  var stories = [];

  set.forEach(function(candidate) {
    if (!validSelectionCandidateV2_(candidate) ||
        DAILY_V2.ARCHETYPES.indexOf(candidate.archetype) < 0 ||
        ownSelectionKeyV2_(seenArchetypes, candidate.archetype)) {
      errors.push('one candidate per archetype is required');
      return;
    }
    seenArchetypes[candidate.archetype] = true;
    var top = items[candidate.topId];
    var bottom = items[candidate.bottomId];
    var shoe = items[candidate.shoeId];
    var layer = candidate.layerId ? items[candidate.layerId] : null;
    if (!top || top.slot !== 'top' || !bottom || bottom.slot !== 'bottom' ||
        !shoe || shoe.slot !== 'shoes' || (candidate.layerId && (!layer || layer.slot !== 'layer'))) {
      errors.push('candidate contains a missing or wrong-slot item');
      return;
    }
    tops.push(top.id);
    bottoms.push(bottom.id);
    shoes.push(shoe.id);
    if (layer) layers.push(layer.id);
    var topProfile = top.profile || {};
    var bottomProfile = bottom.profile || {};
    if (typeof topProfile.primaryColorFamily !== 'string' || typeof bottomProfile.primaryColorFamily !== 'string' ||
        typeof topProfile.silhouette !== 'string' || typeof bottomProfile.silhouette !== 'string') {
      errors.push('candidate lacks a deterministic diversity story');
    } else {
      stories.push(JSON.stringify([
        topProfile.primaryColorFamily,
        bottomProfile.primaryColorFamily,
        topProfile.silhouette,
        bottomProfile.silhouette
      ]));
    }
  });

  if (Object.keys(seenArchetypes).length !== DAILY_V2.ARCHETYPES.length) {
    errors.push('one candidate per archetype is required');
  }
  if (new Set(tops).size !== DAILY_V2.ARCHETYPES.length) errors.push('tops must be unique');
  if (new Set(bottoms).size !== DAILY_V2.ARCHETYPES.length) errors.push('bottoms must be unique');
  if (usableWeatherSafeShoeCountV2_(snapshot, weather) >= DAILY_V2.ARCHETYPES.length &&
      new Set(shoes).size !== DAILY_V2.ARCHETYPES.length) errors.push('shoes must be unique');
  if (new Set(stories).size !== DAILY_V2.ARCHETYPES.length) {
    errors.push('diversity stories must be distinct');
  }

  for (var left = 0; left < set.length; left += 1) {
    for (var right = left + 1; right < set.length; right += 1) {
      if (!validSelectionCandidateV2_(set[left]) || !validSelectionCandidateV2_(set[right])) continue;
      var rightItems = new Set(set[right].itemIds);
      var shared = set[left].itemIds.filter(function(id) { return rightItems.has(id); });
      if (shared.length > 1) errors.push('outfits share more than one item');
    }
  }

  var layerCounts = Object.create(null);
  layers.forEach(function(id) { layerCounts[id] = (layerCounts[id] || 0) + 1; });
  Object.keys(layerCounts).forEach(function(id) {
    if (layerCounts[id] > 1 &&
        (!(weather && weather.layerGuidance === 'required') || credibleLayerCountV2_(snapshot) >= 2)) {
      errors.push('layer repeat is not permitted');
    }
  });
  return Array.from(new Set(errors));
}

function normalizeFinalistPoolsV2_(pools, scoreIndex) {
  var groups = DAILY_V2.ARCHETYPES.map(function(archetype) {
    var values = pools && pools[archetype];
    return Array.isArray(values) ? values : [];
  });
  var counts = selectionCandidateCountsV2_(groups);
  return DAILY_V2.ARCHETYPES.reduce(function(result, archetype, index) {
    result[archetype] = groups[index].filter(function(candidate) {
      return validSelectionCandidateV2_(candidate) && candidate.archetype === archetype &&
        counts[candidate.candidateId] === 1 && ownSelectionKeyV2_(scoreIndex.byId, candidate.candidateId);
    });
    return result;
  }, Object.create(null));
}

function enumerateCandidateSetsV2_(pools, size) {
  var easy = (pools.easy || []).slice(0, size);
  var polished = (pools['polished-casual'] || []).slice(0, size);
  var expressive = (pools.expressive || []).slice(0, size);
  var sets = [];
  easy.forEach(function(easyCandidate) {
    polished.forEach(function(polishedCandidate) {
      expressive.forEach(function(expressiveCandidate) {
        sets.push([easyCandidate, polishedCandidate, expressiveCandidate]);
      });
    });
  });
  return sets;
}

function rankCandidateSetsV2_(sets, scores) {
  var scoreMap = selectionScoreMapV2_(scores);
  return (Array.isArray(sets) ? sets : []).slice().sort(function(left, right) {
    var compositesLeft = left.map(function(candidate) {
      return compositeScoreV2_(scoreMap[candidate.candidateId]);
    });
    var compositesRight = right.map(function(candidate) {
      return compositeScoreV2_(scoreMap[candidate.candidateId]);
    });
    var sumLeft = compositesLeft.reduce(function(sum, value) { return sum + value; }, 0);
    var sumRight = compositesRight.reduce(function(sum, value) { return sum + value; }, 0);
    if (sumLeft !== sumRight) return sumRight - sumLeft;
    var weakestLeft = Math.min.apply(null, compositesLeft);
    var weakestRight = Math.min.apply(null, compositesRight);
    if (weakestLeft !== weakestRight) return weakestRight - weakestLeft;
    var colorLeft = left.reduce(function(sum, candidate) {
      return sum + scoreMap[candidate.candidateId].colorIntent;
    }, 0);
    var colorRight = right.reduce(function(sum, candidate) {
      return sum + scoreMap[candidate.candidateId].colorIntent;
    }, 0);
    if (colorLeft !== colorRight) return colorRight - colorLeft;
    return compareSelectionStringsV2_(
      left.map(function(candidate) { return candidate.candidateId; }).join('|'),
      right.map(function(candidate) { return candidate.candidateId; }).join('|')
    );
  });
}

function selectFinalSetV2_(finalistPools, scores, snapshot, weather) {
  var scoreIndex = selectionScoreIndexV2_(scores);
  var pools = normalizeFinalistPoolsV2_(finalistPools || {}, scoreIndex);
  for (var size = 2; size <= 3; size += 1) {
    var feasible = enumerateCandidateSetsV2_(pools, size).filter(function(set) {
      return candidateSetErrorsV2_(set, snapshot, weather).length === 0;
    });
    if (feasible.length) {
      var ranked = rankCandidateSetsV2_(feasible, scores);
      return {
        selectedCandidates: ranked[0],
        path: size === 2 ? 'top2' : 'top3',
        feasibleSetCount: feasible.length,
        needsReplan: null
      };
    }
  }
  return {
    selectedCandidates: null,
    path: 'top3',
    feasibleSetCount: 0,
    needsReplan: chooseReplanArchetypeV2_(pools, scores, [])
  };
}

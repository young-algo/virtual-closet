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

function canonicalSelectionIdListV2_(ids) {
  if (!Array.isArray(ids) || ids.some(function(id) {
    return typeof id !== 'string' || !id;
  })) return null;
  return JSON.stringify(ids.slice().sort(compareSelectionStringsV2_));
}

function selectionExactHistoryKeysV2_(history) {
  var keys = Object.create(null);
  var entries = history && Array.isArray(history.exactOutfitsPrevious14Days)
    ? history.exactOutfitsPrevious14Days
    : [];
  entries.forEach(function(entry) {
    var key = canonicalSelectionIdListV2_(entry && entry.itemIds);
    if (key !== null) keys[key] = true;
  });
  return keys;
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
  if (canonicalSelectionIdListV2_(candidate.itemIds) !== canonicalSelectionIdListV2_(expected)) return false;
  return new Set(candidate.itemIds).size === candidate.itemIds.length;
}

function validSelectionProfileNumberV2_(profile, key) {
  return typeof profile[key] === 'number' && Number.isFinite(profile[key]);
}

function validSelectionProfileStringV2_(profile, key) {
  return typeof profile[key] === 'string' && profile[key].length > 0;
}

function validSelectionItemProfileV2_(slot, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
  if (slot === 'top') {
    return validSelectionProfileNumberV2_(profile, 'warmth') &&
      validSelectionProfileNumberV2_(profile, 'breathability') &&
      validSelectionProfileStringV2_(profile, 'primaryColorFamily') &&
      validSelectionProfileStringV2_(profile, 'silhouette');
  }
  if (slot === 'bottom') {
    return validSelectionProfileStringV2_(profile, 'primaryColorFamily') &&
      validSelectionProfileStringV2_(profile, 'silhouette');
  }
  if (slot === 'shoes') return validSelectionProfileStringV2_(profile, 'rainSafety');
  if (slot === 'layer') return validSelectionProfileNumberV2_(profile, 'warmth');
  return false;
}

function selectionInventoryIndexV2_(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.items)) return null;
  var byId = Object.create(null);
  var duplicates = Object.create(null);
  snapshot.items.forEach(function(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.id !== 'string' || !item.id) return;
    if (ownSelectionKeyV2_(byId, item.id) || ownSelectionKeyV2_(duplicates, item.id)) {
      duplicates[item.id] = true;
      delete byId[item.id];
      return;
    }
    byId[item.id] = item;
  });
  return byId;
}

function selectionCandidateInventoryV2_(candidate, snapshot) {
  if (!validSelectionCandidateV2_(candidate)) return null;
  var items = selectionInventoryIndexV2_(snapshot);
  if (!items) return null;
  var required = [
    { key: 'topId', slot: 'top' },
    { key: 'bottomId', slot: 'bottom' },
    { key: 'shoeId', slot: 'shoes' }
  ];
  if (candidate.layerId) required.push({ key: 'layerId', slot: 'layer' });
  var resolved = { itemMap: items, top: null, bottom: null, shoe: null, layer: null };
  for (var index = 0; index < required.length; index += 1) {
    var reference = required[index];
    var item = items[candidate[reference.key]];
    if (!item || item.slot !== reference.slot || !validSelectionItemProfileV2_(reference.slot, item.profile)) {
      return null;
    }
    if (reference.slot === 'shoes') resolved.shoe = item;
    else resolved[reference.slot] = item;
  }
  return resolved;
}

function safeSelectionSnapshotV2_(snapshot) {
  return Object.assign({}, snapshot, {
    items: (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).filter(function(item) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      return item.slot !== 'shoes' || validSelectionItemProfileV2_('shoes', item.profile);
    }),
    tasteExamples: (snapshot && Array.isArray(snapshot.tasteExamples) ? snapshot.tasteExamples : []).filter(function(outfit) {
      return outfit && typeof outfit === 'object' && !Array.isArray(outfit) && Array.isArray(outfit.itemIds);
    })
  });
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
  var historyKeys = selectionExactHistoryKeysV2_(history);
  var historyKey = canonicalSelectionIdListV2_(candidate.itemIds);
  if (ownSelectionKeyV2_(historyKeys, historyKey)) errors.push('prior-14-day exact repeat');
  var inventory = selectionCandidateInventoryV2_(candidate, snapshot);
  if (!inventory) {
    errors.push('candidate contains missing, wrong-slot, or incomplete-profile inventory');
    return errors;
  }
  var safeSnapshot = safeSelectionSnapshotV2_(snapshot);
  if (savedOutfitNearCopyV2_(candidate.itemIds, safeSnapshot)) errors.push('saved-outfit near-copy');
  var cooldown = new Set(Array.isArray(history.cooldownItemIds) ? history.cooldownItemIds : []);
  if (cooldown.has(candidate.topId) || cooldown.has(candidate.bottomId)) {
    errors.push('yesterday top/bottom cooldown');
  }
  return errors.concat(weatherSafetyErrorsV2_(candidate, inventory.itemMap, weather || {}, safeSnapshot));
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
        validSelectionProfileStringV2_(profile, 'rainSafety') &&
        (!rainExpected || profile.rainSafety !== 'poor')) ids.add(item.id);
  });
  return ids.size;
}

function credibleLayerCountV2_(snapshot) {
  var ids = new Set();
  (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).forEach(function(item) {
    var profile = item && item.profile;
    if (item && item.slot === 'layer' && typeof item.id === 'string' && item.id &&
        profile && profile.available === true && profile.excludedFromDaily !== true &&
        validSelectionProfileNumberV2_(profile, 'warmth')) ids.add(item.id);
  });
  return ids.size;
}

function candidateSetErrorsV2_(set, snapshot, weather) {
  var errors = [];
  if (!Array.isArray(set) || set.length !== DAILY_V2.ARCHETYPES.length) {
    return ['one candidate per archetype is required'];
  }
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
    var inventory = selectionCandidateInventoryV2_(candidate, snapshot);
    if (!inventory) {
      errors.push('candidate contains missing, wrong-slot, or incomplete-profile inventory');
      return;
    }
    var top = inventory.top;
    var bottom = inventory.bottom;
    var shoe = inventory.shoe;
    var layer = inventory.layer;
    tops.push(top.id);
    bottoms.push(bottom.id);
    shoes.push(shoe.id);
    if (layer) layers.push(layer.id);
    stories.push(JSON.stringify([
      top.profile.primaryColorFamily,
      bottom.profile.primaryColorFamily,
      top.profile.silhouette,
      bottom.profile.silhouette
    ]));
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
      JSON.stringify(left.map(function(candidate) { return candidate.candidateId; })),
      JSON.stringify(right.map(function(candidate) { return candidate.candidateId; }))
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

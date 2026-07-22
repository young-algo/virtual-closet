function shoeRotationCalendarOrdinalV2_(value) {
  if (typeof value !== 'string') return null;
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var stamp = Date.UTC(year, month - 1, day);
  var parsed = new Date(stamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day) return null;
  return Math.floor(stamp / 86400000);
}

function shoeRotationAvailableShoeIdsV2_(snapshot) {
  var seen = Object.create(null);
  return (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).reduce(function(ids, item) {
    var profile = item && item.profile;
    if (!item || item.slot !== 'shoes' || typeof item.id !== 'string' || !item.id ||
        Object.prototype.hasOwnProperty.call(seen, item.id) || !profile ||
        profile.available !== true || profile.excludedFromDaily === true) return ids;
    seen[item.id] = true;
    ids.push(item.id);
    return ids;
  }, []).sort();
}

function shoeRotationExposureRecordsV2_(history) {
  if (Array.isArray(history)) {
    return history.flatMap(function(entry) {
      if (!entry || typeof entry.localDate !== 'string') return [];
      var looks = (Array.isArray(entry.recommendations) ? entry.recommendations : [])
        .concat(entry.encore && typeof entry.encore === 'object' ? [entry.encore] : []);
      return looks.map(function(look) {
        return { localDate: entry.localDate, itemIds: Array.isArray(look.itemIds) ? look.itemIds.slice() : [] };
      });
    });
  }
  return (history && Array.isArray(history.exactOutfitsPrevious14Days)
    ? history.exactOutfitsPrevious14Days
    : []).map(function(entry) {
      return {
        localDate: entry && entry.localDate,
        itemIds: entry && Array.isArray(entry.itemIds) ? entry.itemIds.slice() : []
      };
    });
}

function shoeRotationStableHashV2_(value) {
  var hash = 2166136261;
  for (var index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shoeRotationSeededPickV2_(ids, localDate, wardrobeFingerprint) {
  if (!ids.length) return null;
  var sorted = ids.slice().sort();
  var seed = [localDate, wardrobeFingerprint || '', sorted.join('|')].join('|');
  return sorted[shoeRotationStableHashV2_(seed) % sorted.length];
}

function shoeRotationContextV2_(snapshot, localDate, history) {
  var currentOrdinal = shoeRotationCalendarOrdinalV2_(localDate);
  if (currentOrdinal === null) throw new Error('Invalid local date for shoe rotation');
  var available = shoeRotationAvailableShoeIdsV2_(snapshot);
  if (!available.length) throw new Error('No available daily shoes');
  var availableSet = new Set(available);
  var itemSlots = Object.create(null);
  (snapshot.items || []).forEach(function(item) {
    if (item && typeof item.id === 'string') itemSlots[item.id] = item.slot;
  });
  var lastDateById = Object.create(null);
  shoeRotationExposureRecordsV2_(history).forEach(function(entry) {
    var ordinal = shoeRotationCalendarOrdinalV2_(entry.localDate);
    var age = ordinal === null ? null : currentOrdinal - ordinal;
    if (age === null || age < 1 || age > 7) return;
    entry.itemIds.forEach(function(id) {
      if (!availableSet.has(id) || itemSlots[id] !== 'shoes') return;
      if (!lastDateById[id] || entry.localDate > lastDateById[id]) lastDateById[id] = entry.localDate;
    });
  });
  var recent = available.filter(function(id) { return Boolean(lastDateById[id]); });
  var fresh = available.filter(function(id) { return !lastDateById[id]; });
  var target = Math.min(3, available.length);
  var anchorPool = fresh.slice();
  if (!anchorPool.length) {
    var oldestDate = recent.reduce(function(oldest, id) {
      return oldest === null || lastDateById[id] < oldest ? lastDateById[id] : oldest;
    }, null);
    anchorPool = recent.filter(function(id) { return lastDateById[id] === oldestDate; });
  }
  var anchor = shoeRotationSeededPickV2_(anchorPool, localDate, snapshot.wardrobeFingerprint);
  var allowed = fresh.slice();
  if (!allowed.length) allowed.push(anchor);
  if (allowed.length < target) {
    recent.slice().sort(function(left, right) {
      if (lastDateById[left] !== lastDateById[right]) {
        return lastDateById[left] < lastDateById[right] ? -1 : 1;
      }
      return left < right ? -1 : left > right ? 1 : 0;
    }).some(function(id) {
      if (allowed.indexOf(id) >= 0) return false;
      allowed.push(id);
      return allowed.length >= target;
    });
  }
  var allowedSet = new Set(allowed);
  return {
    availableShoeIds: available,
    recentShoeIds: recent,
    freshShoeIds: fresh,
    allowedGeneratedShoeIds: allowed,
    blockedGeneratedShoeIds: available.filter(function(id) { return !allowedSet.has(id); }),
    easyAnchorShoeId: anchor,
    fallbackUsed: allowed.length > fresh.length,
    lastRecommendedDateById: lastDateById
  };
}

function shoeRotationModelViewV2_(rotation, snapshot) {
  var label = function(id) { return labelForItemIdV2_(id, snapshot); };
  return {
    easyAnchorLabel: label(rotation.easyAnchorShoeId),
    allowedShoeLabels: rotation.allowedGeneratedShoeIds.map(label).filter(Boolean),
    blockedShoeLabels: rotation.blockedGeneratedShoeIds.map(label).filter(Boolean)
  };
}

function modelWeatherViewForOutfitModelsV2_(weather) {
  var view = modelWeatherViewV2_(weather);
  if (!view || typeof view.plainEnglishSummary !== 'string') return view;
  var summary = view.plainEnglishSummary;
  var terminal = summary.match(/[.!?]\s*$/);
  var clauses = summary.split(/\s*;\s*/).filter(function(clause) {
    return !/\b(?:footwear|shoe|shoes|sneaker|sneakers)\b/i.test(clause);
  });
  view.plainEnglishSummary = clauses.join('; ').trim();
  if (view.plainEnglishSummary && terminal && !/[.!?]\s*$/.test(view.plainEnglishSummary)) {
    view.plainEnglishSummary += terminal[0].trim();
  }
  return view;
}

function shoeRotationDiagnosticSummaryV2_(rotation, snapshot) {
  return {
    easyAnchorLabel: labelForItemIdV2_(rotation.easyAnchorShoeId, snapshot),
    availableShoeCount: rotation.availableShoeIds.length,
    freshShoeCount: rotation.freshShoeIds.length,
    coolingDownShoeCount: rotation.recentShoeIds.length,
    allowedGeneratedShoeCount: rotation.allowedGeneratedShoeIds.length,
    fallbackUsed: rotation.fallbackUsed
  };
}

function shoeIdFromItemIdsV2_(itemIds, snapshot) {
  var itemMap = Object.create(null);
  (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []).forEach(function(item) {
    if (item && typeof item.id === 'string') itemMap[item.id] = item;
  });
  var shoes = (Array.isArray(itemIds) ? itemIds : []).filter(function(id) {
    return itemMap[id] && itemMap[id].slot === 'shoes';
  });
  return shoes.length === 1 ? shoes[0] : null;
}

function ownEncoreKeyV2_(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function validEncoreRecordV2_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (var key in value) {
    if (!ownEncoreKeyV2_(value, key)) return false;
  }
  return true;
}

function validEncoreArrayV2_(value) {
  if (!Array.isArray(value)) return false;
  for (var key in value) {
    if (!ownEncoreKeyV2_(value, key) || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return false;
  }
  for (var index = 0; index < value.length; index += 1) {
    if (!ownEncoreKeyV2_(value, index)) return false;
  }
  return true;
}

function encoreCalendarOrdinalV2_(value) {
  if (typeof value !== 'string') return null;
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var stamp = Date.UTC(year, month - 1, day);
  var parsed = new Date(stamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return Math.floor(stamp / (24 * 60 * 60 * 1000));
}

function encoreDayDistanceV2_(fromDate, toDate, _timezone) {
  if (fromDate === null || fromDate === undefined || fromDate === '') return Infinity;
  var fromOrdinal = encoreCalendarOrdinalV2_(fromDate);
  var toOrdinal = encoreCalendarOrdinalV2_(toDate);
  if (fromOrdinal === null || toOrdinal === null) return null;
  return toOrdinal - fromOrdinal;
}

function encoreInventoryIndexV2_(snapshot) {
  if (!validEncoreRecordV2_(snapshot) || !ownEncoreKeyV2_(snapshot, 'items') || !validEncoreArrayV2_(snapshot.items)) return null;
  var map = Object.create(null);
  for (var index = 0; index < snapshot.items.length; index += 1) {
    var item = snapshot.items[index];
    if (!validEncoreRecordV2_(item) || !ownEncoreKeyV2_(item, 'id') || typeof item.id !== 'string' || !item.id ||
        !ownEncoreKeyV2_(item, 'slot') || ['top', 'bottom', 'layer', 'shoes'].indexOf(item.slot) < 0 ||
        !ownEncoreKeyV2_(item, 'profile') || ownEncoreKeyV2_(map, item.id)) return null;
    map[item.id] = item;
  }
  return map;
}

function validEncoreWeatherV2_(weather) {
  return validEncoreRecordV2_(weather) && ownEncoreKeyV2_(weather, 'localDate') &&
    encoreCalendarOrdinalV2_(weather.localDate) !== null && ownEncoreKeyV2_(weather, 'rainExpected') &&
    typeof weather.rainExpected === 'boolean' &&
    ['morningFeelsLikeF', 'middayFeelsLikeF', 'eveningFeelsLikeF'].every(function(key) {
      return ownEncoreKeyV2_(weather, key) && typeof weather[key] === 'number' && Number.isFinite(weather[key]);
    });
}

function validEncoreProfileV2_(item) {
  if (!validEncoreRecordV2_(item.profile) || !ownEncoreKeyV2_(item.profile, 'available') ||
      item.profile.available !== true || !ownEncoreKeyV2_(item.profile, 'excludedFromDaily') ||
      item.profile.excludedFromDaily !== false) return false;
  if (item.slot === 'top' || item.slot === 'layer') {
    if (!ownEncoreKeyV2_(item.profile, 'warmth') || typeof item.profile.warmth !== 'number' ||
        !Number.isFinite(item.profile.warmth) || !ownEncoreKeyV2_(item.profile, 'breathability') ||
        typeof item.profile.breathability !== 'number' || !Number.isFinite(item.profile.breathability)) return false;
  }
  if (item.slot === 'bottom' && (!ownEncoreKeyV2_(item, 'category') || typeof item.category !== 'string')) return false;
  if (item.slot === 'shoes' && (!ownEncoreKeyV2_(item.profile, 'rainSafety') ||
      ['good', 'poor', 'unknown'].indexOf(item.profile.rainSafety) < 0)) return false;
  return true;
}

function encoreOutfitIdCountsV2_(snapshot) {
  if (!validEncoreRecordV2_(snapshot) || !ownEncoreKeyV2_(snapshot, 'tasteExamples') ||
      !validEncoreArrayV2_(snapshot.tasteExamples)) return null;
  var counts = Object.create(null);
  snapshot.tasteExamples.forEach(function(outfit) {
    if (!validEncoreRecordV2_(outfit) || !ownEncoreKeyV2_(outfit, 'id') || typeof outfit.id !== 'string' || !outfit.id) return;
    counts[outfit.id] = (ownEncoreKeyV2_(counts, outfit.id) ? counts[outfit.id] : 0) + 1;
  });
  return counts;
}

function validEncoreSavedOutfitV2_(outfit, snapshot, itemMap, outfitIdCounts, weather) {
  if (!validEncoreRecordV2_(outfit) || !ownEncoreKeyV2_(outfit, 'id') || typeof outfit.id !== 'string' || !outfit.id ||
      !ownEncoreKeyV2_(outfit, 'name') || typeof outfit.name !== 'string' || !outfit.name ||
      !ownEncoreKeyV2_(outfit, 'createdAt') || typeof outfit.createdAt !== 'number' ||
      !Number.isFinite(outfit.createdAt) || outfit.createdAt < 0 ||
      !ownEncoreKeyV2_(outfitIdCounts, outfit.id) || outfitIdCounts[outfit.id] !== 1 ||
      !ownEncoreKeyV2_(outfit, 'itemIds') || !validEncoreArrayV2_(outfit.itemIds) ||
      (ownEncoreKeyV2_(outfit, 'source') && outfit.source !== undefined && outfit.source !== 'ai')) return false;
  if (outfit.source === 'ai' || outfit.itemIds.length < 3 || outfit.itemIds.length > 4) return false;

  var seen = Object.create(null);
  var slotCounts = { top: 0, bottom: 0, layer: 0, shoes: 0 };
  for (var index = 0; index < outfit.itemIds.length; index += 1) {
    var id = outfit.itemIds[index];
    if (typeof id !== 'string' || !id || ownEncoreKeyV2_(seen, id) || !ownEncoreKeyV2_(itemMap, id)) return false;
    var item = itemMap[id];
    if (!validEncoreProfileV2_(item)) return false;
    seen[id] = true;
    slotCounts[item.slot] += 1;
  }
  if (slotCounts.top !== 1 || slotCounts.bottom !== 1 || slotCounts.shoes !== 1 || slotCounts.layer > 1) return false;
  return weatherSafetyErrorsV2_({ itemIds: outfit.itemIds.slice() }, itemMap, weather, snapshot).length === 0;
}

function encoreCoreKeyV2_(itemIds, snapshot) {
  if (!validEncoreArrayV2_(itemIds)) return null;
  var itemMap = itemMapV2_(snapshot);
  var core = Object.create(null);
  var slots = Object.create(null);
  for (var index = 0; index < itemIds.length; index += 1) {
    var id = itemIds[index];
    if (typeof id !== 'string' || !id || !ownEncoreKeyV2_(itemMap, id)) continue;
    var item = itemMap[id];
    if (item.slot !== 'top' && item.slot !== 'bottom' && item.slot !== 'shoes') continue;
    if (ownEncoreKeyV2_(core, id) || ownEncoreKeyV2_(slots, item.slot)) return null;
    core[id] = true;
    slots[item.slot] = true;
  }
  if (!ownEncoreKeyV2_(slots, 'top') || !ownEncoreKeyV2_(slots, 'bottom') ||
      !ownEncoreKeyV2_(slots, 'shoes') || Object.keys(core).length !== 3) return null;
  return Object.keys(core).sort().join('|');
}

function encoreHistoryLooksV2_(entry) {
  if (!validEncoreRecordV2_(entry)) return [];
  var normalized = {
    recommendations: ownEncoreKeyV2_(entry, 'recommendations') && validEncoreArrayV2_(entry.recommendations)
      ? entry.recommendations
      : []
  };
  if (ownEncoreKeyV2_(entry, 'encore') && validEncoreRecordV2_(entry.encore)) normalized.encore = entry.encore;
  return historyLooksV2_(normalized);
}

function encoreHistoricalEntriesV2_(history, localDate) {
  if (!validEncoreArrayV2_(history)) return null;
  var currentOrdinal = encoreCalendarOrdinalV2_(localDate);
  if (currentOrdinal === null) return null;
  return history.filter(function(entry) {
    if (!validEncoreRecordV2_(entry) || !ownEncoreKeyV2_(entry, 'localDate')) return false;
    var ordinal = encoreCalendarOrdinalV2_(entry.localDate);
    return ordinal !== null && ordinal <= currentOrdinal;
  });
}

function encoreLastSurfacedDateV2_(outfitId, history) {
  var dates = [];
  history.forEach(function(entry) {
    if (!ownEncoreKeyV2_(entry, 'encore') || !validEncoreRecordV2_(entry.encore)) return;
    if ((ownEncoreKeyV2_(entry.encore, 'outfitId') && entry.encore.outfitId === outfitId) ||
        (ownEncoreKeyV2_(entry.encore, 'candidateId') && entry.encore.candidateId === 'encore:' + outfitId)) dates.push(entry.localDate);
  });
  dates.sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function selectEncoreV2_(snapshot, weather, history, lastEncoreDate) {
  try {
    if (!validEncoreRecordV2_(snapshot) || !validEncoreWeatherV2_(weather) ||
        !validEncoreArrayV2_(snapshot.tasteExamples) || !validEncoreArrayV2_(history)) return null;
    var itemMap = encoreInventoryIndexV2_(snapshot);
    var outfitIdCounts = encoreOutfitIdCountsV2_(snapshot);
    if (!itemMap || !outfitIdCounts) return null;

    var timezone = snapshot.settings && typeof snapshot.settings.timezone === 'string' && snapshot.settings.timezone
      ? snapshot.settings.timezone
      : 'America/New_York';
    var cadence = encoreDayDistanceV2_(lastEncoreDate, weather.localDate, timezone);
    if (cadence === null || cadence < 7) return null;

    var retained = encoreHistoricalEntriesV2_(history, weather.localDate);
    if (!retained) return null;
    var recentCoreKeys = Object.create(null);
    retained.forEach(function(entry) {
      var age = encoreDayDistanceV2_(entry.localDate, weather.localDate, timezone);
      if (age === null || age < 0 || age > 30) return;
      encoreHistoryLooksV2_(entry).forEach(function(look) {
        if (!validEncoreRecordV2_(look) || !ownEncoreKeyV2_(look, 'itemIds') || !validEncoreArrayV2_(look.itemIds)) return;
        var key = encoreCoreKeyV2_(look.itemIds, snapshot);
        if (key) recentCoreKeys[key] = true;
      });
    });

    var eligible = snapshot.tasteExamples.filter(function(outfit) {
      if (!validEncoreSavedOutfitV2_(outfit, snapshot, itemMap, outfitIdCounts, weather)) return false;
      var coreKey = encoreCoreKeyV2_(outfit.itemIds, snapshot);
      if (!coreKey || ownEncoreKeyV2_(recentCoreKeys, coreKey)) return false;
      var candidateId = 'encore:' + outfit.id;
      var disliked = retained.some(function(entry) {
        if (!ownEncoreKeyV2_(entry, 'feedback') || !validEncoreArrayV2_(entry.feedback)) return false;
        return entry.feedback.some(function(signal) {
          return validEncoreRecordV2_(signal) && ownEncoreKeyV2_(signal, 'candidateId') &&
            ownEncoreKeyV2_(signal, 'value') && signal.candidateId === candidateId && signal.value === 'disliked';
        });
      });
      return !disliked;
    }).map(function(outfit) {
      return { outfit: outfit, lastSurfaced: encoreLastSurfacedDateV2_(outfit.id, retained) };
    });

    eligible.sort(function(left, right) {
      if (left.lastSurfaced === null && right.lastSurfaced !== null) return -1;
      if (left.lastSurfaced !== null && right.lastSurfaced === null) return 1;
      if (left.lastSurfaced !== right.lastSurfaced) return left.lastSurfaced < right.lastSurfaced ? -1 : 1;
      if (left.outfit.createdAt !== right.outfit.createdAt) return left.outfit.createdAt - right.outfit.createdAt;
      if (left.outfit.id === right.outfit.id) return 0;
      return left.outfit.id < right.outfit.id ? -1 : 1;
    });
    if (!eligible.length) return null;
    var chosen = eligible[0].outfit;
    return {
      outfitId: chosen.id,
      name: chosen.name,
      itemIds: chosen.itemIds.slice(),
      candidateId: 'encore:' + chosen.id
    };
  } catch (_ignored) {
    return null;
  }
}

function selectEncoreForBundleV2_(snapshot, weather, history) {
  try {
    var retained = Array.isArray(history) ? history : loadHistoryV2_();
    var lastEncoreDate = getDailyPropertiesV2_().getProperty('LAST_ENCORE_DATE_V2');
    return selectEncoreV2_(snapshot, weather, retained, lastEncoreDate);
  } catch (_ignored) {
    return null;
  }
}

function validPersistedEncoreV2_(encore, snapshot, weather) {
  if (!validEncoreRecordV2_(encore) || !ownEncoreKeyV2_(encore, 'outfitId') ||
      typeof encore.outfitId !== 'string' || !encore.outfitId || !ownEncoreKeyV2_(encore, 'name') ||
      typeof encore.name !== 'string' || !encore.name || !ownEncoreKeyV2_(encore, 'candidateId') ||
      encore.candidateId !== 'encore:' + encore.outfitId || !ownEncoreKeyV2_(encore, 'itemIds') ||
      !validEncoreArrayV2_(encore.itemIds) ||
      !validEncoreWeatherV2_(weather)) return false;
  var itemMap = encoreInventoryIndexV2_(snapshot);
  var outfitIdCounts = encoreOutfitIdCountsV2_(snapshot);
  if (!itemMap || !outfitIdCounts) return false;
  var matching = snapshot.tasteExamples.filter(function(outfit) { return outfit && outfit.id === encore.outfitId; });
  if (matching.length !== 1 || !validEncoreSavedOutfitV2_(matching[0], snapshot, itemMap, outfitIdCounts, weather)) return false;
  return matching[0].name === encore.name && JSON.stringify(matching[0].itemIds) === JSON.stringify(encore.itemIds);
}

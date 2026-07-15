function coreTasteItemIdsV2_(itemIds, snapshot) {
  var items = itemMapV2_(snapshot);
  var seen = {};
  return (itemIds || []).filter(function(id) {
    var item = items[id];
    if (!item || seen[id] || (item.slot !== 'top' && item.slot !== 'bottom' && item.slot !== 'shoes')) return false;
    seen[id] = true;
    return true;
  });
}

function savedTasteSignaturesV2_(snapshot) {
  return (snapshot.tasteExamples || []).filter(function(outfit) {
    return outfit.seedStylist !== false;
  }).map(function(outfit) {
    return {
      id: outfit.id,
      name: outfit.name,
      source: outfit.source || 'manual',
      weight: outfit.source === 'ai' ? 0.3 : 1,
      itemIds: (outfit.itemIds || []).slice(),
      coreItemIds: coreTasteItemIdsV2_(outfit.itemIds, snapshot),
      note: outfit.note || null
    };
  }).filter(function(outfit) { return outfit.coreItemIds.length >= 2; });
}

function savedOutfitNearCopyV2_(itemIds, snapshot) {
  var coreIds = coreTasteItemIdsV2_(itemIds, snapshot);
  var matches = savedTasteSignaturesV2_(snapshot).map(function(saved) {
    var sharedCoreItemIds = coreIds.filter(function(id) { return saved.coreItemIds.indexOf(id) >= 0; });
    return Object.assign({}, saved, { sharedCoreItemIds: sharedCoreItemIds });
  }).filter(function(saved) { return saved.sharedCoreItemIds.length >= 2; });
  return matches.length ? matches[0] : null;
}

function buildTasteSummaryV2_(snapshot) {
  var items = itemMapV2_(snapshot);
  return savedTasteSignaturesV2_(snapshot).map(function(outfit) {
    return {
      id: outfit.id,
      name: outfit.name,
      source: outfit.source,
      weight: outfit.weight,
      itemLabels: outfit.itemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }),
      coreItemLabels: outfit.coreItemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }),
      note: outfit.note,
      pieces: outfit.itemIds.map(function(id) { return items[id]; }).filter(Boolean).map(function(item) {
        return item.shortLabel + ' ' + item.brand + ' ' + item.name + ' (' + item.slot + ', ' + item.color + ')';
      })
    };
  }).filter(function(example) { return example.pieces.length >= 2; }).slice(-12);
}

function dailyHistoryContextV2_(localDate) {
  var history = loadHistoryV2_().filter(function(entry) { return entry.localDate < localDate; });
  var last14 = history.slice(-14);
  var last7 = history.slice(-7);
  var counts = {};
  last7.forEach(function(entry) {
    (entry.recommendations || []).forEach(function(rec) {
      rec.itemIds.forEach(function(id) { counts[id] = (counts[id] || 0) + 1; });
    });
  });
  return {
    exactOutfitsPrevious14Days: last14.flatMap(function(entry) {
      return (entry.recommendations || []).map(function(rec) { return { localDate: entry.localDate, itemIds: rec.itemIds.slice().sort(), archetype: rec.archetype }; });
    }),
    itemUsagePrevious7Days: counts,
    feedback: last14.flatMap(function(entry) { return entry.feedback || []; }).filter(function(entry) { return entry.value === 'disliked' || entry.value === 'wore'; })
  };
}

function mergeSnapshotFeedbackIntoHistoryV2_(snapshot) {
  var history = loadHistoryV2_();
  var changed = false;
  (snapshot.dailyFeedback || []).forEach(function(feedback) {
    var entry = history.find(function(value) { return value.localDate === feedback.localDate; });
    if (!entry) return;
    var before = entry.feedback || [];
    var matching = before.filter(function(value) { return value.candidateId === feedback.candidateId; });
    if (matching.length === 1 && JSON.stringify(matching[0]) === JSON.stringify(feedback)) return;
    var after = before.filter(function(value) { return value.candidateId !== feedback.candidateId; });
    after.push(feedback);
    entry.feedback = after;
    changed = true;
  });
  if (changed) saveHistoryV2_(history);
  return changed;
}

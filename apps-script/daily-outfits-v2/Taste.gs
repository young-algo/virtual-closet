function coreTasteItemIdsV2_(itemIds, snapshot) {
  var items = itemMapV2_(snapshot);
  var seen = Object.create(null);
  return (itemIds || []).filter(function(id) {
    var item = items[id];
    if (!item || seen[id] || (item.slot !== 'top' && item.slot !== 'bottom' && item.slot !== 'shoes')) return false;
    seen[id] = true;
    return true;
  });
}

function normalizedTasteSourceV2_(outfit) {
  return outfit && outfit.source === 'ai' ? 'ai' : 'manual';
}

function tasteEvidenceV2_(snapshot) {
  return (snapshot.tasteExamples || []).filter(function(outfit) {
    return outfit.seedStylist !== false;
  }).map(function(outfit) {
    var source = normalizedTasteSourceV2_(outfit);
    return {
      id: outfit.id,
      name: outfit.name,
      source: source,
      weight: source === 'ai' ? 0.3 : 1,
      itemIds: (outfit.itemIds || []).slice(),
      coreItemIds: coreTasteItemIdsV2_(outfit.itemIds, snapshot),
      note: outfit.note || null
    };
  }).filter(function(outfit) { return outfit.coreItemIds.length >= 2; });
}

function manualCoreTriosV2_(snapshot) {
  return (snapshot.tasteExamples || []).filter(function(outfit) {
    return normalizedTasteSourceV2_(outfit) === 'manual';
  }).map(function(outfit) {
    return {
      id: outfit.id,
      name: outfit.name,
      source: 'manual',
      itemIds: (outfit.itemIds || []).slice(),
      coreItemIds: coreTasteItemIdsV2_(outfit.itemIds, snapshot)
    };
  }).filter(function(outfit) { return outfit.coreItemIds.length === 3; });
}

function savedOutfitExactCopyV2_(itemIds, snapshot) {
  var coreIds = coreTasteItemIdsV2_(itemIds, snapshot);
  return manualCoreTriosV2_(snapshot).find(function(saved) {
    return saved.coreItemIds.every(function(id) { return coreIds.indexOf(id) >= 0; });
  }) || null;
}

function sharedTwoCoreSavedOutfitsV2_(itemIds, snapshot) {
  var coreIds = coreTasteItemIdsV2_(itemIds, snapshot);
  return tasteEvidenceV2_(snapshot).filter(function(saved) {
    return coreIds.filter(function(id) { return saved.coreItemIds.indexOf(id) >= 0; }).length === 2;
  });
}

function buildTasteSummaryV2_(snapshot) {
  var items = itemMapV2_(snapshot);
  return tasteEvidenceV2_(snapshot).map(function(outfit) {
    var currentItems = outfit.itemIds.map(function(id) { return items[id]; }).filter(Boolean);
    return {
      name: typeof outfit.name === 'string' ? historyTextForModelV2_(outfit.name, snapshot) : null,
      source: outfit.source,
      weight: outfit.weight,
      itemLabels: currentItems.map(function(item) { return item.shortLabel; }),
      coreItemLabels: outfit.coreItemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }).filter(Boolean),
      note: typeof outfit.note === 'string' ? historyTextForModelV2_(outfit.note, snapshot) : null,
      pieces: currentItems.map(function(item) {
        return historyTextForModelV2_(
          item.shortLabel + ' ' + item.brand + ' ' + item.name + ' (' + item.slot + ', ' + item.color + ')',
          snapshot
        );
      })
    };
  }).filter(function(example) { return example.pieces.length >= 2; }).slice(-12);
}

function historyLooksV2_(entry) {
  return (entry.recommendations || []).concat(entry.encore ? [Object.assign({ archetype: 'encore' }, entry.encore)] : []);
}

function previousLocalDateV2_(localDate, timezone) {
  var midday = Utilities.parseDate(localDate + ' 12:00', timezone, 'yyyy-MM-dd HH:mm');
  return Utilities.formatDate(new Date(midday.getTime() - 24 * 60 * 60 * 1000), timezone, 'yyyy-MM-dd');
}

function dailyHistoryContextV2_(localDate, snapshot) {
  var allHistory = loadHistoryV2_().filter(function(entry) { return entry.localDate < localDate; });
  var maxDays = snapshot.settings && snapshot.settings.maxDailyHistoryDays ? snapshot.settings.maxDailyHistoryDays : 30;
  var history = allHistory.slice(-maxDays);
  var last14 = history.slice(-14);
  var last7 = history.slice(-7);
  var itemMap = itemMapV2_(snapshot);
  var usage = {};
  last7.forEach(function(entry) {
    historyLooksV2_(entry).forEach(function(look) {
      (look.itemIds || []).forEach(function(id) { usage[id] = (usage[id] || 0) + 1; });
    });
  });

  var feedback = [];
  var signals = {};
  var worn = {};
  history.forEach(function(entry) {
    var byCandidate = Object.create(null);
    var ambiguousCandidates = Object.create(null);
    historyLooksV2_(entry).forEach(function(look) {
      var candidateId = look.candidateId;
      if (Object.prototype.hasOwnProperty.call(byCandidate, candidateId) ||
          Object.prototype.hasOwnProperty.call(ambiguousCandidates, candidateId)) {
        delete byCandidate[candidateId];
        ambiguousCandidates[candidateId] = true;
        return;
      }
      byCandidate[candidateId] = look;
    });
    (entry.feedback || []).forEach(function(signal) {
      if (['liked', 'disliked', 'wore'].indexOf(signal.value) < 0) return;
      if (!Object.prototype.hasOwnProperty.call(byCandidate, signal.candidateId)) return;
      var look = byCandidate[signal.candidateId];
      var currentItemIds = (look.itemIds || []).filter(function(id) { return Boolean(itemMap[id]); });
      var resolvedSignal = {
        localDate: entry.localDate,
        value: signal.value,
        outfitName: look.name,
        archetype: look.archetype || 'encore',
        items: currentItemIds.map(function(id) {
          var item = itemMap[id];
          return item.shortLabel + ' ' + item.brand + ' ' + item.name;
        })
      };
      if (signal.reason) resolvedSignal.reason = signal.reason;
      if (signal.note) resolvedSignal.note = signal.note;
      feedback.push(resolvedSignal);
      currentItemIds.forEach(function(id) {
        var label = itemMap[id].shortLabel;
        if (!label) return;
        signals[label] = signals[label] || { wore: 0, liked: 0, disliked: 0 };
        signals[label][signal.value] += 1;
        if (signal.value === 'wore') worn[id] = true;
      });
    });
  });

  var yesterday = previousLocalDateV2_(localDate, (snapshot.settings && snapshot.settings.timezone) || 'America/New_York');
  var yesterdayEntry = history.find(function(entry) { return entry.localDate === yesterday; });
  var cooldown = {};
  if (yesterdayEntry) {
    historyLooksV2_(yesterdayEntry).forEach(function(look) {
      (look.itemIds || []).forEach(function(id) {
        var item = itemMap[id];
        if (item && (item.slot === 'top' || item.slot === 'bottom') && !worn[id]) cooldown[id] = true;
      });
    });
  }
  var cooldownItemIds = Object.keys(cooldown);
  return {
    exactOutfitsPrevious14Days: last14.flatMap(function(entry) {
      return historyLooksV2_(entry).map(function(look) {
        return { localDate: entry.localDate, itemIds: (look.itemIds || []).slice().sort(), archetype: look.archetype || 'encore' };
      });
    }),
    itemUsagePrevious7Days: usage,
    feedback: feedback,
    itemFeedbackSignals: signals,
    cooldownItemLabels: cooldownItemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }).filter(Boolean),
    cooldownItemIds: cooldownItemIds,
    wornItemIds: Object.keys(worn)
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

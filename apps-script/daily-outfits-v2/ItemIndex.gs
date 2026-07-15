function itemMapV2_(snapshot) {
  var map = Object.create(null);
  (snapshot && snapshot.items || []).forEach(function(item) { map[item.id] = item; });
  return map;
}

function itemLabelMapV2_(snapshot) {
  var map = Object.create(null);
  (snapshot && snapshot.items || []).forEach(function(item) { map[item.shortLabel] = item.id; });
  return map;
}

function labelForItemIdV2_(id, snapshot) {
  var item = itemMapV2_(snapshot)[id];
  return item && item.shortLabel ? item.shortLabel : null;
}

function requiredItemLabelV2_(id, snapshot, boundaryName) {
  var label = labelForItemIdV2_(id, snapshot);
  if (!label) throw new Error(boundaryName + ' references a missing wardrobe item');
  return label;
}

function copyStringFieldsV2_(source, target, keys) {
  keys.forEach(function(key) {
    if (typeof source[key] === 'string') target[key] = source[key];
  });
  return target;
}

function historyGuidanceV2_() {
  return [
    'HOW TO USE DAILY HISTORY:',
    '- exactOutfitsPrevious14Days — combinations already emailed. Never repeat one exactly.',
    '- itemUsagePrevious7Days — how often each item appeared in the last seven emails (exposure, not wear). Treat 3+ appearances as over-exposed unless itemFeedbackSignals shows Kevin actually wore it.',
    '- feedback — Kevin\'s explicit reactions. wore is the strongest positive evidence for that outfit\'s styling logic and its items. liked is positive. disliked is negative, and reason names the failing dimension (colors, too-warm, too-formal, …). Do not rebuild a disliked combination or repeat its failure pattern; do favor the visual logic of worn and liked outfits without copying them.'
  ].join('\n');
}

function supportedWardrobeIdTokenV2_(value) {
  return /^(?:(?:user|item)_[A-Za-z0-9_-]+|sneaker_[A-Za-z0-9]+-[A-Za-z0-9-]+|img_[0-9]+)$/.test(value);
}

function historyTextForModelV2_(value, snapshot) {
  var items = snapshot && snapshot.items || [];
  var arbitraryCurrentIds = items.reduce(function(ids, item) {
    if (typeof item.id === 'string' && item.id && !supportedWardrobeIdTokenV2_(item.id)) ids.push(item.id);
    return ids;
  }, []);
  var sanitized = value;
  items.slice().sort(function(left, right) {
    return String(right.id || '').length - String(left.id || '').length;
  }).forEach(function(item) {
    if (typeof item.id === 'string' && item.id) {
      var escapedId = item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var completeToken = new RegExp('(^|[^A-Za-z0-9_-])' + escapedId + '(?=$|[^A-Za-z0-9_-])', 'g');
      sanitized = sanitized.replace(completeToken, function(match, prefix) {
        return prefix + (item.shortLabel || 'INVALID_LABEL');
      });
    }
  });
  return sanitized.replace(/(^|[^A-Za-z0-9_-])((?:(?:user|item)_[A-Za-z0-9_-]+|sneaker_[A-Za-z0-9]+-[A-Za-z0-9-]+|img_[0-9]+))(?=$|[^A-Za-z0-9_-])/g, function(match, prefix, id, offset, source) {
    var idStart = offset + prefix.length;
    var idEnd = idStart + id.length;
    var insideArbitraryCurrentId = arbitraryCurrentIds.some(function(currentId) {
      var currentIdStart = source.lastIndexOf(currentId, idStart);
      return currentIdStart !== -1 && currentIdStart + currentId.length >= idEnd;
    });
    return insideArbitraryCurrentId ? match : prefix + 'INVALID_LABEL';
  });
}

function modelProfileViewV2_(profile) {
  var keys = ['warmth', 'breathability', 'rainSafety', 'windProtection', 'formality', 'silhouette', 'patternIntensity', 'primaryColorFamily', 'secondaryColorFamily', 'accentColors'];
  return keys.reduce(function(view, key) {
    if (profile && Object.prototype.hasOwnProperty.call(profile, key)) view[key] = profile[key];
    return view;
  }, {});
}

function compactItemIndexV2_(snapshot) {
  return snapshot.items.map(function(item) {
    return {
      label: item.shortLabel,
      slot: item.slot,
      name: item.name,
      brand: item.brand,
      category: item.category,
      color: item.color,
      description: item.description,
      styleCode: item.styleCode || null,
      profile: modelProfileViewV2_(item.profile)
    };
  });
}

function modelFacingCandidateV2_(candidate, snapshot) {
  candidate = candidate || {};
  var view = copyStringFieldsV2_(candidate, {}, [
    'candidateId', 'archetype', 'name', 'styleSummary', 'colorStrategy', 'weatherSummary'
  ]);
  if (Array.isArray(candidate.potentialRisks)) {
    view.potentialRisks = candidate.potentialRisks.filter(function(value) { return typeof value === 'string'; });
  }
  if (typeof candidate.plannerConfidence === 'number') view.plannerConfidence = candidate.plannerConfidence;
  ['topId', 'bottomId', 'shoeId', 'layerId'].forEach(function(key) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) return;
    if (key === 'layerId' && candidate[key] === null) view[key] = null;
    else if (candidate[key]) view[key] = requiredItemLabelV2_(candidate[key], snapshot, 'Candidate');
  });
  view.itemIds = (candidate.itemIds || []).map(function(id) {
    return requiredItemLabelV2_(id, snapshot, 'Candidate');
  });
  view.sharesTwoCoreWith = sharedTwoCoreSavedOutfitsV2_(candidate.itemIds || [], snapshot).reduce(function(names, outfit) {
    if (typeof outfit.name === 'string') names.push(historyTextForModelV2_(outfit.name, snapshot));
    return names;
  }, []);
  return view;
}

function modelFacingCandidatesV2_(candidates, snapshot) {
  return (candidates || []).map(function(candidate) { return modelFacingCandidateV2_(candidate, snapshot); });
}

function modelFacingHistoryV2_(history, snapshot) {
  history = history || {};
  var knownLabels = itemLabelMapV2_(snapshot);
  var safeItemDescriptions = (snapshot && snapshot.items || []).reduce(function(descriptions, item) {
    descriptions[item.shortLabel + ' ' + item.brand + ' ' + item.name] = true;
    return descriptions;
  }, {});
  var exactOutfits = (history.exactOutfitsPrevious14Days || []).reduce(function(entries, entry) {
    var ids = Array.isArray(entry.itemIds) ? entry.itemIds : [];
    var labels = ids.map(function(id) { return labelForItemIdV2_(id, snapshot); });
    if (labels.some(function(label) { return !label; })) return entries;
    var modelEntry = {};
    ['localDate', 'archetype'].forEach(function(key) {
      if (typeof entry[key] === 'string') modelEntry[key] = historyTextForModelV2_(entry[key], snapshot);
    });
    modelEntry.itemIds = labels;
    entries.push(modelEntry);
    return entries;
  }, []);
  var usageCounts = Object.keys(history.itemUsagePrevious7Days || {}).reduce(function(counts, id) {
    var label = labelForItemIdV2_(id, snapshot);
    var count = history.itemUsagePrevious7Days[id];
    if (label && typeof count === 'number') counts[label] = count;
    return counts;
  }, {});
  var feedback = (history.feedback || []).map(function(entry) {
    var modelEntry = {};
    ['localDate', 'candidateId', 'value', 'reason', 'note', 'outfitName', 'archetype'].forEach(function(key) {
      if (typeof entry[key] === 'string') modelEntry[key] = historyTextForModelV2_(entry[key], snapshot);
    });
    if (typeof entry.createdAt === 'number') modelEntry.createdAt = entry.createdAt;
    if (Array.isArray(entry.items)) {
      modelEntry.items = entry.items.filter(function(description) {
        return typeof description === 'string' && Object.prototype.hasOwnProperty.call(safeItemDescriptions, description);
      }).map(function(description) {
        return historyTextForModelV2_(description, snapshot);
      });
    }
    return modelEntry;
  });
  var view = {
    exactOutfitsPrevious14Days: exactOutfits,
    itemUsagePrevious7Days: usageCounts,
    feedback: feedback
  };
  if (Object.prototype.hasOwnProperty.call(history, 'itemFeedbackSignals')) {
    view.itemFeedbackSignals = Object.keys(history.itemFeedbackSignals || {}).reduce(function(signals, label) {
      if (!Object.prototype.hasOwnProperty.call(knownLabels, label)) return signals;
      var source = history.itemFeedbackSignals[label] || {};
      signals[label] = {
        wore: typeof source.wore === 'number' ? source.wore : 0,
        liked: typeof source.liked === 'number' ? source.liked : 0,
        disliked: typeof source.disliked === 'number' ? source.disliked : 0
      };
      return signals;
    }, {});
  }
  if (Object.prototype.hasOwnProperty.call(history, 'cooldownItemLabels')) {
    var seenCooldownLabels = {};
    view.cooldownItemLabels = (history.cooldownItemLabels || []).filter(function(label) {
      if (!Object.prototype.hasOwnProperty.call(knownLabels, label) || seenCooldownLabels[label]) return false;
      seenCooldownLabels[label] = true;
      return true;
    });
  }
  return view;
}

function modelFacingCuratedV2_(curated, snapshot) {
  curated = curated || {};
  return {
    recommendations: (curated.recommendations || []).map(function(rec) {
      var modelRecommendation = copyStringFieldsV2_(rec, {}, [
        'candidateId', 'archetype', 'name', 'colorHook', 'whyItWorks', 'weatherNote'
      ]);
      modelRecommendation.itemIds = (rec.itemIds || []).map(function(id) {
        return requiredItemLabelV2_(id, snapshot, 'Curated recommendation');
      });
      return modelRecommendation;
    })
  };
}

function resolveLabelsV2_(response, snapshot) {
  var resolved = JSON.parse(JSON.stringify(response));
  var byLabel = itemLabelMapV2_(snapshot);
  var resolve = function(token) {
    return Object.prototype.hasOwnProperty.call(byLabel, token) ? byLabel[token] : token;
  };
  (resolved.candidates || []).forEach(function(candidate) {
    ['topId', 'bottomId', 'shoeId', 'layerId'].forEach(function(key) { if (candidate[key]) candidate[key] = resolve(candidate[key]); });
    candidate.itemIds = (candidate.itemIds || []).map(resolve);
  });
  (resolved.recommendations || []).forEach(function(rec) { rec.itemIds = (rec.itemIds || []).map(resolve); });
  return resolved;
}

function inlineImagePartV2_(dataUrl) {
  var match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Invalid image data URL');
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function atlasPartsV2_(snapshot) {
  var parts = [];
  snapshot.atlasPages.forEach(function(page) {
    var labels = page.itemIds.map(function(id) {
      return requiredItemLabelV2_(id, snapshot, 'Atlas page');
    });
    parts.push({ text: 'ATLAS ' + page.pageId + ' | slot=' + page.slot + ' | item labels=' + labels.join(',') });
    parts.push(inlineImagePartV2_(page.imageDataUrl));
  });
  return parts;
}

function candidateImagePartsV2_(snapshot, candidates) {
  var memberships = {};
  candidates.forEach(function(candidate) {
    candidate.itemIds.forEach(function(id) {
      memberships[id] = memberships[id] || [];
      memberships[id].push(candidate.candidateId);
    });
  });
  var items = itemMapV2_(snapshot);
  var parts = [];
  Object.keys(memberships).sort().forEach(function(id) {
    var item = items[id];
    if (!item) throw new Error('Candidate image references a missing wardrobe item');
    parts.push({ text: 'ITEM ' + item.shortLabel + ' | slot=' + item.slot + ' | ' + item.brand + ' ' + item.name + ' | listed colors=' + item.color + ' | description=' + item.description + ' | candidates=' + memberships[id].join(',') });
    parts.push(inlineImagePartV2_(item.thumbnailDataUrl));
  });
  return parts;
}

function itemMapV2_(snapshot) {
  var map = {};
  snapshot.items.forEach(function(item) { map[item.id] = item; });
  return map;
}

function itemLabelMapV2_(snapshot) {
  var map = {};
  snapshot.items.forEach(function(item) { map[item.shortLabel] = item.id; });
  return map;
}

function labelForItemIdV2_(id, snapshot) {
  var item = itemMapV2_(snapshot)[id];
  return item ? item.shortLabel : id;
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
  var view = Object.assign({}, candidate);
  ['topId', 'bottomId', 'shoeId', 'layerId'].forEach(function(key) {
    if (view[key]) view[key] = labelForItemIdV2_(view[key], snapshot);
  });
  view.itemIds = (candidate.itemIds || []).map(function(id) { return labelForItemIdV2_(id, snapshot); });
  return view;
}

function modelFacingCandidatesV2_(candidates, snapshot) {
  return (candidates || []).map(function(candidate) { return modelFacingCandidateV2_(candidate, snapshot); });
}

function modelFacingHistoryV2_(history, snapshot) {
  var view = JSON.parse(JSON.stringify(history || {}));
  view.exactOutfitsPrevious14Days = (history.exactOutfitsPrevious14Days || []).map(function(entry) {
    return Object.assign({}, entry, { itemIds: entry.itemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }) });
  });
  view.itemUsagePrevious7Days = Object.keys(history.itemUsagePrevious7Days || {}).reduce(function(counts, id) {
    counts[labelForItemIdV2_(id, snapshot)] = history.itemUsagePrevious7Days[id];
    return counts;
  }, {});
  delete view.cooldownItemIds;
  delete view.wornItemIds;
  return view;
}

function modelFacingCuratedV2_(curated, snapshot) {
  return {
    recommendations: (curated.recommendations || []).map(function(rec) {
      return Object.assign({}, rec, { itemIds: rec.itemIds.map(function(id) { return labelForItemIdV2_(id, snapshot); }) });
    })
  };
}

function resolveLabelsV2_(response, snapshot) {
  var resolved = JSON.parse(JSON.stringify(response));
  var byLabel = itemLabelMapV2_(snapshot);
  var resolve = function(token) { return byLabel[token] || token; };
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
  var itemMap = itemMapV2_(snapshot);
  snapshot.atlasPages.forEach(function(page) {
    var labels = page.itemIds.map(function(id) { return itemMap[id] ? itemMap[id].shortLabel : id; });
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
    if (!item) throw new Error('Candidate references missing item image: ' + id);
    parts.push({ text: 'ITEM ' + item.shortLabel + ' | slot=' + item.slot + ' | ' + item.brand + ' ' + item.name + ' | listed colors=' + item.color + ' | description=' + item.description + ' | candidates=' + memberships[id].join(',') });
    parts.push(inlineImagePartV2_(item.thumbnailDataUrl));
  });
  return parts;
}

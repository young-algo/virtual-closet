function itemMapV2_(snapshot) {
  var map = {};
  snapshot.items.forEach(function(item) { map[item.id] = item; });
  return map;
}

function compactItemIndexV2_(snapshot) {
  return snapshot.items.map(function(item) {
    return {
      id: item.id,
      label: item.shortLabel,
      slot: item.slot,
      name: item.name,
      brand: item.brand,
      category: item.category,
      color: item.color,
      description: item.description,
      styleCode: item.styleCode || null,
      profile: item.profile
    };
  });
}

function inlineImagePartV2_(dataUrl) {
  var match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Invalid image data URL');
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function atlasPartsV2_(snapshot) {
  var parts = [];
  snapshot.atlasPages.forEach(function(page) {
    parts.push({ text: 'ATLAS ' + page.pageId + ' | slot=' + page.slot + ' | item ids=' + page.itemIds.join(',') });
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
    parts.push({ text: 'ITEM ' + id + ' | ' + item.shortLabel + ' | slot=' + item.slot + ' | ' + item.brand + ' ' + item.name + ' | listed colors=' + item.color + ' | description=' + item.description + ' | candidates=' + memberships[id].join(',') });
    parts.push(inlineImagePartV2_(item.thumbnailDataUrl));
  });
  return parts;
}

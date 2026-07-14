function validateSnapshotObjectV2_(snapshot) {
  var errors = [];
  if (!snapshot || snapshot.version !== 2) errors.push('snapshot.version must be 2');
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length < 3) errors.push('items must contain at least three entries');
  if (!snapshot || !Array.isArray(snapshot.atlasPages) || snapshot.atlasPages.length < 1) errors.push('atlasPages is required');
  if (!snapshot || !snapshot.wardrobeFingerprint) errors.push('wardrobeFingerprint is required');
  if (errors.length) return errors;

  var ids = {};
  var labels = {};
  var slotCounts = { top: 0, bottom: 0, layer: 0, shoes: 0 };
  snapshot.items.forEach(function(item, index) {
    var path = 'items[' + index + ']';
    if (!item.id || typeof item.id !== 'string') errors.push(path + '.id is required');
    if (ids[item.id]) errors.push('duplicate item id: ' + item.id);
    ids[item.id] = true;
    if (!/^[TBLS]\d{3,}$/.test(item.shortLabel || '')) errors.push(path + '.shortLabel is invalid');
    if (labels[item.shortLabel]) errors.push('duplicate short label: ' + item.shortLabel);
    labels[item.shortLabel] = true;
    if (!Object.prototype.hasOwnProperty.call(slotCounts, item.slot)) errors.push(path + '.slot is invalid');
    else slotCounts[item.slot] += 1;
    if (!item.profile || item.profile.available !== true || item.profile.excludedFromDaily === true) errors.push(path + '.profile is not eligible');
    if (!/^data:image\/jpeg;base64,/.test(item.thumbnailDataUrl || '')) errors.push(path + '.thumbnailDataUrl must be a JPEG data URL');
    if (!item.imageFingerprint) errors.push(path + '.imageFingerprint is required');
  });

  DAILY_V2.REQUIRED_SLOTS.forEach(function(slot) {
    if (!slotCounts[slot]) errors.push('required slot is empty: ' + slot);
  });

  var atlasMembership = {};
  snapshot.atlasPages.forEach(function(page, index) {
    var path = 'atlasPages[' + index + ']';
    if (!page.pageId || !Object.prototype.hasOwnProperty.call(slotCounts, page.slot)) errors.push(path + ' has invalid identity or slot');
    if (!Array.isArray(page.itemIds) || page.itemIds.length < 1 || page.itemIds.length > 12) errors.push(path + '.itemIds must contain 1..12 entries');
    if (!/^data:image\/jpeg;base64,/.test(page.imageDataUrl || '')) errors.push(path + '.imageDataUrl must be a JPEG data URL');
    (page.itemIds || []).forEach(function(id) {
      var item = snapshot.items.find(function(entry) { return entry.id === id; });
      if (!item) errors.push(path + ' references unknown item ' + id);
      else if (item.slot !== page.slot) errors.push(path + ' mixes slots for item ' + id);
      atlasMembership[id] = (atlasMembership[id] || 0) + 1;
    });
  });
  Object.keys(ids).forEach(function(id) {
    if (atlasMembership[id] !== 1) errors.push('item ' + id + ' appears on ' + (atlasMembership[id] || 0) + ' atlas pages');
  });
  return errors;
}

function validateStoredSnapshotV2() {
  var snapshot = loadSnapshotV2_();
  var errors = validateSnapshotObjectV2_(snapshot);
  return {
    ok: errors.length === 0,
    errors: errors,
    generatedAt: snapshot && snapshot.generatedAt,
    wardrobeFingerprint: snapshot && snapshot.wardrobeFingerprint,
    itemCount: snapshot && snapshot.items ? snapshot.items.length : 0,
    atlasPageCount: snapshot && snapshot.atlasPages ? snapshot.atlasPages.length : 0
  };
}

function assertFreshSnapshotV2_(snapshot, now) {
  var errors = validateSnapshotObjectV2_(snapshot);
  if (errors.length) throw new Error('Stored snapshot is invalid: ' + errors.join('; '));
  if ((now || Date.now()) - snapshot.generatedAt > DAILY_V2.MAX_SNAPSHOT_AGE_MS) throw new Error('Stored snapshot is older than seven days');
  return snapshot;
}

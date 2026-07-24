function dataUrlBlobV2_(dataUrl, name) {
  var match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Invalid inline image for ' + name);
  return Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], name);
}

function escapeHtmlV2_(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function archetypeEmailLabelV2_(value) {
  return value === 'polished-casual' ? 'POLISHED CASUAL' : value.toUpperCase();
}

function generatedOutfitCountCopyV2_(count) {
  if (count === 1) return "Today's outfit";
  if (count === 2 || count === 3) return "Today's " + count + " outfits";
  throw new Error('Generated recommendation count must be between one and three');
}

function humanArchetypeLabelV2_(value) {
  return value === 'polished-casual'
    ? 'Polished casual'
    : value.charAt(0).toUpperCase() + value.slice(1);
}

function coverageNoteV2_(coverage) {
  if (!coverage || coverage.deliveryMode !== 'partial') return '';
  var labels = coverage.omittedArchetypes.map(humanArchetypeLabelV2_);
  var subject = labels.length === 1 ? labels[0] : labels.join(' and ');
  return subject + (labels.length === 1 ? ' was' : ' were') +
    " omitted after today's quality, weather, and outfit-distinctness checks.";
}

function renderEncoreEmailV2_(bundle, snapshot, plain, inlineImages) {
  if (!bundle.encore) return '';
  var items = itemMapV2_(snapshot);
  var itemIds = Array.isArray(bundle.encore.itemIds) ? bundle.encore.itemIds : [];
  var pieces = itemIds.map(function(id) { return items[id]; }).filter(function(item) {
    return item && typeof item === 'object' && typeof item.name === 'string' && item.name && typeof item.slot === 'string' && item.slot;
  });
  var imageIndex = 0;
  var images = pieces.map(function(item) {
    var key = 'encoreitem' + imageIndex;
    var blob;
    try {
      blob = dataUrlBlobV2_(item.thumbnailDataUrl, key + '.jpg');
    } catch (_ignored) {
      return '';
    }
    inlineImages[key] = blob;
    imageIndex += 1;
    return '<td style="width:25%;padding:6px;background:#f4f3ef"><img src="cid:' + key + '" alt="' + escapeHtmlV2_(item.name) + '" style="display:block;width:100%;height:auto"></td>';
  }).join('');
  while ((images.match(/<td/g) || []).length < 4) images += '<td style="width:25%;padding:6px;background:#f4f3ef"></td>';
  plain.push('ENCORE — FROM YOUR SAVED OUTFITS', bundle.encore.name, "One of yours, back in rotation for today's weather.");
  pieces.forEach(function(item) { plain.push(item.slot.toUpperCase() + ' — ' + item.name); });
  plain.push('');
  return '<section style="margin-top:24px;padding:28px;border:1px solid #9b8f73;background:#ece7da">' +
    '<div style="font:600 10px monospace;letter-spacing:2px;color:#665d49">ENCORE — FROM YOUR SAVED OUTFITS</div>' +
    '<h2 style="margin:8px 0 18px;font:400 28px Arial,sans-serif;color:#111">' + escapeHtmlV2_(bundle.encore.name) + '</h2>' +
    '<table role="presentation" cellpadding="0" cellspacing="4" style="width:100%;table-layout:fixed"><tr>' + images + '</tr></table>' +
    '<p style="margin:20px 0 8px;font:400 15px/1.6 Arial,sans-serif;color:#222">One of yours, back in rotation for today\'s weather.</p>' +
    '<p style="margin:0;font:400 12px/1.7 monospace;color:#665d49">' + pieces.map(function(item) { return escapeHtmlV2_(item.slot.toUpperCase() + ' — ' + item.name); }).join('<br>') + '</p>' +
    '</section>';
}

function renderDailyEmailV2_(bundle, snapshot, testMode, pending, expectedLocalDate) {
  if (!validFullBundleReadyV2_(pending, snapshot, expectedLocalDate) || pending.bundle !== bundle) {
    throw new Error('No current quality-gated bundle is ready');
  }
  var generatedCopy = generatedOutfitCountCopyV2_(bundle.recommendations.length);
  var omissionCopy = coverageNoteV2_(bundle.coverage);
  var itemMap = itemMapV2_(snapshot);
  var inlineImages = {};
  var plain = ['WARDROBE', bundle.localDate + ' · ' + bundle.weather.locationLabel, '', Math.round(bundle.weather.morningFeelsLikeF) + '° morning · ' + Math.round(bundle.weather.highTemperatureF) + '° high · ' + Math.round(bundle.weather.maxRainProbability) + '% rain', bundle.weather.plainEnglishSummary, ''];
  plain.push(generatedCopy);
  if (omissionCopy) plain.push(omissionCopy);
  plain.push('');
  var sections = bundle.recommendations.map(function(rec, index) {
    var pieces = rec.itemIds.map(function(id) { return itemMap[id]; }).filter(Boolean);
    var images = pieces.map(function(item, itemIndex) {
      var key = 'look' + index + 'item' + itemIndex;
      inlineImages[key] = dataUrlBlobV2_(item.thumbnailDataUrl, key + '.jpg');
      return '<td style="width:25%;padding:6px;background:#f4f3ef"><img src="cid:' + key + '" alt="' + escapeHtmlV2_(item.name) + '" style="display:block;width:100%;height:auto"></td>';
    }).join('');
    while ((images.match(/<td/g) || []).length < 4) images += '<td style="width:25%;padding:6px;background:#f4f3ef"></td>';
    plain.push('0' + (index + 1) + ' ' + archetypeEmailLabelV2_(rec.archetype), rec.name);
    if (rec.colorHook) plain.push('Color hook: ' + rec.colorHook);
    plain.push(rec.whyItWorks, 'Weather: ' + rec.weatherNote);
    pieces.forEach(function(item) { plain.push(item.slot.charAt(0).toUpperCase() + item.slot.slice(1) + ' — ' + item.name); });
    plain.push('');
    return '<section style="padding:32px 0;border-top:1px solid #deddd8">' +
      '<div style="font:600 10px monospace;letter-spacing:2px;color:#777">0' + (index + 1) + ' ' + archetypeEmailLabelV2_(rec.archetype) + '</div>' +
      '<h2 style="margin:8px 0 18px;font:400 28px Arial,sans-serif;color:#111">' + escapeHtmlV2_(rec.name) + '</h2>' +
      '<table role="presentation" cellpadding="0" cellspacing="4" style="width:100%;table-layout:fixed"><tr>' + images + '</tr></table>' +
      (rec.colorHook ? '<p style="margin:20px 0 6px;font:600 12px/1.6 monospace;color:#555"><strong>COLOR HOOK:</strong> ' + escapeHtmlV2_(rec.colorHook) + '</p>' : '') +
      '<p style="margin:' + (rec.colorHook ? '6px' : '20px') + ' 0 8px;font:400 15px/1.6 Arial,sans-serif;color:#222">' + escapeHtmlV2_(rec.whyItWorks) + '</p>' +
      '<p style="margin:0 0 16px;font:400 13px/1.5 Arial,sans-serif;color:#666"><strong>Weather:</strong> ' + escapeHtmlV2_(rec.weatherNote) + '</p>' +
      '<p style="margin:0;font:400 12px/1.7 monospace;color:#777">' + pieces.map(function(item) { return escapeHtmlV2_(item.slot.toUpperCase() + ' — ' + item.name); }).join('<br>') + '</p>' +
      '</section>';
  }).join('');
  var encoreSection = renderEncoreEmailV2_(bundle, snapshot, plain, inlineImages);
  var date = new Date(bundle.localDate + 'T12:00:00');
  var dateLabel = Utilities.formatDate(date, bundle.weather.timezone, 'EEEE, MMMM d');
  var appLink = getDailyConfigV2_().appUrl ? '<p style="margin:30px 0 0"><a href="' + escapeHtmlV2_(getDailyConfigV2_().appUrl) + '" style="font:600 11px monospace;color:#111;letter-spacing:1px">OPEN LATEST BUNDLE →</a></p>' : '';
  var html = '<!doctype html><html><body style="margin:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:42px 24px;font-family:Arial,sans-serif;color:#111">' +
    (testMode ? '<div style="padding:9px 12px;background:#111;color:#fff;font:600 10px monospace;letter-spacing:2px">TEST DELIVERY</div>' : '') +
    '<div style="padding:26px 0 32px"><div style="font:600 11px monospace;letter-spacing:4px">WARDROBE</div><p style="margin:10px 0 24px;color:#666;font-size:13px">' + escapeHtmlV2_(dateLabel + ' · ' + bundle.weather.locationLabel) + '</p>' +
    '<h1 style="margin:0 0 10px;font:400 36px/1.08 Arial,sans-serif">' + Math.round(bundle.weather.morningFeelsLikeF) + '° morning · ' + Math.round(bundle.weather.highTemperatureF) + '° high</h1>' +
    '<p style="margin:0;color:#666;font:400 14px/1.6 Arial,sans-serif">' + Math.round(bundle.weather.maxRainProbability) + '% rain · ' + escapeHtmlV2_(bundle.weather.windy ? 'windy' : 'light wind') + '<br>' + escapeHtmlV2_(bundle.weather.plainEnglishSummary) + '</p>' +
    '<h2 style="margin:24px 0 8px;font:400 24px Arial,sans-serif">' +
      escapeHtmlV2_(generatedCopy) + '</h2>' +
    (omissionCopy
      ? '<p style="margin:0 0 24px;color:#666;font:400 13px/1.6 Arial,sans-serif">' +
          escapeHtmlV2_(omissionCopy) + '</p>'
      : '') + '</div>' +
    sections + encoreSection + appLink + '<p style="margin:42px 0 0;color:#aaa;font:400 10px monospace">Generated from the complete synchronized wardrobe. Daily history remains separate from the on-demand stylist.</p></div></body></html>';
  return { html: html, plain: plain.join('\n'), inlineImages: inlineImages };
}

function sendDailyBundleNowV2_(bundle, snapshot, testMode, pending, expectedLocalDate) {
  if (!validFullBundleReadyV2_(pending, snapshot, expectedLocalDate) || pending.bundle !== bundle) {
    throw new Error('No current quality-gated bundle is ready');
  }
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
  var properties = testMode ? null : getDailyPropertiesV2_();
  var sendState = testMode ? null : assertUnambiguousDailySendStateV2_(properties, bundle.localDate);
  if (!testMode && sendState.marker && sendState.marker !== bundle.localDate) {
    throw new Error('Resolved daily email send state for ' + sendState.marker + ' must be reconciled before sending ' + bundle.localDate);
  }
  if (!testMode && sendState.lastSentDate === bundle.localDate) throw new Error('A daily outfit email was already sent for ' + bundle.localDate);
  if (bundle.wardrobeFingerprint !== snapshot.wardrobeFingerprint) throw new Error('Bundle wardrobe fingerprint no longer matches the snapshot');
  var rendered = renderDailyEmailV2_(bundle, snapshot, testMode, pending, expectedLocalDate);
  var subject = (testMode ? '[TEST] ' : '') +
    generatedOutfitCountCopyV2_(bundle.recommendations.length) + ' — ' +
    Math.round(bundle.weather.highTemperatureF) + '° / ' +
    (bundle.weather.weatherPhrase || 'daily forecast');
  if (!testMode) properties.setProperty('SEND_IN_PROGRESS_DATE_V2', bundle.localDate);
  MailApp.sendEmail({
    to: config.recipientEmail,
    subject: subject,
    body: rendered.plain,
    htmlBody: rendered.html,
    inlineImages: rendered.inlineImages,
    name: 'Wardrobe'
  });
}

function sendDailyBundleNowV2() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another daily outfit job is already running');
  try {
    var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
    var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
    var currentLocalDate = localDateV2_(new Date(), config.timezone);
    var properties = getDailyPropertiesV2_();
    var sendState = assertUnambiguousDailySendStateV2_(properties, currentLocalDate);
    var resolvedSentDate = sendState.marker || (sendState.lastSentDate === currentLocalDate ? currentLocalDate : null);
    if (resolvedSentDate) {
      if (!sendState.marker && dailySendFinalizedV2_(resolvedSentDate)) {
        // Finalization completed for currentLocalDate, so there is nothing to reconcile.
        // Return the bundle that was actually sent instead of re-deriving it from a
        // wardrobe snapshot that may have changed since.
        return persistedSentBundleV2_(resolvedSentDate);
      }
      var reconciliation = reconcilePersistedSentBundleV2_(resolvedSentDate, snapshot);
      return resolvedSentDate === currentLocalDate ? reconciliation.bundle : reconciliation;
    }
    var pending = null;
    try { pending = loadPendingV2_(); } catch (_ignored) {}
    if (!validFullBundleReadyV2_(pending, snapshot, currentLocalDate)) {
      throw new Error('No quality-gated bundle is ready');
    }
    var state = null;
    try {
      if (typeof loadJobStateV2_ === 'function') state = loadJobStateV2_();
    } catch (_ignoredState) {}
    sendDailyBundleNowV2_(pending.bundle, snapshot, false, pending, currentLocalDate);
    finalizeSentBundleV2_(pending.bundle, snapshot, state);
    return pending.bundle;
  } finally {
    lock.releaseLock();
  }
}

function sendDailyTestEmailV2() {
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
  var currentLocalDate = localDateV2_(new Date(), config.timezone);
  var pending = null;
  try { pending = loadPendingV2_(); } catch (_ignored) {}
  if (!validFullBundleReadyV2_(pending, snapshot, currentLocalDate)) {
    throw new Error('Generate a quality-gated test bundle first');
  }
  sendDailyBundleNowV2_(pending.bundle, snapshot, true, pending, currentLocalDate);
}

function sendOperationalAlertV2_(reason, detail) {
  var config = getDailyConfigV2_();
  if (!config.sendOperationalAlerts) return;
  var key = localDateV2_(new Date(), config.timezone) + '|' + reason;
  if (getDailyPropertiesV2_().getProperty('LAST_OPERATIONAL_ALERT_V2') === key) return;
  MailApp.sendEmail(config.recipientEmail, 'Wardrobe daily email skipped — ' + reason, 'The daily outfit email was not sent.\n\n' + detail, { name: 'Wardrobe' });
  getDailyPropertiesV2_().setProperty('LAST_OPERATIONAL_ALERT_V2', key);
}

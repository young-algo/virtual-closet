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

function renderDailyEmailV2_(bundle, snapshot, testMode, pending, expectedLocalDate) {
  if (!validFullBundleReadyV2_(pending, snapshot, expectedLocalDate) || pending.bundle !== bundle) {
    throw new Error('No current quality-gated bundle is ready');
  }
  var itemMap = itemMapV2_(snapshot);
  var inlineImages = {};
  var plain = ['WARDROBE', bundle.localDate + ' · ' + bundle.weather.locationLabel, '', Math.round(bundle.weather.morningFeelsLikeF) + '° morning · ' + Math.round(bundle.weather.highTemperatureF) + '° high · ' + Math.round(bundle.weather.maxRainProbability) + '% rain', bundle.weather.plainEnglishSummary, ''];
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
  var date = new Date(bundle.localDate + 'T12:00:00');
  var dateLabel = Utilities.formatDate(date, bundle.weather.timezone, 'EEEE, MMMM d');
  var appLink = getDailyConfigV2_().appUrl ? '<p style="margin:30px 0 0"><a href="' + escapeHtmlV2_(getDailyConfigV2_().appUrl) + '" style="font:600 11px monospace;color:#111;letter-spacing:1px">OPEN LATEST BUNDLE →</a></p>' : '';
  var html = '<!doctype html><html><body style="margin:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:42px 24px;font-family:Arial,sans-serif;color:#111">' +
    (testMode ? '<div style="padding:9px 12px;background:#111;color:#fff;font:600 10px monospace;letter-spacing:2px">TEST DELIVERY</div>' : '') +
    '<div style="padding:26px 0 32px"><div style="font:600 11px monospace;letter-spacing:4px">WARDROBE</div><p style="margin:10px 0 24px;color:#666;font-size:13px">' + escapeHtmlV2_(dateLabel + ' · ' + bundle.weather.locationLabel) + '</p>' +
    '<h1 style="margin:0 0 10px;font:400 36px/1.08 Arial,sans-serif">' + Math.round(bundle.weather.morningFeelsLikeF) + '° morning · ' + Math.round(bundle.weather.highTemperatureF) + '° high</h1>' +
    '<p style="margin:0;color:#666;font:400 14px/1.6 Arial,sans-serif">' + Math.round(bundle.weather.maxRainProbability) + '% rain · ' + escapeHtmlV2_(bundle.weather.windy ? 'windy' : 'light wind') + '<br>' + escapeHtmlV2_(bundle.weather.plainEnglishSummary) + '</p></div>' +
    sections + appLink + '<p style="margin:42px 0 0;color:#aaa;font:400 10px monospace">Generated from the complete synchronized wardrobe. Daily history remains separate from the on-demand stylist.</p></div></body></html>';
  return { html: html, plain: plain.join('\n'), inlineImages: inlineImages };
}

function sendDailyBundleNowV2_(bundle, snapshot, testMode, pending, expectedLocalDate) {
  if (!validFullBundleReadyV2_(pending, snapshot, expectedLocalDate) || pending.bundle !== bundle) {
    throw new Error('No current quality-gated bundle is ready');
  }
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
  if (!testMode && getDailyPropertiesV2_().getProperty('LAST_SENT_DATE_V2') === bundle.localDate) throw new Error('A daily outfit email was already sent for ' + bundle.localDate);
  if (bundle.wardrobeFingerprint !== snapshot.wardrobeFingerprint) throw new Error('Bundle wardrobe fingerprint no longer matches the snapshot');
  var rendered = renderDailyEmailV2_(bundle, snapshot, testMode, pending, expectedLocalDate);
  var subject = (testMode ? '[TEST] ' : '') + "Today's 3 outfits — " + Math.round(bundle.weather.highTemperatureF) + '° / ' + (bundle.weather.weatherPhrase || 'daily forecast');
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
  var snapshot = assertFreshSnapshotV2_(loadSnapshotV2_());
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), snapshot);
  var currentLocalDate = localDateV2_(new Date(), config.timezone);
  var pending = null;
  try { pending = loadPendingV2_(); } catch (_ignored) {}
  if (!validFullBundleReadyV2_(pending, snapshot, currentLocalDate)) {
    throw new Error('No quality-gated bundle is ready');
  }
  sendDailyBundleNowV2_(pending.bundle, snapshot, false, pending, currentLocalDate);
  getDailyPropertiesV2_().setProperty('LAST_SENT_DATE_V2', pending.bundle.localDate);
  recordSentBundleV2_(pending.bundle, snapshot);
  return pending.bundle;
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

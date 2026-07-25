var FEEDBACK_LABELS_V2 = { liked: 'like', disliked: 'not for me', wore: 'wore this' };

function feedbackLookNameV2_(localDate, candidateId) {
  var history;
  try {
    history = loadHistoryV2_();
  } catch (_ignored) {
    return null;
  }
  var entry = (history || []).find(function(value) { return value.localDate === localDate; });
  if (!entry) return null;
  var look = historyLooksV2_(entry).find(function(value) { return value.candidateId === candidateId; });
  return look && typeof look.name === 'string' && look.name ? look.name : null;
}

function feedbackPageShellV2_(body) {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '</head><body style="margin:0;background:#fff">' +
    '<div style="max-width:520px;margin:0 auto;padding:56px 24px;font-family:Arial,sans-serif;color:#111">' +
    '<div style="font:600 11px monospace;letter-spacing:4px">WARDROBE</div>' + body +
    '</div></body></html>';
}

function invalidFeedbackPageV2_() {
  return HtmlService.createHtmlOutput(feedbackPageShellV2_(
    '<p style="margin:28px 0 0;font:400 15px/1.6 Arial,sans-serif">This link isn\'t valid.</p>'
  ));
}

function feedbackCorrectionLinksV2_(token) {
  return DAILY_V2.FEEDBACK_VALUES.filter(function(value) {
    return value !== token.value;
  }).map(function(value) {
    return '<a href="' + escapeHtmlV2_(feedbackLinkUrlV2_(token.localDate, token.candidateId, value, false)) +
      '" style="display:inline-block;padding:14px 24px 14px 0;font:600 10px monospace;letter-spacing:2px;color:#111">' +
      escapeHtmlV2_(FEEDBACK_LABELS_V2[value].toUpperCase()) + '</a>';
  }).join('');
}

function renderFeedbackPageV2_(token, lookName) {
  var subject = lookName ? escapeHtmlV2_(lookName) + ' · ' + escapeHtmlV2_(token.localDate) : escapeHtmlV2_(token.localDate);
  if (token.testMode) {
    return feedbackPageShellV2_(
      '<p style="margin:28px 0 6px;font:400 22px/1.3 Arial,sans-serif">Test delivery — not recorded</p>' +
      '<p style="margin:0;color:#666;font:400 13px/1.6 Arial,sans-serif">' + subject + '</p>'
    );
  }
  return feedbackPageShellV2_(
    '<p style="margin:28px 0 6px;font:400 22px/1.3 Arial,sans-serif">Recorded — ' +
      escapeHtmlV2_(FEEDBACK_LABELS_V2[token.value]) + '</p>' +
    '<p style="margin:0 0 26px;color:#666;font:400 13px/1.6 Arial,sans-serif">' + subject + '</p>' +
    '<div style="border-top:1px solid #deddd8;padding-top:8px">' +
      '<div style="font:600 10px monospace;letter-spacing:2px;color:#777;padding-bottom:4px">CHANGE TO</div>' +
      feedbackCorrectionLinksV2_(token) +
    '</div>'
  );
}

function doGet(e) {
  try {
    var today = localDateV2_(new Date(), getDailyConfigV2_().timezone);
    var token = verifyFeedbackTokenV2_(e && e.parameter, today);
    if (!token.testMode) {
      upsertEmailFeedbackV2_(token.localDate, token.candidateId, token.value, Date.now());
    }
    return HtmlService.createHtmlOutput(
      renderFeedbackPageV2_(token, feedbackLookNameV2_(token.localDate, token.candidateId))
    );
  } catch (error) {
    console.error('Daily V2 feedback link failed: ' + error.message);
    return invalidFeedbackPageV2_();
  }
}

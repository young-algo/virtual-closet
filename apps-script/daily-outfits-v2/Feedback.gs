function validFeedbackLocalDateV2_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validFeedbackCandidateIdV2_(value) {
  return typeof value === 'string' && value.length > 0 && value.indexOf('|') < 0;
}

function validFeedbackValueV2_(value) {
  return DAILY_V2.FEEDBACK_VALUES.indexOf(value) >= 0;
}

function validFeedbackEntryV2_(entry) {
  return Boolean(entry) && typeof entry === 'object' &&
    validFeedbackLocalDateV2_(entry.localDate) &&
    validFeedbackCandidateIdV2_(entry.candidateId) &&
    validFeedbackValueV2_(entry.value) &&
    typeof entry.createdAt === 'number' && isFinite(entry.createdAt);
}

function feedbackDateWithinWindowV2_(localDate, todayLocalDate) {
  var then = shoeRotationCalendarOrdinalV2_(localDate);
  var now = shoeRotationCalendarOrdinalV2_(todayLocalDate);
  if (then === null || now === null) return false;
  var age = now - then;
  return age >= 0 && age <= DAILY_V2.MAX_EMAIL_FEEDBACK_AGE_DAYS;
}

function readEmailFeedbackStoreV2_() {
  var stored = loadEmailFeedbackV2_();
  if (!Array.isArray(stored)) throw new Error('Corrupt email feedback store: expected a JSON array');
  stored.forEach(function(entry) {
    if (!validFeedbackEntryV2_(entry)) {
      throw new Error('Corrupt email feedback store: invalid entry');
    }
  });
  return stored;
}

function upsertEmailFeedbackV2_(localDate, candidateId, value, createdAt) {
  var entry = { localDate: localDate, candidateId: candidateId, value: value, createdAt: createdAt };
  if (!validFeedbackEntryV2_(entry)) throw new Error('Invalid feedback signal');
  var stored = readEmailFeedbackStoreV2_();
  var next = stored.filter(function(existing) {
    return !(existing.localDate === localDate && existing.candidateId === candidateId);
  });
  next.push(entry);
  saveEmailFeedbackV2_(next);
}

function feedbackPayloadV2_(localDate, candidateId, value, testMode) {
  return ['v1', localDate, candidateId, value, testMode ? '1' : '0'].join('|');
}

function feedbackSignatureV2_(payload) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, getRequiredPropertyV2_('FEEDBACK_SECRET'))
  ).replace(/=+$/, '');
}

function constantTimeEqualsV2_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  var diff = 0;
  for (var index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function signFeedbackTokenV2_(localDate, candidateId, value, testMode) {
  var entry = { localDate: localDate, candidateId: candidateId, value: value, createdAt: 0 };
  if (!validFeedbackEntryV2_(entry)) throw new Error('Cannot sign an invalid feedback signal');
  var payload = feedbackPayloadV2_(localDate, candidateId, value, testMode);
  return {
    fb: Utilities.base64EncodeWebSafe(payload).replace(/=+$/, ''),
    s: feedbackSignatureV2_(payload)
  };
}

function verifyFeedbackTokenV2_(parameter, todayLocalDate) {
  if (!parameter || typeof parameter.fb !== 'string' || typeof parameter.s !== 'string') {
    throw new Error('Invalid feedback link');
  }
  var payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parameter.fb)).getDataAsString('UTF-8');
  } catch (_ignored) {
    throw new Error('Invalid feedback link');
  }
  if (!constantTimeEqualsV2_(feedbackSignatureV2_(payload), parameter.s)) {
    throw new Error('Invalid feedback link');
  }
  var parts = payload.split('|');
  if (parts.length !== 5 || parts[0] !== 'v1') throw new Error('Invalid feedback link');
  var token = { localDate: parts[1], candidateId: parts[2], value: parts[3], testMode: parts[4] === '1' };
  if (parts[4] !== '0' && parts[4] !== '1') throw new Error('Invalid feedback link');
  if (!validFeedbackEntryV2_({
    localDate: token.localDate, candidateId: token.candidateId, value: token.value, createdAt: 0
  })) {
    throw new Error('Invalid feedback link');
  }
  if (!feedbackDateWithinWindowV2_(token.localDate, todayLocalDate)) {
    throw new Error('Invalid feedback link');
  }
  return token;
}

function feedbackLinkUrlV2_(localDate, candidateId, value, testMode) {
  var token = signFeedbackTokenV2_(localDate, candidateId, value, testMode);
  return getRequiredPropertyV2_('WEB_APP_URL') + '?fb=' + token.fb + '&s=' + token.s;
}

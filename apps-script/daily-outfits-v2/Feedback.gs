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

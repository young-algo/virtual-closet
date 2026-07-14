function getJsonFileByPropertyV2_(propertyName, fallback) {
  var id = getDailyPropertiesV2_().getProperty(propertyName);
  if (!id) return fallback;
  try {
    return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  } catch (error) {
    throw new Error('Unable to read ' + propertyName + ': ' + error.message);
  }
}

function replaceJsonFileV2_(propertyName, fileName, value) {
  var properties = getDailyPropertiesV2_();
  var previousId = properties.getProperty(propertyName);
  var blob = Utilities.newBlob(JSON.stringify(value), 'application/json', fileName);
  var nextFile = DriveApp.createFile(blob);
  properties.setProperty(propertyName, nextFile.getId());
  if (previousId) {
    try { DriveApp.getFileById(previousId).setTrashed(true); } catch (_ignored) {}
  }
  return nextFile.getId();
}

function loadSnapshotV2_() {
  return getJsonFileByPropertyV2_('SNAPSHOT_FILE_ID_V2', null);
}

function saveSnapshotV2_(snapshot) {
  return replaceJsonFileV2_('SNAPSHOT_FILE_ID_V2', DAILY_V2.SNAPSHOT_FILE, snapshot);
}

function loadHistoryV2_() {
  return getJsonFileByPropertyV2_('HISTORY_FILE_ID_V2', []);
}

function saveHistoryV2_(history) {
  return replaceJsonFileV2_('HISTORY_FILE_ID_V2', DAILY_V2.HISTORY_FILE, history);
}

function loadWeatherCacheV2_() {
  return getJsonFileByPropertyV2_('WEATHER_CACHE_FILE_ID_V2', null);
}

function saveWeatherCacheV2_(weather) {
  return replaceJsonFileV2_('WEATHER_CACHE_FILE_ID_V2', DAILY_V2.WEATHER_FILE, weather);
}

function loadPendingV2_() {
  return getJsonFileByPropertyV2_('PENDING_BUNDLE_FILE_ID_V2', null);
}

function savePendingV2_(pending) {
  var id = replaceJsonFileV2_('PENDING_BUNDLE_FILE_ID_V2', DAILY_V2.PENDING_FILE, pending);
  return id;
}

function loadJobStateV2_() {
  return getJsonFileByPropertyV2_('JOB_STATE_FILE_ID_V2', null);
}

function saveJobStateV2_(state) {
  return replaceJsonFileV2_('JOB_STATE_FILE_ID_V2', DAILY_V2.JOB_FILE, state);
}

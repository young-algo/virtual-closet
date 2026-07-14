var DAILY_V2 = Object.freeze({
  SNAPSHOT_VERSION: 2,
  QUALITY_POLICY_VERSION: 2,
  SNAPSHOT_FILE: 'virtual-closet-daily-v2-snapshot.json',
  HISTORY_FILE: 'virtual-closet-daily-v2-history.json',
  WEATHER_FILE: 'virtual-closet-daily-v2-weather-cache.json',
  JOB_FILE: 'virtual-closet-daily-v2-job-state.json',
  PENDING_FILE: 'virtual-closet-daily-v2-pending-bundle.json',
  MAX_SNAPSHOT_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  MAX_WEATHER_AGE_MS: 6 * 60 * 60 * 1000,
  MAX_POST_BYTES: 45 * 1024 * 1024,
  GENERATION_CUTOFF_HOUR: 8,
  MIN_EXECUTION_REMAINING_MS: 45 * 1000,
  ARCHETYPES: ['easy', 'polished-casual', 'expressive'],
  REQUIRED_SLOTS: ['top', 'bottom', 'shoes']
});

function getDailyPropertiesV2_() {
  return PropertiesService.getScriptProperties();
}

function getRequiredPropertyV2_(name) {
  var value = getDailyPropertiesV2_().getProperty(name);
  if (!value) throw new Error('Missing required Script Property: ' + name);
  return value;
}

function getNumberPropertyV2_(name, fallback) {
  var raw = getDailyPropertiesV2_().getProperty(name);
  var value = raw === null ? fallback : Number(raw);
  if (!Number.isFinite(value)) throw new Error('Invalid numeric Script Property: ' + name);
  return value;
}

function getBooleanPropertyV2_(name, fallback) {
  var raw = getDailyPropertiesV2_().getProperty(name);
  if (raw === null) return fallback;
  return String(raw).toLowerCase() === 'true';
}

function getModelNameV2_(stage) {
  var keys = {
    planner: 'DAILY_PLANNER_MODEL',
    critic: 'DAILY_CRITIC_MODEL',
    curator: 'DAILY_CURATOR_MODEL',
    repair: 'DAILY_REPAIR_MODEL'
  };
  return getRequiredPropertyV2_(keys[stage]);
}

function getDailyConfigV2_() {
  return {
    recipientEmail: getDailyPropertiesV2_().getProperty('RECIPIENT_EMAIL') || 'kevincollinsturner@gmail.com',
    locationLabel: getDailyPropertiesV2_().getProperty('LOCATION_LABEL') || 'Brooklyn, NY',
    latitude: getNumberPropertyV2_('LATITUDE', 40.6782),
    longitude: getNumberPropertyV2_('LONGITUDE', -73.9442),
    timezone: getDailyPropertiesV2_().getProperty('TIME_ZONE') || 'America/New_York',
    deliveryHour: getNumberPropertyV2_('DELIVERY_HOUR', 6),
    deliveryMinute: getNumberPropertyV2_('DELIVERY_MINUTE', 45),
    generationLeadMinutes: getNumberPropertyV2_('GENERATION_LEAD_MINUTES', 75),
    appUrl: getDailyPropertiesV2_().getProperty('APP_URL') || '',
    sendOperationalAlerts: getBooleanPropertyV2_('SEND_OPERATIONAL_ALERTS', false)
  };
}

function applySnapshotSettingsV2_(config, snapshot) {
  var settings = snapshot && snapshot.settings;
  if (!settings) return config;
  return Object.assign({}, config, {
    recipientEmail: settings.recipientEmail || config.recipientEmail,
    locationLabel: settings.locationLabel || config.locationLabel,
    latitude: Number.isFinite(Number(settings.latitude)) ? Number(settings.latitude) : config.latitude,
    longitude: Number.isFinite(Number(settings.longitude)) ? Number(settings.longitude) : config.longitude,
    timezone: settings.timezone || config.timezone,
    deliveryHour: Number.isFinite(Number(settings.deliveryHour)) ? Number(settings.deliveryHour) : config.deliveryHour,
    deliveryMinute: Number.isFinite(Number(settings.deliveryMinute)) ? Number(settings.deliveryMinute) : config.deliveryMinute,
    generationLeadMinutes: Number.isFinite(Number(settings.generationLeadMinutes)) ? Number(settings.generationLeadMinutes) : config.generationLeadMinutes,
    enabled: settings.enabled !== false
  });
}

function localDateV2_(date, timezone) {
  return Utilities.formatDate(date || new Date(), timezone, 'yyyy-MM-dd');
}

function localMinutesV2_(date, timezone) {
  var hour = Number(Utilities.formatDate(date || new Date(), timezone, 'H'));
  var minute = Number(Utilities.formatDate(date || new Date(), timezone, 'm'));
  return hour * 60 + minute;
}

function newRunIdV2_() {
  return Utilities.getUuid();
}

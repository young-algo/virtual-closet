import type { DailyOutfitSettingsV2 } from './types';

export const DEFAULT_DAILY_OUTFIT_SETTINGS: DailyOutfitSettingsV2 = {
  enabled: true,
  recipientEmail: 'kevincollinsturner@gmail.com',
  locationQuery: 'Brooklyn, New York',
  locationLabel: 'Brooklyn, NY',
  latitude: 40.6782,
  longitude: -73.9442,
  timezone: 'America/New_York',
  deliveryHour: 6,
  deliveryMinute: 45,
  generationLeadMinutes: 75,
  temperatureUnit: 'fahrenheit',
  coldSensitivity: 0,
  allowShoeReuseWhenNecessary: true,
  maxDailyHistoryDays: 30,
  appsScriptUrl: '',
  syncSecret: ''
};

export const publicDailySettings = ({ appsScriptUrl: _url, syncSecret: _secret, ...publicSettings }: DailyOutfitSettingsV2) => publicSettings;

export const isDailyServerConfigured = (settings: DailyOutfitSettingsV2): boolean =>
  /^https:\/\/script\.google\.com\//.test(settings.appsScriptUrl.trim()) && settings.syncSecret.trim().length >= 16;

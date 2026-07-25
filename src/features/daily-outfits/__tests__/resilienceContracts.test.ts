import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const weatherResponse = (status: number, body: unknown) => ({
  getResponseCode: () => status,
  getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body))
});

const nwsPointsFixture = {
  properties: { forecastHourly: 'https://api.weather.gov/gridpoints/OKX/36,41/forecast/hourly' }
};

const nwsPeriod = (
  startTime: string,
  temperature: number,
  humidity: number,
  pop: number,
  windSpeed: string,
  shortForecast: string
) => ({
  startTime,
  endTime: startTime,
  isDaytime: true,
  temperature,
  temperatureUnit: 'F',
  probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: pop },
  relativeHumidity: { unitCode: 'wmoUnit:percent', value: humidity },
  windSpeed,
  shortForecast
});

const nwsHourlyFixture = {
  properties: {
    periods: [
      nwsPeriod('2026-07-19T05:00:00-04:00', 59, 75, 0, '5 mph', 'Clear'),
      nwsPeriod('2026-07-19T06:00:00-04:00', 61, 70, 0, '6 mph', 'Partly Cloudy'),
      nwsPeriod('2026-07-19T09:00:00-04:00', 66, 65, 10, '8 mph', 'Mostly Sunny'),
      nwsPeriod('2026-07-19T12:00:00-04:00', 74, 55, 55, '12 mph', 'Chance Rain Showers'),
      nwsPeriod('2026-07-19T15:00:00-04:00', 78, 50, 60, '10 to 14 mph', 'Rain Showers'),
      nwsPeriod('2026-07-19T18:00:00-04:00', 72, 60, 30, '10 mph', 'Partly Cloudy'),
      nwsPeriod('2026-07-19T21:00:00-04:00', 66, 70, 10, '7 mph', 'Clear'),
      nwsPeriod('2026-07-20T00:00:00-04:00', 60, 80, 0, '5 mph', 'Clear')
    ]
  }
};

const weatherChainScope = (fetch: (url: string) => unknown, overrides: Record<string, unknown> = {}) => ({
  DAILY_V2: { MAX_WEATHER_AGE_MS: 6 * 60 * 60 * 1000 },
  UrlFetchApp: { fetch },
  Utilities: { sleep: vi.fn() },
  applySnapshotSettingsV2_: (config: object) => config,
  getDailyConfigV2_: () => ({ latitude: 40.6782, longitude: -73.9442, timezone: 'America/New_York', locationLabel: 'Brooklyn, NY' }),
  getDailyPropertiesV2_: () => ({ getProperty: () => null }),
  loadSnapshotV2_: () => ({}),
  loadWeatherCacheV2_: () => null,
  saveWeatherCacheV2_: vi.fn(),
  localDateV2_: () => '2026-07-19',
  encodeURIComponent,
  console,
  ...overrides
});

describe('Daily V2 resilience contracts', () => {
  it('uses a same-day fresh cache when UrlFetchApp.fetch throws', () => {
    const cached = { localDate: '2026-07-14', fetchedAt: 9_000, highTemperatureF: 80 };
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', {
      DAILY_V2: { MAX_WEATHER_AGE_MS: 6 * 60 * 60 * 1000 },
      UrlFetchApp: { fetch: () => { throw new Error('DNS timeout'); } },
      Utilities: { sleep: vi.fn() },
      applySnapshotSettingsV2_: (config: object) => config,
      getDailyConfigV2_: () => ({ latitude: 1, longitude: 2, timezone: 'America/New_York', locationLabel: 'Brooklyn, NY' }),
      loadSnapshotV2_: () => ({}),
      loadWeatherCacheV2_: () => cached,
      localDateV2_: () => '2026-07-14',
      Date: class extends Date { static now() { return 10_000; } },
      encodeURIComponent,
      console
    });
    expect(fetchDailyWeatherV2_()).toBe(cached);
  });

  it('returns a same-day fresh cache without any network fetch', () => {
    const cached = { localDate: '2026-07-19', fetchedAt: 9_000, highTemperatureF: 80 };
    const fetch = vi.fn();
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', weatherChainScope(fetch, {
      loadWeatherCacheV2_: () => cached,
      Date: class extends Date { static now() { return 10_000; } }
    }));
    expect(fetchDailyWeatherV2_()).toBe(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the NWS provider when Open-Meteo is rate limited', () => {
    const urls: string[] = [];
    const fetch = (url: string) => {
      urls.push(url);
      if (url.indexOf('api.open-meteo.com') >= 0) return weatherResponse(429, 'Too Many Requests');
      if (url.indexOf('api.weather.gov/points/') >= 0) return weatherResponse(200, nwsPointsFixture);
      if (url.indexOf('forecast/hourly') >= 0) return weatherResponse(200, nwsHourlyFixture);
      throw new Error('unexpected url: ' + url);
    };
    const scope = weatherChainScope(fetch);
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => Record<string, unknown>>(['Weather.gs'], 'fetchDailyWeatherV2', scope);
    const profile = fetchDailyWeatherV2_();
    expect(profile.localDate).toBe('2026-07-19');
    expect(profile.locationLabel).toBe('Brooklyn, NY');
    expect(profile.highTemperatureF).toBe(78);
    expect(profile.lowTemperatureF).toBe(59);
    expect(profile.maxRainProbability).toBe(60);
    expect(profile.rainExpected).toBe(true);
    expect(profile.weatherPhrase).toBe('showery');
    expect(profile.maxWindMph).toBe(14);
    expect(profile.windy).toBe(false);
    expect(Number.isFinite(profile.morningFeelsLikeF)).toBe(true);
    expect(scope.saveWeatherCacheV2_).toHaveBeenCalledOnce();
    expect(urls).toHaveLength(3);
    expect((scope.Utilities as { sleep: ReturnType<typeof vi.fn> }).sleep).not.toHaveBeenCalled();
  });

  it('retries transport exceptions once and still reaches the NWS fallback', () => {
    let openMeteoAttempts = 0;
    const fetch = (url: string) => {
      if (url.indexOf('api.open-meteo.com') >= 0) {
        openMeteoAttempts += 1;
        throw new Error('DNS timeout');
      }
      if (url.indexOf('api.weather.gov/points/') >= 0) return weatherResponse(200, nwsPointsFixture);
      if (url.indexOf('forecast/hourly') >= 0) return weatherResponse(200, nwsHourlyFixture);
      throw new Error('unexpected url: ' + url);
    };
    const scope = weatherChainScope(fetch);
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => Record<string, unknown>>(['Weather.gs'], 'fetchDailyWeatherV2', scope);
    expect(fetchDailyWeatherV2_().localDate).toBe('2026-07-19');
    expect(openMeteoAttempts).toBe(2);
    expect((scope.Utilities as { sleep: ReturnType<typeof vi.fn> }).sleep).toHaveBeenCalledOnce();
  });

  it('names every provider failure when the whole chain is exhausted', () => {
    const fetch = (url: string) => {
      if (url.indexOf('api.open-meteo.com') >= 0) return weatherResponse(429, 'Too Many Requests');
      if (url.indexOf('api.weather.gov/points/') >= 0) return weatherResponse(503, 'Service Unavailable');
      throw new Error('unexpected url: ' + url);
    };
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', weatherChainScope(fetch));
    let thrown: Error | null = null;
    try {
      fetchDailyWeatherV2_();
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toMatch(/^Weather service unavailable: /);
    expect(thrown?.message).toContain('open-meteo HTTP 429');
    expect(thrown?.message).toContain('nws-points HTTP 503');
  });

  it('computes NWS feels-like temperatures with heat index and wind chill', () => {
    const feelsLike = evaluateAppsScript<(t: number, rh: number, wind: number) => number>(['Weather.gs'], 'nwsFeelsLikeFV2_');
    expect(feelsLike(95, 60, 5)).toBeGreaterThan(105);
    expect(feelsLike(30, 50, 20)).toBeLessThan(22);
    expect(feelsLike(70, 50, 5)).toBe(70);
  });

  it('maps NWS short forecasts onto weather-code phrases', () => {
    const scope = { console } as Record<string, unknown>;
    const phraseFor = evaluateAppsScript<(shortForecast: string) => string>(
      ['Weather.gs'],
      '(function(text) { return weatherCodePhraseV2_(nwsWeatherCodeV2_(text)); })',
      scope
    );
    expect(phraseFor('Sunny')).toBe('clear');
    expect(phraseFor('Partly Cloudy')).toBe('partly cloudy');
    expect(phraseFor('Patchy Fog')).toBe('foggy');
    expect(phraseFor('Light Rain')).toBe('rainy');
    expect(phraseFor('Snow')).toBe('snowy');
    expect(phraseFor('Chance Rain Showers')).toBe('showery');
    expect(phraseFor('Showers And Thunderstorms')).toBe('stormy');
  });

  it('returns the original scheduler error when config fallback also fails', () => {
    const lock = { tryLock: () => true, releaseLock: vi.fn() };
    const logger = { error: vi.fn() };
    const run = evaluateAppsScript<() => { ok: boolean; error: string }>(['Scheduler.gs'], 'runDailyOutfitScheduler', {
      LockService: { getScriptLock: () => lock },
      assertFreshSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      loadSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      getDailyConfigV2_: () => { throw new Error('properties unavailable'); },
      console: logger
    });
    expect(run()).toEqual(expect.objectContaining({ ok: false, error: 'Drive unavailable' }));
    expect(lock.releaseLock).toHaveBeenCalledOnce();
  });

  it.each([
    ['cache loading', {
      loadWeatherCacheV2_: () => { throw new Error('cache unavailable'); }
    }],
    ['local-date calculation', {
      loadWeatherCacheV2_: () => ({ localDate: '2026-07-14', fetchedAt: 9_000 }),
      localDateV2_: () => { throw new Error('date unavailable'); }
    }],
    ['cache-age calculation', {
      loadWeatherCacheV2_: () => ({ localDate: '2026-07-14', fetchedAt: 9_000 }),
      Date: class extends Date { static now(): never { throw new Error('clock unavailable'); } }
    }]
  ])('surfaces the provider failures when %s fails during the cache gate', (_label, overrides) => {
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', weatherChainScope(
      () => { throw new Error('DNS timeout'); },
      {
        getDailyConfigV2_: () => ({ latitude: 1, longitude: 2, timezone: 'America/New_York', locationLabel: 'Brooklyn, NY' }),
        localDateV2_: () => '2026-07-14',
        Date: class extends Date { static now() { return 10_000; } },
        ...overrides
      }
    ));

    let thrown: Error | null = null;
    try {
      fetchDailyWeatherV2_();
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toMatch(/^Weather service unavailable: /);
    expect(thrown?.message).toContain('DNS timeout');
  });

  it('returns the original scheduler error when diagnostic logging and the handler fail', () => {
    const lock = { tryLock: () => true, releaseLock: vi.fn() };
    const logger = { error: vi.fn(() => { throw new Error('logger unavailable'); }) };
    const run = evaluateAppsScript<() => { ok: boolean; error: string }>(['Scheduler.gs'], 'runDailyOutfitScheduler', {
      LockService: { getScriptLock: () => lock },
      loadSnapshotV2_: () => ({}),
      assertFreshSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      getDailyConfigV2_: () => ({ timezone: 'America/New_York' }),
      localMinutesV2_: () => { throw new Error('time calculation unavailable'); },
      console: logger
    });

    expect(run()).toEqual(expect.objectContaining({ ok: false, error: 'Drive unavailable' }));
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(lock.releaseLock).toHaveBeenCalledOnce();
  });

  it('does not rewrite history when the queued signals are already byte-equal, and does not reorder them', () => {
    const signalA = { localDate: '2026-07-13', candidateId: 'easy-1', value: 'wore', createdAt: 2 };
    const signalB = { localDate: '2026-07-13', candidateId: 'expressive-2', value: 'liked', createdAt: 3 };
    const history = [{
      localDate: '2026-07-13',
      recommendations: [
        { candidateId: 'easy-1', itemIds: ['a'] },
        { candidateId: 'expressive-2', itemIds: ['b'] }
      ],
      feedback: [signalA, signalB]
    }];
    const saveHistoryV2_ = vi.fn();
    const merge = evaluateAppsScript<() => boolean>(['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', {
      DAILY_V2: { FEEDBACK_VALUES: ['liked', 'disliked', 'wore'], MAX_EMAIL_FEEDBACK_AGE_DAYS: 30 },
      getDailyConfigV2_: () => ({ timezone: 'America/New_York' }),
      localDateV2_: () => '2026-07-13',
      shoeRotationCalendarOrdinalV2_: (localDate: string) =>
        Math.floor(Date.UTC(
          Number(localDate.slice(0, 4)),
          Number(localDate.slice(5, 7)) - 1,
          Number(localDate.slice(8, 10))
        ) / 86400000),
      loadHistoryV2_: () => history,
      saveHistoryV2_,
      loadEmailFeedbackV2_: () => [signalA, signalB],
      saveEmailFeedbackV2_: vi.fn(),
      itemMapV2_: () => ({}),
    });
    expect(merge()).toBe(false);
    expect(saveHistoryV2_).not.toHaveBeenCalled();
    expect(history[0].feedback).toEqual([signalA, signalB]);
  });
});

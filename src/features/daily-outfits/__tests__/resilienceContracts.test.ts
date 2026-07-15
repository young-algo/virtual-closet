import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

describe('Daily V2 resilience contracts', () => {
  it('uses a same-day fresh cache when UrlFetchApp.fetch throws', () => {
    const cached = { localDate: '2026-07-14', fetchedAt: 9_000, highTemperatureF: 80 };
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', {
      DAILY_V2: { MAX_WEATHER_AGE_MS: 6 * 60 * 60 * 1000 },
      UrlFetchApp: { fetch: () => { throw new Error('DNS timeout'); } },
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
  ])('rethrows the original fetch error when %s fails during the cache gate', (_label, overrides) => {
    const fetchError = new Error('DNS timeout');
    const fetchDailyWeatherV2_ = evaluateAppsScript<() => object>(['Weather.gs'], 'fetchDailyWeatherV2', {
      DAILY_V2: { MAX_WEATHER_AGE_MS: 6 * 60 * 60 * 1000 },
      UrlFetchApp: { fetch: () => { throw fetchError; } },
      applySnapshotSettingsV2_: (config: object) => config,
      getDailyConfigV2_: () => ({ latitude: 1, longitude: 2, timezone: 'America/New_York', locationLabel: 'Brooklyn, NY' }),
      loadSnapshotV2_: () => ({}),
      localDateV2_: () => '2026-07-14',
      Date: class extends Date { static now() { return 10_000; } },
      encodeURIComponent,
      ...overrides
    });

    let thrown: unknown;
    try {
      fetchDailyWeatherV2_();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(fetchError);
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

  it('does not reorder or rewrite history when multiple synchronized feedback entries are byte-equal', () => {
    const firstFeedback = { localDate: '2026-07-13', candidateId: 'easy-1', value: 'liked', createdAt: 1 };
    const secondFeedback = { localDate: '2026-07-13', candidateId: 'easy-2', value: 'wore', createdAt: 2 };
    const history = [{ localDate: '2026-07-13', feedback: [firstFeedback, secondFeedback] }];
    const saveHistoryV2_ = vi.fn();
    const merge = evaluateAppsScript<(snapshot: object) => boolean>(['Taste.gs'], 'mergeSnapshotFeedbackIntoHistoryV2_', {
      loadHistoryV2_: () => history,
      saveHistoryV2_,
      itemMapV2_: () => ({}),
    });
    expect(merge({ dailyFeedback: [firstFeedback, secondFeedback] })).toBe(false);
    expect(saveHistoryV2_).not.toHaveBeenCalled();
    expect(history[0].feedback).toEqual([firstFeedback, secondFeedback]);
  });
});

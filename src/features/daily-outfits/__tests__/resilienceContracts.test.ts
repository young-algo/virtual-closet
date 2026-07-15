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
    const run = evaluateAppsScript<() => { ok: boolean; error: string }>(['Scheduler.gs'], 'runDailyOutfitScheduler', {
      LockService: { getScriptLock: () => lock },
      assertFreshSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      loadSnapshotV2_: () => { throw new Error('Drive unavailable'); },
      getDailyConfigV2_: () => { throw new Error('properties unavailable'); },
      console
    });
    expect(run()).toEqual(expect.objectContaining({ ok: false, error: 'Drive unavailable' }));
    expect(lock.releaseLock).toHaveBeenCalledOnce();
  });

  it('does not rewrite history when synchronized feedback is byte-equal', () => {
    const feedback = { localDate: '2026-07-13', candidateId: 'easy-1', value: 'liked', createdAt: 1 };
    const saveHistoryV2_ = vi.fn();
    const merge = evaluateAppsScript<(snapshot: object) => boolean>(['Taste.gs'], 'mergeSnapshotFeedbackIntoHistoryV2_', {
      loadHistoryV2_: () => [{ localDate: '2026-07-13', feedback: [feedback] }],
      saveHistoryV2_,
      itemMapV2_: () => ({}),
      console
    });
    expect(merge({ dailyFeedback: [feedback] })).toBe(false);
    expect(saveHistoryV2_).not.toHaveBeenCalled();
  });
});

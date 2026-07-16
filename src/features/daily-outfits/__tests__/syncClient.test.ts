import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DAILY_OUTFIT_SETTINGS } from '../settings';
import { DAILY_STORAGE_KEYS } from '../storage';
import { callDailyServer } from '../syncClient';
import { makeDailyBundle, makeMalformedDailyBundles } from './dailyBundleTestFixtures';
import { MemoryStorage } from './testStorage';

const settings = {
  ...DEFAULT_DAILY_OUTFIT_SETTINGS,
  appsScriptUrl: 'https://script.google.com/example',
  syncSecret: 'test-secret-value',
};

const responseWithBody = (body: Record<string, unknown>): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({ ok: true, ...body }),
}) as unknown as Response;

const responseWithBundle = (bundle: unknown): Response => responseWithBody({ bundle });

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('daily server bundle ingestion', () => {
  it.each(makeMalformedDailyBundles())(
    'rejects malformed server bundle and preserves the last good cache: %s',
    async (_name, malformed) => {
      const lastGood = makeDailyBundle(['easy', 'expressive']);
      const lastGoodJson = JSON.stringify(lastGood);
      storage.setItem(DAILY_STORAGE_KEYS.lastBundle, lastGoodJson);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithBundle(malformed)));

      await expect(callDailyServer('generateDailyBundleNowV2', settings)).rejects.toThrowError(/DailyBundleV2/);
      expect(storage.getItem(DAILY_STORAGE_KEYS.lastBundle)).toBe(lastGoodJson);
    },
  );

  it('returns and caches the validated server bundle', async () => {
    const bundle = makeDailyBundle(['easy', 'expressive']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithBundle(bundle)));

    const response = await callDailyServer('generateDailyBundleNowV2', settings);

    expect(response.bundle).toEqual(bundle);
    expect(JSON.parse(storage.getItem(DAILY_STORAGE_KEYS.lastBundle) ?? 'null')).toEqual(bundle);
  });

  it('returns an incomplete null-bundle generation step without mutating the last good cache', async () => {
    const lastGood = makeDailyBundle(['easy', 'expressive']);
    const lastGoodJson = JSON.stringify(lastGood);
    storage.setItem(DAILY_STORAGE_KEYS.lastBundle, lastGoodJson);
    const writesBeforeCall = storage.writes.length;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithBody({
      complete: false,
      stage: 'weather-ready',
      bundle: null,
    })));

    const response = await callDailyServer('generateDailyBundleStepV2', settings);

    expect(response).toEqual({ ok: true, complete: false, stage: 'weather-ready', bundle: null });
    expect(storage.getItem(DAILY_STORAGE_KEYS.lastBundle)).toBe(lastGoodJson);
    expect(storage.writes).toHaveLength(writesBeforeCall);
  });

  it.each([
    'syncDailySnapshotV2',
    'validateStoredSnapshotV2',
    'getDailyOutfitDiagnosticsV2',
    'generateDailyBundleNowV2',
    'sendDailyTestEmailV2',
  ] as const)('rejects a null bundle from non-step action %s', async action => {
    const lastGoodJson = JSON.stringify(makeDailyBundle());
    storage.setItem(DAILY_STORAGE_KEYS.lastBundle, lastGoodJson);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithBody({ complete: false, bundle: null })));

    await expect(callDailyServer(action, settings)).rejects.toThrowError(/DailyBundleV2/);
    expect(storage.getItem(DAILY_STORAGE_KEYS.lastBundle)).toBe(lastGoodJson);
  });

  it.each([
    ['complete', true],
    ['missing complete', undefined],
  ] as const)('rejects a null step bundle when the response is %s', async (_label, complete) => {
    const lastGoodJson = JSON.stringify(makeDailyBundle());
    storage.setItem(DAILY_STORAGE_KEYS.lastBundle, lastGoodJson);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithBody({ bundle: null, complete })));

    await expect(callDailyServer('generateDailyBundleStepV2', settings)).rejects.toThrowError(/DailyBundleV2/);
    expect(storage.getItem(DAILY_STORAGE_KEYS.lastBundle)).toBe(lastGoodJson);
  });

  it('continues from an incomplete null step to a complete validated bundle', async () => {
    const lastGood = makeDailyBundle(['easy']);
    const lastGoodJson = JSON.stringify(lastGood);
    const generated = makeDailyBundle(['easy', 'expressive']);
    storage.setItem(DAILY_STORAGE_KEYS.lastBundle, lastGoodJson);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseWithBody({ complete: false, stage: 'selection-ready', bundle: null }))
      .mockResolvedValueOnce(responseWithBody({ complete: true, stage: 'bundle-ready', bundle: generated }));
    vi.stubGlobal('fetch', fetchMock);

    const intermediate = await callDailyServer('generateDailyBundleStepV2', settings);
    expect(intermediate.bundle).toBeNull();
    expect(intermediate.complete).toBe(false);
    expect(storage.getItem(DAILY_STORAGE_KEYS.lastBundle)).toBe(lastGoodJson);

    const complete = await callDailyServer('generateDailyBundleStepV2', settings);
    expect(complete.bundle).toEqual(generated);
    expect(complete.complete).toBe(true);
    expect(JSON.parse(storage.getItem(DAILY_STORAGE_KEYS.lastBundle) ?? 'null')).toEqual(generated);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

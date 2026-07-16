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

const responseWithBundle = (bundle: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({ ok: true, bundle }),
}) as unknown as Response;

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
});

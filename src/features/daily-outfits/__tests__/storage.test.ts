import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_OUTFIT_SETTINGS } from '../settings';
import {
  DAILY_STORAGE_KEYS,
  PROHIBITED_DAILY_WRITE_KEYS,
  loadLastDailyBundle,
  saveAtlasManifest,
  saveDailyFeedback,
  saveDailySettings,
  saveDailySyncStatus,
  saveLastDailyBundle
} from '../storage';
import { emptyAtlasManifest } from '../atlasBuilder';
import { MemoryStorage } from './testStorage';
import { makeDailyBundle, makeLegacyThreeLookBundle, makeMalformedDailyBundles } from './dailyBundleTestFixtures';
import type { DailyBundleV2 } from '../types';

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

describe('daily-only storage', () => {
  it('writes exclusively to the v2 daily namespace', () => {
    saveDailySettings(DEFAULT_DAILY_OUTFIT_SETTINGS);
    saveDailyFeedback([]);
    saveDailySyncStatus({ state: 'idle' });
    saveAtlasManifest(emptyAtlasManifest());
    saveLastDailyBundle(makeDailyBundle());
    expect(new Set(storage.writes)).toEqual(new Set(Object.values(DAILY_STORAGE_KEYS)));
    expect(storage.writes.every(key => key.startsWith('daily_outfits_'))).toBe(true);
    expect(storage.writes.some(key => PROHIBITED_DAILY_WRITE_KEYS.has(key))).toBe(false);
  });

  it.each(makeMalformedDailyBundles())('rejects malformed cached bundle: %s', (_name, malformed) => {
    storage.setItem(DAILY_STORAGE_KEYS.lastBundle, JSON.stringify(malformed));

    expect(loadLastDailyBundle()).toBeNull();
  });

  it('accepts only the exact configured-order legacy three-look cache without coverage', () => {
    storage.setItem(DAILY_STORAGE_KEYS.lastBundle, JSON.stringify(makeLegacyThreeLookBundle()));

    expect(loadLastDailyBundle()).toEqual(expect.objectContaining({
      coverage: {
        deliveryMode: 'complete',
        selectedArchetypes: ['easy', 'polished-casual', 'expressive'],
        omittedArchetypes: [],
      },
    }));
  });

  it.each(makeMalformedDailyBundles())('rejects malformed bundle save without writing: %s', (_name, malformed) => {
    expect(() => saveLastDailyBundle(malformed as DailyBundleV2)).toThrowError(/DailyBundleV2/);
    expect(storage.writes).not.toContain(DAILY_STORAGE_KEYS.lastBundle);
    expect(storage.getItem(DAILY_STORAGE_KEYS.lastBundle)).toBeNull();
  });
});

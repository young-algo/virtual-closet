import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_OUTFIT_SETTINGS } from '../settings';
import {
  DAILY_STORAGE_KEYS,
  PROHIBITED_DAILY_WRITE_KEYS,
  saveAtlasManifest,
  saveDailyFeedback,
  saveDailySettings,
  saveDailySyncStatus,
  saveLastDailyBundle
} from '../storage';
import { emptyAtlasManifest } from '../atlasBuilder';
import { MemoryStorage } from './testStorage';

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
    saveLastDailyBundle({ version: 2 } as never);
    expect(new Set(storage.writes)).toEqual(new Set(Object.values(DAILY_STORAGE_KEYS)));
    expect(storage.writes.every(key => key.startsWith('daily_outfits_'))).toBe(true);
    expect(storage.writes.some(key => PROHIBITED_DAILY_WRITE_KEYS.has(key))).toBe(false);
  });
});

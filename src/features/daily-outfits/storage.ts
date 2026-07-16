import type { DailyAtlasManifestV2, DailyBundleV2, DailyFeedbackV2, DailyOutfitSettingsV2, DailySyncStatusV2 } from './types';
import { parseDailyBundleV2, tryParseCachedDailyBundleV2 } from './dailyBundleParser';

export const DAILY_STORAGE_KEYS = {
  settings: 'daily_outfits_settings_v2',
  feedback: 'daily_outfits_feedback_v2',
  lastBundle: 'daily_outfits_last_bundle_v2',
  syncStatus: 'daily_outfits_sync_status_v2',
  atlasManifest: 'daily_outfits_atlas_manifest_v2'
} as const;

export const PROHIBITED_DAILY_WRITE_KEYS = new Set([
  'closet_items',
  'sneaker_items',
  'closet_outfits',
  'closet_packed_items',
  'stylist_recent_item_ids'
]);

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch (error) {
    console.warn(`Unable to read ${key}`, error);
    return fallback;
  }
};

const writeDailyJson = (key: string, value: unknown): void => {
  if (!key.startsWith('daily_outfits_') || PROHIBITED_DAILY_WRITE_KEYS.has(key)) {
    throw new Error(`Daily outfits attempted to write outside its namespace: ${key}`);
  }
  localStorage.setItem(key, JSON.stringify(value));
};

export const loadDailySettings = (defaults: DailyOutfitSettingsV2): DailyOutfitSettingsV2 => ({
  ...defaults,
  ...readJson<Partial<DailyOutfitSettingsV2>>(DAILY_STORAGE_KEYS.settings, {})
});
export const saveDailySettings = (settings: DailyOutfitSettingsV2) => writeDailyJson(DAILY_STORAGE_KEYS.settings, settings);
export const loadDailyFeedback = () => readJson<DailyFeedbackV2[]>(DAILY_STORAGE_KEYS.feedback, []);
export const saveDailyFeedback = (feedback: DailyFeedbackV2[]) => writeDailyJson(DAILY_STORAGE_KEYS.feedback, feedback);
export const loadLastDailyBundle = (): DailyBundleV2 | null => (
  tryParseCachedDailyBundleV2(readJson<unknown>(DAILY_STORAGE_KEYS.lastBundle, null))
);
export const saveLastDailyBundle = (bundle: DailyBundleV2) => (
  writeDailyJson(DAILY_STORAGE_KEYS.lastBundle, parseDailyBundleV2(bundle))
);
export const loadDailySyncStatus = () => readJson<DailySyncStatusV2>(DAILY_STORAGE_KEYS.syncStatus, { state: 'idle' });
export const saveDailySyncStatus = (status: DailySyncStatusV2) => writeDailyJson(DAILY_STORAGE_KEYS.syncStatus, status);
export const loadAtlasManifest = (fallback: DailyAtlasManifestV2) => readJson<DailyAtlasManifestV2>(DAILY_STORAGE_KEYS.atlasManifest, fallback);
export const saveAtlasManifest = (manifest: DailyAtlasManifestV2) => writeDailyJson(DAILY_STORAGE_KEYS.atlasManifest, manifest);

const DB_NAME = 'virtual-closet-daily-v2';
const DB_VERSION = 1;
export type DailyObjectStore = 'item_thumbnails' | 'atlas_pages' | 'last_bundle';

const openDailyDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const store of ['item_thumbnails', 'atlas_pages', 'last_bundle'] as DailyObjectStore[]) {
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Unable to open daily outfit cache'));
});

export const idbGet = async <T>(store: DailyObjectStore, key: string): Promise<T | undefined> => {
  const db = await openDailyDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
};

export const idbPut = async (store: DailyObjectStore, key: string, value: unknown): Promise<void> => {
  const db = await openDailyDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
};

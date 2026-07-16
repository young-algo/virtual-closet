import { saveDailySyncStatus, saveLastDailyBundle } from './storage';
import { parseDailyBundleV2 } from './dailyBundleParser';
import type {
  DailyBundleV2,
  DailyClosetSnapshotV2,
  DailyOutfitDiagnosticsV2,
  DailyOutfitSettingsV2,
  DailySyncStatusV2,
} from './types';

export type DailyServerAction =
  | 'syncDailySnapshotV2'
  | 'validateStoredSnapshotV2'
  | 'getDailyOutfitDiagnosticsV2'
  | 'generateDailyBundleNowV2'
  | 'generateDailyBundleStepV2'
  | 'sendDailyTestEmailV2';

export interface DailyServerResponse {
  ok: boolean;
  action?: string;
  message?: string;
  error?: string;
  bundle?: DailyBundleV2;
  diagnostics?: DailyOutfitDiagnosticsV2;
  complete?: boolean;
  stage?: string;
  [key: string]: unknown;
}

export const callDailyServer = async (
  action: DailyServerAction,
  settings: DailyOutfitSettingsV2,
  snapshot?: DailyClosetSnapshotV2
): Promise<DailyServerResponse> => {
  if (!settings.appsScriptUrl || !settings.syncSecret) throw new Error('Add the Apps Script URL and sync secret first.');
  const response = await fetch(settings.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, secret: settings.syncSecret, ...(snapshot ? { snapshot } : {}) }),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Daily server returned HTTP ${response.status}`);
  const body = await response.json() as DailyServerResponse;
  if (!body.ok) throw new Error(body.error || body.message || 'Daily server request failed');
  if (body.bundle !== undefined) {
    const bundle = parseDailyBundleV2(body.bundle);
    saveLastDailyBundle(bundle);
    return { ...body, bundle };
  }
  return body;
};

export const syncDailySnapshot = async (snapshot: DailyClosetSnapshotV2, settings: DailyOutfitSettingsV2): Promise<DailyServerResponse> => {
  const attemptAt = Date.now();
  const syncing: DailySyncStatusV2 = {
    state: 'syncing',
    lastAttemptAt: attemptAt,
    wardrobeFingerprint: snapshot.wardrobeFingerprint,
    itemCount: snapshot.items.length,
    atlasPageCount: snapshot.atlasPages.length
  };
  saveDailySyncStatus(syncing);
  try {
    const response = await callDailyServer('syncDailySnapshotV2', settings, snapshot);
    saveDailySyncStatus({ ...syncing, state: 'synced', lastSuccessAt: Date.now(), message: response.message ?? 'Snapshot synchronized.' });
    return response;
  } catch (error) {
    saveDailySyncStatus({ ...syncing, state: 'error', message: error instanceof Error ? error.message : 'Snapshot sync failed' });
    throw error;
  }
};

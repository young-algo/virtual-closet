import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CloudSun, LoaderCircle, X } from 'lucide-react';
import { buildDailySnapshot, type SnapshotBuildProgress } from './snapshotBuilder';
import { DEFAULT_DAILY_OUTFIT_SETTINGS, isDailyServerConfigured } from './settings';
import {
  loadDailySettings,
  loadDailySyncStatus,
  loadLastDailyBundle,
  saveDailySettings,
  saveDailySyncStatus
} from './storage';
import { callDailyServer, syncDailySnapshot, type DailyServerAction } from './syncClient';
import type {
  DailyBundleV2,
  DailyOutfitDiagnosticsV2,
  DailyOutfitSettingsV2,
  DailySourceItem,
  DailySyncStatusV2,
  DailyTasteSource,
} from './types';
import DailyBundlePreview from './DailyBundlePreview';
import './daily-outfits.css';

interface Props {
  open: boolean;
  onClose: () => void;
  items: DailySourceItem[];
  outfits: DailyTasteSource[];
}

const formatSyncTime = (timestamp?: number) => timestamp
  ? new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Never';

export default function DailyOutfitSettings({ open, onClose, items, outfits }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstAutomaticSync = useRef(true);
  const [settings, setSettings] = useState<DailyOutfitSettingsV2>(() => loadDailySettings(DEFAULT_DAILY_OUTFIT_SETTINGS));
  const [bundle, setBundle] = useState<DailyBundleV2 | null>(loadLastDailyBundle);
  const [status, setStatus] = useState<DailySyncStatusV2>(loadDailySyncStatus);
  const [progress, setProgress] = useState<SnapshotBuildProgress | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [diagnostics, setDiagnostics] = useState<DailyOutfitDiagnosticsV2 | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const configured = isDailyServerConfigured(settings);
  const saveSettings = (next: DailyOutfitSettingsV2) => {
    setSettings(next);
    saveDailySettings(next);
  };

  const buildSnapshot = useCallback(async () => {
    setStatus(previous => ({ ...previous, state: 'building', message: 'Preparing the complete wardrobe…' }));
    const snapshot = await buildDailySnapshot(items, outfits, settings, setProgress);
    setStatus(previous => ({
      ...previous,
      state: 'idle',
      wardrobeFingerprint: snapshot.wardrobeFingerprint,
      itemCount: snapshot.items.length,
      atlasPageCount: snapshot.atlasPages.length,
      message: `${snapshot.items.length} items across ${snapshot.atlasPages.length} atlas pages.`
    }));
    setProgress(null);
    return snapshot;
  }, [items, outfits, settings]);

  const runAction = async (action: 'build' | DailyServerAction) => {
    setBusyAction(action);
    setNotice('');
    try {
      if (action === 'build') {
        await buildSnapshot();
        setNotice('Visual inventory is ready in the local cache.');
      } else if (action === 'syncDailySnapshotV2') {
        const snapshot = await buildSnapshot();
        const response = await syncDailySnapshot(snapshot, settings);
        setStatus(loadDailySyncStatus());
        setNotice(String(response.message ?? 'Snapshot synchronized.'));
      } else if (action === 'generateDailyBundleNowV2') {
        const snapshot = await buildSnapshot();
        await syncDailySnapshot(snapshot, settings);
        let generatedBundle: DailyBundleV2 | undefined;
        for (let step = 0; step < 8; step += 1) {
          const response = await callDailyServer('generateDailyBundleStepV2', settings);
          setNotice(String(response.message ?? `Generation stage: ${response.stage ?? step + 1}`));
          if (response.bundle) {
            generatedBundle = response.bundle;
            break;
          }
          if (response.complete) throw new Error('Generation completed without a bundle.');
        }
        if (!generatedBundle) throw new Error('Generation did not complete within the expected stage count.');
        setBundle(generatedBundle);
        setStatus(loadDailySyncStatus());
        setNotice('A quality-gated test bundle was generated.');
      } else if (action === 'getDailyOutfitDiagnosticsV2') {
        const response = await callDailyServer(action, settings);
        if (!response.diagnostics) throw new Error('Server diagnostics were unavailable.');
        setDiagnostics(response.diagnostics);
        setNotice('Diagnostics refreshed.');
      } else {
        const response = await callDailyServer(action, settings);
        setNotice(String(response.message ?? 'Server action completed.'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Daily outfit action failed.';
      setNotice(message);
      setStatus(previous => ({ ...previous, state: 'error', message }));
    } finally {
      setBusyAction(null);
      setProgress(null);
    }
  };

  useEffect(() => {
    if (!settings.enabled || !configured) return;
    const delay = firstAutomaticSync.current ? 600 : 10_000;
    firstAutomaticSync.current = false;
    const timer = window.setTimeout(() => {
      buildDailySnapshot(items, outfits, settings)
        .then(snapshot => syncDailySnapshot(snapshot, settings))
        .then(() => setStatus(loadDailySyncStatus()))
        .catch(error => {
          const message = error instanceof Error ? error.message : 'Background synchronization failed.';
          saveDailySyncStatus({ ...loadDailySyncStatus(), state: 'error', message });
          setStatus(loadDailySyncStatus());
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [configured, items, outfits, settings]);

  const resolveLocation = async () => {
    setBusyAction('location');
    setNotice('');
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', settings.locationQuery);
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'en');
      const response = await fetch(url);
      if (!response.ok) throw new Error('Location lookup failed.');
      const result = (await response.json()).results?.[0];
      if (!result) throw new Error('No matching location found.');
      const locationLabel = [result.name, result.admin1_code || result.admin1].filter(Boolean).join(', ');
      saveSettings({ ...settings, locationLabel, latitude: result.latitude, longitude: result.longitude, timezone: result.timezone || settings.timezone });
      setNotice(`Resolved ${locationLabel}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Location lookup failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const statusLabel = useMemo(() => {
    if (status.state === 'synced') return `Synced ${formatSyncTime(status.lastSuccessAt)}`;
    if (status.state === 'error') return 'Needs attention';
    if (status.state === 'building' || status.state === 'syncing') return 'Working';
    return 'Not synced';
  }, [status]);

  return (
    <dialog ref={dialogRef} className="daily-dialog" onClose={onClose} onClick={(event) => {
      if (event.target === dialogRef.current) dialogRef.current.close();
    }}>
      <div className="daily-shell">
        <header className="daily-header">
          <div>
            <span className="daily-kicker"><CloudSun size={14} /> Scheduled sidecar</span>
            <h2>Daily email</h2>
            <p>Up to three distinct looks: Easy, Polished casual, and Expressive. If a complete set cannot meet the day's quality, weather, and outfit-distinctness bars after re-planning, the safe looks are still delivered.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close daily email settings"><X size={20} /></button>
        </header>

        <div className="daily-status-strip">
          <span className={`daily-status-dot is-${status.state}`} />
          <strong>{statusLabel}</strong>
          <span>{status.message ?? 'Configure the private Apps Script deployment to begin.'}</span>
          {progress && <span className="daily-progress">{progress.phase} {progress.done}/{progress.total}</span>}
        </div>

        <section className="daily-section">
          <div className="daily-section-title"><span>01</span><h3>Delivery</h3></div>
          <div className="daily-form-grid">
            <label className="daily-span-2">Recipient<input type="email" value={settings.recipientEmail} onChange={event => saveSettings({ ...settings, recipientEmail: event.target.value })} /></label>
            <label>Hour<input type="number" min="0" max="23" value={settings.deliveryHour} onChange={event => saveSettings({ ...settings, deliveryHour: Number(event.target.value) })} /></label>
            <label>Minute<input type="number" min="0" max="59" value={settings.deliveryMinute} onChange={event => saveSettings({ ...settings, deliveryMinute: Number(event.target.value) })} /></label>
            <label>Lead time<input type="number" min="30" max="180" value={settings.generationLeadMinutes} onChange={event => saveSettings({ ...settings, generationLeadMinutes: Number(event.target.value) })} /></label>
            <label>Cold sensitivity<select value={settings.coldSensitivity} onChange={event => saveSettings({ ...settings, coldSensitivity: Number(event.target.value) as DailyOutfitSettingsV2['coldSensitivity'] })}><option value={-2}>Much less</option><option value={-1}>Less</option><option value={0}>Neutral</option><option value={1}>More</option><option value={2}>Much more</option></select></label>
          </div>
          <button
            type="button"
            className={`daily-toggle ${settings.enabled ? 'is-on' : ''}`}
            aria-label={settings.enabled ? 'Disable daily outfit email' : 'Enable daily outfit email'}
            aria-pressed={settings.enabled}
            onClick={() => saveSettings({ ...settings, enabled: !settings.enabled })}
          >
            <span>{settings.enabled ? <Check size={12} /> : null}</span>{settings.enabled ? 'Daily email enabled' : 'Daily email disabled'}
          </button>
        </section>

        <section className="daily-section">
          <div className="daily-section-title"><span>02</span><h3>Weather</h3></div>
          <div className="daily-form-grid">
            <label className="daily-span-2">Location search<input value={settings.locationQuery} onChange={event => saveSettings({ ...settings, locationQuery: event.target.value })} /></label>
            <label>Latitude<input type="number" step="0.0001" value={settings.latitude} onChange={event => saveSettings({ ...settings, latitude: Number(event.target.value) })} /></label>
            <label>Longitude<input type="number" step="0.0001" value={settings.longitude} onChange={event => saveSettings({ ...settings, longitude: Number(event.target.value) })} /></label>
            <label className="daily-span-2">Timezone<input value={settings.timezone} onChange={event => saveSettings({ ...settings, timezone: event.target.value })} /></label>
          </div>
          <button type="button" className="daily-secondary-action" disabled={Boolean(busyAction)} onClick={resolveLocation}>Resolve location</button>
        </section>

        <section className="daily-section">
          <div className="daily-section-title"><span>03</span><h3>Private server</h3></div>
          <div className="daily-form-grid">
            <label className="daily-span-2">Apps Script web app URL<input type="url" placeholder="https://script.google.com/macros/s/…/exec" value={settings.appsScriptUrl} onChange={event => saveSettings({ ...settings, appsScriptUrl: event.target.value.trim() })} /></label>
            <label className="daily-span-2">Sync secret<input type="password" autoComplete="off" value={settings.syncSecret} onChange={event => saveSettings({ ...settings, syncSecret: event.target.value })} /></label>
          </div>
          <div className="daily-actions">
            <button type="button" onClick={() => runAction('build')} disabled={Boolean(busyAction)}>Build visual inventory</button>
            <button type="button" onClick={() => runAction('syncDailySnapshotV2')} disabled={Boolean(busyAction) || !configured}>Sync now</button>
            <button type="button" onClick={() => runAction('validateStoredSnapshotV2')} disabled={Boolean(busyAction) || !configured}>Validate server snapshot</button>
            <button type="button" onClick={() => runAction('getDailyOutfitDiagnosticsV2')} disabled={Boolean(busyAction) || !configured}>Inspect diagnostics</button>
            <button type="button" onClick={() => runAction('generateDailyBundleNowV2')} disabled={Boolean(busyAction) || !configured}>Generate test bundle</button>
            <button type="button" onClick={() => runAction('sendDailyTestEmailV2')} disabled={Boolean(busyAction) || !configured || !bundle}>Send test email</button>
          </div>
          {busyAction && <p className="daily-busy"><LoaderCircle size={14} /> Working through the quality gates…</p>}
          {notice && <p className="daily-notice" role="status">{notice}</p>}
          {diagnostics && <pre className="daily-diagnostics">{JSON.stringify(diagnostics, null, 2)}</pre>}
        </section>

        {bundle && <DailyBundlePreview bundle={bundle} items={items} />}
      </div>
    </dialog>
  );
}

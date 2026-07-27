import { assignStableLabels, buildAtlasPages, emptyAtlasManifest } from './atlasBuilder';
import { hashText } from './imageFingerprint';
import { categoryDefaultProfile, dailySlotForItem } from './itemProfile';
import { publicDailySettings } from './settings';
import { loadAtlasManifest, saveAtlasManifest } from './storage';
import { getDailyThumbnail } from './thumbnailCache';
import type { DailyClosetSnapshotV2, DailyOutfitSettingsV2, DailySnapshotItemV2, DailySourceItem, DailyTasteSource } from './types';

export interface SnapshotBuildProgress {
  phase: 'thumbnails' | 'atlases' | 'complete';
  done: number;
  total: number;
}

export const eligibleDailyItems = (sourceItems: DailySourceItem[]) => sourceItems
  .map(item => ({ item, slot: dailySlotForItem(item), profile: categoryDefaultProfile(item) }))
  .filter((entry): entry is ReturnType<typeof categoryEntry> & { slot: NonNullable<ReturnType<typeof dailySlotForItem>> } =>
    entry.slot !== null && entry.profile.available && !entry.profile.excludedFromDaily && Boolean(entry.item.image || entry.item.name));

const categoryEntry = (item: DailySourceItem) => ({ item, slot: dailySlotForItem(item), profile: categoryDefaultProfile(item) });

export const buildDailySnapshot = async (
  sourceItems: DailySourceItem[],
  tasteExamples: DailyTasteSource[],
  settings: DailyOutfitSettingsV2,
  onProgress?: (progress: SnapshotBuildProgress) => void
): Promise<DailyClosetSnapshotV2> => {
  const eligible = eligibleDailyItems(sourceItems);

  const missing = (['top', 'bottom', 'shoes'] as const).filter(slot => !eligible.some(entry => entry.slot === slot));
  if (missing.length > 0) throw new Error(`Daily inventory is missing required slot${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);

  const labels = assignStableLabels(eligible.map(entry => ({ id: entry.item.id, slot: entry.slot })));
  const items: DailySnapshotItemV2[] = [];
  for (const entry of eligible) {
    const thumbnail = await getDailyThumbnail(entry.item);
    items.push({
      id: entry.item.id,
      shortLabel: labels.get(entry.item.id)!,
      slot: entry.slot,
      name: entry.item.name,
      brand: entry.item.brand,
      category: entry.item.category,
      color: entry.item.color,
      description: entry.item.description,
      styleCode: entry.item.styleCode,
      profile: entry.profile,
      thumbnailDataUrl: thumbnail.dataUrl,
      imageFingerprint: thumbnail.fingerprint
    });
    onProgress?.({ phase: 'thumbnails', done: items.length, total: eligible.length });
  }

  onProgress?.({ phase: 'atlases', done: 0, total: Math.ceil(items.length / 12) });
  const atlasPages = await buildAtlasPages(items);
  const wardrobeFingerprint = await hashText(items
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => JSON.stringify([item.id, item.shortLabel, item.slot, item.name, item.brand, item.category, item.color, item.description, item.profile, item.imageFingerprint]))
    .join('\n'));
  const manifest = loadAtlasManifest(emptyAtlasManifest());
  manifest.wardrobeFingerprint = wardrobeFingerprint;
  saveAtlasManifest(manifest);
  onProgress?.({ phase: 'complete', done: atlasPages.length, total: atlasPages.length });

  return {
    version: 2,
    generatedAt: Date.now(),
    wardrobeFingerprint,
    items,
    atlasPages,
    tasteExamples: tasteExamples.filter(outfit => outfit.seedStylist !== false),
    settings: publicDailySettings(settings)
  };
};

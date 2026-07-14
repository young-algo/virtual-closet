import { hashText } from './imageFingerprint';
import { idbGet, idbPut, loadAtlasManifest, saveAtlasManifest } from './storage';
import type { DailyAtlasManifestV2, DailyAtlasPageV2, DailySlot, DailySnapshotItemV2 } from './types';

const SLOT_PREFIX: Record<DailySlot, string> = { top: 'T', bottom: 'B', layer: 'L', shoes: 'S' };
const SLOT_ORDER: DailySlot[] = ['top', 'bottom', 'layer', 'shoes'];
const ITEMS_PER_PAGE = 12;
const CELL_WIDTH = 448;
const CELL_HEIGHT = 448;

export interface AtlasPagePlan {
  slot: DailySlot;
  pageNumber: number;
  itemIds: string[];
}

export const planAtlasPages = <T extends { id: string; slot: DailySlot; shortLabel: string }>(items: T[]): AtlasPagePlan[] => {
  const plans: AtlasPagePlan[] = [];
  for (const slot of SLOT_ORDER) {
    const slotItems = items.filter(item => item.slot === slot).sort((a, b) => a.shortLabel.localeCompare(b.shortLabel));
    for (let offset = 0; offset < slotItems.length; offset += ITEMS_PER_PAGE) {
      plans.push({
        slot,
        pageNumber: Math.floor(offset / ITEMS_PER_PAGE) + 1,
        itemIds: slotItems.slice(offset, offset + ITEMS_PER_PAGE).map(item => item.id)
      });
    }
  }
  return plans;
};

export const emptyAtlasManifest = (): DailyAtlasManifestV2 => ({
  version: 2,
  labelsByItemId: {},
  nextNumberBySlot: { top: 1, bottom: 1, layer: 1, shoes: 1 },
  pageFingerprints: {}
});

export const assignStableLabels = <T extends { id: string; slot: DailySlot }>(items: T[]): Map<string, string> => {
  const manifest = loadAtlasManifest(emptyAtlasManifest());
  let changed = false;
  for (const slot of SLOT_ORDER) {
    const slotItems = items.filter(item => item.slot === slot).sort((a, b) => a.id.localeCompare(b.id));
    for (const item of slotItems) {
      if (manifest.labelsByItemId[item.id]) continue;
      const number = manifest.nextNumberBySlot[slot]++;
      manifest.labelsByItemId[item.id] = `${SLOT_PREFIX[slot]}${String(number).padStart(3, '0')}`;
      changed = true;
    }
  }
  if (changed) saveAtlasManifest(manifest);
  return new Map(items.map(item => [item.id, manifest.labelsByItemId[item.id]]));
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to decode cached thumbnail'));
  image.src = dataUrl;
});

const ellipsize = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (context.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened}…`;
};

const renderAtlasPage = async (items: DailySnapshotItemV2[]): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_WIDTH * 3;
  canvas.height = CELL_HEIGHT * 4;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await Promise.all(items.map(async (item, index) => {
    const image = await loadImage(item.thumbnailDataUrl);
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = column * CELL_WIDTH;
    const y = row * CELL_HEIGHT;
    context.strokeStyle = '#e8e6e1';
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, CELL_WIDTH - 1, CELL_HEIGHT - 1);
    context.drawImage(image, x + 32, y + 18, 384, 356);
    context.fillStyle = '#111111';
    context.font = '600 18px Arial, sans-serif';
    context.fillText(item.shortLabel, x + 24, y + 400);
    context.font = '400 15px Arial, sans-serif';
    const caption = [item.brand, item.name].filter(Boolean).join(' · ');
    context.fillText(ellipsize(context, caption, 318), x + 98, y + 400);
  }));

  return canvas.toDataURL('image/jpeg', 0.78);
};

export const buildAtlasPages = async (items: DailySnapshotItemV2[]): Promise<DailyAtlasPageV2[]> => {
  const pages: DailyAtlasPageV2[] = [];
  const manifest = loadAtlasManifest(emptyAtlasManifest());
  const byId = new Map(items.map(item => [item.id, item]));
  for (const plan of planAtlasPages(items)) {
      const pageItems = plan.itemIds.map(id => byId.get(id)).filter((item): item is DailySnapshotItemV2 => Boolean(item));
      const pageId = `${plan.slot}-${plan.pageNumber}`;
      const fingerprint = await hashText(pageItems.map(item => [item.id, item.shortLabel, item.brand, item.name, item.imageFingerprint].join('|')).join('\n'));
      const cached = await idbGet<DailyAtlasPageV2>('atlas_pages', `${pageId}:${fingerprint}`);
      const page = cached ?? {
        pageId,
        slot: plan.slot,
        pageNumber: plan.pageNumber,
        itemIds: pageItems.map(item => item.id),
        imageDataUrl: await renderAtlasPage(pageItems),
        fingerprint
      };
      if (!cached) await idbPut('atlas_pages', `${pageId}:${fingerprint}`, page);
      manifest.pageFingerprints[pageId] = fingerprint;
      pages.push(page);
  }
  saveAtlasManifest(manifest);
  return pages;
};

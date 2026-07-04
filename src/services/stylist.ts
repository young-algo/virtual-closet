// src/services/stylist.ts
// AI stylist logic: slot mapping, response validation, thumbnail encoding,
// and the Gemini structured-output call. Pure logic — no React.
import type { ClosetItem } from '../components/ClosetGrid';
import { resizeImageToDataUrl } from '../utils/image';

export type SlotName = 'top' | 'bottom' | 'shoes' | 'layer';

// Category strings must match closet.json / sneakers.json exactly.
export const SLOT_CATEGORIES: Record<SlotName, string[]> = {
  top: ['T-Shirts', 'Polos', 'Long Sleeves', 'Jerseys', 'Shirts'],
  bottom: ['Pants', 'Shorts'],
  layer: ['Sweatshirts', 'Hoodies', 'Outerwear'],
  shoes: ['Sneakers']
};

export const slotForItem = (item: ClosetItem): SlotName | null => {
  for (const slot of Object.keys(SLOT_CATEGORIES) as SlotName[]) {
    if (SLOT_CATEGORIES[slot].includes(item.category)) return slot;
  }
  return null;
};

// Required slots with zero wearable inventory; 'layer' is optional by design.
export const missingSlots = (items: ClosetItem[]): SlotName[] => {
  const present = new Set(items.map(slotForItem));
  return (['top', 'bottom', 'shoes'] as SlotName[]).filter(s => !present.has(s));
};

export interface StylistRecommendation {
  topId: string;
  bottomId: string;
  shoeId: string;
  layerIds: string[];
  outfitName: string;
  stylistNote: string;
}

export interface RejectedCombo {
  topId: string;
  bottomId: string;
  shoeId: string;
  layerIds: string[];
}

export interface LockedIds {
  topId?: string;
  bottomId?: string;
  shoeId?: string;
  layerIds?: string[];
}

// Returns an error message describing the first problem, or null when valid.
export const validateRecommendation = (
  rec: StylistRecommendation,
  items: ClosetItem[],
  locked: LockedIds
): string | null => {
  const byId = new Map(items.map(item => [item.id, item]));

  const checkSlot = (id: string, expected: SlotName): string | null => {
    const item = byId.get(id);
    if (!item) return `id "${id}" does not exist in the inventory`;
    const slot = slotForItem(item);
    if (slot !== expected) return `id "${id}" is a ${slot ?? 'non-wearable'} item, but was used as the ${expected}`;
    return null;
  };

  const slotError =
    checkSlot(rec.topId, 'top') ??
    checkSlot(rec.bottomId, 'bottom') ??
    checkSlot(rec.shoeId, 'shoes') ??
    rec.layerIds.map(id => checkSlot(id, 'layer')).find(e => e !== null) ??
    null;
  if (slotError) return slotError;

  const allIds = [rec.topId, rec.bottomId, rec.shoeId, ...rec.layerIds];
  if (new Set(allIds).size !== allIds.length) {
    return 'the same item id was used in more than one slot';
  }

  if (locked.topId && rec.topId !== locked.topId) return `the top is locked to "${locked.topId}" and must not change`;
  if (locked.bottomId && rec.bottomId !== locked.bottomId) return `the bottom is locked to "${locked.bottomId}" and must not change`;
  if (locked.shoeId && rec.shoeId !== locked.shoeId) return `the shoes are locked to "${locked.shoeId}" and must not change`;
  if (locked.layerIds && locked.layerIds.length > 0) {
    const returned = new Set(rec.layerIds);
    const missing = locked.layerIds.filter(id => !returned.has(id));
    if (missing.length > 0) return `locked layer(s) ${missing.map(id => `"${id}"`).join(', ')} must be included`;
  }

  return null;
};

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

// Session-only thumbnail cache; never persisted (localStorage already holds
// full-size uploads and doesn't need ~1MB more).
const thumbnailCache = new Map<string, string>();

const getThumbnailBase64 = async (item: ClosetItem): Promise<string> => {
  const cached = thumbnailCache.get(item.id);
  if (cached) return cached;
  // item.image is either a public path (/closet/x.jpg) or a data URL —
  // fetch handles both uniformly.
  const blob = await (await fetch(item.image)).blob();
  const dataUrl = await resizeImageToDataUrl(blob, 256);
  const base64 = dataUrl.split(',')[1];
  thumbnailCache.set(item.id, base64);
  return base64;
};

// One image part + one metadata line per wearable item. Sparse metadata
// (blank sneaker color/description) defers to the photo explicitly so the
// model doesn't treat the blank as meaningful.
export const buildInventoryParts = async (items: ClosetItem[]): Promise<GeminiPart[]> => {
  const parts: GeminiPart[] = [];
  for (const item of items) {
    const slot = slotForItem(item);
    if (!slot) continue;
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: await getThumbnailBase64(item) } });
    parts.push({
      text: `id=${item.id} | slot=${slot} | category=${item.category}` +
        ` | color=${item.color || 'see photo'} | brand=${item.brand || 'unknown'}` +
        ` | ${item.description || 'no description — judge from the photo above'}`
    });
  }
  return parts;
};

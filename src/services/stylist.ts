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
// full-size uploads and doesn't need ~1MB more). Keyed by item id and never
// invalidated within a session — if a photo is replaced mid-session, the
// stylist keeps using the stale thumbnail until the page reloads.
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

export interface GenerateOutfitInput {
  apiKey: string;
  prompt: string;
  items: ClosetItem[];
  locked: LockedIds;
  rejected: RejectedCombo[];
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topId: { type: 'STRING' },
    bottomId: { type: 'STRING' },
    shoeId: { type: 'STRING' },
    layerIds: { type: 'ARRAY', items: { type: 'STRING' } },
    outfitName: { type: 'STRING' },
    stylistNote: { type: 'STRING' }
  },
  required: ['topId', 'bottomId', 'shoeId', 'layerIds', 'outfitName', 'stylistNote']
} as const;

const PREAMBLE =
  "You are a personal stylist for Kevin's real wardrobe, shown below as photos with metadata. " +
  'You may ONLY use the item ids listed. Build one outfit: exactly one top (slot=top), one bottom ' +
  '(slot=bottom), one pair of shoes (slot=shoes), plus zero or more optional layers (slot=layer) when ' +
  'the occasion or styling calls for it. Judge each item primarily by its photo; metadata may be sparse. ' +
  'Also return a short evocative outfitName (2-4 words) and a stylistNote of 1-2 sentences explaining ' +
  'why the combination works for the request.';

const describeConstraints = (locked: LockedIds, rejected: RejectedCombo[]): string => {
  const lines: string[] = [];
  const lockedList = [
    locked.topId && `top=${locked.topId}`,
    locked.bottomId && `bottom=${locked.bottomId}`,
    locked.shoeId && `shoes=${locked.shoeId}`,
    locked.layerIds?.length ? `layers=${locked.layerIds.join('+')}` : undefined
  ].filter(Boolean);
  if (lockedList.length > 0) {
    lines.push(`LOCKED ITEMS (fixed — you must include these exact ids in these slots and build around them): ${lockedList.join(', ')}`);
  }
  if (rejected.length > 0) {
    const combos = rejected
      .map(c => `[top=${c.topId}, bottom=${c.bottomId}, shoes=${c.shoeId}, layers=${c.layerIds.join('+') || 'none'}]`)
      .join(' ');
    lines.push(`ALREADY REJECTED (do not repeat any of these exact combinations): ${combos}`);
  }
  return lines.join('\n');
};

const callGemini = async (apiKey: string, parts: GeminiPart[]): Promise<StylistRecommendation> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      })
    }
  );
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.error?.message ?? detail;
    } catch { /* keep the HTTP status as the detail */ }
    throw new Error(`Gemini request failed: ${detail}`);
  }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('The stylist returned an empty response. Try again.');
  return JSON.parse(text) as StylistRecommendation;
};

export const generateOutfit = async (input: GenerateOutfitInput): Promise<StylistRecommendation> => {
  const inventoryParts = await buildInventoryParts(input.items);
  const constraints = describeConstraints(input.locked, input.rejected);
  const parts: GeminiPart[] = [
    { text: PREAMBLE },
    ...inventoryParts,
    { text: `OCCASION / STYLE REQUEST: ${input.prompt}` },
    ...(constraints ? [{ text: constraints }] : [])
  ];

  let rec = await callGemini(input.apiKey, parts);
  let error = validateRecommendation(rec, input.items, input.locked);
  if (error) {
    // One silent retry with the validation error fed back.
    rec = await callGemini(input.apiKey, [
      ...parts,
      { text: `Your previous answer was invalid: ${error}. Return a corrected outfit that fixes this.` }
    ]);
    error = validateRecommendation(rec, input.items, input.locked);
    if (error) throw new Error(`The stylist returned an invalid outfit twice (${error}). Try regenerating.`);
  }
  return rec;
};

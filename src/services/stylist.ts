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
  layer: ['Sweatshirts', 'Hoodies', 'Outerwear', 'Jackets', 'Fleeces'],
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
  // Chain-of-thought the model emits before committing to ids; not shown in the UI.
  reasoning: string;
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
  // Kevin's optional note on why he regenerated away from this draft —
  // steering signal, not just a banned combination.
  reason?: string;
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

// Progress facts for the UI to phrase however it likes. 'encoding' is the
// only countable phase; the Gemini calls give no progress signal, so those
// phases are bare markers and the UI supplies the sense of motion.
export type StylistProgress =
  | { phase: 'encoding'; done: number; total: number }
  | { phase: 'styling' }
  | { phase: 'retrying' };

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
  // 512px: enough detail to distinguish colorways and materials — at ~94
  // items the request stays a few MB, well under Gemini's inline-data limit.
  const blob = await (await fetch(item.image)).blob();
  const dataUrl = await resizeImageToDataUrl(blob, 512);
  const base64 = dataUrl.split(',')[1];
  thumbnailCache.set(item.id, base64);
  return base64;
};

// One metadata line + one image part per wearable item. The text precedes
// the image so the model binds each id to the photo that follows it. Sparse
// metadata (blank color/description) defers to the photo explicitly so the
// model doesn't treat the blank as meaningful.
export const buildInventoryParts = async (
  items: ClosetItem[],
  onProgress?: (p: StylistProgress) => void
): Promise<GeminiPart[]> => {
  // Shuffled per call: a fixed presentation order nudges the model toward
  // the same salient early items every generation, and order carries no
  // meaning here. (Thumbnail cache is keyed by id, so order costs nothing.)
  const wearable = shuffle(items.filter(item => slotForItem(item) !== null));
  const parts: GeminiPart[] = [];
  let done = 0;
  for (const item of wearable) {
    const slot = slotForItem(item)!;
    const styleCode = (item as ClosetItem & { styleCode?: string }).styleCode;
    parts.push({
      text: `id=${item.id} | slot=${slot} | category=${item.category}` +
        ` | color=${item.color || 'see photo'} | brand=${item.brand || 'unknown'}` +
        (styleCode ? ` | style code ${styleCode} (you may know this exact colorway)` : '') +
        ` | ${item.description || 'no description — judge from the photo below'}`
    });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: await getThumbnailBase64(item) } });
    done += 1;
    onProgress?.({ phase: 'encoding', done, total: wearable.length });
  }
  return parts;
};

export interface GenerateOutfitInput {
  apiKey: string;
  prompt: string;
  items: ClosetItem[];
  locked: LockedIds;
  rejected: RejectedCombo[];
  savedOutfits: SavedOutfitExample[];
  // Item ids recommended in recent generations (persisted by the UI across
  // prompts and reloads) — variety pressure that `rejected` can't provide,
  // since that resets with every new draft.
  recentItemIds: string[];
  onProgress?: (p: StylistProgress) => void;
}

// propertyOrdering forces `reasoning` to be generated before any id is
// committed — structured output otherwise makes the model pick topId as its
// literal first tokens, skipping all styling deliberation.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reasoning: { type: 'STRING' },
    topId: { type: 'STRING' },
    bottomId: { type: 'STRING' },
    shoeId: { type: 'STRING' },
    layerIds: { type: 'ARRAY', items: { type: 'STRING' } },
    outfitName: { type: 'STRING' },
    stylistNote: { type: 'STRING' }
  },
  required: ['reasoning', 'topId', 'bottomId', 'shoeId', 'layerIds', 'outfitName', 'stylistNote'],
  propertyOrdering: ['reasoning', 'topId', 'bottomId', 'shoeId', 'layerIds', 'outfitName', 'stylistNote']
} as const;

const PREAMBLE =
  "You are a personal stylist for Kevin's real wardrobe. Each item below is a metadata line followed " +
  'by its photo. You may ONLY use the item ids listed. Build one outfit: exactly one top (slot=top), ' +
  'one bottom (slot=bottom), one pair of shoes (slot=shoes), plus zero or more optional layers ' +
  '(slot=layer) when the occasion or styling calls for it. Judge each item primarily by its photo; ' +
  'metadata may be sparse. Sneakers include a style code — when you recognize the exact colorway, use ' +
  'that knowledge.\n' +
  'STYLING PRINCIPLES: Match the formality of the occasion exactly — never a notch above or below. ' +
  'Keep the palette cohesive: neutrals carry the look, and an accent color should feel deliberate, ' +
  'ideally echoed between two pieces. Balance silhouettes — relaxed with tailored, not baggy with baggy. ' +
  'When the sneaker is loud, let it anchor the look and keep the clothing quiet; when the clothing is ' +
  'the statement, pick a clean, simple shoe. Jerseys and bold graphics read casual — never dress them up. ' +
  'Layers only when the weather or setting justifies them. Kevin generates outfits often — favor fresh ' +
  'combinations over recycling the same hero pieces; a strong look he has not seen beats a familiar one.\n' +
  'In the reasoning field, think out loud BEFORE picking any ids: the formality and setting the request ' +
  'implies, the season and weather, the color palette you want, silhouette balance, and which shoe ' +
  'anchors the look — then choose ids consistent with that reasoning. ' +
  'Also return a short evocative outfitName (2-4 words) and a stylistNote of 1-2 sentences explaining ' +
  'why the combination works for the request.';

// Saved outfits, resolved to item names, as a taste signal. These are
// looks Kevin chose to keep — evidence of palettes and pairings he likes.
export interface SavedOutfitExample {
  name: string;
  itemIds: string[];
  // 'ai' = saved straight from the stylist, never edited. See Outfit.source.
  source?: 'ai';
}

const TASTE_EXAMPLE_CAP = 6;
// An item may appear in at most this many chosen examples — keeps a garment
// that features in dozens of saved looks from dominating the compass.
const TASTE_ITEM_OVERLAP_CAP = 2;

const shuffle = <T,>(arr: readonly T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Sample taste examples from the WHOLE saved list, not the newest slice.
// Newest-first slicing fed the stylist its own recent saves as "taste",
// anchoring every generation on the same items. Manual outfits carry the
// genuine signal, so unedited AI saves only fill slots manual ones can't;
// fresh random order per call also varies the compass between generations.
export const selectTasteExamples = (
  saved: SavedOutfitExample[],
  cap: number = TASTE_EXAMPLE_CAP
): SavedOutfitExample[] => {
  const manual = saved.filter(outfit => outfit.source !== 'ai');
  const ai = saved.filter(outfit => outfit.source === 'ai');
  const chosen: SavedOutfitExample[] = [];
  const itemUse = new Map<string, number>();
  for (const outfit of [...shuffle(manual), ...shuffle(ai)]) {
    if (chosen.length >= cap) break;
    if (outfit.itemIds.some(id => (itemUse.get(id) ?? 0) >= TASTE_ITEM_OVERLAP_CAP)) continue;
    chosen.push(outfit);
    for (const id of outfit.itemIds) itemUse.set(id, (itemUse.get(id) ?? 0) + 1);
  }
  return chosen;
};

const topCounts = (values: string[], limit: number): string[] => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
};

export const describeTaste = (saved: SavedOutfitExample[], items: ClosetItem[]): string => {
  const byId = new Map(items.map(item => [item.id, item]));
  const lines = selectTasteExamples(saved)
    .map(outfit => {
      const names = outfit.itemIds
        .map(id => byId.get(id))
        .filter((item): item is ClosetItem => item !== undefined)
        .map(item => `${item.name} (${item.category})`);
      return names.length >= 2 ? `- "${outfit.name}": ${names.join(', ')}` : null;
    })
    .filter((line): line is string => line !== null);
  if (lines.length === 0) return '';

  // Aggregate signal drawn from every saved outfit, so the 60+ looks that
  // don't make the example cut still shape the palette the model aims for.
  const savedItems = saved
    .flatMap(outfit => outfit.itemIds)
    .map(id => byId.get(id))
    .filter((item): item is ClosetItem => item !== undefined);
  const colors = topCounts(savedItems.map(item => item.color).filter(Boolean), 4);
  const brands = topCounts(savedItems.map(item => item.brand).filter(Boolean), 4);
  const aggregateParts = [
    colors.length > 0 ? `colors he wears most: ${colors.join(', ')}` : null,
    brands.length > 0 ? `brands he reaches for: ${brands.join(', ')}` : null
  ].filter((part): part is string => part !== null);
  const aggregate = aggregateParts.length > 0
    ? `Across all ${saved.length} looks Kevin has saved — ${aggregateParts.join('; ')}.\n`
    : '';

  return (
    'WHAT KEVIN LIKES (a style compass distilled from looks he chose to keep — ' +
    'palettes, formality, pairings. It is NOT a shopping list: do not default to ' +
    're-picking the exact items named below; prefer expressing the same taste ' +
    'through different pieces unless one of these is truly the best fit):\n' +
    aggregate +
    lines.join('\n')
  );
};

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
      .map(c =>
        `[top=${c.topId}, bottom=${c.bottomId}, shoes=${c.shoeId}, layers=${c.layerIds.join('+') || 'none'}` +
        `${c.reason ? ` — Kevin said: "${c.reason}"` : ''}]`)
      .join(' ');
    lines.push(
      'ALREADY REJECTED (do not repeat any of these exact combinations; ' +
      `treat Kevin's notes as steering for what to change): ${combos}`);
  }
  return lines.join('\n');
};

// Pro tier: one taste-heavy call per generation, so the quality gap over
// flash is worth the trivial per-request cost. There is no gemini-3.5-pro;
// this alias tracks the newest pro release (gemini-3.1-pro-preview as of
// 2026-07). If a generation ever errors on model access, switch back to
// gemini-3.5-flash here.
const MODEL = 'gemini-pro-latest';

const callGemini = async (apiKey: string, parts: GeminiPart[]): Promise<StylistRecommendation> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          // Mild exploration pressure on top of the freshness instructions,
          // so repeat generations don't collapse onto the same modal picks.
          temperature: 1.1,
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

// Soft variety pressure, unlike the hard ALREADY REJECTED ban: recent picks
// stay legal (one of them may genuinely be the right call), they just have
// to beat a fresh alternative on merit. Locked items are excluded — Kevin
// pinned those, so discouraging them would fight his explicit instruction.
const describeRecentlyRecommended = (
  recentItemIds: string[],
  items: ClosetItem[],
  locked: LockedIds
): string => {
  const byId = new Map(items.map(item => [item.id, item]));
  const lockedIds = new Set(
    [locked.topId, locked.bottomId, locked.shoeId, ...(locked.layerIds ?? [])]
      .filter((id): id is string => Boolean(id))
  );
  const names = recentItemIds
    .filter(id => !lockedIds.has(id))
    .map(id => byId.get(id))
    .filter((item): item is ClosetItem => item !== undefined)
    .map(item => `${item.name} (${item.category})`);
  if (names.length === 0) return '';
  return (
    'RECENTLY RECOMMENDED (items this stylist already used in recent outfits — Kevin wants variety ' +
    'across generations, so reach for fresh alternatives; reuse one of these only when it is clearly ' +
    `the single best choice for the request): ${names.join('; ')}`
  );
};

export const generateOutfit = async (input: GenerateOutfitInput): Promise<StylistRecommendation> => {
  const inventoryParts = await buildInventoryParts(input.items, input.onProgress);
  const taste = describeTaste(input.savedOutfits, input.items);
  const recent = describeRecentlyRecommended(input.recentItemIds, input.items, input.locked);
  const constraints = describeConstraints(input.locked, input.rejected);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const parts: GeminiPart[] = [
    { text: PREAMBLE },
    ...inventoryParts,
    ...(taste ? [{ text: taste }] : []),
    ...(recent ? [{ text: recent }] : []),
    { text: `CONTEXT: Today is ${today}. Factor in the season and likely weather unless the request clearly overrides it (e.g. a destination trip or a stated season).` },
    { text: `OCCASION / STYLE REQUEST: ${input.prompt}` },
    ...(constraints ? [{ text: constraints }] : [])
  ];

  input.onProgress?.({ phase: 'styling' });
  let rec = await callGemini(input.apiKey, parts);
  let error = validateRecommendation(rec, input.items, input.locked);
  if (error) {
    // One retry with the validation error fed back — surfaced as its own
    // phase so the doubled wait doesn't read as a hang.
    input.onProgress?.({ phase: 'retrying' });
    rec = await callGemini(input.apiKey, [
      ...parts,
      { text: `Your previous answer was invalid: ${error}. Return a corrected outfit that fixes this.` }
    ]);
    error = validateRecommendation(rec, input.items, input.locked);
    if (error) throw new Error(`The stylist returned an invalid outfit twice (${error}). Try regenerating.`);
  }
  return rec;
};

# AI Outfit Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An AI stylist inside the Outfits section that turns an occasion/vibe prompt into a draft outfit (one top, one bottom, one pair of shoes, optional layers) picked from the real inventory, with per-slot lock & regenerate and save-through to the existing outfit store.

**Architecture:** Merge `feature/sneaker-closet` first so shoes exist. All AI logic lives in a new pure-logic module `src/services/stylist.ts` (slot mapping, validation, thumbnail cache, one structured-output Gemini call with a single silent retry). A new `src/components/AIStylist.tsx` owns all transient UI state and is rendered by `OutfitBuilder`; saving goes through a new `onSaveAIOutfit(name, itemIds)` handler in `App.tsx` that reuses the existing outfit persistence.

**Tech Stack:** React 19 + TypeScript + Vite (existing), Gemini `gemini-3.5-flash` via REST `generateContent` with `responseSchema`, browser canvas for thumbnails (existing `resizeImageToDataUrl`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-ai-outfit-builder-design.md`

## Global Constraints

- No new npm dependencies. No test framework in v1 (per approved spec) — every task verifies with `npm run build` and `npm run lint`, plus manual checks in Task 7.
- API key: reuse the existing `gemini_api_key` localStorage entry. Never add a second key store.
- Model: `gemini-3.5-flash` at `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=<key>` (same pattern as `UploadModal.tsx`).
- Slot mapping (exact category strings): **top** = T-Shirts, Polos, Long Sleeves, Jerseys, Shirts; **bottom** = Pants, Shorts; **layer** = Sweatshirts, Hoodies, Outerwear; **shoes** = Sneakers.
- Thumbnails: 256px JPEG via existing `resizeImageToDataUrl`, cached in an in-memory `Map` for the session only. Never persist thumbnails to localStorage.
- Rejection history capped at the last 8 combos.
- Drafts never touch localStorage until saved.
- UI follows the merged tree's editorial style: uppercase letter-spaced headings, hairline `var(--border-color)` rules, no boxed-panel styling; inline `style` objects like the rest of the components.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Merge the sneaker closet into main

**Files:**
- No file edits — a git merge only. Verified conflict-free via `git merge-tree` (0 conflict markers).

**Interfaces:**
- Consumes: nothing.
- Produces: the merged tree every later task builds on — `src/components/SneakerGrid.tsx` (exports `SneakerItem extends ClosetItem` with `styleCode: string`, `imageTop?: string`), `src/utils/image.ts` (exports `resizeImageToDataUrl(blob: Blob, maxDim?: number): Promise<string>`), `src/data/sneakers.json`, and an `App.tsx` where `allItems: ClosetItem[] = [...items, ...sneakers]` feeds `OutfitBuilder`.

- [ ] **Step 1: Merge**

```bash
git merge feature/sneaker-closet --no-edit
```

Expected: clean merge, no conflicts (a merge commit is created automatically).

- [ ] **Step 2: Verify the merged tree builds and lints**

Run: `npm run build && npm run lint`
Expected: `tsc -b` and `vite build` succeed; oxlint reports no new errors.

- [ ] **Step 3: Smoke-check the app**

Run the dev server and confirm: the Closet/Sneakers view toggle renders, sneakers show in the Sneakers view, and a manual outfit can still be created with a garment + a sneaker.

---

### Task 2: Stylist core — types, slot mapping, validation

**Files:**
- Create: `src/services/stylist.ts`

**Interfaces:**
- Consumes: `ClosetItem` from `src/components/ClosetGrid.tsx` (`{ id, name, category, color, brand, image, description }`, all strings).
- Produces (used by Tasks 3–5):
  - `type SlotName = 'top' | 'bottom' | 'shoes' | 'layer'`
  - `SLOT_CATEGORIES: Record<SlotName, string[]>`
  - `slotForItem(item: ClosetItem): SlotName | null`
  - `interface StylistRecommendation { topId: string; bottomId: string; shoeId: string; layerIds: string[]; outfitName: string; stylistNote: string }`
  - `interface RejectedCombo { topId: string; bottomId: string; shoeId: string; layerIds: string[] }`
  - `interface LockedIds { topId?: string; bottomId?: string; shoeId?: string; layerIds?: string[] }`
  - `validateRecommendation(rec: StylistRecommendation, items: ClosetItem[], locked: LockedIds): string | null` — returns an error message, or `null` when valid.
  - `missingSlots(items: ClosetItem[]): SlotName[]` — required slots (`top`, `bottom`, `shoes`) with zero inventory.

- [ ] **Step 1: Create the module with types, mapping, and validation**

```typescript
// src/services/stylist.ts
// AI stylist logic: slot mapping, response validation, thumbnail encoding,
// and the Gemini structured-output call. Pure logic — no React.
import type { ClosetItem } from '../components/ClosetGrid';

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
```

- [ ] **Step 2: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass (the module compiles even though nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add src/services/stylist.ts
git commit -m "feat: add stylist core — slot mapping and recommendation validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Thumbnail cache and multimodal inventory parts

**Files:**
- Modify: `src/services/stylist.ts` (append to the file from Task 2)

**Interfaces:**
- Consumes: `resizeImageToDataUrl(blob: Blob, maxDim?: number): Promise<string>` from `src/utils/image.ts`; `slotForItem` from Task 2.
- Produces (used by Task 4):
  - `type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }`
  - `buildInventoryParts(items: ClosetItem[]): Promise<GeminiPart[]>` — per wearable item, one image part followed by one metadata-line part. Items whose category maps to no slot are skipped. Thumbnails cached in a module-level session `Map`.

- [ ] **Step 1: Append the thumbnail + parts code**

```typescript
// Appended to src/services/stylist.ts
import { resizeImageToDataUrl } from '../utils/image';

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
```

Move the new `import` to the top of the file with the existing imports.

- [ ] **Step 2: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/stylist.ts
git commit -m "feat: add session thumbnail cache and multimodal inventory parts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: generateOutfit — the Gemini call with silent retry

**Files:**
- Modify: `src/services/stylist.ts` (append)

**Interfaces:**
- Consumes: everything from Tasks 2–3.
- Produces (used by Task 5):
  - `interface GenerateOutfitInput { apiKey: string; prompt: string; items: ClosetItem[]; locked: LockedIds; rejected: RejectedCombo[] }`
  - `generateOutfit(input: GenerateOutfitInput): Promise<StylistRecommendation>` — throws `Error` with a user-presentable message on API failure or double validation failure.

- [ ] **Step 1: Append the generation code**

```typescript
// Appended to src/services/stylist.ts

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
```

- [ ] **Step 2: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/stylist.ts
git commit -m "feat: add generateOutfit Gemini call with structured output and silent retry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: AIStylist component

**Files:**
- Create: `src/components/AIStylist.tsx`

**Interfaces:**
- Consumes: from `src/services/stylist.ts` — `generateOutfit`, `missingSlots`, `slotForItem`, and types `StylistRecommendation`, `RejectedCombo`, `LockedIds`, `SlotName`; `ClosetItem` from `./ClosetGrid`.
- Produces (used by Task 6): `AIStylist` React component with props
  `{ items: ClosetItem[]; onSaveAIOutfit: (name: string, itemIds: string[]) => void }`.

Behavior requirements (all implemented in Step 1's code):
- Reads `localStorage.getItem('gemini_api_key')` at generate time; with no key, the input renders disabled with the hint "Add your Gemini API key in the Upload panel to enable the stylist."
- Pre-flight: if `missingSlots(items)` is non-empty, show e.g. "The stylist needs at least one top, bottom, and pair of sneakers — your closet is missing: shoes." and never call the API.
- Generate disabled while the prompt is empty or a request is in flight. Progress copy: "Preparing your closet…" on the first generation of the session, "Styling…" after.
- Draft card: items grouped by slot with a lock toggle per occupied slot (layers lock as one group), the stylist note, an editable name input pre-filled from `outfitName`, and Save / Regenerate / Discard.
- Regenerate: appends the current combo to the rejection history (capped at last 8), passes locked ids built from lock state × current draft, keeps the draft visible while loading.
- Errors render inline with a Retry button; draft and locks are preserved.
- Save calls `onSaveAIOutfit(name, [topId, ...layerIds, bottomId, shoeId])` then clears draft, locks, history, and prompt. Draft state never touches localStorage.

- [ ] **Step 1: Create the component**

```tsx
// src/components/AIStylist.tsx
import React, { useState } from 'react';
import { Sparkles, Lock, LockOpen, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import {
  generateOutfit, missingSlots,
  type StylistRecommendation, type RejectedCombo, type LockedIds, type SlotName
} from '../services/stylist';

interface AIStylistProps {
  items: ClosetItem[];
  onSaveAIOutfit: (name: string, itemIds: string[]) => void;
}

interface LockState { top: boolean; bottom: boolean; shoes: boolean; layers: boolean }
const NO_LOCKS: LockState = { top: false, bottom: false, shoes: false, layers: false };

const SLOT_LABELS: Record<SlotName, string> = { top: 'Top', bottom: 'Bottom', shoes: 'Shoes', layer: 'Layers' };

export const AIStylist: React.FC<AIStylistProps> = ({ items, onSaveAIOutfit }) => {
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<StylistRecommendation | null>(null);
  const [draftName, setDraftName] = useState('');
  const [locks, setLocks] = useState<LockState>(NO_LOCKS);
  const [rejected, setRejected] = useState<RejectedCombo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);
  const [error, setError] = useState('');

  const apiKey = (localStorage.getItem('gemini_api_key') || '').trim();
  const missing = missingSlots(items);
  const byId = new Map(items.map(item => [item.id, item]));

  const resolve = (id: string): ClosetItem | undefined => byId.get(id);

  const lockedIdsFromState = (current: StylistRecommendation): LockedIds => ({
    topId: locks.top ? current.topId : undefined,
    bottomId: locks.bottom ? current.bottomId : undefined,
    shoeId: locks.shoes ? current.shoeId : undefined,
    layerIds: locks.layers && current.layerIds.length > 0 ? current.layerIds : undefined
  });

  const runGeneration = async (locked: LockedIds, history: RejectedCombo[]) => {
    setIsLoading(true);
    setError('');
    try {
      const rec = await generateOutfit({ apiKey, prompt: prompt.trim(), items, locked, rejected: history });
      setDraft(rec);
      setDraftName(rec.outfitName);
      setHasGeneratedOnce(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    setLocks(NO_LOCKS);
    setRejected([]);
    void runGeneration({}, []);
  };

  const handleRegenerate = () => {
    if (!draft) return;
    const combo: RejectedCombo = {
      topId: draft.topId, bottomId: draft.bottomId, shoeId: draft.shoeId, layerIds: draft.layerIds
    };
    const history = [...rejected, combo].slice(-8);
    setRejected(history);
    void runGeneration(lockedIdsFromState(draft), history);
  };

  const handleSave = () => {
    if (!draft || !draftName.trim()) return;
    onSaveAIOutfit(draftName.trim(), [draft.topId, ...draft.layerIds, draft.bottomId, draft.shoeId]);
    handleDiscard();
    setPrompt('');
  };

  const handleDiscard = () => {
    setDraft(null);
    setDraftName('');
    setLocks(NO_LOCKS);
    setRejected([]);
    setError('');
  };

  // Draft items grouped for display: slot key -> items + lock flag
  const slotGroups = draft ? [
    { key: 'top' as const, ids: [draft.topId], locked: locks.top },
    ...(draft.layerIds.length > 0 ? [{ key: 'layers' as const, ids: draft.layerIds, locked: locks.layers }] : []),
    { key: 'bottom' as const, ids: [draft.bottomId], locked: locks.bottom },
    { key: 'shoes' as const, ids: [draft.shoeId], locked: locks.shoes }
  ] : [];

  const slotHeading = (key: 'top' | 'layers' | 'bottom' | 'shoes'): string =>
    key === 'layers' ? SLOT_LABELS.layer : SLOT_LABELS[key];

  const canGenerate = apiKey !== '' && missing.length === 0 && prompt.trim() !== '' && !isLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Prompt bar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Sparkles size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Describe an occasion or a vibe — beach wedding brunch, preppy streetwear…"
          value={prompt}
          disabled={!apiKey || missing.length > 0 || isLoading}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canGenerate) handleGenerate(); }}
          style={{ flex: '1 1 280px', height: '40px' }}
        />
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="tap-target"
          style={{
            border: '1px solid var(--text-primary)',
            backgroundColor: canGenerate ? 'var(--text-primary)' : 'transparent',
            color: canGenerate ? 'var(--bg-surface)' : 'var(--text-muted)',
            borderColor: canGenerate ? 'var(--text-primary)' : 'var(--border-color)',
            fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em',
            padding: '9px 18px', cursor: canGenerate ? 'pointer' : 'not-allowed'
          }}
        >
          {isLoading ? (hasGeneratedOnce ? 'Styling…' : 'Preparing your closet…') : 'Generate'}
        </button>
      </div>

      {/* Disabled-state hints */}
      {!apiKey && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Add your Gemini API key in the Upload panel to enable the stylist.
        </p>
      )}
      {apiKey && missing.length > 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          The stylist needs at least one top, bottom, and pair of sneakers — your closet is missing:{' '}
          {missing.map(s => SLOT_LABELS[s].toLowerCase()).join(', ')}.
        </p>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '0.85rem', color: '#c0392b',
          borderTop: '1px solid var(--border-color)', paddingTop: '12px'
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => (draft ? handleRegenerate() : handleGenerate())}
            className="tap-target"
            style={{
              border: '1px solid var(--border-color)', background: 'none',
              color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600,
              padding: '6px 14px', cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Draft card */}
      {draft && (
        <div style={{
          borderTop: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
          padding: '18px 0',
          display: 'flex', flexDirection: 'column', gap: '16px',
          opacity: isLoading ? 0.5 : 1, transition: 'var(--transition-fast)'
        }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {slotGroups.map(group => (
              <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => setLocks(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                  className="tap-target"
                  title={group.locked ? 'Unlock — allow regeneration to change this' : 'Lock — keep this on regenerate'}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: group.locked ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}
                >
                  {group.locked ? <Lock size={11} /> : <LockOpen size={11} />}
                  {slotHeading(group.key)}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {group.ids.map(id => {
                    const item = resolve(id);
                    if (!item) return null;
                    return (
                      <div key={id} title={item.name} style={{
                        width: '86px', height: '86px',
                        border: group.locked ? '1px solid var(--text-primary)' : '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: 'var(--bg-surface)'
                      }}>
                        <img src={item.image} alt={item.name}
                          style={{ width: '88%', height: '88%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '640px' }}>
            {draft.stylistNote}
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Outfit name"
              style={{ flex: '1 1 200px', height: '40px' }}
            />
            <button onClick={handleSave} disabled={!draftName.trim() || isLoading} className="tap-target"
              style={{
                border: 'none', backgroundColor: 'var(--text-primary)', color: 'var(--bg-surface)',
                fontSize: '0.8rem', fontWeight: 600, padding: '10px 18px',
                cursor: draftName.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: '6px',
                opacity: draftName.trim() && !isLoading ? 1 : 0.5
              }}>
              <Check size={14} /> Save to outfits
            </button>
            <button onClick={handleRegenerate} disabled={isLoading} className="tap-target"
              style={{
                border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)',
                fontSize: '0.8rem', fontWeight: 600, padding: '10px 18px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
              <RefreshCw size={14} /> Regenerate
            </button>
            <button onClick={handleDiscard} disabled={isLoading} className="tap-target"
              title="Discard draft"
              style={{
                border: 'none', background: 'none', color: 'var(--text-muted)',
                fontSize: '0.8rem', fontWeight: 500, padding: '10px 12px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
              <X size={14} /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIStylist;
```

- [ ] **Step 2: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass (component compiles; not yet rendered anywhere).

- [ ] **Step 3: Commit**

```bash
git add src/components/AIStylist.tsx
git commit -m "feat: add AIStylist prompt bar and draft outfit card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire AIStylist into OutfitBuilder and App

**Files:**
- Modify: `src/App.tsx` (add `handleSaveAIOutfit` near the other outfit handlers, ~line 272 area after `handleSaveOutfit`; pass prop where `<OutfitBuilder` is rendered)
- Modify: `src/components/OutfitBuilder.tsx` (add prop, render `<AIStylist>` between the build-mode panel block and the `{/* Saved outfits shelf */}` comment)

**Interfaces:**
- Consumes: `AIStylist` from Task 5.
- Produces: the user-visible feature. New `OutfitBuilderProps` member: `onSaveAIOutfit: (name: string, itemIds: string[]) => void`.

- [ ] **Step 1: Add the save handler in App.tsx**

Insert after the existing `handleSaveOutfit` function:

```typescript
  // AI stylist saves a complete outfit directly — no selection-mode round trip
  const handleSaveAIOutfit = (name: string, itemIds: string[]) => {
    const newOutfit: Outfit = {
      id: `outfit_${Date.now()}`,
      name,
      itemIds,
      createdAt: Date.now()
    };
    setOutfits(prev => [newOutfit, ...prev]);
  };
```

- [ ] **Step 2: Pass the prop where OutfitBuilder is rendered in App.tsx**

Find the `<OutfitBuilder` JSX element and add:

```tsx
            onSaveAIOutfit={handleSaveAIOutfit}
```

- [ ] **Step 3: Render AIStylist inside OutfitBuilder.tsx**

Add to the imports:

```tsx
import AIStylist from './AIStylist';
```

Add to `OutfitBuilderProps` and to the destructured props:

```tsx
  onSaveAIOutfit: (name: string, itemIds: string[]) => void;
```

Immediately before the `{/* Saved outfits shelf */}` comment in the JSX, insert:

```tsx
      {/* AI stylist: prompt-to-outfit, above the saved shelf */}
      {!isBuilding && <AIStylist items={items} onSaveAIOutfit={onSaveAIOutfit} />}
```

(`items` here is already the combined garments + sneakers array — `App.tsx` passes `allItems` to `OutfitBuilder`. Hidden during manual build mode so the two creation flows never stack.)

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 5: Smoke-check rendering**

Run the dev server: the prompt bar renders in the Outfits section above the saved shelf; with no API key stored it is disabled with the hint text; entering manual build mode hides it.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/OutfitBuilder.tsx
git commit -m "feat: wire AI stylist into the outfits section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Manual end-to-end verification (spec checklist)

**Files:** none — verification only. Requires a valid Gemini API key entered in the Upload panel.

**Interfaces:**
- Consumes: the complete feature from Tasks 1–6.
- Produces: a verified v1. Record pass/fail per item; any failure is a bug to fix before calling the feature done (use superpowers:systematic-debugging).

- [ ] **Step 1: Happy path — occasion prompt.** Type "beach wedding brunch", Generate. Expect: a draft with exactly one top, one bottom, one pair of sneakers (layers optional), a plausible stylist note, and a pre-filled name.
- [ ] **Step 2: Happy path — style inspiration.** Type "preppy streetwear", Generate. Expect: same structural guarantees, picks that plausibly match the vibe.
- [ ] **Step 3: Lock & swap.** Lock the top, Regenerate. Expect: top unchanged, at least one other slot changes, and the exact previous combo never reappears.
- [ ] **Step 4: History cap.** Regenerate 10+ times. Expect: no errors; behavior stays responsive (history silently capped at 8).
- [ ] **Step 5: No API key.** Clear `gemini_api_key` in devtools localStorage, reload. Expect: prompt bar disabled with the hint; no network calls.
- [ ] **Step 6: Empty slot inventory.** In devtools, temporarily rename all sneakers' category (or test with a fresh profile before sneakers load). Expect: pre-flight message names the missing slot; no API call in the Network tab.
- [ ] **Step 7: Forced validation failure.** In `stylist.ts`, temporarily make `callGemini` corrupt the first response (`rec.topId = 'bogus_id'` behind a one-shot flag). Expect: one silent retry succeeds. Make it corrupt both responses: expect the inline "invalid outfit twice" error with Retry. Revert the temporary code.
- [ ] **Step 8: Save & downstream.** Save a draft. Expect: it appears at the top of the saved shelf, survives reload, packs all items to the packing list, and is editable via the existing edit flow like any manual outfit.
- [ ] **Step 9: Commit any fixes** made during verification, each with its own focused commit.

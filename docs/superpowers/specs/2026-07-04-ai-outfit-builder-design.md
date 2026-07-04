# AI Outfit Builder — Design

**Date:** 2026-07-04
**Status:** Approved for planning

## Summary

An AI stylist inside the existing Outfits section. The user types an occasion
("beach wedding brunch") or style inspiration ("preppy streetwear"); the app
sends the full inventory — garments and sneakers, as thumbnails plus metadata —
to Gemini in a single structured-output call, and renders a draft outfit of one
top, one bottom, one pair of shoes, and optional layers. The user can lock
slots they like, regenerate the rest (without repeats), and save the result
through the existing outfit persistence path.

## Decisions made during brainstorming

| Decision | Choice |
|---|---|
| Shoes dependency | Merge `feature/sneaker-closet` into `main` first (step zero) |
| AI provider | Gemini, reusing the existing `gemini_api_key` in localStorage |
| Model input | Text metadata **and** downscaled item images (~256px thumbnails) |
| Regeneration | Per-slot lock & swap; rejected combos fed back so the model doesn't repeat |
| UI placement | Inside the Outfits section, above the saved-outfits shelf |
| Architecture | Single `generateContent` call with the whole inventory (Approach A) |

Rationale highlights:

- The closet is ~60 items, small enough to send in full; two-stage curation
  (Approach B) and local pre-filtering (Approach C) add complexity with no
  quality gain at this scale.
- Sneaker metadata is intentionally sparse placeholder data (name = style
  code, blank color/description), so image input is what lets the model judge
  sneakers at all.
- The sneaker branch's `Outfit` type already holds mixed ids (`sneaker_*`
  prefix convention) in one `itemIds` array, so saving an AI outfit reuses the
  existing save path unchanged.

## Architecture

### Step zero

Merge `feature/sneaker-closet` into `main` (one commit ahead; resolve any
conflicts as part of the merge). All subsequent work builds on the merged tree.

### New module: `src/services/stylist.ts`

Pure logic, no React. Exports:

- `buildInventoryParts(items, sneakers)` — assembles the multimodal request
  parts: per item, a downscaled thumbnail (~256px JPEG via canvas, reusing the
  technique in `src/utils/image.ts`) followed by a compact metadata line
  (`id | category | color | brand | description`).
- `generateOutfit(request)` — one call to
  `gemini-3.5-flash:generateContent` with `responseSchema` +
  `responseMimeType: application/json`. The request carries the user prompt,
  locked slot ids, and rejection history.
- `validateRecommendation(result, inventory)` — every returned id must exist
  and belong to the correct slot category. On failure: one silent retry with
  the validation error appended to the prompt, then a user-facing error.

### Thumbnail cache

In-memory `Map<itemId, base64>`, built lazily on the first generation of a
session and reused for regenerations. Not persisted — localStorage already
carries full-size base64 uploads, and re-encoding ~60 thumbnails costs ~1–2
seconds once per session.

### New component: `src/components/AIStylist.tsx`

Prompt bar + draft outfit card, rendered by `OutfitBuilder` inside the Outfits
section. Owns all transient state: prompt text, current draft, per-slot locks,
rejection history, loading/error state. Saving calls the same `onSaveOutfit`
path as the manual builder — a saved AI outfit is indistinguishable from a
manual one. The draft never touches localStorage until saved.

### Data flow

prompt → build parts (cache hit after first run) → Gemini → validate → draft
card → lock/regenerate loop (each rejected draft appended to history) → save
via existing outfit persistence → appears in the saved outfits shelf.

## Model contract

### Request (one `generateContent` call)

1. **Preamble:** "You are a personal stylist for Kevin's real wardrobe. You
   may ONLY use the item ids listed. Build one outfit: exactly one top, one
   bottom, one pair of shoes, plus optional layers when the occasion or
   styling calls for it."
2. **Inventory:** per item, thumbnail image then metadata line. Slot mapping
   is computed client-side and stated explicitly in the prompt:
   - **Tops:** T-Shirts, Polos, Long Sleeves, Jerseys, Shirts
   - **Bottoms:** Pants, Shorts
   - **Layers:** Sweatshirts, Hoodies, Outerwear
   - **Shoes:** Sneakers
3. **User prompt:** occasion/vibe text, verbatim.
4. **Constraints:** locked ids ("fixed — build around them") and rejection
   history ("do not repeat these combinations").

### Response schema (enforced)

```json
{
  "topId": "string",
  "bottomId": "string",
  "shoeId": "string",
  "layerIds": ["string"],
  "outfitName": "string",
  "stylistNote": "string"
}
```

- `outfitName` pre-fills the save field (editable).
- `stylistNote` is 1–2 sentences of reasoning shown on the draft card.
- `layerIds` may be empty; when the occasion calls for layering the model may
  return one or more layer ids.

### Rejection history

Capped at the last 8 combos to bound prompt growth during long regeneration
sessions. A combo is the tuple of (topId, bottomId, shoeId, layerIds) of a
draft the user regenerated away from.

## Error handling

| Failure | Behavior |
|---|---|
| No API key stored | Prompt bar renders disabled with a pointer to the existing key field in the upload modal |
| Invalid/hallucinated id or wrong slot | One silent retry with the validation error appended; if it fails again, inline error + Retry button |
| Network / quota / 4xx-5xx | Inline error showing the API's message, Retry button; draft and locks preserved |
| Empty slot inventory (e.g., no sneakers added yet) | Detected before calling the API; message explains what's missing instead of burning a request |

## UX

A single-line prompt input above the saved-outfits shelf ("Describe an
occasion or a vibe…") with a Generate button. While generating, the input
locks and a quiet progress state shows; the first generation notes that it is
preparing images (thumbnail encode adds a second or two). The draft renders as
one card in the app's editorial style: item images grouped by slot, a lock
toggle per slot, the stylist note beneath, then three actions:

- **Save to outfits** — name pre-filled from `outfitName`, editable.
- **Regenerate** — replaces unlocked slots only; avoids the rejection history.
- **Discard** — clears the draft and locks.

Design constraints from PRODUCT.md and the established taste: continuous white
field, hairline rules, no boxed-panel dashboard styling; let the garment
photography dominate.

## Testing

The repo has no test framework and v1 does not add one. The logic that most
needs verification — prompt assembly, category-to-slot mapping, response
validation — lives in pure functions in `stylist.ts` so tests can be added
later without refactoring.

Manual verification checklist:

1. Happy path with an occasion prompt ("beach wedding brunch").
2. Happy path with a style-inspiration prompt ("preppy streetwear").
3. Lock top, regenerate — top persists, other slots change, no repeated combo.
4. Regenerate past the 8-combo history cap — no errors, prompt stays bounded.
5. No API key — prompt bar disabled with pointer to key field.
6. Empty sneaker inventory — pre-flight message, no API call made.
7. Forced validation failure (temporarily corrupt an id in the response
   handler) — confirms the silent-retry-then-error path.
8. Save draft — appears in saved outfits, packs to packing list like a manual
   outfit.

## Out of scope for v1

- Multiple outfit options per generation (single draft with lock & swap only).
- Weather/season awareness beyond what the user types in the prompt.
- Persisting drafts or rejection history across sessions.
- Provider choice (Gemini only) and image-free text-only mode.

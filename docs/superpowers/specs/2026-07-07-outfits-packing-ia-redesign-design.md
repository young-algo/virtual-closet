# Outfits & Packing IA Redesign — "The Closet Comes First"

**Date:** 2026-07-07
**Status:** Approved

## Problem

The app began as a packing-list tool and the layout still says so: a 400px packing
sidebar is permanently docked on the right of every view, and every grid cell carries
an always-visible add-to-packing button. Meanwhile the Outfits section (accordion
list, AI stylist, build panel) sits above the closet grid, so with many saved outfits
the closet itself — the surface used daily — starts well below the fold and never
gets full width.

Packing is episodic (a few trips a year); browsing the closet and styling outfits is
habitual. Prominence should follow frequency.

## Decisions (confirmed with Kevin)

1. **Outfits become a third top-level view** — the typographic switcher grows to
   `Closet / Sneakers / Outfits`.
2. **The packing list becomes an on-demand slide-over** — the docked sidebar is
   removed; a quiet header trigger opens a right slide-over panel.
3. **Packing adds happen from outfits and the item detail view** — the always-visible
   checkbox/add button leaves the grid cells.
4. **Lookbook format: composed collage well** — each saved look renders as one grey
   well containing a small composition of its items, like a flat-lay photograph.

## Design

### 1. Navigation & page structure

- The switcher renders three Display-voice words: **Closet / Sneakers / Outfits**.
  Active in ink, inactive in light grey — the existing pattern, no tabs or boxes.
- The permanent right sidebar is removed. `main` becomes a single full-width pane.
- Header (left to right): wordmark · **Packing trigger** · context CTA.
  - **Packing trigger:** Control-voice text button, `Packing — 8` with the count in
    mono; reads just `Packing` when the list is empty. The only persistent trace of
    the packing feature.
  - **Context CTA** follows the view: `Add Garment` (Closet), `Add Sneaker`
    (Sneakers), `New Outfit` (Outfits).

### 2. Closet & Sneakers views

- The grid is the first content on the field and spans the full page width (grid
  gains a column at desktop widths now that the sidebar is gone).
- Grid cells lose the add-to-packing button entirely — pure product cells: well,
  image, brand, name, color.
- The item detail modal keeps its existing "Add to packing list / Remove from
  packing list" action; this is the per-item pack flow.
- Outfit-building selection mode on the grids is unchanged.

### 3. Outfits view (the styling room)

- **AI Stylist** moves here from the OutfitBuilder section, as the top strip of the
  view. Its behavior is unchanged.
- Below it, the **lookbook**: a responsive grid of saved looks (roughly 3–4 per row
  at desktop). Each look:
  - One grey well (1:1) containing a composed collage of the outfit's items —
    slot-aware placement (top garment upper-left, bottom lower-left, layer upper-right,
    shoes lower-right; degrade gracefully for 2-item or 5+-item outfits by simple
    grid packing within the well).
  - Beneath the well, on the field: outfit name (Body voice), then date · item count
    in Data voice; AI-saved looks keep a small mono `AI` tag.
- **Expanded look view:** clicking a look expands it (accordion behavior carried
  over — at most one expanded) into the full look: slot-ordered items with labels,
  the stylist note if present, and the action row — Pack, Edit, seed-stylist toggle,
  Delete (with existing confirm step). Pack shows the existing transient "Packed"
  feedback and ticks the header count; the slide-over does not auto-open.

### 4. Building & editing flow (cross-view)

- Starting **New Outfit** (header CTA on Outfits view) or **Edit** on a look
  switches `view` to `closet` and pins the existing grey build tray above the grid.
- While building, Closet ↔ Sneakers switching works as today for mixing both
  closets; the **Outfits** switcher word is muted/disabled.
- Save or Cancel clears build state and returns to the Outfits view.

### 5. Packing slide-over

- Triggered by the header `Packing — n` button. A ~420px panel slides in from the
  right over the standard scrim; it belongs to the dialog layer, so the single
  permitted shadow applies. Animate transforms only.
- Content is the current `PackingList` component unchanged: trip name field, 2px
  progress rule, category-grouped checklist with physical-packed checkboxes,
  export/clear footer with confirm step.
- Dismiss: scrim click, ✕ button, Escape.
- Mobile (≤700px): the panel becomes a full-screen sheet.

### 6. What does not change

- No data-model or storage changes: same localStorage keys
  (`closet_items`, `sneaker_items`, `closet_packed_items`, `closet_outfits`,
  tombstone keys), same outfit/packing state shape in `App.tsx`.
- Stylist service, upload pipelines, item detail modals, delete/tombstone logic —
  all untouched.

## Component-level changes

| Unit | Change |
| --- | --- |
| `App.tsx` | `view` type gains `'outfits'`; add `isPackingOpen`; remove sidebar column; header gains packing trigger; context CTA switch; build flow forces `view: 'closet'` on start and `'outfits'` on save/cancel. |
| `OutfitBuilder.tsx` | Splits: **`OutfitsView`** (AI stylist strip + lookbook grid + expanded look) and **`OutfitBuildTray`** (the existing well panel, rendered above the grid while building). |
| `PackingList.tsx` | Content unchanged; wrapped in a new **`PackingDrawer`** overlay shell (scrim + slide-in panel + close affordances). |
| `ClosetGrid.tsx` / `SneakerGrid.tsx` | Remove the per-cell add-to-packing button; `packedItemIds` and `onAddToPackingList` props stay, used only by the detail-modal pack action. |

## Design-system constraints (from DESIGN.md)

- Continuous field: no new cards or panels on the field; the lookbook well is
  imagery-plinth usage, which is sanctioned Well usage.
- Packing trigger and all new controls in Control voice; counts and metadata in
  Data voice; no new colors; zero radius; transform-only animation.
- The slide-over is a dialog-layer surface (scrim + shadow permitted).

## Error handling & edge cases

- Empty outfits: Outfits view shows the stylist strip plus a muted one-line empty
  state inviting the first look.
- Outfits referencing deleted items already self-heal (`itemIds` filtered on
  delete); collage composition just renders the remaining items.
- Packing trigger with 0 items opens the drawer to its existing empty state.
- While building, attempting to open the packing drawer is allowed (read-only
  glance is harmless); Outfits navigation is the only disabled route.

## Testing

Manual verification via the dev preview:

1. Three-word switcher renders and routes; closet grid is first on the field and
   full width; no packing affordance on cells.
2. Outfits view: stylist strip, collage lookbook, expand/collapse, all four look
   actions work; AI tag and note render.
3. New Outfit / Edit jumps to Closet with tray; Closet↔Sneakers mixing works;
   Outfits word disabled; Save/Cancel returns to Outfits.
4. Packing drawer: open/close (trigger, scrim, ✕, Escape), count in header stays
   live, pack-from-outfit and pack-from-detail-modal both land items; export,
   clear-confirm, progress rule work; mobile sheet at ≤700px.
5. localStorage round-trip: reload preserves outfits, packed items, view defaults
   to Closet.

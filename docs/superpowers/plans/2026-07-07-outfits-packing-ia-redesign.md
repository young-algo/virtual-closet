# Outfits & Packing IA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the closet the primary surface — outfits become a third top-level view with a collage lookbook, and the packing list moves from a docked sidebar to an on-demand slide-over.

**Architecture:** Pure re-composition of existing React state in `App.tsx`: the `view` union gains `'outfits'`, a new `isPackingOpen` boolean drives a `PackingDrawer` overlay, and `OutfitBuilder.tsx` splits into `OutfitsView.tsx` (AI stylist + lookbook) and `OutfitBuildTray.tsx` (the build panel, rendered above the grids while building). No data-model or storage changes.

**Tech Stack:** React 19, TypeScript 6, Vite 8, lucide-react icons, inline style objects + occasional `<style>` tags (codebase idiom). No CSS framework, no router — views are conditional renders on `view` state.

**Spec:** `docs/superpowers/specs/2026-07-07-outfits-packing-ia-redesign-design.md`

## Global Constraints

- **No test framework exists in this repo.** Verification per task = `npm run build` (runs `tsc -b`, catches type errors) + `npm run lint` (oxlint) + the manual preview checks listed in each task. Do not add a test framework.
- **Design system (DESIGN.md):** controls in Control voice (Archivo 500, `0.68rem`, uppercase, `0.12em` tracking); metadata in Data voice (`var(--font-mono)`, `0.65rem`, uppercase); zero border radius; no shadows except `--shadow-lg` (`0 32px 80px rgba(0,0,0,0.14)`) on dialog-layer surfaces; grey `var(--well)` only behind imagery and the build tray; animate transforms/opacity only, never layout properties; no new colors.
- **localStorage keys unchanged:** `closet_items`, `sneaker_items`, `closet_packed_items`, `closet_outfits`, `closet_deleted_ids`, `sneaker_deleted_ids`.
- **Existing modal conventions:** scrim `rgba(17, 17, 17, 0.4)`, `zIndex: 100` (see `UploadModal.tsx:295-305`). The drawer uses `zIndex: 100` (scrim) / `101` (panel).
- Dev server: `npm run dev` (Vite, port 5173). Use the preview tooling to verify, not manual user checks.
- Commit after every task with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Remove per-cell packing buttons from both grids

Grid cells become pure product cells. The per-item pack flow survives only in the
detail modals (which already have it and read `packedItemIds` directly).

**Files:**
- Modify: `src/components/ClosetGrid.tsx:353-452`
- Modify: `src/components/SneakerGrid.tsx:343-446`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no API change — `onAddToPackingList` and `packedItemIds` props remain on both grids (still used by the detail modals). Only cell rendering changes.

- [ ] **Step 1: Edit ClosetGrid.tsx**

Delete the unused cell-level const at line 354:

```tsx
            const isPacked = packedItemIds.includes(item.id);
```

Then replace the actions-overlay ternary inside the image well (lines 392–452, the block starting `{/* Actions overlay panel */}`) so only the selection indicator remains:

```tsx
                  {/* Outfit selection indicator — card click toggles, so no stopPropagation */}
                  {selectionMode && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid',
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color-hover)',
                        backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: 'var(--bg-surface)',
                        transition: 'var(--transition-fast)',
                        boxShadow: 'var(--shadow-sm)',
                        zIndex: 2
                      }}
                    >
                      {isSelected && <Check size={16} strokeWidth={3} />}
                    </div>
                  )}
```

The `Plus` and `Check` imports stay — the detail modal (around lines 828–856) still uses both.

- [ ] **Step 2: Edit SneakerGrid.tsx the same way**

Delete line 343 (`const isPacked = packedItemIds.includes(sneaker.id);`) and replace the ternary at lines 389–446 with the selection-indicator-only block (identical to Step 1's replacement, minus the `boxShadow` line, matching the existing sneaker indicator which has no boxShadow). The detail modal at lines ~915–943 keeps using `packedItemIds` and `onAddToPackingList`.

- [ ] **Step 3: Verify types and lint**

Run: `npm run build`
Expected: succeeds. If `tsc` or oxlint reports a now-unused variable or import in either grid, remove it.

Run: `npm run lint`
Expected: no new warnings versus main.

- [ ] **Step 4: Verify in preview**

Start the dev server and check: closet and sneaker cells show **no** +/✓ button at rest; hovering shows nothing new; entering outfit-build mode still shows the square selection indicator; opening an item's detail modal still shows "Add to packing list" and toggles correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/ClosetGrid.tsx src/components/SneakerGrid.tsx
git commit -m "refactor: remove per-cell packing buttons; pack via detail modal only"
```

---

### Task 2: Packing drawer + header trigger; remove the docked sidebar

**Files:**
- Create: `src/components/PackingDrawer.tsx`
- Modify: `src/App.tsx` (header, main layout, style tag)

**Interfaces:**
- Consumes: `PackingList` (default export, props `{ packedItems, onRemoveItem, onClearList }`) — unchanged.
- Produces: `PackingDrawer` default export with props:
  ```ts
  interface PackingDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    packedItems: ClosetItem[];
    onRemoveItem: (item: ClosetItem) => void;
    onClearList: () => void;
  }
  ```
  `App.tsx` gains state `const [isPackingOpen, setIsPackingOpen] = useState(false);`

- [ ] **Step 1: Create `src/components/PackingDrawer.tsx`**

```tsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import PackingList from './PackingList';

interface PackingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  packedItems: ClosetItem[];
  onRemoveItem: (item: ClosetItem) => void;
  onClearList: () => void;
}

// Slide-over shell for the packing list. A dialog-layer surface: scrim plus the
// one permitted shadow. Only transform/opacity are animated. On phones the
// panel becomes a full-screen sheet (see the style tag below).
export const PackingDrawer: React.FC<PackingDrawerProps> = ({
  isOpen,
  onClose,
  packedItems,
  onRemoveItem,
  onClearList
}) => {
  // Escape closes; body scroll locks while open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(17, 17, 17, 0.4)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 100
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Packing list"
        className="packing-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        <button
          onClick={onClose}
          className="tap-target"
          title="Close packing list"
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            border: 'none',
            background: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            zIndex: 1
          }}
        >
          <X size={18} />
        </button>
        <PackingList
          packedItems={packedItems}
          onRemoveItem={onRemoveItem}
          onClearList={onClearList}
        />
      </aside>
      <style>{`
        .packing-drawer {
          width: min(420px, 100vw);
        }
        @media (max-width: 700px) {
          .packing-drawer {
            width: 100%;
            border-left: none;
          }
        }
      `}</style>
    </>
  );
};

export default PackingDrawer;
```

Note: `PackingList` renders `flexGrow` content; inside this flex-column aside it fills the height as it did in the old sidebar. The ✕ overlaps the trip-name row's right edge; the trip-name input already spans full width, so no layout change is needed in `PackingList`.

- [ ] **Step 2: Wire the drawer into `App.tsx`**

Add the import and state:

```tsx
import PackingDrawer from './components/PackingDrawer';
```

```tsx
  const [isPackingOpen, setIsPackingOpen] = useState(false);
```

(next to the existing `isUploadOpen` / `isAddSneakerOpen` state, `App.tsx:156-157`).

- [ ] **Step 3: Add the header trigger**

In the header, wrap the CTA in a right-side group and add the quiet packing trigger before it. Replace the existing `<button onClick={() => view === 'closet' ? ...}>` block (`App.tsx:386-404`) with:

```tsx
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {/* Quiet packing trigger — the only persistent trace of the packing feature */}
          <button
            onClick={() => setIsPackingOpen(true)}
            className="tap-target"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.68rem',
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
              padding: '12px 0',
              whiteSpace: 'nowrap'
            }}
          >
            Packing
            {packedItems.length > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em'
              }}>
                — {packedItems.length}
              </span>
            )}
          </button>

          {/* The CTA follows the active closet: garments run the AI pipeline,
              sneakers take hi-fi photos and manual metadata directly */}
          <button
            onClick={() => view === 'closet' ? setIsUploadOpen(true) : setIsAddSneakerOpen(true)}
            className="tap-target"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-surface)',
              border: 'none',
              fontSize: '0.68rem',
              fontWeight: 500,
              padding: '12px 26px',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={13} strokeWidth={2} />
            {view === 'closet' ? 'Add Garment' : 'Add Sneaker'}
          </button>
        </div>
```

- [ ] **Step 4: Remove the docked sidebar and render the drawer**

Delete the sidebar block (`App.tsx:515-525`):

```tsx
        {/* Right Side: Packing list sidebar */}
        <div style={{
          borderLeft: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }} className="packing-sidebar">
          <PackingList ... />
        </div>
```

Remove the now-unused `import PackingList from './components/PackingList';` from `App.tsx`. Render the drawer next to the other modals (after `<AddSneakerModal ... />`):

```tsx
      <PackingDrawer
        isOpen={isPackingOpen}
        onClose={() => setIsPackingOpen(false)}
        packedItems={packedItems}
        onRemoveItem={handleRemovePackingItem}
        onClearList={handleClearList}
      />
```

In the `<style>` tag at the bottom of `App.tsx`, delete the two-column desktop rule and the sidebar class:

```css
        @media (min-width: 1024px) {
          .app-main-layout {
            grid-template-columns: 1fr 400px;
          }
        }
        .packing-sidebar {
          display: flex;
          flex-direction: column;
        }
```

(`.app-main-layout { display: grid; grid-template-columns: 1fr; }` stays.)

- [ ] **Step 5: Verify**

Run: `npm run build` — expected: success.
Run: `npm run lint` — expected: no new warnings.

Preview checks: closet grid spans full width at desktop (more columns than before); header shows `PACKING — n` when items are packed, plain `PACKING` at zero; clicking it slides the panel in from the right over a scrim; scrim click, ✕, and Escape each close it; trip name, checkboxes, progress rule, export and clear-confirm all work inside the drawer; packing an item from a detail modal updates the header count live; at ≤700px width the drawer is full-screen.

- [ ] **Step 6: Commit**

```bash
git add src/components/PackingDrawer.tsx src/App.tsx
git commit -m "feat: packing list becomes an on-demand slide-over; closet gets full width"
```

---

### Task 3: Extract the outfit build tray from OutfitBuilder

The build panel becomes its own component rendered by `App` above the grids, so
that (in Task 4) building can continue while the Outfits view is elsewhere.
`OutfitBuilder` keeps everything else for now.

**Files:**
- Create: `src/components/OutfitBuildTray.tsx`
- Modify: `src/components/OutfitBuilder.tsx` (remove build-panel state/JSX and related props)
- Modify: `src/App.tsx` (render the tray; trim OutfitBuilder props)

**Interfaces:**
- Consumes: `Outfit` type from `./OutfitBuilder` (moves to `./OutfitsView` in Task 4); `ClosetItem` from `./ClosetGrid`.
- Produces: `OutfitBuildTray` default export with props:
  ```ts
  interface OutfitBuildTrayProps {
    selectedItems: ClosetItem[];
    editingOutfit: Outfit | null;
    onCancel: () => void;
    onSave: (name: string) => void;
    onToggleSelectItem: (item: ClosetItem) => void;
  }
  ```
  `OutfitBuilder` props shrink to: `outfits, items, isBuilding, onStartBuilding, onStartEditing, onDeleteOutfit, onAddOutfitToPackingList, onSaveAIOutfit, onToggleSeedStylist`.

- [ ] **Step 1: Create `src/components/OutfitBuildTray.tsx`**

This is the existing build panel (OutfitBuilder.tsx lines 171–314) with its name
state, moved verbatim into its own component:

```tsx
import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import type { Outfit } from './OutfitBuilder';

interface OutfitBuildTrayProps {
  selectedItems: ClosetItem[];
  editingOutfit: Outfit | null;
  onCancel: () => void;
  onSave: (name: string) => void;
  onToggleSelectItem: (item: ClosetItem) => void;
}

// The outfit build panel, pinned above the closet grids while selection mode is
// active. Grey-well surface is sanctioned: DESIGN.md's Well Rule covers the
// build panel explicitly.
export const OutfitBuildTray: React.FC<OutfitBuildTrayProps> = ({
  selectedItems,
  editingOutfit,
  onCancel,
  onSave,
  onToggleSelectItem
}) => {
  const [outfitName, setOutfitName] = useState('');
  const [nameError, setNameError] = useState('');

  // Pre-fill the name field when the tray opens in edit mode
  useEffect(() => {
    if (editingOutfit) {
      setOutfitName(editingOutfit.name);
      setNameError('');
    }
  }, [editingOutfit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = selectedItems.length >= 2;

  const handleSave = () => {
    if (!outfitName.trim()) {
      setNameError('Give your outfit a name before saving.');
      return;
    }
    onSave(outfitName.trim());
    setOutfitName('');
    setNameError('');
  };

  const handleCancel = () => {
    setOutfitName('');
    setNameError('');
    onCancel();
  };

  return (
    <div style={{
      backgroundColor: 'var(--well)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
            {editingOutfit ? `Editing "${editingOutfit.name}"` : 'Building an outfit'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Click items below to add or remove them — switch between Closet and Sneakers to mix both. Select at least 2 items.
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="tap-target"
          title="Cancel outfit"
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Selected item thumbnails */}
      {selectedItems.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {selectedItems.map(item => (
            <div
              key={item.id}
              title={item.name}
              style={{
                position: 'relative',
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible'
              }}
            >
              <img
                src={item.image}
                alt={item.name}
                style={{ width: '85%', height: '85%', objectFit: 'contain', mixBlendMode: 'multiply' }}
              />
              <button
                onClick={() => onToggleSelectItem(item)}
                className="tap-target"
                title={`Remove ${item.name}`}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '0',
                  border: 'none',
                  backgroundColor: 'var(--text-primary)',
                  color: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X size={11} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {nameError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--error)',
          backgroundColor: 'var(--error-bg)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          border: '1px solid var(--error-border)'
        }}>
          <AlertCircle size={16} />
          <span>{nameError}</span>
        </div>
      )}

      {/* Name + actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Outfit name (e.g. Golf Sunday)"
          value={outfitName}
          onChange={(e) => {
            setOutfitName(e.target.value);
            if (nameError) setNameError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) handleSave();
          }}
          style={{ flex: '1 1 220px', height: '42px' }}
        />
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="tap-target"
          title={canSave ? 'Save outfit' : 'Select at least 2 items to save'}
          style={{
            border: 'none',
            backgroundColor: canSave ? 'var(--accent-primary)' : 'var(--border-color)',
            color: canSave ? 'var(--bg-surface)' : 'var(--text-muted)',
            fontSize: '0.68rem',
            fontWeight: 500,
            padding: '13px 22px',
            cursor: canSave ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Check size={16} />
          {editingOutfit ? 'Update Outfit' : 'Save Outfit'} ({selectedItems.length})
        </button>
      </div>
    </div>
  );
};

export default OutfitBuildTray;
```

- [ ] **Step 2: Strip the panel from `OutfitBuilder.tsx`**

Remove from `OutfitBuilder.tsx`:
- Props `selectedItems`, `editingOutfit`, `onSaveOutfit`, `onCancelBuilding`, `onToggleSelectItem` (from the interface, destructuring, and usage).
- State `outfitName`, `nameError`; the `useEffect` pre-fill block; `canSave`, `handleSave`, `handleCancel`.
- The whole `{isBuilding && ( <div style={{ backgroundColor: 'var(--well)' ... )}` build-panel JSX block (lines 171–314).
- Now-unused imports: `X`, `AlertCircle` (keep `Plus`, `Check`, `Luggage`, `Trash2`, `Pencil`, `Sparkles`, `ChevronDown`).

`isBuilding` stays for now: it still hides the AIStylist strip and disables per-outfit Edit buttons during a build.

- [ ] **Step 3: Wire the tray in `App.tsx`**

Add the import:

```tsx
import OutfitBuildTray from './components/OutfitBuildTray';
```

Render it inside `.closet-pane`, between the switcher block and `<OutfitBuilder>`:

```tsx
          {isBuildingOutfit && (
            <OutfitBuildTray
              selectedItems={selectedOutfitItemIds
                .map(id => allItems.find(item => item.id === id))
                .filter((item): item is ClosetItem => item !== undefined)}
              editingOutfit={outfits.find(outfit => outfit.id === editingOutfitId) ?? null}
              onCancel={handleCancelBuildingOutfit}
              onSave={handleSaveOutfit}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          )}
```

Trim the `<OutfitBuilder>` call to the surviving props:

```tsx
          <OutfitBuilder
            outfits={outfits}
            items={allItems}
            isBuilding={isBuildingOutfit}
            onStartBuilding={handleStartBuildingOutfit}
            onStartEditing={handleStartEditingOutfit}
            onDeleteOutfit={handleDeleteOutfit}
            onAddOutfitToPackingList={handleAddOutfitToPackingList}
            onSaveAIOutfit={handleSaveAIOutfit}
            onToggleSeedStylist={handleToggleSeedStylist}
          />
```

- [ ] **Step 4: Verify**

Run: `npm run build` — expected: success.
Run: `npm run lint` — expected: no new warnings.

Preview checks: "New Outfit" opens the grey tray above the outfits section; selecting grid items populates thumbnails; thumbnail ✕ deselects; save with a name creates the outfit and closes the tray; Edit on an existing outfit pre-fills the name and pre-selects items; cancel clears everything.

- [ ] **Step 5: Commit**

```bash
git add src/components/OutfitBuildTray.tsx src/components/OutfitBuilder.tsx src/App.tsx
git commit -m "refactor: extract outfit build tray from OutfitBuilder"
```

---

### Task 4: Outfits becomes a third view with a collage lookbook

`OutfitBuilder.tsx` is replaced by `OutfitsView.tsx`: the AI stylist strip on top,
then a lookbook grid of collage wells, each expandable (accordion, one at a time)
into the full look view. `view` gains `'outfits'`; building jumps to the Closet
view and returns on save/cancel.

**Files:**
- Create: `src/components/OutfitsView.tsx`
- Delete: `src/components/OutfitBuilder.tsx`
- Modify: `src/App.tsx` (view union, switcher, header CTA, routing, build-flow jumps)
- Modify: `src/components/OutfitBuildTray.tsx:4` (import `Outfit` from `./OutfitsView`)

**Interfaces:**
- Consumes: `AIStylist` (props `{ items, savedOutfits, onSaveAIOutfit }`), `slotForItem`/`SlotName` from `../services/stylist`, `ClosetItem` from `./ClosetGrid`.
- Produces: `OutfitsView.tsx` exports `interface Outfit` (moved verbatim from `OutfitBuilder.tsx:7-22` — fields `id, name, itemIds, createdAt, seedStylist?, source?, note?` with their comments) and default component with props:
  ```ts
  interface OutfitsViewProps {
    outfits: Outfit[];
    items: ClosetItem[];
    onStartEditing: (outfit: Outfit) => void;
    onDeleteOutfit: (outfitId: string) => void;
    onAddOutfitToPackingList: (outfit: Outfit) => void;
    onSaveAIOutfit: (name: string, itemIds: string[], note?: string) => void;
    onToggleSeedStylist: (outfitId: string) => void;
  }
  ```
  Note: no `isBuilding`/`onStartBuilding` — while building, `view` is forced to `'closet'`, so `OutfitsView` is never rendered mid-build; "New Outfit" moves to the app header CTA.

- [ ] **Step 1: Create `src/components/OutfitsView.tsx`**

```tsx
import React, { useState } from 'react';
import { Check, Luggage, Trash2, Pencil, Sparkles } from 'lucide-react';
import type { ClosetItem } from './ClosetGrid';
import { slotForItem, type SlotName } from '../services/stylist';
import AIStylist from './AIStylist';

export interface Outfit {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: number;
  // When false, this outfit is excluded from the AI stylist's taste examples.
  // Optional so outfits saved before this field existed default to seeding.
  seedStylist?: boolean;
  // 'ai' when saved straight from the stylist and never touched since.
  // Cleared the first time Kevin edits the outfit — an edit is his judgment,
  // which turns the outfit into genuine taste. Unedited AI saves are
  // down-weighted as taste examples to avoid a self-reinforcing loop.
  source?: 'ai';
  // Stylist reasoning captured when an AI-generated outfit is saved.
  note?: string;
}

// Slot display order mirrors how an outfit is worn, top to bottom.
const SLOT_ORDER: SlotName[] = ['top', 'layer', 'bottom', 'shoes'];
const SLOT_DISPLAY: Record<SlotName, string> = { top: 'Top', layer: 'Layers', bottom: 'Bottom', shoes: 'Shoes' };

interface SlotGroup { label: string; items: ClosetItem[] }

const groupBySlot = (outfitItems: ClosetItem[]): SlotGroup[] => {
  const groups: SlotGroup[] = SLOT_ORDER.map(slot => ({
    label: SLOT_DISPLAY[slot],
    items: outfitItems.filter(item => slotForItem(item) === slot)
  }));
  const other = outfitItems.filter(item => slotForItem(item) === null);
  if (other.length > 0) groups.push({ label: 'Other', items: other });
  return groups.filter(group => group.items.length > 0);
};

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// One look as a flat-lay collage in a single well. Items arrive slot-ordered
// (top, layer, bottom, shoes), so a 2x2 row-major grid puts the top garment
// upper-left and shoes lower-right when all four slots are present; smaller or
// larger outfits pack the same grid gracefully. Only the first four items are
// composed — the meta line below the well carries the true count.
const LookCollage: React.FC<{ items: ClosetItem[] }> = ({ items }) => {
  const shown = items.slice(0, 4);
  return (
    <div
      className="product-image-container"
      style={{
        aspectRatio: '1',
        backgroundColor: 'var(--well)',
        display: 'grid',
        gridTemplateColumns: shown.length <= 1 ? '1fr' : '1fr 1fr',
        gridTemplateRows: shown.length <= 2 ? '1fr' : '1fr 1fr',
        padding: '12%',
        gap: '6%',
        overflow: 'hidden'
      }}
    >
      {shown.map(item => (
        <div key={item.id} style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              mixBlendMode: 'multiply'
            }}
          />
        </div>
      ))}
    </div>
  );
};

interface OutfitsViewProps {
  outfits: Outfit[];
  items: ClosetItem[];
  onStartEditing: (outfit: Outfit) => void;
  onDeleteOutfit: (outfitId: string) => void;
  onAddOutfitToPackingList: (outfit: Outfit) => void;
  onSaveAIOutfit: (name: string, itemIds: string[], note?: string) => void;
  onToggleSeedStylist: (outfitId: string) => void;
}

// The styling room: AI stylist strip on top, then the lookbook — a grid of
// collage wells, each expandable (one at a time) into the full look view.
export const OutfitsView: React.FC<OutfitsViewProps> = ({
  outfits,
  items,
  onStartEditing,
  onDeleteOutfit,
  onAddOutfitToPackingList,
  onSaveAIOutfit,
  onToggleSeedStylist
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [packedFeedbackId, setPackedFeedbackId] = useState<string | null>(null);
  // At most one look is expanded into its full-width detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handlePackOutfit = (outfit: Outfit) => {
    onAddOutfitToPackingList(outfit);
    setPackedFeedbackId(outfit.id);
    setTimeout(() => setPackedFeedbackId(prev => (prev === outfit.id ? null : prev)), 2000);
  };

  // Resolve outfit item IDs against the live closet, skipping deleted garments
  const resolveOutfitItems = (outfit: Outfit): ClosetItem[] =>
    outfit.itemIds
      .map(id => items.find(item => item.id === id))
      .filter((item): item is ClosetItem => item !== undefined);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <AIStylist
        items={items}
        savedOutfits={outfits.filter(outfit => outfit.seedStylist !== false)}
        onSaveAIOutfit={onSaveAIOutfit}
      />

      {outfits.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '4px 0 8px' }}>
          No outfits yet. Use "New Outfit" above to compose a look from your closet, or ask the stylist.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: '48px 28px'
        }}>
          {outfits.map(outfit => {
            const outfitItems = resolveOutfitItems(outfit);
            const slotGroups = groupBySlot(outfitItems);
            const orderedItems = slotGroups.flatMap(group => group.items);
            const isExpanded = expandedId === outfit.id;
            const isConfirmingDelete = deleteConfirmId === outfit.id;
            const justPacked = packedFeedbackId === outfit.id;
            const seeding = outfit.seedStylist !== false;
            return (
              <React.Fragment key={outfit.id}>
                {/* Lookbook cell */}
                <article
                  className="interactive-card"
                  style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                  onClick={() => setExpandedId(prev => (prev === outfit.id ? null : outfit.id))}
                  aria-expanded={isExpanded}
                >
                  <LookCollage items={orderedItems} />
                  <div style={{ padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{
                      fontSize: '0.9rem',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: isExpanded ? 'underline' : 'none',
                      textUnderlineOffset: '4px'
                    }}>
                      {outfit.name}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em'
                    }}>
                      {outfitItems.length} {outfitItems.length === 1 ? 'item' : 'items'}
                      {' · '}{formatDate(outfit.createdAt)}
                      {outfit.source === 'ai' ? ' · AI' : ''}
                    </span>
                  </div>
                </article>

                {/* Expanded look view — spans the full lookbook row below the cell */}
                {isExpanded && (
                  <div style={{
                    gridColumn: '1 / -1',
                    borderTop: '1px solid var(--border-color)',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '28px 0'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        {slotGroups.map(group => (
                          <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase',
                              color: 'var(--text-muted)'
                            }}>
                              {group.label}
                            </span>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              {group.items.map(item => (
                                <figure key={item.id} style={{ width: '140px', margin: 0 }}>
                                  <div style={{
                                    width: '140px',
                                    height: '140px',
                                    backgroundColor: 'var(--well)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    <img
                                      src={item.image}
                                      alt={item.name}
                                      loading="lazy"
                                      style={{ width: '85%', height: '85%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                                    />
                                  </div>
                                  <figcaption style={{ marginTop: '6px' }}>
                                    <span style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      color: 'var(--text-primary)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {item.name}
                                    </span>
                                    {item.brand && (
                                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {item.brand}
                                      </span>
                                    )}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {outfit.note && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '640px' }}>
                          {outfit.note}
                        </p>
                      )}

                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Delete "{outfit.name}"?
                          </span>
                          <button
                            onClick={() => {
                              onDeleteOutfit(outfit.id);
                              setDeleteConfirmId(null);
                              setExpandedId(null);
                            }}
                            className="tap-target"
                            style={{
                              padding: '8px 16px',
                              border: 'none',
                              backgroundColor: 'var(--error)',
                              color: 'white',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="tap-target"
                            style={{
                              padding: '8px 16px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'transparent',
                              color: 'var(--text-secondary)',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            onClick={() => handlePackOutfit(outfit)}
                            disabled={outfitItems.length === 0}
                            className="tap-target"
                            style={{
                              padding: '11px 20px',
                              border: 'none',
                              backgroundColor: justPacked ? 'var(--well)' : 'var(--accent-primary)',
                              color: justPacked ? 'var(--text-primary)' : 'var(--bg-surface)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: outfitItems.length === 0 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'var(--transition-fast)',
                              opacity: outfitItems.length === 0 ? 0.6 : 1
                            }}
                          >
                            {justPacked ? (
                              <>
                                <Check size={15} />
                                Added to packing list!
                              </>
                            ) : (
                              <>
                                <Luggage size={15} />
                                Add all to packing list
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => onStartEditing(outfit)}
                            className="tap-target"
                            title="Swap the garments in this outfit"
                            style={{
                              border: '1px solid var(--border-color)',
                              background: 'none',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              padding: '10px 18px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                          <button
                            onClick={() => onToggleSeedStylist(outfit.id)}
                            className="tap-target"
                            title={seeding
                              ? 'This outfit teaches the AI stylist your taste — click to exclude'
                              : 'Excluded from the AI stylist — click to include'}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: seeding ? 'var(--text-secondary)' : 'var(--text-muted)',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Sparkles size={13} />
                            Seeds stylist taste · {seeding ? 'on' : 'off'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(outfit.id)}
                            className="tap-target"
                            title="Delete outfit"
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '10px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              marginLeft: 'auto'
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--error)')}
                            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default OutfitsView;
```

- [ ] **Step 2: Update `App.tsx` — imports, view union, routing**

Replace the OutfitBuilder import:

```tsx
import OutfitsView from './components/OutfitsView';
import type { Outfit } from './components/OutfitsView';
```

Widen the view state (currently `App.tsx:160`):

```tsx
  // Which surface is on the field: garments, the sneaker archive, or the lookbook
  const [view, setView] = useState<'closet' | 'sneakers' | 'outfits'>('closet');
```

Update the build-flow handlers to jump between views:

```tsx
  const handleStartBuildingOutfit = () => {
    setSelectedOutfitItemIds([]);
    setEditingOutfitId(null);
    setIsBuildingOutfit(true);
    setView('closet');
  };

  // Reuse the build tray to edit an existing outfit, pre-selecting its garments
  const handleStartEditingOutfit = (outfit: Outfit) => {
    setSelectedOutfitItemIds(outfit.itemIds.filter(id => allItems.some(item => item.id === id)));
    setEditingOutfitId(outfit.id);
    setIsBuildingOutfit(true);
    setView('closet');
  };

  const handleCancelBuildingOutfit = () => {
    setSelectedOutfitItemIds([]);
    setEditingOutfitId(null);
    setIsBuildingOutfit(false);
    setView('outfits');
  };
```

and at the end of `handleSaveOutfit` (after `setIsBuildingOutfit(false);`):

```tsx
    setView('outfits');
```

- [ ] **Step 3: Update the switcher and header CTA in `App.tsx`**

Switcher: add the third word and mute Outfits while building. Replace the map
source array and the button rendering inside the `<h2>`:

```tsx
              {([
                { key: 'closet', label: 'Closet' },
                { key: 'sneakers', label: 'Sneakers' },
                { key: 'outfits', label: 'Outfits' }
              ] as const).map(({ key, label }) => {
                const isActive = view === key;
                // Outfits is unreachable mid-build: the tray owns the flow until save/cancel
                const isDisabled = isBuildingOutfit && key === 'outfits';
                return (
                  <button
                    key={key}
                    onClick={() => { if (!isDisabled) setView(key); }}
                    aria-pressed={isActive}
                    aria-disabled={isDisabled}
                    className="tap-target"
                    style={{
                      fontSize: '3rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 400,
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                      textTransform: 'none',
                      padding: 0,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      opacity: isDisabled ? 0.35 : 1,
                      cursor: isActive || isDisabled ? 'default' : 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onMouseOver={(e) => { if (!isActive && !isDisabled) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseOut={(e) => { if (!isActive && !isDisabled) e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    {label}
                  </button>
                );
              })}
```

Count subtitle under the switcher gains an outfits case:

```tsx
              {view === 'closet'
                ? `${items.length} ${items.length === 1 ? 'garment' : 'garments'}`
                : view === 'sneakers'
                  ? `${sneakers.length} ${sneakers.length === 1 ? 'pair' : 'pairs'}`
                  : `${outfits.length} ${outfits.length === 1 ? 'look' : 'looks'}`}
```

Header CTA gains the outfits case (the packing trigger from Task 2 is unchanged):

```tsx
          <button
            onClick={() => {
              if (view === 'closet') setIsUploadOpen(true);
              else if (view === 'sneakers') setIsAddSneakerOpen(true);
              else handleStartBuildingOutfit();
            }}
            className="tap-target"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-surface)',
              border: 'none',
              fontSize: '0.68rem',
              fontWeight: 500,
              padding: '12px 26px',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={13} strokeWidth={2} />
            {view === 'closet' ? 'Add Garment' : view === 'sneakers' ? 'Add Sneaker' : 'New Outfit'}
          </button>
```

- [ ] **Step 4: Re-route the main pane in `App.tsx`**

Inside `.closet-pane`, after the switcher block, replace the tray + OutfitBuilder + grids rendering with:

```tsx
          {isBuildingOutfit && (
            <OutfitBuildTray
              selectedItems={selectedOutfitItemIds
                .map(id => allItems.find(item => item.id === id))
                .filter((item): item is ClosetItem => item !== undefined)}
              editingOutfit={outfits.find(outfit => outfit.id === editingOutfitId) ?? null}
              onCancel={handleCancelBuildingOutfit}
              onSave={handleSaveOutfit}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          )}

          {view === 'outfits' ? (
            <OutfitsView
              outfits={outfits}
              items={allItems}
              onStartEditing={handleStartEditingOutfit}
              onDeleteOutfit={handleDeleteOutfit}
              onAddOutfitToPackingList={handleAddOutfitToPackingList}
              onSaveAIOutfit={handleSaveAIOutfit}
              onToggleSeedStylist={handleToggleSeedStylist}
            />
          ) : view === 'closet' ? (
            <ClosetGrid
              items={items}
              onAddToPackingList={handleTogglePackingItem}
              packedItemIds={packedItemIds}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              selectionMode={isBuildingOutfit}
              selectedItemIds={selectedOutfitItemIds}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          ) : (
            <SneakerGrid
              sneakers={sneakers}
              onAddToPackingList={handleTogglePackingItem}
              packedItemIds={packedItemIds}
              onUpdateSneaker={handleUpdateSneaker}
              onDeleteSneaker={handleDeleteSneaker}
              selectionMode={isBuildingOutfit}
              selectedItemIds={selectedOutfitItemIds}
              onToggleSelectItem={handleToggleOutfitItem}
            />
          )}
```

- [ ] **Step 5: Retire `OutfitBuilder.tsx`**

Update `src/components/OutfitBuildTray.tsx` line 4 to:

```tsx
import type { Outfit } from './OutfitsView';
```

Then delete the old component:

```bash
git rm src/components/OutfitBuilder.tsx
```

Confirm nothing else references it: `grep -rn "OutfitBuilder" src/` should only match `OutfitBuildTray` (filename substring is fine; no import of `./OutfitBuilder` may remain).

- [ ] **Step 6: Verify**

Run: `npm run build` — expected: success.
Run: `npm run lint` — expected: no new warnings.

Preview checks:
1. Switcher shows Closet / Sneakers / Outfits; Closet view is grid-first with nothing above it.
2. Outfits view: stylist strip on top, lookbook grid of collage wells below; each cell shows up to 4 garments composed in one well, name + `N ITEMS · DATE` mono meta, ` · AI` tag only on unedited stylist saves.
3. Clicking a look expands a full-width detail under its row (slot-ordered figures, note, actions); clicking again or clicking another look collapses/moves it; only one open at a time.
4. Pack shows "Added to packing list!" feedback and ticks the header count without opening the drawer.
5. New Outfit (header CTA) jumps to Closet with the grey tray; Closet ↔ Sneakers switching works mid-build; the Outfits word is dimmed and inert; Save and Cancel both land back on the Outfits view. Edit pre-fills name and selections.
6. Delete confirm works; deleting from expanded state collapses it.
7. Reload on the Outfits view: app opens on Closet (view is session state, not persisted) with all outfits intact.

- [ ] **Step 7: Commit**

```bash
git add -A src/
git commit -m "feat: outfits become a top-level lookbook view; build flow jumps to closet"
```

---

### Task 5: Full QA pass

No new code — a disciplined pass over the spec's testing checklist, fixing
anything found. Use the preview tooling end to end.

**Files:**
- Modify: only if defects are found.

**Interfaces:** none.

- [ ] **Step 1: Run the spec's manual verification list**

From `docs/superpowers/specs/2026-07-07-outfits-packing-ia-redesign-design.md` §Testing:

1. Three-word switcher renders and routes; closet grid is first on the field and full width; no packing affordance on cells.
2. Outfits view: stylist strip, collage lookbook, expand/collapse, all four look actions work; AI tag and note render.
3. New Outfit / Edit jumps to Closet with tray; Closet↔Sneakers mixing works; Outfits word disabled; Save/Cancel returns to Outfits.
4. Packing drawer: open/close via trigger, scrim, ✕, Escape; header count stays live; pack-from-outfit and pack-from-detail-modal both land items; export copies text; clear-confirm works; progress rule animates; ≤700px shows the full-screen sheet.
5. localStorage round-trip: reload preserves outfits and packed items; view defaults to Closet.

- [ ] **Step 2: Console and error sweep**

With the preview open, walk every flow above and confirm zero console errors/warnings introduced by this work.

- [ ] **Step 3: Fix anything found, re-verify, commit**

```bash
git add -A
git commit -m "fix: QA pass on outfits/packing IA redesign"
```

(Skip the commit if nothing needed fixing.)

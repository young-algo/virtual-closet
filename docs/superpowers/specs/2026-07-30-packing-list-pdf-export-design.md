# Packing List PDF Export

**Date:** 2026-07-30  
**Status:** Design approved; implementation pending

## Goal

Replace the packing drawer's clipboard-only export with an immediate PDF download. The PDF must show every item on the current packing list with its image and name, while preserving the list's trip context and checked state.

## Confirmed decisions

- Clicking the export action downloads a `.pdf` file immediately. It does not open the browser print dialog.
- The PDF includes every item on the packing list, including items already checked as physically packed.
- Each item shows a checked or unchecked marker, its image, and its name.
- Items remain grouped by category.
- PDF creation happens entirely in the browser; packing and closet data are not sent to a server.

## User experience

The existing `Export List` action becomes `Export PDF`.

While the document is being prepared:

- the action reads `Preparing PDF…`;
- the button is disabled to prevent duplicate exports; and
- the rest of the packing drawer remains usable.

After a successful download, the action briefly reads `Downloaded`. If PDF creation fails, an inline error explains that the export could not be created and invites the user to try again.

The filename derives from the trip name:

```text
Vacation Trip -> vacation-trip-packing-list.pdf
```

Filename generation trims whitespace, converts runs of unsupported characters to hyphens, collapses repeated hyphens, and falls back to `packing-list.pdf` when no usable trip name remains.

## PDF layout

The document uses US Letter portrait pages and the app's restrained wardrobe-catalogue visual language.

Each document contains:

1. the trip name as the title;
2. a summary showing the packed count and total item count;
3. category headings in their first-seen order; and
4. a two-column grid of item cards.

Each item card contains:

- a square product thumbnail;
- a checked or unchecked square marker; and
- the item name, wrapped to a bounded number of lines.

Cards never split across pages. When the next category heading and its first card do not fit, both move to the next page. Later pages repeat a quiet trip-name header and show the page number.

If an item image cannot be decoded, the PDF still downloads. That card uses a neutral image placeholder and retains the marker and item name.

## Architecture

### `src/features/packing/packingPdf.ts`

This module owns PDF-specific behavior and exposes one public operation:

```ts
exportPackingListPdf({
  tripName,
  items,
  physicallyPackedIds
}): Promise<void>
```

Its internal units have narrow responsibilities:

- group items by category without changing their input order;
- create a safe filename;
- load and normalize browser images to JPEG data URLs;
- calculate card and page placement; and
- render and save the `jsPDF` document.

All source images pass through an off-screen canvas before insertion. This gives bundled JPEG/PNG/WebP images and user-uploaded `data:` images one consistent representation. Canvas sizing bounds PDF file size while retaining enough detail for the printed card.

### `src/components/PackingList.tsx`

`PackingList` continues to own the trip name and checked-item state. Its export handler calls `exportPackingListPdf` with the current values and manages the preparing, success, and error feedback shown in the drawer.

No packing-list persistence shape changes. `App.tsx`, `PackingDrawer.tsx`, closet items, sneakers, outfits, and backup files keep their current contracts.

### Dependency

Add `jsPDF` as the client-side PDF writer. Page composition uses its text, shape, image, and save APIs directly. The implementation does not render the drawer to a screenshot, so names remain selectable text and pagination does not depend on the drawer's viewport.

## Data flow

1. The user selects `Export PDF`.
2. `PackingList` snapshots the current trip name, item array, and checked IDs.
3. The PDF module groups the snapshot and attempts to normalize each item image.
4. The renderer lays out category headings and cards, adding pages as needed.
5. `jsPDF.save` starts the browser download with the sanitized filename.
6. `PackingList` reports success or failure without changing packing state.

## Failure handling

- One failed image produces a placeholder card; it does not fail the document.
- A failure to initialize, render, or save the PDF rejects the export operation and produces inline error feedback.
- A second click while generation is active is ignored by the disabled control.
- Component unmounting must not leave a pending feedback timer that later updates state.

## Accessibility

- The export action keeps an explicit text label at rest and during progress.
- Disabled state is conveyed with the native `disabled` attribute.
- Failure feedback uses an accessible status region.
- Checked state is communicated in the PDF by both shape and mark, not color alone.

## Testing

Automated tests cover:

- trip-name filename sanitization and the empty-name fallback;
- stable category grouping;
- checked-item lookup;
- card placement across page boundaries;
- category headings moving with their first card;
- image-load failure using a placeholder without aborting the export; and
- export-state transitions in `PackingList`.

Verification also includes:

- the full unit-test suite;
- lint and production build;
- live browser export from the packing drawer;
- confirmation that a `.pdf` download is created with the expected filename; and
- rendered inspection of the downloaded PDF for images, names, checked markers, category grouping, and multi-page layout.

## Out of scope

- Editing the packing list from inside the PDF
- Sharing or uploading PDFs
- Server-side PDF generation
- Persisting trip names or physically packed state differently
- User-selectable paper sizes or layout themes

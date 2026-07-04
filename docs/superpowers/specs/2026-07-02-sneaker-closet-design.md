# Sneaker Closet — Design Spec

**Date:** 2026-07-02
**Status:** Implemented

## Goal

A second "virtual closet" for sneakers, separate from garments, using user-provided
hi-fidelity product images (no AI background-removal pipeline). Sneakers participate
in outfits and the packing list. Metadata (name, colorway, brand) is maintained by
the user in-app.

## Data model

- `SneakerItem extends ClosetItem` with `styleCode: string` and `imageTop?: string`
  ([SneakerGrid.tsx](../../../src/components/SneakerGrid.tsx)). Conforming to
  `ClosetItem` means `OutfitBuilder` and `PackingList` work unchanged.
- Base manifest: [src/data/sneakers.json](../../../src/data/sneakers.json), generated
  from the image filenames (`<styleCode>_A.png` = lateral view, `<styleCode>_D.png` =
  top view). Images live in `public/sneakers/`. IDs are `sneaker_<styleCode>`.
- Seed metadata is a placeholder: name = style code, brand = "Nike", colorway empty.
  The user edits these via the details dialog; edits persist to localStorage.
- Separate storage keys (`sneaker_items`, `sneaker_deleted_ids`) with the same
  merge/tombstone semantics as the garment closet, so the two closets never
  interfere. New manifest entries merge in on launch; deletions are tombstoned.

## UX

- **Closet switcher:** the display heading is two words, "Closet / Sneakers", in the
  3rem Archivo display voice — active word in ink, inactive muted. Typographic
  navigation, per the Continuous Field rule (no tabs or boxes). Count caption reads
  "N garments" / "N pairs".
- **Sneaker cells:** brand + style code in the mono garment-tag voice, name in body,
  colorway (once entered) in muted mono. Hover cross-fades the well from lateral to
  top-down view and scales 1.04. Single-view pairs just scale.
- **Details dialog:** mirrors the garment dialog, with a quiet Side/Top mono tab
  toggle under the photo. Editable: name, brand, colorway, style code, description.
  Validation requires name + brand. In edit mode, quiet underlined actions under the
  photo replace the side view, add/replace the top view, or remove the top view;
  replacements are resized to 500×500 white-backed JPEG data URLs
  (`src/utils/image.ts`) and persist to localStorage.
- **Filters:** search (name, style code, brand, colorway, description) + brand
  select. The colorway select appears only after at least one colorway is entered.
- **Outfits:** the build panel stays visible in both views; selection state lives in
  App, so you can mix garments and sneakers by switching views mid-build. Outfit
  cards and the packing list resolve IDs against both closets.
- **Adding pairs (no AI pipeline):** the header CTA follows the active closet —
  "Add Garment" (AI pipeline) on Closet, "Add Sneaker" on Sneakers. `AddSneakerModal`
  takes a required side-view photo, an optional top-view photo, and manual metadata;
  images are stored as data URLs under `user_sneaker_<timestamp>` IDs, which the
  manifest merge preserves across launches. Bulk seeding can still go through
  `public/sneakers/` + `sneakers.json`.

## Implementation notes

- `.sneaker-well` owns its image CSS rather than reusing `.product-image-container`,
  whose `transition: transform !important` would suppress the opacity cross-fade.
- The top-view image is stacked absolutely and toggled with CSS `:hover` only — no
  per-cell React state.
- 35 pairs seeded; `DJ0950-119` has only a lateral view and degrades gracefully.

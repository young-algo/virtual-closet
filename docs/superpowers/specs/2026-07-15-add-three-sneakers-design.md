# Add Three Sneakers to the Portable Catalog

## Goal

Add the three supplied Nike sneaker pairs to the versioned sneaker catalog so they appear for both existing browser profiles and fresh clones. Preserve both supplied product views for each pair and provide complete metadata for search, filtering, outfit planning, and daily-outfit scoring.

## Catalog Entries

### Nike C1TY "Surplus"

- Style code: `FZ3863-300`
- Catalog ID: `sneaker_FZ3863-300`
- Brand: `Nike`
- Colorway: `light army, cargo khaki, university gold, black`
- Side image: `/sneakers/FZ3863-300_A.png`
- Top image: `/sneakers/FZ3863-300_D.png`
- Profile intent: regular low-top, neutral green base, black and gold accents, breathable mesh with moderate warmth and poor rain safety

### Air Jordan 4 Retro "Bred"

- Style code: `308497-060`
- Catalog ID: `sneaker_308497-060`
- Brand: `Nike`
- Colorway: `black, fire red, cement grey, summit white`
- Side image: `/sneakers/308497-060_A.png`
- Top image: `/sneakers/308497-060_D.png`
- Profile intent: chunky mid-top, black base, red/grey/white accents, moderate warmth and poor rain safety

### Nike Air Max Plus "Hyper Blue"

- Style code: `DX0755-001`
- Catalog ID: `sneaker_DX0755-001`
- Brand: `Nike`
- Colorway: `black, chamois, sky blue, hyper blue, midnight navy, white`
- Side image: `/sneakers/DX0755-001_A.png`
- Top image: `/sneakers/DX0755-001_D.png`
- Profile intent: regular low-top retro runner, blue base, black/yellow/white accents, high breathability, moderate warmth, and poor rain safety

## Data and Asset Flow

Copy each supplied `PHSLH000` side view to its `_A.png` catalog path and each supplied `PHCTH001` top view to its `_D.png` catalog path under `public/sneakers/`. Append three complete records to `src/data/sneakers.json`, following the existing `SneakerItem` and `dailyProfile` shapes.

`src/App.tsx` already merges new manifest IDs into existing `sneaker_items` local storage unless a matching ID is tombstoned. No application-code change is needed. The additions therefore become portable defaults and also appear in existing browser profiles on their next load.

## Scope and Error Handling

Do not modify application behavior, existing sneaker records, outfits, deletion tombstones, or unrelated worktree changes. Use stable style-code-based IDs and paths so duplicate detection is deterministic. Before editing, verify that none of the three IDs, style codes, or destination paths already exists. Treat a duplicate, unreadable source image, invalid JSON record, missing destination asset, or incorrect final count as a failed integration.

## Verification

This is a catalog-data change, so no permanent behavior test is required. Verification will cover:

1. All six source images are readable PNGs and their copied destination files match byte-for-byte.
2. `src/data/sneakers.json` parses and contains 44 unique IDs and 44 unique style codes.
3. Each new entry has the expected required fields, daily profile, and two existing image paths.
4. The full test suite, lint, and production build pass.
5. Browser QA on a clean origin shows 44 sneaker pairs and renders both views for all three new entries.

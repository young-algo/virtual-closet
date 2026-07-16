# Product Image Background Normalization Design

## Goal

Remove visible rectangular image backdrops everywhere product imagery appears while preserving the exact garment, its natural edge softness and shadow, existing image URLs, and the closet's `#f6f6f6` image wells.

## Scope

The change covers every checked-in garment image under `public/closet/`, including images not shown in the reported examples. It also covers the image-processing path for newly uploaded garments and every UI surface that renders the same image URLs: closet cards, item details, outfit cards and details, the outfit build tray, and AI stylist previews.

Transparent sneaker assets are audited but left unchanged. The daily-outfit atlas and preview consume the same normalized source images and do not need a separate visual treatment.

## Chosen Approach

Use a deterministic, non-generative background normalizer. For each opaque garment image, it will:

1. Sample background color from the image perimeter.
2. Identify bright, low-chroma pixels connected to that perimeter as background.
3. Preserve tonal differences inside the connected region by shifting pixels relative to the sampled background instead of replacing them.
4. Pin the image perimeter to the exact `#f6f6f6` well color.
5. Preserve the original dimensions, JPEG filename, and manifest URL.

Keeping filenames stable means existing manifests and browser-stored outfits continue to resolve the same images. Product images render without blend modes after normalization; this preserves white garments as lighter than the well instead of multiplying them into it.

The batch operation will process the full library, but files whose perimeter already matches the image well should remain visually unchanged.

## Rejected Alternatives

- **AI-generated background removal:** risks changing logos, seams, proportions, colors, and other product-defining details.
- **Global CSS brightness or contrast:** can hide some rectangles but washes out pale garments and still fails on uneven or tinted backgrounds.
- **Runtime canvas processing:** fixes symptoms only after load, adds rendering and caching complexity, and leaves source assets inconsistent for exports and email imagery.

## Implementation Boundaries

Background analysis and pixel transformation will live in a focused reusable normalizer rather than inside React components. A batch entry point will apply it to checked-in assets. The upload pipeline will call the equivalent normalization behavior before encoding future well-matched JPEGs.

React rendering components should not need item-specific exceptions or filename lists. Product-image multiply blending is removed because it destroys contrast in genuinely white garments after their canvases are normalized.

## Safety and Failure Handling

The normalizer must never classify transparent pixels as dark RGB background; alpha-aware sneaker assets are excluded from destructive processing. It must fail rather than overwrite an image when decoding or encoding fails. Batch output must be deterministic so rerunning it creates no additional changes.

The operation will be limited to tracked product assets and will preserve unrelated working-tree changes.

## Testing and Verification

Automated coverage will establish the intended behavior before production code:

- Off-white, edge-connected perimeters normalize to `#f6f6f6`.
- Dark garment pixels and interior light details remain unchanged.
- Background-like pixels enclosed inside a garment are not erased.
- Connected pale fabric retains its tonal difference from the well.
- Already-white backgrounds normalize to the well color without flattening dark garment details.
- Transparent images retain alpha and are not flattened.
- The complete checked-in garment library passes a perimeter audit after normalization.
- A second normalization pass is idempotent.

Verification will include the focused tests, full test suite, lint, production build, an asset-diff audit, and browser screenshots of the regular closet and outfit views at desktop and narrow widths. The reported orange pants, yellow chore jacket, pink hoodie, beige shirts, black pants, aqua shorts, and other previously identified examples must have no visible image-canvas rectangle.

## Success Criteria

- No checked-in garment image produces a visible rectangular canvas against the image well.
- Garment identity, color, logos, silhouette, and shadows remain visually faithful.
- All current image URLs continue to work without data migration.
- Future uploaded garment images follow the same white-background contract.
- Automated checks prevent regressions across the entire asset library.

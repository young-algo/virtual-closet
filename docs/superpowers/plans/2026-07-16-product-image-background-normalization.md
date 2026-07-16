# Product Image Background Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize every opaque garment image perimeter to the closet's `#f6f6f6` well so no image canvas appears as a rectangle, and enforce the same contract for future uploads.

**Architecture:** A deterministic perimeter flood-fill normalizer processes raw RGBA pixels without generative editing. It shifts eligible connected pixels relative to the sampled backdrop, preserving pale-fabric contrast, while pinning the perimeter to `#f6f6f6`; product images then render without multiply blending. A Python/Pillow batch implementation transforms and audits checked-in JPEG assets in place while a browser TypeScript implementation applies the same rules to future uploads.

**Tech Stack:** Python 3.12, Pillow, TypeScript, Vitest, React 19, Canvas 2D, Vite.

## Global Constraints

- Preserve every existing image filename, URL, width, and height.
- Preserve garment identity, color, logos, silhouette, and natural shadow.
- Normalize only bright, low-chroma pixels connected to the image perimeter, preserving their tonal differences.
- Render normalized product images without multiply blending.
- Do not alter transparent sneaker assets.
- Do not add filename-specific exceptions.
- Preserve unrelated working-tree changes in `package.json`, `.pnpm-store/`, and existing daily-outfit documents.

---

### Task 1: Build the deterministic batch normalizer with tests

**Files:**
- Create: `scripts/normalize_closet_backgrounds.py`
- Create: `scripts/tests/test_normalize_closet_backgrounds.py`

**Interfaces:**
- Produces: `normalize_rgba(image: PIL.Image.Image) -> tuple[PIL.Image.Image, NormalizationStats]`
- Produces: `inspect_background(image: PIL.Image.Image) -> BackgroundInspection`
- Produces: CLI `python3 scripts/normalize_closet_backgrounds.py [--check] [--root PATH]`
- `NormalizationStats` reports `changed_pixels`, `background_rgb`, and `skipped_reason`.
- `BackgroundInspection` reports whether an opaque image satisfies the `#f6f6f6` perimeter contract.

- [x] **Step 1: Write failing synthetic-image tests**

Create tests that build tiny RGBA images in memory and assert:

```python
def test_normalizes_only_off_white_pixels_connected_to_perimeter():
    image = off_white_canvas_with_dark_center_and_enclosed_off_white_detail()
    normalized, stats = normalize_rgba(image)
    assert normalized.getpixel((0, 0)) == (246, 246, 246, 255)
    assert normalized.getpixel((4, 4)) == (20, 30, 40, 255)
    assert normalized.getpixel((5, 5)) == (243, 243, 243, 255)
    assert stats.changed_pixels > 0

def test_is_idempotent():
    once, _ = normalize_rgba(off_white_fixture())
    twice, second_stats = normalize_rgba(once)
    assert list(once.getdata()) == list(twice.getdata())
    assert second_stats.changed_pixels == 0

def test_skips_images_with_transparency():
    image = transparent_fixture()
    normalized, stats = normalize_rgba(image)
    assert list(normalized.getdata()) == list(image.getdata())
    assert stats.skipped_reason == "contains transparency"
```

Include cases for an already-white background, a neutral gradient, a pale garment separated from the perimeter by an outline, and an ineligible dark background.

- [x] **Step 2: Run the focused test and verify RED**

Run: `python3 -m unittest scripts.tests.test_normalize_closet_backgrounds -v`

Expected: FAIL because `scripts.normalize_closet_backgrounds` does not exist.

- [x] **Step 3: Implement the minimal Python normalizer**

Implement these rules:

```python
MIN_BACKGROUND_LUMA = 205.0
MAX_BACKGROUND_CHROMA = 32
MIN_COLOR_TOLERANCE = 14.0
MAX_COLOR_TOLERANCE = 38.0
TARGET_BACKGROUND_RGB = (246, 246, 246)
CONTRACT_COLOR_TOLERANCE = 2.0
```

Sample the outer two-percent perimeter band, use per-channel medians for the reference background, derive a robust tolerance from median absolute color distance, and flood-fill eligible pixels from all four edges. A pixel is eligible only when its RGB distance from the perimeter reference is within tolerance, its luma is at least `MIN_BACKGROUND_LUMA`, and its chroma is at most `MAX_BACKGROUND_CHROMA`. Pin eligible perimeter pixels to `(246, 246, 246, 255)`; shift other eligible connected pixels by the same per-channel offset between the sampled backdrop and `#f6f6f6`, preserving their tonal differences. Leave every ineligible pixel byte-for-byte unchanged.

The CLI must enumerate `.jpg`, `.jpeg`, `.png`, and `.webp` files, skip alpha-bearing images, preserve dimensions, save JPEGs atomically through a sibling temporary file, and print one summary line per changed or failing file. `--check` must exit `1` with failing filenames and must never write.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `python3 -m unittest scripts.tests.test_normalize_closet_backgrounds -v`

Expected: all normalizer unit tests PASS.

- [x] **Step 5: Commit the batch normalizer**

```bash
git add scripts/normalize_closet_backgrounds.py scripts/tests/test_normalize_closet_backgrounds.py
git commit -m "test: add deterministic closet image normalizer"
```

---

### Task 2: Apply the same background contract to future browser uploads

**Files:**
- Create: `src/utils/backgroundNormalization.ts`
- Create: `src/utils/__tests__/backgroundNormalization.test.ts`
- Modify: `src/utils/image.ts`
- Modify: `src/components/UploadModal.tsx`

**Interfaces:**
- Produces: `normalizeProductImagePixels(pixels: Uint8ClampedArray, width: number, height: number): PixelNormalizationResult`
- `PixelNormalizationResult` contains `pixels`, `changedPixels`, `backgroundRgb`, and `skippedReason`.
- `resizeImageToDataUrl(blob: Blob, maxDim?: number): Promise<string>` remains source-compatible and returns a normalized well-matched JPEG.

- [x] **Step 1: Write failing Vitest coverage for the browser pixel core**

Use the same synthetic fixtures and assertions as the Python tests:

```typescript
it('harmonizes off-white pixels connected to the perimeter without crossing the garment', () => {
  const input = offWhiteCanvasWithDarkCenterAndEnclosedDetail();
  const result = normalizeProductImagePixels(input, 10, 10);
  expect(pixelAt(result.pixels, 10, 0, 0)).toEqual([246, 246, 246, 255]);
  expect(pixelAt(result.pixels, 10, 4, 4)).toEqual([20, 30, 40, 255]);
  expect(pixelAt(result.pixels, 10, 5, 5)).toEqual([243, 243, 243, 255]);
});

it('is idempotent', () => {
  const once = normalizeProductImagePixels(offWhiteFixture(), 10, 10);
  const twice = normalizeProductImagePixels(once.pixels, 10, 10);
  expect(twice.pixels).toEqual(once.pixels);
  expect(twice.changedPixels).toBe(0);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/utils/__tests__/backgroundNormalization.test.ts`

Expected: FAIL because `backgroundNormalization.ts` does not exist.

- [x] **Step 3: Implement the TypeScript pixel core**

Port the Python constants, perimeter median, robust tolerance, alpha guard, and edge flood-fill exactly. Copy the input buffer before modifying it. Validate `pixels.length === width * height * 4` and throw a descriptive error for invalid dimensions.

- [x] **Step 4: Run the focused pixel test and verify GREEN**

Run: `npm test -- src/utils/__tests__/backgroundNormalization.test.ts`

Expected: all pixel-normalizer tests PASS.

- [x] **Step 5: Integrate normalization with every garment upload path**

In `resizeImageToDataUrl`, call the pure pixel normalizer after drawing the image to the white canvas and before JPEG encoding:

```typescript
const imageData = ctx.getImageData(0, 0, maxDim, maxDim);
const normalized = normalizeProductImagePixels(imageData.data, maxDim, maxDim);
imageData.data.set(normalized.pixels);
ctx.putImageData(imageData, 0, 0);
```

Replace `UploadModal`'s duplicate resizer with `resizeImageToDataUrl`. After Gemini returns a generated data URL, convert it to a blob and pass it through the same resizer so generated, background-removed, and fallback originals all satisfy the same contract.

- [x] **Step 6: Run focused and full TypeScript tests**

Run: `npm test -- src/utils/__tests__/backgroundNormalization.test.ts`

Run: `npm test`

Expected: both commands PASS.

- [x] **Step 7: Commit future-upload enforcement**

```bash
git add src/utils/backgroundNormalization.ts src/utils/__tests__/backgroundNormalization.test.ts src/utils/image.ts src/components/UploadModal.tsx
git commit -m "fix: normalize garment upload backgrounds"
```

---

### Task 3: Normalize and audit the complete checked-in garment library

**Files:**
- Modify: qualifying images under `public/closet/`
- Do not modify: images under `public/sneakers/`

**Interfaces:**
- Consumes: `scripts/normalize_closet_backgrounds.py`
- Produces: every opaque asset under `public/closet/` meeting the `#f6f6f6` perimeter contract.

- [x] **Step 1: Run the asset audit and verify RED**

Run: `python3 scripts/normalize_closet_backgrounds.py --check --root public/closet`

Expected: exit `1` listing the off-white assets, including the reported orange cargo pants, yellow chore jacket, and pink Jordan hoodie.

- [x] **Step 2: Save a diagnostic pre-normalization contact sheet outside the repo**

Render all failing assets with filenames into `/tmp/virtual-closet-backgrounds-before.png`. This artifact is diagnostic only and must not be committed.

- [x] **Step 3: Normalize all eligible checked-in garment assets**

Run: `python3 scripts/normalize_closet_backgrounds.py --root public/closet`

Expected: changed-file summaries for every failing opaque asset; transparent or already-compliant assets report skipped/unchanged.

- [x] **Step 4: Run the asset audit and verify GREEN**

Run: `python3 scripts/normalize_closet_backgrounds.py --check --root public/closet`

Expected: exit `0` with zero failing assets.

- [x] **Step 5: Verify idempotence on the real library**

Record `git diff --stat -- public/closet`, rerun normalization, then confirm `git diff --stat -- public/closet` is identical.

- [x] **Step 6: Render and visually inspect a post-normalization contact sheet**

Render `/tmp/virtual-closet-backgrounds-after.png` with the same order and labels. Compare it with the pre-normalization sheet, checking garment outlines, pale fabrics, logos, hems, and shadows before accepting the batch.

- [x] **Step 7: Commit only normalized garment assets**

```bash
git add public/closet
git commit -m "fix: harmonize closet product image backgrounds"
```

---

### Task 4: Verify every affected application surface in a real browser

**Files:**
- No production files expected.

**Interfaces:**
- Consumes: normalized product assets and existing React renderers.
- Produces: visual evidence that the same assets blend in single-item and multi-item layouts.

- [x] **Step 1: Start the local Vite server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite reports a reachable localhost URL.

- [x] **Step 2: Verify regular closet cards and detail views**

At desktop width, inspect every closet page/category, not just the initial viewport. Specifically verify the orange cargo pants, yellow chore jacket, pink hoodie, beige shirts, black pants, and aqua shorts. Open representative pale and dark garments in the detail modal.

- [x] **Step 3: Verify outfit and supporting views**

Inspect outfit cards, expanded outfit details, the outfit build tray, and AI stylist item previews. Confirm no item-sized rectangles appear inside the shared grey well.

- [x] **Step 4: Verify narrow layout**

Repeat closet-card and outfit-card checks at a narrow mobile viewport. Confirm responsive sizing does not expose image edges.

- [x] **Step 5: Capture verification screenshots**

Save desktop closet, desktop outfits, and narrow closet screenshots under `/tmp/virtual-closet-background-verification/`. Do not commit screenshots unless explicitly requested.

---

### Task 5: Run final regression and repository-scope checks

**Files:**
- Modify if required: `docs/superpowers/plans/2026-07-16-product-image-background-normalization.md` checkbox statuses only.

**Interfaces:**
- Produces: final evidence that assets, application code, and repository scope satisfy the approved design.

- [x] **Step 1: Run all automated verification**

Run:

```bash
python3 -m unittest scripts.tests.test_normalize_closet_backgrounds -v
python3 scripts/normalize_closet_backgrounds.py --check --root public/closet
npm test
npm run lint
npm run build
```

Expected: every command exits `0`; the asset audit reports zero failures.

- [x] **Step 2: Review the final diff and commit scope**

Run: `git status --short`

Run: `git diff --check HEAD~3..HEAD`

Run: `git diff --stat HEAD~3..HEAD`

Confirm commits contain only the new normalizers/tests, upload integration, normalized `public/closet` assets, and this plan. Confirm the pre-existing `package.json`, `.pnpm-store/`, and unrelated documents remain unstaged and uncommitted.

- [x] **Step 3: Record completion evidence**

Update this plan's checkboxes, note the number of normalized assets, and summarize the browser surfaces and viewports checked. Commit the plan update separately only if it is already tracked in an implementation commit.

## Completion Evidence

- The initial library audit found 68 of 76 garment assets whose perimeter did not match `#f6f6f6`; all 68 were normalized in place with filenames and dimensions preserved.
- The post-normalization audit passed all 76 assets. A second full normalization pass changed zero files and SHA-256 hashes remained identical.
- Synthetic coverage includes off-white and white backgrounds, gradients, transparency, dark backgrounds, enclosed light details, connected pale fabric, invalid buffers, real-file idempotence, and shoe-only blend behavior.
- Browser QA covered the regular closet grid, reported orange/yellow/pink examples, a garment detail modal, every outfit-card row, expanded outfit details, mixed garment/shoe build-tray thumbnails, sneaker grids, and narrow closet/outfit layouts.
- Browser console verification returned no warnings or errors. Diagnostic screenshots are stored under `/tmp/virtual-closet-background-verification/` and were not committed.

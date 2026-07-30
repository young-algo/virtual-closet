# Packing-list PDF final fix report

Date: 2026-07-30

## Result

All six final-review findings are addressed in one focused fix wave:

1. The PDF implementation and jsPDF are loaded only after the user starts an export, and a Vite build assertion recursively rejects PDF modules reachable through an entry chunk's static imports.
2. Image normalization uses at most three workers, preserves input order and per-image `null` fallbacks, and releases browser `Image` handlers and sources on every settle path.
3. Printable ASCII remains native/selectable PDF text; labels containing non-ASCII characters use a bounded, local browser-canvas fallback.
4. Trip titles are single-line bounded with grapheme-safe ellipsis, and filename slugs are capped at 80 characters before the suffix.
5. A successful export remains visible while clear confirmation is open or the packing list becomes empty.
6. The already-scheduled two-second success-reset timer is directly proved to be cleared on unmount.

## Files changed

- `src/components/PackingList.tsx`
- `src/components/__tests__/PackingList.test.tsx`
- `src/features/packing/packingPdf.ts`
- `src/features/packing/packingPdfText.ts` (new)
- `src/features/packing/packingPdfLayout.ts`
- `src/features/packing/__tests__/packingPdf.test.ts`
- `src/features/packing/__tests__/packingPdfLayout.test.ts`
- `vite.config.ts`
- `.superpowers/sdd/final-fix-report.md` (this report)

No dependency, lockfile, public asset, or bundled font changes were made.

## TDD evidence

### Lazy engine and export lifecycle

- RED: after adding the entry-closure assertion while the component still used a static import, `npm run build` failed and named both `node_modules/jspdf/dist/jspdf.es.min.js` and `src/features/packing/packingPdf.ts` as entry-reachable PDF code.
- GREEN: `PackingList` now sets `Preparing PDF…`, snapshots its input, and acquires the duplicate-click lock before `import('../features/packing/packingPdf')`. The production build passes the recursive entry-closure assertion.
- RED: the deferred-module test unmounted during module loading and observed the exporter called once.
- GREEN: the same test observes `Preparing PDF…`, a disabled export control, and zero exporter calls after unmount.
- RED: the deferred-export/clear-confirmation regression could not find the successful `Downloaded` state.
- GREEN: a detached live-region status preserves the success state while confirmation or empty-list content replaces the normal footer.
- Mutation proof for timer cleanup: removing the effect's `clearTimeout` made the direct test fail with `expected clearTimeout to be called once, received 0`; restoring cleanup made it pass.

### Image worker pool and cleanup

- RED: the blocked-normalizer test observed seven simultaneous starts instead of the required maximum of three.
- GREEN: releasing completions out of order (`2, 0, 1, 5, 3, 4, 6`) never exceeded three active normalizers, processed every item, and returned the `Map` in original input order.
- RED: success and failure cleanup assertions found live `onload`/`onerror` functions on settled `Image` objects.
- GREEN: both settle paths now leave handlers `null` and `src` empty. Synchronous `src` assignment exceptions are cleaned up too.
- The canvas-encoding exception regression also directly asserts handler/source release after rejection.
- Existing canvas exception/fallback regressions remain green.

### Unicode, title, and filename bounds

- RED: representative `Café 東京 🧳`, `VÊTEMENTS 日本`, and `Crème brûlée T-shirt 👕` strings never reached a Unicode-capable render path.
- GREEN: the canvas stub receives those exact visible strings; bounded `addImage` assertions cover the title, category, and four-line item label placements. A `fetch` spy remains unused.
- GREEN: `Blue Shirt` continues through native `doc.text`.
- RED: an intentionally long trip title was emitted in full on first and continuation pages, and a 200-character filename slug was unbounded.
- GREEN: both page-title variants end in an ellipsis within the 528-point content width; the slug is exactly 80 characters before `-packing-list.pdf`.

## Final automated verification

All commands were rerun from the final source state:

| Check | Result |
| --- | --- |
| Focused Vitest command from brief | 3 files, 23 tests passed |
| `npm test` | 22 files, 727 tests passed |
| `npm run lint` | passed (`oxlint`, exit 0) |
| `npm run build` | passed (`tsc -b` and Vite, 2,008 modules transformed) |
| `git diff --check` | passed |

The full suite prints expected negative-path diagnostics such as unauthorized/tampered-link errors; there were no test failures.

## Bundle and chunk evidence

Exact byte counts were measured from the generated files with Node `fs` and `zlib.gzipSync`:

| Build artifact | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Before: `dist/assets/index-AvfjPj0c.js` | 903,706 | 263,604 |
| After: `dist/assets/index-BV5pgwcW.js` | 501,313 | 134,189 |
| After lazy PDF: `dist/assets/packingPdf-CzjbLxMO.js` | 404,884 | 130,038 |

The main chunk is 402,393 raw bytes and 129,415 gzip bytes smaller than the baseline. Inspection finds only dynamic references to `packingPdf-CzjbLxMO.js` in the main chunk; `jsPDF`/`AcroForm` signatures occur in the lazy PDF chunk, not the main chunk. The build plugin walks every entry chunk's complete static-import closure and fails if either jsPDF or the PDF exporter becomes statically reachable.

Vite still emits its generic greater-than-500-kB warning because the non-PDF main chunk is 501.31 kB raw. This is outside the scoped PDF regression; the approximately 404-kB PDF engine is no longer part of it.

## Unicode strategy and limits

The export uses a deliberately local hybrid:

- Strings containing only printable ASCII (`U+0020` through `U+007E`) use jsPDF Helvetica and remain selectable/searchable.
- A label containing any other code point is rendered in full to a transparent PNG through browser Canvas at a fixed 2x scale, using a system/emoji font stack, then inserted at a bounded PDF location.
- Wrapping and ellipsis operate on grapheme segments when `Intl.Segmenter` is available, with `Array.from` as the fallback. Titles and categories are one line; item labels are capped at four lines.
- Each transient canvas has its backing width and height reset after encoding.
- No runtime request, new dependency, or font asset is used.

Consequently, non-ASCII labels are visually correct when the exporting browser has glyph coverage, but those bitmap labels are not selectable/searchable. Glyph appearance can vary by operating-system fonts, missing system glyphs remain outside the guarantee, and specialized right-to-left shaping has not been separately certified.

## Live browser and rendered-PDF inspection

The final implementation was exercised in an isolated Playwright browser against the real Vite app at `http://127.0.0.1:5174/`:

- Seeded 14 packing items so the export spanned two pages, including valid item images.
- Used trip `Café 東京 🧳`, category `Vêtements 日本`, item `Crème brûlée T-shirt 👕`, and ASCII item `Blue Shirt`.
- Marked one item physically packed and observed `1 / 14 packed`.
- Observed the real control sequence `Export PDF` -> `Preparing PDF…` (disabled) -> `Downloaded` -> `Export PDF`.
- Downloaded `/private/tmp/packing-list-pdf-final-RVO36E/cafe-packing-list.pdf`.
- PDF size: 263,236 bytes.
- SHA-256: `ee295ff629635b711080186565faf63a56809a033d8892efa7bf0e230fa5f43b`.
- `pdfinfo`: jsPDF 4.2.1, two US Letter pages, PDF 1.3, unencrypted, no JavaScript.
- Rendered every page at 150 DPI:
  - `/private/tmp/packing-list-pdf-final-RVO36E/rendered/page-1.png`
  - `/private/tmp/packing-list-pdf-final-RVO36E/rendered/page-2.png`
- Visual inspection of both pages confirmed the Unicode title/category/item, images, checked state, continuation header, summaries, and page counters with no clipping, overlap, or missing content.
- `pdftotext` extracted `Blue Shirt` and the other ASCII labels, confirming the native/selectable path; rasterized Unicode was absent as designed.
- Browser console: zero errors and zero warnings.

The normal `npx` wrapper attempted registry access and hit an environment DNS error, so the already-cached local Playwright CLI was used. This did not block or weaken the browser exercise. Poppler emitted local Fontconfig cache/config warnings while rendering, but returned success and produced both valid page images. The browser and Vite listener were shut down after inspection.

## Self-review and concerns

- The dynamic import is guarded on both sides of the module await: inputs are snapshotted before loading, and unmount prevents generation from starting after loading. Existing mounted checks still guard state updates and timer scheduling after export.
- The worker pool has a fixed small bound and writes into pre-sized slots before constructing the ordered `Map`, avoiding completion-order coupling.
- The build assertion follows static imports recursively and intentionally ignores dynamic imports.
- All user-controlled visible PDF labels route through the bounded text adapter; layout constants remain the source of page/card bounds.
- An independent read-only review found no critical correctness defect. Its two requested follow-ups—the final evidence report and a direct canvas-exception cleanup assertion—were completed before commit.
- No critical or important issue remains in the final self-review.

Known, accepted limitations are the bitmap/searchability and host-font variability of non-ASCII labels, the unverified specialized RTL case, and the unrelated main-chunk size warning noted above.

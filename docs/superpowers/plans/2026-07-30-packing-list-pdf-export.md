# Packing List PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the packing drawer's clipboard export with a one-click PDF download that shows every packed-list item with its image, name, category, and checked state.

**Architecture:** Keep deterministic filename, grouping, and pagination logic in a pure layout module. A browser-facing exporter normalizes images, renders the layout with `jsPDF`, and starts the download. `PackingList` owns only export status and passes a snapshot of its current state to the exporter.

**Tech Stack:** React 19, TypeScript 6, Vitest 3, `jsPDF`, browser Canvas API, `jsdom` for component interaction tests

## Global Constraints

- The export must download a `.pdf` immediately; it must not open a print dialog.
- Every item in the current packing list must appear, including checked items.
- Each item must show a checked or unchecked marker, image or neutral placeholder, and name.
- Items must retain first-seen category and item order.
- PDF creation must remain client-side.
- The document must use US Letter portrait pages and a two-column card grid.
- Cards must not split across pages.
- A category heading must move with its first item when they do not fit together.
- One failed image must not abort the document.
- Existing packing-list persistence and backup shapes must not change.

---

## File map

- Create `src/features/packing/packingPdfLayout.ts`: pure filename, grouping, and page-layout decisions.
- Create `src/features/packing/packingPdf.ts`: image normalization, PDF drawing, and download.
- Create `src/features/packing/__tests__/packingPdfLayout.test.ts`: pure layout regression tests.
- Create `src/features/packing/__tests__/packingPdf.test.ts`: per-image failure and exporter contract tests.
- Create `src/components/__tests__/PackingList.test.tsx`: interactive export-state tests.
- Modify `src/components/PackingList.tsx`: replace clipboard export with PDF export status and feedback.
- Modify `package.json` and `package-lock.json`: add `jspdf` and the `jsdom` test environment.

### Task 1: Deterministic document planning

**Files:**
- Create: `src/features/packing/packingPdfLayout.ts`
- Create: `src/features/packing/__tests__/packingPdfLayout.test.ts`

**Interfaces:**
- Consumes: `Pick<ClosetItem, 'id' | 'name' | 'category' | 'image'>[]`
- Produces:
  - `packingPdfFilename(tripName: string): string`
  - `groupPackingItems(items: PackingPdfItem[]): PackingPdfGroup[]`
  - `packingItemIsChecked(itemId: string, checkedIds: ReadonlySet<string>): boolean`
  - `planPackingPdfPages(groups: PackingPdfGroup[]): PackingPdfPage[]`

- [ ] **Step 1: Write failing filename and grouping tests**

Create `src/features/packing/__tests__/packingPdfLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  groupPackingItems,
  packingItemIsChecked,
  packingPdfFilename,
  type PackingPdfItem,
} from '../packingPdfLayout';

const item = (
  id: string,
  name: string,
  category: string,
): PackingPdfItem => ({
  id,
  name,
  category,
  image: `/${id}.jpg`,
});

describe('packingPdfFilename', () => {
  it('creates a safe trip-based PDF filename', () => {
    expect(packingPdfFilename('  New York / Fall 2026!  '))
      .toBe('new-york-fall-2026-packing-list.pdf');
  });

  it('falls back when the trip name has no usable characters', () => {
    expect(packingPdfFilename(' / ! ')).toBe('packing-list.pdf');
  });
});

describe('groupPackingItems', () => {
  it('preserves first-seen category and item order', () => {
    const groups = groupPackingItems([
      item('shirt-1', 'Blue Shirt', 'Tops'),
      item('shoe-1', 'Trail Shoe', 'Shoes'),
      item('shirt-2', 'White Shirt', 'Tops'),
    ]);

    expect(groups.map(group => group.category)).toEqual(['Tops', 'Shoes']);
    expect(groups[0].items.map(value => value.id)).toEqual(['shirt-1', 'shirt-2']);
  });
});

describe('packingItemIsChecked', () => {
  it('matches an item against the checked-id snapshot', () => {
    const checkedIds = new Set(['shirt-1']);
    expect(packingItemIsChecked('shirt-1', checkedIds)).toBe(true);
    expect(packingItemIsChecked('shoe-1', checkedIds)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing module fails**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdfLayout.test.ts
```

Expected: FAIL because `../packingPdfLayout` does not exist.

- [ ] **Step 3: Implement filename and grouping**

Create `src/features/packing/packingPdfLayout.ts`:

```ts
import type { ClosetItem } from '../../components/ClosetGrid';

export type PackingPdfItem = Pick<
  ClosetItem,
  'id' | 'name' | 'category' | 'image'
>;

export interface PackingPdfGroup {
  category: string;
  items: PackingPdfItem[];
}

export const packingPdfFilename = (tripName: string): string => {
  const slug = tripName
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug ? `${slug}-packing-list.pdf` : 'packing-list.pdf';
};

export const groupPackingItems = (
  items: PackingPdfItem[],
): PackingPdfGroup[] => {
  const groups = new Map<string, PackingPdfItem[]>();
  for (const item of items) {
    const category = item.category.trim() || 'Other';
    const existing = groups.get(category);
    if (existing) existing.push(item);
    else groups.set(category, [item]);
  }
  return Array.from(groups, ([category, groupedItems]) => ({
    category,
    items: groupedItems,
  }));
};

export const packingItemIsChecked = (
  itemId: string,
  checkedIds: ReadonlySet<string>,
): boolean => checkedIds.has(itemId);
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdfLayout.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Add failing page-placement tests**

Append to `src/features/packing/__tests__/packingPdfLayout.test.ts`:

```ts
import { planPackingPdfPages } from '../packingPdfLayout';

describe('planPackingPdfPages', () => {
  it('adds pages without splitting cards', () => {
    const groups = groupPackingItems(
      Array.from({ length: 14 }, (_, index) =>
        item(`top-${index}`, `Top ${index}`, 'Tops'),
      ),
    );

    const pages = planPackingPdfPages(groups);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(page => page.cards)).toHaveLength(14);
    expect(pages.flatMap(page => page.cards).every(card => card.y + card.height <= 748))
      .toBe(true);
  });

  it('moves a category heading with its first card', () => {
    const groups = [
      {
        category: 'Tops',
        items: Array.from({ length: 10 }, (_, index) =>
          item(`top-${index}`, `Top ${index}`, 'Tops'),
        ),
      },
      {
        category: 'Shoes',
        items: [item('shoe-1', 'Trail Shoe', 'Shoes')],
      },
    ];

    const pages = planPackingPdfPages(groups);
    const shoesHeading = pages
      .flatMap((page, pageIndex) =>
        page.headings.map(heading => ({ ...heading, pageIndex })),
      )
      .find(heading => heading.category === 'Shoes');
    const shoesCard = pages
      .flatMap((page, pageIndex) =>
        page.cards.map(card => ({ ...card, pageIndex })),
      )
      .find(card => card.item.id === 'shoe-1');

    expect(shoesHeading?.pageIndex).toBe(shoesCard?.pageIndex);
  });
});
```

- [ ] **Step 6: Run the page tests and verify the missing export fails**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdfLayout.test.ts
```

Expected: FAIL because `planPackingPdfPages` is not exported.

- [ ] **Step 7: Implement page planning**

Append to `src/features/packing/packingPdfLayout.ts`:

```ts
export interface PackingPdfHeadingPlacement {
  category: string;
  y: number;
}

export interface PackingPdfCardPlacement {
  item: PackingPdfItem;
  column: 0 | 1;
  y: number;
  height: number;
}

export interface PackingPdfPage {
  headings: PackingPdfHeadingPlacement[];
  cards: PackingPdfCardPlacement[];
}

const FIRST_PAGE_START_Y = 126;
const CONTINUATION_START_Y = 62;
const CONTENT_BOTTOM_Y = 748;
const HEADING_HEIGHT = 24;
const CARD_HEIGHT = 112;
const ROW_GAP = 12;
const GROUP_GAP = 10;

const newPage = (): PackingPdfPage => ({ headings: [], cards: [] });

export const planPackingPdfPages = (
  groups: PackingPdfGroup[],
): PackingPdfPage[] => {
  const pages: PackingPdfPage[] = [newPage()];
  let pageIndex = 0;
  let y = FIRST_PAGE_START_Y;

  const advancePage = () => {
    pages.push(newPage());
    pageIndex += 1;
    y = CONTINUATION_START_Y;
  };

  for (const group of groups) {
    if (y + HEADING_HEIGHT + CARD_HEIGHT > CONTENT_BOTTOM_Y) advancePage();
    pages[pageIndex].headings.push({ category: group.category, y });
    y += HEADING_HEIGHT;

    for (let index = 0; index < group.items.length; index += 2) {
      if (y + CARD_HEIGHT > CONTENT_BOTTOM_Y) advancePage();
      const row = group.items.slice(index, index + 2);
      row.forEach((groupItem, column) => {
        pages[pageIndex].cards.push({
          item: groupItem,
          column: column as 0 | 1,
          y,
          height: CARD_HEIGHT,
        });
      });
      y += CARD_HEIGHT + ROW_GAP;
    }
    y += GROUP_GAP;
  }

  return pages;
};
```

- [ ] **Step 8: Run the layout tests and commit**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdfLayout.test.ts
git add src/features/packing/packingPdfLayout.ts src/features/packing/__tests__/packingPdfLayout.test.ts
git commit -m "feat: plan packing list PDF layout"
```

Expected: all layout tests pass and the commit succeeds.

### Task 2: Image normalization and PDF rendering

**Files:**
- Create: `src/features/packing/packingPdf.ts`
- Create: `src/features/packing/__tests__/packingPdf.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes:
  - `PackingPdfItem[]`
  - `planPackingPdfPages(groups: PackingPdfGroup[]): PackingPdfPage[]`
- Produces:
  - `loadPackingItemImages(items, normalizer?): Promise<Map<string, string | null>>`
  - `exportPackingListPdf(input: PackingPdfExportInput): Promise<void>`

- [ ] **Step 1: Install the PDF dependency**

Run:

```bash
npm install jspdf
```

Expected: `jspdf` appears in `dependencies`; `package-lock.json` updates.

- [ ] **Step 2: Write the failing per-image recovery test**

Create `src/features/packing/__tests__/packingPdf.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { loadPackingItemImages } from '../packingPdf';
import type { PackingPdfItem } from '../packingPdfLayout';

const items: PackingPdfItem[] = [
  { id: 'good', name: 'Good Image', category: 'Tops', image: '/good.jpg' },
  { id: 'bad', name: 'Bad Image', category: 'Tops', image: '/bad.jpg' },
];

describe('loadPackingItemImages', () => {
  it('uses null for one failed image without rejecting the collection', async () => {
    const normalizer = vi.fn(async (source: string) => {
      if (source === '/bad.jpg') throw new Error('decode failed');
      return 'data:image/jpeg;base64,good';
    });

    await expect(loadPackingItemImages(items, normalizer)).resolves.toEqual(
      new Map([
        ['good', 'data:image/jpeg;base64,good'],
        ['bad', null],
      ]),
    );
  });
});
```

- [ ] **Step 3: Run the test and verify the missing module fails**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdf.test.ts
```

Expected: FAIL because `../packingPdf` does not exist.

- [ ] **Step 4: Implement image normalization and recovery**

Create `src/features/packing/packingPdf.ts` with these image functions:

```ts
import { jsPDF } from 'jspdf';
import type { ClosetItem } from '../../components/ClosetGrid';
import {
  groupPackingItems,
  packingItemIsChecked,
  packingPdfFilename,
  planPackingPdfPages,
  type PackingPdfItem,
} from './packingPdfLayout';

type ImageNormalizer = (source: string) => Promise<string>;

const IMAGE_SIZE = 360;

export const normalizeImageToJpeg = (source: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = IMAGE_SIZE;
      canvas.height = IMAGE_SIZE;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas is unavailable'));
        return;
      }

      context.fillStyle = '#f1efe8';
      context.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
      const scale = Math.min(IMAGE_SIZE / image.naturalWidth, IMAGE_SIZE / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(
        image,
        (IMAGE_SIZE - width) / 2,
        (IMAGE_SIZE - height) / 2,
        width,
        height,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => reject(new Error(`Could not load image: ${source}`));
    image.src = source;
  });

export const loadPackingItemImages = async (
  items: PackingPdfItem[],
  normalizer: ImageNormalizer = normalizeImageToJpeg,
): Promise<Map<string, string | null>> => {
  const resolved = await Promise.all(
    items.map(async item => {
      try {
        return [item.id, await normalizer(item.image)] as const;
      } catch {
        return [item.id, null] as const;
      }
    }),
  );
  return new Map(resolved);
};
```

- [ ] **Step 5: Run the image test and verify it passes**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdf.test.ts
```

Expected: the per-image recovery test passes.

- [ ] **Step 6: Add the export input and renderer**

Append the following public contract and renderer to `src/features/packing/packingPdf.ts`. Keep drawing helpers private and use these fixed layout values so the renderer matches the page planner:

```ts
export interface PackingPdfExportInput {
  tripName: string;
  items: ClosetItem[];
  physicallyPackedIds: Iterable<string>;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 42;
const CARD_GAP = 14;
const CARD_WIDTH = (PAGE_WIDTH - MARGIN_X * 2 - CARD_GAP) / 2;
const IMAGE_INSET = 8;
const IMAGE_BOX = 86;

const drawCheck = (doc: jsPDF, x: number, y: number, checked: boolean) => {
  doc.setDrawColor(48, 47, 42);
  doc.rect(x, y, 10, 10);
  if (checked) {
    doc.setLineWidth(1.4);
    doc.line(x + 2, y + 5, x + 4.5, y + 8);
    doc.line(x + 4.5, y + 8, x + 8.5, y + 2);
    doc.setLineWidth(0.2);
  }
};

const drawImagePlaceholder = (doc: jsPDF, x: number, y: number) => {
  doc.setFillColor(235, 232, 223);
  doc.rect(x, y, IMAGE_BOX, IMAGE_BOX, 'F');
  doc.setTextColor(125, 122, 113);
  doc.setFontSize(8);
  doc.text('IMAGE UNAVAILABLE', x + IMAGE_BOX / 2, y + IMAGE_BOX / 2, {
    align: 'center',
  });
};

export const exportPackingListPdf = async ({
  tripName,
  items,
  physicallyPackedIds,
}: PackingPdfExportInput): Promise<void> => {
  const packedIds = new Set(physicallyPackedIds);
  const packedCount = items.filter(item => packingItemIsChecked(item.id, packedIds)).length;
  const groups = groupPackingItems(items);
  const pages = planPackingPdfPages(groups);
  const images = await loadPackingItemImages(items);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const title = tripName.trim() || 'Packing List';

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) doc.addPage('letter', 'portrait');
    doc.setTextColor(30, 29, 26);

    if (pageIndex === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text(title, MARGIN_X, 52);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(105, 102, 94);
      doc.text(`${packedCount} of ${items.length} packed`, MARGIN_X, 72);
      doc.setDrawColor(197, 193, 182);
      doc.line(MARGIN_X, 92, PAGE_WIDTH - MARGIN_X, 92);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(105, 102, 94);
      doc.text(title, MARGIN_X, 34);
    }

    for (const heading of page.headings) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(85, 82, 74);
      doc.text(heading.category.toUpperCase(), MARGIN_X, heading.y + 11);
    }

    for (const card of page.cards) {
      const x = MARGIN_X + card.column * (CARD_WIDTH + CARD_GAP);
      doc.setDrawColor(210, 206, 195);
      doc.roundedRect(x, card.y, CARD_WIDTH, card.height, 2, 2);
      const imageX = x + IMAGE_INSET;
      const imageY = card.y + IMAGE_INSET;
      const imageData = images.get(card.item.id);
      if (imageData) doc.addImage(imageData, 'JPEG', imageX, imageY, IMAGE_BOX, IMAGE_BOX);
      else drawImagePlaceholder(doc, imageX, imageY);

      const textX = imageX + IMAGE_BOX + 12;
      drawCheck(doc, textX, card.y + 18, packingItemIsChecked(card.item.id, packedIds));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(36, 35, 31);
      const lines = doc.splitTextToSize(card.item.name, CARD_WIDTH - IMAGE_BOX - 38);
      doc.text(lines.slice(0, 4), textX, card.y + 44);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(125, 122, 113);
    doc.text(`${pageIndex + 1} / ${pages.length}`, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 24, {
      align: 'right',
    });
  });

  doc.save(packingPdfFilename(tripName));
};
```

- [ ] **Step 7: Build and run exporter tests**

Run:

```bash
npm test -- src/features/packing/__tests__/packingPdfLayout.test.ts src/features/packing/__tests__/packingPdf.test.ts
npm run build
```

Expected: exporter tests pass and TypeScript/Vite build exits 0. If the installed `jsPDF` type signature differs for `addPage`, adjust only that call to the installed signature while retaining Letter portrait output.

- [ ] **Step 8: Commit the PDF engine**

Run:

```bash
git add package.json package-lock.json src/features/packing
git commit -m "feat: generate illustrated packing list PDFs"
```

Expected: the dependency, pure planner, exporter, and tests are committed.

### Task 3: Packing drawer export experience

**Files:**
- Modify: `src/components/PackingList.tsx`
- Create: `src/components/__tests__/PackingList.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `exportPackingListPdf(input: PackingPdfExportInput): Promise<void>`
- Produces: `Export PDF`, `Preparing PDF…`, `Downloaded`, and failure states in the existing drawer

- [ ] **Step 1: Install the component test environment**

Run:

```bash
npm install --save-dev jsdom
```

Expected: `jsdom` appears in `devDependencies`; `package-lock.json` updates.

- [ ] **Step 2: Write the failing interaction tests**

Create `src/components/__tests__/PackingList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PackingList from '../PackingList';
import { exportPackingListPdf } from '../../features/packing/packingPdf';

vi.mock('../../features/packing/packingPdf', () => ({
  exportPackingListPdf: vi.fn(),
}));

const packedItems = [{
  id: 'shirt-1',
  name: 'Blue Shirt',
  category: 'Tops',
  color: 'Blue',
  brand: 'Example',
  image: '/shirt.jpg',
  description: 'A blue shirt',
}];

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('PackingList PDF export', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    container.remove();
  });

  it('disables the action while preparing and reports a completed download', async () => {
    const pending = deferred();
    vi.mocked(exportPackingListPdf).mockReturnValue(pending.promise);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PackingList
          packedItems={packedItems}
          onRemoveItem={() => undefined}
          onClearList={() => undefined}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    await act(async () => button.click());
    expect(button.textContent).toContain('Preparing PDF');
    expect(button.disabled).toBe(true);

    await act(async () => pending.resolve());
    expect(button.textContent).toContain('Downloaded');
    expect(exportPackingListPdf).toHaveBeenCalledWith({
      tripName: 'Vacation Trip',
      items: packedItems,
      physicallyPackedIds: [],
    });

    await act(async () => vi.advanceTimersByTime(2000));
    expect(button.textContent).toContain('Export PDF');
    await act(async () => root.unmount());
  });

  it('shows an accessible error when generation fails', async () => {
    vi.mocked(exportPackingListPdf).mockRejectedValue(new Error('save failed'));
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PackingList
          packedItems={packedItems}
          onRemoveItem={() => undefined}
          onClearList={() => undefined}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    await act(async () => button.click());

    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain('Could not create the PDF. Please try again.');
    expect(button.disabled).toBe(false);
    await act(async () => root.unmount());
  });
});
```

- [ ] **Step 3: Run the component test and verify it fails for the old clipboard UI**

Run:

```bash
npm test -- src/components/__tests__/PackingList.test.tsx
```

Expected: FAIL because no `Export PDF` button exists.

- [ ] **Step 4: Replace clipboard state and handler**

In `src/components/PackingList.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Check, Download, AlertCircle } from 'lucide-react';
import { exportPackingListPdf } from '../features/packing/packingPdf';

type ExportStatus = 'idle' | 'preparing' | 'downloaded' | 'error';
```

Replace `copied` state with:

```tsx
const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
const resetExportTimerRef = useRef<number | null>(null);

useEffect(() => () => {
  if (resetExportTimerRef.current !== null) {
    window.clearTimeout(resetExportTimerRef.current);
  }
}, []);
```

Replace `handleExportList` with:

```tsx
const handleExportPdf = async () => {
  if (exportStatus === 'preparing') return;
  if (resetExportTimerRef.current !== null) {
    window.clearTimeout(resetExportTimerRef.current);
  }
  setExportStatus('preparing');
  try {
    await exportPackingListPdf({
      tripName,
      items: packedItems,
      physicallyPackedIds: physicallyPacked,
    });
    setExportStatus('downloaded');
    resetExportTimerRef.current = window.setTimeout(() => {
      setExportStatus('idle');
      resetExportTimerRef.current = null;
    }, 2000);
  } catch (error) {
    console.error('Failed to export packing list PDF', error);
    setExportStatus('error');
  }
};
```

- [ ] **Step 5: Replace the export button and add feedback**

Change the existing export button to:

```tsx
<button
  onClick={handleExportPdf}
  disabled={exportStatus === 'preparing'}
  className="tap-target"
  style={{
    flex: 1,
    padding: '10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color)',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: exportStatus === 'preparing' ? 'wait' : 'pointer',
    opacity: exportStatus === 'preparing' ? 0.65 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'var(--transition-fast)',
  }}
>
  {exportStatus === 'downloaded'
    ? <Check size={16} style={{ color: 'var(--accent-primary)' }} />
    : <Download size={16} />}
  {exportStatus === 'preparing'
    ? 'Preparing PDF…'
    : exportStatus === 'downloaded'
      ? 'Downloaded'
      : 'Export PDF'}
</button>
```

Directly below the button row, add:

```tsx
{exportStatus === 'error' && (
  <p
    role="status"
    style={{
      color: 'var(--error)',
      fontSize: '0.75rem',
      lineHeight: 1.4,
    }}
  >
    Could not create the PDF. Please try again.
  </p>
)}
```

- [ ] **Step 6: Run component and full tests**

Run:

```bash
npm test -- src/components/__tests__/PackingList.test.tsx
npm test
```

Expected: component tests pass; the full suite reports zero failures.

- [ ] **Step 7: Run static verification and commit**

Run:

```bash
npm run lint
npm run build
git diff --check
git add package.json package-lock.json src/components/PackingList.tsx src/components/__tests__/PackingList.test.tsx
git commit -m "feat: export packing drawer as PDF"
```

Expected: lint and build exit 0; the UI integration commit succeeds.

### Task 4: Live download and rendered-PDF verification

**Files:**
- Modify only if a verified defect is found in the preceding task's files.

**Interfaces:**
- Consumes: the complete packing-list PDF export flow
- Produces: browser and rendered-document evidence that the user-visible requirement works

- [ ] **Step 1: Start the app and verify the reachable URL**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports its actual local URL. Confirm it with `curl` before browser QA.

- [ ] **Step 2: Exercise the export in a real browser**

Open the verified URL, add enough garments and sneakers to exercise multiple categories, open `Packing`, check at least one item, and select `Export PDF`.

Expected:

- `Preparing PDF…` appears and prevents a duplicate click;
- the browser downloads a filename derived from `Vacation Trip`;
- the action changes to `Downloaded`; and
- the packing list remains unchanged.

- [ ] **Step 3: Inspect the downloaded PDF**

Render every PDF page to PNG and inspect the output.

Expected:

- title and packed summary are correct;
- every list item appears once;
- images and names are paired correctly;
- the checked item has a visible check mark;
- categories retain their first-seen order;
- no card crosses the page footer;
- continuation pages have the trip header and page count; and
- no text or image is clipped.

- [ ] **Step 4: Exercise the image-failure path**

In the browser session, temporarily change one packed item's image source in local storage to a missing same-origin path, reload, and export again. Restore the browser data after the check.

Expected: the PDF still downloads, the affected item uses `IMAGE UNAVAILABLE`, and all other cards keep their images.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all commands exit 0. `git status --short` is empty unless Task 4 uncovered and fixed a defect; any such fix must include a focused regression test and its own commit.

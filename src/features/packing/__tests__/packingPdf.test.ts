import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exportPackingListPdf,
  loadPackingItemImages,
  normalizeImageToJpeg,
} from '../packingPdf';
import type { PackingPdfItem } from '../packingPdfLayout';

const pdfHarness = vi.hoisted(() => ({
  instances: [] as object[],
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    private fontSize = 10;
    addImage = vi.fn();
    addPage = vi.fn();
    line = vi.fn();
    rect = vi.fn();
    roundedRect = vi.fn();
    save = vi.fn();
    setDrawColor = vi.fn();
    setFillColor = vi.fn();
    setFont = vi.fn();
    setFontSize = vi.fn((fontSize: number) => {
      this.fontSize = fontSize;
    });
    setLineWidth = vi.fn();
    setTextColor = vi.fn();
    splitTextToSize = vi.fn((text: string) => [text]);
    text = vi.fn();
    getTextWidth = vi.fn((text: string) => text.length * this.fontSize * 0.5);

    constructor() {
      pdfHarness.instances.push(this);
    }
  },
}));

const items: PackingPdfItem[] = [
  { id: 'good', name: 'Good Image', category: 'Tops', image: '/good.jpg' },
  { id: 'bad', name: 'Bad Image', category: 'Tops', image: '/bad.jpg' },
];

class BrowserImageStub {
  static instances: BrowserImageStub[] = [];
  static outcome: 'load' | 'error' = 'load';

  decoding = 'auto';
  naturalWidth = 160;
  naturalHeight = 120;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  private source = '';

  constructor() {
    BrowserImageStub.instances.push(this);
  }

  get src() {
    return this.source;
  }

  set src(source: string) {
    this.source = source;
    if (!source) return;
    queueMicrotask(() => {
      try {
        if (BrowserImageStub.outcome === 'load') {
          this.onload?.({} as Event);
        } else {
          this.onerror?.({} as Event);
        }
      } catch {
        // Browser event-handler errors do not reject the promise created before the event.
      }
    });
  }
}

const canvasWith = (toDataUrl: () => string) => ({
  width: 0,
  height: 0,
  getContext: () => ({
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }),
  toDataURL: toDataUrl,
});

const outcomeWithinOneTick = <T>(promise: Promise<T>) =>
  Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 0)),
  ]);

afterEach(() => {
  BrowserImageStub.instances = [];
  BrowserImageStub.outcome = 'load';
  pdfHarness.instances = [];
  vi.unstubAllGlobals();
});

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

  it('recovers a default-normalizer canvas failure without losing a sibling image', async () => {
    const goodCanvas = canvasWith(() => 'data:image/jpeg;base64,good');
    const badCanvas = canvasWith(() => {
      throw new Error('tainted canvas');
    });
    vi.stubGlobal('Image', BrowserImageStub);
    vi.stubGlobal('document', {
      createElement: vi
        .fn()
        .mockReturnValueOnce(goodCanvas)
        .mockReturnValueOnce(badCanvas),
    });

    const result = await Promise.race([
      loadPackingItemImages(items),
      new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 0)),
    ]);

    expect(result).toEqual(
      new Map([
        ['good', 'data:image/jpeg;base64,good'],
        ['bad', null],
      ]),
    );
  });

  it('normalizes at most three images concurrently and preserves input order', async () => {
    const manyItems = Array.from({ length: 7 }, (_, index) => ({
      id: `item-${index}`,
      name: `Item ${index}`,
      category: 'Tops',
      image: `/item-${index}.jpg`,
    }));
    let active = 0;
    let maxActive = 0;
    const releases = new Map<string, () => void>();
    const gates = new Map(
      manyItems.map(item => [
        item.image,
        new Promise<void>(resolve => {
          releases.set(item.image, resolve);
        }),
      ]),
    );
    const normalizer = vi.fn(async (source: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates.get(source);
      active -= 1;
      return `normalized:${source}`;
    });

    const resultPromise = loadPackingItemImages(manyItems, normalizer);
    await Promise.resolve();

    expect(normalizer).toHaveBeenCalledTimes(3);
    expect(active).toBe(3);

    for (const index of [2, 0, 1, 5, 3, 4, 6]) {
      releases.get(manyItems[index].image)!();
      await Promise.resolve();
      await Promise.resolve();
      expect(active).toBeLessThanOrEqual(3);
    }
    await expect(resultPromise).resolves.toEqual(
      new Map(
        manyItems.map(item => [item.id, `normalized:${item.image}`]),
      ),
    );
    expect(maxActive).toBe(3);
  });
});

describe('normalizeImageToJpeg', () => {
  it('rejects when canvas encoding throws during the asynchronous image load', async () => {
    vi.stubGlobal('Image', BrowserImageStub);
    vi.stubGlobal('document', {
      createElement: vi.fn(() =>
        canvasWith(() => {
          throw new Error('tainted canvas');
        }),
      ),
    });

    await expect(outcomeWithinOneTick(normalizeImageToJpeg('/bad.jpg'))).resolves.toBe('rejected');

    const [image] = BrowserImageStub.instances;
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.src).toBe('');
  });

  it('releases the browser image after a successful normalization', async () => {
    vi.stubGlobal('Image', BrowserImageStub);
    vi.stubGlobal('document', {
      createElement: vi.fn(() =>
        canvasWith(() => 'data:image/jpeg;base64,good'),
      ),
    });

    await expect(normalizeImageToJpeg('/good.jpg')).resolves
      .toBe('data:image/jpeg;base64,good');

    const [image] = BrowserImageStub.instances;
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.src).toBe('');
  });

  it('releases the browser image after a failed normalization', async () => {
    BrowserImageStub.outcome = 'error';
    vi.stubGlobal('Image', BrowserImageStub);

    await expect(normalizeImageToJpeg('/bad.jpg')).rejects
      .toThrow('Could not load image: /bad.jpg');

    const [image] = BrowserImageStub.instances;
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.src).toBe('');
  });
});

describe('exportPackingListPdf text rendering', () => {
  it('renders Unicode labels through local canvas while keeping ASCII item text selectable', async () => {
    BrowserImageStub.outcome = 'error';
    vi.stubGlobal('Image', BrowserImageStub);
    const fillText = vi.fn();
    const textCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        font: '',
        fillStyle: '',
        textBaseline: 'alphabetic',
        measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
        fillText,
      })),
      toDataURL: vi.fn(() => 'data:image/png;base64,text'),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => textCanvas),
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await exportPackingListPdf({
      tripName: 'Café 東京 🧳',
      items: [
        {
          id: 'unicode',
          name: 'Crème brûlée T-shirt 👕',
          category: 'Vêtements 日本',
          color: 'Cream',
          brand: 'Example',
          image: '/unicode.jpg',
          description: 'Unicode item',
        },
        {
          id: 'ascii',
          name: 'Blue Shirt',
          category: 'Vêtements 日本',
          color: 'Blue',
          brand: 'Example',
          image: '/ascii.jpg',
          description: 'ASCII item',
        },
      ],
      physicallyPackedIds: [],
    });

    const renderedCanvasText = fillText.mock.calls.map(([text]) => text);
    expect(renderedCanvasText).toEqual(expect.arrayContaining([
      'Café 東京 🧳',
      'VÊTEMENTS 日本',
      'Crème brûlée T-shirt 👕',
    ]));
    const doc = pdfHarness.instances.at(-1) as {
      text: ReturnType<typeof vi.fn>;
      addImage: ReturnType<typeof vi.fn>;
    };
    const nativeText = doc.text.mock.calls.map(([text]) => text);
    expect(nativeText).toContain('Blue Shirt');
    expect(nativeText).not.toContain('Café 東京 🧳');
    expect(nativeText).not.toContain('VÊTEMENTS 日本');
    expect(nativeText).not.toContain('Crème brûlée T-shirt 👕');
    expect(doc.addImage).toHaveBeenCalledTimes(3);
    const [, , titleX, titleY, titleWidth, titleHeight] = doc.addImage.mock.calls[0];
    expect([titleX, titleY]).toEqual([42, 28]);
    expect(titleWidth).toBeLessThanOrEqual(528);
    expect(titleHeight).toBeLessThanOrEqual(32.4);
    const [, , categoryX, categoryY, categoryWidth] = doc.addImage.mock.calls[1];
    expect([categoryX, categoryY]).toEqual([42, 128]);
    expect(categoryWidth).toBeLessThanOrEqual(528);
    const [, , itemX, itemY, itemWidth] = doc.addImage.mock.calls[2];
    expect([itemX, itemY]).toEqual([148, 184]);
    expect(itemWidth).toBeLessThanOrEqual(133);
    expect(textCanvas.toDataURL).toHaveBeenCalledTimes(3);
    expect([textCanvas.width, textCanvas.height]).toEqual([0, 0]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ellipsizes a long trip title within the content width on every page', async () => {
    BrowserImageStub.outcome = 'error';
    vi.stubGlobal('Image', BrowserImageStub);
    const title = 'A'.repeat(200);
    const manyItems = Array.from({ length: 14 }, (_, index) => ({
      id: `item-${index}`,
      name: `Item ${index}`,
      category: 'Tops',
      color: 'Blue',
      brand: 'Example',
      image: `/item-${index}.jpg`,
      description: 'Item',
    }));

    await exportPackingListPdf({
      tripName: title,
      items: manyItems,
      physicallyPackedIds: [],
    });

    const doc = pdfHarness.instances.at(-1) as {
      text: ReturnType<typeof vi.fn>;
      getTextWidth: (text: string) => number;
    };
    const titleCalls = doc.text.mock.calls.filter(([, , y]) => y === 52 || y === 34);
    expect(titleCalls.length).toBeGreaterThan(1);
    for (const [renderedTitle] of titleCalls) {
      expect(renderedTitle).not.toBe(title);
      expect(renderedTitle).toMatch(/\.\.\.$/);
      expect(doc.getTextWidth(renderedTitle)).toBeLessThanOrEqual(528);
    }
  });
});

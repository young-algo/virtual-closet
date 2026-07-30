import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPackingItemImages, normalizeImageToJpeg } from '../packingPdf';
import type { PackingPdfItem } from '../packingPdfLayout';

const items: PackingPdfItem[] = [
  { id: 'good', name: 'Good Image', category: 'Tops', image: '/good.jpg' },
  { id: 'bad', name: 'Bad Image', category: 'Tops', image: '/bad.jpg' },
];

class BrowserImageStub {
  decoding = 'auto';
  naturalWidth = 160;
  naturalHeight = 120;
  onload: ((event: Event) => void) | null = null;

  set src(_source: string) {
    queueMicrotask(() => {
      try {
        this.onload?.({} as Event);
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
  });
});

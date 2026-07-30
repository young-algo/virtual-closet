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

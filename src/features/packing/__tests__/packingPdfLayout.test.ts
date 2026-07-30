import { describe, expect, it } from 'vitest';
import {
  groupPackingItems,
  packingItemIsChecked,
  packingPdfFilename,
  planPackingPdfPages,
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

  it('caps a long filename slug before appending the packing-list suffix', () => {
    expect(packingPdfFilename('A'.repeat(200)))
      .toBe(`${'a'.repeat(80)}-packing-list.pdf`);
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

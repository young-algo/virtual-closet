import { beforeEach, describe, expect, it } from 'vitest';
import { assignStableLabels, planAtlasPages } from '../atlasBuilder';
import type { DailySlot } from '../types';
import { MemoryStorage } from './testStorage';

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
});

describe('full inventory atlases', () => {
  it('places every item exactly once without mixing slots', () => {
    const items = [
      ...Array.from({ length: 13 }, (_, index) => ({ id: `top-${index}`, slot: 'top' as DailySlot, shortLabel: `T${String(index + 1).padStart(3, '0')}` })),
      ...Array.from({ length: 2 }, (_, index) => ({ id: `bottom-${index}`, slot: 'bottom' as DailySlot, shortLabel: `B${String(index + 1).padStart(3, '0')}` })),
      { id: 'shoe-0', slot: 'shoes' as DailySlot, shortLabel: 'S001' }
    ];
    const pages = planAtlasPages(items);
    const memberships = pages.flatMap(page => page.itemIds.map(id => ({ id, slot: page.slot })));
    expect(memberships).toHaveLength(items.length);
    expect(new Set(memberships.map(entry => entry.id)).size).toBe(items.length);
    expect(memberships.every(entry => items.find(item => item.id === entry.id)?.slot === entry.slot)).toBe(true);
    expect(pages.filter(page => page.slot === 'top').map(page => page.itemIds.length)).toEqual([12, 1]);
  });

  it('keeps labels stable and never recycles a deleted item number', () => {
    const first = assignStableLabels([{ id: 'a', slot: 'top' }, { id: 'b', slot: 'top' }]);
    const second = assignStableLabels([{ id: 'b', slot: 'top' }, { id: 'c', slot: 'top' }]);
    expect(first.get('b')).toBe('T002');
    expect(second.get('b')).toBe('T002');
    expect(second.get('c')).toBe('T003');
  });
});

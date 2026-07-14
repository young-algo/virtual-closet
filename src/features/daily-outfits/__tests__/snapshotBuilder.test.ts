import { describe, expect, it } from 'vitest';
import { eligibleDailyItems } from '../snapshotBuilder';
import type { DailySourceItem } from '../types';

const item = (id: string, category: string, dailyProfile = {}): DailySourceItem => ({
  id, name: id, category, color: 'navy', brand: 'Test', image: `/${id}.jpg`, description: '', dailyProfile
});

describe('snapshot eligibility', () => {
  it('keeps the complete wearable inventory without a top-N ranking', () => {
    const source = Array.from({ length: 40 }, (_, index) => item(`top-${index}`, 'T-Shirts'))
      .concat([item('bottom', 'Pants'), item('shoes', 'Sneakers')]);
    expect(eligibleDailyItems(source).map(entry => entry.item.id)).toEqual(source.map(entry => entry.id));
  });

  it('applies only the permitted availability, exclusion, and slot gates', () => {
    const source = [
      item('available', 'T-Shirts'),
      item('unavailable', 'T-Shirts', { available: false }),
      item('excluded', 'T-Shirts', { excludedFromDaily: true }),
      item('invalid-slot', 'Accessories')
    ];
    expect(eligibleDailyItems(source).map(entry => entry.item.id)).toEqual(['available']);
  });
});

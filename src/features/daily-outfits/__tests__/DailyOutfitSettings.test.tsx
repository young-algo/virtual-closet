import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DailyOutfitSettings from '../DailyOutfitSettings';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => undefined,
  },
});

describe('DailyOutfitSettings', () => {
  it('promises graceful partial delivery and exposes safe diagnostics inspection', () => {
    const html = renderToStaticMarkup(
      <DailyOutfitSettings open={false} onClose={() => undefined} items={[]} outfits={[]} />,
    );

    expect(html).toContain(
      'Up to three distinct looks: Easy, Polished casual, and Expressive. If a complete set cannot meet the day&#x27;s quality, weather, and outfit-distinctness bars after re-planning, the safe looks are still delivered.',
    );
    expect(html).toContain('Inspect diagnostics');
    expect(html).not.toContain('Three full-wardrobe');
  });
});

import { readFileSync } from 'node:fs';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DailyBundlePreview from '../DailyBundlePreview';
import DailyFeedbackControls from '../DailyFeedbackControls';
import type { DailyBundleV2, DailyFeedbackV2, DailySourceItem } from '../types';

const items: DailySourceItem[] = [
  { id: 'top', name: 'Top <One>', category: 'T-Shirts', color: 'navy', brand: 'Test', image: '/top.jpg', description: '' },
  { id: 'bottom', name: 'Bottom & Two', category: 'Pants', color: 'navy', brand: 'Test', image: '/bottom.jpg', description: '' },
  { id: 'shoe', name: 'Shoe Three', category: 'Sneakers', color: 'navy', brand: 'Test', image: '/shoe.jpg', description: '' },
];

const weather = {
  morningFeelsLikeF: 70,
  highTemperatureF: 82,
  maxRainProbability: 0,
  plainEnglishSummary: 'Light pieces.',
};

const bundle = (patch: Record<string, unknown> = {}) => ({
  localDate: '2026-07-14',
  recommendations: [],
  weather,
  ...patch,
}) as unknown as DailyBundleV2;

const render = (bundleValue: DailyBundleV2, feedback: DailyFeedbackV2[] = []) =>
  renderToStaticMarkup(
    <DailyBundlePreview
      bundle={bundleValue}
      items={items}
      feedback={feedback}
      onFeedback={() => undefined}
    />,
  );

const elementsIn = (node: ReactNode): ReactElement[] => {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  const children = (node.props as { children?: ReactNode }).children;
  return [node, ...elementsIn(children)];
};

const relativeLuminance = (hex: string) => {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map(value => Number.parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map(value => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

describe('DailyBundlePreview Encore', () => {
  it('uses an accessible small-text color on the Encore background', () => {
    const css = readFileSync(new URL('../daily-outfits.css', import.meta.url), 'utf8');
    const labelColor = css.match(/\.daily-encore \.daily-look-label\s*\{[^}]*color:\s*(#[a-f\d]{6})/i)?.[1];
    const listColor = css.match(/\.daily-encore ul\s*\{[^}]*color:\s*(#[a-f\d]{6})/i)?.[1];

    expect(labelColor).toBeDefined();
    expect(listColor).toBeDefined();
    expect(contrastRatio(labelColor ?? '#ffffff', '#ece7da')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(listColor ?? '#ffffff', '#ece7da')).toBeGreaterThanOrEqual(4.5);
  });

  it('shows the exact label, static copy, safely rendered items, and Encore feedback identity', () => {
    const encoreBundle = bundle({
      encore: {
        outfitId: 'saved-1',
        candidateId: 'encore:saved-1',
        name: 'Saved <One>',
        itemIds: ['top', 'missing', 'bottom', 'shoe'],
      },
    });
    const feedback: DailyFeedbackV2[] = [{
      localDate: '2026-07-14',
      candidateId: 'encore:saved-1',
      value: 'liked',
      createdAt: 1,
    }];

    const html = render(encoreBundle, feedback);

    expect(html).toContain('Encore — from your saved outfits');
    expect(html).toContain('Saved &lt;One&gt;');
    expect(html).toContain("One of yours, back in rotation for today&#x27;s weather.");
    expect(html).toContain('Top &lt;One&gt;');
    expect(html).toContain('Bottom &amp; Two');
    expect(html).not.toContain('missing');
    expect(html).toContain('aria-label="Feedback for Saved &lt;One&gt;"');
    expect(html).toContain('class="is-selected" aria-pressed="true">Like</button>');
  });

  it('renders no Encore markup when the optional field is absent', () => {
    const html = render(bundle());

    expect(html).not.toContain('daily-encore');
    expect(html).not.toContain('Encore — from your saved outfits');
    expect(html).not.toContain("One of yours, back in rotation for today&#x27;s weather.");
  });

  it('renders the Encore identity without crashing when item ids are malformed', () => {
    const html = render(bundle({
      encore: {
        outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: null,
      },
    }));

    expect(html).toContain('Saved One');
    expect(html).toContain('aria-label="Feedback for Saved One"');
    expect(html).not.toContain('src="/top.jpg"');
  });

  it('passes the exact Encore candidate identity and name to the shared feedback controls', () => {
    const encore = {
      outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: [],
    };
    const encoreBundle = bundle({ encore });
    const tree = DailyBundlePreview({
      bundle: encoreBundle, items, feedback: [], onFeedback: () => undefined,
    });
    const control = elementsIn(tree).find(element => element.type === DailyFeedbackControls);
    if (!control) throw new Error('Expected Encore feedback controls');
    const controlProps = control.props as { recommendation?: unknown; localDate?: unknown };

    expect(controlProps.recommendation).toBe(encore);
    expect(controlProps.localDate).toBe('2026-07-14');
  });

  it('uses stable unique React keys for repeated resolvable Encore item references', () => {
    const tree = DailyBundlePreview({
      bundle: bundle({
        encore: {
          outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: ['top', 'top'],
        },
      }),
      items,
      feedback: [],
      onFeedback: () => undefined,
    });
    const imageKeys = elementsIn(tree)
      .filter(element => element.type === 'img')
      .map(element => element.key);

    expect(imageKeys).toEqual(['top:0', 'top:1']);
  });

  it('preserves the ordinary three generated looks and their feedback path', () => {
    const recommendations = (['easy', 'polished-casual', 'expressive'] as const).map((archetype, index) => ({
      candidateId: `look-${index}`,
      archetype,
      name: `Look ${index + 1}`,
      itemIds: ['top', 'bottom', 'shoe'],
      colorHook: 'Navy against cream.',
      whyItWorks: 'The proportions and colors work together.',
      weatherNote: 'Comfortable for the forecast.',
    }));
    const feedback: DailyFeedbackV2[] = [{
      localDate: '2026-07-14', candidateId: 'look-1', value: 'wore', createdAt: 1,
    }];

    const html = render(bundle({ recommendations }), feedback);

    expect(html.match(/<article class="daily-look">/g)).toHaveLength(3);
    expect(html).toContain('01 Easy');
    expect(html).toContain('02 Polished casual');
    expect(html).toContain('03 Expressive');
    expect(html).toContain('class="is-selected" aria-pressed="true">I wore this</button>');
    expect(html).not.toContain('daily-encore');
  });

  it('places Encore after all three generated preview looks', () => {
    const recommendations = (['easy', 'polished-casual', 'expressive'] as const).map((archetype, index) => ({
      candidateId: `look-${index}`, archetype, name: `Look ${index + 1}`,
      itemIds: [], colorHook: '', whyItWorks: 'Works.', weatherNote: 'Ready.',
    }));
    const html = render(bundle({
      recommendations,
      encore: {
        outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: [],
      },
    }));

    expect(html.indexOf('03 Expressive')).toBeLessThan(html.indexOf('Encore — from your saved outfits'));
  });
});

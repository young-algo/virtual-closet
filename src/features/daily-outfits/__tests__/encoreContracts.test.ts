import { describe, expect, it } from 'vitest';
import { apps, evaluateAppsScript } from './appsScriptTestHarness';

const items = [
  { id: 'top', slot: 'top', profile: { available: true, excludedFromDaily: false, warmth: 2, breathability: 3 } },
  { id: 'bottom', slot: 'bottom', category: 'Pants', profile: { available: true, excludedFromDaily: false } },
  { id: 'shoe', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'good' } },
  { id: 'top-2', slot: 'top', profile: { available: true, excludedFromDaily: false, warmth: 2, breathability: 3 } },
  { id: 'bottom-2', slot: 'bottom', category: 'Pants', profile: { available: true, excludedFromDaily: false } },
  { id: 'shoe-2', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'good' } },
  { id: 'acceptable', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'acceptable' } },
  { id: 'unsafe', slot: 'shoes', profile: { available: true, excludedFromDaily: false, rainSafety: 'poor' } },
  { id: 'layer', slot: 'layer', profile: { available: true, excludedFromDaily: false, warmth: 2, breathability: 3 } },
  { id: 'layer-2', slot: 'layer', profile: { available: true, excludedFromDaily: false, warmth: 2, breathability: 3 } },
];

const saved = (id: string, createdAt: number, itemIds = ['top', 'bottom', 'shoe'], source?: string) => ({
  id,
  name: id,
  itemIds,
  createdAt,
  source,
});

const snapshot = {
  settings: { timezone: 'America/New_York' },
  items,
  tasteExamples: [saved('older', 1), saved('newer', 2, ['top-2', 'bottom-2', 'shoe-2'])],
};

const weather = {
  localDate: '2026-07-14',
  rainExpected: false,
  morningFeelsLikeF: 60,
  eveningFeelsLikeF: 60,
  middayFeelsLikeF: 70,
};

const selectEncoreV2_ = evaluateAppsScript<(
  snapshot: object,
  weather: object,
  history: object[],
  lastEncoreDate: string | null,
) => Record<string, unknown> | null>(
  ['ItemIndex.gs', 'Taste.gs', 'FinalValidation.gs', 'Encore.gs'],
  'selectEncoreV2_',
);

const weatherSafetyErrorsV2_ = evaluateAppsScript<(
  recommendation: { itemIds: string[] },
  itemMap: Record<string, object>,
  weather: object,
  snapshot: object,
) => string[]>(
  ['ItemIndex.gs', 'Taste.gs', 'FinalValidation.gs'],
  'weatherSafetyErrorsV2_',
);

const clone = <T>(value: T): T => structuredClone(value);

const select = (
  snapshotValue: object = snapshot,
  weatherValue: object = weather,
  historyValue: object[] = [],
  lastEncoreDate: string | null = null,
) => selectEncoreV2_(snapshotValue, weatherValue, historyValue, lastEncoreDate);

describe('Encore selection', () => {
  it('chooses the oldest never-surfaced manual save deterministically', () => {
    expect(selectEncoreV2_(snapshot, weather, [], null)).toEqual(expect.objectContaining({
      outfitId: 'older',
      candidateId: 'encore:older',
    }));
  });

  it.each([
    ['AI source', { ...snapshot, tasteExamples: [saved('ai', 1, ['top', 'bottom', 'shoe'], 'ai')] }, weather, [], null],
    ['missing item', { ...snapshot, tasteExamples: [saved('missing', 1, ['top', 'bottom', 'absent'])] }, weather, [], null],
    ['weather unsafe', { ...snapshot, tasteExamples: [saved('wet', 1, ['top', 'bottom', 'unsafe'])] }, { ...weather, rainExpected: true }, [], null],
    ['recent core trio', { ...snapshot, tasteExamples: [saved('older', 1)] }, weather, [{ localDate: '2026-07-10', recommendations: [{ candidateId: 'past', itemIds: ['top', 'bottom', 'shoe'] }], feedback: [] }], null],
    ['disliked encore', snapshot, weather, [{ localDate: '2026-06-01', recommendations: [], feedback: [{ candidateId: 'encore:older', value: 'disliked' }, { candidateId: 'encore:newer', value: 'disliked' }] }], null],
    ['seven-day cadence', snapshot, weather, [], '2026-07-08'],
  ])('returns null when %s fails', (_name, candidateSnapshot, candidateWeather, history, lastEncoreDate) => {
    expect(selectEncoreV2_(candidateSnapshot, candidateWeather, history, lastEncoreDate)).toBeNull();
  });

  it('permits the exact seven-day cadence boundary', () => {
    expect(selectEncoreV2_(snapshot, weather, [], '2026-07-07')).toEqual(expect.objectContaining({ outfitId: 'older' }));
  });

  it('chooses the longest-ago surface when every option was surfaced more than 30 days ago', () => {
    const history = [
      { localDate: '2026-05-20', recommendations: [], encore: { outfitId: 'older', candidateId: 'encore:older', itemIds: ['top', 'bottom', 'shoe'] }, feedback: [] },
      { localDate: '2026-05-30', recommendations: [], encore: { outfitId: 'newer', candidateId: 'encore:newer', itemIds: ['top-2', 'bottom-2', 'shoe-2'] }, feedback: [] },
    ];
    expect(selectEncoreV2_(snapshot, weather, history, null)).toEqual(expect.objectContaining({ outfitId: 'older' }));
  });

  it('treats an omitted source as manual and returns an independent item-id array', () => {
    const candidateSnapshot = clone({ ...snapshot, tasteExamples: [saved('manual', 1)] });
    const result = select(candidateSnapshot);

    expect(result).toEqual({
      outfitId: 'manual',
      name: 'manual',
      itemIds: ['top', 'bottom', 'shoe'],
      candidateId: 'encore:manual',
    });
    expect(result?.itemIds).not.toBe(candidateSnapshot.tasteExamples[0].itemIds);
  });

  it('accepts a literal manual source while rejecting non-contract source values', () => {
    expect(select({ ...snapshot, tasteExamples: [saved('manual', 1, undefined, 'manual')] }))
      .toEqual(expect.objectContaining({ outfitId: 'manual' }));
    expect(select({ ...snapshot, tasteExamples: [saved('unknown', 1, undefined, 'imported')] })).toBeNull();
  });

  it.each([
    ['dry weather', false],
    ['rainy weather', true],
  ])('permits acceptable rain-safety shoes through weather validation and Encore in %s', (_name, rainExpected) => {
    const candidateSnapshot = {
      ...snapshot,
      tasteExamples: [saved('acceptable-shoe', 1, ['top', 'bottom', 'acceptable'])],
    };
    const candidateWeather = { ...weather, rainExpected };
    const itemMap = Object.fromEntries(candidateSnapshot.items.map(item => [item.id, item]));

    expect(weatherSafetyErrorsV2_({ itemIds: ['top', 'bottom', 'acceptable'] }, itemMap, candidateWeather, candidateSnapshot))
      .toEqual([]);
    expect(select(candidateSnapshot, candidateWeather)).toEqual(expect.objectContaining({ outfitId: 'acceptable-shoe' }));
  });

  it.each([
    ['missing top', ['bottom', 'shoe']],
    ['two tops', ['top', 'top-2', 'bottom', 'shoe']],
    ['two bottoms', ['top', 'bottom', 'bottom-2', 'shoe']],
    ['two shoes', ['top', 'bottom', 'shoe', 'shoe-2']],
    ['duplicate reference', ['top', 'bottom', 'shoe', 'shoe']],
    ['missing referenced layer', ['top', 'bottom', 'shoe', 'absent']],
  ])('rejects a saved outfit with %s', (_name, itemIds) => {
    expect(select({ ...snapshot, tasteExamples: [saved('invalid', 1, itemIds)] })).toBeNull();
  });

  it('allows one safe layer while requiring exactly one core item per slot', () => {
    expect(select({ ...snapshot, tasteExamples: [saved('layered', 1, ['top', 'bottom', 'shoe', 'layer'])] }))
      .toEqual(expect.objectContaining({ outfitId: 'layered', itemIds: ['top', 'bottom', 'shoe', 'layer'] }));
  });

  it.each([
    ['unavailable', { available: false, excludedFromDaily: false }],
    ['excluded', { available: true, excludedFromDaily: true }],
    ['missing availability', { available: undefined, excludedFromDaily: false }],
    ['missing exclusion flag', { available: true, excludedFromDaily: undefined }],
  ])('rejects when every referenced item is not explicitly %s-safe', (_name, profilePatch) => {
    const candidateItems = clone(items);
    candidateItems.find(item => item.id === 'top')!.profile = { ...candidateItems[0].profile, ...profilePatch } as typeof candidateItems[0]['profile'];
    expect(select({ ...snapshot, items: candidateItems, tasteExamples: [saved('invalid', 1)] })).toBeNull();
  });

  it('applies full-outfit weather safety, including a referenced layer', () => {
    const candidateItems = clone(items);
    candidateItems.find(item => item.id === 'layer')!.profile.warmth = 5;
    expect(select(
      { ...snapshot, items: candidateItems, tasteExamples: [saved('hot-layer', 1, ['top', 'bottom', 'shoe', 'layer'])] },
      { ...weather, middayFeelsLikeF: 90 },
    )).toBeNull();
  });

  it.each([
    ['2026-07-14', true],
    ['2026-06-14', true],
    ['2026-06-13', false],
  ])('uses the inclusive prior-30-calendar-day boundary for %s', (localDate, blocked) => {
    const history = [{
      localDate,
      recommendations: [{ candidateId: 'prior', itemIds: ['shoe', 'top', 'bottom', 'layer-2'] }],
      feedback: [],
    }];
    const result = select(
      { ...snapshot, tasteExamples: [saved('manual', 1, ['top', 'bottom', 'shoe', 'layer'])] },
      weather,
      history,
    );
    if (blocked) expect(result).toBeNull();
    else expect(result).toEqual(expect.objectContaining({ outfitId: 'manual' }));
  });

  it('checks both generated and Encore history looks using a canonical core key', () => {
    const generatedHistory = [{
      localDate: '2026-07-01',
      recommendations: [{ candidateId: 'prior', itemIds: ['shoe', 'layer-2', 'bottom', 'top'] }],
      feedback: [],
    }];
    const encoreHistory = [{
      localDate: '2026-07-01',
      recommendations: [],
      encore: { outfitId: 'other-save', candidateId: 'encore:other-save', itemIds: ['bottom', 'top', 'shoe'] },
      feedback: [],
    }];
    const candidateSnapshot = { ...snapshot, tasteExamples: [saved('manual', 1, ['top', 'bottom', 'shoe', 'layer'])] };

    expect(select(candidateSnapshot, weather, generatedHistory)).toBeNull();
    expect(select(candidateSnapshot, weather, encoreHistory)).toBeNull();
  });

  it('applies a disliked Encore permanently but ignores unresolved and non-dislike feedback', () => {
    const oldHistory = [{
      localDate: '2020-01-01',
      recommendations: [],
      feedback: [
        { candidateId: 'encore:older', value: 'disliked' },
        { candidateId: 'encore:newer', value: 'liked' },
        { candidateId: 'encore:missing', value: 'disliked' },
      ],
    }];
    expect(select(snapshot, weather, oldHistory)).toEqual(expect.objectContaining({ outfitId: 'newer' }));
  });

  it('ignores a malformed payload only when an unambiguous valid date classifies the entry as future', () => {
    const future = [{
      localDate: '2026-07-15',
      recommendations: [null, { itemIds: 'not-an-array' }],
      encore: { malformed: true },
      feedback: { malformed: true },
    }] as unknown as object[];

    expect(select(snapshot, weather, future)).toEqual(expect.objectContaining({ outfitId: 'older' }));
  });

  it.each([
    ['a non-record entry', null],
    ['an empty record', {}],
    ['a malformed date', { localDate: 'not-a-date' }],
    ['an impossible date', { localDate: '2026-13-40' }],
  ])('fails closed without throwing for retained history with %s', (_name, entry) => {
    const retained = [entry] as unknown as object[];
    expect(() => select(snapshot, weather, retained)).not.toThrow();
    expect(select(snapshot, weather, retained)).toBeNull();
  });

  it.each([
    ['missing recommendations', { localDate: '2026-07-01', feedback: [] }],
    ['non-array recommendations', { localDate: '2026-07-01', recommendations: {}, feedback: [] }],
    ['malformed recommendation record', { localDate: '2026-07-01', recommendations: [null], feedback: [] }],
    ['recommendation without candidate identity', { localDate: '2026-07-01', recommendations: [{ itemIds: ['top', 'bottom', 'shoe'] }], feedback: [] }],
    ['recommendation without item ids', { localDate: '2026-07-01', recommendations: [{ candidateId: 'past' }], feedback: [] }],
    ['missing feedback', { localDate: '2026-07-01', recommendations: [] }],
    ['non-array feedback', { localDate: '2026-07-01', recommendations: [], feedback: {} }],
    ['malformed feedback record', { localDate: '2026-07-01', recommendations: [], feedback: [null] }],
    ['feedback without candidate identity', { localDate: '2026-07-01', recommendations: [], feedback: [{ value: 'disliked' }] }],
    ['feedback with unknown value', { localDate: '2026-07-01', recommendations: [], feedback: [{ candidateId: 'encore:older', value: 'unknown' }] }],
    ['malformed Encore payload', { localDate: '2026-07-01', recommendations: [], encore: { outfitId: 'older' }, feedback: [] }],
  ])('fails closed for a retained entry with %s', (_name, entry) => {
    expect(select(snapshot, weather, [entry] as object[])).toBeNull();
  });

  it.each([
    ['spring DST', '2026-03-01', '2026-03-08'],
    ['fall DST', '2026-10-25', '2026-11-01'],
  ])('uses civil calendar days across %s', (_name, lastEncoreDate, localDate) => {
    expect(select(snapshot, { ...weather, localDate }, [], lastEncoreDate))
      .toEqual(expect.objectContaining({ outfitId: 'older' }));
    expect(select(snapshot, { ...weather, localDate }, [], localDate)).toBeNull();
  });

  it.each([
    ['future last Encore date', '2026-07-15'],
    ['malformed last Encore date', 'not-a-date'],
    ['impossible last Encore date', '2026-02-30'],
  ])('fails closed for %s', (_name, lastEncoreDate) => {
    expect(select(snapshot, weather, [], lastEncoreDate)).toBeNull();
  });

  it.each([
    ['missing snapshot', null, weather, []],
    ['missing items', { settings: {}, tasteExamples: [saved('manual', 1)] }, weather, []],
    ['missing saved outfits', { settings: {}, items }, weather, []],
    ['missing current date', snapshot, { ...weather, localDate: undefined }, []],
    ['malformed current date', snapshot, { ...weather, localDate: '2026-02-30' }, []],
    ['missing weather metrics', snapshot, { localDate: '2026-07-14', rainExpected: false }, []],
    ['non-array history', snapshot, weather, {}],
  ])('fails closed without throwing for %s', (_name, snapshotValue, weatherValue, historyValue) => {
    expect(() => selectEncoreV2_(snapshotValue as object, weatherValue as object, historyValue as object[], null)).not.toThrow();
    expect(selectEncoreV2_(snapshotValue as object, weatherValue as object, historyValue as object[], null)).toBeNull();
  });

  it.each([
    ['missing id', { name: 'Sparse', itemIds: ['top', 'bottom', 'shoe'], createdAt: 1 }],
    ['missing name', { id: 'sparse', itemIds: ['top', 'bottom', 'shoe'], createdAt: 1 }],
    ['missing itemIds', { id: 'sparse', name: 'Sparse', createdAt: 1 }],
    ['missing createdAt', { id: 'sparse', name: 'Sparse', itemIds: ['top', 'bottom', 'shoe'] }],
    ['invalid source', { ...saved('sparse', 1), source: null }],
  ])('rejects sparse saved-outfit metadata: %s', (_name, outfit) => {
    expect(select({ ...snapshot, tasteExamples: [outfit] })).toBeNull();
  });

  it('does not accept required saved-outfit metadata inherited through a prototype', () => {
    const inherited = Object.create(Object.defineProperties({}, {
      id: { value: 'inherited', enumerable: false },
      name: { value: 'Inherited', enumerable: false },
      createdAt: { value: 1, enumerable: false },
    })) as { itemIds: string[] };
    inherited.itemIds = ['top', 'bottom', 'shoe'];

    expect(select({ ...snapshot, tasteExamples: [inherited] })).toBeNull();
  });

  it('handles prototype-key item and outfit ids as own keys', () => {
    const prototypeItems = [
      { ...items[0], id: 'constructor' },
      { ...items[1], id: 'toString' },
      { ...items[2], id: '__proto__' },
    ];
    const prototypeSnapshot = {
      ...snapshot,
      items: prototypeItems,
      tasteExamples: [saved('constructor', 1, ['constructor', 'toString', '__proto__'])],
    };
    expect(select(prototypeSnapshot)).toEqual({
      outfitId: 'constructor',
      name: 'constructor',
      itemIds: ['constructor', 'toString', '__proto__'],
      candidateId: 'encore:constructor',
    });
  });

  it('fails closed for duplicate inventory ids and skips ambiguous duplicate saved-outfit ids', () => {
    expect(select({
      ...snapshot,
      items: items.concat({ ...items[0] }),
      tasteExamples: [saved('manual', 1)],
    })).toBeNull();

    expect(select({
      ...snapshot,
      tasteExamples: [
        saved('duplicate', 1),
        saved('duplicate', 2, ['top-2', 'bottom-2', 'shoe-2']),
        saved('unique', 3, ['top-2', 'bottom-2', 'shoe-2']),
      ],
    })).toEqual(expect.objectContaining({ outfitId: 'unique' }));
  });

  it('orders never-surfaced before surfaced, then oldest surface, creation time, and id', () => {
    const candidates = {
      ...snapshot,
      tasteExamples: [
        saved('z-never', 10),
        saved('a-never', 10, ['top-2', 'bottom-2', 'shoe-2']),
      ],
    };
    expect(select(candidates, weather, [{
      localDate: '2026-05-01',
      recommendations: [],
      encore: { outfitId: 'a-never', candidateId: 'encore:a-never', itemIds: ['top-2', 'bottom-2', 'shoe-2'] },
      feedback: [],
    }])).toEqual(expect.objectContaining({ outfitId: 'z-never' }));

    const allSurfaced = [
      { localDate: '2026-05-01', recommendations: [], encore: { outfitId: 'z-never', candidateId: 'encore:z-never', itemIds: ['top', 'bottom', 'shoe'] }, feedback: [] },
      { localDate: '2026-05-02', recommendations: [], encore: { outfitId: 'a-never', candidateId: 'encore:a-never', itemIds: ['top-2', 'bottom-2', 'shoe-2'] }, feedback: [] },
      { localDate: '2026-05-03', recommendations: [], encore: { outfitId: 'z-never', candidateId: 'encore:z-never', itemIds: ['top', 'bottom', 'shoe'] }, feedback: [] },
    ];
    expect(select(candidates, weather, allSurfaced)).toEqual(expect.objectContaining({ outfitId: 'a-never' }));

    const tied = { ...candidates, tasteExamples: [saved('z-id', 5), saved('a-id', 5, ['top-2', 'bottom-2', 'shoe-2'])] };
    const tiedHistory = [
      { localDate: '2026-05-01', recommendations: [], encore: { outfitId: 'z-id', candidateId: 'encore:z-id', itemIds: ['top', 'bottom', 'shoe'] }, feedback: [] },
      { localDate: '2026-05-01', recommendations: [], encore: { outfitId: 'a-id', candidateId: 'encore:a-id', itemIds: ['top-2', 'bottom-2', 'shoe-2'] }, feedback: [] },
    ];
    expect(select(tied, weather, tiedHistory)).toEqual(expect.objectContaining({ outfitId: 'a-id' }));
  });

  it('does not mutate snapshot, weather, or history while sorting', () => {
    const snapshotValue = clone(snapshot);
    const weatherValue = clone(weather);
    const historyValue = [{
      localDate: '2026-05-01',
      recommendations: [],
      encore: { outfitId: 'newer', candidateId: 'encore:newer', itemIds: ['top-2', 'bottom-2', 'shoe-2'] },
      feedback: [],
    }];
    const before = JSON.stringify({ snapshotValue, weatherValue, historyValue });

    select(snapshotValue, weatherValue, historyValue);

    expect(JSON.stringify({ snapshotValue, weatherValue, historyValue })).toBe(before);
  });
});

describe('Encore email rendering', () => {
  const render = evaluateAppsScript<(
    bundle: Record<string, unknown>,
    snapshotValue: object,
    testMode: boolean,
    pending: object,
    expectedLocalDate: string,
  ) => { html: string; plain: string; inlineImages: Record<string, unknown> }>(
    ['ItemIndex.gs', 'Email.gs'],
    'renderDailyEmailV2_',
    {
      Utilities: {
        newBlob: (_bytes: unknown, mime: string, name: string) => ({ mime, name }),
        base64Decode: () => [],
        formatDate: () => 'Tuesday, July 14',
      },
      getDailyConfigV2_: () => ({ appUrl: '' }),
      validFullBundleReadyV2_: () => true,
      console,
    },
  );

  const emailSnapshot = {
    items: [
      { id: 'top', slot: 'top', name: 'ACG <Tee>', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
      { id: 'bottom', slot: 'bottom', name: 'Double Knee', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
      { id: 'shoe', slot: 'shoes', name: 'Mocha & Cream', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
    ],
  };
  const weatherForEmail = {
    locationLabel: 'Brooklyn, NY',
    timezone: 'America/New_York',
    morningFeelsLikeF: 70,
    highTemperatureF: 82,
    maxRainProbability: 0,
    plainEnglishSummary: 'Light pieces.',
    windy: false,
  };

  const renderBundle = (
    bundlePatch: Record<string, unknown>,
    snapshotValue: object = emailSnapshot,
  ) => {
    const bundle = {
      localDate: '2026-07-14',
      weather: weatherForEmail,
      recommendations: [],
      ...bundlePatch,
    };
    return render(bundle, snapshotValue, true, { bundle }, '2026-07-14');
  };

  it('renders a distinct escaped Encore in HTML and plain text with deterministic inline images', () => {
    const rendered = renderBundle({
      encore: {
        outfitId: 'saved-1',
        candidateId: 'encore:saved-1',
        name: 'Saved <One> & "Two"',
        itemIds: ['top', 'bottom', 'shoe'],
      },
    });

    expect(rendered.html).toContain('ENCORE — FROM YOUR SAVED OUTFITS');
    expect(rendered.html).toContain('Saved &lt;One&gt; &amp; &quot;Two&quot;');
    expect(rendered.html).toContain('ACG &lt;Tee&gt;');
    expect(rendered.html).toContain('Mocha &amp; Cream');
    expect(rendered.plain).toContain('Saved <One> & "Two"');
    expect(rendered.plain).toContain("One of yours, back in rotation for today's weather.");
    expect(Object.keys(rendered.inlineImages)).toEqual(['encoreitem0', 'encoreitem1', 'encoreitem2']);
    expect(rendered.html).toContain('cid:encoreitem0');
    expect(rendered.html).toContain('cid:encoreitem2');
  });

  it('omits missing items and invalid thumbnail data without crashing or inventing inline images', () => {
    const snapshotWithMalformedItem = {
      items: [
        emailSnapshot.items[0],
        { id: 'bad-image', slot: 'layer', name: 'Visible layer', thumbnailDataUrl: 'not-a-data-url' },
        emailSnapshot.items[2],
      ],
    };

    const rendered = renderBundle({
      encore: {
        outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One',
        itemIds: ['top', 'missing', 'bad-image', 'shoe'],
      },
    }, snapshotWithMalformedItem);

    expect(rendered.html).toContain('Visible layer');
    expect(rendered.html).not.toContain('missing');
    expect(Object.keys(rendered.inlineImages)).toEqual(['encoreitem0', 'encoreitem1']);
    expect(rendered.html).not.toContain('cid:encoreitem2');
  });

  it('does not append an Encore heading, image, or blank section when Encore is absent', () => {
    const rendered = renderBundle({});

    expect(rendered.html).not.toContain('ENCORE — FROM YOUR SAVED OUTFITS');
    expect(rendered.html).not.toContain('encoreitem');
    expect(rendered.plain).not.toContain('ENCORE — FROM YOUR SAVED OUTFITS');
    expect(rendered.inlineImages).toEqual({});
  });

  it('renders a named Encore safely when its item-id payload is malformed', () => {
    const rendered = renderBundle({
      encore: {
        outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: null,
      },
    });

    expect(rendered.html).toContain('Saved One');
    expect(rendered.plain).toContain("One of yours, back in rotation for today's weather.");
    expect(rendered.inlineImages).toEqual({});
  });

  it('preserves the ordinary three generated email sections and their image identities', () => {
    const recommendations = (['easy', 'polished-casual', 'expressive'] as const).map((archetype, index) => ({
      candidateId: `look-${index}`,
      archetype,
      name: `Look ${index + 1}`,
      itemIds: ['top', 'bottom', 'shoe'],
      colorHook: 'Navy against cream.',
      whyItWorks: 'The proportions and colors work together.',
      weatherNote: 'Comfortable for the forecast.',
    }));

    const rendered = renderBundle({ recommendations });

    expect(rendered.html.match(/<section style="padding:32px 0/g)).toHaveLength(3);
    expect(rendered.html).toContain('01 EASY');
    expect(rendered.html).toContain('02 POLISHED CASUAL');
    expect(rendered.html).toContain('03 EXPRESSIVE');
    expect(Object.keys(rendered.inlineImages)).toEqual([
      'look0item0', 'look0item1', 'look0item2',
      'look1item0', 'look1item1', 'look1item2',
      'look2item0', 'look2item1', 'look2item2',
    ]);
  });

  it('places Encore after all three generated email sections', () => {
    const recommendations = (['easy', 'polished-casual', 'expressive'] as const).map((archetype, index) => ({
      candidateId: `look-${index}`, archetype, name: `Look ${index + 1}`,
      itemIds: [], colorHook: '', whyItWorks: 'Works.', weatherNote: 'Ready.',
    }));
    const rendered = renderBundle({
      recommendations,
      encore: {
        outfitId: 'saved-1', candidateId: 'encore:saved-1', name: 'Saved One', itemIds: [],
      },
    });

    expect(rendered.html.indexOf('03 EXPRESSIVE')).toBeLessThan(rendered.html.indexOf('ENCORE — FROM YOUR SAVED OUTFITS'));
  });
});

describe('Encore bundle assembly and persistence', () => {
  const daily = { QUALITY_POLICY_VERSION: 3, ARCHETYPES: ['easy', 'polished-casual', 'expressive'] };
  const curated = { recommendations: [{ candidateId: 'one' }, { candidateId: 'two' }, { candidateId: 'three' }] };
  const bundleSnapshot = { ...snapshot, generatedAt: 100, wardrobeFingerprint: 'wardrobe-v3' };

  it('loads retained history once for compact Scheduler context but not for an explicit retained array', () => {
    const retained = [{ localDate: '2020-01-01', recommendations: [], feedback: [{ candidateId: 'encore:older', value: 'disliked' }] }];
    let loads = 0;
    const properties = { getProperty: (key: string) => key === 'LAST_ENCORE_DATE_V2' ? null : null };
    const buildBundle = evaluateAppsScript<(curatedValue: object, snapshotValue: object, weatherValue: object, historyValue: unknown) => Record<string, unknown>>(
      ['ItemIndex.gs', 'Taste.gs', 'FinalValidation.gs', 'Encore.gs', 'JobState.gs'],
      'buildBundleV2_',
      {
        DAILY_V2: daily,
        newRunIdV2_: () => 'run-id',
        getDailyPropertiesV2_: () => properties,
        loadHistoryV2_: () => { loads += 1; return retained; },
      },
    );

    const fromCompact = buildBundle(curated, bundleSnapshot, weather, { feedback: [] });
    expect(loads).toBe(1);
    expect(fromCompact.encore).toEqual(expect.objectContaining({ outfitId: 'newer' }));
    expect(fromCompact.recommendations).toEqual(curated.recommendations);

    const explicit = buildBundle(curated, bundleSnapshot, weather, []);
    expect(loads).toBe(1);
    expect(explicit.encore).toEqual(expect.objectContaining({ outfitId: 'older' }));
    expect(explicit.recommendations).toEqual(curated.recommendations);
  });

  it('passes the existing history to all synchronous, manual, and scheduled bundle builds', () => {
    const schedulerSource = apps('Scheduler.gs');
    expect(schedulerSource.match(/buildBundleV2_\([^)]*,\s*snapshot,\s*(?:pending\.)?weather,\s*(?:pending\.)?history\)/g))
      .toHaveLength(3);

    const syncHistory = { kind: 'sync-history' };
    const syncArgs: unknown[][] = [];
    const generateSync = evaluateAppsScript<(snapshotValue: object, weatherValue: object) => { bundle: unknown }>(
      ['Scheduler.gs'],
      'generationBundlePipelineV2_',
      {
        dailyHistoryContextV2_: () => syncHistory,
        runAllPlannersV2_: () => [],
        runCriticV2_: () => ({}),
        runSelectionV2_: () => ({ candidates: [], critic: {}, selectedCandidates: [], selection: {} }),
        runCuratorV2_: () => curated,
        validateFinalBundleV2_: () => [],
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: (...args: unknown[]) => { syncArgs.push(args); return { ok: true }; },
      },
    );
    generateSync(bundleSnapshot, weather);
    expect(syncArgs[0]?.[3]).toBe(syncHistory);

    const pendingHistory = { kind: 'persisted-history' };
    const manualArgs: unknown[][] = [];
    const generateManual = evaluateAppsScript<() => unknown>(
      ['Scheduler.gs'],
      'generateDailyBundleStepV2',
      {
        DAILY_V2: daily,
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => bundleSnapshot,
        loadSnapshotV2_: () => bundleSnapshot,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC' }),
        getDailyConfigV2_: () => ({}),
        localDateV2_: () => weather.localDate,
        loadPendingV2_: () => ({
          workflow: 'manual-v2', qualityPolicyVersion: 3, manualStage: 'selection-ready',
          localDate: weather.localDate, wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint,
          weather, history: pendingHistory, selectedCandidates: [], critic: {}, selection: {},
        }),
        validCurrentPendingV2_: () => true,
        validPersistedStagePrerequisitesV2_: () => true,
        assertDeterministicSelectionReadyV2_: () => undefined,
        assertPersistedSelectionContextV2_: () => undefined,
        runCuratorV2_: () => curated,
        validateFinalBundleV2_: () => [],
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: (...args: unknown[]) => { manualArgs.push(args); return { localDate: weather.localDate }; },
        savePendingV2_: () => 'pending',
      },
    );
    generateManual();
    expect(manualArgs[0]?.[3]).toBe(pendingHistory);

    const scheduledArgs: unknown[][] = [];
    let nowCall = 0;
    const advance = evaluateAppsScript<(state: Record<string, unknown>, snapshotValue: object, startedAt: number) => unknown>(
      ['Scheduler.gs'],
      'advanceDailyJobV2_',
      {
        DAILY_V2: { ...daily, MIN_EXECUTION_REMAINING_MS: 45_000 },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        Date: { now: () => [0, 1, 300_000][nowCall++] ?? 300_000 },
        loadPendingV2_: () => ({
          localDate: weather.localDate, qualityPolicyVersion: 3,
          wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint, weather,
          history: pendingHistory, selectedCandidates: [], critic: {}, selection: {},
        }),
        validScheduledStageResumeV2_: () => true,
        incrementAttemptV2_: () => undefined,
        assertDeterministicSelectionReadyV2_: () => undefined,
        assertPersistedSelectionContextV2_: () => undefined,
        runCuratorV2_: () => curated,
        validateFinalBundleV2_: () => [],
        repairFinalBundleV2_: () => { throw new Error('unexpected repair'); },
        buildBundleV2_: (...args: unknown[]) => { scheduledArgs.push(args); return { localDate: weather.localDate }; },
        savePendingV2_: () => 'pending',
        saveJobStateV2_: () => 'state',
      },
    );
    advance({
      stage: 'selection-ready', qualityPolicyVersion: 3, localDate: weather.localDate,
      wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint, attemptCounts: {},
    }, bundleSnapshot, 0);
    expect(scheduledArgs[0]?.[3]).toBe(pendingHistory);
  });

  it('persists Encore and advances cadence only after history save succeeds', () => {
    const bundle = {
      localDate: '2026-07-14', generatedAt: 100,
      weather: { highTemperatureF: 70, maxRainProbability: 0, layerGuidance: 'none' },
      recommendations: curated.recommendations,
      encore: { outfitId: 'older', name: 'older', itemIds: ['top', 'bottom', 'shoe'], candidateId: 'encore:older' },
    };
    const events: string[] = [];
    let savedHistory: unknown;
    const record = evaluateAppsScript<(bundleValue: object, snapshotValue: object) => void>(
      ['JobState.gs'],
      'recordSentBundleV2_',
      {
        DAILY_V2: daily,
        loadHistoryV2_: () => [],
        saveHistoryV2_: (value: unknown) => { events.push('history-saved'); savedHistory = clone(value); },
        getDailyPropertiesV2_: () => ({ setProperty: (key: string, value: string) => events.push(`set:${key}:${value}`) }),
      },
    );

    record(bundle, { settings: { maxDailyHistoryDays: 30 } });

    expect(savedHistory).toEqual([expect.objectContaining({ encore: bundle.encore })]);
    expect(events).toEqual(['history-saved', 'set:LAST_ENCORE_DATE_V2:2026-07-14']);
  });

  it('does not advance cadence for a failed history save or a sent bundle without Encore', () => {
    const events: string[] = [];
    const baseBundle = {
      localDate: '2026-07-14', generatedAt: 100,
      weather: { highTemperatureF: 70, maxRainProbability: 0, layerGuidance: 'none' },
      recommendations: curated.recommendations,
    };
    const record = (saveFails: boolean) => evaluateAppsScript<(bundleValue: object, snapshotValue: object) => void>(
      ['JobState.gs'],
      'recordSentBundleV2_',
      {
        DAILY_V2: daily,
        loadHistoryV2_: () => [],
        saveHistoryV2_: () => { events.push('history'); if (saveFails) throw new Error('save failed'); },
        getDailyPropertiesV2_: () => ({ setProperty: (key: string) => events.push(`set:${key}`) }),
      },
    );

    record(false)(baseBundle, { settings: {} });
    expect(events).toEqual(['history']);
    events.length = 0;
    expect(() => record(true)({
      ...baseBundle,
      encore: { outfitId: 'older', name: 'older', itemIds: ['top', 'bottom', 'shoe'], candidateId: 'encore:older' },
    }, { settings: {} })).toThrowError('save failed');
    expect(events).toEqual(['history']);
  });

  it('rejects persisted Encore identity and eligibility mutations without reselecting', () => {
    const validate = evaluateAppsScript<(encore: object, snapshotValue: object, weatherValue: object) => boolean>(
      ['ItemIndex.gs', 'Taste.gs', 'FinalValidation.gs', 'Encore.gs'],
      'validPersistedEncoreV2_',
    );
    const encore = { outfitId: 'older', name: 'older', itemIds: ['top', 'bottom', 'shoe'], candidateId: 'encore:older' };
    expect(validate(encore, snapshot, weather)).toBe(true);

    [
      { ...encore, outfitId: 'newer' },
      { ...encore, name: 'tampered' },
      { ...encore, candidateId: 'encore:newer' },
      { ...encore, itemIds: ['bottom', 'top', 'shoe'] },
      { ...encore, itemIds: ['top', 'bottom', 'absent'] },
    ].forEach(mutated => expect(validate(mutated, snapshot, weather)).toBe(false));

    expect(validate(encore, {
      ...snapshot,
      tasteExamples: [{ ...snapshot.tasteExamples[0], source: 'ai' }, snapshot.tasteExamples[1]],
    }, weather)).toBe(false);
    expect(validate(encore, {
      ...snapshot,
      items: snapshot.items.map(item => item.id === 'top'
        ? { ...item, profile: { ...item.profile, available: false } }
        : item),
    }, weather)).toBe(false);
  });

  it('resumes and sends an already-persisted Encore without rebuilding or reselecting', () => {
    const persistedEncore = { outfitId: 'older', name: 'older', itemIds: ['top', 'bottom', 'shoe'], candidateId: 'encore:older' };
    const pending = { bundle: { localDate: weather.localDate, encore: persistedEncore } };
    const events: string[] = [];
    const properties = {
      getProperty: () => null,
      setProperty: (key: string) => events.push(`set:${key}`),
    };
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { ...daily, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => bundleSnapshot,
        loadSnapshotV2_: () => bundleSnapshot,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => weather.localDate,
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => properties,
        getBooleanPropertyV2_: () => false,
        loadJobStateV2_: () => ({
          stage: 'bundle-ready', qualityPolicyVersion: 3, localDate: weather.localDate,
          wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint, attemptCounts: {},
        }),
        validScheduledJobStateV2_: () => true,
        validScheduledStageResumeV2_: () => true,
        incrementAttemptV2_: () => undefined,
        loadPendingV2_: () => pending,
        validFullBundleReadyV2_: () => true,
        sendDailyBundleNowV2_: (bundle: { encore: unknown }) => {
          events.push('send');
          expect(bundle.encore).toBe(persistedEncore);
        },
        recordSentBundleV2_: (bundle: { encore: unknown }) => {
          events.push('history-saved');
          expect(bundle.encore).toBe(persistedEncore);
          properties.setProperty('LAST_ENCORE_DATE_V2');
        },
        saveJobStateV2_: () => { events.push('state'); },
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toEqual({ ok: true, stage: 'sent' });
    expect(events).toEqual([
      'send',
      'set:LAST_SENT_DATE_V2',
      'history-saved',
      'set:LAST_ENCORE_DATE_V2',
      'state',
    ]);
  });

  it('cannot reach history or cadence mutation after a scheduled send failure', () => {
    const events: string[] = [];
    const pending = { bundle: { localDate: weather.localDate, encore: { outfitId: 'older' } } };
    const scheduler = evaluateAppsScript<() => { ok: boolean; error: string }>(
      ['Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { ...daily, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => bundleSnapshot,
        loadSnapshotV2_: () => bundleSnapshot,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => weather.localDate,
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => events.push(`set:${key}`),
        }),
        getBooleanPropertyV2_: () => false,
        loadJobStateV2_: () => ({
          stage: 'bundle-ready', qualityPolicyVersion: 3, localDate: weather.localDate,
          wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint, attemptCounts: {},
        }),
        validScheduledJobStateV2_: () => true,
        validScheduledStageResumeV2_: () => true,
        incrementAttemptV2_: () => undefined,
        loadPendingV2_: () => pending,
        validFullBundleReadyV2_: () => true,
        sendDailyBundleNowV2_: () => { events.push('send'); throw new Error('mail failed'); },
        recordSentBundleV2_: () => { events.push('history'); events.push('set:LAST_ENCORE_DATE_V2'); },
        saveJobStateV2_: () => { events.push('state'); },
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toMatchObject({ ok: false, error: 'mail failed' });
    expect(events).toContain('send');
    expect(events).not.toContain('history');
    expect(events).not.toContain('set:LAST_SENT_DATE_V2');
    expect(events).not.toContain('set:LAST_ENCORE_DATE_V2');
  });

  it('sends a test email without sent-history or cadence mutation', () => {
    const events: string[] = [];
    const testBundle = {
      localDate: weather.localDate,
      wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint,
      weather: {
        ...weather,
        timezone: 'UTC', locationLabel: 'Test', highTemperatureF: 70,
        maxRainProbability: 0, weatherPhrase: 'clear', windy: false,
        plainEnglishSummary: 'Clear and mild.',
      },
      recommendations: ['easy', 'polished-casual', 'expressive'].map((archetype, index) => ({
        candidateId: `look-${index}`, archetype, name: `Look ${index}`, itemIds: [],
        colorHook: 'Specific color relationship for the generated look.',
        whyItWorks: 'Specific explanation for why this complete generated look works.',
        weatherNote: 'Comfortable for the forecast.',
      })),
      encore: { outfitId: 'older', name: 'older', itemIds: ['top', 'bottom', 'shoe'], candidateId: 'encore:older' },
    };
    const pending = { bundle: testBundle };
    const sendTest = evaluateAppsScript<() => void>(
      ['Email.gs'],
      'sendDailyTestEmailV2',
      {
        loadSnapshotV2_: () => bundleSnapshot,
        assertFreshSnapshotV2_: () => bundleSnapshot,
        getDailyConfigV2_: () => ({ recipientEmail: 'safe@example.com', appUrl: '', timezone: 'UTC' }),
        applySnapshotSettingsV2_: (value: unknown) => value,
        localDateV2_: () => weather.localDate,
        loadPendingV2_: () => pending,
        validFullBundleReadyV2_: () => true,
        itemMapV2_: () => Object.create(null),
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => events.push(`set:${key}`),
        }),
        Utilities: { formatDate: () => 'Tuesday, July 14' },
        MailApp: { sendEmail: () => events.push('mail') },
        recordSentBundleV2_: () => events.push('history'),
      },
    );

    sendTest();
    expect(events).toEqual(['mail']);
  });

  it('keeps a shadow-mode persisted Encore unsent without consuming cadence', () => {
    const events: string[] = [];
    const pending = { bundle: { localDate: weather.localDate, encore: { outfitId: 'older' } } };
    const scheduler = evaluateAppsScript<() => { ok: boolean; stage: string }>(
      ['Scheduler.gs'],
      'runDailyOutfitScheduler',
      {
        DAILY_V2: { ...daily, GENERATION_CUTOFF_HOUR: 8, MIN_EXECUTION_REMAINING_MS: 45_000 },
        DAILY_JOB_STAGES_V2_: ['idle', 'weather-ready', 'planners-ready', 'critic-ready', 'selection-ready', 'bundle-ready', 'sent', 'failed'],
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
        assertFreshSnapshotV2_: () => bundleSnapshot,
        loadSnapshotV2_: () => bundleSnapshot,
        applySnapshotSettingsV2_: () => ({ timezone: 'UTC', deliveryHour: 6, deliveryMinute: 45, generationLeadMinutes: 75 }),
        getDailyConfigV2_: () => ({ timezone: 'UTC' }),
        localDateV2_: () => weather.localDate,
        localMinutesV2_: () => 405,
        getDailyPropertiesV2_: () => ({
          getProperty: () => null,
          setProperty: (key: string) => events.push(`set:${key}`),
        }),
        getBooleanPropertyV2_: (key: string) => key === 'SHADOW_MODE',
        loadJobStateV2_: () => ({
          stage: 'bundle-ready', qualityPolicyVersion: 3, localDate: weather.localDate,
          wardrobeFingerprint: bundleSnapshot.wardrobeFingerprint, attemptCounts: {},
        }),
        validScheduledJobStateV2_: () => true,
        validScheduledStageResumeV2_: () => true,
        incrementAttemptV2_: () => undefined,
        loadPendingV2_: () => pending,
        sendDailyBundleNowV2_: () => events.push('send'),
        recordSentBundleV2_: () => events.push('history'),
        saveJobStateV2_: () => events.push('state'),
        sendOperationalAlertV2_: () => undefined,
        console: { error: () => undefined },
      },
    );

    expect(scheduler()).toEqual({ ok: true, stage: 'bundle-ready' });
    expect(events).toEqual([]);
  });

  it('never consumes cadence during generation, test email, failed send, or shadow-mode unsent work', () => {
    const scheduler = apps('Scheduler.gs');
    const email = apps('Email.gs');
    expect(scheduler.indexOf("setProperty('LAST_ENCORE_DATE_V2'")).toBe(-1);
    expect(email.indexOf("setProperty('LAST_ENCORE_DATE_V2'")).toBe(-1);
    const history = apps('JobState.gs');
    expect(history.indexOf("setProperty('LAST_ENCORE_DATE_V2'")).toBeGreaterThan(history.indexOf('saveHistoryV2_('));
  });
});

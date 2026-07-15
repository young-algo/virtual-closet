import type { DailyRecommendationProfileV2, DailySlot, DailySourceItem } from './types';

const TOPS = new Set(['T-Shirts', 'Polos', 'Long Sleeves', 'Jerseys', 'Shirts']);
const BOTTOMS = new Set(['Pants', 'Shorts']);
const LAYERS = new Set(['Sweatshirts', 'Hoodies', 'Outerwear', 'Jackets', 'Fleeces']);

export const dailySlotForItem = (item: Pick<DailySourceItem, 'category'>): DailySlot | null => {
  if (TOPS.has(item.category)) return 'top';
  if (BOTTOMS.has(item.category)) return 'bottom';
  if (LAYERS.has(item.category)) return 'layer';
  if (item.category === 'Sneakers') return 'shoes';
  return null;
};

const clamp = <T extends number>(value: number, min: T, max: T): T => Math.min(max, Math.max(min, value)) as T;

type ProfileHydratable = {
  id: string;
  dailyProfile?: Partial<DailyRecommendationProfileV2>;
};

export const fillManifestDailyProfiles = <T extends ProfileHydratable>(localItems: T[], manifestItems: T[]): T[] => {
  const manifestById = new Map(manifestItems.map(item => [item.id, item]));
  return localItems.map(item => {
    const manifest = manifestById.get(item.id);
    if (item.dailyProfile !== undefined || manifest?.dailyProfile === undefined) return item;
    return { ...item, dailyProfile: { ...manifest.dailyProfile } };
  });
};

export const categoryDefaultProfile = (item: DailySourceItem): DailyRecommendationProfileV2 => {
  const category = item.category;
  const color = item.color || 'unknown';
  const isShorts = category === 'Shorts';
  const isOuterwear = ['Outerwear', 'Jackets'].includes(category);
  const isWarmLayer = ['Hoodies', 'Fleeces', 'Sweatshirts'].includes(category);
  const isLightTop = ['T-Shirts', 'Polos', 'Jerseys', 'Shirts'].includes(category);
  const defaults: DailyRecommendationProfileV2 = {
    warmth: (isOuterwear ? 5 : isWarmLayer ? 4 : category === 'Long Sleeves' || category === 'Pants' ? 3 : 2),
    breathability: (isOuterwear ? 1 : isWarmLayer ? 2 : isShorts || isLightTop ? 4 : 3),
    rainSafety: category === 'Sneakers' ? 'unknown' : isOuterwear ? 'acceptable' : 'unknown',
    windProtection: isOuterwear ? 2 : isWarmLayer || category === 'Pants' ? 1 : 0,
    formality: category === 'Shirts' || category === 'Polos' ? 3 : category === 'Pants' ? 3 : 2,
    silhouette: 'unknown',
    patternIntensity: /graphic|pattern|stripe|floral|jersey|logo/i.test(`${item.name} ${item.description}`) ? 2 : 0,
    primaryColorFamily: color,
    available: true,
    excludedFromDaily: false,
    source: 'category-default',
    confidence: 0.55,
    updatedAt: Date.now()
  };
  const override = item.dailyProfile ?? {};
  const accentColors = Array.isArray(override.accentColors)
    ? override.accentColors
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(value => /^[a-z][a-z -]*$/i.test(value))
        .slice(0, 4)
    : undefined;
  return {
    ...defaults,
    ...override,
    warmth: clamp(Number(override.warmth ?? defaults.warmth), 1, 5),
    breathability: clamp(Number(override.breathability ?? defaults.breathability), 1, 5),
    formality: clamp(Number(override.formality ?? defaults.formality), 1, 5),
    windProtection: clamp(Number(override.windProtection ?? defaults.windProtection), 0, 2),
    patternIntensity: clamp(Number(override.patternIntensity ?? defaults.patternIntensity), 0, 2),
    accentColors,
    updatedAt: override.updatedAt ?? defaults.updatedAt
  };
};

export type DailySlot = 'top' | 'bottom' | 'layer' | 'shoes';
export type RainSafety = 'poor' | 'acceptable' | 'good' | 'unknown';
export type Silhouette = 'slim' | 'regular' | 'relaxed' | 'oversized' | 'unknown';
export type DailyArchetype = 'easy' | 'polished-casual' | 'expressive';

export interface DailyOutfitSettingsV2 {
  enabled: boolean;
  recipientEmail: string;
  locationQuery: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  deliveryHour: number;
  deliveryMinute: number;
  generationLeadMinutes: number;
  temperatureUnit: 'fahrenheit';
  coldSensitivity: -2 | -1 | 0 | 1 | 2;
  allowShoeReuseWhenNecessary: boolean;
  maxDailyHistoryDays: number;
  appsScriptUrl: string;
  syncSecret: string;
}

export interface DailyRecommendationProfileV2 {
  warmth: 1 | 2 | 3 | 4 | 5;
  breathability: 1 | 2 | 3 | 4 | 5;
  rainSafety: RainSafety;
  windProtection: 0 | 1 | 2;
  formality: 1 | 2 | 3 | 4 | 5;
  silhouette: Silhouette;
  patternIntensity: 0 | 1 | 2;
  primaryColorFamily: string;
  secondaryColorFamily?: string;
  accentColors?: string[];
  available: boolean;
  excludedFromDaily: boolean;
  source: 'category-default' | 'ai-inferred' | 'manual';
  confidence: number;
  updatedAt: number;
}

export interface DailySnapshotItemV2 {
  id: string;
  shortLabel: string;
  slot: DailySlot;
  name: string;
  brand: string;
  category: string;
  color: string;
  description: string;
  styleCode?: string;
  profile: DailyRecommendationProfileV2;
  thumbnailDataUrl: string;
  imageFingerprint: string;
}

export interface DailyAtlasPageV2 {
  pageId: string;
  slot: DailySlot;
  pageNumber: number;
  itemIds: string[];
  imageDataUrl: string;
  fingerprint: string;
}

export interface DailyFeedbackV2 {
  localDate: string;
  candidateId: string;
  value: 'liked' | 'disliked' | 'wore';
  reason?: 'too-warm' | 'too-cold' | 'too-formal' | 'too-casual' | 'colors' | 'silhouette' | 'shoes' | 'repeat' | 'other';
  note?: string;
  createdAt: number;
}

export interface DailyClosetSnapshotV2 {
  version: 2;
  generatedAt: number;
  wardrobeFingerprint: string;
  items: DailySnapshotItemV2[];
  atlasPages: DailyAtlasPageV2[];
  tasteExamples: Array<{
    id: string;
    name: string;
    itemIds: string[];
    source?: 'ai';
    seedStylist?: boolean;
    note?: string;
    createdAt: number;
  }>;
  dailyFeedback: DailyFeedbackV2[];
  settings: Omit<DailyOutfitSettingsV2, 'appsScriptUrl' | 'syncSecret'>;
}

export interface DailyWeatherProfileV2 {
  localDate: string;
  locationLabel: string;
  timezone: string;
  hourly: Array<{
    localHour: number;
    temperatureF: number;
    feelsLikeF: number;
    precipitationProbability: number;
    precipitationInches: number;
    humidity: number;
    windMph: number;
    gustMph: number;
    weatherCode: number;
  }>;
  morningFeelsLikeF: number;
  middayFeelsLikeF: number;
  eveningFeelsLikeF: number;
  minFeelsLikeF: number;
  maxFeelsLikeF: number;
  highTemperatureF: number;
  lowTemperatureF: number;
  maxRainProbability: number;
  totalPrecipitationInches: number;
  maxWindMph: number;
  maxGustMph: number;
  averageHumidity: number;
  rainExpected: boolean;
  windy: boolean;
  largeTemperatureSwing: boolean;
  layerGuidance: 'none' | 'optional' | 'recommended' | 'required';
  plainEnglishSummary: string;
  weatherPhrase: string;
  fetchedAt: number;
}

export interface DailyFinalRecommendationV2 {
  candidateId: string;
  archetype: DailyArchetype;
  name: string;
  itemIds: string[];
  colorHook: string;
  whyItWorks: string;
  weatherNote: string;
}

export type DailyRecommendationSetV2 =
  | [DailyFinalRecommendationV2]
  | [DailyFinalRecommendationV2, DailyFinalRecommendationV2]
  | [DailyFinalRecommendationV2, DailyFinalRecommendationV2, DailyFinalRecommendationV2];

export type DailyDeliveryModeV2 = 'complete' | 'partial';

export interface DailyBundleCoverageV2 {
  deliveryMode: DailyDeliveryModeV2;
  selectedArchetypes: DailyArchetype[];
  omittedArchetypes: DailyArchetype[];
}

export interface DailyEncoreV2 {
  outfitId: string;
  name: string;
  itemIds: string[];
  candidateId: string;
}

export interface DailyBundleV2 {
  version: 2;
  qualityPolicyVersion: number;
  localDate: string;
  weather: DailyWeatherProfileV2;
  coverage: DailyBundleCoverageV2;
  recommendations: DailyRecommendationSetV2;
  encore?: DailyEncoreV2;
  generatedAt: number;
  snapshotGeneratedAt: number;
  wardrobeFingerprint: string;
  modelRunId: string;
}

export interface DailyOutfitDiagnosticsV2 {
  snapshot: { ok: boolean; generatedAt: number; itemCount: number; atlasPageCount: number } | null;
  job: {
    localDate: string;
    qualityPolicyVersion: number;
    stage: string;
    startedAt?: number;
    updatedAt?: number;
  } | null;
  selection: {
    deliveryMode: DailyDeliveryModeV2;
    selectedCount: 1 | 2 | 3;
    selectedArchetypes: DailyArchetype[];
    omittedArchetypes: DailyArchetype[];
    eligibleCountByArchetype: Record<DailyArchetype, number>;
    path: 'top2' | 'top3' | 'replan-1' | 'replan-2';
    feasibleSetCount: number;
    replannedArchetypes: DailyArchetype[];
    replanRounds: Array<{
      round: 1 | 2;
      targetArchetype: DailyArchetype;
      acceptedCandidateCount: number;
      duplicateCandidateCount: number;
    }>;
    extremeHeatPolishedCasualActive: boolean;
    bundleReadyValidationPassed: boolean;
    recommendationSelectionOrderMatches: boolean;
    coverageSelectionOrderMatches: boolean;
  } | null;
  attemptCounts: Record<string, number>;
  lastSentDate: string | null;
  modelsConfigured: Record<string, boolean>;
  snapshotAgeHours: number | null;
}

export interface DailySyncStatusV2 {
  state: 'idle' | 'building' | 'syncing' | 'synced' | 'error';
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  wardrobeFingerprint?: string;
  itemCount?: number;
  atlasPageCount?: number;
  message?: string;
}

export interface DailyAtlasManifestV2 {
  version: 2;
  labelsByItemId: Record<string, string>;
  nextNumberBySlot: Record<DailySlot, number>;
  wardrobeFingerprint?: string;
  pageFingerprints: Record<string, string>;
}

export interface DailySourceItem {
  id: string;
  name: string;
  category: string;
  color: string;
  brand: string;
  image: string;
  description: string;
  styleCode?: string;
  dailyProfile?: Partial<DailyRecommendationProfileV2>;
}

export interface DailyTasteSource {
  id: string;
  name: string;
  itemIds: string[];
  source?: 'ai';
  seedStylist?: boolean;
  note?: string;
  createdAt: number;
}

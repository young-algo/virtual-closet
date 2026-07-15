// One-time placeholder-only dailyProfile enrichment for both wardrobe manifests.
//
// Usage:
//   GEMINI_API_KEY=... node scripts/enrich_daily_profiles.mjs [--dry-run] [--force]
//
// The script deliberately makes one sequential structured-output request per
// item. It writes neither manifest if any target fails validation or enrichment.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTS = [
  path.join(ROOT, 'src/data/closet.json'),
  path.join(ROOT, 'src/data/sneakers.json')
];
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODEL = 'gemini-3.5-flash';
const MAX_ATTEMPTS = 3;
const REQUEST_INTERVAL_MS = 300;
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};
const PROFILE_FIELDS = [
  'silhouette',
  'secondaryColorFamily',
  'accentColors',
  'patternIntensity',
  'formality',
  'warmth',
  'breathability',
  'windProtection'
];
const SILHOUETTES = new Set(['slim', 'regular', 'relaxed', 'oversized', 'unknown']);
const RAIN_SAFETY_VALUES = new Set(['poor', 'acceptable', 'good', 'unknown']);
const PLAIN_COLOR_NAME = /^[a-z][a-z -]*$/i;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    silhouette: { type: 'STRING', enum: [...SILHOUETTES] },
    secondaryColorFamily: { type: 'STRING' },
    accentColors: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 4 },
    patternIntensity: { type: 'INTEGER', minimum: 0, maximum: 2 },
    formality: { type: 'INTEGER', minimum: 1, maximum: 5 },
    warmth: { type: 'INTEGER', minimum: 1, maximum: 5 },
    breathability: { type: 'INTEGER', minimum: 1, maximum: 5 },
    windProtection: { type: 'INTEGER', minimum: 0, maximum: 2 },
    rainSafety: { type: 'STRING', enum: [...RAIN_SAFETY_VALUES] }
  },
  required: [
    'silhouette',
    'secondaryColorFamily',
    'accentColors',
    'patternIntensity',
    'formality',
    'warmth',
    'breathability',
    'windProtection',
    'rainSafety'
  ],
  propertyOrdering: [
    'silhouette',
    'secondaryColorFamily',
    'accentColors',
    'patternIntensity',
    'formality',
    'warmth',
    'breathability',
    'windProtection',
    'rainSafety'
  ]
};

const integerInRange = (value, field, min, max) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${field}: expected an integer from ${min} to ${max}`);
  }
  return value;
};

const plainColorName = (value, field) => {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}: expected a string`);
  const normalized = value.trim();
  if (!PLAIN_COLOR_NAME.test(normalized)) {
    throw new Error(`Invalid ${field}: expected a plain color name`);
  }
  return normalized;
};

export const sanitizeStructuredProfile = (value, category) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid structured profile: expected an object');
  }
  if (!SILHOUETTES.has(value.silhouette)) {
    throw new Error('Invalid silhouette');
  }
  if (!Array.isArray(value.accentColors) || value.accentColors.length > 4) {
    throw new Error('Invalid accentColors: expected an array with at most four entries');
  }
  const accentColors = value.accentColors.map((color, index) => plainColorName(color, `accentColors[${index}]`));
  if (!RAIN_SAFETY_VALUES.has(value.rainSafety)) {
    throw new Error('Invalid rainSafety');
  }
  if (category !== 'Sneakers' && value.rainSafety !== 'unknown') {
    throw new Error('Invalid rainSafety: non-shoes must use unknown');
  }

  return {
    silhouette: value.silhouette,
    secondaryColorFamily: plainColorName(value.secondaryColorFamily, 'secondaryColorFamily'),
    accentColors,
    patternIntensity: integerInRange(value.patternIntensity, 'patternIntensity', 0, 2),
    formality: integerInRange(value.formality, 'formality', 1, 5),
    warmth: integerInRange(value.warmth, 'warmth', 1, 5),
    breathability: integerInRange(value.breathability, 'breathability', 1, 5),
    windProtection: integerInRange(value.windProtection, 'windProtection', 0, 2),
    rainSafety: value.rainSafety
  };
};

const profileFieldsFor = category => category === 'Sneakers'
  ? [...PROFILE_FIELDS, 'rainSafety']
  : PROFILE_FIELDS;

export const mergeDailyProfile = (existingProfile, structuredValue, category, { force = false, now = Date.now() } = {}) => {
  const result = sanitizeStructuredProfile(structuredValue, category);
  const original = existingProfile && typeof existingProfile === 'object' ? existingProfile : {};
  const profile = { ...original };
  let changed = false;

  for (const field of profileFieldsFor(category)) {
    if (force || !hasOwn(profile, field)) {
      profile[field] = result[field];
      changed = true;
    }
  }

  if (!changed) return { profile: original, changed: false };
  if (force || !hasOwn(profile, 'source')) profile.source = 'ai-inferred';
  if (force || !hasOwn(profile, 'confidence')) profile.confidence = 0.75;
  profile.updatedAt = now;
  return { profile, changed: true };
};

export const resolvePublicImagePath = (publicPath, publicDir = PUBLIC_DIR) => {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/')) {
    throw new Error(`Invalid public image path: ${publicPath}`);
  }
  const root = path.resolve(publicDir);
  const resolved = path.resolve(root, publicPath.replace(/^\/+/, ''));
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Image path points outside public/: ${publicPath}`);
  }
  return resolved;
};

export const imagePathsFor = item => {
  if (typeof item?.image !== 'string' || !item.image) throw new Error('Item image path is missing');
  return item.imageTop ? [item.image, item.imageTop] : [item.image];
};

const imagePart = async publicPath => {
  const filePath = resolvePublicImagePath(publicPath);
  const mimeType = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image extension: ${publicPath}`);
  return {
    inlineData: {
      mimeType,
      data: (await readFile(filePath)).toString('base64')
    }
  };
};

const promptFor = item => [
  'Infer recommendation metadata only from the supplied wardrobe photographs.',
  `Item: ${item.brand || 'Unknown brand'} ${item.name}; category=${item.category}; listed color=${item.color || 'unknown'}.`,
  'secondaryColorFamily must be one plain visible color name; use unknown when no secondary color is visible.',
  'accentColors must contain zero to four plain visible color names for secondary trim or graphics.',
  'Use the numeric scales exactly: warmth/breathability/formality 1–5, windProtection 0–2, patternIntensity 0–2.',
  item.category === 'Sneakers'
    ? 'Judge rainSafety from visible materials: sealed leather is safer; knit, canvas, and suede are poor.'
    : 'Return rainSafety as unknown for non-shoes.',
  'Return only the structured profile.'
].join('\n');

export const shouldRetryStatus = (status, attempt) =>
  attempt < MAX_ATTEMPTS && (status === 429 || (status >= 500 && status <= 599));

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const callGemini = async (parts, apiKey) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA
    }
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    if (response.ok) {
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return JSON.parse(text);
    }
    if (shouldRetryStatus(response.status, attempt)) {
      await sleep(2000 * attempt);
      continue;
    }
    let detail = `HTTP ${response.status}`;
    try {
      detail = (await response.json())?.error?.message ?? detail;
    } catch {
      // Keep the status-only detail for malformed error responses.
    }
    throw new Error(`Gemini request failed: ${detail}`);
  }
  throw new Error('Gemini retry loop exited unexpectedly');
};

const needsEnrichment = (item, force) =>
  force || profileFieldsFor(item.category).some(field => !hasOwn(item.dailyProfile ?? {}, field));

export const shouldWriteManifests = ({ dryRun, failed, enriched }) =>
  !dryRun && failed === 0 && enriched > 0;

const loadManifests = async () => Promise.all(MANIFESTS.map(async file => {
  const items = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(items)) throw new Error(`Manifest is not an array: ${file}`);
  return { file, items };
}));

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  const manifests = await loadManifests();
  const targets = manifests
    .flatMap(manifest => manifest.items.map(item => ({ manifest, item })))
    .filter(({ item }) => needsEnrichment(item, force));
  const total = manifests.reduce((sum, manifest) => sum + manifest.items.length, 0);
  console.log(`${total} items in manifests; ${targets.length} to enrich${dryRun ? ' (dry run)' : ''}.`);

  let enriched = 0;
  let failed = 0;
  for (const [index, { item }] of targets.entries()) {
    process.stdout.write(`${item.id} … `);
    try {
      const imageParts = await Promise.all(imagePathsFor(item).map(imagePart));
      const rawResult = await callGemini([{ text: promptFor(item) }, ...imageParts], apiKey);
      const { profile, changed } = mergeDailyProfile(item.dailyProfile, rawResult, item.category, { force });
      if (changed) {
        item.dailyProfile = profile;
        enriched += 1;
      }
      console.log(`${profile.silhouette} | ${profile.secondaryColorFamily} | ${(profile.accentColors ?? []).join(', ')}`);
    } catch (error) {
      failed += 1;
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (index < targets.length - 1) await sleep(REQUEST_INTERVAL_MS);
  }

  if (shouldWriteManifests({ dryRun, failed, enriched })) {
    await Promise.all(manifests.map(manifest =>
      writeFile(manifest.file, `${JSON.stringify(manifest.items, null, 2)}\n`)
    ));
  }
  if (failed > 0) process.exitCode = 1;
  console.log(`Done: ${enriched} enriched, ${failed} failed${dryRun ? ', nothing written' : ''}.`);
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

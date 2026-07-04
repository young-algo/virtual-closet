// One-time AI enrichment pass for src/data/sneakers.json.
//
// Sneakers ship with placeholder metadata (name = style code, blank color and
// description), which leaves the AI stylist judging shoes from thumbnails
// alone. This script sends each sneaker's photos + style code to Gemini and
// fills in name, color, and description — but only fields that are still
// untouched placeholders, so manual edits (in the JSON or re-runs) are never
// clobbered. Use --force to regenerate everything, --dry-run to preview.
//
// Usage:
//   GEMINI_API_KEY=... node scripts/enrich_sneakers.mjs [--dry-run] [--force]
//
// The key is the same one stored in the app (localStorage "gemini_api_key").
// Review the diff in src/data/sneakers.json afterwards and edit freely — the
// app treats these as suggestions you own, not ground truth.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'sneakers.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODEL = 'gemini-3.5-flash';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Run: GEMINI_API_KEY=... node scripts/enrich_sneakers.mjs');
  process.exit(1);
}

const MIME_BY_EXT = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const imagePart = async (publicPath) => {
  const filePath = path.join(PUBLIC_DIR, publicPath);
  const mimeType = MIME_BY_EXT[path.extname(publicPath).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image extension: ${publicPath}`);
  const data = (await readFile(filePath)).toString('base64');
  return { inlineData: { mimeType, data } };
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    color: { type: 'STRING' },
    description: { type: 'STRING' }
  },
  required: ['name', 'color', 'description'],
  propertyOrdering: ['name', 'color', 'description']
};

const promptFor = (sneaker) => (
  `You are cataloging a personal sneaker collection for an AI stylist. ` +
  `This is a ${sneaker.brand || 'Nike'} sneaker, style code ${sneaker.styleCode}. ` +
  `The photos show a profile view${sneaker.imageTop ? ' and a top-down view' : ''}. ` +
  `If you recognize this exact style code, use its official model and colorway name; ` +
  `otherwise describe what you see and keep the name generic (never invent a colorway name). Return:\n` +
  `- name: model + colorway, e.g. "Air Max 90 Infrared" (max ~5 words)\n` +
  `- color: the palette, dominant color first, comma-separated, e.g. "white, university red, black"\n` +
  `- description: 1-2 sentences covering silhouette, materials, and colorway, ending with the styling ` +
  `vibe — what kinds of outfits it anchors (e.g. "reads clean and versatile; suits smart-casual looks").`
);

const callGemini = async (parts) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (response.ok) {
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return JSON.parse(text);
    }
    // Back off on rate limits / transient server errors; fail fast otherwise.
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const waitMs = 2000 * attempt;
      console.warn(`  HTTP ${response.status} — retrying in ${waitMs / 1000}s…`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    let detail = `HTTP ${response.status}`;
    try { detail = (await response.json())?.error?.message ?? detail; } catch { /* keep status */ }
    throw new Error(`Gemini request failed: ${detail}`);
  }
};

const sneakers = JSON.parse(await readFile(DATA_PATH, 'utf8'));

// Untouched placeholders only, unless --force: name still equals the style
// code, or blank color/description. Same rule the app uses when merging
// manifest updates over localStorage.
const needsEnrichment = (s) =>
  FORCE || s.name === s.styleCode || !s.color || !s.description;

const targets = sneakers.filter(needsEnrichment);
console.log(`${sneakers.length} sneakers in manifest; ${targets.length} to enrich${DRY_RUN ? ' (dry run)' : ''}.`);

let enriched = 0;
let failed = 0;

for (const sneaker of targets) {
  process.stdout.write(`${sneaker.styleCode} … `);
  try {
    const parts = [{ text: promptFor(sneaker) }, await imagePart(sneaker.image)];
    if (sneaker.imageTop) parts.push(await imagePart(sneaker.imageTop));
    const result = await callGemini(parts);

    if (FORCE || sneaker.name === sneaker.styleCode) sneaker.name = result.name;
    if (FORCE || !sneaker.color) sneaker.color = result.color;
    if (FORCE || !sneaker.description) sneaker.description = result.description;
    enriched++;
    console.log(`${sneaker.name} | ${sneaker.color}`);
  } catch (e) {
    failed++;
    console.log(`FAILED: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 300));
}

if (!DRY_RUN && enriched > 0) {
  await writeFile(DATA_PATH, JSON.stringify(sneakers, null, 2) + '\n');
  console.log(`\nWrote ${DATA_PATH}`);
}
console.log(`Done: ${enriched} enriched, ${failed} failed${DRY_RUN ? ', nothing written (dry run)' : ''}.`);
if (failed > 0) console.log('Re-run the script to retry failures — already-enriched pairs are skipped.');

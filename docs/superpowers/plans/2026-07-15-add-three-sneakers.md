# Add Three Sneakers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supplied Nike C1TY "Surplus," Air Jordan 4 Retro "Bred," and Nike Air Max Plus "Hyper Blue" pairs to the portable sneaker catalog with side/top images and complete outfit-planning metadata.

**Architecture:** Keep the existing manifest-driven sneaker architecture unchanged. Copy the six supplied PNG assets into the versioned `public/sneakers/` namespace and append three stable style-code-based records to `src/data/sneakers.json`; the existing `App.tsx` merge logic will surface the new IDs in both fresh and existing browser storage.

**Tech Stack:** JSON catalog data, static PNG assets, React 19, TypeScript 6, Vite 8, Vitest, oxlint, npm.

## Global Constraints

- Add exactly three sneaker records and six PNG assets.
- Use IDs `sneaker_FZ3863-300`, `sneaker_308497-060`, and `sneaker_DX0755-001`.
- Map each `PHSLH000` file to `<style-code>_A.png` and each `PHCTH001` file to `<style-code>_D.png`.
- Do not modify application behavior, existing catalog records, outfits, deletion tombstones, `package.json`, or `.pnpm-store/`.
- Preserve byte-for-byte copies of the supplied product images.
- Finish with 44 unique sneaker IDs and 44 unique style codes.
- Treat missing assets, malformed JSON, duplicate IDs/style codes, build failures, or missing browser cards/views as integration failures.

## File Structure

- Create `public/sneakers/FZ3863-300_A.png`: Nike C1TY side view.
- Create `public/sneakers/FZ3863-300_D.png`: Nike C1TY top view.
- Create `public/sneakers/308497-060_A.png`: Air Jordan 4 side view.
- Create `public/sneakers/308497-060_D.png`: Air Jordan 4 top view.
- Create `public/sneakers/DX0755-001_A.png`: Nike Air Max Plus side view.
- Create `public/sneakers/DX0755-001_D.png`: Nike Air Max Plus top view.
- Modify `src/data/sneakers.json`: append three `SneakerItem` records with daily recommendation profiles.
- No application or test source files change; the approved catalog-only test exception uses pre/post data-contract commands plus the existing test suite.

---

### Task 1: Integrate and Verify the Portable Sneaker Records

**Files:**
- Create: `public/sneakers/FZ3863-300_A.png`
- Create: `public/sneakers/FZ3863-300_D.png`
- Create: `public/sneakers/308497-060_A.png`
- Create: `public/sneakers/308497-060_D.png`
- Create: `public/sneakers/DX0755-001_A.png`
- Create: `public/sneakers/DX0755-001_D.png`
- Modify: `src/data/sneakers.json`
- Verify: `src/App.tsx:81-131`

**Interfaces:**
- Consumes: `SneakerItem` fields `id`, `name`, `category`, `color`, `brand`, `image`, `description`, `styleCode`, `imageTop`, and optional `dailyProfile` from `src/components/SneakerGrid.tsx` and `src/features/daily-outfits/types.ts`.
- Produces: three manifest records whose `image` and `imageTop` URLs resolve under Vite's `/sneakers/` public path and whose IDs are merged into existing `sneaker_items` storage by `src/App.tsx`.

- [x] **Step 1: Run the preflight contract and confirm the additions are absent**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const items=JSON.parse(fs.readFileSync('src/data/sneakers.json','utf8')); const codes=['FZ3863-300','308497-060','DX0755-001']; const found=items.filter(item=>codes.includes(item.styleCode)); if(found.length!==0) throw new Error('target style code already exists'); if(items.length!==41) throw new Error('expected 41 starting pairs, got '+items.length); console.log('RED: 3 target style codes absent from 41-pair catalog');"
```

Expected: `RED: 3 target style codes absent from 41-pair catalog`.

Also run:

```bash
file "/Users/kevinturner/Downloads/Archive 2/FZ3863-300_PHSLH000_FZ3863-300-PHSLH000-GTM-A.PNG" "/Users/kevinturner/Downloads/Archive 2/FZ3863-300_PHCTH001_FZ3863-300-PHCTH001-GTM-A.PNG" "/Users/kevinturner/Downloads/Archive 2/308497-060_PHSLH000_308497-060-PHSLH000-GTM-A.PNG" "/Users/kevinturner/Downloads/Archive 2/308497-060_PHCTH001_308497-060-PHCTH001-GTM-A.PNG" "/Users/kevinturner/Downloads/Archive 2/DX0755-001_PHSLH000_DX0755-001-PHSLH000-GTM-A.PNG" "/Users/kevinturner/Downloads/Archive 2/DX0755-001_PHCTH001_DX0755-001-PHCTH001-GTM-A.PNG"
```

Expected: six readable PNG image reports.

- [x] **Step 2: Copy the supplied side and top images to stable catalog paths**

Run:

```bash
cp "/Users/kevinturner/Downloads/Archive 2/FZ3863-300_PHSLH000_FZ3863-300-PHSLH000-GTM-A.PNG" public/sneakers/FZ3863-300_A.png
cp "/Users/kevinturner/Downloads/Archive 2/FZ3863-300_PHCTH001_FZ3863-300-PHCTH001-GTM-A.PNG" public/sneakers/FZ3863-300_D.png
cp "/Users/kevinturner/Downloads/Archive 2/308497-060_PHSLH000_308497-060-PHSLH000-GTM-A.PNG" public/sneakers/308497-060_A.png
cp "/Users/kevinturner/Downloads/Archive 2/308497-060_PHCTH001_308497-060-PHCTH001-GTM-A.PNG" public/sneakers/308497-060_D.png
cp "/Users/kevinturner/Downloads/Archive 2/DX0755-001_PHSLH000_DX0755-001-PHSLH000-GTM-A.PNG" public/sneakers/DX0755-001_A.png
cp "/Users/kevinturner/Downloads/Archive 2/DX0755-001_PHCTH001_DX0755-001-PHCTH001-GTM-A.PNG" public/sneakers/DX0755-001_D.png
```

- [x] **Step 3: Verify all destination assets are byte-identical to their sources**

Run:

```bash
cmp "/Users/kevinturner/Downloads/Archive 2/FZ3863-300_PHSLH000_FZ3863-300-PHSLH000-GTM-A.PNG" public/sneakers/FZ3863-300_A.png
cmp "/Users/kevinturner/Downloads/Archive 2/FZ3863-300_PHCTH001_FZ3863-300-PHCTH001-GTM-A.PNG" public/sneakers/FZ3863-300_D.png
cmp "/Users/kevinturner/Downloads/Archive 2/308497-060_PHSLH000_308497-060-PHSLH000-GTM-A.PNG" public/sneakers/308497-060_A.png
cmp "/Users/kevinturner/Downloads/Archive 2/308497-060_PHCTH001_308497-060-PHCTH001-GTM-A.PNG" public/sneakers/308497-060_D.png
cmp "/Users/kevinturner/Downloads/Archive 2/DX0755-001_PHSLH000_DX0755-001-PHSLH000-GTM-A.PNG" public/sneakers/DX0755-001_A.png
cmp "/Users/kevinturner/Downloads/Archive 2/DX0755-001_PHCTH001_DX0755-001-PHCTH001-GTM-A.PNG" public/sneakers/DX0755-001_D.png
```

Expected: all six commands exit 0 without output.

- [x] **Step 4: Append the three complete manifest records**

Append these objects to the top-level array in `src/data/sneakers.json`:

```json
{
  "id": "sneaker_FZ3863-300",
  "name": "Nike C1TY Surplus",
  "category": "Sneakers",
  "color": "light army, cargo khaki, university gold, black",
  "brand": "Nike",
  "image": "/sneakers/FZ3863-300_A.png",
  "description": "This low-top utility sneaker pairs breathable Light Army mesh with Cargo Khaki suede reinforcements, a black Swoosh and rugged lugged sole, plus University Gold hits at the heel and tongue. Its muted military palette reads practical and understated; suits workwear, utility streetwear, and relaxed casual looks.",
  "styleCode": "FZ3863-300",
  "imageTop": "/sneakers/FZ3863-300_D.png",
  "dailyProfile": {
    "silhouette": "regular",
    "secondaryColorFamily": "black",
    "accentColors": ["yellow"],
    "patternIntensity": 0,
    "formality": 1,
    "warmth": 2,
    "breathability": 4,
    "windProtection": 1,
    "rainSafety": "poor",
    "source": "ai-inferred",
    "confidence": 0.75,
    "updatedAt": 1784172655000
  }
}
```

```json
{
  "id": "sneaker_308497-060",
  "name": "Air Jordan 4 Retro Bred",
  "category": "Sneakers",
  "color": "black, fire red, cement grey, summit white",
  "brand": "Nike",
  "image": "/sneakers/308497-060_A.png",
  "description": "This iconic mid-top uses a black nubuck upper with Cement Grey hardware, Summit White midsole sections, and Fire Red branding and outsole accents. The high-contrast OG palette reads bold and nostalgic; suits retro basketball, sportswear, and statement streetwear looks.",
  "styleCode": "308497-060",
  "imageTop": "/sneakers/308497-060_D.png",
  "dailyProfile": {
    "silhouette": "regular",
    "secondaryColorFamily": "grey",
    "accentColors": ["red", "white"],
    "patternIntensity": 1,
    "formality": 1,
    "warmth": 2,
    "breathability": 2,
    "windProtection": 1,
    "rainSafety": "poor",
    "source": "ai-inferred",
    "confidence": 0.75,
    "updatedAt": 1784172655000
  }
}
```

```json
{
  "id": "sneaker_DX0755-001",
  "name": "Nike Air Max Plus Hyper Blue",
  "category": "Sneakers",
  "color": "black, chamois, sky blue, hyper blue, midnight navy, white",
  "brand": "Nike",
  "image": "/sneakers/DX0755-001_A.png",
  "description": "This retro runner fades from Sky Blue to Hyper Blue across breathable mesh under black palm-inspired TPU ribs, with Midnight Navy, white, and Chamois yellow accents. Its sculpted Tuned Air sole and vivid gradient read energetic and technical; suits late-90s sportswear, techwear, and bold casual looks.",
  "styleCode": "DX0755-001",
  "imageTop": "/sneakers/DX0755-001_D.png",
  "dailyProfile": {
    "silhouette": "regular",
    "secondaryColorFamily": "black",
    "accentColors": ["yellow", "white"],
    "patternIntensity": 1,
    "formality": 1,
    "warmth": 2,
    "breathability": 4,
    "windProtection": 1,
    "rainSafety": "poor",
    "source": "ai-inferred",
    "confidence": 0.75,
    "updatedAt": 1784172655000
  }
}
```

- [x] **Step 5: Run the passing catalog and asset contract**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const items=JSON.parse(fs.readFileSync('src/data/sneakers.json','utf8')); const codes=['FZ3863-300','308497-060','DX0755-001']; const ids=new Set(items.map(item=>item.id)); const styleCodes=new Set(items.map(item=>item.styleCode)); if(items.length!==44) throw new Error('expected 44 pairs, got '+items.length); if(ids.size!==44) throw new Error('duplicate sneaker id'); if(styleCodes.size!==44) throw new Error('duplicate style code'); for(const code of codes){const item=items.find(candidate=>candidate.styleCode===code); if(!item) throw new Error('missing '+code); for(const key of ['id','name','category','color','brand','image','description','styleCode','imageTop','dailyProfile']) if(!item[key]) throw new Error(code+' missing '+key); for(const url of [item.image,item.imageTop]) if(!fs.existsSync('public'+url)) throw new Error('missing asset '+url);} console.log('GREEN: 44 unique sneaker records; 3 additions have complete metadata and 6 assets');"
```

Expected: `GREEN: 44 unique sneaker records; 3 additions have complete metadata and 6 assets`.

- [x] **Step 6: Run repository verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: tests, lint, and build exit 0; `git diff --check` emits no output.

- [x] **Step 7: Verify the clean-origin browser experience**

Run the Vite development server on a fresh origin:

```bash
npm run dev -- --host 127.0.0.1 --port 5176
```

Open `http://127.0.0.1:5176/`, switch to Sneakers, and verify:

- The header reports `44 pairs`.
- Searching `FZ3863-300`, `308497-060`, and `DX0755-001` returns exactly one matching card each.
- Each card renders the expected side image.
- Opening each detail dialog permits switching to the supplied top image without a broken image.
- The existing sneaker cards remain present.

- [x] **Step 8: Review scope and commit only the catalog integration**

Run:

```bash
git status --short
git diff -- src/data/sneakers.json
git add src/data/sneakers.json public/sneakers/FZ3863-300_A.png public/sneakers/FZ3863-300_D.png public/sneakers/308497-060_A.png public/sneakers/308497-060_D.png public/sneakers/DX0755-001_A.png public/sneakers/DX0755-001_D.png docs/superpowers/plans/2026-07-15-add-three-sneakers.md
git diff --cached --check
git commit -m "data: add three sneaker pairs"
```

Expected: only the plan, three catalog records, and six images are committed; `package.json` and `.pnpm-store/` remain unstaged.

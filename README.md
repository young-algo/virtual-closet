# Virtual Closet

A web application designed for organizing your wardrobe, planning outfits, and packing for trips. Built with a focus on sleek utility, minimal elegance, and restrained geometric design inspired by the classic Shaker Wardrobe concept.

## Features

- **Shaker-Inspired Closet Grid**: A light-mode, geometric, structured display showcasing your garments in an elegant flat-lay design.
- **Trip Packing Assistant**: Add clothing items to your active suitcase and track your packing status. Features delightful feedback milestone celebrations (like ✈️ Ready for takeoff!) when fully packed.
- **Smart Uploader Pipeline**:
  - Background removal using local `@imgly/background-removal` WASM.
  - Automated clothing tagging using **Gemini 3.1 Flash Lite Image** (extracts brand, name, category, color, and description).
  - Optional generative flattening & wrinkle-smoothing using **Imagen 4** (`imagen-4.0-generate-001`) to generate professional, wrinkle-free flat-lays on solid white backgrounds.
- **Interactive Details Dialog**: View or edit garment metadata (category, color, brand, description) and safely delete items from your closet with inline confirmation dialogs.
- **Local Storage Caching**: Persistent browser caching that safely merges server-side updates with your current packing list progress.
- **Portable Backups**: Download and restore the complete closet, including local photos, metadata edits, deletions, sneakers, outfits, and packing state.

To promote a downloaded backup into the versioned defaults used by every fresh clone:

```bash
node scripts/import_backup.mjs /path/to/virtual-closet-backup.json
```

## Tech Stack

- **Frontend**: React, Vite, TypeScript
- **Styling**: Vanilla CSS (TailwindCSS avoided for custom layout details)
- **AI Integration**: Google Gemini API (`gemini-3.1-flash-lite-image` and `imagen-4.0-generate-001`)
- **Graphics & Icons**: Lucide React

## Setup & Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Dev Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5174](http://localhost:5174) in your browser.

3. **Configure API Key**:
   Provide your Gemini API Key in the settings drawer in the web interface to enable automated AI tagging and generative flat-lay wrinkle-smoothing.

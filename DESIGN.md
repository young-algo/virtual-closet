---
name: Wardrobe
description: A clean, minimal utility closet system built on Shaker-inspired craft.
colors:
  primary: "#4a6b5d"
  neutral-bg: "#faf9f5"
  neutral-surface: "#ffffff"
  border: "#e4e2db"
  text-primary: "#1e2022"
  text-secondary: "#5c6065"
  text-muted: "#8c9096"
  accent-muted: "#f0f4f2"
  error: "#ff6b6b"
typography:
  display:
    fontFamily: "Outfit, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.5rem, 5vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Outfit, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#3b5549"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.border}"
---

# Design System: Wardrobe

## 1. Overview

**Creative North Star: "The Shaker Wardrobe"**

A design system focused on minimal elegance, utility, and refined craftsmanship. It draws inspiration from Shaker design principles: simplicity, utility, and clear organization. The interface is characterized by generous light space, fine slate borders, and natural sage highlights, completely avoiding visual clutter and flashy tech effects.

**Key Characteristics:**
- Clean linen backgrounds with paper-white cards and slate borders.
- Muted sage accents used selectively to draw attention.
- Crisp, geometric typography matching the Outfit font.
- Subtly layered depth: surfaces remain flat at rest, with soft, ambient lift shadows on hover states.

## 2. Colors

A natural, restrained light palette optimized for legibility and aesthetic calm.

### Primary
- **Sage Green** (#4a6b5d): The primary brand identifier. Used for active indicators, checkboxes, and highlight tags.

### Neutral
- **Linen Background** (#faf9f5): A warm, off-white background color that reduces screen glare and feels natural.
- **Paper Surface** (#ffffff): Clean white backdrop for interactive elements and detail panels.
- **Slate Ink** (#1e2022): High-contrast typography color for optimal body text legibility.
- **Warm Border** (#e4e2db): Delicate outline color separating grid spaces.

### Named Rules
**The Sage Ratio Rule.** Muted green is reserved for active actions and packed confirmations only. Its use must not exceed 10% of any view to preserve focus.

## 3. Typography

**Display Font:** Outfit (with system-ui fallback)
**Body Font:** Outfit (with system-ui fallback)

A single clean, geometric font family in varied weights provides structured visual hierarchy without font clash.

### Hierarchy
- **Display** (600, clamp(1.5rem, 5vw, 2.5rem), 1.2): Main header titles.
- **Headline** (600, 1.4rem, 1.3): Subsection headers.
- **Title** (500, 1.1rem, 1.3): Garment names and cards.
- **Body** (400, 1rem, 1.5): Standard settings, description blocks.
- **Label** (600, 0.75rem, 0.05em spacing): Eye-brows and tiny specs.

## 4. Elevation

The interface conveys structure primarily through fine borders. Depth is flat by default, lifting slightly during interactions.

### Shadow Vocabulary
- **Ambient Lift** (`box-shadow: 0 8px 24px rgba(0,0,0,0.04)`): Applied only on card hover and open dialog containers.

### Named Rules
**The Flat-at-Rest Rule.** All cards and layers remain flush with the background until hovered or clicked, ensuring a clean, quiet layout.

## 5. Components

### Buttons
- **Shape:** Crisp, rectangular corners (4px radius).
- **Primary:** Sage Green (#4a6b5d) with white text.
- **Secondary / Ghost:** Transparent with a warm border (#e4e2db) and Slate Ink text.

### Cards / Containers
- **Corner Style:** Medium radius (8px).
- **Background:** Paper Surface (#ffffff) with fine borders.
- **Shadow Strategy:** Hover states transition smoothly to Ambient Lift.

### Inputs / Fields
- **Style:** Light warm surface, thin border, clear focus outlines.

## 6. Do's and Don'ts

### Do:
- **Do** maintain a strict light-mode background color schema.
- **Do** verify that text maintains high contrast against background surfaces.
- **Do** require a user confirmation step before deleting checklist progress.

### Don't:
- **Don't** use neon colors, glowing dropshadows, or high-density grids.
- **Don't** animate layouts directly; animate transforms (such as scaleX for progress bars).
- **Don't** mix languages or use placeholder content in the visual interface.

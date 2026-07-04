---
name: Wardrobe
description: An elegant monochrome closet system — one continuous white field, hairline rules, tracked-caps type.
colors:
  primary: "#111111"
  neutral-bg: "#ffffff"
  neutral-surface: "#ffffff"
  surface-hover: "#fafafa"
  well: "#f6f6f6"
  border: "#e6e6e6"
  border-strong: "#111111"
  text-primary: "#111111"
  text-secondary: "#5c5c5c"
  text-muted: "#969696"
  accent-muted: "#f6f6f6"
  scrim: "rgba(17, 17, 17, 0.35)"
  error: "#b3261e"
  error-bg: "rgba(179, 38, 30, 0.05)"
  error-border: "rgba(179, 38, 30, 0.25)"
typography:
  display:
    fontFamily: "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 500
    letterSpacing: "0.12em"
    textTransform: uppercase
  data:
    fontFamily: "IBM Plex Mono, SF Mono, Menlo, monospace"
    fontSize: "0.65rem"
    fontWeight: 500
    letterSpacing: "0.1em"
    textTransform: uppercase
rounded:
  sm: "0px"
  md: "0px"
  lg: "0px"
  full: "0px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
    fontFamily: "{typography.control.fontFamily}"
    textTransform: uppercase
    letterSpacing: "0.12em"
  button-primary-hover:
    backgroundColor: "#000000"
  product-cell:
    backgroundColor: transparent
    border: none
    imageWell: "{colors.well}"
  field:
    border: none
    borderBottom: "1px solid {colors.border}"
    background: transparent
---

# Design System: Wardrobe

## 1. Overview

**Creative North Star: "The Continuous Field"**

A monochrome system modeled on luxury fashion retail and Swiss editorial design: one uninterrupted white plane, structured entirely by hairline rules, whitespace, and typographic scale. There are no panels, cards, or boxes floating on a canvas — content sits directly on the field, and the only grey surfaces are the soft wells that garments are photographed against.

**Key Characteristics:**
- A single white field. Sections are separated by hairline rules and generous whitespace, never by background changes or containers.
- Soft grey wells (#f6f6f6) exclusively as plinths for garment imagery.
- Near-black (#111111) as the only accent: filled CTAs, active tabs, sharpened rules.
- Quiet tracked-caps controls; large light display type; monospace reserved for fine data.
- Zero border radius, zero shadows (modal layer excepted), zero decoration.

## 2. Colors

### Ink & Field
- **Ink** (#111111): Text, filled CTAs, active states, sharpened rules. The brand color.
- **Field** (#ffffff): The entire interface surface.
- **Well** (#f6f6f6): Grey plinth behind garment photography and build-mode panels. The only grey surface.

### Greys
- **Mid Grey** (#5c5c5c): Secondary text.
- **Light Grey** (#969696): Muted text, placeholders, inactive tabs.
- **Hairline** (#e6e6e6): All rules and borders.
- **Scrim** (rgba(17, 17, 17, 0.35)): Modal backdrop.

### Functional Red
- **Error Red** (#b3261e): Destructive actions and validation only, with tints rgba(179, 38, 30, 0.05) (background) and rgba(179, 38, 30, 0.25) (border).

### Named Rules
**The Continuous Field Rule.** The background never changes color to group content. Grouping is expressed with hairline rules and whitespace. If a region seems to need a background tint, it needs a rule and more space instead. (Exception: the Well, below.)

**The Well Rule.** #f6f6f6 appears only as a plinth under imagery — product photos, thumbnails, upload previews — and the outfit build panel. It never backs text-only content.

**The Monochrome Rule.** No chromatic color except Error Red, and Error Red only marks destruction or failure.

## 3. Typography

**Display & Body:** Archivo (neo-grotesque; Helvetica Neue fallback)
**Data:** IBM Plex Mono — fine print only

Four voices, strictly cast:
- **Display** (Archivo 400, 2–3rem, -0.02em): Page titles. Large, light, tight.
- **Body** (Archivo 400, 0.85–0.95rem): Names, descriptions, prose.
- **Control** (Archivo 500, 0.68rem, uppercase, 0.12em tracking): Every button, tab, and CTA. Quiet tracked caps — never bold, never large.
- **Data** (IBM Plex Mono 500, 0.65rem, uppercase, 0.1em tracking): Brands, categories, counts, form labels — strings that behave like archive metadata.

### Named Rules
**The Tracking-for-Weight Rule.** Emphasis comes from letterspacing, case, and scale — not boldness. Nothing in the interface exceeds weight 600, and 600 is reserved for the wordmark and section eyebrows.

**The Fine-Print Rule.** Monospace is a garment-tag voice: tiny, tracked, uppercase, muted. If a string is bigger than 0.8rem, it is not set in mono.

## 4. Elevation & Structure

Flat, always. Structure is drawn with three devices and nothing else:
1. **Hairline rules** (#e6e6e6, 1px) — section boundaries, list row separators, field underlines.
2. **Whitespace** — 48px+ between sections; product grids gap 28–48px.
3. **The Well** — grey plinths that let garments read as objects.

- **No shadows** at rest or on hover. The single permitted shadow (`0 32px 80px rgba(0,0,0,0.14)`) belongs to dialogs above the scrim.
- **Hover feedback:** rules and borders sharpen to black; product imagery scales to 1.04 inside its well. Nothing lifts or glows.

## 5. Components

### Buttons
- **Primary:** Ink fill, white text, Control voice, 12–14px vertical padding. Hover deepens to #000.
- **Secondary:** 1px ink border, transparent fill, Control voice.
- **Tertiary:** Underlined text in Control voice (e.g. "Clear").
- **Destructive:** Error Red fill for confirm steps; Error Red text on error-bg tint for initial steps.

### Product Cells
- **No card chrome.** A grey well (1:1) holding the image, then brand (Data voice), name (Body), color (Data voice, muted) directly on the field.
- **Hover:** image scales 1.04. Selection (outfit building): 1px ink outline offset 6px from the cell.

### Sneaker Cells
- Same anatomy as product cells, catalogued in the archive voice: brand (Data) left, **style code** (Data, muted) right, name (Body) below. Colorway appears only once entered.
- **Two-view hover:** the well cross-fades from the lateral view to the top-down view on hover (opacity only, 0.35s), alongside the standard 1.04 scale. Pairs with a single view simply scale.
- The closet switcher ("Closet / Sneakers") is typographic navigation: two Display-voice words, active in Ink, inactive in Light Grey. No tabs, rules, or boxes.

### Inputs / Fields
- **Underlines, never boxes.** No side or top borders, transparent background, hairline bottom rule that sharpens to black on focus.
- Form labels in Data voice.

### Indicators
- Square, never circular. Checked = black fill, white check; unchecked = hairline or black outline.
- Progress = a 2px rule: hairline track, black fill, scaleX transform.

## 6. Do's and Don'ts

### Do:
- **Do** keep the field white edge to edge; separate regions with hairline rules and whitespace.
- **Do** set every control in quiet tracked caps (Control voice) and every piece of metadata in fine mono (Data voice).
- **Do** let garment photography carry the visual interest; the interface recedes.
- **Do** require a confirmation step before destructive actions.

### Don't:
- **Don't** place bordered white panels or "cards" on the field — no boxes-in-boxes, no dashed-border zones.
- **Don't** use grey as a text background or page canvas; grey belongs to image wells only.
- **Don't** round corners, add shadows, use emoji, or introduce decorative icons.
- **Don't** exceed font-weight 600, and use 600 only for the wordmark and section eyebrows.
- **Don't** animate layout properties; animate transforms only.

# AI Stylist Progress Indicator — Design

**Date:** 2026-07-06
**Status:** Approved (phased status line)

## Problem

A generation takes long enough (thumbnail encoding of ~94 items on first run,
then a `gemini-pro-latest` call with a multi-MB image payload, occasionally
doubled by a silent validation retry) that it's unclear whether the app is
working or hung. The only current signal is a static button label.

## Design

### Service (`src/services/stylist.ts`)

Add an optional `onProgress` callback to `GenerateOutfitInput`:

```ts
export type StylistProgress =
  | { phase: 'encoding'; done: number; total: number }  // thumbnail prep, countable
  | { phase: 'styling' }                                 // main Gemini call, indeterminate
  | { phase: 'retrying' };                               // validation retry, now visible
```

- `buildInventoryParts` accepts the callback and reports after each item encodes.
- `generateOutfit` reports `styling` before the model call and `retrying`
  before the correction call.
- Callback omitted → identical behavior to today. Service stays React-free.

### UI (`src/components/AIStylist.tsx`)

- `progress` state driven by the callback; cleared in `finally` with `isLoading`.
- Status line under the prompt bar while loading, muted editorial text:
  - `Preparing your closet — 34 of 94 photos`
  - `Styling your look — 12s`
  - `Double-checking the fit — 21s`
- Elapsed seconds via an interval effect active only while loading; the
  ticking clock itself is the "not frozen" proof during indeterminate phases.
- A 1px hairline progress rule below the status line: real percentage fill
  during encoding, slow indeterminate shimmer during model phases. No
  spinners, no boxed panels (per design taste).
- Button label simplifies to `Styling…` while loading.

### Error handling

Unchanged — errors land in the existing error row; progress resets.

### Verification

Watch a real generation in the browser preview pass through encoding →
styling (→ retrying when it occurs), with the timer ticking.

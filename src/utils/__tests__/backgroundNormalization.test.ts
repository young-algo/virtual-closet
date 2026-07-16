import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeProductImagePixels } from '../backgroundNormalization';
import { productImageBlendMode } from '../productImagePresentation';

type Rgba = [number, number, number, number];

const solidPixels = (width: number, height: number, rgba: Rgba): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset);
  return pixels;
};

const setPixel = (pixels: Uint8ClampedArray, width: number, x: number, y: number, rgba: Rgba) => {
  pixels.set(rgba, ((y * width) + x) * 4);
};

const pixelAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number): Rgba => {
  const offset = ((y * width) + x) * 4;
  return Array.from(pixels.slice(offset, offset + 4)) as Rgba;
};

const offWhiteCanvasWithEnclosedDetail = (): Uint8ClampedArray => {
  const pixels = solidPixels(9, 9, [243, 243, 243, 255]);
  for (let y = 2; y < 7; y += 1) {
    for (let x = 2; x < 7; x += 1) setPixel(pixels, 9, x, y, [20, 30, 40, 255]);
  }
  setPixel(pixels, 9, 4, 4, [243, 243, 243, 255]);
  return pixels;
};

const wellFrameWithBrightInnerCanvas = (): Uint8ClampedArray => {
  const pixels = solidPixels(51, 51, [246, 246, 246, 255]);
  for (let y = 1; y < 50; y += 1) {
    for (let x = 1; x < 50; x += 1) setPixel(pixels, 51, x, y, [255, 255, 255, 255]);
  }
  for (let y = 18; y < 33; y += 1) {
    for (let x = 18; x < 33; x += 1) setPixel(pixels, 51, x, y, [20, 30, 40, 255]);
  }
  return pixels;
};

describe('normalizeProductImagePixels', () => {
  it('harmonizes a bright inner canvas hidden behind a well-colored frame', () => {
    const result = normalizeProductImagePixels(wellFrameWithBrightInnerCanvas(), 51, 51);

    expect(pixelAt(result.pixels, 51, 0, 0)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 51, 8, 8)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 51, 25, 25)).toEqual([20, 30, 40, 255]);
    expect(result.changedPixels).toBeGreaterThan(0);
  });

  it('harmonizes off-white pixels connected to the perimeter without crossing the garment', () => {
    const result = normalizeProductImagePixels(offWhiteCanvasWithEnclosedDetail(), 9, 9);

    expect(pixelAt(result.pixels, 9, 0, 0)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 9, 2, 2)).toEqual([20, 30, 40, 255]);
    expect(pixelAt(result.pixels, 9, 4, 4)).toEqual([243, 243, 243, 255]);
    expect(result.changedPixels).toBeGreaterThan(0);
    expect(result.skippedReason).toBeNull();
  });

  it('is idempotent', () => {
    const once = normalizeProductImagePixels(offWhiteCanvasWithEnclosedDetail(), 9, 9);
    const twice = normalizeProductImagePixels(once.pixels, 9, 9);

    expect(twice.pixels).toEqual(once.pixels);
    expect(twice.changedPixels).toBe(0);
  });

  it('skips images containing transparency', () => {
    const pixels = solidPixels(5, 5, [243, 243, 243, 255]);
    setPixel(pixels, 5, 0, 0, [0, 0, 0, 0]);

    const result = normalizeProductImagePixels(pixels, 5, 5);

    expect(result.pixels).toEqual(pixels);
    expect(result.skippedReason).toBe('contains transparency');
  });

  it('maps an already-white background to the image well', () => {
    const pixels = solidPixels(7, 7, [255, 255, 255, 255]);
    setPixel(pixels, 7, 3, 3, [15, 25, 35, 255]);

    const result = normalizeProductImagePixels(pixels, 7, 7);

    expect(pixelAt(result.pixels, 7, 0, 0)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 7, 3, 3)).toEqual([15, 25, 35, 255]);
    expect(result.changedPixels).toBeGreaterThan(0);
  });

  it('normalizes a neutral background gradient', () => {
    const pixels = solidPixels(11, 11, [0, 0, 0, 255]);
    for (let y = 0; y < 11; y += 1) {
      for (let x = 0; x < 11; x += 1) {
        const shade = 238 + Math.round((x / 10) * 7);
        setPixel(pixels, 11, x, y, [shade, shade, shade, 255]);
      }
    }
    for (let y = 3; y < 8; y += 1) {
      for (let x = 3; x < 8; x += 1) setPixel(pixels, 11, x, y, [180, 45, 30, 255]);
    }

    const result = normalizeProductImagePixels(pixels, 11, 11);

    expect(pixelAt(result.pixels, 11, 0, 5)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 11, 10, 5)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 11, 5, 5)).toEqual([180, 45, 30, 255]);
  });

  it('preserves a pale garment separated from the background by an outline', () => {
    const pixels = solidPixels(9, 9, [242, 242, 242, 255]);
    for (let y = 2; y < 7; y += 1) {
      for (let x = 2; x < 7; x += 1) setPixel(pixels, 9, x, y, [90, 90, 90, 255]);
    }
    for (let y = 3; y < 6; y += 1) {
      for (let x = 3; x < 6; x += 1) setPixel(pixels, 9, x, y, [250, 248, 244, 255]);
    }

    const result = normalizeProductImagePixels(pixels, 9, 9);

    expect(pixelAt(result.pixels, 9, 0, 0)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 9, 4, 4)).toEqual([250, 248, 244, 255]);
  });

  it('preserves contrast when pale fabric is connected to the background', () => {
    const pixels = solidPixels(7, 7, [228, 228, 228, 255]);
    for (let y = 2; y < 5; y += 1) {
      for (let x = 2; x < 5; x += 1) setPixel(pixels, 7, x, y, [236, 236, 236, 255]);
    }

    const result = normalizeProductImagePixels(pixels, 7, 7);

    expect(pixelAt(result.pixels, 7, 0, 0)).toEqual([246, 246, 246, 255]);
    expect(pixelAt(result.pixels, 7, 3, 3)).toEqual([254, 254, 254, 255]);
  });

  it('skips an ineligible dark background', () => {
    const pixels = solidPixels(7, 7, [80, 82, 84, 255]);
    setPixel(pixels, 7, 3, 3, [220, 30, 30, 255]);

    const result = normalizeProductImagePixels(pixels, 7, 7);

    expect(result.pixels).toEqual(pixels);
    expect(result.skippedReason).toBe('background is not bright and neutral');
  });

  it('rejects dimensions that do not match the RGBA buffer', () => {
    expect(() => normalizeProductImagePixels(new Uint8ClampedArray(12), 2, 2))
      .toThrow('RGBA pixel buffer length does not match 2x2');
  });
});

describe('product image rendering contract', () => {
  it('multiplies sneaker photos and darkens bright garment canvases into the well', () => {
    expect(productImageBlendMode('Sneakers')).toBe('multiply');
    expect(productImageBlendMode('T-Shirts')).toBe('darken');
    expect(productImageBlendMode('Pants')).toBe('darken');
  });

  it('does not apply multiply globally to every product image', () => {
    const source = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(source).not.toMatch(/\.product-image-container img\s*\{[^}]*mix-blend-mode/s);
  });
});

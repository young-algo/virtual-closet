const MIN_BACKGROUND_LUMA = 205;
const MAX_BACKGROUND_CHROMA = 32;
const MIN_COLOR_TOLERANCE = 14;
const MAX_COLOR_TOLERANCE = 38;
const INNER_CANVAS_TOLERANCE = 18;
const INNER_CANVAS_QUANTILE = 0.9;
const TARGET_BACKGROUND_RGB: Rgb = [246, 246, 246];

type Rgb = [number, number, number];

export interface PixelNormalizationResult {
  pixels: Uint8ClampedArray;
  changedPixels: number;
  backgroundRgb: Rgb | null;
  skippedReason: string | null;
}

interface BackgroundModel {
  rgb: Rgb;
  tolerance: number;
}

const luma = ([red, green, blue]: Rgb): number =>
  (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);

const chroma = (rgb: Rgb): number => Math.max(...rgb) - Math.min(...rgb);

const distance = (left: Rgb, right: Rgb): number => Math.sqrt(
  ((left[0] - right[0]) ** 2)
  + ((left[1] - right[1]) ** 2)
  + ((left[2] - right[2]) ** 2)
);

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const quantile = (values: number[], target: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * target;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return (sorted[lower] * (1 - weight)) + (sorted[upper] * weight);
};

const containsTransparency = (pixels: Uint8ClampedArray): boolean => {
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] < 255) return true;
  }
  return false;
};

const buildBackgroundModel = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): BackgroundModel => {
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue;
      const offset = ((y * width) + x) * 4;
      red.push(pixels[offset]);
      green.push(pixels[offset + 1]);
      blue.push(pixels[offset + 2]);
    }
  }

  const rgb: Rgb = [median(red), median(green), median(blue)];
  const distances = red.map((value, index) => distance([value, green[index], blue[index]], rgb));
  const medianDistance = median(distances);
  const medianAbsoluteDeviation = median(
    distances.map(value => Math.abs(value - medianDistance))
  );
  const tolerance = Math.max(
    MIN_COLOR_TOLERANCE,
    Math.min(MAX_COLOR_TOLERANCE, 10 + (3 * (medianDistance + medianAbsoluteDeviation)))
  );

  return { rgb, tolerance };
};

const buildInnerBackgroundModel = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): BackgroundModel | null => {
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  const outerLimit = Math.floor(Math.min(width, height) / 2);
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edgeDistance < band || edgeDistance >= Math.min(5 * band, outerLimit)) continue;
      const offset = ((y * width) + x) * 4;
      const rgb: Rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      if (pixels[offset + 3] !== 255
          || luma(rgb) < MIN_BACKGROUND_LUMA
          || chroma(rgb) > MAX_BACKGROUND_CHROMA) continue;
      red.push(rgb[0]);
      green.push(rgb[1]);
      blue.push(rgb[2]);
    }
  }

  if (red.length === 0) return null;
  return {
    rgb: [
      quantile(red, INNER_CANVAS_QUANTILE),
      quantile(green, INNER_CANVAS_QUANTILE),
      quantile(blue, INNER_CANVAS_QUANTILE)
    ],
    tolerance: INNER_CANVAS_TOLERANCE
  };
};

const selectNormalizationModel = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): BackgroundModel => {
  const perimeter = buildBackgroundModel(pixels, width, height);
  const inner = buildInnerBackgroundModel(pixels, width, height);
  if (!inner) return perimeter;
  const perimeterError = distance(perimeter.rgb, TARGET_BACKGROUND_RGB);
  const innerError = distance(inner.rgb, TARGET_BACKGROUND_RGB);
  return innerError > perimeterError + 2 ? inner : perimeter;
};

const isEligibleBackgroundPixel = (
  pixels: Uint8ClampedArray,
  offset: number,
  model: BackgroundModel
): boolean => {
  const rgb: Rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
  return pixels[offset + 3] === 255
    && luma(rgb) >= MIN_BACKGROUND_LUMA
    && chroma(rgb) <= MAX_BACKGROUND_CHROMA
    && distance(rgb, model.rgb) <= model.tolerance;
};

export const normalizeProductImagePixels = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): PixelNormalizationResult => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
      || pixels.length !== width * height * 4) {
    throw new Error(`RGBA pixel buffer length does not match ${width}x${height}`);
  }

  const output = new Uint8ClampedArray(pixels);
  if (containsTransparency(pixels)) {
    return {
      pixels: output,
      changedPixels: 0,
      backgroundRgb: null,
      skippedReason: 'contains transparency'
    };
  }

  const model = selectNormalizationModel(pixels, width, height);
  if (luma(model.rgb) < MIN_BACKGROUND_LUMA || chroma(model.rgb) > MAX_BACKGROUND_CHROMA) {
    return {
      pixels: output,
      changedPixels: 0,
      backgroundRgb: model.rgb,
      skippedReason: 'background is not bright and neutral'
    };
  }

  const pixelCount = width * height;
  const perimeterBand = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  const enqueueIfEligible = (x: number, y: number) => {
    const pixelIndex = (y * width) + x;
    if (visited[pixelIndex]) return;
    visited[pixelIndex] = 1;
    if (isEligibleBackgroundPixel(pixels, pixelIndex * 4, model)) {
      queue[queueEnd] = pixelIndex;
      queueEnd += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfEligible(x, 0);
    if (height > 1) enqueueIfEligible(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueIfEligible(0, y);
    if (width > 1) enqueueIfEligible(width - 1, y);
  }

  let changedPixels = 0;
  const channelOffsets: Rgb = [
    TARGET_BACKGROUND_RGB[0] - model.rgb[0],
    TARGET_BACKGROUND_RGB[1] - model.rgb[1],
    TARGET_BACKGROUND_RGB[2] - model.rgb[2]
  ];
  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart];
    queueStart += 1;
    const offset = pixelIndex * 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const isPerimeter = x < perimeterBand || x >= width - perimeterBand
      || y < perimeterBand || y >= height - perimeterBand;
    const corrected: Rgb = isPerimeter
      ? TARGET_BACKGROUND_RGB
      : [
          Math.max(0, Math.min(255, Math.round(pixels[offset] + channelOffsets[0]))),
          Math.max(0, Math.min(255, Math.round(pixels[offset + 1] + channelOffsets[1]))),
          Math.max(0, Math.min(255, Math.round(pixels[offset + 2] + channelOffsets[2])))
        ];
    if (output[offset] !== corrected[0]
        || output[offset + 1] !== corrected[1]
        || output[offset + 2] !== corrected[2]) {
      output[offset] = corrected[0];
      output[offset + 1] = corrected[1];
      output[offset + 2] = corrected[2];
      output[offset + 3] = 255;
      changedPixels += 1;
    }

    if (x > 0) enqueueIfEligible(x - 1, y);
    if (x + 1 < width) enqueueIfEligible(x + 1, y);
    if (y > 0) enqueueIfEligible(x, y - 1);
    if (y + 1 < height) enqueueIfEligible(x, y + 1);
  }

  return {
    pixels: output,
    changedPixels,
    backgroundRgb: model.rgb,
    skippedReason: null
  };
};

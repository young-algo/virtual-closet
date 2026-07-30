import type { jsPDF } from 'jspdf';

const TEXT_SCALE = 2;
const SYSTEM_FONT_STACK = [
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  '"Noto Color Emoji"',
  'sans-serif',
].join(', ');

interface PackingPdfTextRequest {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  fontStyle: 'normal' | 'bold';
  color: readonly [number, number, number];
  maxLines?: number;
  lineHeight?: number;
}

type MeasureText = (text: string) => number;

const printableAscii = /^[\x20-\x7e]*$/;

const graphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), segment => segment.segment);
  }
  return Array.from(text);
};

const takeFittingPrefix = (
  text: string,
  maxWidth: number,
  measureText: MeasureText,
): [string, string] => {
  const units = graphemes(text);
  let end = 0;
  while (end < units.length && measureText(units.slice(0, end + 1).join('')) <= maxWidth) {
    end += 1;
  }
  return [units.slice(0, end).join(''), units.slice(end).join('')];
};

const ellipsize = (
  text: string,
  maxWidth: number,
  measureText: MeasureText,
  suffix: string,
): string => {
  if (measureText(text) <= maxWidth) return text;
  const units = graphemes(text);
  while (units.length > 0 && measureText(`${units.join('')}${suffix}`) > maxWidth) {
    units.pop();
  }
  return measureText(suffix) <= maxWidth ? `${units.join('')}${suffix}` : '';
};

const fitTextLines = (
  text: string,
  maxWidth: number,
  maxLines: number,
  measureText: MeasureText,
  ellipsis: string,
): string[] => {
  if (measureText(text) <= maxWidth && !text.includes('\n')) return [text];

  const lines: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/u)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }

    let remainder = word;
    while (remainder && measureText(remainder) > maxWidth) {
      const [fitting, rest] = takeFittingPrefix(remainder, maxWidth, measureText);
      if (!fitting) break;
      lines.push(fitting);
      remainder = rest;
    }
    current = remainder;
  }
  if (current || lines.length === 0) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = ellipsize(
    `${visible[maxLines - 1]} ${lines[maxLines]}`,
    maxWidth,
    measureText,
    ellipsis,
  );
  return visible;
};

const drawCanvasText = (
  doc: jsPDF,
  request: PackingPdfTextRequest,
): void => {
  const maxLines = request.maxLines ?? 1;
  const lineHeight = request.lineHeight ?? request.fontSize * 1.2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(request.maxWidth * TEXT_SCALE));
  canvas.height = Math.max(1, Math.ceil(
    (request.fontSize + (maxLines - 1) * lineHeight + request.fontSize * 0.35) * TEXT_SCALE,
  ));
  const measurementContext = canvas.getContext('2d');
  if (!measurementContext) throw new Error('Canvas text rendering is unavailable');

  const configureContext = (context: CanvasRenderingContext2D) => {
    context.font = `${request.fontStyle === 'bold' ? 700 : 400} `
      + `${request.fontSize * TEXT_SCALE}px ${SYSTEM_FONT_STACK}`;
    context.fillStyle = `rgb(${request.color.join(', ')})`;
    context.textBaseline = 'alphabetic';
  };
  configureContext(measurementContext);
  const measureText = (text: string) =>
    measurementContext.measureText(text).width / TEXT_SCALE;
  const lines = fitTextLines(request.text, request.maxWidth, maxLines, measureText, '…');
  const renderedWidth = Math.max(
    1,
    Math.min(request.maxWidth, ...lines.map(measureText)),
  );
  const renderedHeight = request.fontSize
    + (lines.length - 1) * lineHeight
    + request.fontSize * 0.35;

  canvas.width = Math.max(1, Math.ceil(renderedWidth * TEXT_SCALE));
  canvas.height = Math.max(1, Math.ceil(renderedHeight * TEXT_SCALE));
  const renderContext = canvas.getContext('2d');
  if (!renderContext) throw new Error('Canvas text rendering is unavailable');
  configureContext(renderContext);
  lines.forEach((line, index) => {
    renderContext.fillText(
      line,
      0,
      (request.fontSize + index * lineHeight) * TEXT_SCALE,
    );
  });

  let imageData: string;
  try {
    imageData = canvas.toDataURL('image/png');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  doc.addImage(
    imageData,
    'PNG',
    request.x,
    request.y - request.fontSize,
    renderedWidth,
    renderedHeight,
  );
};

export const drawPackingPdfText = (
  doc: jsPDF,
  request: PackingPdfTextRequest,
): void => {
  if (!printableAscii.test(request.text)) {
    drawCanvasText(doc, request);
    return;
  }

  doc.setFont('helvetica', request.fontStyle);
  doc.setFontSize(request.fontSize);
  doc.setTextColor(...request.color);
  const maxLines = request.maxLines ?? 1;
  const lineHeight = request.lineHeight ?? request.fontSize * 1.2;
  const lines = fitTextLines(
    request.text,
    request.maxWidth,
    maxLines,
    text => doc.getTextWidth(text),
    '...',
  );
  doc.text(
    lines.length === 1 ? lines[0] : lines,
    request.x,
    request.y,
    { lineHeightFactor: lineHeight / request.fontSize },
  );
};

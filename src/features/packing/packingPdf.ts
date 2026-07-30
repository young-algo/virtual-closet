import { jsPDF } from 'jspdf';
import type { ClosetItem } from '../../components/ClosetGrid';
import {
  groupPackingItems,
  packingItemIsChecked,
  packingPdfFilename,
  planPackingPdfPages,
  type PackingPdfItem,
} from './packingPdfLayout';
import { drawPackingPdfText } from './packingPdfText';

type ImageNormalizer = (source: string) => Promise<string>;

const IMAGE_SIZE = 360;
const IMAGE_NORMALIZATION_CONCURRENCY = 3;

export const normalizeImageToJpeg = (source: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      try {
        image.src = '';
      } catch {
        // The handlers are already detached, which is the critical release.
      }
    };
    const resolveAndCleanup = (value: string) => {
      cleanup();
      resolve(value);
    };
    const rejectAndCleanup = (error: unknown) => {
      cleanup();
      reject(error);
    };
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = IMAGE_SIZE;
        canvas.height = IMAGE_SIZE;
        const context = canvas.getContext('2d');
        if (!context) {
          rejectAndCleanup(new Error('Canvas is unavailable'));
          return;
        }

        context.fillStyle = '#f1efe8';
        context.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
        const scale = Math.min(IMAGE_SIZE / image.naturalWidth, IMAGE_SIZE / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(
          image,
          (IMAGE_SIZE - width) / 2,
          (IMAGE_SIZE - height) / 2,
          width,
          height,
        );
        resolveAndCleanup(canvas.toDataURL('image/jpeg', 0.82));
      } catch (error) {
        rejectAndCleanup(error);
      }
    };
    image.onerror = () => rejectAndCleanup(new Error(`Could not load image: ${source}`));
    try {
      image.src = source;
    } catch (error) {
      rejectAndCleanup(error);
    }
  });

export const loadPackingItemImages = async (
  items: PackingPdfItem[],
  normalizer: ImageNormalizer = normalizeImageToJpeg,
): Promise<Map<string, string | null>> => {
  const resolved: Array<readonly [string, string | null]> = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      try {
        resolved[index] = [item.id, await normalizer(item.image)] as const;
      } catch {
        resolved[index] = [item.id, null] as const;
      }
    }
  };
  const workerCount = Math.min(IMAGE_NORMALIZATION_CONCURRENCY, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );
  return new Map(resolved);
};

export interface PackingPdfExportInput {
  tripName: string;
  items: ClosetItem[];
  physicallyPackedIds: Iterable<string>;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 42;
const CARD_GAP = 14;
const CARD_WIDTH = (PAGE_WIDTH - MARGIN_X * 2 - CARD_GAP) / 2;
const IMAGE_INSET = 8;
const IMAGE_BOX = 86;

const drawCheck = (doc: jsPDF, x: number, y: number, checked: boolean) => {
  doc.setDrawColor(48, 47, 42);
  doc.rect(x, y, 10, 10);
  if (checked) {
    doc.setLineWidth(1.4);
    doc.line(x + 2, y + 5, x + 4.5, y + 8);
    doc.line(x + 4.5, y + 8, x + 8.5, y + 2);
    doc.setLineWidth(0.2);
  }
};

const drawImagePlaceholder = (doc: jsPDF, x: number, y: number) => {
  doc.setFillColor(235, 232, 223);
  doc.rect(x, y, IMAGE_BOX, IMAGE_BOX, 'F');
  doc.setTextColor(125, 122, 113);
  doc.setFontSize(8);
  doc.text('IMAGE UNAVAILABLE', x + IMAGE_BOX / 2, y + IMAGE_BOX / 2, {
    align: 'center',
  });
};

export const exportPackingListPdf = async ({
  tripName,
  items,
  physicallyPackedIds,
}: PackingPdfExportInput): Promise<void> => {
  const packedIds = new Set(physicallyPackedIds);
  const packedCount = items.filter(item => packingItemIsChecked(item.id, packedIds)).length;
  const groups = groupPackingItems(items);
  const pages = planPackingPdfPages(groups);
  const images = await loadPackingItemImages(items);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const title = tripName.trim() || 'Packing List';

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) doc.addPage('letter', 'portrait');
    doc.setTextColor(30, 29, 26);

    if (pageIndex === 0) {
      drawPackingPdfText(doc, {
        text: title,
        x: MARGIN_X,
        y: 52,
        maxWidth: PAGE_WIDTH - MARGIN_X * 2,
        fontSize: 24,
        fontStyle: 'bold',
        color: [30, 29, 26],
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(105, 102, 94);
      doc.text(`${packedCount} of ${items.length} packed`, MARGIN_X, 72);
      doc.setDrawColor(197, 193, 182);
      doc.line(MARGIN_X, 92, PAGE_WIDTH - MARGIN_X, 92);
    } else {
      drawPackingPdfText(doc, {
        text: title,
        x: MARGIN_X,
        y: 34,
        maxWidth: PAGE_WIDTH - MARGIN_X * 2,
        fontSize: 9,
        fontStyle: 'normal',
        color: [105, 102, 94],
      });
    }

    for (const heading of page.headings) {
      drawPackingPdfText(doc, {
        text: heading.category.toUpperCase(),
        x: MARGIN_X,
        y: heading.y + 11,
        maxWidth: PAGE_WIDTH - MARGIN_X * 2,
        fontSize: 9,
        fontStyle: 'bold',
        color: [85, 82, 74],
      });
    }

    for (const card of page.cards) {
      const x = MARGIN_X + card.column * (CARD_WIDTH + CARD_GAP);
      doc.setDrawColor(210, 206, 195);
      doc.roundedRect(x, card.y, CARD_WIDTH, card.height, 2, 2);
      const imageX = x + IMAGE_INSET;
      const imageY = card.y + IMAGE_INSET;
      const imageData = images.get(card.item.id);
      if (imageData) doc.addImage(imageData, 'JPEG', imageX, imageY, IMAGE_BOX, IMAGE_BOX);
      else drawImagePlaceholder(doc, imageX, imageY);

      const textX = imageX + IMAGE_BOX + 12;
      drawCheck(doc, textX, card.y + 18, packingItemIsChecked(card.item.id, packedIds));
      drawPackingPdfText(doc, {
        text: card.item.name,
        x: textX,
        y: card.y + 44,
        maxWidth: CARD_WIDTH - IMAGE_BOX - 38,
        maxLines: 4,
        lineHeight: 12,
        fontSize: 10,
        fontStyle: 'normal',
        color: [36, 35, 31],
      });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(125, 122, 113);
    doc.text(`${pageIndex + 1} / ${pages.length}`, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 24, {
      align: 'right',
    });
  });

  doc.save(packingPdfFilename(tripName));
};

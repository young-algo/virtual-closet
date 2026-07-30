import type { ClosetItem } from '../../components/ClosetGrid';

export type PackingPdfItem = Pick<
  ClosetItem,
  'id' | 'name' | 'category' | 'image'
>;

export interface PackingPdfGroup {
  category: string;
  items: PackingPdfItem[];
}

export const packingPdfFilename = (tripName: string): string => {
  const slug = tripName
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug ? `${slug}-packing-list.pdf` : 'packing-list.pdf';
};

export const groupPackingItems = (
  items: PackingPdfItem[],
): PackingPdfGroup[] => {
  const groups = new Map<string, PackingPdfItem[]>();
  for (const item of items) {
    const category = item.category.trim() || 'Other';
    const existing = groups.get(category);
    if (existing) existing.push(item);
    else groups.set(category, [item]);
  }
  return Array.from(groups, ([category, groupedItems]) => ({
    category,
    items: groupedItems,
  }));
};

export const packingItemIsChecked = (
  itemId: string,
  checkedIds: ReadonlySet<string>,
): boolean => checkedIds.has(itemId);

export interface PackingPdfHeadingPlacement {
  category: string;
  y: number;
}

export interface PackingPdfCardPlacement {
  item: PackingPdfItem;
  column: 0 | 1;
  y: number;
  height: number;
}

export interface PackingPdfPage {
  headings: PackingPdfHeadingPlacement[];
  cards: PackingPdfCardPlacement[];
}

const FIRST_PAGE_START_Y = 126;
const CONTINUATION_START_Y = 62;
const CONTENT_BOTTOM_Y = 748;
const HEADING_HEIGHT = 24;
const CARD_HEIGHT = 112;
const ROW_GAP = 12;
const GROUP_GAP = 10;

const newPage = (): PackingPdfPage => ({ headings: [], cards: [] });

export const planPackingPdfPages = (
  groups: PackingPdfGroup[],
): PackingPdfPage[] => {
  const pages: PackingPdfPage[] = [newPage()];
  let pageIndex = 0;
  let y = FIRST_PAGE_START_Y;

  const advancePage = () => {
    pages.push(newPage());
    pageIndex += 1;
    y = CONTINUATION_START_Y;
  };

  for (const group of groups) {
    if (y + HEADING_HEIGHT + CARD_HEIGHT > CONTENT_BOTTOM_Y) advancePage();
    pages[pageIndex].headings.push({ category: group.category, y });
    y += HEADING_HEIGHT;

    for (let index = 0; index < group.items.length; index += 2) {
      if (y + CARD_HEIGHT > CONTENT_BOTTOM_Y) advancePage();
      const row = group.items.slice(index, index + 2);
      row.forEach((groupItem, column) => {
        pages[pageIndex].cards.push({
          item: groupItem,
          column: column as 0 | 1,
          y,
          height: CARD_HEIGHT,
        });
      });
      y += CARD_HEIGHT + ROW_GAP;
    }
    y += GROUP_GAP;
  }

  return pages;
};

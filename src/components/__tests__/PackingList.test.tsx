// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PackingList from '../PackingList';
import { exportPackingListPdf } from '../../features/packing/packingPdf';

vi.mock('../../features/packing/packingPdf', () => ({
  exportPackingListPdf: vi.fn(),
}));

const packedItems = [{
  id: 'shirt-1',
  name: 'Blue Shirt',
  category: 'Tops',
  color: 'Blue',
  brand: 'Example',
  image: '/shirt.jpg',
  description: 'A blue shirt',
}];

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('PackingList PDF export', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    container.remove();
  });

  it('disables the action while preparing and reports a completed download', async () => {
    const pending = deferred();
    vi.mocked(exportPackingListPdf).mockReturnValue(pending.promise);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PackingList
          packedItems={packedItems}
          onRemoveItem={() => undefined}
          onClearList={() => undefined}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    await act(async () => button.click());
    expect(button.textContent).toContain('Preparing PDF');
    expect(button.disabled).toBe(true);

    await act(async () => pending.resolve());
    expect(button.textContent).toContain('Downloaded');
    expect(exportPackingListPdf).toHaveBeenCalledWith({
      tripName: 'Vacation Trip',
      items: packedItems,
      physicallyPackedIds: [],
    });

    await act(async () => vi.advanceTimersByTime(2000));
    expect(button.textContent).toContain('Export PDF');
    await act(async () => root.unmount());
  });

  it('shows an accessible error when generation fails', async () => {
    vi.mocked(exportPackingListPdf).mockRejectedValue(new Error('save failed'));
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PackingList
          packedItems={packedItems}
          onRemoveItem={() => undefined}
          onClearList={() => undefined}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    await act(async () => button.click());

    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain('Could not create the PDF. Please try again.');
    expect(button.disabled).toBe(false);
    await act(async () => root.unmount());
  });
});

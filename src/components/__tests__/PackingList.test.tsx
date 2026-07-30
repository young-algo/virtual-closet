// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PackingList from '../PackingList';

const packingPdfModule = vi.hoisted(() => ({
  beforeResolve: vi.fn<() => Promise<void>>(async () => undefined),
  exportPackingListPdf: vi.fn(),
}));

vi.mock('../../features/packing/packingPdf', async () => {
  await packingPdfModule.beforeResolve();
  return {
    exportPackingListPdf: packingPdfModule.exportPackingListPdf,
  };
});

const exportPackingListPdf = packingPdfModule.exportPackingListPdf;

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
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    container.remove();
  });

  it('does not start generation when unmounted during lazy module loading', async () => {
    const moduleLoad = deferred();
    packingPdfModule.beforeResolve.mockReturnValue(moduleLoad.promise);
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
    expect(packingPdfModule.beforeResolve).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    await act(async () => {
      moduleLoad.resolve();
      await Promise.resolve();
    });

    expect(exportPackingListPdf).not.toHaveBeenCalled();
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

    const checkbox = container.querySelector('button')!;
    await act(async () => checkbox.click());
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
      physicallyPackedIds: ['shirt-1'],
    });

    await act(async () => vi.advanceTimersByTime(2000));
    expect(button.textContent).toContain('Export PDF');
    await act(async () => root.unmount());
  });

  it('starts only one export when activated twice before React rerenders', async () => {
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
    await act(async () => {
      button.click();
      button.click();
    });

    expect(exportPackingListPdf).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    await act(async () => root.unmount());
  });

  it('shows an accessible error when generation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to export packing list PDF',
      expect.any(Error),
    );
    await act(async () => root.unmount());
  });

  it('does not schedule a reset after a pending export settles post-unmount', async () => {
    const pending = deferred();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
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
    await act(async () => root.unmount());
    await act(async () => pending.resolve());

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('retains generation failure feedback after the packing list becomes empty', async () => {
    const pending = deferred();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(exportPackingListPdf).mockReturnValue(pending.promise);
    const root = createRoot(container);
    const render = (items = packedItems) => (
      <PackingList
        packedItems={items}
        onRemoveItem={() => undefined}
        onClearList={() => undefined}
      />
    );
    await act(async () => {
      root.render(render());
    });

    const button = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    await act(async () => button.click());
    await act(async () => root.render(render([])));
    await act(async () => pending.reject(new Error('save failed')));

    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain('Could not create the PDF. Please try again.');
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to export packing list PDF',
      expect.any(Error),
    );
    await act(async () => root.unmount());
  });

  it('keeps successful completion visible while clear confirmation is open', async () => {
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

    const exportButton = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    const clearButton = container.querySelector<HTMLButtonElement>(
      'button[title="Clear packing list"]',
    )!;
    await act(async () => exportButton.click());
    await act(async () => clearButton.click());
    expect(container.textContent).toContain('Are you sure you want to clear your suitcase?');

    await act(async () => pending.resolve());

    expect(container.textContent).toContain('Downloaded');
    await act(async () => root.unmount());
  });

  it('clears an already-scheduled success reset when unmounted', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    vi.mocked(exportPackingListPdf).mockResolvedValue(undefined);
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

    const exportButton = Array.from(container.querySelectorAll('button'))
      .find(value => value.textContent?.includes('Export PDF'))!;
    await act(async () => exportButton.click());
    expect(exportButton.textContent).toContain('Downloaded');

    await act(async () => root.unmount());

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });
});

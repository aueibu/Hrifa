import { render, screen, userEvent, within } from '@test-utils';
/** The dock spike page in jsdom: the three arrangements, close and reopen from the Panels menu, the saved JSON, reload. */
import { render as renderRaw } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import type { StageStorage } from '../../components/Stage/persistence';
import { parseScreensetStore, stageStorageKey, treeDockers, dockerHolding } from '../../lib/stage';
import { theme } from '../../theme';
import { dockProbe, DOCK_REGISTRY, defaultDockStore } from './dockSpike/panels';
import { DOCK_SPIKE_KEY, DockSpikeApp } from './DockSpikeApp';
import { StageEntry } from './StageEntry';

vi.setConfig({ testTimeout: 15_000 });

const observers = new Set<{ cb: () => void }>();
class FakeResizeObserver {
  constructor(public cb: () => void) {
    observers.add(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.delete(this);
  }
}
const rect = (w: number, h: number) =>
  ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
const realObserver = window.ResizeObserver;

beforeEach(() => {
  observers.clear();
  for (const k of Object.keys(dockProbe)) {
    delete dockProbe[k];
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-dock-root')) {
      return rect(1600, 800); // 100 x 50 rem
    }
    return this.hasAttribute('data-dock-body') ? rect(640, 400) : rect(0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
});

function fakeStorage(): StageStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}
const savedStore = (s: ReturnType<typeof fakeStorage>) =>
  parseScreensetStore(s.map.get(DOCK_SPIKE_KEY), DOCK_REGISTRY.meta, {
    fallback: defaultDockStore(),
  });

describe('dock spike', () => {
  it('shows arrangement (a) first and switches between the three arrangements', async () => {
    render(<DockSpikeApp storage={fakeStorage()} />);
    expect(screen.getByRole('region', { name: 'Tools' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Tools' })).getAllByRole('tab')).toHaveLength(
      3
    );

    await userEvent.click(screen.getByRole('tab', { name: '(b) Left, centre, right' }));
    expect(screen.getByRole('region', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Visualizer' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tools' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '(c) Top over left and right' }));
    expect(screen.getByRole('region', { name: 'Tools' })).toHaveAttribute('data-state', 'empty');
    // the keepMounted canvas was mounted once across all the switches
    expect(dockProbe.canvas).toBe(1);
  });

  it('closes and reopens a panel from the Panels menu, saves the screenset and reloads it', async () => {
    const storage = fakeStorage();
    const { unmount } = render(<DockSpikeApp storage={storage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Panels' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Close Voicings' }));
    expect(screen.queryByRole('tab', { name: 'Voicings' })).not.toBeInTheDocument();
    expect(dockerHolding(savedStore(storage).screensets.a.tree, 'voicings')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Panels' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open Voicings' }));
    expect(
      within(screen.getByRole('region', { name: 'Tools' })).getByRole('tab', { name: 'Voicings' })
    ).toBeInTheDocument();

    // move Sets to Detail by name, then reload: it is still there
    await userEvent.click(screen.getByRole('tab', { name: 'Sets' }));
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Sets' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Detail' }));
    unmount();
    render(<DockSpikeApp storage={storage} />);
    expect(
      within(screen.getByRole('region', { name: 'Detail' })).getByRole('tab', { name: 'Sets' })
    ).toBeInTheDocument();
    expect(treeDockers(savedStore(storage).screensets.a.tree)).toHaveLength(3);
  });

  it('shows the saved JSON on request', async () => {
    render(<DockSpikeApp storage={fakeStorage()} />);
    expect(screen.queryByTestId('dock-json')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Saved JSON'));
    expect(screen.getByTestId('dock-json').textContent).toContain('"screensets"');
  });

  it('resets the active arrangement to its default', async () => {
    const storage = fakeStorage();
    render(<DockSpikeApp storage={storage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Panels' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Close Voicings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset arrangement' }));
    expect(screen.getByRole('tab', { name: 'Voicings' })).toBeInTheDocument();
  });
});

describe('dock spike screensets and instances', () => {
  const tabs = () =>
    within(screen.getByRole('tablist', { name: 'Screensets' }))
      .getAllByRole('tab')
      .map((t) => t.textContent);

  it('has no invisible bridge panel and lists no reserved id in the Panels menu', async () => {
    render(<DockSpikeApp storage={fakeStorage()} />);
    expect(document.querySelector('[data-panel-host="__api"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Panels' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Show Canvas' })).toBeInTheDocument();
    expect(within(menu).queryByText(/__|bridge/i)).not.toBeInTheDocument();
  });

  it('adds, duplicates and deletes screensets on the strip; keepMounted panels stay mounted through switches', async () => {
    const storage = fakeStorage();
    render(<DockSpikeApp storage={storage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add screenset' }));
    expect(tabs()).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Screenset 4' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // the copy of (a): the same dockers
    expect(screen.getByRole('region', { name: 'Tools' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '(b) Left, centre, right' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Screenset 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Screenset 4' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(tabs()).toHaveLength(3);
    expect(dockProbe.canvas).toBe(1); // mounted once across every switch, add and delete
    expect(savedStore(storage).order).toHaveLength(3);
  });

  it('loads an older single-screenset value as a store of one', () => {
    const storage = fakeStorage();
    const old = defaultDockStore().screensets.a;
    // the key the spike reads goes through stageStorageKey: write it the same way
    storage.setItem(stageStorageKey(DOCK_SPIKE_KEY), JSON.stringify(old));
    render(<DockSpikeApp storage={storage} />);
    expect(tabs()).toEqual([old.name]);
    expect(screen.getByRole('region', { name: 'Tools' })).toBeInTheDocument();
  });

  it('adds a note instance from the Panels menu: the registry is rebuilt and it opens in its home docker', async () => {
    const storage = fakeStorage();
    const { unmount } = render(<DockSpikeApp storage={storage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Panels' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New Note instance' }));
    const tools = screen.getByRole('region', { name: 'Tools' });
    expect(await within(tools).findByRole('tab', { name: 'Note 1' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(dockProbe['note:1']).toBe(1);
    expect(dockProbe.canvas).toBe(1);

    // reload: the instance list is read before the stored screensets are parsed, so the tab is still known
    unmount();
    render(<DockSpikeApp storage={storage} />);
    expect(
      within(screen.getByRole('region', { name: 'Tools' })).getByRole('tab', { name: 'Note 1' })
    ).toBeInTheDocument();
  });
});

describe('StageEntry', () => {
  const at = (url: string) =>
    renderRaw(
      <MantineProvider theme={theme} env="test">
        <MemoryRouter initialEntries={[url]}>
          <StageEntry />
        </MemoryRouter>
      </MantineProvider>
    );

  it('renders the dock spike for ?dock and the old spike otherwise', () => {
    const dock = at('/stage?dock');
    expect(screen.getByRole('heading', { name: 'Dock Stage (spike)' })).toBeInTheDocument();
    dock.unmount();
    at('/stage');
    expect(screen.getByRole('heading', { name: 'Stage (spike)' })).toBeInTheDocument();
  });
});

describe('dock spike separators', () => {
  it.each([
    ['a', '(a) Top over bottom, three tabs'],
    ['b', '(b) Left, centre, right'],
    ['c', '(c) Top over left and right'],
  ])(
    'arrangement %s: every separator has a box, is not hidden and is reachable by Tab',
    async (_id, label) => {
      render(<DockSpikeApp storage={fakeStorage()} />);
      await userEvent.click(screen.getByRole('tab', { name: label }));
      const bars = screen.getAllByRole('separator');
      expect(bars).toHaveLength(2);
      expect(new Set(bars.map((b) => b.getAttribute('aria-orientation'))).size).toBe(
        _id === 'b' ? 1 : 2 // (b) is two row bars; (a) and (c) have a row bar and a column bar
      );
      for (const bar of bars) {
        const wrapper = bar.parentElement!;
        expect(parseFloat(wrapper.style.width)).toBeGreaterThan(0);
        expect(parseFloat(wrapper.style.height)).toBeGreaterThan(0);
        expect(bar.closest('[inert]')).toBeNull();
        expect(bar.closest('[aria-hidden="true"]')).toBeNull();
        expect(bar).toHaveAttribute('tabindex', '0');
      }
      const reached = new Set<string>();
      document.body.focus();
      for (let i = 0; i < 150 && reached.size < bars.length; i++) {
        await userEvent.tab();
        const at = document.activeElement;
        if (at?.getAttribute('role') === 'separator') {
          reached.add(at.getAttribute('aria-label') ?? '');
        }
      }
      expect(reached.size).toBe(bars.length);
    }
  );
});

/** M3d: the tab context menu (any tab, no activation) and the viewer setting "Show close button on tabs". */
import { useState } from 'react';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dockerHolding, treeDockers, type Workspace } from '../../../lib/stage';
import { arrangementA, workspace } from '../../../lib/stage/fixtures';
import type { StageStorage } from '../persistence';
import { createStageRegistry, type StageModule } from '../registry';
import { DockStage } from './DockStage';
import { SHOW_TAB_CLOSE_KEY } from './tabCloseSetting';

vi.setConfig({ testTimeout: 15_000 });

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const rect = (w: number, h: number) =>
  ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
const realObserver = window.ResizeObserver;
beforeEach(() => {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.hasAttribute('data-dock-body') ? rect(640, 400) : rect(0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
});

const mod = (id: string, over: Partial<StageModule> = {}): StageModule => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  sizes: [{ width: 'regular', height: 'regular' }],
  minSize: { width: 'narrow', height: 'short' },
  render: () => <div data-probe={id} />,
  ...over,
});
const REGISTRY = createStageRegistry(
  ['canvas', 'data-block-editor', 'chords', 'sets', 'voicings'].map((id) =>
    mod(id, id === 'data-block-editor' ? { title: 'Data-block editor' } : {})
  )
);

function fakeStorage(): StageStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function Host({ storage, showTabClose }: { storage?: StageStorage; showTabClose?: boolean }) {
  const [s, setS] = useState<Workspace>(() => workspace(arrangementA));
  return (
    <>
      <DockStage
        registry={REGISTRY}
        workspace={s}
        update={setS}
        widthRem={100}
        heightRem={50}
        storage={storage}
        showTabClose={showTabClose}
      />
      <output data-testid="workspace">{JSON.stringify(s)}</output>
    </>
  );
}
const stored = () => JSON.parse(screen.getByTestId('workspace').textContent!) as Workspace;
const dockerOf = (panel: string) => dockerHolding(stored().tree, panel);
const tab = (name: string) => screen.getByRole('tab', { name });
const active = () => document.activeElement as HTMLElement | null;
const tools = () => screen.getByRole('region', { name: 'Tools' });
const item = (name: string | RegExp) => screen.findByRole('menuitem', { name });

describe('the tab context menu', () => {
  it('right-click opens the menu of an INACTIVE tab without activating it', async () => {
    render(<Host storage={fakeStorage()} />);
    fireEvent.contextMenu(tab('Sets'));
    expect(await item('Close Sets')).toBeInTheDocument();
    expect(await item('Move tab left')).toBeEnabled();
    expect(dockerOf('chords')?.active).toBe('chords');
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'false');
    expect(tab('Sets').getAttribute('role')).toBe('tab'); // still a plain tab
  });

  it('sends the tab to a docker by name', async () => {
    render(<Host storage={fakeStorage()} />);
    fireEvent.contextMenu(tab('Sets'));
    await userEvent.click(await item('Detail'));
    expect(dockerOf('sets')?.name).toBe('Detail');
    expect(dockerOf('chords')?.active).toBe('chords');
  });

  it('sends the tab to a new docker through the name prompt', async () => {
    render(<Host storage={fakeStorage()} />);
    fireEvent.contextMenu(tab('Voicings'));
    await userEvent.click(await item('Send to new docker: Right'));
    const input = await screen.findByRole('textbox', { name: 'Docker name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Side{Enter}');
    await waitFor(() => expect(dockerOf('voicings')?.name).toBe('Side'));
    expect(treeDockers(stored().tree)).toHaveLength(4);
  });

  it('moves the tab left and right, and disables the ends', async () => {
    render(<Host storage={fakeStorage()} />);
    fireEvent.contextMenu(tab('Sets'));
    await userEvent.click(await item('Move tab left'));
    expect(dockerOf('sets')?.tabs).toEqual(['sets', 'chords', 'voicings']);
    expect(dockerOf('sets')?.active).toBe('chords');
    fireEvent.contextMenu(tab('Sets'));
    expect(await item('Move tab left')).toBeDisabled();
    await userEvent.click(await item('Move tab right'));
    expect(dockerOf('sets')?.tabs).toEqual(['chords', 'sets', 'voicings']);
  });

  it('closes the tab it was opened on', async () => {
    render(<Host storage={fakeStorage()} />);
    fireEvent.contextMenu(tab('Sets'));
    await userEvent.click(await item('Close Sets'));
    expect(dockerOf('sets')).toBeNull();
    expect(dockerOf('chords')?.tabs).toEqual(['chords', 'voicings']);
  });

  it.each([
    ['Shift+F10', { key: 'F10', shiftKey: true }],
    ['the ContextMenu key', { key: 'ContextMenu' }],
  ])(
    '%s on a focused tab opens it; Escape closes it and focus returns to the tab',
    async (_n, init) => {
      render(<Host storage={fakeStorage()} />);
      act(() => tab('Chords').focus());
      await userEvent.keyboard('{ArrowRight}');
      expect(active()).toBe(tab('Sets'));
      fireEvent.keyDown(tab('Sets'), init);
      expect(await item('Close Sets')).toBeInTheDocument();
      expect(tab('Chords')).toHaveAttribute('aria-selected', 'true');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(active()).toBe(tab('Sets'));
    }
  );

  it('closes on an outside click and keeps the existing active-tab menu button', async () => {
    render(<Host storage={fakeStorage()} />);
    fireEvent.contextMenu(tab('Sets'));
    await item('Close Sets');
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(within(tools()).getByRole('button', { name: 'Menu for Chords' })).toBeInTheDocument();
  });
});

describe('Show close button on tabs', () => {
  const closeButtons = () => within(tools()).queryAllByRole('button', { name: /^Close / });

  it('is off by default, toggles from the docker menu, and persists across a reload', async () => {
    const storage = fakeStorage();
    const first = render(<Host storage={storage} />);
    expect(closeButtons()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    const toggle = await screen.findByRole('menuitem', { name: 'Show close button on tabs' });
    expect(toggle).toHaveAttribute('data-checked', 'false');
    await userEvent.click(toggle);
    expect(closeButtons()).toHaveLength(3);
    expect(storage.map.get(SHOW_TAB_CLOSE_KEY)).toBe('true');

    first.unmount();
    render(<Host storage={storage} />);
    expect(closeButtons()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    const on = await screen.findByRole('menuitem', { name: 'Show close button on tabs (on)' });
    expect(on).toHaveAttribute('data-checked', 'true');
    await userEvent.click(on);
    expect(closeButtons()).toHaveLength(0);
    expect(storage.map.get(SHOW_TAB_CLOSE_KEY)).toBe('false');
  });

  it('puts each close button beside its tab (not inside it) and closes the right panel without activating', async () => {
    render(<Host storage={fakeStorage()} showTabClose />);
    const close = within(tools()).getByRole('button', { name: 'Close Sets' });
    expect(tab('Sets').contains(close)).toBe(false);
    expect(close.parentElement).toBe(tab('Sets').parentElement);
    expect(close.parentElement).toHaveAttribute('role', 'presentation');
    await userEvent.click(close);
    expect(dockerOf('sets')).toBeNull();
    expect(dockerOf('chords')?.tabs).toEqual(['chords', 'voicings']);
    expect(dockerOf('chords')?.active).toBe('chords');
  });
});

/**
 * The dock Stage keyboard model in jsdom (M3c): the tablist (roving tabindex, arrows, Home, End, Enter, Space, Delete,
 * Alt+arrows), menu buttons outside the tablist, focus returning after docker menu actions, Escape to the panel, the
 * shortcuts (F6, Alt+digit, Alt+F6, Go to docker) and when they stay quiet, the Panels menu, the name prompt and the menu
 * entries added in M3c. jsdom has no layout and no real focus ring: those are checked in a real browser.
 */
import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dockerHolding,
  makeDocker,
  makeScreenset,
  parseScreensetStore,
  reconcile,
  treeDockers,
  type Screenset,
  type SplitChild,
  type TreeNode,
} from '../../../lib/stage';
import { arrangementA, arrangementC, screenset } from '../../../lib/stage/fixtures';
import { createStageRegistry, type StageModule, type StageRegistry } from '../registry';
import { DockStage } from './DockStage';
import { knownPanelIds, useStageRegistry, type PanelKind } from './instances';
import { isTypingTarget } from './keyMap';
import { PanelsMenu } from './PanelsMenu';
import type { StageApi } from './stageApi';

vi.setConfig({ testTimeout: 15_000 });

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const rect = (w: number, h: number) =>
  ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
const realObserver = window.ResizeObserver;
const mounts: Record<string, number> = {};
const unmounts: Record<string, number> = {};

beforeEach(() => {
  for (const k of Object.keys(mounts)) {
    delete mounts[k];
  }
  for (const k of Object.keys(unmounts)) {
    delete unmounts[k];
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.hasAttribute('data-dock-body') ? rect(640, 400) : rect(0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
});

function Probe({ id }: { id: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
    return () => {
      unmounts[id] = (unmounts[id] ?? 0) + 1;
    };
  }, [id]);
  return (
    <div data-probe={id}>
      <button type="button" onClick={() => setN((x) => x + 1)}>{`inc ${id}`}</button>
      <span data-testid={`n-${id}`}>{n}</span>
    </div>
  );
}
/** A panel that handles F6 itself (preventDefault), like a panel with its own key scope. */
function Trap() {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      data-testid="trap"
      onKeyDown={(e) => {
        if (e.key === 'F6') {
          e.preventDefault();
        }
      }}
    >
      trap
    </div>
  );
}

const SIZES: StageModule['sizes'] = [{ width: 'regular', height: 'regular' }];
const mod = (id: string, over: Partial<StageModule> = {}): StageModule => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  sizes: SIZES,
  minSize: { width: 'narrow', height: 'short' },
  render: () => <Probe id={id} />,
  ...over,
});
const REGISTRY = createStageRegistry([
  mod('canvas', { keepMounted: true }),
  mod('desk'),
  mod('clip-editor', { title: 'Clip editor', home: 'Detail' }),
  mod('chords', { home: 'Tools' }),
  mod('sets'),
  mod('voicings'),
  mod('trap', { render: () => <Trap /> }),
  mod('__bridge', { keepMounted: true, title: 'Bridge', render: () => null }),
]);

interface HostProps {
  initial: Screenset;
  registry?: StageRegistry;
  widthRem?: number;
  kinds?: { id: string; title: string }[];
  onNewInstance?: (kind: string) => void;
  onScreenset?: (s: Screenset) => void;
}
function Host({
  initial,
  registry = REGISTRY,
  widthRem = 100,
  kinds,
  onNewInstance,
  onScreenset,
}: HostProps) {
  const [s, setS] = useState(initial);
  const [api, setApi] = useState<StageApi | null>(null);
  onScreenset?.(s);
  return (
    <>
      <PanelsMenu
        registry={registry.meta}
        screenset={s}
        api={api}
        kinds={kinds}
        onNewInstance={onNewInstance}
      />
      <input aria-label="outside" />
      <DockStage
        registry={registry}
        screenset={s}
        update={setS}
        widthRem={widthRem}
        heightRem={50}
        onApi={setApi}
      />
      <output data-testid="screenset">{JSON.stringify(s)}</output>
    </>
  );
}

const stored = () => JSON.parse(screen.getByTestId('screenset').textContent!) as Screenset;
const dockerOf = (panel: string) => dockerHolding(stored().tree, panel);
const region = (name: string) => screen.getByRole('region', { name });
const tab = (name: string) => screen.getByRole('tab', { name });
const hostOf = (id: string) => document.querySelector<HTMLElement>(`[data-panel-host="${id}"]`);
const A = () => screenset(arrangementA);
const C = () => screenset(arrangementC);
const focus = (el: HTMLElement) => act(() => el.focus());
const active = () => document.activeElement as HTMLElement | null;
const selectedDocker = () =>
  document.querySelector('section[data-selected="true"]')?.getAttribute('aria-label') ?? null;
const key = (init: KeyboardEventInit, target: Element = active() ?? document.body) =>
  fireEvent.keyDown(target, init);
const F6 = { key: 'F6', code: 'F6' };
const altDigit = (n: number) => ({ key: String(n), code: `Digit${n}`, altKey: true });

describe('the tablist', () => {
  it('has one Tab stop (the active tab); arrows, Home and End move focus without activating', async () => {
    render(<Host initial={A()} />);
    const list = within(region('Tools')).getByRole('tablist');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    focus(tab('Chords'));
    await userEvent.keyboard('{ArrowRight}');
    expect(active()).toBe(tab('Sets'));
    expect(tab('Chords')).toHaveAttribute('aria-selected', 'true'); // not activated
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{End}');
    expect(active()).toBe(tab('Voicings'));
    await userEvent.keyboard('{ArrowRight}'); // wraps
    expect(active()).toBe(tab('Chords'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(active()).toBe(tab('Voicings'));
    await userEvent.keyboard('{Home}');
    expect(active()).toBe(tab('Chords'));
    expect(dockerOf('chords')?.active).toBe('chords');
  });

  it('activates the focused tab with Enter or Space', async () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(dockerOf('sets')?.active).toBe('sets');
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End} ');
    expect(dockerOf('voicings')?.active).toBe('voicings');
  });

  it('Delete closes the focused tab and focus goes to the docker active tab', async () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    await userEvent.keyboard('{ArrowRight}{Delete}'); // Sets, not active
    expect(dockerOf('sets')).toBeNull();
    expect(dockerOf('chords')?.tabs).toEqual(['chords', 'voicings']);
    expect(active()).toBe(tab('Chords'));

    await userEvent.keyboard('{Delete}'); // the active one: the next tab becomes active and gets focus
    expect(dockerOf('chords')).toBeNull();
    expect(dockerOf('voicings')?.active).toBe('voicings');
    expect(active()).toBe(tab('Voicings'));
  });

  it('Alt+Left and Alt+Right reorder, keep focus on the tab and do not activate it', async () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(dockerOf('chords')?.tabs).toEqual(['sets', 'chords', 'voicings']);
    expect(active()).toBe(tab('Chords'));

    await userEvent.keyboard('{ArrowRight}'); // Voicings, not active
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(dockerOf('chords')?.tabs).toEqual(['sets', 'voicings', 'chords']);
    expect(dockerOf('chords')?.active).toBe('chords'); // the active tab did not change
    expect(active()).toBe(tab('Voicings'));
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}'); // at the start: nothing
    expect(dockerOf('chords')?.tabs).toEqual(['voicings', 'sets', 'chords']);
  });

  it('keeps the tab menu and docker menu buttons out of the tablist, reachable by Tab after the strip', async () => {
    render(<Host initial={A()} />);
    const tools = region('Tools');
    const list = within(tools).getByRole('tablist');
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    for (const child of list.querySelectorAll('*')) {
      expect(['tab', 'presentation', null]).toContain(child.getAttribute('role'));
    }
    const tabMenu = within(tools).getByRole('button', { name: 'Menu for Chords' });
    const dockerMenu = within(tools).getByRole('button', { name: 'Docker menu for Tools' });
    expect(list.contains(tabMenu)).toBe(false);
    expect(list.contains(dockerMenu)).toBe(false);
    expect(list.compareDocumentPosition(tabMenu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    focus(tab('Chords'));
    await userEvent.tab();
    expect(active()).toBe(tabMenu);
    await userEvent.tab();
    expect(active()).toBe(dockerMenu);
  });

  it('Escape on the strip returns focus to the active panel body (the tabpanel)', async () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    await userEvent.keyboard('{Escape}');
    expect(active()).toBe(hostOf('chords'));
    expect(active()).toHaveAttribute('role', 'tabpanel');

    focus(within(region('Tools')).getByRole('button', { name: 'Menu for Chords' }));
    await userEvent.keyboard('{Escape}');
    expect(active()).toBe(hostOf('chords'));
  });

  it('a menu Escape closes the menu and does not also jump to the panel', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(active()?.getAttribute('role')).not.toBe('tabpanel');
  });
});

describe('the docker menu returns focus', () => {
  const menuButton = (name: string) =>
    screen.getByRole('button', { name: `Docker menu for ${name}` });
  const choose = async (docker: string, item: string | RegExp) => {
    await userEvent.click(menuButton(docker));
    await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  };

  it('after Collapse and Expand, to the (new) menu button of the same docker', async () => {
    render(<Host initial={A()} />);
    await choose('Tools', 'Collapse');
    expect(region('Tools')).toHaveAttribute('data-state', 'collapsed');
    expect(active()).toBe(menuButton('Tools'));
    await choose('Tools', 'Expand');
    expect(region('Tools')).toHaveAttribute('data-state', 'open');
    expect(active()).toBe(menuButton('Tools'));
  });

  it('after New docker (named in the prompt), to the menu button', async () => {
    render(<Host initial={A()} />);
    await choose('Tools', 'New docker: Right');
    const input = await screen.findByRole('textbox', { name: 'Docker name' });
    expect(input).toHaveValue('Docker 4');
    await userEvent.type(input, '{Enter}');
    await waitFor(() => expect(treeDockers(stored().tree)).toHaveLength(4));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(active()).toBe(menuButton('Tools'));
  });

  it('after Remove, to another docker', async () => {
    render(<Host initial={C()} />);
    await choose('Tools', 'Remove docker');
    expect(treeDockers(stored().tree)).toHaveLength(2);
    expect(active()?.closest('section[data-docker-id]')).not.toBeNull();
    expect(selectedDocker()).toBe(active()?.closest('section')?.getAttribute('aria-label'));
  });

  it('Rename moves focus to its input, and back to the name when it ends with the keyboard', async () => {
    render(<Host initial={A()} />);
    await choose('Tools', 'Rename docker...');
    const input = await screen.findByRole('textbox', { name: 'Rename docker Tools' });
    await waitFor(() => expect(active()).toBe(input));
    await userEvent.keyboard('{Escape}');
    expect(active()).toBe(screen.getByRole('button', { name: 'Docker Tools' }));
  });
});

describe('docker shortcuts', () => {
  it('F6 and Shift+F6 cycle between dockers: ring the docker and focus its active tab', () => {
    render(<Host initial={A()} />);
    focus(tab('Chords')); // Tools is the last docker in tree order
    expect(key(F6)).toBe(false); // handled: default prevented
    expect(selectedDocker()).toBe('Canvas');
    expect(active()).toBe(tab('Canvas'));
    key(F6);
    expect(selectedDocker()).toBe('Detail');
    expect(active()).toBe(tab('Clip editor'));
    key({ ...F6, shiftKey: true });
    expect(selectedDocker()).toBe('Canvas');
    key({ ...F6, shiftKey: true }); // wraps to the last
    expect(selectedDocker()).toBe('Tools');
    expect(active()).toBe(tab('Chords'));
  });

  it('works from nothing focused (the body) and from inside a panel', () => {
    render(<Host initial={A()} />);
    (document.activeElement as HTMLElement | null)?.blur();
    key(F6, document.body);
    expect(selectedDocker()).toBe('Canvas');
    focus(screen.getByRole('button', { name: 'inc chords' }));
    key(altDigit(2));
    expect(selectedDocker()).toBe('Detail');
  });

  it('Alt+1 to Alt+9 jump to the nth docker in tree order; a missing docker does nothing', () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    expect(key(altDigit(2))).toBe(false);
    expect(selectedDocker()).toBe('Detail');
    expect(active()).toBe(tab('Clip editor'));
    key(altDigit(1));
    expect(selectedDocker()).toBe('Canvas');
    key(altDigit(3));
    expect(selectedDocker()).toBe('Tools');
    expect(key(altDigit(9))).toBe(true); // not handled: the default stays
    expect(selectedDocker()).toBe('Tools');
  });

  it('Alt+F6 and Alt+Shift+F6 move focus between the splitters', () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    const bars = screen.getAllByRole('separator');
    expect(bars).toHaveLength(2);
    key({ ...F6, altKey: true });
    expect(active()).toBe(bars[0]);
    key({ ...F6, altKey: true });
    expect(active()).toBe(bars[1]);
    key({ ...F6, altKey: true });
    expect(active()).toBe(bars[0]);
    key({ ...F6, altKey: true, shiftKey: true });
    expect(active()).toBe(bars[1]);
  });

  it('Go to docker (Alt+G) lists the dockers by name: arrows and Enter pick, Escape restores focus', async () => {
    render(<Host initial={A()} />);
    focus(tab('Chords'));
    key({ key: 'g', code: 'KeyG', altKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Go to docker' });
    const rows = within(dialog).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual(['CanvasAlt+1', 'DetailAlt+2', 'ToolsAlt+3']);
    await userEvent.keyboard('{ArrowUp}{Enter}'); // Tools was the selected docker's row; up is Detail
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(selectedDocker()).toBe('Detail');
    expect(active()).toBe(tab('Clip editor'));

    key({ key: 'g', code: 'KeyG', altKey: true });
    await screen.findByRole('dialog', { name: 'Go to docker' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(active()).toBe(tab('Clip editor'));
  });

  it('selecting a collapsed docker expands it', () => {
    render(<Host initial={{ ...A(), collapsed: ['d3'] }} />);
    expect(region('Tools')).toHaveAttribute('data-state', 'collapsed');
    focus(tab('Canvas'));
    key(altDigit(3));
    expect(region('Tools')).toHaveAttribute('data-state', 'open');
    expect(active()).toBe(tab('Chords'));
  });

  it('stays quiet while typing in an input, in the rename field, or when a panel handled the key', async () => {
    render(<Host initial={A()} />);
    focus(screen.getByRole('textbox', { name: 'outside' }));
    key(F6);
    key(altDigit(2));
    expect(selectedDocker()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Docker Canvas' }));
    const input = await screen.findByRole('textbox', { name: 'Rename docker Canvas' });
    key(altDigit(3), input);
    expect(selectedDocker()).toBe('Canvas');
    expect(active()).toBe(input);
    await userEvent.keyboard('{Escape}');
  });

  it('leaves a key a panel already handled alone', async () => {
    render(
      <Host
        initial={screenset({
          kind: 'split',
          dir: 'row',
          children: [
            { weight: 1, node: makeDocker('a', 'A', ['trap']) },
            { weight: 1, node: makeDocker('b', 'B', ['sets']) },
          ],
        })}
      />
    );
    focus(screen.getByTestId('trap'));
    key(F6);
    expect(selectedDocker()).toBeNull(); // the panel kept F6: no docker was selected
    expect(active()).toBe(screen.getByTestId('trap'));
    focus(tab('Sets'));
    key(F6); // the same key from a strip is the Stage's
    expect(selectedDocker()).toBe('A');
  });

  it('stays quiet while a menu is open, and works again once it is closed', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    await screen.findByRole('menu');
    key(altDigit(1), document.body);
    expect(selectedDocker()).toBe('Tools'); // the click selected it; the shortcut did nothing
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    key(altDigit(1), document.body);
    expect(selectedDocker()).toBe('Canvas');
  });

  it('removes its window listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<Host initial={A()} />);
    view.unmount();
    expect(remove.mock.calls.some(([type]) => type === 'keydown')).toBe(true);
    expect(() => key(F6, document.body)).not.toThrow();
  });
});

describe('acceptance chain and guards', () => {
  it('select a docker by shortcut, arrows move between its tabs without activating, Enter activates', async () => {
    render(<Host initial={A()} />);
    (document.activeElement as HTMLElement | null)?.blur();
    key(altDigit(3), document.body);
    expect(selectedDocker()).toBe('Tools');
    expect(active()).toBe(tab('Chords'));
    await userEvent.keyboard('{ArrowRight}');
    expect(active()).toBe(tab('Sets'));
    expect(tab('Chords')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');

    key(F6); // Tools is last: wraps to Canvas, then back with Shift+F6
    expect(selectedDocker()).toBe('Canvas');
    key({ ...F6, shiftKey: true });
    expect(selectedDocker()).toBe('Tools');
    expect(active()).toBe(tab('Sets'));
    await userEvent.keyboard('{ArrowRight}');
    expect(active()).toBe(tab('Voicings'));
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
  });

  it('drops a focus request whose target never appears; a later render does not move focus', async () => {
    function Frozen() {
      const [s, setS] = useState(
        screenset({
          kind: 'split',
          dir: 'row',
          children: [
            { weight: 1, node: makeDocker('a', 'A', ['canvas']) },
            { weight: 1, node: makeDocker('b', 'B', ['sets']) },
          ],
        })
      );
      const [api, setApi] = useState<StageApi | null>(null);
      const [, tick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => api?.show('desk', { focus: true })}>
            ask
          </button>
          <button type="button" onClick={() => tick((n) => n + 1)}>
            tick
          </button>
          <button
            type="button"
            onClick={() =>
              setS((cur) => ({ ...cur, tree: makeDocker('a', 'A', ['canvas', 'desk']) }))
            }
          >
            add desk
          </button>
          <input aria-label="elsewhere" />
          <DockStage
            registry={REGISTRY}
            screenset={s}
            update={() => {}}
            widthRem={100}
            heightRem={50}
            onApi={setApi}
          />
        </>
      );
    }
    render(<Frozen />);
    await userEvent.click(screen.getByRole('button', { name: 'ask' })); // the edit is ignored: no desk tab
    const elsewhere = screen.getByRole('textbox', { name: 'elsewhere' });
    focus(elsewhere);
    await userEvent.click(screen.getByRole('button', { name: 'tick' }));
    focus(elsewhere);
    await userEvent.click(screen.getByRole('button', { name: 'add desk' })); // the desk tab appears later
    focus(elsewhere);
    act(() => {});
    expect(screen.getByRole('tab', { name: 'Desk' })).toBeInTheDocument();
    expect(active()).toBe(elsewhere);
  });

  it('ignores a hidden, always-mounted dialog or listbox, but not a visible one', () => {
    render(
      <>
        <div role="dialog" aria-hidden="true" data-testid="h1" />
        <div role="listbox" hidden />
        <div role="dialog" data-state="closed" />
        <Host initial={A()} />
      </>
    );
    focus(tab('Chords'));
    key(F6);
    expect(selectedDocker()).toBe('Canvas');
    const open = document.createElement('div');
    open.setAttribute('role', 'dialog');
    document.body.appendChild(open);
    key(F6);
    expect(selectedDocker()).toBe('Canvas'); // a visible dialog holds the shortcuts
    open.remove();
  });

  it('only text-like inputs count as typing', () => {
    const input = (type: string) => {
      const el = document.createElement('input');
      el.type = type;
      return el;
    };
    for (const t of ['text', 'search', 'email', 'number', 'password', 'url', 'tel']) {
      expect(isTypingTarget(input(t))).toBe(true);
    }
    for (const t of ['checkbox', 'radio', 'range', 'button']) {
      expect(isTypingTarget(input(t))).toBe(false);
    }
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
  });

  it('Panels menu has Previous splitter with its key', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Panels' }));
    expect(await screen.findByRole('menuitem', { name: /Previous splitter/ })).toHaveTextContent(
      'Alt+Shift+F6'
    );
  });
});

describe('menu entries added in M3c', () => {
  const tabMenu = (title: string) => screen.getByRole('button', { name: `Menu for ${title}` });
  const dockerMenu = (name: string) =>
    screen.getByRole('button', { name: `Docker menu for ${name}` });

  const slotOf = (tree: TreeNode, id: string): SplitChild | undefined => {
    if (tree.kind === 'docker') {
      return undefined;
    }
    for (const c of tree.children) {
      if (c.node.kind === 'docker' && c.node.id === id) {
        return c;
      }
      const inner = slotOf(c.node, id);
      if (inner) {
        return inner;
      }
    }
    return undefined;
  };

  it('Flexible / Fixed size toggles the slot and keeps the docker its size', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(dockerMenu('Tools'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make flexible' }));
    expect(slotOf(stored().tree, 'd3')).toMatchObject({ weight: expect.any(Number) });
    expect(slotOf(stored().tree, 'd3')?.rem).toBeUndefined();
    expect(active()).toBe(dockerMenu('Tools'));

    await userEvent.click(dockerMenu('Tools'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make fixed size' }));
    expect(slotOf(stored().tree, 'd3')?.rem).toBeGreaterThan(0);
    expect(slotOf(stored().tree, 'd3')?.weight).toBeUndefined();
  });

  it('disables the size entry for the root docker', async () => {
    render(<Host initial={screenset(makeDocker('only', 'Only', ['canvas']))} />);
    await userEvent.click(dockerMenu('Only'));
    expect(await screen.findByRole('menuitem', { name: 'Make fixed size' })).toBeDisabled();
  });

  it('Move tab left and right reorder the active tab and are disabled at the ends', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(tabMenu('Chords'));
    expect(await screen.findByRole('menuitem', { name: 'Move tab left' })).toBeDisabled();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move tab right' }));
    expect(dockerOf('chords')?.tabs).toEqual(['sets', 'chords', 'voicings']);
    expect(dockerOf('chords')?.active).toBe('chords');
    expect(active()).toBe(tab('Chords'));

    await userEvent.click(tabMenu('Chords'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move tab right' }));
    await userEvent.click(tabMenu('Chords'));
    expect(await screen.findByRole('menuitem', { name: 'Move tab right' })).toBeDisabled();
  });

  it('disables Send to (not an empty list) when there is no other docker', async () => {
    render(<Host initial={screenset(makeDocker('only', 'Only', ['canvas', 'sets']))} />);
    await userEvent.click(tabMenu('Canvas'));
    expect(
      await screen.findByRole('menuitem', { name: 'Send to (no other docker)' })
    ).toBeDisabled();
  });

  it('asks for a name for New docker...: refuses an empty or taken name, Escape cancels', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(dockerMenu('Tools'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New docker: Left' }));
    const input = await screen.findByRole('textbox', { name: 'Docker name' });

    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(await screen.findByText('Enter a name for the docker.')).toBeInTheDocument();
    await userEvent.type(input, 'detail{Enter}');
    expect(await screen.findByText('A docker named "detail" already exists.')).toBeInTheDocument();
    expect(treeDockers(stored().tree)).toHaveLength(3);

    await userEvent.clear(input);
    await userEvent.type(input, 'Side{Enter}');
    await waitFor(() => expect(treeDockers(stored().tree).map((d) => d.name)).toContain('Side'));
    expect(treeDockers(stored().tree)).toHaveLength(4);
  });

  it('Escape in the name prompt cancels and changes nothing', async () => {
    render(<Host initial={A()} />);
    const before = screen.getByTestId('screenset').textContent;
    await userEvent.click(tabMenu('Chords'));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Send to new docker: Below' })
    );
    await screen.findByRole('textbox', { name: 'Docker name' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('screenset').textContent).toBe(before);
    expect(active()).toBe(tab('Chords'));
  });

  it('sends the panel into the named new docker', async () => {
    render(<Host initial={A()} />);
    await userEvent.click(tabMenu('Chords'));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Send to new docker: Right' })
    );
    const input = await screen.findByRole('textbox', { name: 'Docker name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Picker{Enter}');
    await waitFor(() => expect(dockerOf('chords')?.name).toBe('Picker'));
    expect(mounts.chords).toBe(1);
    expect(active()).toBe(tab('Chords'));
  });
});

describe('the Panels menu', () => {
  const open = async () => userEvent.click(screen.getByRole('button', { name: 'Panels' }));

  it('lists every registered panel but no reserved id; open ones are checked with Show, closed ones Open', async () => {
    render(<Host initial={A()} />);
    await open();
    const menu = await screen.findByRole('menu');
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent ?? '');
    expect(names.some((n) => /bridge|__/i.test(n))).toBe(false);
    expect(
      within(menu).getByRole('menuitem', { name: 'Show Canvas' }).querySelector('[data-check]')
    ).not.toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Open Desk' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Show Desk' })).not.toBeInTheDocument();
  });

  it('Show activates the panel tab and focuses it', async () => {
    render(<Host initial={A()} />);
    await open();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Show Sets' }));
    expect(dockerOf('sets')?.active).toBe('sets');
    expect(active()).toBe(tab('Sets'));
  });

  it('Open reopens a closed panel in its remembered docker', async () => {
    render(<Host initial={A()} />);
    await open();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Close Sets' }));
    expect(dockerOf('sets')).toBeNull();
    await open();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open Sets' }));
    expect(dockerOf('sets')?.name).toBe('Tools');
    expect(active()).toBe(screen.getByRole('button', { name: 'Panels' }));
  });

  it('offers New instance for multiple kinds and calls back with the kind', async () => {
    const onNew = vi.fn();
    render(<Host initial={A()} kinds={[{ id: 'note', title: 'Note' }]} onNewInstance={onNew} />);
    await open();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New Note instance' }));
    expect(onNew).toHaveBeenCalledWith('note');
  });

  it('has a Go to docker submenu by name and docker cycling entries with their keys', async () => {
    render(<Host initial={A()} />);
    await open();
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Next docker/ })).toHaveTextContent('F6');
    expect(within(menu).getByRole('menuitem', { name: /Previous docker/ })).toHaveTextContent(
      'Shift+F6'
    );
    await userEvent.hover(within(menu).getByRole('menuitem', { name: 'Go to docker' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Detail/ }));
    expect(selectedDocker()).toBe('Detail');
    expect(active()).toBe(tab('Clip editor'));
  });
});

describe('a dynamic registry', () => {
  const KINDS: PanelKind[] = [
    {
      id: 'canvas',
      title: 'Canvas',
      sizes: SIZES,
      minSize: { width: 'narrow', height: 'short' },
      render: () => <Probe id="canvas" />,
    },
    {
      id: 'note',
      title: 'Note',
      multiple: true,
      home: 'Tools',
      sizes: SIZES,
      minSize: { width: 'narrow', height: 'short' },
      render: (_size, k) => <Probe id={`note:${k}`} />,
    },
  ];
  const base = () =>
    makeScreenset({
      id: 's',
      name: 's',
      tree: {
        kind: 'split',
        dir: 'row',
        children: [
          { weight: 1, node: makeDocker('a', 'Main', ['canvas']) },
          { weight: 1, node: makeDocker('b', 'Tools', ['note:1']) },
        ],
      },
    });

  function Rebuilding() {
    const [instances, setInstances] = useState([{ kind: 'note', key: '1' }]);
    const registry = useStageRegistry(KINDS, instances);
    const [s, setS] = useState(base);
    const [api, setApi] = useState<StageApi | null>(null);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setInstances((cur) => [...cur, { kind: 'note', key: '2' }]);
          }}
        >
          add note 2
        </button>
        <button type="button" onClick={() => api?.open('note:2')}>
          open note 2
        </button>
        <button
          type="button"
          onClick={() => {
            const next = [{ kind: 'note', key: '2' }];
            setInstances(next);
            setS((cur) => reconcile(cur, knownPanelIds(KINDS, next)));
          }}
        >
          remove note 1
        </button>
        <DockStage
          registry={registry}
          screenset={s}
          update={setS}
          widthRem={100}
          heightRem={50}
          onApi={setApi}
        />
        <output data-testid="screenset">{JSON.stringify(s)}</output>
      </>
    );
  }

  it('keeps an existing panel its mount and host across a rebuild, and opens a new instance in its home docker', async () => {
    render(<Rebuilding />);
    await userEvent.click(screen.getByRole('button', { name: 'inc note:1' }));
    const host = hostOf('note:1');
    expect(screen.getByTestId('n-note:1')).toHaveTextContent('1');

    await userEvent.click(screen.getByRole('button', { name: 'add note 2' }));
    expect(hostOf('note:1')).toBe(host);
    expect(screen.getByTestId('n-note:1')).toHaveTextContent('1');
    expect(mounts['note:1']).toBe(1);
    expect(dockerOf('note:2')).toBeNull(); // registered, not open yet

    await userEvent.click(screen.getByRole('button', { name: 'open note 2' }));
    expect(dockerOf('note:2')?.name).toBe('Tools'); // its home docker
    expect(tab('Note 2')).toBeInTheDocument();
    expect(mounts['note:1']).toBe(1);
    expect(mounts['note:2']).toBe(1);
  });

  it('drops a removed instance: host removed, panel unmounted, tab closed once reconciled', async () => {
    render(<Rebuilding />);
    await userEvent.click(screen.getByRole('button', { name: 'add note 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'open note 2' }));
    expect(hostOf('note:2')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'remove note 1' }));
    expect(hostOf('note:1')).toBeNull();
    expect(unmounts['note:1']).toBe(1);
    expect(screen.queryByRole('tab', { name: 'Note 1' })).not.toBeInTheDocument();
    expect(dockerOf('note:1')).toBeNull();
    expect(hostOf('note:2')).not.toBeNull();
    expect(unmounts['note:2']).toBeUndefined();
  });

  it('knows an instance id before a stored screenset is parsed', () => {
    const raw = JSON.stringify(base());
    const known = knownPanelIds(KINDS, [{ kind: 'note', key: '1' }]);
    const keep = parseScreensetStore(raw, known, {
      fallback: { version: 1, active: 'x', order: [], screensets: {} },
    });
    expect(dockerHolding(keep.screensets.s.tree, 'note:1')).not.toBeNull();
    const lost = parseScreensetStore(raw, knownPanelIds(KINDS, []), {
      fallback: { version: 1, active: 'x', order: [], screensets: {} },
    });
    expect(dockerHolding(lost.screensets.s.tree, 'note:1')).toBeNull();
  });
});

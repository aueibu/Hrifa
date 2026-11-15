/** The dock Stage in jsdom: mounted-once panels, dockers and tabs, Send-to, the API, parking, keepMounted, the guard. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { act, render, screen, userEvent, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dockerHolding,
  makeDocker,
  slotSizeAttr,
  treeDockers,
  type Screenset,
  type SlotSize,
} from '../../../lib/stage';
import { arrangementA, arrangementC, screenset } from '../../../lib/stage/fixtures';
import { createStageRegistry, type StageModule } from '../registry';
import { DockStage } from './DockStage';
import { useStageApi, type StageApi } from './stageApi';

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
const bodyBox = { w: 640, h: 400 }; // px: 40 x 25 rem, so regular-short
const rect = (w: number, h: number) =>
  ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
const fireResize = () => act(() => observers.forEach((o) => o.cb()));

const realObserver = window.ResizeObserver;
const mounts: Record<string, number> = {};
let api: StageApi;

beforeEach(() => {
  observers.clear();
  bodyBox.w = 640;
  bodyBox.h = 400;
  for (const k of Object.keys(mounts)) {
    delete mounts[k];
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.hasAttribute('data-dock-body') ? rect(bodyBox.w, bodyBox.h) : rect(0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
});

function Probe({ id, size }: { id: string; size: SlotSize }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  return (
    <div data-probe={id}>
      <span data-testid={`size-${id}`}>{slotSizeAttr(size)}</span>
      <button type="button" onClick={() => setN((x) => x + 1)}>{`inc ${id}`}</button>
      <span data-testid={`n-${id}`}>{n}</span>
    </div>
  );
}
const layoutProbe = { inBody: null as boolean | null };
function LayoutProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    layoutProbe.inBody = ref.current?.closest('[data-dock-body]') !== null;
  }, []);
  return <div ref={ref} />;
}
function ApiGrab() {
  api = useStageApi();
  return null;
}

const GRID: SlotSize[] = (['narrow', 'regular', 'wide'] as const).flatMap((width) =>
  (['short', 'regular', 'tall'] as const).map((height) => ({ width, height }))
);
const mod = (id: string, over: Partial<StageModule> = {}): StageModule => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  sizes: GRID,
  minSize: { width: 'narrow', height: 'short' },
  render: (size) => <Probe id={id} size={size} />,
  ...over,
});
const REGISTRY = createStageRegistry([
  mod('canvas', { keepMounted: true }),
  mod('desk'),
  mod('clip-editor', { title: 'Clip editor', home: 'Detail' }),
  mod('chords', { home: 'Tools' }),
  mod('sets'),
  mod('voicings'),
  mod('visualizer'),
  mod('mid', { minSize: { width: 'regular', height: 'short' } }),
  mod('wide', { minSize: { width: 'wide', height: 'short' } }),
  mod('api', { keepMounted: true, render: () => <ApiGrab /> }),
  mod('lemount', { render: () => <LayoutProbe /> }),
]);

function Harness({
  initial,
  alt,
  widthRem = 100,
  heightRem = 50,
}: {
  initial: Screenset;
  alt?: Screenset;
  widthRem?: number;
  heightRem?: number;
}) {
  const [s, setS] = useState(initial);
  return (
    <>
      <DockStage
        registry={REGISTRY}
        screenset={s}
        update={setS}
        widthRem={widthRem}
        heightRem={heightRem}
        showSizes
      />
      {alt && (
        <button type="button" onClick={() => setS((cur) => (cur === initial ? alt : initial))}>
          toggle screenset
        </button>
      )}
      <output data-testid="screenset">{JSON.stringify(s)}</output>
    </>
  );
}
const stored = () => JSON.parse(screen.getByTestId('screenset').textContent!) as Screenset;
const dockerOf = (panel: string) => dockerHolding(stored().tree, panel);
const hostOf = (id: string) => document.querySelector<HTMLElement>(`[data-panel-host="${id}"]`)!;
const region = (name: string) => screen.getByRole('region', { name });
const notice = () => document.querySelector('p[role="status"]');
const A = () => screenset(arrangementA);
const C = () => screenset(arrangementC);

/** The tab menu belongs to the ACTIVE tab (one button after the strip), so activate the tab first. */
async function sendFromMenu(panelTitle: string, entry: string | RegExp) {
  const tab = screen.getByRole('tab', { name: panelTitle });
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab);
  }
  await userEvent.click(screen.getByRole('button', { name: `Menu for ${panelTitle}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: entry }));
  if (String(entry).includes('new docker')) {
    // the name prompt: accept the default name
    await userEvent.click(await screen.findByRole('button', { name: 'Create' }));
  }
}

describe('mounted once', () => {
  it('keeps a panel its state when sent between dockers by name and when its tab is inactive', async () => {
    render(<Harness initial={A()} />);
    await userEvent.click(screen.getByRole('button', { name: 'inc chords' }));
    await userEvent.click(screen.getByRole('button', { name: 'inc chords' }));
    expect(screen.getByTestId('n-chords')).toHaveTextContent('2');

    // inactive tab: Sets in front, Chords parked in place but still mounted
    await userEvent.click(screen.getByRole('tab', { name: 'Sets' }));
    expect(screen.getByRole('tab', { name: 'Sets' })).toHaveAttribute('aria-selected', 'true');
    expect(hostOf('chords')).toHaveAttribute('inert');
    expect(hostOf('chords').style.opacity).toBe('0');
    expect(hostOf('chords').style.visibility).toBe('hidden');
    expect(hostOf('chords').style.display).not.toBe('none');
    expect(hostOf('chords').isConnected).toBe(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Chords' }));
    expect(hostOf('chords')).not.toHaveAttribute('inert');

    // sent by docker name from the tab menu
    await sendFromMenu('Chords', 'Detail');
    expect(dockerOf('chords')?.name).toBe('Detail');
    expect(within(region('Detail')).getByRole('tab', { name: 'Chords' })).toBeInTheDocument();
    expect(screen.getByTestId('n-chords')).toHaveTextContent('2');
    expect(mounts.chords).toBe(1);
    expect(hostOf('chords').closest('[data-dock-body]')?.getAttribute('data-dock-body')).toBe('d2');
  });

  it('sends a panel to a new docker in a chosen direction', async () => {
    render(<Harness initial={A()} />);
    await sendFromMenu('Chords', 'Send to new docker: Right');
    const dockers = treeDockers(stored().tree);
    expect(dockers).toHaveLength(4);
    const made = dockerOf('chords')!;
    expect(made.tabs).toEqual(['chords']);
    expect(made.name).toMatch(/^Docker \d+$/);
    expect(region(made.name)).toBeInTheDocument();
    expect(mounts.chords).toBe(1);
  });

  it('restores a panel host scroll after it is moved', async () => {
    render(<Harness initial={A()} />);
    const host = hostOf('chords');
    let top = 0;
    const writes: number[] = [];
    Object.defineProperty(host, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        writes.push(v);
        top = v;
      },
    });
    top = 120;
    host.dispatchEvent(new Event('scroll'));
    top = 0; // the browser loses it on the move
    await sendFromMenu('Chords', 'Detail');
    expect(writes).toContain(120);
  });
});

describe('dockers', () => {
  it('shows an emptied docker as a strip and lets it accept a panel', async () => {
    render(<Harness initial={C()} />);
    expect(region('Tools')).toHaveAttribute('data-state', 'empty');
    await sendFromMenu('Clip editor', 'Tools');
    expect(region('Detail')).toHaveAttribute('data-state', 'empty'); // emptied, still there, named
    expect(region('Tools')).toHaveAttribute('data-state', 'open');
    expect(dockerOf('clip-editor')?.name).toBe('Tools');
    expect(mounts['clip-editor']).toBe(1);
    expect(treeDockers(stored().tree)).toHaveLength(3);
  });

  it('renames a docker from its name', async () => {
    render(<Harness initial={A()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Docker Tools' }));
    const input = screen.getByRole('textbox', { name: 'Rename docker Tools' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Helpers{Enter}');
    expect(treeDockers(stored().tree).map((d) => d.name)).toContain('Helpers');
    expect(region('Helpers')).toBeInTheDocument();
  });

  it('does not remove a docker that still has tabs, and removes an empty one', async () => {
    render(<Harness initial={C()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Detail' }));
    expect(await screen.findByRole('menuitem', { name: 'Remove docker' })).toHaveAttribute(
      'data-disabled'
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove docker' }));
    expect(treeDockers(stored().tree).map((d) => d.name)).toEqual(['Canvas', 'Detail']);
  });
});

describe('useStageApi', () => {
  it('reopens a closed panel in its remembered docker', async () => {
    render(<Harness initial={A()} />);
    await sendFromMenu('Sets', 'Detail');
    expect(dockerOf('sets')?.name).toBe('Detail');
    act(() => api.close('sets'));
    expect(api.isOpen('sets')).toBe(false);
    expect(dockerOf('sets')).toBeNull();
    expect(screen.queryByTestId('n-sets')).not.toBeInTheDocument(); // not keepMounted: unmounted
    act(() => api.open('sets'));
    expect(dockerOf('sets')?.name).toBe('Detail');
    expect(api.isOpen('sets')).toBe(true);
  });

  it('show opens a closed panel and activates its tab', () => {
    render(<Harness initial={A()} />);
    act(() => api.close('voicings'));
    act(() => api.close('chords'));
    expect(stored().tree).toBeTruthy();
    expect(dockerOf('sets')?.active).toBe('sets');
    act(() => api.show('voicings'));
    expect(dockerOf('voicings')?.name).toBe('Tools');
    expect(dockerOf('voicings')?.active).toBe('voicings');
    expect(api.isShown('voicings')).toBe(true);
    expect(api.isShown('sets')).toBe(false);
    expect(screen.getByRole('tab', { name: 'Voicings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('show expands a collapsed docker', () => {
    render(<Harness initial={{ ...A(), collapsed: ['d3'] }} />);
    expect(region('Tools')).toHaveAttribute('data-state', 'collapsed');
    expect(api.isShown('chords')).toBe(false);
    act(() => api.show('sets'));
    expect(region('Tools')).toHaveAttribute('data-state', 'open');
    expect(stored().collapsed).toBeUndefined();
    expect(dockerOf('sets')?.active).toBe('sets');
    expect(api.isShown('sets')).toBe(true);
  });

  it('open does not expand a collapsed docker (only show does)', () => {
    render(<Harness initial={{ ...A(), collapsed: ['d3'] }} />);
    act(() => api.close('voicings'));
    act(() => api.open('voicings'));
    expect(region('Tools')).toHaveAttribute('data-state', 'collapsed');
  });

  it('sendTo goes through the same operation as the menu', () => {
    render(<Harness initial={A()} />);
    act(() => api.sendTo('chords', { kind: 'docker', docker: 'd2' }));
    expect(dockerOf('chords')?.name).toBe('Detail');
    expect(mounts.chords).toBe(1);
  });
});

describe('parking', () => {
  it('keeps the last measured size class and a laid-out park box for a collapsed docker', async () => {
    render(<Harness initial={A()} />);
    expect(screen.getByTestId('size-chords')).toHaveTextContent('regular-short');
    expect(screen.getByTestId('size-sets')).toHaveTextContent('regular-short'); // an inactive tab shares the body

    // the observer reports a body with no box: nothing changes
    bodyBox.w = 0;
    bodyBox.h = 0;
    fireResize();
    expect(screen.getByTestId('size-chords')).toHaveTextContent('regular-short');

    // collapse Tools: its panels are parked at the last measured size, not detached, not display: none
    bodyBox.w = 640;
    bodyBox.h = 400;
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Collapse' }));
    expect(region('Tools')).toHaveAttribute('data-state', 'collapsed');
    const host = hostOf('chords');
    const park = host.closest<HTMLElement>('[data-park]')!;
    expect(park.dataset.park).toBe('park:docker:d3');
    expect(park.style.width).toBe('40rem');
    expect(park.style.height).toBe('25rem');
    expect(park.hasAttribute('inert')).toBe(true);
    expect(host.isConnected).toBe(true);
    expect(host.style.opacity).toBe('0');
    expect(host.style.visibility).toBe('hidden');
    expect(host.style.pointerEvents).toBe('none');
    expect(host).toHaveAttribute('inert');
    bodyBox.w = 0;
    bodyBox.h = 0;
    fireResize();
    expect(screen.getByTestId('size-chords')).toHaveTextContent('regular-short');
    expect(mounts.chords).toBe(1);

    // expanding brings it back to a docker body, unparked
    await userEvent.click(screen.getByRole('button', { name: 'Docker Tools' }));
    expect(region('Tools')).toHaveAttribute('data-state', 'open');
    expect(hostOf('chords').closest('[data-dock-body]')).not.toBeNull();
    expect(hostOf('chords')).not.toHaveAttribute('inert');
    expect(mounts.chords).toBe(1);
  });

  it('parks the panels of a docker the narrow rule hides', () => {
    render(<Harness initial={A()} widthRem={20} />);
    // 20 rem cannot hold Detail and Tools (12 each): the far one becomes a strip
    const states = treeDockers(stored().tree).map((d) => region(d.name).getAttribute('data-state'));
    expect(states).toContain('narrow');
    const narrow = treeDockers(stored().tree).find(
      (d) => region(d.name).getAttribute('data-state') === 'narrow'
    )!;
    const host = hostOf(narrow.tabs[0]);
    expect(host.closest('[data-park]')).not.toBeNull();
    expect(host).toHaveAttribute('inert');
    expect(host.isConnected).toBe(true);
  });
});

describe('keepMounted', () => {
  it('survives a screenset change without remounting, parked while it is in no docker', async () => {
    const other = screenset(makeDocker('x1', 'Other', ['sets']) as never, 'other');
    render(<Harness initial={A()} alt={other} />);
    await userEvent.click(screen.getByRole('button', { name: 'inc canvas' }));
    expect(screen.getByTestId('n-canvas')).toHaveTextContent('1');
    expect(hostOf('canvas').closest('[data-dock-body]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'toggle screenset' }));
    expect(screen.getByRole('region', { name: 'Other' })).toBeInTheDocument();
    expect(hostOf('canvas').isConnected).toBe(true);
    expect(hostOf('canvas').closest('[data-park]')?.getAttribute('data-park')).toBe(
      'park:panel:canvas'
    );
    expect(hostOf('canvas')).toHaveAttribute('inert');
    expect(screen.queryByTestId('n-chords')).not.toBeInTheDocument(); // not keepMounted: unmounted

    await userEvent.click(screen.getByRole('button', { name: 'toggle screenset' }));
    expect(screen.getByTestId('n-canvas')).toHaveTextContent('1');
    expect(mounts.canvas).toBe(1);
    expect(hostOf('canvas').closest('[data-dock-body]')).not.toBeNull();
  });

  it('mounts a keepMounted panel that was never open, once', () => {
    render(<Harness initial={screenset(makeDocker('x1', 'Other', ['sets']) as never)} />);
    expect(mounts.canvas).toBe(1);
    expect(hostOf('canvas').closest('[data-park]')).not.toBeNull();
    expect(api).toBeDefined();
  });
});

describe('guarded sends (W-30)', () => {
  const row = (a: string[], b: string[]): Screenset =>
    screenset({
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: makeDocker('a', 'A', a) },
        { weight: 1, node: makeDocker('b', 'B', b) },
      ],
    });

  it('refuses a send that leaves an open docker below its panel minimum', async () => {
    render(<Harness initial={row(['canvas', 'wide'], ['sets'])} widthRem={30} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Canvas' }));
    await sendFromMenu('Wide', 'B');
    expect(dockerOf('wide')?.name).toBe('A'); // unchanged
    expect(await screen.findByText(/Not enough room/)).toBe(notice());
    expect(screen.getByRole('region', { name: 'A' })).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('region', { name: 'B' })).toHaveAttribute('data-selected', 'false');
  });

  it('allows a send that only makes the narrow rule collapse a neighbour', async () => {
    render(<Harness initial={row(['canvas'], ['sets', 'mid'])} widthRem={40} />);
    await sendFromMenu('Mid', 'A');
    expect(dockerOf('mid')?.name).toBe('A');
    expect(region('B')).toHaveAttribute('data-state', 'narrow');
    expect(notice()).toBeEmptyDOMElement();
  });

  it('never guards show or open, even when the panel does not fit', () => {
    render(<Harness initial={{ ...row(['canvas'], ['sets']), collapsed: ['b'] }} widthRem={30} />);
    act(() => api.close('wide'));
    act(() => api.show('wide'));
    expect(api.isOpen('wide')).toBe(true);
  });
});

describe('structure', () => {
  it('gives dockers the region and tab roles', () => {
    render(<Harness initial={A()} />);
    const tools = region('Tools');
    const list = within(tools).getByRole('tablist');
    expect(
      within(list)
        .getAllByRole('tab')
        .map((t) => t.textContent)
    ).toEqual(['Chords', 'Sets', 'Voicings']);
    const selected = within(list).getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('Chords');
    expect(selected).toHaveAttribute('aria-controls', hostOf('chords').id);
    expect(hostOf('chords')).toHaveAttribute('role', 'tabpanel');
    expect(hostOf('chords')).toHaveAttribute('aria-labelledby', selected.id);
  });

  it('puts the splitters between split children and nudges one with the arrow keys', async () => {
    render(<Harness initial={A()} />);
    const bars = screen.getAllByRole('separator');
    expect(bars).toHaveLength(2);
    const before = stored();
    bars[0].focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(stored()).not.toEqual(before);
  });
});

describe('hosts are never detached', () => {
  /** Any removeChild of a host, or of a node holding one, is a detach (React unmounting a container with a host in it). */
  function watchDetaches() {
    const detached: string[] = [];
    const real = Node.prototype.removeChild;
    vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(
      this: Node,
      child: T
    ): T {
      for (const h of document.querySelectorAll<HTMLElement>('[data-panel-host]')) {
        if ((child as Node) === h || child.contains(h)) {
          detached.push(h.dataset.panelHost ?? '?');
        }
      }
      return real.call(this, child) as T;
    });
    return detached;
  }

  it('through collapse, expand, sending out the last tab and a screenset switch', async () => {
    const detached = watchDetaches();
    const other = screenset(makeDocker('x1', 'Other', ['sets']) as never, 'other');
    render(<Harness initial={C()} alt={other} />);

    // collapse and expand Canvas (two tabs, one keepMounted)
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Canvas' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Collapse' }));
    expect(region('Canvas')).toHaveAttribute('data-state', 'collapsed');
    await userEvent.click(screen.getByRole('button', { name: 'Docker Canvas' }));
    expect(region('Canvas')).toHaveAttribute('data-state', 'open');

    // send the last tab of Detail out (Detail becomes an empty strip)
    await sendFromMenu('Clip editor', 'Tools');
    expect(region('Detail')).toHaveAttribute('data-state', 'empty');

    // switch to a screenset without the keepMounted canvas and back
    await userEvent.click(screen.getByRole('button', { name: 'toggle screenset' }));
    await userEvent.click(screen.getByRole('button', { name: 'toggle screenset' }));

    expect(detached).toEqual([]);
    expect(mounts.canvas).toBe(1);
    expect(mounts['clip-editor']).toBe(1);
  });

  it('adopts a newly opened panel into its docker before its own layout effects run', () => {
    layoutProbe.inBody = null;
    render(<Harness initial={A()} />);
    act(() => api.show('lemount'));
    expect(layoutProbe.inBody).toBe(true);
  });

  it('parks a panel in a box with the docker body padding so it keeps its shown size', async () => {
    render(<Harness initial={A()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Docker menu for Tools' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Collapse' }));
    const park = hostOf('chords').closest<HTMLElement>('[data-park]')!;
    expect(park.style.boxSizing).toBe('border-box');
    expect(park.style.padding).toBe('var(--body-padding)');
    expect(park.style.width).toBe('40rem');
  });
});

describe('selection and the status line', () => {
  const row3 = (): Screenset =>
    screenset({
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: makeDocker('a', 'A', ['canvas']) },
        { weight: 1, node: makeDocker('b', 'B', ['sets', 'voicings']) },
      ],
    });

  it('counts a new docker as selected while judging a send into it, and selects it', async () => {
    // A (12) + B (12) fit in 36 rem; a third docker does not: the far end must not be the new one
    render(<Harness initial={row3()} widthRem={36} />);
    await sendFromMenu('Voicings', 'Send to new docker: Right');
    const made = dockerOf('voicings')!;
    expect(made.name).toMatch(/^Docker /);
    expect(region(made.name)).toHaveAttribute('data-state', 'open');
    expect(region(made.name)).toHaveAttribute('data-selected', 'true');
    expect(region('B')).toHaveAttribute('data-state', 'narrow');
  });

  it('ignores a send of an unregistered panel id', () => {
    render(<Harness initial={A()} />);
    const before = screen.getByTestId('screenset').textContent;
    act(() => api.sendTo('nope', { kind: 'docker', docker: 'd2' }));
    expect(screen.getByTestId('screenset').textContent).toBe(before);
  });

  it('keeps one status element, restarts its timer on a repeated refusal and announces it again', () => {
    vi.useFakeTimers();
    try {
      render(
        <Harness
          initial={screenset({
            kind: 'split',
            dir: 'row',
            children: [
              { weight: 1, node: makeDocker('a', 'A', ['canvas', 'wide']) },
              { weight: 1, node: makeDocker('b', 'B', ['sets']) },
            ],
          })}
          widthRem={30}
        />
      );
      const el = notice()!;
      expect(el).toBeEmptyDOMElement();
      const refuse = () => act(() => api.sendTo('wide', { kind: 'docker', docker: 'b' }));
      const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
      refuse();
      expect(el).toBeEmptyDOMElement(); // cleared, then set on the next tick
      tick(1);
      expect(el).toHaveTextContent(/Not enough room/);
      tick(3000);
      refuse();
      tick(1);
      expect(el).toHaveTextContent(/Not enough room/);
      tick(3500); // 6.5 s after the first refusal, 3.5 s after the second
      expect(el).toHaveTextContent(/Not enough room/);
      tick(600);
      expect(el).toBeEmptyDOMElement();
      expect(notice()).toBe(el);
    } finally {
      vi.useRealTimers();
    }
  });
});

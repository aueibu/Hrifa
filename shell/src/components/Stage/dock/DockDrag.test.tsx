/**
 * Drag-to-dock in jsdom. jsdom has no layout, so every rectangle the drag reads is stubbed: the root, the dockers' tab
 * headers and tabs (the dockers themselves come from the pure geometry, `layoutTree`, at the Harness's rem size). Only a
 * real browser can check hit-testing, the shield over canvases and the look of the preview.
 */
import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPLIT_MAX_DEPTH,
  dockerHolding,
  makeDocker,
  treeDepth,
  type Workspace,
  type SlotSize,
  type TreeNode,
} from '../../../lib/stage';
import { arrangementA, workspace } from '../../../lib/stage/fixtures';
import { createStageRegistry, type StageModule } from '../registry';
import { layoutTree } from './dockLayout';
import { DockStage } from './DockStage';
import { useStageApi, type StageApi } from './stageApi';

vi.setConfig({ testTimeout: 15_000 });

const PX = 16;
const W = 100;
const H = 50;
const TAB_W = 90;
const TAB_STEP = 96;
const HEADER_H = 32;

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const realObserver = window.ResizeObserver;
const mounts: Record<string, number> = {};
let api: StageApi;

const rectPx = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

let geometry = layoutTree(workspace(arrangementA), W, H);
const rectOfDocker = (id: string) => {
  const p = geometry.dockers.find((d) => d.docker.id === id)!;
  return { x: p.x * PX, y: p.y * PX, w: p.width * PX, h: p.height * PX };
};

beforeEach(() => {
  for (const k of Object.keys(mounts)) {
    delete mounts[k];
  }
  geometry = layoutTree(workspace(arrangementA), W, H);
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-dock-root')) {
      return rectPx(0, 0, W * PX, H * PX);
    }
    if (this.hasAttribute('data-dock-body')) {
      return rectPx(0, 0, 640, 400);
    }
    const id = this.closest('[data-docker-id]')?.getAttribute('data-docker-id');
    const docker = id ? geometry.dockers.find((d) => d.docker.id === id) : undefined;
    if (docker && this.hasAttribute('data-dock-header')) {
      return rectPx(docker.x * PX, docker.y * PX, docker.width * PX, HEADER_H);
    }
    if (docker && this.getAttribute('role') === 'presentation') {
      const i = docker.docker.tabs.indexOf(
        this.querySelector('[data-tab-id]')!.getAttribute('data-tab-id')!
      );
      return rectPx(docker.x * PX + 8 + i * TAB_STEP, docker.y * PX, TAB_W, HEADER_H);
    }
    return rectPx(0, 0, 0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
});

function ApiGrab() {
  api = useStageApi();
  return null;
}
function Probe({ id }: { id: string }) {
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  return <div data-probe={id} />;
}
const GRID: SlotSize[] = (['narrow', 'regular', 'wide'] as const).flatMap((width) =>
  (['short', 'regular', 'tall'] as const).map((height) => ({ width, height }))
);
const mod = (id: string, over: Partial<StageModule> = {}): StageModule => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  sizes: GRID,
  minSize: { width: 'narrow', height: 'short' },
  render: () => <Probe id={id} />,
  ...over,
});
const REGISTRY = createStageRegistry([
  mod('canvas', { keepMounted: true }),
  mod('data-block-editor', { title: 'Data-block editor', home: 'Detail' }),
  mod('chords', { home: 'Tools' }),
  mod('sets'),
  mod('voicings'),
  mod('wide', { minSize: { width: 'wide', height: 'short' } }),
  mod('api', { keepMounted: true, render: () => <ApiGrab /> }),
]);

function Harness({ initial, widthRem = W }: { initial: Workspace; widthRem?: number }) {
  const [s, setS] = useState(initial);
  return (
    <>
      <DockStage
        registry={REGISTRY}
        workspace={s}
        update={setS}
        widthRem={widthRem}
        heightRem={H}
      />
      <output data-testid="workspace">{JSON.stringify(s)}</output>
    </>
  );
}
const stored = () => JSON.parse(screen.getByTestId('workspace').textContent!) as Workspace;
const raw = () => screen.getByTestId('workspace').textContent;
const tab = (name: string) => screen.getByRole('tab', { name });
const shield = () => document.querySelector('[data-dock-shield]');
const preview = () => document.querySelector<HTMLElement>('[data-dock-preview]');
const notice = () => document.querySelector('p[role="status"]');
const A = () => workspace(arrangementA);

const ev = (x: number, y: number) => ({
  clientX: x,
  clientY: y,
  button: 0,
  buttons: 1,
  pointerId: 1,
  isPrimary: true,
});
/** Press the tab, then move to `to` (a first small move crosses the threshold). */
function startDrag(name: string, from = { x: 600, y: 700 }, to?: { x: number; y: number }) {
  fireEvent.pointerDown(tab(name), ev(from.x, from.y));
  fireEvent.pointerMove(document, ev(from.x + 3, from.y + 3));
  if (!to) {
    return;
  }
  fireEvent.pointerMove(document, ev(to.x, to.y));
}
const drop = (x: number, y: number) => fireEvent.pointerUp(document, ev(x, y));
const centre = (id: string) => {
  const r = rectOfDocker(id);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

describe('drag-to-dock', () => {
  it('does not start a drag below the threshold: a click selects the tab', () => {
    render(<Harness initial={A()} />);
    fireEvent.pointerDown(tab('Sets'), ev(600, 700));
    fireEvent.pointerMove(document, ev(602, 701)); // 2.2 px
    expect(shield()).toBeNull();
    fireEvent.pointerUp(document, ev(602, 701));
    fireEvent.click(tab('Sets'));
    expect(shield()).toBeNull();
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
    expect(dockerHolding(stored().tree, 'sets')?.name).toBe('Tools');
  });

  it('shows the shield, a preview and the label only while dragging', () => {
    render(<Harness initial={A()} />);
    expect(shield()).toBeNull();
    startDrag('Sets', undefined, centre('d2'));
    expect(shield()).toBeInTheDocument();
    expect(shield()).toHaveAttribute('aria-hidden', 'true');
    expect(preview()).toHaveAttribute('data-zone', 'center');
    expect(preview()).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[data-dock-drag-label]')).toHaveTextContent('Sets');
    expect(tab('Sets')).toHaveAttribute('data-dragging', 'true');
    expect(stored().tree).toEqual(A().tree); // nothing moves during the drag
    drop(centre('d2').x, centre('d2').y);
    expect(shield()).toBeNull();
    expect(preview()).toBeNull();
    expect(tab('Sets')).toHaveAttribute('data-dragging', 'false');
  });

  it('joins a tab to another docker on a centre drop, keeping the panel mounted once', async () => {
    render(<Harness initial={A()} />);
    startDrag('Sets', undefined, centre('d2'));
    drop(centre('d2').x, centre('d2').y);
    expect(dockerHolding(stored().tree, 'sets')?.name).toBe('Detail');
    expect(dockerHolding(stored().tree, 'sets')?.active).toBe('sets');
    expect(mounts.sets).toBe(1);
    expect(mounts.canvas).toBe(1);
    expect(await screen.findByText('Moved Sets to Detail')).toBe(notice());
    expect(screen.getByRole('region', { name: 'Detail' })).toHaveAttribute('data-selected', 'true');
  });

  it('splits a new docker on an edge drop', async () => {
    render(<Harness initial={A()} />);
    const d2 = rectOfDocker('d2');
    const to = { x: d2.x + d2.w - 10, y: d2.y + d2.h / 2 }; // the right band of Detail
    startDrag('Voicings', undefined, to);
    expect(preview()).toHaveAttribute('data-zone', 'right');
    drop(to.x, to.y);
    const made = dockerHolding(stored().tree, 'voicings')!;
    expect(made.tabs).toEqual(['voicings']);
    expect(made.name).toMatch(/^Docker \d+$/);
    expect(screen.getByRole('region', { name: made.name })).toHaveAttribute(
      'data-selected',
      'true'
    );
    expect(mounts.voicings).toBe(1);
    expect(await screen.findByText('Moved Voicings to a new docker')).toBe(notice());
  });

  it('splits at the Stage root on the outer band', () => {
    render(<Harness initial={A()} />);
    const to = { x: 8, y: 300 }; // 0.5 rem from the left edge
    startDrag('Voicings', undefined, to);
    expect(preview()).toHaveAttribute('data-zone', 'root-left');
    drop(to.x, to.y);
    const root = stored().tree as {
      kind: 'split';
      dir: string;
      children: { node: { id?: string } }[];
    };
    expect(root.dir).toBe('row');
    expect(root.children[0].node.id).toBe(dockerHolding(stored().tree, 'voicings')!.id);
    expect(mounts.voicings).toBe(1);
  });

  it('reorders tabs by their position on the strip', () => {
    render(<Harness initial={A()} />);
    const d3 = rectOfDocker('d3');
    const to = { x: d3.x + 8 + 3 * TAB_STEP + 5, y: d3.y + 10 }; // after the last tab
    startDrag('Chords', { x: d3.x + 20, y: d3.y + 10 }, to);
    expect(preview()).toHaveAttribute('data-zone', 'tabs');
    drop(to.x, to.y);
    expect(dockerHolding(stored().tree, 'chords')?.tabs).toEqual(['sets', 'voicings', 'chords']);
  });

  it('produces the same workspace as the equivalent menu choice', async () => {
    const viaMenu = render(<Harness initial={A()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu for Chords' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Send to new docker: Left' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create' })); // the name prompt: the default name
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const menuResult = raw();
    viaMenu.unmount();

    render(<Harness initial={A()} />);
    const d3 = rectOfDocker('d3');
    const to = { x: d3.x + 10, y: d3.y + d3.h / 2 };
    startDrag('Chords', { x: d3.x + 20, y: d3.y + 10 }, to);
    expect(preview()).toHaveAttribute('data-zone', 'left');
    drop(to.x, to.y);
    // the drop selects the new docker, the menu does too: only the status line differs, and that is not in the data
    expect(raw()).toBe(menuResult);
  });

  it('does nothing for a drop in the same docker that changes no index', () => {
    render(<Harness initial={A()} />);
    const before = raw();
    const c = centre('d3');
    startDrag('Chords', { x: c.x, y: rectOfDocker('d3').y + 10 }, c);
    expect(preview()).toBeNull(); // a no-op zone shows no preview
    drop(c.x, c.y);
    expect(raw()).toBe(before);
    expect(notice()).toBeEmptyDOMElement();
  });

  it('cancels on Escape and restores everything; the release afterwards changes nothing', () => {
    render(<Harness initial={A()} />);
    const before = raw();
    startDrag('Sets', undefined, centre('d2'));
    expect(shield()).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(shield()).toBeNull();
    expect(preview()).toBeNull();
    fireEvent.pointerUp(document, ev(centre('d2').x, centre('d2').y));
    expect(raw()).toBe(before);
    expect(tab('Chords')).toHaveAttribute('aria-selected', 'true');
  });

  it('cancels on pointercancel', () => {
    render(<Harness initial={A()} />);
    const before = raw();
    startDrag('Sets', undefined, centre('d2'));
    fireEvent.pointerCancel(document, ev(0, 0));
    expect(shield()).toBeNull();
    expect(raw()).toBe(before);
  });

  it('gives no target (and changes nothing) when released outside every docker', () => {
    render(<Harness initial={A()} />);
    const before = raw();
    startDrag('Sets', undefined, { x: W * PX + 50, y: 100 });
    expect(preview()).toBeNull();
    drop(W * PX + 50, 100);
    expect(raw()).toBe(before);
  });

  it('leaves the workspace unchanged and shows the status line when the drop is refused', async () => {
    const row = workspace({
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: makeDocker('a', 'A', ['canvas', 'wide']) },
        { weight: 1, node: makeDocker('b', 'B', ['sets']) },
      ],
    });
    geometry = layoutTree(row, 30, H);
    render(<Harness initial={row} widthRem={30} />);
    fireEvent.click(tab('Canvas'));
    const before = raw();
    const b = rectOfDocker('b');
    const to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    startDrag('Wide', { x: 100, y: 10 }, to);
    drop(to.x, to.y);
    expect(raw()).toBe(before);
    expect(await screen.findByText(/Not enough room/)).toBe(notice());
    expect(screen.getByRole('region', { name: 'A' })).toHaveAttribute('data-selected', 'true');
  });

  it('ignores a press that is not the primary button', () => {
    render(<Harness initial={A()} />);
    fireEvent.pointerDown(tab('Sets'), { ...ev(600, 700), button: 2 });
    fireEvent.pointerMove(document, ev(640, 740));
    expect(shield()).toBeNull();
  });

  it('eats the click right after a drop once, never a later one', () => {
    render(<Harness initial={A()} />);
    const d3 = rectOfDocker('d3');
    // a same-docker no-op drop on the Sets tab itself: no change, and the click that follows must not activate it
    startDrag('Sets', { x: d3.x + 20, y: d3.y + 10 }, centre('d3'));
    drop(centre('d3').x, centre('d3').y);
    fireEvent.click(tab('Sets'));
    expect(tab('Chords')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tab('Sets')); // the eater is spent
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
  });

  it('does not let a stale eater eat a click after a timeout', () => {
    vi.useFakeTimers();
    try {
      render(<Harness initial={A()} />);
      const d3 = rectOfDocker('d3');
      startDrag('Sets', { x: d3.x + 20, y: d3.y + 10 }, centre('d3'));
      drop(centre('d3').x, centre('d3').y);
      act(() => void vi.advanceTimersByTime(300));
      fireEvent.click(tab('Sets'));
      expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('after Escape a later press and click on a tab select normally', () => {
    render(<Harness initial={A()} />);
    const d3 = rectOfDocker('d3');
    startDrag('Sets', { x: d3.x + 20, y: d3.y + 10 }, centre('d2'));
    fireEvent.keyDown(document, { key: 'Escape' });
    // the button was released outside the window: no pointerup arrives; the next press starts clean
    fireEvent.pointerDown(tab('Sets'), ev(d3.x + 20, d3.y + 10));
    fireEvent.pointerUp(document, ev(d3.x + 20, d3.y + 10));
    fireEvent.click(tab('Sets'));
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
  });

  it('eats the click that follows the release after an Escape', () => {
    render(<Harness initial={A()} />);
    const d3 = rectOfDocker('d3');
    startDrag('Sets', { x: d3.x + 20, y: d3.y + 10 }, centre('d2'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerUp(document, ev(centre('d2').x, centre('d2').y));
    fireEvent.click(tab('Sets'));
    expect(tab('Chords')).toHaveAttribute('aria-selected', 'true');
  });

  it('does not eat the click after a pointercancel', () => {
    render(<Harness initial={A()} />);
    const d3 = rectOfDocker('d3');
    startDrag('Sets', { x: d3.x + 20, y: d3.y + 10 }, centre('d2'));
    fireEvent.pointerCancel(document, ev(0, 0));
    fireEvent.click(tab('Sets'));
    expect(tab('Sets')).toHaveAttribute('aria-selected', 'true');
  });

  it('drops a pending press released outside the window (buttons 0 on a move)', () => {
    render(<Harness initial={A()} />);
    fireEvent.pointerDown(tab('Sets'), ev(600, 700));
    fireEvent.pointerMove(document, { ...ev(602, 701), buttons: 0 });
    fireEvent.pointerMove(document, ev(700, 800)); // a later move, button "down" again: no stale drag
    expect(shield()).toBeNull();
  });

  it('cancels a drag whose button is found released on a move', () => {
    render(<Harness initial={A()} />);
    const before = raw();
    startDrag('Sets', undefined, centre('d2'));
    fireEvent.pointerMove(document, { ...ev(10, 10), buttons: 0 });
    expect(shield()).toBeNull();
    expect(raw()).toBe(before);
  });

  it('shows a status line when a root split is refused at the depth limit', async () => {
    let tree: TreeNode = makeDocker('d0', 'D0', ['canvas', 'api', 'chords']);
    let n = 1;
    while (treeDepth(tree) < SPLIT_MAX_DEPTH) {
      tree = {
        kind: 'split',
        dir: n % 2 ? 'row' : 'column',
        children: [
          { weight: 1, node: tree },
          { weight: 1, node: makeDocker(`d${n}`, `D${n}`) },
        ],
      };
      n += 1;
    }
    const deep = workspace(tree);
    render(<Harness initial={deep} />);
    const before = raw();
    act(() => api.sendTo('chords', { kind: 'root', edge: 'left' } as never));
    expect(raw()).toBe(before);
    expect(await screen.findByText('No room for another split at the Stage edge.')).toBe(notice());
  });
});

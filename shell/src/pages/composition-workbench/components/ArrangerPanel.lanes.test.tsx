import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider } from '../desk';
import { seedDesk } from '../deskTestUtils';
import { historyChangeCount, resetHistory, undo } from '../history';
import { PIXELS_PER_QUARTER } from '../scene/arrangerGeometry';
import { writeSceneSession } from '../scene/sceneSession';
import { collectionBlock, objectBlock, sceneBlock } from '../scene/sceneTestHelpers';
import { ArrangerPanel } from './ArrangerPanel';
import { mockEngineState } from './sceneEngineMock';
import { OutlinerPanel } from './ScenePanels';

vi.mock('../audio/AudioEngineProvider', async () => {
  const { mockEngine } = await import('./sceneEngineMock');
  return { useAudioEngine: () => mockEngine };
});

const px = (quarters: number) => quarters * PIXELS_PER_QUARTER;

async function renderLanes(extra: Parameters<typeof seedDesk>[0] = []) {
  await seedDesk([
    sceneBlock('scene-1', 'root'),
    collectionBlock('root', ['a', 'b', 'p', 'kid', 'empty', 'third'], {}, 'Main'),
    collectionBlock('empty', [], {}, 'Empty lane'),
    collectionBlock('third', ['t'], {}, 'Third'),
    objectBlock('a', { start: 4, duration: 4 }, 'A'),
    objectBlock('b', { start: 12, duration: 4 }, 'B'),
    objectBlock('p', { start: 20, duration: 8 }, 'P'),
    objectBlock('kid', { parentRef: { id: 'p' }, start: 2, duration: 2 }, 'Kid'),
    objectBlock('t', { start: 0, duration: 4 }, 'T'),
    ...extra,
  ]);
  writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <OutlinerPanel />
        <ArrangerPanel />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await screen.findByRole('button', { name: 'Block A' });
}

const block = (name: string) => screen.getByRole('button', { name: `Block ${name}` });
const leftOf = (name: string) => Number.parseFloat(block(name).style.left);
const widthOf = (name: string) => Number.parseFloat(block(name).style.width);
const laneRow = (name: string) => {
  const header = screen.getByRole('rowheader', { name });
  return header.closest('[role="row"]') as HTMLElement;
};

/** jsdom has no layout: give each lane a height band so a pointer height means a lane. */
function layOutLanes(names: string[]) {
  names.forEach((name, index) => {
    laneRow(name).getBoundingClientRect = () =>
      ({ top: index * 100, bottom: index * 100 + 100, left: 0, right: 500 }) as DOMRect;
  });
}

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  mockEngineState.reset();
});

describe('lanes (L1a)', () => {
  it('draws one lane per collection in Outliner order, depth 0 for the root, an empty one included', async () => {
    await renderLanes();
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Main',
      'Empty lane',
      'Third',
    ]);
    expect(laneRow('Empty lane')).toHaveAttribute('aria-level', '2');
    expect(within(laneRow('Empty lane')).queryAllByRole('button')).toHaveLength(0);
    expect(within(laneRow('Main')).getAllByRole('button', { name: /^Block / })).toHaveLength(4);
    expect(within(laneRow('Third')).getByRole('button', { name: 'Block T' })).toBeInTheDocument();
  });

  it('adds a sub-lane only where objects overlap: a parent and its child, not the other lanes', async () => {
    await renderLanes();
    expect(laneRow('Main')).toHaveAttribute('data-sublanes', '2');
    expect(laneRow('Main').style.height).toBe('5rem');
    expect(laneRow('Third')).toHaveAttribute('data-sublanes', '1');
    expect(laneRow('Third').style.height).toBe('2.5rem');
    expect(laneRow('Empty lane').style.height).toBe('2.5rem');
    // P sits on sub-lane 0, its child under it on sub-lane 1; A and B stay on sub-lane 0.
    expect(block('P').style.top).toBe(block('A').style.top);
    expect(block('Kid').style.top).not.toBe(block('P').style.top);
  });

  it('the lane height drag scales the whole lane and is keyed by the collection', async () => {
    await renderLanes();
    const grip = within(laneRow('Main')).getByTestId('arranger-row-grip');
    fireEvent.pointerDown(grip, { button: 0, clientY: 100, pointerId: 1 });
    // 32 px is 2 rem over the whole lane, shared by its two sub-lanes: 2.5 plus 1 each.
    fireEvent.pointerMove(grip, { clientY: 132, pointerId: 1 });
    expect(laneRow('Main').style.height).toBe('7rem');
    fireEvent.pointerUp(grip, { button: 0, clientY: 132, pointerId: 1 });
    expect(JSON.parse(localStorage.getItem('hrifa.scene-session.v1') ?? '{}').rowHeights).toEqual({
      root: 3.5,
    });
  });

  it('clicking a block selects the object; clicking a lane name selects the collection', async () => {
    await renderLanes();
    await userEvent.click(block('A'));
    await waitFor(() => expect(block('A')).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(screen.getByRole('rowheader', { name: 'Third' }));
    await waitFor(() => expect(laneRow('Third')).toHaveAttribute('aria-selected', 'true'));
    expect(block('A')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('treeitem', { name: /Third/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});

describe('free move (L1a)', () => {
  it('the block follows the pointer exactly while dragging, then lands on the grid', async () => {
    await renderLanes();
    const target = block('A');
    fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100 + 30, clientY: 20, pointerId: 1 });
    expect(leftOf('A')).toBe(px(4) + 30);
    // The landing outline shows the snapped start, 4 plus 0.625 quarters snaps to 5.
    expect(screen.getByTestId('arranger-landing').style.left).toBe(`${px(5)}px`);
    const before = historyChangeCount();
    fireEvent.pointerUp(target, { button: 0, clientX: 130, clientY: 20, pointerId: 1 });
    await waitFor(() => expect(leftOf('A')).toBe(px(5)));
    expect(historyChangeCount()).toBeGreaterThan(before);
    expect(screen.queryByTestId('arranger-landing')).toBeNull();
  });

  it('a block can pass to the other side of a neighbor and lands in a free slot', async () => {
    await renderLanes();
    // A (4 to 8) dragged 9 quarters right would overlap B (12 to 16), so it lands at 16, the nearest free start (past B).
    const target = block('A');
    fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100 + px(9), clientY: 20, pointerId: 1 });
    // No clamp during the drag: it is 9 quarters further right.
    expect(leftOf('A')).toBe(px(13));
    fireEvent.pointerUp(target, { button: 0, clientX: 100 + px(9), clientY: 20, pointerId: 1 });
    await waitFor(() => expect(leftOf('A')).toBe(px(16)));
  });

  it('released over another lane it moves to that collection as one undo step', async () => {
    await renderLanes();
    layOutLanes(['Main', 'Empty lane', 'Third']);
    const target = block('A');
    fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100, clientY: 250, pointerId: 1 });
    expect(within(laneRow('Third')).getByTestId('arranger-sub-target')).toBeInTheDocument();
    expect(within(laneRow('Main')).queryByTestId('arranger-sub-target')).toBeNull();
    const before = historyChangeCount();
    fireEvent.pointerUp(target, { button: 0, clientX: 100, clientY: 250, pointerId: 1 });
    await waitFor(() =>
      expect(within(laneRow('Third')).getByRole('button', { name: 'Block A' })).toBeInTheDocument()
    );
    expect(historyChangeCount()).toBeGreaterThan(before);
    // T is 0 to 4, so A keeps its start of 4.
    expect(leftOf('A')).toBe(px(4));
    act(() => undo());
    await waitFor(() =>
      expect(within(laneRow('Main')).getByRole('button', { name: 'Block A' })).toBeInTheDocument()
    );
  });

  it('released over an empty lane drops the object into it', async () => {
    await renderLanes();
    layOutLanes(['Main', 'Empty lane', 'Third']);
    const target = block('B');
    fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(target, { button: 0, clientX: 100, clientY: 150, pointerId: 1 });
    await waitFor(() =>
      expect(
        within(laneRow('Empty lane')).getByRole('button', { name: 'Block B' })
      ).toBeInTheDocument()
    );
  });

  it('released off the lanes it snaps back and writes nothing', async () => {
    await renderLanes();
    layOutLanes(['Main', 'Empty lane', 'Third']);
    const target = block('A');
    const before = historyChangeCount();
    fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100 + 60, clientY: 900, pointerId: 1 });
    fireEvent.pointerUp(target, { button: 0, clientX: 160, clientY: 900, pointerId: 1 });
    await waitFor(() => expect(leftOf('A')).toBe(px(4)));
    expect(historyChangeCount()).toBe(before);
    expect(within(laneRow('Main')).getByRole('button', { name: 'Block A' })).toBeInTheDocument();
  });
});

describe('edge drags clamp at the neighbor (L1a)', () => {
  it('the right edge stops where the next block starts instead of being refused', async () => {
    await renderLanes();
    const strip = block('A').querySelector('[data-edge="right"]') as HTMLElement;
    fireEvent.pointerDown(strip, { button: 0, clientX: 500, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(strip, { clientX: 500 + px(10), clientY: 20, pointerId: 1 });
    // A is 4 to 8 and B starts at 12: the live width stops at 8 quarters.
    expect(widthOf('A')).toBe(px(8));
    fireEvent.pointerUp(strip, { button: 0, clientX: 500 + px(10), clientY: 20, pointerId: 1 });
    await waitFor(() => expect(widthOf('A')).toBe(px(8)));
  });

  it('the left edge stops at the end of the block before it', async () => {
    await renderLanes();
    const strip = block('B').querySelector('[data-edge="left"]') as HTMLElement;
    fireEvent.pointerDown(strip, { button: 0, clientX: 500, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(strip, { clientX: 500 - px(10), clientY: 20, pointerId: 1 });
    // A ends at 8: B (12 to 16) grows left to 8 and no further.
    expect(leftOf('B')).toBe(px(8));
    fireEvent.pointerUp(strip, { button: 0, clientX: 500 - px(10), clientY: 20, pointerId: 1 });
    await waitFor(() => expect(leftOf('B')).toBe(px(8)));
    expect(widthOf('B')).toBe(px(8));
  });
});

describe('the shared edge of touching blocks (L1a)', () => {
  it('dragging it moves both ends in one commit', async () => {
    await seedDesk([
      sceneBlock('scene-1', 'root'),
      collectionBlock('root', ['l', 'r'], {}, 'Main'),
      objectBlock('l', { start: 4, duration: 4 }, 'L'),
      objectBlock('r', { start: 8, duration: 8 }, 'R'),
    ]);
    writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <ArrangerPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await screen.findByRole('button', { name: 'Block L' });
    // The facing outer strips are gone; the far ones stay.
    expect(block('L').querySelector('[data-edge="right"]')).toBeNull();
    expect(block('R').querySelector('[data-edge="left"]')).toBeNull();
    expect(block('L').querySelector('[data-edge="left"]')).not.toBeNull();
    expect(block('R').querySelector('[data-edge="right"]')).not.toBeNull();
    const handle = document.querySelector('[data-shared-edge]') as HTMLElement;
    expect(handle.getAttribute('data-info')).toBe(
      'Drag to move the edge between these two blocks. Hold Shift to turn snapping off.'
    );
    const before = historyChangeCount();
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400 + px(2), clientY: 20, pointerId: 1 });
    // Live: the left block grows, the right one trims.
    expect(widthOf('L')).toBe(px(6));
    expect(leftOf('R')).toBe(px(10));
    fireEvent.pointerUp(handle, { button: 0, clientX: 400 + px(2), clientY: 20, pointerId: 1 });
    await waitFor(() => expect(historyChangeCount()).toBeGreaterThan(before));
    expect(widthOf('L')).toBe(px(6));
    expect(leftOf('R')).toBe(px(10));
    expect(widthOf('R')).toBe(px(6));
    act(() => undo());
    await waitFor(() => expect(widthOf('L')).toBe(px(4)));
    expect(leftOf('R')).toBe(px(8));
  });
});

describe('the right-click menu and the Delete key (L1a)', () => {
  async function openMenu(name: string) {
    fireEvent.contextMenu(block(name), { clientX: 120, clientY: 30 });
    return screen.findByRole('menuitem', { name: 'Duplicate Object' });
  }

  it('lists Duplicate Object, Duplicate Linked, Mute and Delete', async () => {
    await renderLanes();
    await openMenu('A');
    expect(screen.getByRole('menuitem', { name: 'Duplicate Linked' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mute' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('Duplicate Object adds a copy after the original, as one undo step, and selects it', async () => {
    await renderLanes();
    await userEvent.click(await openMenu('A'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Block A.001' })).toBeInTheDocument()
    );
    expect(block('A.001')).toHaveAttribute('aria-pressed', 'true');
    act(() => undo());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Block A.001' })).toBeNull());
    expect(block('A')).toBeInTheDocument();
  });

  it('Mute marks the block muted, then the item reads Unmute', async () => {
    await renderLanes();
    await openMenu('A');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mute' }));
    await waitFor(() => expect(block('A')).toHaveAttribute('data-muted', 'true'));
    await openMenu('A');
    expect(screen.getByRole('menuitem', { name: 'Unmute' })).toBeInTheDocument();
  });

  it('Delete removes the object, and so does the Delete key on the focused Arranger', async () => {
    await renderLanes();
    await openMenu('A');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Block A' })).toBeNull());
    await userEvent.click(block('B'));
    fireEvent.keyDown(screen.getByRole('grid', { name: 'Scene timeline' }), { key: 'Delete' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Block B' })).toBeNull());
  });
});

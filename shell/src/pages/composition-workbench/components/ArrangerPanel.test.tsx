import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider } from '../desk';
import { seedDesk } from '../deskTestUtils';
import { historyChangeCount, resetHistory, undo } from '../history';
import { PIXELS_PER_QUARTER } from '../scene/arrangerGeometry';
import { writeSceneSession } from '../scene/sceneSession';
import { claveBlock, collectionBlock, objectBlock, sceneBlock } from '../scene/sceneTestHelpers';
import { ArrangerPanel } from './ArrangerPanel';
import { mockEngine, mockEngineState } from './sceneEngineMock';
import { OutlinerPanel, PropertiesPanel } from './ScenePanels';

vi.mock('../audio/AudioEngineProvider', async () => {
  const { mockEngine } = await import('./sceneEngineMock');
  return { useAudioEngine: () => mockEngine };
});

async function renderArranger() {
  await seedDesk([
    claveBlock(),
    sceneBlock('scene-1', 'root'),
    collectionBlock('root', ['lead', 'bass', 'tail', 'echo']),
    objectBlock('lead', { start: 4, duration: 4, primaryDataRef: { id: 'clave' } }, 'Lead'),
    objectBlock('bass', { parentRef: { id: 'lead' }, start: 2, duration: 2 }, 'Bass'),
    objectBlock('tail', { parentRef: { id: 'lead' }, start: 3, duration: 3 }, 'Tail'),
    objectBlock('echo', { start: 0, duration: 4, mute: true }, 'Echo'),
  ]);
  writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <OutlinerPanel />
        <ArrangerPanel />
        <PropertiesPanel />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await screen.findByRole('button', { name: 'Block Lead' });
}

const block = (name: string) => screen.getByRole('button', { name: `Block ${name}` });
const leftOf = (name: string) => Number.parseFloat(block(name).style.left);

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  mockEngineState.reset();
});

describe('the Arranger (O2b)', () => {
  it('draws one block per object in Outliner order, children indented and later by their relative start', async () => {
    await renderArranger();
    const headers = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
    const outliner = screen.getAllByRole('treeitem').map((item) => item.textContent ?? '');
    expect(headers).toHaveLength(4);
    headers.forEach((name, index) => expect(outliner[index]).toContain(name));
    expect(headers).toEqual(['Lead', 'Bass', 'Tail', 'Echo']);

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-level', '2');
    expect(screen.getAllByRole('rowheader')[1].style.paddingLeft).toBe('1.25rem');
    expect(leftOf('Lead')).toBe(4 * PIXELS_PER_QUARTER);
    // Bass: world start = Lead 4 + relative 2.
    expect(leftOf('Bass')).toBe(6 * PIXELS_PER_QUARTER);
    expect(block('Lead').style.width).toBe(`${4 * PIXELS_PER_QUARTER}px`);
  });

  it('marks a muted object block', async () => {
    await renderArranger();
    expect(block('Echo')).toHaveAttribute('data-muted', 'true');
    expect(block('Lead')).toHaveAttribute('data-muted', 'false');
  });

  it('clicking a block selects it and its Outliner row', async () => {
    await renderArranger();
    await userEvent.click(block('Bass'));
    await waitFor(() => expect(block('Bass')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('treeitem', { name: /Bass/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Name')).toHaveValue('Bass');
  });

  it('a start change through the shared commit moves the block (and its child)', async () => {
    await renderArranger();
    await userEvent.click(block('Lead'));
    const start = await screen.findByLabelText('Start');
    await userEvent.clear(start);
    await userEvent.type(start, '3.1.0{Enter}');
    await waitFor(() => expect(leftOf('Lead')).toBe(8 * PIXELS_PER_QUARTER));
    // The child keeps its relative start, so it follows its parent.
    expect(leftOf('Bass')).toBe(10 * PIXELS_PER_QUARTER);
  });

  it('shows the part of a child beyond its parent end as cut, and nothing cut inside it', async () => {
    await renderArranger();
    // Tail: world 7 to 10, Lead ends at 8, so one quarter is played and two are cut.
    const cut = (name: string) => block(name).querySelector('[data-cut]') as HTMLElement;
    expect(cut('Tail')).toHaveAttribute('data-cut', 'true');
    expect(cut('Tail').style.left).toBe(`${PIXELS_PER_QUARTER}px`);
    expect(cut('Tail')).toHaveAttribute('title', 'Cut at the end of its parent');
    expect(cut('Bass')).toHaveAttribute('data-cut', 'false');
    expect(cut('Lead')).toHaveAttribute('data-cut', 'false');
  });
});

describe('the playhead and the shared Play controller', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const runFrame = async (time: number) => {
    await waitFor(() => expect(frames.size).toBeGreaterThan(0));
    const due = [...frames.values()];
    frames.clear();
    act(() => due.forEach((callback) => callback(time)));
  };
  const line = () => screen.getByTestId('arranger-playhead');
  const buttons = (name: RegExp) => screen.getAllByRole('button', { name });

  beforeEach(() => {
    frames.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function playFrom(which: 'outliner' | 'arranger') {
    await renderArranger();
    // First Play button is the Outliner's, the second the Arranger's.
    const play = buttons(/Play/)[which === 'outliner' ? 0 : 1];
    await waitFor(() => expect(play).toBeEnabled());
    await userEvent.click(play);
    await waitFor(() => expect(mockEngineState.played).toHaveLength(1));
    // The session is stamped with the scene id, which is what the playhead follows.
    expect(mockEngineState.played[0].plan.sourceId).toBe('scene-1');
    await waitFor(() => expect(buttons(/Stop/)).toHaveLength(2));
  }

  async function expectLineFollowsAndStops(stopWith: 'outliner' | 'arranger') {
    // Before the material starts (the engine clock already includes a count-in) the line is hidden.
    await runFrame(500);
    expect(line().style.visibility).toBe('hidden');
    // 1 s at 120 beats per minute is 2 quarter notes, then 2 s is 4.
    await runFrame(2000);
    expect(line().style.visibility).toBe('visible');
    expect(line().style.transform).toBe(`translateX(${2 * PIXELS_PER_QUARTER}px)`);
    await runFrame(3000);
    expect(line().style.transform).toBe(`translateX(${4 * PIXELS_PER_QUARTER}px)`);

    await userEvent.click(buttons(/Stop/)[stopWith === 'outliner' ? 0 : 1]);
    await waitFor(() => expect(buttons(/Play/)).toHaveLength(2));
    expect(mockEngineState.stopped).toBe(1);
    expect(line().style.visibility).toBe('hidden');
    expect(frames.size).toBe(0);
  }

  it('Play in the Outliner draws the line, which follows the clock and ends on Stop in the Arranger', async () => {
    await playFrom('outliner');
    await expectLineFollowsAndStops('arranger');
  });

  it('Play in the Arranger draws the same line, and Stop in the Outliner ends it', async () => {
    await playFrom('arranger');
    await expectLineFollowsAndStops('outliner');
  });

  it('the Arranger Play is disabled with a reason while the scene has no sound', async () => {
    await seedDesk([
      sceneBlock('scene-1', 'root'),
      collectionBlock('root', ['o']),
      objectBlock('o'),
    ]);
    writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <ArrangerPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    // The desk loads asynchronously: until the scene is read the reason is "Create or choose a scene",
    // so wait for the settled reason instead of reading it once.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Play/ }).getAttribute('data-info')).toMatch(
        /Add an object with data/
      )
    );
    expect(screen.getByRole('button', { name: /Play/ })).toBeDisabled();
    expect(mockEngineState.played).toHaveLength(0);
  });
});

describe('a click on a block (no dead zone used to move it)', () => {
  async function renderOffGrid() {
    await seedDesk([
      sceneBlock('scene-1', 'root'),
      collectionBlock('root', ['short']),
      objectBlock('short', { start: 0.75, duration: 0.5 }, 'Short'),
    ]);
    writeSceneSession({ activeSceneId: 'scene-1', selectedId: null });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <ArrangerPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await screen.findByRole('button', { name: 'Block Short' });
  }

  it('selects, writes nothing and keeps an off-grid start and a sub-beat length', async () => {
    await renderOffGrid();
    const target = screen.getByRole('button', { name: 'Block Short' });
    const handle = target.querySelector('span:last-child') as HTMLElement;
    const before = historyChangeCount();
    fireEvent.pointerDown(target, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(target, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(handle, { button: 0, clientX: 200, pointerId: 1 });
    await waitFor(() => expect(target).toHaveAttribute('aria-pressed', 'true'));
    expect(historyChangeCount()).toBe(before);
    expect(target.style.left).toBe(`${0.75 * PIXELS_PER_QUARTER}px`);
    expect(target.style.width).toBe(`${0.5 * PIXELS_PER_QUARTER}px`);
  });

  it('a pointercancel after moving throws the drag away', async () => {
    await renderOffGrid();
    const target = screen.getByRole('button', { name: 'Block Short' });
    const before = historyChangeCount();
    fireEvent.pointerDown(target, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100 + PIXELS_PER_QUARTER, pointerId: 1 });
    expect(target.style.left).not.toBe(`${0.75 * PIXELS_PER_QUARTER}px`);
    fireEvent.pointerCancel(target, { pointerId: 1 });
    expect(target.style.left).toBe(`${0.75 * PIXELS_PER_QUARTER}px`);
    expect(historyChangeCount()).toBe(before);
  });

  it('a real drag commits once on release', async () => {
    await renderOffGrid();
    const target = screen.getByRole('button', { name: 'Block Short' });
    const before = historyChangeCount();
    fireEvent.pointerDown(target, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(target, { clientX: 100 + PIXELS_PER_QUARTER, pointerId: 1 });
    fireEvent.pointerUp(target, { button: 0, clientX: 100 + PIXELS_PER_QUARTER, pointerId: 1 });
    // World 0.75 + 1 snaps to 2; one undo step brings it back.
    await waitFor(() => expect(target.style.left).toBe(`${2 * PIXELS_PER_QUARTER}px`));
    expect(historyChangeCount()).toBeGreaterThan(before);
    act(() => undo());
    await waitFor(() => expect(target.style.left).toBe(`${0.75 * PIXELS_PER_QUARTER}px`));
  });
});

describe('Play while the engine is still starting', () => {
  const buttons = (name: RegExp) => screen.getAllByRole('button', { name });
  const outlinerLine = () => screen.getAllByRole('status')[0];

  beforeEach(() => {
    mockEngineState.hold = true;
  });
  afterEach(() => {
    // Leave no pending start or live session in the shared controller store.
    mockEngineState.hold = false;
    act(() => mockEngineState.resolvePending());
    act(() => mockEngine.stopSource('scene-1'));
  });

  async function startPending() {
    await renderArranger();
    await waitFor(() => expect(buttons(/Play/)[0]).toBeEnabled());
    await userEvent.click(buttons(/Play/)[0]);
    await waitFor(() => expect(mockEngineState.played).toHaveLength(1));
    // Both panels show Stop while the start is pending, though no session exists yet.
    await waitFor(() => expect(buttons(/Stop/)).toHaveLength(2));
    expect(mockEngineState.live()).toEqual([]);
  }

  it('a second click during the wait cancels the start: nothing sounds when it resolves', async () => {
    await startPending();
    await userEvent.click(buttons(/Stop/)[1]);
    await waitFor(() => expect(buttons(/Play/)).toHaveLength(2));
    act(() => mockEngineState.resolvePending());
    await waitFor(() => expect(mockEngineState.stopped).toBe(1));
    expect(mockEngineState.live()).toEqual([]);
    expect(mockEngineState.played).toHaveLength(1);
    expect(buttons(/Play/)).toHaveLength(2);
  });

  it('cancel then play again leaves exactly one live session when both starts resolve', async () => {
    await startPending();
    await userEvent.click(buttons(/Stop/)[0]);
    await waitFor(() => expect(buttons(/Play/)).toHaveLength(2));
    await userEvent.click(buttons(/Play/)[1]);
    await waitFor(() => expect(mockEngineState.played).toHaveLength(2));
    act(() => mockEngineState.resolvePending());
    await waitFor(() => expect(mockEngineState.live()).toEqual(['scene-1']));
    await waitFor(() => expect(buttons(/Stop/)).toHaveLength(2));
  });

  it("the Outliner's status line follows the engine, not the panel that started", async () => {
    await startPending();
    expect(outlinerLine()).toHaveTextContent('Playing the scene.');
    act(() => mockEngineState.resolvePending());
    await waitFor(() => expect(mockEngineState.live()).toEqual(['scene-1']));
    await userEvent.click(buttons(/Stop/)[1]);
    await waitFor(() => expect(outlinerLine()).toHaveTextContent(/^$/));
  });

  it('the status clears when the engine ends the session without a completion callback', async () => {
    await startPending();
    act(() => mockEngineState.resolvePending());
    await waitFor(() => expect(mockEngineState.live()).toEqual(['scene-1']));
    expect(outlinerLine()).toHaveTextContent('Playing the scene.');
    act(() => mockEngine.stopSource('scene-1'));
    await waitFor(() => expect(outlinerLine()).toHaveTextContent(/^$/));
    expect(buttons(/Play/)).toHaveLength(2);
  });

  it('changing the active scene stops the old scene', async () => {
    await seedDesk([
      claveBlock(),
      sceneBlock('scene-1', 'root'),
      collectionBlock('root', ['lead']),
      objectBlock('lead', { start: 0, duration: 4, primaryDataRef: { id: 'clave' } }, 'Lead'),
      sceneBlock('scene-2', 'root2'),
      collectionBlock('root2', []),
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
    await waitFor(() => expect(buttons(/Play/)[0]).toBeEnabled());
    mockEngineState.hold = false;
    await userEvent.click(buttons(/Play/)[0]);
    await waitFor(() => expect(mockEngineState.live()).toEqual(['scene-1']));
    act(() => writeSceneSession({ activeSceneId: 'scene-2', selectedId: null }));
    await waitFor(() => expect(mockEngineState.live()).toEqual([]));
    expect(buttons(/Play/)).toHaveLength(2);
  });
});

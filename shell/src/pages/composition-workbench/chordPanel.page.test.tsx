import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dockerHolding, parseScreensetStore, type ScreensetStore } from '../../lib/stage';
import { CompositionWorkbenchPage } from '../CompositionWorkbench.page';
import type { ChordSession } from './chordInput/chordSession';
import { defaultProjectPitchSet } from './compositionSettings';
import { resetHistory } from './history';
import { WORKBENCH_KNOWN_IDS } from './layout/workbenchScreensets';
import type { NoteEventValue } from './melodicization';
import { packet } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import type { Snippet } from './snippet';
import { compositionStateKeys } from './usePersistentState';

// M6a: the chord picker is the page's `chords` panel. These tests drive the real page (the dock Stage, the page chord
// session, the bridge that shows the panel) for the scenarios of SCENARIOS.M6.md that are about placement: A1, A4, A5, A6,
// A7, A8, B6 (the panel stays when the tool is left) and the second chord host on the page Stage. The chord behavior
// itself (insert, W-20 keys, ghosts, audition gate) stays covered by the NoteClipEditor chord tests.

// A stand-in audio engine that makes no sound and records what was played.
const engine = vi.hoisted(() => ({
  play: vi.fn(async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined })),
}));
vi.mock('./audio/AudioEngineProvider', async (importOriginal) => {
  const original = await importOriginal<typeof import('./audio/AudioEngineProvider')>();
  return {
    ...original,
    // The page's real engine, except that `play` records and makes no sound.
    useAudioEngine: () => {
      const real = original.useAudioEngine();
      return new Proxy(real, {
        get(target, key) {
          if (key === 'play') {
            return engine.play;
          }
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

// The page's chord session, made visible to the test (the same wrapper as workbenchSessions.page.test.tsx).
const seen = vi.hoisted(() => ({ chord: null as unknown }));
vi.mock('./WorkbenchSessions', async (importOriginal) => {
  const original = await importOriginal<typeof import('./WorkbenchSessions')>();
  const { useRef } = await import('react');
  const { ChordSession: Chord } = await import('./chordInput/chordSession');
  return {
    ...original,
    WorkbenchSessions(props: Parameters<typeof original.WorkbenchSessions>[0]) {
      const chord = useRef<InstanceType<typeof Chord>>(null as never);
      chord.current ??= new Chord();
      seen.chord = chord.current;
      return <original.WorkbenchSessions {...props} chordSession={chord.current} />;
    },
  };
});
const chordSession = () => seen.chord as ChordSession;

function noteClip(id: string, name: string): Snippet {
  const value: NoteEventValue = {
    onset: musicalPosition(0),
    interOnset: musicalDuration(1),
    duration: musicalDuration(1),
    pitches: [6000],
    velocity: 1,
  };
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [{ id: `${id}:n`, value, label: 'n', provenance: [] }]),
      frame: {
        topology: 'linear',
        unit: 'quarterNote',
        extent: 8,
        origin: 0,
        musicalExtent: musicalDuration(8),
        musicalOrigin: musicalPosition(0),
      },
    },
  };
}

function seed(view: 'canvas' | 'desk' = 'desk') {
  localStorage.setItem(compositionStateKeys.desk, JSON.stringify([noteClip('clip-a', 'Alpha')]));
  localStorage.setItem(compositionStateKeys.workspaceView, JSON.stringify(view));
}

function storedStore(): ScreensetStore {
  return parseScreensetStore(
    localStorage.getItem(compositionStateKeys.screensets) ?? 'null',
    WORKBENCH_KNOWN_IDS,
    {
      fallback: undefined as unknown as ScreensetStore,
    }
  );
}
const chordsDocker = (screenset: string) =>
  dockerHolding(storedStore().screensets[screenset].tree, 'chords')?.name ?? null;

const footerTab = (name: string) =>
  within(screen.getByRole('contentinfo')).getByRole('tab', { name });

async function openClip(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = await screen.findByDisplayValue(name);
  const card = input.closest('div[class*="card"]') as HTMLElement;
  await user.dblClick(within(card).getByText(/^events \| note/));
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

// jsdom lays nothing out: the roll's origin is (0, 0), 64 px a quarter and 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;
function clickRoll(roll: HTMLElement, midi: number, x = 70) {
  fireEvent.pointerDown(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
  fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
}
const ghosts = (variant: string) => document.querySelectorAll(`[data-ghost-overlay="${variant}"]`);
const ghostTops = (variant: string) =>
  [...ghosts(variant)].map((el) => (el as HTMLElement).style.top).sort();
const readyLine = () => document.querySelector('[data-ready-line]');
const press = (target: Element, key: string) => fireEvent.keyDown(target, { key });
const chordButtons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')];
const stopName = () => chordButtons().find((b) => b.tabIndex === 0)?.title;

describe('the Chords panel on the page Stage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
    engine.play.mockClear();
    seen.chord = null;
  });

  it('A1, A5, A4, B6: the Chords tool opens the panel in Tools first, a moved tab keeps the picker state, leaving the tool keeps the panel, closing it leaves the tool, and the tool reopens it where it was put', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    const roll = await openClip(user, 'Alpha');
    expect(screen.queryByRole('tab', { name: 'Chords' })).toBeNull();

    // A1: first time, the Tools docker, in front.
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    const tab = await screen.findByRole('tab', { name: 'Chords' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(chordsDocker('desk')).toBe('Tools');
    expect(screen.getByText(/Click the roll where a chord should go/)).toBeInTheDocument();

    // An anchor and a pinned chord.
    clickRoll(roll, 69);
    await user.click(await screen.findByRole('button', { name: 'Am' }));
    expect(ghosts('anchor')).toHaveLength(1);
    expect(ghosts('pinned')).toHaveLength(3);

    // A5: set a mode and a voicing, change the pinned chord with the roll's key, then move the tab to the Desk docker.
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    await user.click(screen.getByRole('button', { name: '1st inv.' }));
    roll.focus();
    press(roll, 'ArrowDown');
    const pinnedName = stopName();
    const pinnedTops = ghostTops('pinned');
    expect(pinnedTops.length).toBeGreaterThan(0);
    fireEvent.contextMenu(tab);
    await user.click(await screen.findByRole('menuitem', { name: 'Desk' }));
    await waitFor(() => expect(chordsDocker('desk')).toBe('Desk'));
    // The mode, the voicing, the pinned chord and the anchor all survive the move.
    expect(screen.getByRole('button', { name: 'Common tone' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: '1st inv.' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(stopName()).toBe(pinnedName);
    expect(ghostTops('pinned')).toEqual(pinnedTops);
    expect(ghosts('anchor')).toHaveLength(1);

    // W-20 keys at the new place: focus in the roll changes the chord, focus in the picker moves focus.
    roll.focus();
    press(roll, 'ArrowDown');
    expect(stopName()).not.toBe(pinnedName);
    const buttons = chordButtons();
    const current = buttons.find((b) => b.tabIndex === 0)!;
    current.focus();
    press(current, 'ArrowDown');
    expect(document.activeElement).toBe(chordButtons()[buttons.indexOf(current) + 1]);

    // B6: leaving the Chords tool leaves the panel where it is (decision 1b); it says the tool is off.
    roll.focus();
    fireEvent.keyDown(roll, { key: '1' });
    expect(screen.getByRole('tab', { name: 'Chords' })).toBeInTheDocument();
    await waitFor(() =>
      expect(readyLine()).toHaveTextContent('Select a note, or use the Chords tool')
    );
    expect(chordsDocker('desk')).toBe('Desk');

    // The tool again: the panel is already there and comes forward.
    fireEvent.keyDown(roll, { key: '7' });
    expect(await screen.findByText(/Click the roll where a chord should go/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chords' })).toHaveAttribute('aria-selected', 'true');

    // A4: closing the tab while the Chords tool is on leaves the tool (back to the Pointer).
    expect(screen.getByRole('button', { name: 'Tool: Chords' })).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Chords' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Close Chords' }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Chords' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Tool: Pointer' })).toBeInTheDocument();
    expect(ghosts('anchor')).toHaveLength(0);

    // A1 again: the tool reopens it in the docker the person last put it in, not in Tools.
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    await screen.findByRole('tab', { name: 'Chords' });
    expect(chordsDocker('desk')).toBe('Desk');
  }, 30_000);

  it('A7 and the second chord host: with no clip the panel opens from the Panels menu and auditions; a list host claims the session and receives the chord', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    await user.click(screen.getByRole('button', { name: 'Panels' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Open Chords' }));
    await waitFor(() => expect(readyLine()).toHaveTextContent('No target: open a clip to insert'));
    // Audition never needs a target.
    await user.click(screen.getByRole('button', { name: 'C' }));
    await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));

    // M4's second consumer, on the page Stage: a progression-list host (no notes, its own insert).
    const inserted: number[][] = [];
    let release = () => {};
    act(() => {
      release = chordSession().claimChordTarget({
        id: 'progression',
        pitchSet: defaultProjectPitchSet(12),
        edo: 12,
        hint: 'Pick a position in the list.',
        insert: (request) => {
          inserted.push(request.chord.pcs);
        },
      });
    });
    expect(await screen.findByText('Pick a position in the list.')).toBeInTheDocument();
    act(() => chordSession().setAnchor({ pitchMidicents: 6000, start: 0, step: 1 }));
    await user.dblClick(await screen.findByRole('button', { name: 'C' }));
    expect(inserted).toEqual([[0, 4, 7]]);
    act(() => release());
    await waitFor(() => expect(readyLine()).toHaveTextContent('No target: open a clip to insert'));
  }, 30_000);

  it('A8 and A6: with the roll hidden behind the Modules tab the picker stays and the keys are not captured; flipping screensets keeps the picker and the anchor', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    const roll = await openClip(user, 'Alpha');
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    await screen.findByRole('tab', { name: 'Chords' });
    clickRoll(roll, 69);
    const anchored = chordSession().getState().anchor!;
    expect(anchored).not.toBeNull();

    // A8: the roll is parked behind Modules. The picker stays; Shift+ArrowRight does not move the anchor.
    await user.click(screen.getByRole('tab', { name: 'Modules' }));
    await waitFor(() => expect(roll.closest('[inert]')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Am' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true });
    expect(chordSession().getState().anchor).toBe(anchored);
    // Clicking back restores everything: the same key now moves the anchor.
    await user.click(screen.getByRole('tab', { name: 'Clip editor' }));
    await waitFor(() => expect(roll.closest('[inert]')).toBeNull());
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true });
    const moved = chordSession().getState().anchor!;
    expect(moved.start).toBeGreaterThan(anchored.start);

    // A6: to the Canvas screenset and back; the picker state is as it was left.
    await user.click(footerTab('Canvas'));
    await waitFor(() => expect(footerTab('Canvas')).toHaveAttribute('aria-selected', 'true'));
    expect(chordSession().getState().anchor).toBe(moved);
    await user.click(footerTab('Desk'));
    await waitFor(() => expect(footerTab('Desk')).toHaveAttribute('aria-selected', 'true'));
    expect(chordSession().getState().anchor).toBe(moved);
    expect(screen.getByRole('tab', { name: 'Chords' })).toBeInTheDocument();
  }, 30_000);

  it('A6: a tab (Modules) the person put in front of Chords stays in front, and Chords stays open, after a flip to the other screenset and back', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    const roll = await openClip(user, 'Alpha');
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    await screen.findByRole('tab', { name: 'Chords' });
    // Move Chords into the Detail docker (beside Modules and Clip editor), then put Modules in front of it.
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Chords' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Detail' }));
    await waitFor(() => expect(chordsDocker('desk')).toBe('Detail'));
    const modulesTab = screen.getByRole('tab', { name: 'Modules' });
    await user.click(modulesTab);
    await waitFor(() => expect(modulesTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('tab', { name: 'Chords' })).toHaveAttribute('aria-selected', 'false');

    await user.click(footerTab('Canvas'));
    await waitFor(() => expect(footerTab('Canvas')).toHaveAttribute('aria-selected', 'true'));
    await user.click(footerTab('Desk'));
    await waitFor(() => expect(footerTab('Desk')).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('tab', { name: 'Chords' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Modules' })).toHaveAttribute('aria-selected', 'true');
  }, 30_000);

  it('M6c: selection mode follows the Stage: the panel behind another tab is off screen (ghosts and Insert off), in front it works', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    const roll = await openClip(user, 'Alpha');
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    await screen.findByRole('tab', { name: 'Chords' });
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Chords' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Detail' }));
    await waitFor(() => expect(chordsDocker('desk')).toBe('Detail'));
    roll.focus();
    fireEvent.keyDown(roll, { key: '1' });
    await waitFor(() => expect(chordSession().getState().pickerWanted).toBe(false));
    expect(chordSession().getState().panelShown).toBe(true);

    // Modules in front of Chords: the panel is off screen, selection mode is idle.
    await user.click(screen.getByRole('tab', { name: 'Modules' }));
    await waitFor(() => expect(chordSession().getState().panelShown).toBe(false));
    expect(chordSession().isSelectionMode()).toBe(false);

    await user.click(screen.getByRole('tab', { name: 'Chords' }));
    await waitFor(() => expect(chordSession().getState().panelShown).toBe(true));
    expect(chordSession().isSelectionMode()).toBe(true);
  }, 30_000);
});

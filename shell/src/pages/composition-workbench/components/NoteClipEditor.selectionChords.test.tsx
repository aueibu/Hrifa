import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordSessionProvider } from '../chordInput/ChordSessionProvider';
import { ChordPanelStandIn } from '../chordInput/chordTestUtils';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { canUndo, resetHistory, undo } from '../history';
import type { NoteEventValue } from '../melodicization';
import { packet, type DataItem } from '../model';
import {
  musicalDuration,
  musicalPosition,
  rationalFromNumber,
  rationalToNumber,
} from '../musicalTime';
import type { Snippet } from '../snippet';
import { NoteClipEditor } from './NoteClipEditor';

// M6b selection mode (SCENARIOS.M6.md B1 to B6): the Chords panel (kept open, decision 1b) acts on the roll's selected
// notes while another tool is active. The panel stands in for the dock Stage; the editor and the panel share one chord
// session, exactly as on the page.

const engine = vi.hoisted(() => ({
  play: vi.fn(async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined })),
}));
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: engine.play, subscribe: () => () => undefined }),
}));

let desk: ReturnType<typeof useDesk>;

function Harness() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return clip && <NoteClipEditor snippet={clip} />;
}

function seedNote(
  id: string,
  start: number,
  length: number,
  midicents: number,
  velocity = 1
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: { quarterNotes: rationalFromNumber(start) },
      interOnset: { quarterNotes: rationalFromNumber(length) },
      duration: { quarterNotes: rationalFromNumber(length) },
      pitches: [midicents],
      velocity,
    },
    label: id,
    provenance: [],
  };
}

function clipOf(notes: DataItem<NoteEventValue>[]): Snippet {
  return {
    schemaVersion: 1,
    id: 'seeded',
    name: 'Seeded',
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', notes),
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

async function open(seed: Snippet) {
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <ChordSessionProvider>
          <Harness />
          <ChordPanelStandIn always />
        </ChordSessionProvider>
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await waitFor(() => expect(desk.loading).toBe(false));
  act(() => desk.addSnippet(seed));
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

// jsdom lays nothing out: 64 px a quarter, 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;
function click(roll: HTMLElement, midi: number, x: number, init: PointerEventInit = {}) {
  const at = { clientX: x, clientY: rowY(midi), pointerId: 1, ...init };
  fireEvent.pointerDown(roll, at);
  fireEvent.pointerUp(roll, at);
}
/** Selects the note whose roll title starts with `title` (Shift adds), as the Pointer tool does. */
function pick(roll: HTMLElement, title: RegExp, midi: number, start: number, shiftKey = false) {
  const x = start * 64 + 8;
  fireEvent.pointerDown(screen.getByTitle(title), {
    clientX: x,
    clientY: rowY(midi),
    shiftKey,
    pointerId: 1,
  });
  fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
}
function useTool(roll: HTMLElement, key: string) {
  roll.focus();
  fireEvent.keyDown(roll, { key });
}
const items = () => desk.snippets[0].packet.items;
const valueOf = (item: DataItem) => item.value as NoteEventValue;
const onsetOf = (item: DataItem) => rationalToNumber(valueOf(item).onset.quarterNotes);
const lengthOf = (item: DataItem) => rationalToNumber(valueOf(item).duration.quarterNotes);
/** The notes as comparable tuples (ids differ between runs), sorted. */
const tuples = () =>
  items()
    .map((item) => [
      onsetOf(item),
      valueOf(item).pitches[0],
      lengthOf(item),
      valueOf(item).velocity,
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const chord = (name: string) => screen.getByRole('button', { name });
const readyLine = () => document.querySelector('[data-ready-line]') as HTMLElement;
const readyState = () => readyLine().getAttribute('data-state');

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  engine.play.mockClear();
});

describe('selection mode: the Chords panel acts on the selected notes', () => {
  it('B1: one selected note gives exactly what the Chords tool gives on that note (same notes, length and velocity)', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('e', 2, 1, 6400, 0.9), seedNote('far', 6, 1, 7200)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    expect(readyLine()).toHaveTextContent('Insert: one chord on the selected note');
    expect(readyState()).toBe('ready');

    await user.dblClick(chord('Em'));
    const viaSelection = tuples();
    // Em stacked on E4: G4 and B4 at the note's onset, length and velocity (the E exists).
    expect(viaSelection).toEqual([
      [2, 6400, 1, 0.9],
      [2, 6700, 1, 0.9],
      [2, 7100, 1, 0.9],
      [6, 7200, 1, 1],
    ]);
    act(() => undo());
    expect(items()).toHaveLength(2);

    // The Chords tool: click that note, Enter (the same chord).
    useTool(roll, '7');
    click(roll, 64, 2 * 64 + 10);
    await user.dblClick(chord('Em'));
    expect(tuples()).toEqual(viaSelection);
  });

  it('B2: nothing selected is audition only; Insert places nothing and says why; a click still sounds', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    expect(readyLine()).toHaveTextContent('Select a note, or use the Chords tool');
    expect(readyState()).toBe('waiting');
    const before = JSON.stringify(items());
    const undoable = canUndo();
    await user.click(chord('C'));
    expect(engine.play).toHaveBeenCalledTimes(1);
    await user.dblClick(chord('C'));
    expect(JSON.stringify(items())).toBe(before);
    expect(canUndo()).toBe(undoable);
    // The chord buttons carry the same reason in their tooltip.
    expect(chord('C').title).toContain('Select a note, or use the Chords tool');
  });

  it('B3: only a time range with no notes: Insert disabled, "Select a note"', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('e', 1, 1, 6400)]));
    useTool(roll, '1');
    // A marquee over empty time (4.7 to 6.5 quarters): a time selection that holds no note.
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 420, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 420, clientY: 30, pointerId: 1 });
    expect(screen.getByTestId('roll-range')).toBeInTheDocument();
    expect(readyLine()).toHaveTextContent('Select a note');
    expect(readyLine()).toHaveAttribute('title', 'Select a note');
    expect(readyState()).toBe('waiting');
    const before = JSON.stringify(items());
    await user.dblClick(chord('C'));
    expect(JSON.stringify(items())).toBe(before);
  });

  it('B2 (after an insert): the selection stays on the notes the person selected, not the inserted ones', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.dblClick(chord('Em'));
    expect(items()).toHaveLength(3);
    // Still only E4 is selected: the line counts one note, so the inserted G4 and B4 are not selected.
    expect(readyLine()).toHaveTextContent('Insert: one chord on the selected note');
    expect(readyState()).toBe('ready');
    // A second insert stacks on E4 again (common tone C major adds the C4 below it).
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    await user.dblClick(chord('C'));
    expect(tuples()).toEqual([
      [2, 6000, 1, 1],
      [2, 6400, 1, 1],
      [2, 6700, 1, 1],
      [2, 7100, 1, 1],
    ]);
    expect(readyLine()).toHaveTextContent('Insert: one chord on the selected note');
  });

  it('anchor order: the picker lists chords from the earliest selected note, whatever order the clip stores the notes', async () => {
    // G4 is stored first, but C4 sounds first.
    const roll = await open(clipOf([seedNote('g', 3, 1, 6700), seedNote('c', 1, 1, 6000)]));
    useTool(roll, '1');
    pick(roll, /^G4 · 3\.000 qn/, 67, 3);
    pick(roll, /^C4 · 1\.000 qn/, 60, 1, true);
    expect(readyLine()).toHaveTextContent('Insert: one chord on each of 2 selected notes');
    expect(screen.getByText(/^On C4 \(note\)/)).toBeInTheDocument();
  });

  it('B4: two selected notes each get the same chord type, in one undo step', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('c', 1, 1, 6000), seedNote('g', 3, 1, 6700)]));
    useTool(roll, '1');
    pick(roll, /^C4 · 1\.000 qn/, 60, 1);
    pick(roll, /^G4 · 3\.000 qn/, 67, 3, true);
    expect(readyLine()).toHaveTextContent('Insert: one chord on each of 2 selected notes');
    // Selection mode has no anchor to move and no continuous insert.
    expect(screen.queryByRole('button', { name: 'Continuous' })).toBeNull();
    expect(screen.queryByText(/Shift\+arrows/)).toBeNull();
    await user.dblClick(chord('C'));
    // The chord shape on each note (root mode: C major on C4, then the same quality on G4); existing roots are not repeated.
    expect(tuples()).toEqual([
      [1, 6000, 1, 1],
      [1, 6400, 1, 1],
      [1, 6700, 1, 1],
      [3, 6700, 1, 1],
      [3, 7100, 1, 1],
      [3, 7400, 1, 1],
    ]);
    // One undo step removes both chords.
    act(() => undo());
    expect(items()).toHaveLength(2);
  });

  it('B5: notes at one onset each get their chord; a pitch both chords contain is entered once; existing notes are not duplicated', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('c', 1, 1, 6000), seedNote('g', 1, 1, 6700)]));
    useTool(roll, '1');
    pick(roll, /^C4 · 1\.000 qn/, 60, 1);
    pick(roll, /^G4 · 1\.000 qn/, 67, 1, true);
    expect(readyLine()).toHaveTextContent('Insert: one chord on each of 2 selected notes');
    // Common tone mode: C major around C4 and around G4 is the same three pitches, two of which exist.
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    await user.dblClick(chord('C'));
    expect(tuples()).toEqual([
      [1, 6000, 1, 1],
      [1, 6400, 1, 1],
      [1, 6700, 1, 1],
    ]);
    act(() => undo());
    expect(items()).toHaveLength(2);
  });

  it('Enter on a focused chord inserts in selection mode; Enter in the roll keeps its own meaning', async () => {
    const roll = await open(clipOf([seedNote('c', 1, 1, 6000)]));
    useTool(roll, '1');
    pick(roll, /^C4 · 1\.000 qn/, 60, 1);
    roll.focus();
    fireEvent.keyDown(roll, { key: 'Enter' });
    expect(items()).toHaveLength(1);
    const button = chord('C');
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(items()).toHaveLength(3);
  });

  it('B6: leaving the Chords tool changes the ready line from the anchor text to the selection text', async () => {
    const roll = await open(clipOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '7');
    expect(readyLine()).toHaveTextContent('Anchor: click in the roll');
    click(roll, 60, 2 * 64 + 10);
    expect(readyLine()).toHaveTextContent('Anchor: Insert places the chord at');
    expect(readyLine()).toHaveTextContent('bar 1 beat 3');
    useTool(roll, '1');
    expect(readyLine()).toHaveTextContent('Select a note, or use the Chords tool');
    expect(readyState()).toBe('waiting');
    // The panel is still there (decision 1b) and still auditions.
    expect(document.querySelector('[data-chord-panel]')).not.toBeNull();
  });
});

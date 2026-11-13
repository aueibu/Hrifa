import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { reverseOrder } from '../noteTransforms';
import type { Snippet } from '../snippet';
import { NoteClipEditor, noteAtCell } from './NoteClipEditor';

// The audition path: a stand-in audio engine that makes no sound.
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
        <Harness />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await waitFor(() => expect(desk.loading).toBe(false));
  act(() => desk.addSnippet(seed));
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

// jsdom lays nothing out: 64 px a quarter (half-quarter grid steps), 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;
function click(roll: HTMLElement, midi: number, x: number, init: PointerEventInit = {}) {
  const at = { clientX: x, clientY: rowY(midi), pointerId: 1, ...init };
  fireEvent.pointerDown(roll, at);
  fireEvent.pointerUp(roll, at);
}
function useTool(roll: HTMLElement, key: string) {
  roll.focus();
  fireEvent.keyDown(roll, { key });
}
const items = () => desk.snippets[0].packet.items;
const valueOf = (item: DataItem) => item.value as NoteEventValue;
const onsetOf = (item: DataItem) => rationalToNumber(valueOf(item).onset.quarterNotes);
const lengthOf = (item: DataItem) => rationalToNumber(valueOf(item).duration.quarterNotes);
const pitchesOf = (list: readonly DataItem[]) =>
  list.map((item) => valueOf(item).pitches[0]).sort((a, b) => a - b);
const ghosts = (variant: string) =>
  document.querySelectorAll(`[data-ghost-overlay="${variant}"]`) as NodeListOf<HTMLElement>;
const chord = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  engine.play.mockClear();
});

describe('stacking chords onto existing notes', () => {
  it('opens the picker at the note with its exact pitch and off-grid onset, spanning the note', async () => {
    const roll = await open(clipOf([seedNote('n1', 1.25, 1, 6000)]));
    useTool(roll, '7');
    click(roll, 60, 90); // the cell is 1.0..1.5; the note starts at 1.25
    expect(screen.getByText(/On C4 \(note\): chords on C/)).toBeInTheDocument();
    const anchor = ghosts('anchor');
    expect(anchor).toHaveLength(1);
    expect(parseFloat(anchor[0].style.left)).toBeCloseTo(80, 0);
    expect(parseFloat(anchor[0].style.width)).toBeCloseTo(64, 0);
  });

  it('an empty-cell click keeps the plain header', async () => {
    const roll = await open(clipOf([seedNote('n1', 4, 1, 6000)]));
    useTool(roll, '7');
    click(roll, 60, 90);
    expect(screen.getByText(/Chords on C \(C4\)/)).toBeInTheDocument();
    expect(screen.queryByText(/\(note\)/)).toBeNull();
  });

  it('stacking Am (common tone C) onto a C adds A3 and E4, leaves the C untouched, and one undo removes only them', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('n1', 1.25, 1, 6000, 0.6)]));
    const before = JSON.stringify(items()[0]);
    useTool(roll, '7');
    click(roll, 60, 90, { ctrlKey: true });
    await user.dblClick(chord('Am'));
    expect(pitchesOf(items())).toEqual([5700, 6000, 6400]);
    expect(JSON.stringify(items().find((item) => item.id === 'n1'))).toBe(before);
    // The new notes sit at the note's onset and take its length and velocity.
    items()
      .filter((item) => item.id !== 'n1')
      .forEach((item) => {
        expect(onsetOf(item)).toBe(1.25);
        expect(lengthOf(item)).toBe(1);
        expect(valueOf(item).velocity).toBe(0.6);
      });
    act(() => undo());
    expect(items()).toHaveLength(1);
    expect(JSON.stringify(items()[0])).toBe(before);
  });

  it('a chord whose tones all exist writes nothing and makes no undo step', async () => {
    const user = userEvent.setup();
    const roll = await open(
      clipOf([seedNote('a', 0, 1, 6000), seedNote('b', 0, 2, 6400), seedNote('c', 0, 0.5, 6700)])
    );
    useTool(roll, '7');
    click(roll, 60, 10);
    const before = JSON.stringify(items());
    const undoable = canUndo();
    await user.dblClick(chord('C'));
    expect(JSON.stringify(items())).toBe(before);
    expect(canUndo()).toBe(undoable);
  });

  it('never alters an earlier longer same-pitch note: its tone is dropped, the others added', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('c', 1, 1, 6000), seedNote('longG', 0, 4, 6700)]));
    const longBefore = JSON.stringify(items().find((item) => item.id === 'longG'));
    useTool(roll, '7');
    click(roll, 60, 74);
    await user.dblClick(chord('C'));
    expect(JSON.stringify(items().find((item) => item.id === 'longG'))).toBe(longBefore);
    expect(pitchesOf(items())).toEqual([6000, 6400, 6700]);
    expect(items()).toHaveLength(3);
  });

  it('a later same-pitch note inside the span is untouched', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('c', 1, 2, 6000), seedNote('laterG', 2, 0.5, 6700)]));
    const laterBefore = JSON.stringify(items().find((item) => item.id === 'laterG'));
    useTool(roll, '7');
    click(roll, 60, 74);
    await user.dblClick(chord('C'));
    expect(JSON.stringify(items().find((item) => item.id === 'laterG'))).toBe(laterBefore);
    expect(pitchesOf(items())).toEqual([6000, 6400, 6700]);
  });

  it('a short covered note is untouched and the free tone is still added', async () => {
    const user = userEvent.setup();
    const roll = await open(
      clipOf([seedNote('c', 1, 2, 6000), seedNote('shortE', 1.5, 0.25, 6400)])
    );
    const shortBefore = JSON.stringify(items()[1]);
    useTool(roll, '7');
    click(roll, 60, 74);
    await user.dblClick(chord('C'));
    expect(pitchesOf(items())).toEqual([6000, 6400, 6700]);
    expect(JSON.stringify(items().find((item) => item.id === 'shortE'))).toBe(shortBefore);
  });

  it('an off-grid note counts as the pitch: no second C is added', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('c', 1, 1, 6030)]));
    useTool(roll, '7');
    click(roll, 60, 74);
    expect(screen.getByText(/On C4 \+30c \(note\)/)).toBeInTheDocument();
    await user.dblClick(chord('C'));
    expect(pitchesOf(items())).toEqual([6000 + 30, 6400, 6700].sort((a, b) => a - b));
  });

  it('uses the note duration whether it is longer or shorter than the grid step', async () => {
    const user = userEvent.setup();
    const roll = await open(
      clipOf([seedNote('long', 0, 2, 6000), seedNote('short', 4, 0.25, 6000)])
    );
    useTool(roll, '7');
    click(roll, 60, 10);
    await user.dblClick(chord('C'));
    click(roll, 60, 4 * 64 + 4);
    await user.dblClick(chord('C'));
    const added = items().filter((item) => item.id !== 'long' && item.id !== 'short');
    expect(added.map((item) => [onsetOf(item), lengthOf(item)]).sort()).toEqual([
      [0, 2],
      [0, 2],
      [4, 0.25],
      [4, 0.25],
    ]);
  });

  it('stacking two chords at one onset leaves one chord slot for the transforms', async () => {
    const user = userEvent.setup();
    const roll = await open(clipOf([seedNote('c', 0, 1, 6000), seedNote('far', 3, 1, 7200)]));
    useTool(roll, '7');
    click(roll, 60, 10);
    await user.dblClick(chord('C')); // adds E and G
    click(roll, 60, 10, { ctrlKey: true });
    await user.dblClick(chord('Am')); // adds A3 (C and E exist)
    expect(pitchesOf(items().filter((item) => onsetOf(item) === 0))).toEqual([
      5700, 6000, 6400, 6700,
    ]);
    const result = reverseOrder(desk.snippets[0].packet, {
      ids: items().map((item) => item.id),
      range: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The four stacked notes were ONE slot: the lone note's slot received all four pitches.
      expect(pitchesOf(result.packet.items.filter((item) => onsetOf(item) === 3))).toEqual([
        5700, 6000, 6400, 6700,
      ]);
      expect(result.packet.items.filter((item) => onsetOf(item) === 0)).toHaveLength(1);
    }
  });

  it('Shift+arrow leaves the stack context: a plain anchor at the new position', async () => {
    const roll = await open(clipOf([seedNote('n1', 0, 2, 6000)]));
    useTool(roll, '7');
    click(roll, 60, 10);
    expect(screen.getByText(/On C4 \(note\)/)).toBeInTheDocument();
    fireEvent.keyDown(roll, { key: 'ArrowRight', shiftKey: true });
    expect(screen.queryByText(/\(note\)/)).toBeNull();
    expect(screen.getByText(/Chords on C \(C4\)/)).toBeInTheDocument();
    // Back to the grid step length (a half quarter), not the note's two quarters.
    expect(parseFloat(ghosts('anchor')[0].style.width)).toBeCloseTo(32, 0);
  });

  it('with the Pointer tool a click on a note opens no picker', async () => {
    const roll = await open(clipOf([seedNote('n1', 0, 2, 6000)]));
    useTool(roll, '1');
    click(roll, 60, 10);
    expect(screen.queryByText(/\(note\)/)).toBeNull();
    expect(document.querySelector('[data-chord-host]')).toBeNull();
    expect(items()).toHaveLength(1);
  });
});

describe('noteAtCell tie-break', () => {
  it('prefers the smaller start on equal distance, whatever the packet order', () => {
    const cell = { pitchMidicents: 6000, start: 1, step: 1 };
    const early = { id: 'e', pitchMidicents: 6000, start: 0.5, duration: 2, label: 'x' };
    const late = { id: 'l', pitchMidicents: 6000, start: 1.5, duration: 2, label: 'x' };
    expect(noteAtCell([late, early], cell)?.id).toBe('e');
    expect(noteAtCell([early, late], cell)?.id).toBe('e');
  });
});

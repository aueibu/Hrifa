import { act, fireEvent, render, screen, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import { auditionRefusal, makeSourceRefusal } from '../clipTypes';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { canUndo, historyChangeCount, resetHistory, undo } from '../history';
import type { NoteEventValue } from '../melodicization';
import { packet, type DataItem } from '../model';
import { defaultMusicalTimeline, musicalDuration, musicalPosition, rational } from '../musicalTime';
import { acceptsSnippets, type Snippet } from '../snippet';
import { DeskView } from './DeskView';
import { NoteClipEditor } from './NoteClipEditor';

// Audition is only checked for being enabled here, so a silent stand-in engine is enough.
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: async () => undefined, subscribe: () => () => undefined }),
}));

let desk: ReturnType<typeof useDesk>;

function Harness() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return (
    <>
      {clip && <NoteClipEditor snippet={clip} />}
      {clip && <DeskView onMakeSource={() => undefined} />}
    </>
  );
}

const plain = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const noteValue = (id: string) =>
  desk.snippets[0].packet.items.find((entry) => entry.id === id)!.value as NoteEventValue;

function seedNote(
  id: string,
  start: number,
  length: number,
  midicents: number
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: musicalPosition(start),
      interOnset: musicalDuration(length),
      duration: musicalDuration(length),
      pitches: [midicents],
      velocity: 1,
    },
    label: id,
    provenance: [],
  };
}

async function open(seed?: Snippet) {
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await waitFor(() => expect(desk.loading).toBe(false));
  act(() => {
    if (seed) {
      desk.addSnippet(seed);
    } else {
      desk.addBlankClip('notes', rational(4));
    }
  });
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

/** Three notes in an 8-quarter clip: C4 at 0, E4 at 2, G4 (two long) at 4. */
function seededClip(): Snippet {
  return {
    schemaVersion: 1,
    id: 'seeded',
    name: 'Seeded',
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [
        seedNote('n1', 0, 1, 6000),
        seedNote('n2', 2, 1, 6400),
        seedNote('n3', 4, 2, 6700),
      ]),
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

// jsdom lays nothing out, so the roll's origin is (0, 0): client coordinates are roll coordinates.
// 64 px per quarter (the grid snaps to half a quarter) and 22 px per semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;

function drag(
  target: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  roll: Element = target
) {
  fireEvent.pointerDown(target, { clientX: from.x, clientY: from.y, pointerId: 1 });
  fireEvent.pointerMove(roll, { clientX: to.x, clientY: to.y, pointerId: 1 });
  fireEvent.pointerUp(roll, { clientX: to.x, clientY: to.y, pointerId: 1 });
}

const editSteps = (id: string, snippet: Snippet = desk.snippets[0]) =>
  snippet.packet.items
    .find((entry) => entry.id === id)!
    .provenance.filter((step) => step.transformation === 'edit-notes')
    .map((step) => step.parameters?.change);

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('the note clip editor', () => {
  it('fills a blank clip from nothing, and the desk can then audition it', async () => {
    const roll = await open();
    const card = (await screen.findByDisplayValue('New clip')).closest(
      'div[class*="card"]'
    ) as HTMLElement;
    expect(within(card).getByRole('button', { name: /Audition/ })).toBeDisabled();
    expect(auditionRefusal(desk.snippets[0])).not.toBeNull();
    const blank = desk.snippets[0];
    expect(blank.packet.items).toHaveLength(0);

    // A blank clip opens with the Draw tool on.
    expect(screen.getByRole('radio', { name: 'Draw' })).toBeChecked();
    drag(roll, { x: 70, y: rowY(60) }, { x: 200, y: rowY(60) });
    drag(roll, { x: 200, y: rowY(64) }, { x: 200, y: rowY(64) });

    const filled = desk.snippets[0];
    expect(filled.id).toBe(blank.id);
    expect(filled.name).toBe(blank.name);
    expect(filled.packet.items).toHaveLength(2);
    const [first, second] = filled.packet.items;
    expect(first.id).not.toBe(second.id);
    expect(first.value).toMatchObject({ pitches: [6000] });
    expect(first.value).toMatchObject({
      onset: { quarterNotes: { numerator: 1, denominator: 1 } },
      duration: { quarterNotes: { numerator: 2, denominator: 1 } },
    });
    expect(second.value).toMatchObject({
      pitches: [6400],
      onset: { quarterNotes: { numerator: 3, denominator: 1 } },
    });
    expect(editSteps(first.id)).toEqual(['added']);
    expect(acceptsSnippets([filled])).toBe(true);
    expect(auditionRefusal(filled)).toBeNull();
    expect(makeSourceRefusal(filled)).toBeNull();
    // The performance plan the desk plays reads the hand-drawn events.
    const plan = createNotePacketPerformancePlan({
      sourceId: filled.id,
      packet: filled.packet as never,
      timeline: defaultMusicalTimeline,
    });
    expect(plan.events).toHaveLength(2);
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: /Audition/ })).toBeEnabled()
    );
    expect(within(card).getByRole('button', { name: 'Make source' })).toBeEnabled();
  });

  it('draws, moves, resizes and deletes notes as edits to the clip, keeping item ids, each undoable', async () => {
    const roll = await open(seededClip());
    const states = [plain(desk.snippets[0])];
    const idsBefore = desk.snippets[0].packet.items.map((entry) => entry.id);

    // Move n1 one quarter later and two semitones down.
    drag(
      screen.getByTitle(/^C4 · 0\.000 qn/),
      { x: 20, y: rowY(60) },
      { x: 20 + 64, y: rowY(60) + 44 },
      roll
    );
    states.push(plain(desk.snippets[0]));
    expect(noteValue('n1')).toMatchObject({
      pitches: [5800],
      onset: { quarterNotes: { numerator: 1, denominator: 1 } },
    });
    expect(editSteps('n1')).toEqual(['modified']);
    expect(editSteps('n2')).toEqual([]);

    // Resize n2 from its right edge (it spans x 128 to 192) by one quarter.
    drag(
      screen.getByTitle(/^E4 · 2\.000 qn/),
      { x: 189, y: rowY(64) },
      { x: 189 + 64, y: rowY(64) },
      roll
    );
    states.push(plain(desk.snippets[0]));
    expect(noteValue('n2').duration.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
    expect(noteValue('n2').onset.quarterNotes).toEqual({ numerator: 2, denominator: 1 });

    // Draw a new note.
    act(() => screen.getByRole('radio', { name: 'Draw' }).click());
    drag(roll, { x: 390, y: rowY(72) }, { x: 420, y: rowY(72) });
    states.push(plain(desk.snippets[0]));
    expect(desk.snippets[0].packet.items).toHaveLength(4);
    const fresh = desk.snippets[0].packet.items[3];
    expect(idsBefore).not.toContain(fresh.id);

    // Delete n3 with the Delete key after selecting it.
    act(() => screen.getByRole('radio', { name: 'Select' }).click());
    fireEvent.pointerDown(screen.getByTitle(/^G4 · 4\.000 qn/), {
      clientX: 270,
      clientY: rowY(67),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 270, clientY: rowY(67), pointerId: 1 });
    fireEvent.keyDown(roll, { key: 'Delete' });
    states.push(plain(desk.snippets[0]));
    expect(desk.snippets[0].packet.items.map((entry) => entry.id)).toEqual(['n1', 'n2', fresh.id]);

    // Every edit kept the clip's identity and the ids of the notes it left in place.
    expect(desk.snippets[0].id).toBe('seeded');
    expect(desk.snippets[0].packet.items.slice(0, 2).map((entry) => entry.id)).toEqual([
      'n1',
      'n2',
    ]);

    // Undo walks back through each edit, restoring the exact snippet each time.
    for (let step = states.length - 2; step >= 0; step -= 1) {
      act(() => undo());
      expect(plain(desk.snippets[0])).toEqual(states[step]);
    }
  });

  it('erases a note with the Erase tool', async () => {
    const roll = await open(seededClip());
    act(() => screen.getByRole('radio', { name: 'Erase' }).click());
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    expect(desk.snippets[0].packet.items.map((entry) => entry.id)).toEqual(['n1', 'n3']);
  });

  it('makes one version of a run of hand edits, but one undo step per edit', async () => {
    const roll = await open(seededClip());
    expect(desk.snippets[0].lineage).toBeUndefined();
    const first = screen.getByTitle(/^C4 · 0\.000 qn/);
    drag(first, { x: 20, y: rowY(60) }, { x: 84, y: rowY(60) }, roll);
    drag(
      screen.getByTitle(/^C4 · 1\.000 qn/),
      { x: 84, y: rowY(60) },
      { x: 148, y: rowY(60) },
      roll
    );
    drag(
      screen.getByTitle(/^C4 · 2\.000 qn/),
      { x: 148, y: rowY(60) },
      { x: 212, y: rowY(60) },
      roll
    );
    expect(noteValue('n1').onset.quarterNotes).toEqual({ numerator: 3, denominator: 1 });
    // The original and one session version, however many edits.
    expect(desk.snippets[0].lineage!.versions).toHaveLength(2);
    expect(editSteps('n1')).toEqual(['modified']);

    act(() => undo());
    expect(noteValue('n1').onset.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
    act(() => undo());
    expect(noteValue('n1').onset.quarterNotes).toEqual({ numerator: 1, denominator: 1 });
    act(() => undo());
    expect(noteValue('n1').onset.quarterNotes).toEqual({ numerator: 0, denominator: 1 });
    expect(canUndo()).toBe(true);
  });

  it('keeps a selection of events plus the time they occupy, as view state outside the history', async () => {
    const roll = await open(seededClip());
    const clipBefore = desk.snippets[0];
    const changes = historyChangeCount();

    // Click n2 (2 to 3 quarters): its range is the band over its time.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    let band = screen.getByTestId('roll-range');
    expect(band.style.left).toBe('128px');
    expect(band.style.width).toBe('64px');

    // Marquee over empty space only: no events, but a time range.
    drag(roll, { x: 300, y: 10 }, { x: 420, y: 30 });
    expect(roll).toHaveAccessibleName(/0 selected/);
    band = screen.getByTestId('roll-range');
    expect(band.style.left).toBe('288px');
    expect(band.style.width).toBe('160px');

    // A marquee that touches n3 and runs on over empty space: the events plus the whole span.
    drag(roll, { x: 300, y: rowY(67) - 8 }, { x: 600, y: rowY(67) + 8 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    band = screen.getByTestId('roll-range');
    expect(band.style.left).toBe('256px');
    expect(band.style.width).toBe('352px');

    // Nothing above touched the clip or the history.
    expect(desk.snippets[0]).toBe(clipBefore);
    expect(historyChangeCount()).toBe(changes);
  });

  it('lets notes run past the clip end, marked by bracket markers', async () => {
    const roll = await open();
    // The clip is one bar of 4/4 (4 quarters, 256 px): the end is marked there.
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('256px');
    expect(screen.getByTestId('roll-end-line').style.left).toBe('256px');
    // A note drawn past the end stays, at its full length.
    drag(roll, { x: 300, y: rowY(60) }, { x: 400, y: rowY(60) });
    expect(desk.snippets[0].packet.items).toHaveLength(1);
    const [first] = desk.snippets[0].packet.items;
    expect(noteValue(first.id).onset.quarterNotes).toEqual({ numerator: 9, denominator: 2 });
    expect(noteValue(first.id).duration.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
    // The marker does not move with the notes.
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('256px');
  });

  it('no longer shows the saved-as-you-make-them line', async () => {
    await open(seededClip());
    expect(screen.queryByText(/saved to the clip/i)).toBeNull();
  });

  it('previews a group move as it commits: one clamped delta keeps the shape, under a ghost', async () => {
    const roll = await open(seededClip());
    const pick = (title: RegExp, x: number, y: number, shiftKey = false) => {
      fireEvent.pointerDown(screen.getByTitle(title), {
        clientX: x,
        clientY: y,
        shiftKey,
        pointerId: 1,
      });
      fireEvent.pointerUp(roll, { clientX: x, clientY: y, pointerId: 1 });
    };
    pick(/^E4 · 2\.000 qn/, 140, rowY(64));
    pick(/^G4 · 4\.000 qn/, 270, rowY(67), true);
    expect(roll).toHaveAccessibleName(/2 selected/);
    fireEvent.pointerDown(screen.getByTitle(/^G4 · 4\.000 qn/), {
      clientX: 270,
      clientY: rowY(67),
      pointerId: 2,
    });
    fireEvent.pointerMove(roll, { clientX: 270 - 192, clientY: rowY(67), pointerId: 2 });
    // n2 stops at 0 (a 2-quarter move back), so n3 goes back 2 as well, not 3.
    const ghostLeft = (id: string) =>
      (document.querySelector(`[data-ghost="${id}"]`) as HTMLElement).style.left;
    expect(ghostLeft('n2')).toBe('0px');
    expect(ghostLeft('n3')).toBe('128px');
    // The real notes have not moved yet.
    expect(noteValue('n3').onset.quarterNotes).toEqual({ numerator: 4, denominator: 1 });
    fireEvent.pointerUp(roll, { clientX: 270 - 192, clientY: rowY(67), pointerId: 2 });
    expect(noteValue('n2').onset.quarterNotes).toEqual({ numerator: 0, denominator: 1 });
    expect(noteValue('n3').onset.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
  });

  it('recomputes the selection range when the clip changes from outside (undo of a move)', async () => {
    const roll = await open(seededClip());
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 2,
    });
    fireEvent.pointerMove(roll, { clientX: 140 + 64, clientY: rowY(64), pointerId: 2 });
    fireEvent.pointerUp(roll, { clientX: 140 + 64, clientY: rowY(64), pointerId: 2 });
    expect(screen.getByTestId('roll-range').style.left).toBe('192px');
    act(() => undo());
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.getByTestId('roll-range').style.left).toBe('128px');
    expect(screen.getByTestId('roll-range').style.width).toBe('64px');
  });

  it('treats a refused edit as nothing happening: notes and selection stay, and the notice shows', async () => {
    const roll = await open(seededClip());
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    // A project open freezes the desk, so the next edit is refused.
    await act(async () => {
      await desk.replaceDesk(desk.snippets, { reloading: true });
    });
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    drag(
      screen.getByTitle(/^E4 · 2\.000 qn/),
      { x: 140, y: rowY(64) },
      { x: 140 + 64, y: rowY(64) },
      roll
    );
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.getByText(/not accepting changes/)).toBeInTheDocument();
  });
});

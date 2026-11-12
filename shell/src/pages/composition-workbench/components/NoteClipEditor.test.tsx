import { act, cleanup, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import { auditionRefusal, makeSourceRefusal } from '../clipTypes';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { canUndo, historyChangeCount, redo, resetHistory, undo } from '../history';
import type { NoteEventValue } from '../melodicization';
import { packet, type DataItem } from '../model';
import { defaultMusicalTimeline, musicalDuration, musicalPosition, rational } from '../musicalTime';
import { readNoteEditor } from '../noteEditorChannel';
import { NOTE_EDITOR_PREFERENCES_KEY, readNoteEditorPreferences } from '../noteEditorPreferences';
import { acceptsSnippets, type Snippet } from '../snippet';
import { DeskView } from './DeskView';
import { gridSourceFor, NOTE_EDITOR_TIME_ZOOM, NoteClipEditor } from './NoteClipEditor';

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

    // A blank clip opens with the Pencil tool on.
    expect(screen.getByRole('radio', { name: 'Pencil' })).toBeChecked();
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
      // From the press point: 130 px is 2.03 quarters, snapped to 2.
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
    act(() => screen.getByRole('radio', { name: 'Pencil' }).click());
    drag(roll, { x: 390, y: rowY(72) }, { x: 420, y: rowY(72) });
    states.push(plain(desk.snippets[0]));
    expect(desk.snippets[0].packet.items).toHaveLength(4);
    const fresh = desk.snippets[0].packet.items[3];
    expect(idsBefore).not.toContain(fresh.id);

    // Delete n3 with the Delete key after selecting it.
    act(() => screen.getByRole('radio', { name: 'Pointer' }).click());
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

  it('erases a note with the Eraser tool, on release', async () => {
    const roll = await open(seededClip());
    act(() => screen.getByRole('radio', { name: 'Eraser' }).click());
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

    // Click n2 (2 to 3 quarters): selected; the neutral items band (not the cyan time band) shows.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.queryByTestId('roll-range')).toBeNull();
    expect(screen.getByTestId('roll-items-range').style.left).toBe('128px');
    expect(screen.getByTestId('roll-items-range').style.width).toBe('64px');

    // Marquee over empty space only: no events, a time selection with the cyan band only.
    drag(roll, { x: 300, y: 10 }, { x: 420, y: 30 });
    // (n3 runs 4 to 6 through the span 4.5 to 7, so a time selection holds it.)
    expect(roll).toHaveAccessibleName(/1 selected/);
    const band = screen.getByTestId('roll-range');
    expect(band.style.left).toBe('288px');
    expect(band.style.width).toBe('160px');
    expect(screen.queryByTestId('roll-items-range')).toBeNull();

    // A marquee that touches n3 selects it: the neutral band, never the cyan one. (It starts left of
    // the cyan band: a Pointer press inside the band would move its content instead.)
    drag(roll, { x: 230, y: rowY(67) - 8 }, { x: 300, y: rowY(67) + 8 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.queryByTestId('roll-range')).toBeNull();
    expect(screen.getByTestId('roll-items-range')).toBeInTheDocument();

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
    expect(noteValue(first.id).duration.quarterNotes).toEqual({ numerator: 3, denominator: 2 });
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
    expect(screen.queryByTestId('roll-range')).toBeNull();
    act(() => undo());
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.queryByTestId('roll-range')).toBeNull();
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

describe('the note clip editor tools', () => {
  const tool = (name: string) => screen.getByRole('radio', { name });
  const itemIds = () => desk.snippets[0].packet.items.map((entry) => entry.id);
  const sessionVersions = () => desk.snippets[0].lineage?.versions.length;

  it('opens on Pointer for a clip with notes and on Pencil for an empty one', async () => {
    await open(seededClip());
    expect(tool('Pointer')).toBeChecked();
  });

  it('pointer: double-click on empty space adds a note, on a note deletes it, one undo step each', async () => {
    const roll = await open(seededClip());
    const changes = historyChangeCount();
    fireEvent.doubleClick(roll, { clientX: 450, clientY: rowY(72) });
    fireEvent.pointerUp(roll, { pointerId: 1 });
    expect(itemIds()).toHaveLength(4);
    expect(historyChangeCount()).toBe(changes + 1);
    expect(desk.snippets[0].packet.items[3].value).toMatchObject({ pitches: [7200] });
    fireEvent.doubleClick(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
    });
    expect(itemIds()).not.toContain('n2');
    expect(historyChangeCount()).toBe(changes + 2);
    act(() => undo());
    expect(itemIds()).toContain('n2');
    act(() => undo());
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);
  });

  it('time selection: selects the span and the notes overlapping it, without touching the clip', async () => {
    const roll = await open(seededClip());
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    act(() => tool('Time').click());
    // 120 px to 300 px: quarters 1.5 to 5 (grid 0.5): n2 (at 2) and n3 (at 4) start inside.
    drag(roll, { x: 120, y: 5 }, { x: 300, y: 5 });
    expect(roll).toHaveAccessibleName(/2 selected/);
    const band = screen.getByTestId('roll-range');
    // The range is exactly the dragged span (1.5 to 5): n3 runs on to 6 but does not widen it.
    expect(band.style.left).toBe('96px');
    expect(band.style.width).toBe(`${5 * 64 - 96}px`);
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
    // The band belongs to the time selection, not the tool: it stays through a tool switch ...
    act(() => tool('Pointer').click());
    expect(screen.getByTestId('roll-range')).toBeInTheDocument();
    // ... and goes (for the neutral note band) as soon as a note is clicked.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 5,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 5 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.queryByTestId('roll-range')).toBeNull();
    expect(screen.getByTestId('roll-items-range')).toBeInTheDocument();
    expect(screen.getByTestId('roll-items-range')).toBeInTheDocument();
  });

  describe('the time band is cleared by the next press, and never shares the panel with the items band', () => {
    async function withTimeBand() {
      const roll = await open(seededClip());
      act(() => tool('Time').click());
      drag(roll, { x: 120, y: 5 }, { x: 300, y: 5 });
      expect(screen.getByTestId('roll-range')).toBeInTheDocument();
      expect(screen.queryByTestId('roll-items-range')).toBeNull();
      return roll;
    }
    const bands = () => [
      screen.queryByTestId('roll-range'),
      screen.queryByTestId('roll-items-range'),
    ];

    it('a press on empty roll space clears it before the gesture (Pointer tool)', async () => {
      const roll = await withTimeBand();
      act(() => tool('Pointer').click());
      expect(screen.getByTestId('roll-range')).toBeInTheDocument();
      fireEvent.pointerDown(roll, { clientX: 700, clientY: 5, pointerId: 7 });
      expect(bands()).toEqual([null, null]);
      expect(roll).toHaveAccessibleName(/0 selected/);
    });

    it('a press on a note clears it and selects the note under the neutral band', async () => {
      const roll = await withTimeBand();
      act(() => tool('Pointer').click());
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 140,
        clientY: rowY(64),
        pointerId: 8,
      });
      expect(screen.queryByTestId('roll-range')).toBeNull();
      fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 8 });
      expect(screen.queryByTestId('roll-range')).toBeNull();
      expect(screen.getByTestId('roll-items-range')).toBeInTheDocument();
    });

    it('a press in the velocity lane clears it', async () => {
      await withTimeBand();
      const pin = document.querySelector('[data-testid="velocity-pin"]') as HTMLElement;
      fireEvent.pointerDown(pin, { clientX: 0, clientY: 8, pointerId: 9 });
      expect(screen.queryByTestId('roll-range')).toBeNull();
      expect(screen.queryByTestId('velocity-range')).toBeNull();
    });

    it('a new Time drag replaces the band: exactly one band, the new one', async () => {
      const roll = await withTimeBand();
      drag(roll, { x: 400, y: 5 }, { x: 460, y: 5 });
      const band = screen.getByTestId('roll-range');
      expect(band.style.left).toBe('384px');
      expect(screen.getAllByTestId('roll-range')).toHaveLength(1);
      expect(screen.queryByTestId('roll-items-range')).toBeNull();
    });

    it('the lane shows the cyan band only for a time selection, and never an items band', async () => {
      const roll = await withTimeBand();
      expect(screen.getByTestId('velocity-range')).toBeInTheDocument();
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 140,
        clientY: rowY(64),
        pointerId: 10,
      });
      fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 10 });
      expect(screen.queryByTestId('velocity-range')).toBeNull();
    });
  });

  it('pencil: a click adds a note at the remembered length; a drag sets length and velocity together, both remembered per viewer', async () => {
    const roll = await open();
    // The first note takes the grid unit (half a quarter at this zoom).
    drag(roll, { x: 70, y: rowY(60) }, { x: 70, y: rowY(60) });
    const first = desk.snippets[0].packet.items[0];
    expect(noteValue(first.id).duration.quarterNotes).toEqual({ numerator: 1, denominator: 2 });
    expect(noteValue(first.id).velocity).toBe(0.8);
    expect(readNoteEditorPreferences().entryLength).toBeNull();

    // One drag from the press point: 130 px right sets the length to 2, 30 px up raises the velocity to the top.
    drag(roll, { x: 200, y: rowY(64) }, { x: 330, y: rowY(64) - 30 });
    const second = desk.snippets[0].packet.items[1];
    expect(noteValue(second.id).duration.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
    expect(noteValue(second.id).velocity).toBe(1);
    expect(readNoteEditorPreferences().entryLength).toBe(2);
    expect(readNoteEditorPreferences().entryVelocity).toBe(1);
    expect(JSON.parse(localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY) ?? '{}').entryLength).toBe(
      2
    );

    // The next plain click uses it; the preference is not history and not in the packet.
    const changes = historyChangeCount();
    drag(roll, { x: 400, y: rowY(67) }, { x: 400, y: rowY(67) });
    const third = desk.snippets[0].packet.items[2];
    expect(noteValue(third.id).duration.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
    expect(noteValue(third.id).velocity).toBe(1);
    expect(historyChangeCount()).toBe(changes + 1);
    expect(JSON.stringify(desk.snippets[0].packet)).not.toContain('entryLength');
    expect(editSteps(third.id)).toEqual(['added']);
  });

  it('paint: one gesture lays notes on every grid step, as one undo step and one version', async () => {
    const roll = await open(seededClip());
    act(() => tool('Paint').click());
    const changes = historyChangeCount();
    // At half-quarter steps (32 px): x 330 to 400 covers steps 10 to 12, at E5 (76).
    drag(roll, { x: 330, y: rowY(76) }, { x: 400, y: rowY(76) });
    const added = desk.snippets[0].packet.items.slice(3);
    expect(added).toHaveLength(3);
    expect(added.map((entry) => (entry.value as NoteEventValue).onset.quarterNotes)).toEqual([
      { numerator: 5, denominator: 1 },
      { numerator: 11, denominator: 2 },
      { numerator: 6, denominator: 1 },
    ]);
    added.forEach((entry) => {
      expect((entry.value as NoteEventValue).pitches).toEqual([7600]);
      expect((entry.value as NoteEventValue).duration.quarterNotes).toEqual({
        numerator: 1,
        denominator: 2,
      });
    });
    expect(historyChangeCount()).toBe(changes + 1);
    expect(sessionVersions()).toBe(2);
    act(() => undo());
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);
  });

  it('paint: every note takes the remembered entry velocity, as one undo step, leaving hand edits alone', async () => {
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ entryVelocity: 0.38 }));
    const roll = await open(seededClip());
    act(() => tool('Paint').click());
    const changes = historyChangeCount();
    drag(roll, { x: 330, y: rowY(76) }, { x: 400, y: rowY(76) });
    const added = desk.snippets[0].packet.items.slice(3);
    expect(added).toHaveLength(3);
    added.forEach((entry) => expect((entry.value as NoteEventValue).velocity).toBe(0.38));
    expect(noteValue('n1').velocity).not.toBe(0.38);
    expect(historyChangeCount()).toBe(changes + 1);
    // Painting never rewrites the remembered velocity.
    expect(readNoteEditorPreferences().entryVelocity).toBe(0.38);
    act(() => undo());
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);
  });

  it('knife: splits at the nearest grid line; the left half keeps the id, the right gets a new one', async () => {
    await open(seededClip());
    act(() => tool('Knife').click());
    const changes = historyChangeCount();
    // n3 runs 4 to 6 (x 256 to 384): x 330 is 5.16 quarters, nearest line 5.
    fireEvent.pointerDown(screen.getByTitle(/^G4 · 4\.000 qn/), {
      clientX: 330,
      clientY: rowY(67),
      pointerId: 1,
    });
    fireEvent.pointerUp(screen.getByRole('group', { name: /Note clip piano roll/ }), {
      pointerId: 1,
    });
    expect(itemIds().slice(0, 3)).toEqual(['n1', 'n2', 'n3']);
    expect(itemIds()).toHaveLength(4);
    const right = desk.snippets[0].packet.items[3];
    expect(right.id).not.toBe('n3');
    expect(noteValue('n3').duration.quarterNotes).toEqual({ numerator: 1, denominator: 1 });
    expect(noteValue(right.id).onset.quarterNotes).toEqual({ numerator: 5, denominator: 1 });
    expect(noteValue(right.id).duration.quarterNotes).toEqual({ numerator: 1, denominator: 1 });
    expect(noteValue(right.id).pitches).toEqual([6700]);
    expect(noteValue(right.id).velocity).toBe(1);
    expect(editSteps('n3')).toEqual(['modified']);
    expect(editSteps(right.id)).toEqual(['added']);
    expect(historyChangeCount()).toBe(changes + 1);
    act(() => undo());
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);
    expect(noteValue('n3').duration.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
  });

  it('eraser: a sweep deletes every crossed note only on release, as one undo step; Escape cancels', async () => {
    const roll = await open(seededClip());
    act(() => tool('Eraser').click());
    const changes = historyChangeCount();
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 1,
    });
    fireEvent.pointerMove(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
    expect(screen.getByTitle(/^C4 · 0\.000 qn/)).toHaveAttribute('data-erasing');
    expect(screen.getByTitle(/^E4 · 2\.000 qn/)).toHaveAttribute('data-erasing');
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);
    expect(historyChangeCount()).toBe(changes);
    fireEvent.pointerUp(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
    expect(itemIds()).toEqual(['n3']);
    expect(historyChangeCount()).toBe(changes + 1);
    act(() => undo());
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);

    // Escape before release leaves everything alone.
    const afterUndo = historyChangeCount();
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 2,
    });
    fireEvent.keyDown(roll, { key: 'Escape' });
    fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 2 });
    expect(itemIds()).toEqual(['n1', 'n2', 'n3']);
    expect(historyChangeCount()).toBe(afterUndo);
  });

  it('every tool gesture is a hand edit: one version for a run of different tools', async () => {
    const roll = await open(seededClip());
    act(() => tool('Paint').click());
    drag(roll, { x: 330, y: rowY(76) }, { x: 330, y: rowY(76) });
    act(() => tool('Knife').click());
    fireEvent.pointerDown(screen.getByTitle(/^G4 · 4\.000 qn/), {
      clientX: 330,
      clientY: rowY(67),
      pointerId: 1,
    });
    act(() => tool('Eraser').click());
    drag(
      screen.getByTitle(/^C4 · 0\.000 qn/),
      { x: 20, y: rowY(60) },
      { x: 20, y: rowY(60) },
      roll
    );
    // The original plus one session version, however many gestures.
    expect(sessionVersions()).toBe(2);
  });

  it('number keys switch tools only while the roll has focus, never in a text field', async () => {
    const roll = await open(seededClip());
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '4' });
    expect(tool('Pointer')).toBeChecked();
    roll.focus();
    fireEvent.keyDown(roll, { key: '4' });
    expect(tool('Paint')).toBeChecked();
    fireEvent.keyDown(roll, { key: '6' });
    expect(tool('Eraser')).toBeChecked();
    fireEvent.keyDown(roll, { key: '1' });
    expect(tool('Pointer')).toBeChecked();
    input.remove();
  });

  it('the tool menu lists the tools with their numbers and switches tool', async () => {
    const user = userEvent.setup();
    await open(seededClip());
    await user.click(screen.getByRole('button', { name: /Tool: Pointer/ }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '✓Pointer1',
      'Time2',
      'Pencil3',
      'Paint4',
      'Knife5',
      'Eraser6',
    ]);
    await user.click(screen.getByRole('menuitem', { name: /Knife/ }));
    expect(tool('Knife')).toBeChecked();
    expect(screen.getByRole('button', { name: /Tool: Knife/ })).toBeInTheDocument();
  });

  it('the grid menu changes the snap (and the paint step), and is remembered per viewer', async () => {
    const user = userEvent.setup();
    const roll = await open(seededClip());
    await user.click(screen.getByRole('button', { name: /Grid: Auto/ }));
    await user.click(await screen.findByRole('menuitem', { name: '1/16' }));
    expect(screen.getByRole('button', { name: /Grid: 1\/16/ })).toBeInTheDocument();
    expect(readNoteEditorPreferences().grid).toBe('1/16');
    // Snap is now a sixteenth (a quarter of a quarter note): a move of 20 px (0.31 quarters) lands on 0.25.
    drag(
      screen.getByTitle(/^C4 · 0\.000 qn/),
      { x: 20, y: rowY(60) },
      { x: 40, y: rowY(60) },
      roll
    );
    expect(noteValue('n1').onset.quarterNotes).toEqual({ numerator: 1, denominator: 4 });
    // A triplet grid snaps to thirds.
    await user.click(screen.getByRole('button', { name: /Grid: 1\/16/ }));
    await user.click(await screen.findByRole('menuitem', { name: '1/4 triplet' }));
    act(() => tool('Paint').click());
    drag(roll, { x: 430, y: rowY(76) }, { x: 430, y: rowY(76) });
    const painted = desk.snippets[0].packet.items.at(-1)!.value as NoteEventValue;
    expect(painted.duration.quarterNotes).toEqual({ numerator: 2, denominator: 3 });
  });
});

describe('velocity editing in the note clip editor', () => {
  // The lane is 84 px tall with 8 px of padding, so 68 px is the whole 0 to 100% range.
  const pinOf = (id: string) =>
    document.querySelector(`[data-testid="velocity-pin"][data-note="${id}"]`) as HTMLElement;

  it('shows one stem and pin per note, and a pin drag sets that note as one undo step and a hand edit', async () => {
    await open(seededClip());
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    const pin = pinOf('n2:pitch:0');
    const steps = historyChangeCount();
    fireEvent.pointerDown(pin, { clientX: 0, clientY: 8, pointerId: 1 });
    fireEvent.pointerMove(pin, { clientX: 0, clientY: 8 + 34, pointerId: 1 });
    // Nothing is written until release.
    expect(noteValue('n2').velocity).toBe(1);
    expect(screen.getByTestId('velocity-lane-readout')).toHaveTextContent('50%');
    fireEvent.pointerUp(pin, { clientX: 0, clientY: 8 + 34, pointerId: 1 });
    expect(noteValue('n2').velocity).toBe(0.5);
    expect(noteValue('n1').velocity).toBe(1);
    expect(historyChangeCount()).toBe(steps + 1);
    expect(editSteps('n2')).toEqual(['modified']);
    act(() => undo());
    expect(noteValue('n2').velocity).toBe(1);
  });

  it('collapses the lane and remembers that per viewer', async () => {
    await open(seededClip());
    fireEvent.click(screen.getByRole('button', { name: 'Hide velocity lane' }));
    expect(screen.queryAllByTestId('velocity-stem')).toHaveLength(0);
    expect(readNoteEditorPreferences().velocityLaneCollapsed).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show velocity lane' }));
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
  });

  it('V toggles the lane while the roll has focus; a collapsed lane is reopenable by icon and by V', async () => {
    const roll = await open(seededClip());
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'v' });
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    // Not focused in the roll: the key reaches nothing.
    fireEvent.keyDown(document.body, { key: 'v' });
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    roll.focus();
    // Modifiers are never taken.
    fireEvent.keyDown(roll, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(roll, { key: 'v', metaKey: true });
    fireEvent.keyDown(roll, { key: 'v', altKey: true });
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    fireEvent.keyDown(roll, { key: 'v' });
    expect(screen.queryAllByTestId('velocity-stem')).toHaveLength(0);
    expect(readNoteEditorPreferences().velocityLaneCollapsed).toBe(true);
    // Reopen by the icon, collapse again by V, reopen by V.
    fireEvent.click(screen.getByRole('button', { name: 'Show velocity lane' }));
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    fireEvent.keyDown(roll, { key: 'V' });
    expect(screen.queryAllByTestId('velocity-stem')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Show velocity lane' })).toHaveAttribute(
      'title',
      expect.stringContaining('V')
    );
    fireEvent.keyDown(roll, { key: 'v' });
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    input.remove();
  });

  it('keeps the piano keys outside the roll scroller and the scrollbar below the lane', async () => {
    await open(seededClip());
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    expect(scroller).not.toBeNull();
    // The keys are in the roll's gutter column, not inside the scrolling area.
    const keyboard = document.querySelector('[class*="gutterKeys"]') as HTMLElement;
    expect(keyboard).not.toBeNull();
    expect(scroller.contains(keyboard)).toBe(false);
    // The horizontal scrollbar follows the lane in document order, and the toggle is in the lane's key-width gutter.
    const lane = screen.getByRole('group', { name: 'Velocity lane' });
    const bar = screen.getByTestId('roll-hscroll');
    expect(lane.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const header = screen.getByRole('button', { name: 'Hide velocity lane' }).parentElement!;
    expect(header.style.width).toBe('72px');
  });

  it('the lane splitter resizes within its limits, remembers the height and resets on double-click', async () => {
    await open(seededClip());
    const splitter = screen.getByRole('separator', { name: 'Resize velocity lane' });
    expect(splitter).toHaveAttribute('aria-orientation', 'horizontal');
    const height = () =>
      (screen.getByRole('group', { name: 'Velocity lane' }) as HTMLElement).style.height;
    expect(height()).toBe('84px');
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientY: 260, pointerId: 1 });
    expect(height()).toBe('124px');
    // Nothing is stored until release.
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
    fireEvent.pointerUp(splitter, { clientY: 260, pointerId: 1 });
    expect(readNoteEditorPreferences().laneHeight).toBe(124);
    expect(height()).toBe('124px');
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(splitter, { clientY: 9000, pointerId: 1 });
    expect(readNoteEditorPreferences().laneHeight).toBe(32);
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(splitter, { clientY: -9000, pointerId: 1 });
    expect(readNoteEditorPreferences().laneHeight).toBe(400);
    fireEvent.doubleClick(splitter);
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
    expect(height()).toBe('84px');
  });

  it('a cancelled or escaped splitter drag restores the starting height', async () => {
    await open(seededClip());
    const splitter = screen.getByRole('separator', { name: 'Resize velocity lane' });
    const height = () =>
      (screen.getByRole('group', { name: 'Velocity lane' }) as HTMLElement).style.height;
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientY: 250, pointerId: 1 });
    expect(height()).toBe('134px');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(height()).toBe('84px');
    fireEvent.pointerUp(splitter, { clientY: 250, pointerId: 1 });
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientY: 250, pointerId: 1 });
    fireEvent.pointerCancel(splitter, { pointerId: 1 });
    expect(height()).toBe('84px');
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientY: 250, pointerId: 1 });
    fireEvent.lostPointerCapture(splitter, { pointerId: 1 });
    expect(height()).toBe('84px');
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
  });

  it('the splitter is keyboard accessible with the arrow keys', async () => {
    await open(seededClip());
    const splitter = screen.getByRole('separator', { name: 'Resize velocity lane' });
    fireEvent.keyDown(splitter, { key: 'ArrowUp' });
    expect(readNoteEditorPreferences().laneHeight).toBe(92);
    fireEvent.keyDown(splitter, { key: 'ArrowDown' });
    fireEvent.keyDown(splitter, { key: 'ArrowDown' });
    expect(readNoteEditorPreferences().laneHeight).toBe(76);
  });

  it('a lane stem wears the same velocity fill as its note', async () => {
    await open(seededClip());
    const note = screen.getByTitle(/^C4 · 0\.000 qn/);
    const stem = document.querySelector(
      '[data-testid="velocity-stem"][data-note="n1:pitch:0"]'
    ) as HTMLElement;
    expect(stem.style.getPropertyValue('--stem-fill')).toBe(
      note.style.getPropertyValue('--note-fill')
    );
    expect(stem.style.getPropertyValue('--stem-opacity')).toBe('');
    expect(note.style.getPropertyValue('--note-fill-opacity')).toBe('');
  });

  it('fills notes by velocity, and Alt-drag on a note sets velocity as one undo step', async () => {
    const roll = await open(seededClip());
    const note = screen.getByTitle(/^C4 · 0\.000 qn/);
    expect(note).toHaveAttribute('data-velocity-fill');
    const steps = historyChangeCount();
    fireEvent.pointerDown(note, { clientX: 20, clientY: rowY(60), altKey: true, pointerId: 1 });
    fireEvent.pointerMove(roll, {
      clientX: 20,
      clientY: rowY(60) + 60,
      altKey: true,
      pointerId: 1,
    });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('50%');
    fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60) + 60, pointerId: 1 });
    expect(noteValue('n1').velocity).toBe(0.5);
    expect(historyChangeCount()).toBe(steps + 1);
    expect(editSteps('n1')).toEqual(['modified']);
  });

  it('colors notes by scale degree only when the setting is on', async () => {
    await open(seededClip());
    expect(screen.getByTitle(/^C4 · 0\.000 qn/)).not.toHaveAttribute('data-colored');
    cleanup();
    localStorage.setItem(
      'hrifa.composition-workbench.settings.v1',
      JSON.stringify({ colorByScaleDegree: true })
    );
    await open(seededClip());
    const c = screen.getByTitle(/^C4 · 0\.000 qn/);
    const e = screen.getByTitle(/^E4 · 2\.000 qn/);
    expect(c).toHaveAttribute('data-colored');
    expect(c.style.getPropertyValue('--note-color')).toMatch(/^var\(--mark-/);
    expect(c.style.getPropertyValue('--note-color')).not.toBe(
      e.style.getPropertyValue('--note-color')
    );
    // The lane stem carries the same color as its note.
    const stem = document.querySelector(
      '[data-testid="velocity-stem"][data-note="n1:pitch:0"]'
    ) as HTMLElement;
    expect(stem.style.getPropertyValue('--stem-color')).toBe(
      c.style.getPropertyValue('--note-color')
    );
  });
});

describe('the note editor as one panel', () => {
  const lane = () => screen.getByRole('group', { name: 'Velocity lane' });
  const pin = (id: string) =>
    document.querySelector(`[data-testid="velocity-pin"][data-note="${id}"]`) as HTMLElement;
  const toolRadio = (name: string) => screen.getByRole('radio', { name });

  it('V and the tool numbers work after a click in the lane, because the panel is one focus scope', async () => {
    await open(seededClip());
    // A click on the lane background or a pin focuses the panel (the nearest focusable ancestor).
    const scope = lane().closest('[tabindex="-1"]') as HTMLElement;
    expect(scope).not.toBeNull();
    expect(scope).toContainElement(pin('n1:pitch:0'));
    scope.focus();
    fireEvent.keyDown(pin('n1:pitch:0'), { key: '4' });
    expect(toolRadio('Paint')).toBeChecked();
    fireEvent.keyDown(lane(), { key: 'v' });
    expect(screen.queryAllByTestId('velocity-stem')).toHaveLength(0);
    // The collapsed lane's icon lives in the scrollbar row's gutter, and V still brings it back.
    const bar = screen.getByTestId('roll-hscroll');
    const reopen = screen.getByRole('button', { name: 'Show velocity lane' });
    expect(bar.parentElement!.previousElementSibling).toContainElement(reopen);
    fireEvent.keyDown(reopen, { key: 'v' });
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    // Still ignored with modifiers (a text field is covered in the roll's panel tests).
    fireEvent.keyDown(lane(), { key: 'v', ctrlKey: true });
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
  });

  it('the palette spans the roll, the lane and the scrollbar: one panel, one scrollbar', async () => {
    await open(seededClip());
    const palette = screen.getByRole('toolbar', { name: 'Editor tools' });
    const body = palette.parentElement as HTMLElement;
    // Siblings: the column holding roll, lane and bar, and the palette beside it.
    const column = body.firstElementChild as HTMLElement;
    expect(column).toContainElement(screen.getByRole('group', { name: /Note clip piano roll/ }));
    expect(column).toContainElement(lane());
    expect(column).toContainElement(screen.getByTestId('roll-hscroll'));
    expect(screen.getAllByTestId('roll-hscroll')).toHaveLength(1);
    expect(
      lane().compareDocumentPosition(screen.getByTestId('roll-hscroll')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('Escape during a splitter drag cancels only the drag: the roll keeps its selection', async () => {
    const roll = await open(seededClip());
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    const splitter = screen.getByRole('separator', { name: 'Resize velocity lane' });
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientY: 250, pointerId: 1 });
    expect(lane().style.height).toBe('134px');
    // From the splitter, the roll, or the window: the drag ends, the selection stays.
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(lane().style.height).toBe('84px');
    expect(roll).toHaveAccessibleName(/1 selected/);
    fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientY: 250, pointerId: 1 });
    fireEvent.keyDown(splitter, { key: 'Escape' });
    expect(lane().style.height).toBe('84px');
    expect(roll).toHaveAccessibleName(/1 selected/);
    // With no drag running, Escape in the roll still clears the selection.
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(roll).toHaveAccessibleName(/0 selected/);
  });

  it('a lane stored taller than the effective limit is clamped when drawn', async () => {
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ laneHeight: 400 }));
    await open(seededClip());
    // jsdom has no layout (panel height 0), so only the splitter's own 400 limit applies here;
    // the share-of-panel limit is covered in VelocityLane's tests with an explicit panel height.
    expect(lane().style.height).toBe('400px');
    expect(screen.getByRole('separator', { name: 'Resize velocity lane' })).toHaveAttribute(
      'aria-valuemax',
      '400'
    );
  });

  it('entry previews wear the degree color of the pitch under the pointer when the setting is on', async () => {
    localStorage.setItem(
      'hrifa.composition-workbench.settings.v1',
      JSON.stringify({ colorByScaleDegree: true })
    );
    const roll = await open(seededClip());
    act(() => toolRadio('Paint').click());
    const preview = () => [...document.querySelectorAll('[title^=" ·"]')] as HTMLElement[];
    // 64 px per quarter: press on C4, then sweep to E4.
    fireEvent.pointerDown(roll, { clientX: 430, clientY: rowY(60), pointerId: 1 });
    const c4 = preview()[0].style.getPropertyValue('--note-color');
    expect(c4).toMatch(/^var\(--mark-/);
    expect(preview()[0]).toHaveAttribute('data-velocity-fill');
    fireEvent.pointerMove(roll, { clientX: 500, clientY: rowY(64), pointerId: 1 });
    const colors = preview().map((element) => element.style.getPropertyValue('--note-color'));
    expect(colors).toContain(c4);
    expect(colors.some((color) => color !== c4 && color.startsWith('var(--mark-'))).toBe(true);
    fireEvent.pointerCancel(roll, { pointerId: 1 });

    // A move ghost takes the new pitch's color; the original note keeps its own.
    act(() => toolRadio('Pointer').click());
    const note = screen.getByTitle(/^C4 · 0\.000 qn/);
    const own = note.style.getPropertyValue('--note-color');
    fireEvent.pointerDown(note, { clientX: 20, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 20, clientY: rowY(64), pointerId: 1 });
    const ghost = document.querySelector('[data-ghost]') as HTMLElement;
    const ghostColor = ghost.style.getPropertyValue('--ghost-fill');
    expect(ghostColor).not.toContain(own);
    expect(ghostColor).toContain('var(--mark-');
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });

  it('with the setting off the previews are the single note color, like the notes', async () => {
    const roll = await open(seededClip());
    act(() => toolRadio('Paint').click());
    fireEvent.pointerDown(roll, { clientX: 430, clientY: rowY(60), pointerId: 1 });
    const preview = document.querySelector('[title^=" ·"]') as HTMLElement;
    expect(preview).not.toHaveAttribute('data-colored');
    expect(preview.style.getPropertyValue('--note-color')).toBe('');
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });
});

describe('the note editor on a very long clip', () => {
  const longClip = (): Snippet => {
    const base = seededClip();
    const extent = 4 * 72_000;
    return {
      ...base,
      id: 'long',
      packet: {
        ...base.packet,
        frame: {
          ...base.packet.frame!,
          extent,
          musicalExtent: musicalDuration(extent),
        },
      },
    };
  };

  it('draws a bounded number of grid lines, ruler labels and lane lines for 72000 bars', async () => {
    const roll = await open(longClip());
    const lines = () => roll.querySelectorAll('[data-kind]').length;
    expect(lines()).toBeGreaterThan(0);
    expect(lines()).toBeLessThan(600);
    expect(screen.getAllByTestId('velocity-grid-line').length).toBeLessThan(600);
    expect(screen.getByTestId('roll-ruler').querySelectorAll('span').length).toBeLessThan(100);
  });

  it('zooms out far enough to read bar numbers on every 2nd, 4th, 8th... bar, still bounded', async () => {
    await open(longClip());
    const out = screen.getByRole('button', { name: 'Zoom out in time' });
    const rulerLabels = () =>
      [...screen.getByTestId('roll-ruler').querySelectorAll('span')]
        .map((element) => element.textContent ?? '')
        .filter((text) => /^[0-9]+$/.test(text))
        .map(Number);
    const steps: number[] = [];
    for (let click = 0; click < 40; click += 1) {
      fireEvent.click(out);
      const labels = rulerLabels();
      expect(labels.length).toBeLessThan(200);
      expect(document.querySelectorAll('[data-kind]').length).toBeLessThan(600);
      if (labels.length > 1) {
        const step = labels[1] - labels[0];
        // Labels on bars 1 + k * step, the step a power of two.
        expect(Math.log2(step) % 1).toBe(0);
        labels.forEach((label) => expect((label - 1) % step).toBe(0));
        steps.push(step);
      }
    }
    // The step only ever grows as the zoom goes out, and gets well past one bar.
    steps.forEach((step, index) => expect(step).toBeGreaterThanOrEqual(steps[index - 1] ?? 1));
    expect(Math.max(...steps)).toBeGreaterThanOrEqual(16);
    expect(NOTE_EDITOR_TIME_ZOOM.min).toBeLessThanOrEqual(0.25);
  });
});

describe('gridSourceFor', () => {
  it('is the shared density function for the clip meter and grid unit, bounded by the window', () => {
    const source = gridSourceFor('3/4', 0.25);
    const lines = source(0, 30, 64, 4 * 72_000);
    // 64 px per quarter with a 1/16 grid: dotted subdivisions between beats and bars.
    expect(lines.some((line) => line.subdivision)).toBe(true);
    expect(
      lines.filter((line) => line.kind === 'bar').every((line) => (line.at / 3) % 1 === 0)
    ).toBe(true);
    // Far out: bar lines only, thinned, numbers on bars 1 + k * step.
    const far = source(0, 3 * 4000, 0.25, 4 * 72_000);
    expect(far.length).toBeLessThan(400);
    expect(far.every((line) => line.kind === 'bar')).toBe(true);
    expect(far[0]).toMatchObject({ at: 0, label: '1' });
  });
});

describe('moving the content of a time selection', () => {
  const tool = (name: string) => screen.getByRole('radio', { name });
  const ids = () => desk.snippets[0].packet.items.map((entry) => entry.id);
  const onsetOf = (id: string) => noteValue(id).onset.quarterNotes;
  const lengthOf = (id: string) => noteValue(id).duration.quarterNotes;
  const sessionVersions = () => desk.snippets[0].lineage?.versions.length;
  const ghost = (id: string) =>
    document.querySelector(`[data-ghost="${id}"]`) as HTMLElement | null;

  /** A whole note C4 over 0 to 4 (w) and an E4 at 6 (z), in an 8-quarter clip. */
  function wholeNoteClip(): Snippet {
    const base = seededClip();
    return {
      ...base,
      packet: { ...base.packet, items: [seedNote('w', 0, 4, 6000), seedNote('z', 6, 1, 6400)] },
    };
  }

  /** Time tool: a drag over the span, in pixels (64 per quarter, grid of a half). */
  function selectSpan(roll: Element, from: number, to: number) {
    act(() => tool('Time').click());
    drag(roll, { x: from, y: 5 }, { x: to, y: 5 });
  }

  it('moves only the part of a whole note inside the span: the last beat becomes a quarter note', async () => {
    const roll = await open(wholeNoteClip());
    // The last beat: 3 to 4 quarters.
    selectSpan(roll, 192, 256);
    expect(screen.getByTestId('roll-range').style.left).toBe('192px');
    expect(screen.getByTestId('roll-range').style.width).toBe('64px');
    const changes = historyChangeCount();

    // Press inside the band (the keep-on-press decision), drag 4 quarters later (256 px).
    fireEvent.pointerDown(roll, { clientX: 200, clientY: rowY(40), pointerId: 3 });
    // Kept, not cleared: the move starts (its preview band replaces the drawn one) and the lane keeps its band.
    expect(screen.getByTestId('roll-time-preview')).toBeInTheDocument();
    expect(screen.getByTestId('velocity-range')).toBeInTheDocument();
    fireEvent.pointerMove(roll, { clientX: 200 + 256, clientY: rowY(90), pointerId: 3 });
    // The ghost is the part inside the span, moved (7 to 8), and nothing is committed yet.
    expect(ghost('w')!.style.left).toBe(`${7 * 64}px`);
    expect(ghost('w')!.style.width).toBe('64px');
    expect(ids()).toEqual(['w', 'z']);
    expect(historyChangeCount()).toBe(changes);
    fireEvent.pointerUp(roll, { clientX: 200 + 256, clientY: rowY(90), pointerId: 3 });

    // The first three beats stay (same id); the last beat is a new quarter note at 7.
    expect(ids()).toHaveLength(3);
    expect(ids()[0]).toBe('w');
    expect(lengthOf('w')).toEqual({ numerator: 3, denominator: 1 });
    expect(onsetOf('w')).toEqual({ numerator: 0, denominator: 1 });
    const moved = ids()[1];
    expect(moved).not.toBe('z');
    expect(onsetOf(moved)).toEqual({ numerator: 7, denominator: 1 });
    expect(lengthOf(moved)).toEqual({ numerator: 1, denominator: 1 });
    expect(noteValue(moved).pitches).toEqual([6000]);
    // The time only: the pitch was not touched by the vertical travel, and z is untouched.
    expect(onsetOf('z')).toEqual({ numerator: 6, denominator: 1 });
    // A hand edit, one undo step, one session version more.
    expect(editSteps('w')).toEqual(['modified']);
    expect(editSteps(moved)).toEqual(['added']);
    expect(historyChangeCount()).toBe(changes + 1);
    // The original plus one session version.
    expect(sessionVersions()).toBe(2);
    // The band moved with the content and holds exactly the moved piece (z, which only touches the
    // destination at 7, is not selected: a move selects what it moved).
    expect(screen.getByTestId('roll-range').style.left).toBe(`${7 * 64}px`);
    expect(screen.getByTestId('roll-range').style.width).toBe('64px');
    expect(roll).toHaveAccessibleName(/1 selected/);

    // One undo puts the clip back and the band back where it was before the move (3 to 4: w).
    act(() => undo());
    expect(ids()).toEqual(['w', 'z']);
    expect(lengthOf('w')).toEqual({ numerator: 4, denominator: 1 });
    expect(screen.getByTestId('roll-range').style.left).toBe(`${3 * 64}px`);
    expect(screen.getByTestId('roll-range').style.width).toBe('64px');
    expect(roll).toHaveAccessibleName(/1 selected/);
    // Redo puts the band at the destination again, holding the moved piece as it did.
    act(() => redo());
    expect(ids()).toHaveLength(3);
    expect(screen.getByTestId('roll-range').style.left).toBe(`${7 * 64}px`);
    expect(roll).toHaveAccessibleName(/1 selected/);
    // Undo again, then an unrelated edit: the old move record must not move the band afterwards.
    act(() => undo());
    expect(screen.getByTestId('roll-range').style.left).toBe(`${3 * 64}px`);
    fireEvent.keyDown(roll, { key: '[' });
    expect(screen.getByTestId('roll-range').style.left).toBe(`${3 * 64}px`);
    act(() => undo()); // undoes the Softer edit, not the (now unreachable) move
    expect(screen.getByTestId('roll-range').style.left).toBe(`${3 * 64}px`);
    act(() => redo());
    expect(screen.getByTestId('roll-range').style.left).toBe(`${3 * 64}px`);
  });

  it('a stale move record does not resurrect a band after unrelated edits', async () => {
    const roll = await open(wholeNoteClip());
    selectSpan(roll, 192, 256);
    fireEvent.pointerDown(roll, { clientX: 200, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 456, clientY: 5, pointerId: 3 });
    fireEvent.pointerUp(roll, { clientX: 456, clientY: 5, pointerId: 3 });
    expect(screen.getByTestId('roll-range').style.left).toBe(`${7 * 64}px`);
    // Another tab replaces the notes outright: the band keeps its span, no record matches.
    act(() => {
      const latest = desk.snippets[0];
      desk.commitSnippetEditById(
        latest.id,
        { ...latest.packet, items: [seedNote('q', 1, 1, 6000)] },
        'outside-edit'
      );
    });
    expect(screen.getByTestId('roll-range').style.left).toBe(`${7 * 64}px`);
    act(() => undo());
    expect(screen.getByTestId('roll-range').style.left).toBe(`${7 * 64}px`);
  });

  it('an off-grid span moves by exactly what the ghost showed (no second rounding)', async () => {
    const user = userEvent.setup();
    const roll = await open(wholeNoteClip());
    // 0.5 to 3 on the auto grid, then a one-quarter grid: the span start is now off the grid.
    selectSpan(roll, 32, 192);
    await user.click(screen.getByRole('button', { name: /Grid: Auto/ }));
    await user.click(await screen.findByRole('menuitem', { name: '1/4' }));
    fireEvent.pointerDown(roll, { clientX: 100, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 100 - 500, clientY: 5, pointerId: 3 });
    // Clamped at the clip start: the span moves back by 0.5, the middle piece to 0.
    expect(ghost('w')!.style.left).toBe('0px');
    expect(ghost('w')!.style.width).toBe(`${2.5 * 64}px`);
    fireEvent.pointerUp(roll, { clientX: 100 - 500, clientY: 5, pointerId: 3 });
    const spans = desk.snippets[0].packet.items.map((entry) => {
      const value = entry.value as NoteEventValue;
      const start = value.onset.quarterNotes.numerator / value.onset.quarterNotes.denominator;
      const length =
        value.duration.quarterNotes.numerator / value.duration.quarterNotes.denominator;
      return [start, start + length];
    });
    // Overwrite: the moved block 0 to 2.5 replaces the stay part 0 to 0.5 that was under it.
    expect(spans).toEqual([
      [0, 2.5],
      [3, 4],
      [6, 7],
    ]);
    expect(screen.getByTestId('roll-range').style.left).toBe('0px');
    expect(screen.getByTestId('roll-range').style.width).toBe(`${2.5 * 64}px`);
  });

  it('Escape cancels the drag: no edit, no history, the band stays', async () => {
    const roll = await open(wholeNoteClip());
    selectSpan(roll, 192, 256);
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    fireEvent.pointerDown(roll, { clientX: 200, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 456, clientY: 5, pointerId: 3 });
    expect(ghost('w')).not.toBeNull();
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(ghost('w')).toBeNull();
    fireEvent.pointerUp(roll, { clientX: 456, clientY: 5, pointerId: 3 });
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
    expect(screen.getByTestId('roll-range').style.left).toBe('192px');
  });

  it('a note crossing both edges becomes three; the span clamps at the clip start', async () => {
    const roll = await open(wholeNoteClip());
    // 1 to 3 inside the whole note 0 to 4: left 0-1 keeps the id, 1-3 moves, 3-4 stays.
    selectSpan(roll, 64, 192);
    // Drag far left with Alt (merge keeps the destination): the span clamps at 0, so it moves back
    // by 1 quarter only.
    fireEvent.pointerDown(roll, { clientX: 100, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 100 - 500, clientY: 5, pointerId: 3, altKey: true });
    fireEvent.pointerUp(roll, { clientX: 100 - 500, clientY: 5, pointerId: 3, altKey: true });
    // The moved middle (0 to 2) lands on the left piece (0 to 1) of the same pitch and covers it
    // completely: the touched note overwrites it (w is gone), inside the same step.
    expect(ids()).toHaveLength(3);
    const spans = desk.snippets[0].packet.items.map((entry) => {
      const value = entry.value as NoteEventValue;
      const start = value.onset.quarterNotes.numerator / value.onset.quarterNotes.denominator;
      return [start, start + value.duration.quarterNotes.numerator];
    });
    expect(ids()).not.toContain('w');
    expect(spans).toEqual([
      [0, 2],
      [3, 4],
      [6, 7],
    ]);
    expect(screen.getByTestId('roll-range').style.left).toBe('0px');
    expect(screen.getByTestId('roll-range').style.width).toBe('128px');
  });

  describe('overwrite, merge and copy', () => {
    /** The span 1 to 3 of the whole note w (0 to 4), dragged 5 quarters (320 px) onto z (6 to 7). */
    async function dragSpan(mods: { alt?: boolean; ctrl?: boolean } = {}, hold = false) {
      const roll = await open(wholeNoteClip());
      selectSpan(roll, 64, 192);
      const flags = { altKey: mods.alt, ctrlKey: mods.ctrl };
      fireEvent.pointerDown(roll, { clientX: 100, clientY: 5, pointerId: 3 });
      fireEvent.pointerMove(roll, { clientX: 420, clientY: 5, pointerId: 3, ...flags });
      if (!hold) {
        fireEvent.pointerUp(roll, { clientX: 420, clientY: 5, pointerId: 3, ...flags });
      }
      return roll;
    }
    const readout = () => screen.queryByTestId('roll-velocity-readout')?.textContent;
    const spanOf = (id: string) => {
      const value = noteValue(id);
      const start = value.onset.quarterNotes.numerator / value.onset.quarterNotes.denominator;
      return [start, start + value.duration.quarterNotes.numerator];
    };

    it('overwrites the destination by default: z is gone, the band holds only the moved piece', async () => {
      const roll = await dragSpan();
      // w keeps 0-1, the moved 1-3 lands on 6-8 (over z, deleted), the right part 3-4 stays.
      expect(ids()).toHaveLength(3);
      expect(ids()).not.toContain('z');
      expect(ids()[0]).toBe('w');
      expect(spanOf('w')).toEqual([0, 1]);
      expect(ids().map((id) => spanOf(id))).toEqual([
        [0, 1],
        [6, 8],
        [3, 4],
      ]);
      expect(screen.getByTestId('roll-range').style.left).toBe(`${6 * 64}px`);
      expect(roll).toHaveAccessibleName(/1 selected/);
      expect(historyChangeCount()).toBeGreaterThan(0);
      // One undo restores everything and the band returns to where it was.
      act(() => undo());
      expect(ids()).toEqual(['w', 'z']);
      expect(screen.getByTestId('roll-range').style.left).toBe(`${1 * 64}px`);
    });

    it('Alt (merge) keeps the destination notes, and they stay unselected', async () => {
      const roll = await dragSpan({ alt: true }, true);
      expect(readout()).toBe('Merge');
      fireEvent.pointerUp(roll, { clientX: 420, clientY: 5, pointerId: 3, altKey: true });
      expect(ids()).toHaveLength(4);
      expect(ids()).toContain('z');
      expect(spanOf('z')).toEqual([6, 7]);
      expect(roll).toHaveAccessibleName(/1 selected/);
      expect(readout()).toBeUndefined();
    });

    it('Ctrl copies: the source stays whole, the destination is overwritten, the copy is selected', async () => {
      const roll = await open(wholeNoteClip());
      selectSpan(roll, 64, 192);
      fireEvent.pointerDown(roll, { clientX: 100, clientY: 5, pointerId: 3 });
      fireEvent.pointerMove(roll, { clientX: 420, clientY: 5, pointerId: 3, ctrlKey: true });
      expect(readout()).toBe('Copy');
      expect(roll).toHaveAttribute('data-copying');
      expect(ghost('w')).not.toBeNull();
      fireEvent.pointerUp(roll, { clientX: 420, clientY: 5, pointerId: 3, ctrlKey: true });
      expect(roll).not.toHaveAttribute('data-copying');
      expect(ids()).toHaveLength(2);
      expect(ids()[0]).toBe('w');
      expect(spanOf('w')).toEqual([0, 4]);
      expect(spanOf(ids()[1])).toEqual([6, 8]);
      expect(roll).toHaveAccessibleName(/1 selected/);
      expect(screen.getByTestId('roll-range').style.left).toBe(`${6 * 64}px`);
      act(() => undo());
      expect(ids()).toEqual(['w', 'z']);
      expect(screen.getByTestId('roll-range').style.left).toBe(`${1 * 64}px`);
    });

    it('Ctrl + Alt copies and merges: source and destination both stay', async () => {
      const roll = await dragSpan({ ctrl: true, alt: true }, true);
      expect(readout()).toBe('Copy + Merge');
      fireEvent.pointerUp(roll, {
        clientX: 420,
        clientY: 5,
        pointerId: 3,
        ctrlKey: true,
        altKey: true,
      });
      expect(ids()).toHaveLength(3);
      expect([ids()[0], ids()[2]]).toEqual(['w', 'z']);
      expect(spanOf('w')).toEqual([0, 4]);
    });

    it('the modifiers are read live: releasing Ctrl before the drop makes it a move', async () => {
      await dragSpan({ ctrl: true }, true);
      const roll = screen.getByRole('group', { name: /piano roll/ });
      fireEvent.pointerUp(roll, { clientX: 420, clientY: 5, pointerId: 3 });
      expect(spanOf('w')).toEqual([0, 1]);
    });
  });

  describe('Ctrl-drag copies notes', () => {
    const noteIds = () => desk.snippets[0].packet.items.map((entry) => entry.id);

    it('a Ctrl press that becomes a drag copies the selection and selects the copies', async () => {
      const roll = await open(seededClip());
      const n1 = screen.getByTitle(/^C4 · 0\.000 qn/);
      fireEvent.pointerDown(n1, { clientX: 20, clientY: rowY(60), pointerId: 1, ctrlKey: true });
      fireEvent.pointerMove(roll, {
        clientX: 20 + 128,
        clientY: rowY(60),
        pointerId: 1,
        ctrlKey: true,
      });
      expect(roll).toHaveAttribute('data-copying');
      expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('Copy');
      fireEvent.pointerUp(roll, {
        clientX: 20 + 128,
        clientY: rowY(60),
        pointerId: 1,
        ctrlKey: true,
      });
      expect(noteIds()).toHaveLength(4);
      expect(noteIds().slice(0, 3)).toEqual(['n1', 'n2', 'n3']);
      expect(noteValue('n1').onset.quarterNotes).toEqual({ numerator: 0, denominator: 1 });
      const copy = noteIds()[3];
      expect(noteValue(copy).onset.quarterNotes).toEqual({ numerator: 2, denominator: 1 });
      expect(noteValue(copy).pitches).toEqual([6000]);
      expect(roll).toHaveAccessibleName(/1 selected/);
      act(() => undo());
      expect(noteIds()).toEqual(['n1', 'n2', 'n3']);
    });

    it('a Ctrl press that is not a drag still toggles: adds an unselected note, removes a selected one', async () => {
      const roll = await open(seededClip());
      const n1 = screen.getByTitle(/^C4 · 0\.000 qn/);
      const n2 = screen.getByTitle(/^E4 · 2\.000 qn/);
      fireEvent.pointerDown(n1, { clientX: 20, clientY: rowY(60), pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 1 });
      expect(roll).toHaveAccessibleName(/1 selected/);
      // Ctrl-click an unselected note adds it.
      fireEvent.pointerDown(n2, { clientX: 140, clientY: rowY(64), pointerId: 2, ctrlKey: true });
      fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 2, ctrlKey: true });
      expect(roll).toHaveAccessibleName(/2 selected/);
      // Ctrl-click a selected note removes it (on release).
      fireEvent.pointerDown(n2, { clientX: 140, clientY: rowY(64), pointerId: 3, ctrlKey: true });
      expect(roll).toHaveAccessibleName(/2 selected/);
      fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 3, ctrlKey: true });
      expect(roll).toHaveAccessibleName(/1 selected/);
      expect(noteIds()).toHaveLength(3);
    });

    it('a Ctrl press on a selected note and a drag copies the whole selection and keeps it selected', async () => {
      const roll = await open(seededClip());
      const n1 = screen.getByTitle(/^C4 · 0\.000 qn/);
      const n2 = screen.getByTitle(/^E4 · 2\.000 qn/);
      fireEvent.pointerDown(n1, { clientX: 20, clientY: rowY(60), pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 1 });
      fireEvent.pointerDown(n2, { clientX: 140, clientY: rowY(64), pointerId: 2, ctrlKey: true });
      fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 2, ctrlKey: true });
      expect(roll).toHaveAccessibleName(/2 selected/);
      fireEvent.pointerDown(n2, { clientX: 140, clientY: rowY(64), pointerId: 3, ctrlKey: true });
      fireEvent.pointerMove(roll, {
        clientX: 140 + 320,
        clientY: rowY(64),
        pointerId: 3,
        ctrlKey: true,
      });
      fireEvent.pointerUp(roll, {
        clientX: 140 + 320,
        clientY: rowY(64),
        pointerId: 3,
        ctrlKey: true,
      });
      // n1 and n2 copied 5 quarters later; the originals stay; the two copies are selected.
      expect(noteIds()).toHaveLength(5);
      expect(roll).toHaveAccessibleName(/2 selected/);
    });
  });

  it('an empty span over an empty destination just moves the band: no edit, no history', async () => {
    const roll = await open(wholeNoteClip());
    // 4.5 to 5.5 holds no note; half a quarter later (5 to 6) it only touches z (starts at 6).
    selectSpan(roll, 288, 352);
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 300 + 32, clientY: 5, pointerId: 3 });
    fireEvent.pointerUp(roll, { clientX: 300 + 32, clientY: 5, pointerId: 3 });
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
    expect(screen.getByTestId('roll-range').style.left).toBe(`${5 * 64}px`);
  });

  it('an empty span still overwrites the destination: one undo step, the band lands there', async () => {
    const roll = await open(wholeNoteClip());
    // 4.5 to 5.5 is empty; one quarter later it is 5.5 to 6.5 and cuts z (6 to 7) to 6.5 to 7.
    selectSpan(roll, 288, 352);
    const changes = historyChangeCount();
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 300 + 64, clientY: 5, pointerId: 3 });
    fireEvent.pointerUp(roll, { clientX: 300 + 64, clientY: 5, pointerId: 3 });
    expect(screen.getByTestId('roll-range').style.left).toBe(`${5.5 * 64}px`);
    expect(historyChangeCount()).toBe(changes + 1);
    expect(ids()).toEqual(['w', 'z']);
    expect(onsetOf('z')).toEqual(rational(13, 2));
    expect(lengthOf('z')).toEqual({ numerator: 1, denominator: 2 });
    expect(roll).toHaveAccessibleName(/0 selected/);
    act(() => {
      undo();
    });
    expect(lengthOf('z')).toEqual({ numerator: 1, denominator: 1 });
  });

  it('Alt (merge) with an empty span keeps the destination notes and selects the ones under the band', async () => {
    const roll = await open(wholeNoteClip());
    selectSpan(roll, 288, 352);
    const before = desk.snippets[0];
    const flags = { pointerId: 3, altKey: true };
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 5, ...flags });
    fireEvent.pointerMove(roll, { clientX: 300 + 64, clientY: 5, ...flags });
    fireEvent.pointerUp(roll, { clientX: 300 + 64, clientY: 5, ...flags });
    expect(desk.snippets[0]).toBe(before);
    expect(screen.getByTestId('roll-range').style.left).toBe(`${5.5 * 64}px`);
    expect(roll).toHaveAccessibleName(/1 selected/);
    fireEvent.keyDown(roll, { key: 'Delete' });
    expect(ids()).toEqual(['w']);
  });

  it('a note that only touches the band is selected but stays put; the destination is overwritten', async () => {
    const roll = await open(wholeNoteClip());
    // 4 to 6: w ends at 4 and z starts at 6, both only touch the span.
    selectSpan(roll, 256, 384);
    expect(roll).toHaveAccessibleName(/2 selected/);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 300 + 128, clientY: 5, pointerId: 3 });
    fireEvent.pointerUp(roll, { clientX: 300 + 128, clientY: 5, pointerId: 3 });
    // Nothing inside the span moves, but the block lands on 6 to 8 and overwrites z; w is untouched.
    expect(ids()).toEqual(['w']);
    expect(lengthOf('w')).toEqual({ numerator: 4, denominator: 1 });
    expect(screen.getByTestId('roll-range').style.left).toBe(`${6 * 64}px`);
    expect(roll).toHaveAccessibleName(/0 selected/);
  });

  it('the Pointer tool moves from empty space in the band too, and the move ghost wears the pitch color', async () => {
    localStorage.setItem(
      'hrifa.composition-workbench.settings.v1',
      JSON.stringify({ colorByScaleDegree: true })
    );
    const roll = await open(wholeNoteClip());
    selectSpan(roll, 192, 256);
    act(() => tool('Pointer').click());
    fireEvent.pointerDown(roll, { clientX: 200, clientY: 5, pointerId: 3 });
    fireEvent.pointerMove(roll, { clientX: 264, clientY: 5, pointerId: 3 });
    expect(ghost('w')!.style.getPropertyValue('--ghost-fill')).toContain('var(--mark-');
    fireEvent.pointerUp(roll, { clientX: 264, clientY: 5, pointerId: 3 });
    expect(ids()).toHaveLength(3);
    expect(onsetOf(ids()[1])).toEqual({ numerator: 4, denominator: 1 });
  });

  describe('which presses keep or clear the band', () => {
    async function withBand() {
      const roll = await open(seededClip());
      selectSpan(roll, 120, 300);
      expect(screen.getByTestId('roll-range')).toBeInTheDocument();
      return roll;
    }

    it('the band survives the pointerdown itself when it lands inside, and is cleared outside it', async () => {
      const roll = await withBand();
      // Inside: capture does not clear, so the selection is intact while the press is held (the lane
      // keeps its band) and cancelling the move leaves the band as it was.
      fireEvent.pointerDown(roll, { clientX: 200, clientY: 5, pointerId: 4 });
      expect(screen.getByTestId('velocity-range')).toBeInTheDocument();
      fireEvent.pointerCancel(roll, { pointerId: 4 });
      expect(screen.getByTestId('roll-range')).toBeInTheDocument();
      // Outside (right of 300 px): cleared before the new gesture.
      fireEvent.pointerDown(roll, { clientX: 700, clientY: 5, pointerId: 5 });
      expect(screen.queryByTestId('roll-range')).toBeNull();
    });

    it('presses on the scrollbar and on the tool palette keep the band; roll, ruler and lane clear it', async () => {
      await withBand();
      fireEvent.pointerDown(screen.getByTestId('roll-hscroll'), { pointerId: 6 });
      expect(screen.getByTestId('roll-range')).toBeInTheDocument();
      fireEvent.pointerDown(tool('Pencil'), { pointerId: 7 });
      expect(screen.getByTestId('roll-range')).toBeInTheDocument();
      expect(screen.getByTestId('velocity-range')).toBeInTheDocument();
      // The ruler clears it.
      fireEvent.pointerDown(screen.getByTestId('roll-ruler'), { pointerId: 8 });
      expect(screen.queryByTestId('roll-range')).toBeNull();
      expect(screen.queryByTestId('velocity-range')).toBeNull();
    });

    it('a press in the lane clears it', async () => {
      await withBand();
      fireEvent.pointerDown(document.querySelector('[data-testid="velocity-pin"]') as HTMLElement, {
        clientX: 0,
        clientY: 8,
        pointerId: 9,
      });
      expect(screen.queryByTestId('roll-range')).toBeNull();
    });

    it('a Pointer press on a note inside the band clears it (the note is selected instead)', async () => {
      await withBand();
      act(() => tool('Pointer').click());
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 140,
        clientY: rowY(64),
        pointerId: 10,
      });
      expect(screen.queryByTestId('roll-range')).toBeNull();
    });
  });
});

describe('a time selection survives edits, undo and outside changes', () => {
  const tool = (name: string) => screen.getByRole('radio', { name });

  async function timeSelected() {
    const roll = await open(seededClip());
    act(() => tool('Time').click());
    // 120 px to 300 px: quarters 1.5 to 5; n2 (2) and n3 (4) start inside.
    drag(roll, { x: 120, y: 5 }, { x: 300, y: 5 });
    expect(roll).toHaveAccessibleName(/2 selected/);
    return roll;
  }
  const band = () => screen.getByTestId('roll-range');

  it('Delete inside a time selection deletes its notes and keeps the band; undo rebuilds the notes it holds', async () => {
    const roll = await timeSelected();
    fireEvent.keyDown(roll, { key: 'Delete' });
    expect(desk.snippets[0].packet.items.map((entry) => entry.id)).toEqual(['n1']);
    expect(roll).toHaveAccessibleName(/0 selected/);
    expect(band().style.left).toBe('96px');
    expect(band().style.width).toBe(`${5 * 64 - 96}px`);
    expect(screen.getByTestId('velocity-range')).toBeInTheDocument();
    // Undo restores n2 and n3; the selection is rebuilt from the kept span (the K5 undo fix).
    act(() => undo());
    expect(desk.snippets[0].packet.items).toHaveLength(3);
    expect(roll).toHaveAccessibleName(/2 selected/);
    expect(band().style.left).toBe('96px');
    expect(band().style.width).toBe(`${5 * 64 - 96}px`);
  });

  it('keeps the band when the packet changes from outside, pruned to the clip', async () => {
    const roll = await timeSelected();
    // An outside edit: a new note starting inside the span is picked up, the span itself is kept.
    act(() => {
      const latest = desk.snippets[0];
      desk.commitSnippetEditById(
        latest.id,
        { ...latest.packet, items: [...latest.packet.items, seedNote('n4', 3, 1, 7200)] },
        'outside-edit'
      );
    });
    expect(roll).toHaveAccessibleName(/3 selected/);
    expect(band().style.left).toBe('96px');
    expect(band().style.width).toBe(`${5 * 64 - 96}px`);
    // A hand edit of a selected note (Louder) leaves the band alone as well.
    fireEvent.keyDown(roll, { key: ']' });
    expect(band().style.left).toBe('96px');
    expect(band().style.width).toBe(`${5 * 64 - 96}px`);
  });
});

describe('velocity lane tools in the editor', () => {
  // jsdom lays nothing out: lane x is the timeline x (64 px per quarter), y runs from the track top
  // (84 px tall, 8 px padding: 100% at y 8, 0% at y 76). n1 at x 0, n2 at 128, n3 at 256, all 100%.
  const tool = (name: string) => screen.getByRole('radio', { name });
  const track = () => screen.getByRole('group', { name: 'Velocity lane' });
  const velocityOf = (id: string) => noteValue(id).velocity;
  const ids = () => desk.snippets[0].packet.items.map((entry) => entry.id);
  const sessionVersions = () => desk.snippets[0].lineage?.versions.length;
  const lanePress = (x: number, y: number, extra: object = {}) =>
    fireEvent.pointerDown(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
  const laneMove = (x: number, y: number, extra: object = {}) =>
    fireEvent.pointerMove(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
  const laneRelease = (x: number, y: number, extra: object = {}) =>
    fireEvent.pointerUp(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
  const laneSweep = (from: [number, number], to: [number, number], extra: object = {}) => {
    lanePress(from[0], from[1], extra);
    laneMove(to[0], to[1], extra);
    laneRelease(to[0], to[1], extra);
  };

  describe('Pointer', () => {
    it('a box over velocity heads selects those notes; shift adds; a press on empty space clears', async () => {
      const roll = await open(seededClip());
      laneSweep([100, 0], [140, 83]);
      expect(roll).toHaveAccessibleName(/1 selected/);
      laneSweep([240, 0], [280, 83], { shiftKey: true });
      expect(roll).toHaveAccessibleName(/2 selected/);
      // The selection is the roll's: Delete removes exactly those notes.
      fireEvent.keyDown(roll, { key: 'Delete' });
      expect(ids()).toEqual(['n1']);
      act(() => undo());
      lanePress(60, 40);
      laneRelease(60, 40);
      expect(roll).toHaveAccessibleName(/0 selected/);
    });

    it('a box that catches no pin is not a time selection', async () => {
      const roll = await open(seededClip());
      laneSweep([40, 10], [90, 60]);
      expect(roll).toHaveAccessibleName(/0 selected/);
      expect(screen.queryByTestId('velocity-range')).toBeNull();
      expect(screen.queryByTestId('roll-range')).toBeNull();
    });
  });

  describe('Time', () => {
    async function laneTimeSelected() {
      const roll = await open(seededClip());
      act(() => tool('Time').click());
      // 120 to 300 px: quarters 1.5 to 5, so n2 (2) and n3 (4 to 6) overlap it.
      laneSweep([120, 30], [300, 30]);
      return roll;
    }

    it('selects a span like the roll: the same band in both, the notes overlapping it', async () => {
      const roll = await laneTimeSelected();
      expect(screen.getByTestId('velocity-range').style.left).toBe('96px');
      expect(screen.getByTestId('roll-range').style.left).toBe('96px');
      expect(screen.getByTestId('roll-range').style.width).toBe(`${5 * 64 - 96}px`);
      expect(roll).toHaveAccessibleName(/2 selected/);
    });

    it('a press elsewhere in the lane clears the band first and starts a new span', async () => {
      await laneTimeSelected();
      laneSweep([0, 30], [60, 30]);
      expect(screen.getByTestId('velocity-range').style.left).toBe('0px');
      expect(screen.getAllByTestId('velocity-range')).toHaveLength(1);
    });

    it('a press inside the band moves its content: one undo step, a hand edit, the band follows', async () => {
      const roll = await laneTimeSelected();
      const changes = historyChangeCount();
      laneSweep([200, 30], [200 + 256, 30]);
      // n2 (2 to 3) and n3 (4 to 6, cut at 5) moved 4 later, overwriting what they landed on.
      expect(historyChangeCount()).toBe(changes + 1);
      expect(screen.getByTestId('velocity-range').style.left).toBe(`${5.5 * 64}px`);
      expect(screen.getByTestId('roll-range').style.left).toBe(`${5.5 * 64}px`);
      expect(sessionVersions()).toBe(2);
      expect(editSteps('n2')).toEqual(['modified']);
      expect(roll).toHaveAccessibleName(/selected/);
      act(() => undo());
      expect(ids()).toEqual(['n1', 'n2', 'n3']);
      expect(screen.getByTestId('velocity-range').style.left).toBe('96px');
    });

    it('Escape cancels the move: nothing commits and the band stays', async () => {
      await laneTimeSelected();
      const before = desk.snippets[0];
      const changes = historyChangeCount();
      lanePress(200, 30);
      laneMove(200 + 256, 30);
      expect(screen.getByTestId('velocity-range-preview').style.left).toBe(`${5.5 * 64}px`);
      fireEvent.keyDown(track(), { key: 'Escape' });
      laneRelease(200 + 256, 30);
      expect(desk.snippets[0]).toBe(before);
      expect(historyChangeCount()).toBe(changes);
      expect(screen.getByTestId('velocity-range').style.left).toBe('96px');
    });

    it('a press inside the band that never moves clears it and edits nothing', async () => {
      const roll = await laneTimeSelected();
      const before = desk.snippets[0];
      lanePress(200, 30);
      laneRelease(200, 30);
      expect(desk.snippets[0]).toBe(before);
      expect(roll).toHaveAccessibleName(/0 selected/);
    });
  });

  describe('Pencil', () => {
    it('draws the y at each head crossed: one undo step, a hand edit, the selection kept; a readout while drawing', async () => {
      const roll = await open(seededClip());
      act(() => tool('Pencil').click());
      const changes = historyChangeCount();
      lanePress(0, 42);
      laneMove(256, 42);
      expect(screen.getByTestId('velocity-gesture-readout')).toHaveTextContent('50%');
      expect(historyChangeCount()).toBe(changes);
      laneRelease(256, 42);
      expect([velocityOf('n1'), velocityOf('n2'), velocityOf('n3')]).toEqual([0.5, 0.5, 0.5]);
      expect(historyChangeCount()).toBe(changes + 1);
      expect(sessionVersions()).toBe(2);
      expect(editSteps('n2')).toEqual(['modified']);
      expect(roll).toHaveAccessibleName(/0 selected/);
      act(() => undo());
      expect([velocityOf('n1'), velocityOf('n2'), velocityOf('n3')]).toEqual([1, 1, 1]);
    });

    it('a sloped fast drag sets every head in between from the line', async () => {
      await open(seededClip());
      act(() => tool('Pencil').click());
      laneSweep([0, 8], [256, 76]);
      expect([velocityOf('n1'), velocityOf('n2'), velocityOf('n3')]).toEqual([1, 0.5, 0]);
    });

    it('Escape cancels and a drag that crosses no head, or changes nothing, does not commit', async () => {
      await open(seededClip());
      act(() => tool('Pencil').click());
      const before = desk.snippets[0];
      const changes = historyChangeCount();
      lanePress(0, 42);
      laneMove(256, 42);
      fireEvent.keyDown(track(), { key: 'Escape' });
      laneRelease(256, 42);
      laneSweep([60, 42], [90, 42]);
      // Drawing the value the notes already have (100%) is no change.
      laneSweep([0, 8], [256, 8]);
      expect(desk.snippets[0]).toBe(before);
      expect(historyChangeCount()).toBe(changes);
    });
  });

  describe('Paint can', () => {
    it('ramps the heads between press and release as one undo step and keeps a dashed secondary selection', async () => {
      await open(seededClip());
      act(() => tool('Paint').click());
      const changes = historyChangeCount();
      lanePress(0, 8);
      laneMove(256, 76);
      expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      expect(historyChangeCount()).toBe(changes);
      laneRelease(256, 76);
      expect([velocityOf('n1'), velocityOf('n2'), velocityOf('n3')]).toEqual([1, 0.5, 0]);
      expect(historyChangeCount()).toBe(changes + 1);
      expect(sessionVersions()).toBe(2);
      expect(editSteps('n2')).toEqual(['modified']);
      // Stays after release.
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'n1,n2,n3');
    });

    it('a plain right-button drag curves it as ONE more step re-applied from the original endpoints; undo returns to the straight ramp', async () => {
      await open(seededClip());
      act(() => tool('Paint').click());
      laneSweep([0, 8], [256, 76]);
      const changes = historyChangeCount();
      const flags = { button: 2, pointerId: 2 };
      laneSweep([100, 40], [100, 16], flags);
      expect(fireEvent.contextMenu(track())).toBe(false);
      expect(historyChangeCount()).toBe(changes + 1);
      expect(velocityOf('n1')).toBe(1);
      expect(velocityOf('n3')).toBe(0);
      expect(velocityOf('n2')).toBeCloseTo(1 - Math.sqrt(0.5), 3);
      expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      // Again, further: re-applied from the originals (curve 2), not from the values on screen.
      laneSweep([100, 40], [100, 16], flags);
      expect(velocityOf('n2')).toBeCloseTo(1 - 0.5 ** 0.25, 3);
      expect(historyChangeCount()).toBe(changes + 2);
      act(() => undo());
      expect(velocityOf('n2')).toBeCloseTo(1 - Math.sqrt(0.5), 3);
      act(() => undo());
      expect(velocityOf('n2')).toBe(0.5);
    });

    it('the ramp ends on Escape and on a tool change', async () => {
      const roll = await open(seededClip());
      const make = () => {
        act(() => tool('Paint').click());
        laneSweep([0, 8], [256, 76]);
        expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      };
      make();
      fireEvent.keyDown(roll, { key: 'Escape' });
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();

      act(() => tool('Pointer').click());
      act(() => tool('Paint').click());
      laneSweep([0, 8], [256, 8]);
      // Changing the tool and coming back finds no ramp.
      act(() => tool('Pencil').click());
      act(() => tool('Paint').click());
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();
    });

    it('another edit ends it (the notes are no longer the ones the ramp wrote)', async () => {
      const roll = await open(seededClip());
      act(() => tool('Paint').click());
      laneSweep([0, 8], [256, 76]);
      expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      act(() =>
        desk.commitSnippetEditById(
          desk.snippets[0].id,
          { ...desk.snippets[0].packet, items: desk.snippets[0].packet.items.slice(0, 2) },
          'outside-edit'
        )
      );
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();
      expect(roll).toBeInTheDocument();
    });

    it('a left press on a pin with notes selected starts a fresh ramp; a second left drag replaces the first; right-click without a ramp keeps the menu', async () => {
      const roll = await open(seededClip());
      // Select n2 first.
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 150,
        clientY: rowY(64),
        pointerId: 1,
      });
      fireEvent.pointerUp(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
      act(() => tool('Paint').click());
      laneSweep([0, 8], [256, 76]);
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'n1,n2,n3');
      // A press on the pin of n2 (in the lane, selection active): the old ramp is gone at the press.
      const pin = screen
        .getAllByTestId('velocity-pin')
        .find((el) => el.dataset.note?.startsWith('n2'))!;
      fireEvent.pointerDown(pin, { clientX: 128, clientY: 8, pointerId: 1 });
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'n2');
      laneMove(256, 76);
      laneRelease(256, 76);
      // A fresh ramp over n2 and n3 only (this drag's x range), not the selection or the old ramp.
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'n2,n3');
      expect(velocityOf('n2')).toBe(1);
      expect(velocityOf('n3')).toBe(0);
      expect(velocityOf('n1')).toBe(1);
      // A second left drag replaces it.
      laneSweep([0, 76], [128, 8]);
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'n1,n2');
      expect(velocityOf('n1')).toBe(0);
      expect(velocityOf('n2')).toBe(1);
      // A press that catches nothing leaves no ramp (the old one does not come back), and then a
      // plain right-click is the browser's.
      laneSweep([60, 8], [90, 76]);
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();
      lanePress(100, 40, { button: 2, pointerId: 2 });
      expect(fireEvent.contextMenu(track())).toBe(true);
    });

    it("the ramp's Escape is ignored from an unrelated control outside the editor", async () => {
      await open(seededClip());
      act(() => tool('Paint').click());
      laneSweep([0, 8], [256, 76]);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      try {
        outside.focus();
        fireEvent.keyDown(outside, { key: 'Escape' });
        expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
        fireEvent.keyDown(track(), { key: 'Escape' });
        expect(screen.queryByTestId('velocity-ramp')).toBeNull();
      } finally {
        outside.remove();
      }
    });

    it('a ramp that changes nothing commits nothing, and Escape cancels a drag', async () => {
      await open(seededClip());
      act(() => tool('Paint').click());
      const before = desk.snippets[0];
      const changes = historyChangeCount();
      laneSweep([0, 8], [256, 8]);
      lanePress(0, 8);
      laneMove(256, 76);
      fireEvent.keyDown(track(), { key: 'Escape' });
      laneRelease(256, 76);
      expect(desk.snippets[0]).toBe(before);
      expect(historyChangeCount()).toBe(changes);
    });
  });

  describe('Eraser and Knife', () => {
    it.each(['Eraser', 'Knife'])('%s does nothing in the lane', async (name) => {
      const roll = await open(seededClip());
      act(() => tool(name).click());
      const before = desk.snippets[0];
      laneSweep([0, 8], [256, 76]);
      laneSweep([100, 0], [140, 83]);
      expect(desk.snippets[0]).toBe(before);
      expect(roll).toHaveAccessibleName(/0 selected/);
    });
  });
});

describe('editor polish: left-edge resize, cursors, the ramp-curve menu and no duplicate notes', () => {
  const tool = (name: string) => screen.getByRole('radio', { name });
  const track = () => screen.getByRole('group', { name: 'Velocity lane' });
  const ids = () => desk.snippets[0].packet.items.map((entry) => entry.id);
  const startOf = (id: string) => {
    const onset = noteValue(id).onset.quarterNotes;
    return onset.numerator / onset.denominator;
  };
  const lengthOf = (id: string) => {
    const duration = noteValue(id).duration.quarterNotes;
    return duration.numerator / duration.denominator;
  };

  it('opts the roll and the lane into the tool cursors', async () => {
    const roll = await open(seededClip());
    expect(roll).toHaveAttribute('data-cursors');
    expect(track()).toHaveAttribute('data-cursors');
    expect(roll.style.getPropertyValue('--cursor-pencil')).toContain('data:image/svg+xml');
    expect(track().style.getPropertyValue('--cursor-paint')).toContain('data:image/svg+xml');
  });

  describe('resize from the left edge', () => {
    it('changes the start and the length with the end fixed: a hand edit, one undo step', async () => {
      const roll = await open(seededClip());
      const changes = historyChangeCount();
      // n2 spans x 128 to 192; its first 6 px is the left edge. One quarter to the left.
      drag(
        screen.getByTitle(/^E4 · 2\.000 qn/),
        { x: 130, y: rowY(64) },
        { x: 130 - 64, y: rowY(64) },
        roll
      );
      expect(startOf('n2')).toBe(1);
      expect(lengthOf('n2')).toBe(2);
      expect(startOf('n2') + lengthOf('n2')).toBe(3);
      expect(editSteps('n2')).toEqual(['modified']);
      expect(editSteps('n1')).toEqual([]);
      expect(historyChangeCount()).toBe(changes + 1);
      act(() => undo());
      expect(startOf('n2')).toBe(2);
      expect(lengthOf('n2')).toBe(1);
    });

    it('applies to the whole selection by the same snapped delta, and a note at 0 cannot grow left', async () => {
      const roll = await open(seededClip());
      fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
        clientX: 30,
        clientY: rowY(60),
        pointerId: 1,
      });
      fireEvent.pointerUp(roll, { clientX: 30, clientY: rowY(60), pointerId: 1 });
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 150,
        clientY: rowY(64),
        pointerId: 1,
        shiftKey: true,
      });
      fireEvent.pointerUp(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
      expect(roll).toHaveAccessibleName(/2 selected/);
      const changes = historyChangeCount();
      drag(
        screen.getByTitle(/^E4 · 2\.000 qn/),
        { x: 130, y: rowY(64) },
        { x: 130 + 32, y: rowY(64) },
        roll
      );
      expect(startOf('n1')).toBe(0.5);
      expect(lengthOf('n1')).toBe(0.5);
      expect(startOf('n2')).toBe(2.5);
      expect(lengthOf('n2')).toBe(0.5);
      expect(startOf('n3')).toBe(4);
      expect(historyChangeCount()).toBe(changes + 1);
      expect(roll).toHaveAccessibleName(/2 selected/);
      act(() => undo());
      fireEvent.keyDown(roll, { key: 'Escape' });
      const before = desk.snippets[0];
      drag(
        screen.getByTitle(/^C4 · 0\.000 qn/),
        { x: 2, y: rowY(60) },
        { x: 2 - 64, y: rowY(60) },
        roll
      );
      expect(desk.snippets[0]).toBe(before);
    });

    it('shows a ghost while dragging and Escape cancels it: no edit, no history', async () => {
      const roll = await open(seededClip());
      const before = desk.snippets[0];
      const changes = historyChangeCount();
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 130,
        clientY: rowY(64),
        pointerId: 1,
      });
      fireEvent.pointerMove(roll, { clientX: 130 - 64, clientY: rowY(64), pointerId: 1 });
      const ghost = document.querySelector('[data-ghost="n2"]') as HTMLElement;
      expect(ghost.style.left).toBe('64px');
      expect(ghost.style.width).toBe('128px');
      fireEvent.keyDown(roll, { key: 'Escape' });
      expect(document.querySelector('[data-ghost]')).toBeNull();
      fireEvent.pointerUp(roll, { clientX: 130 - 64, clientY: rowY(64), pointerId: 1 });
      expect(desk.snippets[0]).toBe(before);
      expect(historyChangeCount()).toBe(changes);
    });
  });

  describe('no duplicate notes: merged inside the same version and undo step', () => {
    it('moving a note onto another merges it into the first: the survivor is selected', async () => {
      const roll = await open(seededClip());
      const changes = historyChangeCount();
      // n2 (E4 at 2) moved to n1 place (C4 at 0): two quarters back, four semitones down.
      drag(
        screen.getByTitle(/^E4 · 2\.000 qn/),
        { x: 160, y: rowY(64) },
        { x: 160 - 128, y: rowY(64) + 88 },
        roll
      );
      expect(ids()).toEqual(['n1', 'n3']);
      expect(historyChangeCount()).toBe(changes + 1);
      expect(desk.snippets[0].lineage?.versions.length).toBe(2);
      expect(roll).toHaveAccessibleName(/1 selected/);
      act(() => undo());
      expect(ids()).toEqual(['n1', 'n2', 'n3']);
    });

    it('the pencil over a shorter note covers it instead of stacking a copy', async () => {
      const roll = await open(seededClip());
      act(() => tool('Pencil').click());
      const changes = historyChangeCount();
      drag(roll, { x: 10, y: rowY(60) }, { x: 10 + 128, y: rowY(60) });
      // The new 2-quarter C4 covers n1 (0 to 1) completely: n1 is overwritten, not stacked.
      expect(ids()).toHaveLength(3);
      expect(ids()).not.toContain('n1');
      expect(historyChangeCount()).toBe(changes + 1);
    });

    it('a Ctrl-drag copy that lands exactly on an existing note writes nothing', async () => {
      const roll = await open(seededClip());
      const before = desk.snippets[0];
      const changes = historyChangeCount();
      const flags = { pointerId: 1, ctrlKey: true };
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 160,
        clientY: rowY(64),
        ...flags,
      });
      fireEvent.pointerMove(roll, { clientX: 160 - 128, clientY: rowY(64) + 88, ...flags });
      fireEvent.pointerUp(roll, { clientX: 160 - 128, clientY: rowY(64) + 88, ...flags });
      expect(ids()).toEqual(['n1', 'n2', 'n3']);
      expect(desk.snippets[0].packet.items).toEqual(before.packet.items);
      expect(historyChangeCount()).toBe(changes);
    });
  });

  describe('the ramp curve gesture, in the real flow', () => {
    const lanePress = (x: number, y: number, extra: object = {}) =>
      fireEvent.pointerDown(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
    const laneMove = (x: number, y: number, extra: object = {}) =>
      fireEvent.pointerMove(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
    const laneRelease = (x: number, y: number, extra: object = {}) =>
      fireEvent.pointerUp(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });

    it('stays valid after the paint release with a selection, and a drag that leaves the lane still curves it and swallows the menu', async () => {
      const roll = await open(seededClip());
      // A selection first (n2), then the ramp.
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 150,
        clientY: rowY(64),
        pointerId: 1,
      });
      fireEvent.pointerUp(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
      act(() => tool('Paint').click());
      lanePress(0, 8);
      laneMove(256, 76);
      laneRelease(256, 76);
      expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      const changes = historyChangeCount();
      // The right button goes down in the lane (a plain right drag, no Alt), the drag runs up out of the
      // lane over the roll, and the release and its contextmenu land on the roll.
      lanePress(100, 40, { button: 2, pointerId: 2 });
      fireEvent.pointerMove(roll, { clientX: 100, clientY: -60, pointerId: 2 });
      fireEvent.pointerUp(roll, { button: 2, clientX: 100, clientY: -60, pointerId: 2 });
      expect(fireEvent.contextMenu(roll)).toBe(false);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(historyChangeCount()).toBe(changes + 1);
      expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      // A second plain right drag works the same on the window, and the ramp is still active for it.
      const again = { button: 2, pointerId: 3 };
      lanePress(100, 40, again);
      fireEvent.pointerMove(document.body, { clientX: 100, clientY: 200, pointerId: 3 });
      fireEvent.pointerUp(window, { button: 2, clientX: 100, clientY: 200, pointerId: 3 });
      expect(fireEvent.contextMenu(document.body)).toBe(false);
      expect(historyChangeCount()).toBe(changes + 2);
      // Everything was swallowed once: the browser menu is back for the next right-click.
      expect(fireEvent.contextMenu(document.body)).toBe(true);
    });
  });
});

describe('same-pitch overlaps through the editor', () => {
  const ids = () => desk.snippets[0].packet.items.map((entry) => entry.id);
  const spanOf = (id: string) => {
    const value = noteValue(id);
    const start = value.onset.quarterNotes.numerator / value.onset.quarterNotes.denominator;
    return [start, value.duration.quarterNotes.numerator / value.duration.quarterNotes.denominator];
  };

  it('a quarter dragged onto beat 2 of a whole note makes q, q, h in one undo step', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [seedNote('w', 0, 4, 6000), seedNote('d', 6, 1, 6000)],
      },
    });
    const changes = historyChangeCount();
    // d (6 to 7) dragged five quarters left lands on beat 2 (1 to 2) of the whole note.
    drag(
      screen.getAllByTitle(/^C4 · 6\.000 qn/)[0],
      { x: 6 * 64 + 20, y: rowY(60) },
      { x: 6 * 64 + 20 - 5 * 64, y: rowY(60) },
      roll
    );
    expect(historyChangeCount()).toBe(changes + 1);
    expect(ids()).toHaveLength(3);
    const spans = ids()
      .map(spanOf)
      .sort((a, b) => a[0] - b[0]);
    expect(spans).toEqual([
      [0, 1],
      [1, 1],
      [2, 2],
    ]);
    // The dragged note stays selected; the created piece is not.
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(spanOf('w')).toEqual([0, 1]);
    expect(spanOf('d')).toEqual([1, 1]);
    act(() => undo());
    expect(ids()).toEqual(['w', 'd']);
  });
});

describe('keyboard note editing', () => {
  const ids = () => desk.snippets[0].packet.items.map((entry) => entry.id);
  const startOf = (id: string) => {
    const onset = noteValue(id).onset.quarterNotes;
    return onset.numerator / onset.denominator;
  };
  const lengthOf = (id: string) => {
    const duration = noteValue(id).duration.quarterNotes;
    return duration.numerator / duration.denominator;
  };
  const pitchOf = (id: string) => noteValue(id).pitches[0];

  /** A click on a note (selects it alone), released over the roll. */
  function select(roll: Element, title: RegExp, x: number, y: number) {
    fireEvent.pointerDown(screen.getByTitle(title), { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: x, clientY: y, pointerId: 1 });
  }
  const selectN1 = (roll: Element) => select(roll, /^C4 · 0\.000 qn/, 20, rowY(60));
  const selectN2 = (roll: Element) => select(roll, /^E4 · 2\.000 qn/, 140, rowY(64));

  /** Returns false when the key was taken (its default prevented). */
  const press = (target: Element, init: KeyboardEventInit) => fireEvent.keyDown(target, init);

  it('Left/Right move by one grid division (half a quarter here), one undo step per press, clamped at 0', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    const changes = historyChangeCount();
    expect(press(roll, { key: 'ArrowRight' })).toBe(false);
    expect(startOf('n2')).toBe(2.5);
    expect(press(roll, { key: 'ArrowLeft' })).toBe(false);
    press(roll, { key: 'ArrowLeft' });
    expect(startOf('n2')).toBe(1.5);
    expect(historyChangeCount()).toBe(changes + 3);
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(desk.snippets[0].lineage?.versions.length).toBe(2);
    act(() => undo());
    expect(startOf('n2')).toBe(2);
    // Clamped at the clip start: n1 sits at 0 and does not move (and writes nothing).
    selectN1(roll);
    const before = historyChangeCount();
    expect(press(roll, { key: 'ArrowLeft' })).toBe(false);
    expect(startOf('n1')).toBe(0);
    expect(historyChangeCount()).toBe(before);
  });

  it('Up/Down move one semitone and Shift+Up/Down one octave', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    press(roll, { key: 'ArrowUp' });
    expect(pitchOf('n2')).toBe(6500);
    press(roll, { key: 'ArrowDown' });
    press(roll, { key: 'ArrowDown' });
    expect(pitchOf('n2')).toBe(6300);
    press(roll, { key: 'ArrowUp', shiftKey: true });
    expect(pitchOf('n2')).toBe(7500);
    press(roll, { key: 'ArrowDown', shiftKey: true });
    press(roll, { key: 'ArrowDown', shiftKey: true });
    expect(pitchOf('n2')).toBe(5100);
  });

  it('refuses a group move at the keyboard ends without moving part of it', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [seedNote('lo', 0, 1, 500), seedNote('hi', 1, 1, 6000)],
      },
    });
    // A marquee over both notes.
    drag(roll, { x: 1, y: rowY(65) }, { x: 190, y: rowY(4) });
    expect(roll).toHaveAccessibleName(/2 selected/);
    const changes = historyChangeCount();
    expect(press(roll, { key: 'ArrowDown', shiftKey: true })).toBe(false);
    expect(historyChangeCount()).toBe(changes);
    expect(pitchOf('lo')).toBe(500);
    expect(pitchOf('hi')).toBe(6000);
    // The move that fits is one undo step for the whole group.
    press(roll, { key: 'ArrowUp' });
    expect([pitchOf('lo'), pitchOf('hi')]).toEqual([600, 6100]);
    expect(historyChangeCount()).toBe(changes + 1);
  });

  it('Shift+Left/Right nudge by the grid unit over 8 (1/32 of a quarter on a 1/8 grid), off the grid', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    // The editor snaps to half a quarter here (Ctrl+Right lengthens by 0.5), so a nudge is 1/16.
    press(roll, { key: 'ArrowRight', shiftKey: true });
    expect(startOf('n2')).toBe(2.0625);
    press(roll, { key: 'ArrowLeft', shiftKey: true });
    press(roll, { key: 'ArrowLeft', shiftKey: true });
    expect(startOf('n2')).toBe(1.9375);
  });

  it('Ctrl/Cmd+Left/Right lengthen and shorten by a division, never below one', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    press(roll, { key: 'ArrowRight', ctrlKey: true });
    expect(lengthOf('n2')).toBe(1.5);
    press(roll, { key: 'ArrowLeft', metaKey: true });
    press(roll, { key: 'ArrowLeft', ctrlKey: true });
    expect(lengthOf('n2')).toBe(0.5);
    const changes = historyChangeCount();
    expect(press(roll, { key: 'ArrowLeft', ctrlKey: true })).toBe(false);
    expect(lengthOf('n2')).toBe(0.5);
    expect(historyChangeCount()).toBe(changes);
  });

  it('Alt+Left/Right walk the selection (onset, then pitch high to low) and stay at the ends', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [
          seedNote('c', 0, 1, 6000),
          seedNote('e', 0, 1, 6400),
          seedNote('g', 0, 1, 6700),
          seedNote('next', 2, 1, 6000),
        ],
      },
    });
    const changes = historyChangeCount();
    const walk = () => {
      const titles = [...document.querySelectorAll('[data-selected]')].map((node) =>
        node.getAttribute('title')?.slice(0, 2)
      );
      return [...new Set(titles)];
    };
    // Nothing selected: Alt+Right takes the first note (the top of the first chord).
    expect(press(roll, { key: 'ArrowRight', altKey: true })).toBe(false);
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(walk()).toEqual(['G4']);
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(walk()).toEqual(['E4']);
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(walk()).toEqual(['C4']);
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(screen.getByTitle(/^C4 · 2\.000 qn/)).toHaveAttribute('data-selected');
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(screen.getByTitle(/^C4 · 2\.000 qn/)).toHaveAttribute('data-selected');
    // Left walks back.
    press(roll, { key: 'ArrowLeft', altKey: true });
    expect(screen.getByTitle(/^C4 · 0\.000 qn/)).toHaveAttribute('data-selected');
    // Navigation never edits the clip.
    expect(historyChangeCount()).toBe(changes);
    // The Alt keyup after an Alt+arrow must not reach the browser's menu bar (once).
    expect(fireEvent.keyUp(roll, { key: 'Alt' })).toBe(false);
    expect(fireEvent.keyUp(roll, { key: 'Alt' })).toBe(true);
  });

  it('Alt+Right on a multi-selection selects the first of them alone; Alt+Left the last', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [
          seedNote('c', 0, 1, 6000),
          seedNote('e', 0, 1, 6400),
          seedNote('g', 0, 1, 6700),
          seedNote('next', 2, 1, 6000),
        ],
      },
    });
    // A marquee over the whole chord (x 0 to 60 px, all pitches).
    drag(roll, { x: 1, y: rowY(70) }, { x: 60, y: rowY(55) });
    expect(roll).toHaveAccessibleName(/3 selected/);
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.getByTitle(/^G4 · 0\.000 qn/)).toHaveAttribute('data-selected');
    drag(roll, { x: 60, y: rowY(55) }, { x: 1, y: rowY(70) });
    expect(roll).toHaveAccessibleName(/3 selected/);
    press(roll, { key: 'ArrowLeft', altKey: true });
    expect(screen.getByTitle(/^C4 · 0\.000 qn/)).toHaveAttribute('data-selected');
  });

  it('Alt+Left with nothing selected takes the last note', async () => {
    const roll = await open(seededClip());
    press(roll, { key: 'ArrowLeft', altKey: true });
    expect(screen.getByTitle(/^G4 · 4\.000 qn/)).toHaveAttribute('data-selected');
  });

  it('moving onto a same-pitch note applies the overlap rule in the same undo step', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [seedNote('w', 0, 4, 6000), seedNote('d', 4, 1, 6000)],
      },
    });
    select(roll, /^C4 · 4.000 qn/, 4 * 64 + 20, rowY(60));
    const changes = historyChangeCount();
    // One press (an auto-repeat one too) puts d at 3.5 to 4.5, over the end of the whole note: d
    // is new ground for w (they only touched), so w is shortened to make room.
    press(roll, { key: 'ArrowLeft', repeat: true });
    expect(historyChangeCount()).toBe(changes + 1);
    expect(startOf('d')).toBe(3.5);
    expect(ids()).toEqual(['w', 'd']);
    expect([startOf('w'), lengthOf('w')]).toEqual([0, 3.5]);
    // The selection stays on the moved note.
    expect(roll).toHaveAccessibleName(/1 selected/);
  });

  it('leaves an old overlapping same-pitch pair alone when one of them is nudged', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [seedNote('w', 0, 4, 6000), seedNote('d', 2, 1, 6000)],
      },
    });
    select(roll, /^C4 · 2.000 qn/, 2 * 64 + 20, rowY(60));
    press(roll, { key: 'ArrowLeft' });
    expect(startOf('d')).toBe(1.5);
    expect(ids()).toEqual(['w', 'd']);
    expect([startOf('w'), lengthOf('w')]).toEqual([0, 4]);
  });

  it('two presses before a re-render still advance two steps (no stale selection)', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [
          seedNote('c', 0, 1, 6000),
          seedNote('e', 0, 1, 6400),
          seedNote('g', 0, 1, 6700),
          seedNote('next', 2, 1, 6000),
        ],
      },
    });
    act(() => {
      press(roll, { key: 'ArrowRight', altKey: true });
      press(roll, { key: 'ArrowRight', altKey: true });
    });
    expect(screen.getByTitle(/^E4 · 0\.000 qn/)).toHaveAttribute('data-selected');
    expect(screen.getByTitle(/^G4 · 0\.000 qn/)).not.toHaveAttribute('data-selected');
  });

  it('a move right after a merge acts on the surviving note', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [seedNote('a', 0, 1, 6000), seedNote('b', 0, 1, 6100)],
      },
    });
    select(roll, /^C♯4 · 0\.000 qn/, 20, rowY(61));
    act(() => {
      // b steps down onto a (identical span: it merges into a), then the next press moves a.
      press(roll, { key: 'ArrowDown' });
      press(roll, { key: 'ArrowRight' });
    });
    expect(ids()).toEqual(['a']);
    expect(startOf('a')).toBe(0.5);
    // The survivor is what stays selected: the second press followed the edit against the first
    // press's result (not a stale render), so the selection did not fall away.
    expect(readNoteEditor('seeded')!.selection.ids).toEqual(['a']);
  });

  it('announces Alt navigation to assistive technology', async () => {
    const base = seededClip();
    const roll = await open({
      ...base,
      packet: {
        ...base.packet,
        items: [seedNote('c', 0, 1, 6000), seedNote('g', 0, 1, 6700), seedNote('next', 5, 1, 6000)],
      },
    });
    const status = screen.getByTestId('note-announcement');
    expect(status).toHaveAttribute('aria-live', 'polite');
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(status).toHaveTextContent('G4 at bar 1 beat 1, selected, 1 of 3');
    press(roll, { key: 'ArrowRight', altKey: true });
    press(roll, { key: 'ArrowRight', altKey: true });
    expect(status).toHaveTextContent('C4 at bar 2 beat 2, selected, 3 of 3');
  });

  it('is ignored in text fields and during a pitch pick, and does nothing with a time selection', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    // The field lives INSIDE the roll area, so the editor's own text-field guard is what refuses it.
    const input = document.createElement('input');
    roll.append(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    const changes = historyChangeCount();
    expect(fireEvent.keyDown(input, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'ArrowLeft', altKey: true })).toBe(true);
    expect(startOf('n2')).toBe(2);
    expect(historyChangeCount()).toBe(changes);
    input.remove();
    // A pick waits: edits are ignored, but the browser's Alt+Left (Back) is still swallowed.
    act(() => {
      readNoteEditor('seeded')!.beginPick({ actionId: 'invert', hint: 'Pick', onPick: () => {} });
    });
    expect(press(roll, { key: 'ArrowRight' })).toBe(true);
    expect(startOf('n2')).toBe(2);
    expect(press(roll, { key: 'ArrowLeft', altKey: true })).toBe(false);
    act(() => {
      readNoteEditor('seeded')!.cancelPick();
    });
    expect(historyChangeCount()).toBe(changes);
    // A time selection: the arrows take the key and do nothing.
    act(() => screen.getByRole('radio', { name: 'Time' }).click());
    drag(roll, { x: 128, y: 5 }, { x: 256, y: 5 });
    expect(screen.getByTestId('roll-range')).toBeInTheDocument();
    expect(press(roll, { key: 'ArrowRight' })).toBe(false);
    expect(startOf('n2')).toBe(2);
    expect(historyChangeCount()).toBe(changes);
  });

  it('is ignored while a pointer drag is running, and live again after it ends', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 160,
      clientY: rowY(64),
      pointerId: 2,
    });
    expect(press(roll, { key: 'ArrowRight' })).toBe(true);
    expect(startOf('n2')).toBe(2);
    fireEvent.pointerUp(roll, { clientX: 160, clientY: rowY(64), pointerId: 2 });
    expect(press(roll, { key: 'ArrowRight' })).toBe(false);
    expect(startOf('n2')).toBe(2.5);
  });

  it('a lost release (pen, touch or mouse) is recovered by the next move with no button down', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    for (const pointerType of ['pen', 'touch', 'mouse']) {
      fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
        clientX: 160,
        clientY: rowY(64),
        pointerId: 3,
        pointerType,
      });
      expect(press(roll, { key: 'ArrowUp' })).toBe(true);
      fireEvent.pointerMove(window, { pointerId: 3, pointerType, buttons: 0 });
      expect(press(roll, { key: 'ArrowUp' })).toBe(false);
      press(roll, { key: 'ArrowDown' });
    }
    expect(pitchOf('n2')).toBe(6400);
    // The other releases: lost capture and window blur.
    fireEvent.pointerDown(document.querySelector('[title*="· 2.000 qn"]')!, { pointerId: 4 });
    expect(press(roll, { key: 'ArrowUp' })).toBe(true);
    fireEvent(window, new Event('lostpointercapture'));
    expect(press(roll, { key: 'ArrowUp' })).toBe(false);
    fireEvent.pointerDown(document.querySelector('[title*="· 2.000 qn"]')!, { pointerId: 5 });
    fireEvent.blur(window);
    expect(press(roll, { key: 'ArrowUp' })).toBe(false);
  });

  it('leaves other modified arrows alone and keeps the existing shortcuts working', async () => {
    const roll = await open(seededClip());
    selectN2(roll);
    expect(press(roll, { key: 'ArrowUp', altKey: true })).toBe(true);
    expect(press(roll, { key: 'ArrowUp', ctrlKey: true })).toBe(true);
    expect(startOf('n2')).toBe(2);
    expect(pitchOf('n2')).toBe(6400);
    press(roll, { key: ']' });
    expect(noteValue('n2').velocity).toBe(1);
    press(roll, { key: 'Delete' });
    expect(ids()).toEqual(['n1', 'n3']);
  });
});

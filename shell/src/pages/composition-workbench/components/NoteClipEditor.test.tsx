import { act, cleanup, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import { auditionRefusal, makeSourceRefusal } from '../clipTypes';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { canUndo, historyChangeCount, resetHistory, undo } from '../history';
import type { NoteEventValue } from '../melodicization';
import { packet, type DataItem } from '../model';
import { defaultMusicalTimeline, musicalDuration, musicalPosition, rational } from '../musicalTime';
import { NOTE_EDITOR_PREFERENCES_KEY, readNoteEditorPreferences } from '../noteEditorPreferences';
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

  it('time selection: selects the span and the notes starting inside it, without touching the clip', async () => {
    const roll = await open(seededClip());
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    act(() => tool('Time').click());
    // 120 px to 300 px: quarters 1.5 to 5 (grid 0.5): n2 (at 2) and n3 (at 4) start inside.
    drag(roll, { x: 120, y: 5 }, { x: 300, y: 5 });
    expect(roll).toHaveAccessibleName(/2 selected/);
    const band = screen.getByTestId('roll-range');
    // The range covers the dragged span, and n3 runs on to 6.
    expect(band.style.left).toBe('96px');
    expect(band.style.width).toBe(`${6 * 64 - 96}px`);
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
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

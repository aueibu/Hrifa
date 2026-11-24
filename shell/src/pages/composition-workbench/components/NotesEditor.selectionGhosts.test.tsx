import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChordSession } from '../chordInput/chordSession';
import { ChordSessionProvider, useChordSession } from '../chordInput/ChordSessionProvider';
import { ChordPanelStandIn } from '../chordInput/chordTestUtils';
import { CompositionSettingsProvider } from '../compositionSettings';
import type { PacketBlock } from '../dataBlock';
import { DeskProvider, useDesk } from '../desk';
import { resetHistory } from '../history';
import type { NoteEventValue } from '../melodicization';
import { packet, type DataItem } from '../model';
import { musicalDuration, musicalPosition, rationalFromNumber } from '../musicalTime';
import { NotesEditor } from './NotesEditor';

// M6c: in selection mode the roll draws ghosts for the chord the picker would insert on EVERY selected note, by the
// same code Insert runs, so the ghosts equal the notes Insert then adds.

vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    play: async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined }),
    subscribe: () => () => undefined,
  }),
}));

let desk: ReturnType<typeof useDesk>;
let chordSession: ChordSession;

function Harness() {
  desk = useDesk();
  chordSession = useChordSession();
  const dataBlock = desk.dataBlocks[0];
  return dataBlock && <NotesEditor dataBlock={dataBlock} />;
}

function seedNote(
  id: string,
  start: number,
  length: number,
  midicents: number
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: { quarterNotes: rationalFromNumber(start) },
      interOnset: { quarterNotes: rationalFromNumber(length) },
      duration: { quarterNotes: rationalFromNumber(length) },
      pitches: [midicents],
      velocity: 1,
    },
    label: id,
    provenance: [],
  };
}

function dataBlockOf(notes: DataItem<NoteEventValue>[]): PacketBlock {
  return {
    schemaVersion: 2,
    typeId: 'notes',
    id: 'seeded',
    name: 'Seeded',
    createdAt: '2026-11-11T00:00:00Z',
    payload: {
      kind: 'packet',
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
    },
  };
}

async function open(seed: PacketBlock) {
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
  act(() => desk.addDataBlock(seed));
  return screen.findByRole('group', { name: /Notes piano roll/ });
}

// jsdom lays nothing out: 64 px a quarter, 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;
function click(roll: HTMLElement, midi: number, x: number) {
  const at = { clientX: x, clientY: rowY(midi), pointerId: 1 };
  fireEvent.pointerDown(roll, at);
  fireEvent.pointerUp(roll, at);
}
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
const chord = (name: string) => screen.getByRole('button', { name });
const ghosts = (variant?: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      variant ? `[data-ghost-overlay="${variant}"]` : '[data-ghost-overlay]'
    ),
  ].filter((el) => el.dataset.ghostOverlay !== 'hover' || variant === 'hover');
/** A box as a comparable string: where a ghost or a note sits on the roll. */
const box = (el: HTMLElement) => `${el.style.left}|${el.style.top}|${el.style.width}`;
const ghostBoxes = (variant?: string) => ghosts(variant).map(box).sort();
/** The boxes of every real note on the roll (their titles end in "qn" lines). */
const noteBoxes = () =>
  [...document.querySelectorAll<HTMLElement>('[title*=" qn"]')].map(box).sort();

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('selection mode: ghosts on every selected note', () => {
  it('one selected note: hover ghosts equal the notes Insert then adds, and clear after Insert', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    expect(ghosts()).toHaveLength(0);

    await user.hover(chord('Em'));
    // Em on E4: G4 and B4 (the E exists, so it is not ghosted).
    expect(ghosts('hover')).toHaveLength(2);
    const predicted = ghostBoxes('hover');
    const before = noteBoxes();

    await user.dblClick(chord('Em'));
    const added = noteBoxes().filter((b) => !before.includes(b));
    expect(added).toEqual(predicted);
    expect(ghosts()).toHaveLength(0);
  });

  it('two selected notes: ghosts on both, in the pinned style when the chord is clicked', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('c', 1, 1, 6000), seedNote('g', 3, 1, 6700)]));
    useTool(roll, '1');
    pick(roll, /^C4 · 1\.000 qn/, 60, 1);
    pick(roll, /^G4 · 3\.000 qn/, 67, 3, true);

    await user.click(chord('C'));
    // C major on C4 (E4, G4) and on G4 (B4, D5): the roots exist.
    expect(ghosts('pinned')).toHaveLength(4);
    const predicted = ghostBoxes('pinned');
    const before = noteBoxes();
    await user.dblClick(chord('C'));
    expect(noteBoxes().filter((b) => !before.includes(b))).toEqual(predicted);
    expect(ghosts()).toHaveLength(0);
  });

  it('a pitch two chords share at one onset is ghosted once; tones already in the data-block are not ghosted', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('c', 1, 1, 6000), seedNote('g', 1, 1, 6700)]));
    useTool(roll, '1');
    pick(roll, /^C4 · 1\.000 qn/, 60, 1);
    pick(roll, /^G4 · 1\.000 qn/, 67, 1, true);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    await user.hover(chord('C'));
    // C major around either note is C, E, G; C4 and G4 exist: only the E4 is new, and once.
    expect(ghosts('hover')).toHaveLength(1);
  });

  it('nothing selected: no ghosts; deselecting clears them', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    await user.hover(chord('C'));
    expect(ghosts()).toHaveLength(0);
    await user.unhover(chord('C'));
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.hover(chord('Em'));
    expect(ghosts('hover')).toHaveLength(2);
    // A click on empty roll with the Pointer tool clears the selection.
    click(roll, 80, 7 * 64);
    expect(ghosts()).toHaveLength(0);
  });

  it('leaving the pointer tool for the Chords tool hands the ghosts to anchor mode (no selection ghosts)', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.hover(chord('Em'));
    expect(ghosts('hover')).toHaveLength(2);
    // The Chords tool has no anchor yet: its own ghosts are none, and the selection ghosts are gone.
    useTool(roll, '7');
    expect(ghosts()).toHaveLength(0);
  });

  it('a new selection clears the pin: pin Em on E4, click G4 -> nothing pinned; hover shows ghosts on G4', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400), seedNote('g', 5, 1, 6700)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.click(chord('Em'));
    expect(ghosts('pinned')).toHaveLength(2);
    expect(chordSession.getState().pinnedChord).not.toBeNull();

    pick(roll, /^G4 · 5\.000 qn/, 67, 5);
    expect(ghosts()).toHaveLength(0);
    expect(chordSession.getState().pinnedChord).toBeNull();

    await user.hover(chord('G'));
    expect(ghosts('hover').length).toBeGreaterThan(0);
  });

  it('Shift-click adding a note also clears the pin', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400), seedNote('g', 5, 1, 6700)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.click(chord('Em'));
    expect(ghosts('pinned')).toHaveLength(2);
    pick(roll, /^G4 · 5\.000 qn/, 67, 5, true);
    expect(chordSession.getState().pinnedChord).toBeNull();
    expect(ghosts('pinned')).toHaveLength(0);
  });

  it('Insert keeps the selection: it is not a new selection', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.dblClick(chord('Em'));
    expect(chordSession.selectionAnchors()).toHaveLength(1);
    // A pin after the insert stays (the selection did not change); Em adds nothing now, so no ghosts are drawn.
    await user.click(chord('Em'));
    expect(chordSession.getState().pinnedChord).not.toBeNull();
  });

  it('panel off screen: no ghosts, no Insert; back on screen only a hover or a new pin brings ghosts', async () => {
    const user = userEvent.setup();
    const roll = await open(dataBlockOf([seedNote('e', 2, 1, 6400)]));
    useTool(roll, '1');
    pick(roll, /^E4 · 2\.000 qn/, 64, 2);
    await user.hover(chord('Em'));
    const em = chordSession.getState().hoverChord;
    expect(em).not.toBeNull();
    await user.click(chord('Em'));
    expect(ghosts('pinned')).toHaveLength(2);

    act(() => chordSession.setPanelShown(false));
    expect(ghosts()).toHaveLength(0);
    expect(chordSession.getState().pinnedChord).toBeNull();
    // The session refuses an insert while the panel is hidden.
    const before = desk.dataBlocks[0].payload.packet.items.length;
    act(() => chordSession.insertChord(em!));
    expect(desk.dataBlocks[0].payload.packet.items).toHaveLength(before);

    act(() => chordSession.setPanelShown(true));
    expect(ghosts()).toHaveLength(0);
    await user.unhover(chord('Em'));
    await user.hover(chord('Em'));
    expect(ghosts('hover')).toHaveLength(2);
  });
});

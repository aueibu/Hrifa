import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chordsOnRoot, chordsWithCommonTone } from '../chordInput/chords';
import { CompositionSettingsProvider, useCompositionSettings } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { DEVELOPER_OPTIONS_KEY } from '../developerOptions';
import { canUndo, resetHistory, undo } from '../history';
import type { NoteEventValue } from '../melodicization';
import { packet, type DataItem } from '../model';
import { musicalDuration, musicalPosition, rational } from '../musicalTime';
import { NOTE_EDITOR_PREFERENCES_KEY } from '../noteEditorPreferences';
import type { Snippet } from '../snippet';
import { CanvasTakeoverProvider, CanvasTakeoverSlot } from './canvasTakeover';
import { NoteClipEditor } from './NoteClipEditor';

// The audition path: a stand-in audio engine that makes no sound and records what was played.
const engine = vi.hoisted(() => ({
  play: vi.fn(async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined })),
}));
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: engine.play, subscribe: () => () => undefined }),
}));

let desk: ReturnType<typeof useDesk>;
let settingsApi: ReturnType<typeof useCompositionSettings>;

function Harness({ takeover = false }: { takeover?: boolean }) {
  desk = useDesk();
  settingsApi = useCompositionSettings();
  const clip = desk.snippets[0];
  const editor = clip && <NoteClipEditor snippet={clip} />;
  return takeover ? (
    <CanvasTakeoverProvider>
      <div>
        <CanvasTakeoverSlot />
        {editor}
      </div>
    </CanvasTakeoverProvider>
  ) : (
    editor
  );
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

/** One C4, a quarter long, at the start. */
function seededClip(): Snippet {
  return {
    schemaVersion: 1,
    id: 'seeded',
    name: 'Seeded',
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [seedNote('n1', 0, 1, 6000)]),
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

async function open(options: { takeover?: boolean; seed?: Snippet } = {}) {
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness takeover={options.takeover} />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await waitFor(() => expect(desk.loading).toBe(false));
  act(() => {
    if (options.seed) {
      desk.addSnippet(options.seed);
    } else {
      desk.addBlankClip('notes', rational(4));
    }
  });
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

// jsdom lays nothing out: the roll's origin is (0, 0), 64 px a quarter (half-quarter grid steps)
// and 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;

/** Selects the Chords tool and clicks the roll at a pitch (midi) and an x. */
function clickAnchor(roll: HTMLElement, midi: number, x = 70) {
  roll.focus();
  fireEvent.keyDown(roll, { key: '7' });
  fireEvent.pointerDown(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
  fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
}

const pitches = () =>
  desk.snippets[0].packet.items
    .map((item) => item.value as NoteEventValue)
    .flatMap((value) => value.pitches.map((pitch) => ({ pitch, onset: value.onset })))
    .sort((a, b) => a.pitch - b.pitch);
const noteCount = () => desk.snippets[0].packet.items.length;
const ghosts = (variant: string) =>
  document.querySelectorAll(`[data-ghost-overlay="${variant}"]`) as NodeListOf<HTMLElement>;
const chord = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  engine.play.mockClear();
});

describe('the Chords tool picker in the note clip editor', () => {
  it('opens a dock beside the roll while the tool is active, and not otherwise', async () => {
    const roll = await open();
    expect(document.querySelector('[data-chord-host]')).toBeNull();
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    expect(document.querySelector('[data-chord-host="dock"]')).not.toBeNull();
    expect(screen.getByText(/Click the roll where a chord should go/)).toBeInTheDocument();
    fireEvent.keyDown(roll, { key: '1' });
    expect(document.querySelector('[data-chord-host]')).toBeNull();
  });

  it('in C major, clicking A and double-clicking Am at first inversion places C4 E4 A4 at the click onset', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    expect(screen.getByText(/Chords on A \(A4\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1st inv.' }));
    expect(noteCount()).toBe(0);

    await user.dblClick(chord('Am'));
    expect(pitches()).toEqual([
      { pitch: 6000, onset: musicalPosition(1) },
      { pitch: 6400, onset: musicalPosition(1) },
      { pitch: 6900, onset: musicalPosition(1) },
    ]);
    // The chord is one hand edit: a single undo takes all three notes away.
    expect(canUndo()).toBe(true);
    act(() => undo());
    expect(noteCount()).toBe(0);
  });

  it('Enter on a focused chord inserts it', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 60);
    chord('C').focus();
    await user.keyboard('{Enter}');
    expect(pitches().map((entry) => entry.pitch)).toEqual([6000, 6400, 6700]);
  });

  it('a single click auditions once through the audition path and creates no note, then pins the ghost', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(chord('Am'));
    await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
    const request = engine.play.mock.calls[0] as unknown as [
      { plan: { events: { pitchMidicents: number }[] } },
    ];
    expect(request[0].plan.events.map((event) => event.pitchMidicents)).toEqual([6900, 7200, 7600]);
    expect(noteCount()).toBe(0);
    expect(ghosts('pinned')).toHaveLength(3);
  });

  it('hover shows ghosts for the voiced chord and leaving clears them; no note and no sound', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    expect(ghosts('hover')).toHaveLength(0);
    await user.hover(chord('Am'));
    expect(ghosts('hover')).toHaveLength(3);
    expect(ghosts('anchor')).toHaveLength(1);
    await user.unhover(chord('Am'));
    expect(ghosts('hover')).toHaveLength(0);
    expect(noteCount()).toBe(0);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('the ghosts follow the voicing and the anchor onset, with the grid step as the length', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 60);
    // Choosing an inversion pins the first chord (C) at the new voicing.
    await user.click(screen.getByRole('button', { name: '1st inv.' }));
    const hover = [...ghosts('pinned')];
    expect(hover).toHaveLength(3);
    // E3, G3 and C4: the root exactly on the C4 row, the other two below it (greater y).
    const tops = hover.map((el) => parseFloat(el.style.top)).sort((a, b) => a - b);
    const c4Row = (127 - 60) * 22;
    expect(tops[0]).toBeGreaterThanOrEqual(c4Row);
    expect(tops[0]).toBeLessThan(c4Row + 22);
    expect(tops[1]).toBeGreaterThanOrEqual(c4Row + 22);
    expect(tops[2]).toBeGreaterThanOrEqual(c4Row + 22);
    // Starts at the anchor onset (1 quarter = 64 px), one half-quarter grid step long.
    expect(parseFloat(hover[0].style.left)).toBeCloseTo(64, 0);
    expect(parseFloat(hover[0].style.width)).toBeCloseTo(32, 0);
  });

  it('Escape and Close clear the ghosts and the anchor; so does leaving the tool', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(chord('Am'));
    expect(ghosts('pinned')).toHaveLength(3);
    fireEvent.keyDown(chord('Am'), { key: 'Escape' });
    expect(document.querySelector('[data-ghost-overlay]')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Chord picker' })).toBeNull();

    roll.focus();
    fireEvent.pointerDown(roll, { clientX: 70, clientY: rowY(69), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 70, clientY: rowY(69), pointerId: 1 });
    await user.hover(chord('Am'));
    await user.click(screen.getByRole('button', { name: 'Close chord picker' }));
    expect(document.querySelector('[data-ghost-overlay]')).toBeNull();

    fireEvent.pointerDown(roll, { clientX: 70, clientY: rowY(69), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 70, clientY: rowY(69), pointerId: 1 });
    await user.click(chord('Am'));
    fireEvent.keyDown(roll, { key: '1' });
    expect(document.querySelector('[data-ghost-overlay]')).toBeNull();
    expect(noteCount()).toBe(0);
  });

  it('a chord tone that equals an existing note at the same onset and pitch is not duplicated; the others are added in one undo step', async () => {
    const user = userEvent.setup();
    const roll = await open({ seed: seededClip() });
    clickAnchor(roll, 60, 10); // onset 0, on the existing C4
    await user.dblClick(chord('C'));
    expect(pitches().map((entry) => entry.pitch)).toEqual([6000, 6400, 6700]);
    expect(noteCount()).toBe(3);
    act(() => undo());
    expect(pitches().map((entry) => entry.pitch)).toEqual([6000]);
  });

  it('the scale override changes the offer, outlives the click, and never changes the project pitch set', async () => {
    const user = userEvent.setup();
    const roll = await open();
    const projectBefore = JSON.stringify(settingsApi.settings.pitchSet);
    clickAnchor(roll, 69);
    expect(screen.queryByRole('button', { name: 'A' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Scale/ }));
    await user.click(
      within(screen.getByRole('group', { name: 'Pitches in the scale' })).getByText(/^C[♯#]$/)
    );
    expect(chord('A')).toBeInTheDocument();

    // A new click elsewhere keeps the override: it belongs to the tool.
    fireEvent.pointerDown(roll, { clientX: 200, clientY: rowY(69), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 200, clientY: rowY(69), pointerId: 1 });
    expect(chord('A')).toBeInTheDocument();
    expect(JSON.stringify(settingsApi.settings.pitchSet)).toBe(projectBefore);
    expect(localStorage.getItem('hrifa.composition-workbench.settings.v1')).not.toContain(
      '"pcs":[0,1,'
    );
  });

  it('shows the empty state when the project pitch set is empty', async () => {
    const roll = await open();
    act(() =>
      settingsApi.updateSettings({ pitchSet: { ...settingsApi.settings.pitchSet, pcs: [] } })
    );
    clickAnchor(roll, 69);
    expect(screen.getByText(/No pitches in the scale/)).toBeInTheDocument();
  });

  it('labels the anchor on the note by default, beside it with the developer option, and nothing else is labelled', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.hover(chord('Am'));
    const anchor = ghosts('anchor')[0];
    expect(anchor.dataset.labelPlacement).toBe('on-note');
    expect(anchor.textContent).toContain('A4');
    ghosts('hover').forEach((el) => expect(el.textContent).toBe(''));
  });

  it('the developer option moves the anchor label beside the note', async () => {
    localStorage.setItem(DEVELOPER_OPTIONS_KEY, JSON.stringify({ chordAnchorLabel: 'side' }));
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.hover(chord('Am'));
    const anchor = ghosts('anchor')[0];
    expect(anchor.dataset.labelPlacement).toBe('side');
    expect(anchor.querySelector('[class*="ghostSideLabel"]')?.textContent).toBe('A4');
    ghosts('hover').forEach((el) => expect(el.textContent).toBe(''));
  });

  it('shows the same picker in the takeover when that host is chosen, and the choice is remembered per viewer', async () => {
    const user = userEvent.setup();
    const roll = await open({ takeover: true });
    clickAnchor(roll, 69);
    const dock = document.querySelector('[data-chord-host="dock"]') as HTMLElement;
    expect(dock).not.toBeNull();
    expect(chord('Am')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand over canvas' }));
    const slot = document.querySelector('[data-slot="canvas-takeover"]') as HTMLElement;
    expect(slot.querySelector('[data-chord-host="takeover"]')).not.toBeNull();
    expect(document.querySelector('[data-chord-host="dock"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY)!).chordHost).toBe(
      'takeover'
    );
    // Same body, same behaviour: hover previews and double-click places.
    await user.hover(within(slot).getByRole('button', { name: 'Am' }));
    expect(ghosts('hover')).toHaveLength(3);
    await user.dblClick(within(slot).getByRole('button', { name: 'Am' }));
    expect(pitches().map((entry) => entry.pitch)).toEqual([6900, 7200, 7600]);
    // The roll stays where it is under the takeover.
    expect(screen.getByRole('group', { name: /Note clip piano roll/ })).toBeInTheDocument();
  });

  const played = () =>
    engine.play.mock.calls.map((call) =>
      (call as unknown as [{ plan: { events: { pitchMidicents: number }[] } }])[0].plan.events.map(
        (event) => event.pitchMidicents
      )
    );

  describe('inversion and spread audition', () => {
    it('an inversion click auditions the first chord with the new voicing and pins its ghost', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 60);
      await user.click(screen.getByRole('button', { name: '1st inv.' }));
      await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
      // C major, first inversion, root at the click: E3 G3 C4.
      expect(played()[0]).toEqual([5200, 5500, 6000]);
      expect(ghosts('pinned')).toHaveLength(3);
      expect(noteCount()).toBe(0);
    });

    it('a double-click on an inversion button auditions once and inserts nothing', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 60);
      await user.dblClick(screen.getByRole('button', { name: '1st inv.' }));
      await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
      expect(noteCount()).toBe(0);
    });

    it('a spread click auditions the pinned chord, not the first one', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 69);
      await user.click(chord('Am'));
      await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
      await user.click(screen.getByRole('button', { name: 'Open' }));
      await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2));
      const [, second] = played();
      expect(second).toHaveLength(3);
      expect(second.every((pitch) => pitch % 100 === 0)).toBe(true);
      expect(ghosts('pinned')).toHaveLength(3);
      // Am has A4 as the root: the open voicing keeps it on the click.
      expect(second).toContain(6900);
    });

    it('hovering the voicing buttons is silent', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 60);
      await user.hover(screen.getByRole('button', { name: '1st inv.' }));
      await user.hover(screen.getByRole('button', { name: 'Drop 2' }));
      expect(engine.play).not.toHaveBeenCalled();
    });

    it('with no chord offered at all, nothing sounds', async () => {
      const user = userEvent.setup();
      const roll = await open();
      act(() =>
        settingsApi.updateSettings({ pitchSet: { ...settingsApi.settings.pitchSet, pcs: [] } })
      );
      clickAnchor(roll, 60);
      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(engine.play).not.toHaveBeenCalled();
    });
  });

  describe('the preview gate (developer option)', () => {
    beforeEach(() => {
      localStorage.setItem(
        DEVELOPER_OPTIONS_KEY,
        JSON.stringify({ chordPreviewGate: 'ctrl-click' })
      );
    });

    it('a plain click on a chord pins the ghost without sound; Ctrl+click sounds once', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 69);
      await user.click(chord('Am'));
      expect(engine.play).not.toHaveBeenCalled();
      expect(ghosts('pinned')).toHaveLength(3);
      await user.keyboard('{Control>}');
      await user.click(chord('Am'));
      await user.keyboard('{/Control}');
      await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
    });

    it('inversion and spread follow the same gate', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 60);
      await user.click(screen.getByRole('button', { name: '1st inv.' }));
      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(engine.play).not.toHaveBeenCalled();
      await user.keyboard('{Control>}');
      await user.click(screen.getByRole('button', { name: '2nd inv.' }));
      await user.keyboard('{/Control}');
      await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
    });

    it('double-click still inserts and Enter still inserts, with no sound', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 60);
      await user.dblClick(chord('C'));
      expect(noteCount()).toBe(3);
      expect(engine.play).not.toHaveBeenCalled();
    });
  });

  it('the dock width is remembered per viewer through the splitter', async () => {
    const roll = await open();
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    fireEvent.keyDown(screen.getByRole('separator', { name: /Resize chord dock/ }), {
      key: 'ArrowLeft',
    });
    expect(JSON.parse(localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY)!).chordDockWidth).toBe(496);
  });

  it('double-click in click mode does not audition twice', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 60);
    await user.dblClick(chord('C'));
    await waitFor(() => expect(engine.play.mock.calls.length).toBeLessThanOrEqual(1));
    expect(noteCount()).toBe(3);
  });

  describe('the hover ghost cell', () => {
    const move = (roll: HTMLElement, midi: number, x = 70) =>
      fireEvent.pointerMove(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });

    it('shows one grid step under the pointer with the Chords tool, and clears on leave', async () => {
      const roll = await open();
      roll.focus();
      move(roll, 60);
      expect(ghosts('hover')).toHaveLength(0);
      fireEvent.keyDown(roll, { key: '7' });
      move(roll, 60);
      const cell = ghosts('hover');
      expect(cell).toHaveLength(1);
      expect(parseFloat(cell[0].style.width)).toBeCloseTo(32, 0);
      expect(parseFloat(cell[0].style.left)).toBeCloseTo(64, 0);
      fireEvent.pointerLeave(roll);
      expect(ghosts('hover')).toHaveLength(0);
      expect(noteCount()).toBe(0);
      expect(engine.play).not.toHaveBeenCalled();
    });

    it('clears when the tool changes', async () => {
      const roll = await open();
      roll.focus();
      fireEvent.keyDown(roll, { key: '7' });
      move(roll, 60);
      expect(ghosts('hover')).toHaveLength(1);
      fireEvent.keyDown(roll, { key: '1' });
      expect(ghosts('hover')).toHaveLength(0);
    });

    it('is suppressed over the anchor cell and while a picker chord is hovered', async () => {
      const user = userEvent.setup();
      const roll = await open();
      clickAnchor(roll, 60);
      move(roll, 60);
      expect(ghosts('hover')).toHaveLength(0);
      move(roll, 64);
      expect(ghosts('hover')).toHaveLength(1);
      await user.hover(chord('C'));
      // Only the chord's three hover ghosts, not the cell as well.
      expect(ghosts('hover')).toHaveLength(3);
    });
  });
});

describe('the Chords tool in common-tone mode', () => {
  /** Ctrl+click on the roll with the Chords tool at a pitch (midi). */
  function ctrlClickAnchor(roll: HTMLElement, midi: number, x = 70) {
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    const at = { clientX: x, clientY: rowY(midi), pointerId: 1, ctrlKey: true };
    fireEvent.pointerDown(roll, at);
    fireEvent.pointerUp(roll, at);
  }
  const columns = () => [...document.querySelectorAll<HTMLElement>('[data-role-column]')];
  const roleGroup = () => (columns().length > 0 ? columns() : null);

  it('Ctrl+click on A in C major opens common-tone mode; a plain click opens root mode', async () => {
    const roll = await open();
    ctrlClickAnchor(roll, 69);
    expect(screen.getByText(/Chords containing A \(A4\)/)).toBeInTheDocument();
    expect(roleGroup()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Common tone' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(noteCount()).toBe(0);

    fireEvent.pointerDown(roll, { clientX: 70, clientY: rowY(69), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 70, clientY: rowY(69), pointerId: 1 });
    expect(screen.getByText(/Chords on A \(A4\)/)).toBeInTheDocument();
    expect(roleGroup()).toBeNull();
  });

  it('the 5th role lists Dm, Dm7, Dm9; inserting Dm puts the A exactly at the click, D and F below', async () => {
    const user = userEvent.setup();
    const roll = await open();
    ctrlClickAnchor(roll, 69);
    const names = [...document.querySelector('[data-role="5th"]')!.querySelectorAll('button')].map(
      (button) => button.textContent
    );
    expect(names).toEqual(expect.arrayContaining(['Dm', 'Dm7', 'Dm9']));
    await user.dblClick(chord('Dm'));
    expect(pitches()).toEqual([
      { pitch: 6200, onset: musicalPosition(1) },
      { pitch: 6500, onset: musicalPosition(1) },
      { pitch: 6900, onset: musicalPosition(1) },
    ]);
    act(() => undo());
    expect(noteCount()).toBe(0);
  });

  it('ghosts, audition and insert use the same notes, following the inversion', async () => {
    const user = userEvent.setup();
    const roll = await open();
    ctrlClickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: '1st inv.' }));
    await user.click(chord('Dm'));
    await waitFor(() => expect(engine.play).toHaveBeenCalled());
    const request = engine.play.mock.calls.at(-1) as unknown as [
      { plan: { events: { pitchMidicents: number }[] } },
    ];
    const sounded = request[0].plan.events.map((event) => event.pitchMidicents);
    expect(sounded).toEqual([6500, 6900, 7400]);
    expect(ghosts('pinned')).toHaveLength(3);
    await user.dblClick(chord('Dm'));
    expect(pitches().map((entry) => entry.pitch)).toEqual(sounded);
  });

  it('offers the root role with Am first, and no role A does not play', async () => {
    const roll = await open();
    ctrlClickAnchor(roll, 69);
    expect(chord('Am')).toBeInTheDocument();
    const roles = columns().map((column) => column.dataset.role);
    expect(roles[0]).toBe('root');
    // Exactly the engine's roles, no second implementation.
    expect(roles).toEqual(
      chordsWithCommonTone(settingsApi.settings.pitchSet, 9).map((column) => column.role)
    );
  });

  it('All pitches adds chords outside the set, and never changes the project pitch set', async () => {
    const user = userEvent.setup();
    const roll = await open();
    const projectBefore = JSON.stringify(settingsApi.settings.pitchSet);
    ctrlClickAnchor(roll, 69);
    const sharpMinor = () => screen.queryByRole('button', { name: /^F[♯#]m$/ });
    expect(sharpMinor()).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'All pitches' }));
    await user.dblClick(sharpMinor()!);
    // F#4 A4 C#5 close: the A (the 3rd) held at the click.
    expect(pitches().map((entry) => entry.pitch)).toEqual([6600, 6900, 7300]);
    expect(JSON.stringify(settingsApi.settings.pitchSet)).toBe(projectBefore);
    expect(localStorage.getItem('hrifa.composition-workbench.settings.v1')).not.toContain(
      '"pcs":[0,1,'
    );
  });

  it('the mode buttons switch after the click, and the empty set shows its state', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    expect(roleGroup()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Root' }));
    expect(roleGroup()).toBeNull();
    act(() =>
      settingsApi.updateSettings({ pitchSet: { ...settingsApi.settings.pitchSet, pcs: [] } })
    );
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    expect(screen.getByText(/No pitches in the scale/)).toBeInTheDocument();
  });
});

describe('the Chords tool: Simple and Extended', () => {
  const chromaticProject = () =>
    act(() =>
      settingsApi.updateSettings({
        pitchSet: {
          ...settingsApi.settings.pitchSet,
          pcs: Array.from({ length: 12 }, (_unused, pc) => pc),
          preset: 'chromatic',
        },
      })
    );
  const tierButton = (name: 'Simple' | 'Extended') => screen.getByRole('button', { name });

  it('Simple is the default, Extended adds chords, and the toggle is tool state that never touches settings', async () => {
    const user = userEvent.setup();
    const roll = await open();
    chromaticProject();
    const before = JSON.stringify(settingsApi.settings);
    clickAnchor(roll, 60);
    expect(tierButton('Simple')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'C7b5' })).toBeNull();
    await user.click(tierButton('Extended'));
    expect(chord('C7b5')).toBeInTheDocument();
    expect(chord('C13')).toBeInTheDocument();
    // A new click keeps the tier.
    fireEvent.pointerDown(roll, { clientX: 200, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 200, clientY: rowY(60), pointerId: 1 });
    expect(tierButton('Extended')).toHaveAttribute('aria-pressed', 'true');
    expect(chord('C13')).toBeInTheDocument();
    // So does switching away from the tool and back.
    fireEvent.keyDown(roll, { key: '1' });
    fireEvent.keyDown(roll, { key: '7' });
    fireEvent.pointerDown(roll, { clientX: 70, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 70, clientY: rowY(60), pointerId: 1 });
    expect(tierButton('Extended')).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.stringify(settingsApi.settings)).toBe(before);
    expect(localStorage.getItem('hrifa.composition-workbench.settings.v1')).not.toContain(
      'Extended'
    );
  });

  it('switching to Simple clears the ghosts of a pinned chord that is no longer listed', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 60);
    await user.click(tierButton('Extended'));
    const extendedName = chordsOnRoot(settingsApi.settings.pitchSet, 0, { tier: 'extended' }).find(
      (c) => c.tier === 'extended'
    )!.name;
    await user.click(chord(extendedName));
    expect(ghosts('pinned').length).toBeGreaterThan(0);
    await user.click(tierButton('Simple'));
    expect(screen.queryByRole('button', { name: extendedName })).toBeNull();
    expect(ghosts('pinned')).toHaveLength(0);
    expect(ghosts('hover')).toHaveLength(0);
  });

  it('inserts an extended chord (C7b9 over the chromatic set) through the real edit path as one undo step', async () => {
    const user = userEvent.setup();
    const roll = await open();
    chromaticProject();
    clickAnchor(roll, 60);
    await user.click(tierButton('Extended'));
    await user.dblClick(chord('C7b9'));
    expect(pitches().map((entry) => entry.pitch)).toEqual([6000, 6400, 6700, 7000, 7300]);
    act(() => undo());
    expect(noteCount()).toBe(0);
  });

  it('common-tone columns say 2nd, and Extended with All pitches lists extended chords', async () => {
    const user = userEvent.setup();
    const roll = await open();
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    const at = { clientX: 70, clientY: rowY(69), pointerId: 1, ctrlKey: true };
    fireEvent.pointerDown(roll, at);
    fireEvent.pointerUp(roll, at);
    const headers = () =>
      [...document.querySelectorAll('[data-role-column] > div')].map((el) => el.textContent);
    expect(headers()).toContain('2nd');
    expect(headers()).not.toContain('9th');
    await user.click(screen.getByRole('checkbox', { name: 'All pitches' }));
    await user.click(tierButton('Extended'));
    expect(headers()).toEqual(expect.arrayContaining(['4th', '6th']));
    expect(chord('A7b9')).toBeInTheDocument();
  });

  it('arrow keys and Enter use the listed (extended) chords: the last one reached inserts', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 60);
    await user.click(tierButton('Extended'));
    const listed = chordsOnRoot(settingsApi.settings.pitchSet, 0, { tier: 'extended' });
    const last = listed.at(-1)!;
    expect(last.tier).toBe('extended');
    roll.focus();
    for (let i = 0; i < listed.length + 2; i += 1) {
      fireEvent.keyDown(roll, { key: 'ArrowDown' });
    }
    expect(ghosts('pinned')).toHaveLength(last.pcs.length);
    fireEvent.keyDown(roll, { key: 'Enter' });
    expect(
      pitches()
        .map((entry) => entry.pitch % 1200)
        .sort((a, b) => a - b)
    ).toEqual(last.steps.map((step) => ((step % 12) * 100) % 1200).sort((a, b) => a - b));
    expect(noteCount()).toBe(last.pcs.length);
  });
});

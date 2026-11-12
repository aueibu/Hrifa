import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipActionsPanel } from './components/ClipActionsPanel';
import { CompositionInspector } from './components/CompositionInspector';
import { NoteClipEditor } from './components/NoteClipEditor';
import { CompositionSettingsProvider } from './compositionSettings';
import { DeskProvider, useDesk } from './desk';
import { historyChangeCount, resetHistory, undo } from './history';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition, rationalFromNumber } from './musicalTime';
import { readNoteEditor } from './noteEditorChannel';
import type { Snippet } from './snippet';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    play: async () => undefined,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

// A switch that makes the next desk commits fail, to exercise the failed-commit paths.
const failing = vi.hoisted(() => ({ commits: false }));
vi.mock('./snippet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./snippet')>();
  return {
    ...actual,
    commitSnippetEdit: (...args: Parameters<typeof actual.commitSnippetEdit>) =>
      failing.commits
        ? { ok: false as const, error: 'The desk refused that edit.' }
        : actual.commitSnippetEdit(...args),
  };
});

let desk: ReturnType<typeof useDesk>;

/** The editor and the clip inspector side by side, as the workbench lays them out. */
function Harness() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return (
    <>
      {clip && <NoteClipEditor snippet={clip} />}
      <CompositionInspector
        selected={{ kind: 'canvas' }}
        activeInstanceId={null}
        clipId={clip?.id ?? null}
        outputs={[]}
        instances={[]}
        routes={{}}
        onRemoveModule={() => undefined}
        onModuleSlot={() => undefined}
        onRouteTreatment={() => undefined}
      />
    </>
  );
}

function seedNote(
  id: string,
  start: number,
  midicents: number,
  length = 1,
  velocity = 1
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: { quarterNotes: rationalFromNumber(start) },
      interOnset: musicalDuration(length),
      duration: musicalDuration(length),
      pitches: [midicents],
      velocity,
    },
    label: id,
    provenance: [],
  };
}

/** An old clip (frame only, no stored properties): C4 at 0, E4 at 2, G4 at 4, one quarter each. */
function oldClip(
  notes = [seedNote('n1', 0, 6000), seedNote('n2', 2, 6400), seedNote('n3', 4, 6700)]
) {
  return {
    schemaVersion: 1,
    id: 'old',
    name: 'old',
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
  } as Snippet;
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
  act(() => {
    desk.addSnippet(seed);
  });
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

const rowY = (midi: number) => (127 - midi) * 22 + 11;
const button = (name: string) => screen.getByRole('button', { name });
const items = () => desk.snippets[0].packet.items;
const noteValue = (id: string) => items().find((item) => item.id === id)!.value as NoteEventValue;
const pitchOf = (id: string) => noteValue(id).pitches;
const versions = () => desk.snippets[0].lineage?.versions ?? [];

/** Clicks a note in the roll (select), leaving it as the only selected note. */
function selectNote(roll: HTMLElement, title: RegExp, x: number, midi: number) {
  fireEvent.pointerDown(screen.getByTitle(title), {
    clientX: x,
    clientY: rowY(midi),
    pointerId: 1,
  });
  fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
}

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  failing.commits = false;
});

describe('the clip actions panel', () => {
  it('shows the Actions group with every control and an accessible name', async () => {
    await open(oldClip());
    const group = screen.getByRole('group', { name: 'Clip actions' });
    for (const name of [
      'Scale by 2',
      'Scale by one half',
      'Apply scale',
      'Reverse in time',
      'Reverse order',
      'Rotate values',
      'Rotate in time',
      'Legato',
      'Quantize',
      'Duplicate selection',
      'Transpose by semitones',
      'Octave down',
      'Octave up',
    ]) {
      expect(within(group).getByRole('button', { name })).toBeEnabled();
    }
    for (const name of ['Scale factor', 'Rotate amount', 'Transpose semitones']) {
      expect(within(group).getByRole('textbox', { name })).toBeEnabled();
    }
    expect(within(group).getByText('Acts on the whole clip.')).toBeInTheDocument();
  });

  it('is disabled for a clip that is not a note clip', async () => {
    const other: Snippet = { ...oldClip(), packet: packet('list', 'pitch', []) };
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Harness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addSnippet(other);
    });
    const group = await screen.findByRole('group', { name: 'Clip actions' });
    for (const control of within(group).getAllByRole('button')) {
      expect(control).toBeDisabled();
    }
    await userEvent.click(within(group).getByRole('button', { name: 'Legato' }));
    expect(desk.snippets[0].lineage).toBeUndefined();
  });

  it('is disabled for a cyclic note packet', async () => {
    const seed = oldClip();
    const cyclic: Snippet = {
      ...seed,
      packet: { ...seed.packet, frame: { ...seed.packet.frame!, topology: 'cyclic' } },
    };
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Harness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addSnippet(cyclic);
    });
    const group = await screen.findByRole('group', { name: 'Clip actions' });
    for (const control of within(group).getAllByRole('button')) {
      expect(control).toBeDisabled();
    }
    await userEvent.click(within(group).getByRole('button', { name: 'Legato' }));
    expect(desk.snippets[0].lineage).toBeUndefined();
  });

  it('acts on the selected notes, keeps the selection, and is its own version and one undo step', async () => {
    const roll = await open(oldClip());
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.getByText('Acts on 1 selected note.')).toBeInTheDocument();

    await userEvent.click(button('Octave up'));

    expect(pitchOf('n2')).toEqual([7600]);
    expect(pitchOf('n1')).toEqual([6000]);
    expect(pitchOf('n3')).toEqual([6700]);
    // Still selected (the same note, now an octave up), and the roll kept it.
    expect(roll).toHaveAccessibleName(/1 selected/);
    // Root + exactly one edit, committed under its own operation (not a hand edit); the freeze of
    // the old clip's properties rode in the same version.
    expect(versions().map((version) => version.operation)).toEqual([
      'original',
      'transform-transpose',
    ]);
    expect(desk.snippets[0].packet.metadata?.clip).toBeDefined();
    act(() => undo());
    expect(desk.snippets[0].packet).toEqual(oldClip().packet);
    expect(pitchOf('n2')).toEqual([6400]);
  });

  it('with nothing selected acts on the whole clip', async () => {
    await open(oldClip());
    await userEvent.click(button('Octave down'));
    expect(['n1', 'n2', 'n3'].map(pitchOf)).toEqual([[4800], [5200], [5500]]);
  });

  it('never steals the selection or focus: a press on a button is default-prevented', async () => {
    const roll = await open(oldClip());
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    for (const name of ['Octave up', 'Legato', 'Apply scale', 'Reverse in time']) {
      expect(fireEvent.mouseDown(button(name))).toBe(false);
    }
    // The mode toggle too; text fields keep their normal focus behaviour.
    expect(fireEvent.mouseDown(screen.getByText('Individually'))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('textbox', { name: 'Scale factor' }))).toBe(true);
    expect(roll).toHaveAccessibleName(/1 selected/);
    // Typing in a field and applying keeps the selection as well.
    const factor = screen.getByRole('textbox', { name: 'Scale factor' });
    await userEvent.clear(factor);
    await userEvent.type(factor, '3/2');
    await userEvent.click(button('Apply scale'));
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(noteValue('n2').duration.quarterNotes).toEqual({ numerator: 3, denominator: 2 });
    expect(noteValue('n1').duration.quarterNotes).toEqual({ numerator: 1, denominator: 1 });
  });

  it('each transform is one version and one undo step', async () => {
    await open(oldClip());
    const clicks: [string, string][] = [
      ['Scale by 2', 'transform-scale'],
      ['Reverse in time', 'transform-reverse-time'],
      ['Reverse order', 'transform-reverse-order'],
      ['Rotate values', 'transform-rotate-values'],
      ['Rotate in time', 'transform-rotate-time'],
      ['Legato', 'transform-legato'],
      ['Octave up', 'transform-transpose'],
      ['Duplicate selection', 'transform-duplicate'],
    ];
    let before = versions().length;
    for (const [name, operation] of clicks) {
      await userEvent.click(button(name));
      const after = versions();
      // The first edit also writes the root; afterwards exactly one version per click.
      expect(after.length).toBe(before === 0 ? 2 : before + 1);
      expect(after[after.length - 1].operation).toBe(operation);
      expect(after.filter((version) => version.operation === 'edit-notes')).toHaveLength(0);
      before = after.length;
    }
    // Undo walks them back one at a time.
    const heads: string[] = [];
    for (let step = 0; step < clicks.length; step += 1) {
      heads.push(desk.snippets[0].lineage!.head);
      act(() => undo());
    }
    expect(new Set(heads).size).toBe(clicks.length);
    expect(items().map((item) => item.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('quantize uses the editor grid, and a time selection acts on the notes it overlaps', async () => {
    const roll = await open(
      oldClip([seedNote('n1', 0.4, 6000), seedNote('n2', 2.4, 6400), seedNote('n3', 4.4, 6700)])
    );
    // A marquee from 2.2 to 3.1 quarters, above the notes: a time selection overlapping only n2.
    fireEvent.pointerDown(roll, { clientX: 140, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 200, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 200, clientY: 30, pointerId: 1 });
    const band = screen.getByTestId('roll-range');
    const left = band.style.left;
    expect(screen.getByText('Acts on the selected time.')).toBeInTheDocument();
    await userEvent.click(button('Quantize'));
    const onset = (id: string) =>
      noteValue(id).onset.quarterNotes.numerator / noteValue(id).onset.quarterNotes.denominator;
    // Auto grid is a sixteenth: 2.4 -> 2.5; the notes outside the span stay.
    expect(onset('n2')).toBe(2.5);
    expect(onset('n1')).toBe(0.4);
    expect(onset('n3')).toBe(4.4);
    // The band did not move.
    expect(screen.getByTestId('roll-range').style.left).toBe(left);
    expect(versions().at(-1)?.operation).toBe('transform-quantize');
  });

  it('duplicate selects the copies (the roll shows them selected) and the originals are untouched', async () => {
    const roll = await open(oldClip());
    selectNote(roll, /^C4 · 0\.000 qn/, 20, 60);
    await userEvent.click(button('Duplicate selection'));
    expect(items()).toHaveLength(4);
    expect(
      items()
        .slice(0, 3)
        .map((item) => item.id)
    ).toEqual(['n1', 'n2', 'n3']);
    const copy = items()[3];
    expect(copy.id).not.toBe('n1');
    expect(roll).toHaveAccessibleName(/1 selected/);
    expect(screen.getByText('Acts on 1 selected note.')).toBeInTheDocument();
    // The copy sits directly after the original (n1 spans 0..1).
    expect((copy.value as NoteEventValue).onset.quarterNotes).toEqual({
      numerator: 1,
      denominator: 1,
    });
    // The next action acts on the copy, not on the original.
    await userEvent.click(button('Octave up'));
    expect(pitchOf('n1')).toEqual([6000]);
    expect(pitchOf(copy.id)).toEqual([7200]);
  });

  it('shows a refusal in the panel, writes nothing and keeps the selection', async () => {
    const roll = await open(oldClip([seedNote('low', 0, 1100), seedNote('n2', 2, 6400)]));
    const changes = historyChangeCount();
    await userEvent.click(button('Octave down'));
    expect(screen.getByRole('alert')).toHaveTextContent(/off the keyboard/);
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect(pitchOf('low')).toEqual([1100]);
    expect(historyChangeCount()).toBe(changes);
    // A scale that would break the minimum length, and bad typed input, are refused the same way.
    const factor = screen.getByRole('textbox', { name: 'Scale factor' });
    await userEvent.clear(factor);
    await userEvent.type(factor, '1/32768');
    await userEvent.click(button('Apply scale'));
    expect(screen.getByRole('alert')).toHaveTextContent(/minimum note length/);
    await userEvent.clear(factor);
    await userEvent.type(factor, 'nonsense');
    await userEvent.click(button('Apply scale'));
    expect(screen.getByRole('alert')).toHaveTextContent(/scale factor/);
    expect(desk.snippets[0].lineage).toBeUndefined();
    // A later success clears the message.
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    await userEvent.click(button('Octave down'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(pitchOf('n2')).toEqual([5200]);
  });

  it('huge typed factors are refused in the panel, never thrown', async () => {
    await open(oldClip());
    const factor = screen.getByRole('textbox', { name: 'Scale factor' });
    for (const huge of ['1e20', '99999999999999999999', '99999999999999999999/3']) {
      await userEvent.clear(factor);
      await userEvent.type(factor, huge);
      await userEvent.click(button('Apply scale'));
      expect(screen.getByRole('alert')).toHaveTextContent(/between 1\/32768 and 32768/);
    }
    expect(desk.snippets[0].lineage).toBeUndefined();
  });

  it('clears its notice when the editor selection changes', async () => {
    const roll = await open(oldClip([seedNote('low', 0, 1100), seedNote('n2', 2, 6400)]));
    await userEvent.click(button('Octave down'));
    expect(screen.getByRole('alert')).toHaveTextContent(/off the keyboard/);
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the editor publishes the effective snap unit for Auto, and quantize follows it', async () => {
    await open(oldClip([seedNote('n1', 0.1, 6000), seedNote('n2', 2.4, 6400)]));
    const snap = readNoteEditor('old')!.snapUnit;
    expect(readNoteEditor('old')!.gridUnit).toBeUndefined();
    expect([0.125, 0.25, 0.5, 1]).toContain(snap);
    await userEvent.click(button('Quantize'));
    const onset = (id: string) =>
      noteValue(id).onset.quarterNotes.numerator / noteValue(id).onset.quarterNotes.denominator;
    expect(onset('n2') / snap).toBeCloseTo(Math.round(onset('n2') / snap), 9);
    expect(onset('n1') / snap).toBeCloseTo(Math.round(onset('n1') / snap), 9);
  });

  it('rotate in time wraps in the same span on every press (note selection and nothing selected)', async () => {
    // One selected note: its own span [4, 5) is kept, so presses keep wrapping inside it.
    const roll = await open(oldClip([seedNote('n1', 0, 6000), seedNote('n3', 4, 6700)]));
    const snap = readNoteEditor('old')!.snapUnit;
    selectNote(roll, /^G4 · 4\.000 qn/, 260, 67);
    const startOf = (id: string) =>
      noteValue(id).onset.quarterNotes.numerator / noteValue(id).onset.quarterNotes.denominator;
    for (let press = 1; press <= 6; press += 1) {
      await userEvent.click(button('Rotate in time'));
      expect(startOf('n3')).toBeCloseTo(4 + ((press * snap) % 1), 9);
    }
    expect(roll).toHaveAccessibleName(/1 selected/);
  });

  it('rotate in time with nothing selected wraps at the clip length and returns after a full cycle', async () => {
    await open(oldClip([seedNote('n1', 0, 6000), seedNote('n3', 7, 6700, 1)]));
    const snap = readNoteEditor('old')!.snapUnit;
    const startOf = (id: string) =>
      noteValue(id).onset.quarterNotes.numerator / noteValue(id).onset.quarterNotes.denominator;
    const amount = screen.getByRole('textbox', { name: 'Rotate amount' });
    await userEvent.clear(amount);
    await userEvent.type(amount, String(Math.round(8 / snap / 4)));
    for (let press = 1; press <= 4; press += 1) {
      await userEvent.click(button('Rotate in time'));
      expect(startOf('n3')).toBeCloseTo((7 + press * 2) % 8, 9);
    }
    expect(startOf('n3')).toBeCloseTo(7, 9);
    expect(startOf('n1')).toBeCloseTo(0, 9);
  });

  it('a transform that changes nothing says so and writes nothing', async () => {
    await open(oldClip([seedNote('n1', 0, 6000)]));
    await userEvent.click(button('Legato'));
    expect(screen.getByText('Nothing to change.')).toBeInTheDocument();
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect(desk.snippets[0].packet.metadata?.clip).toBeUndefined();
  });

  it('shows the desk error when the commit itself fails, and changes nothing', async () => {
    await open(oldClip());
    failing.commits = true;
    await userEvent.click(button('Octave up'));
    expect(screen.getByRole('alert')).toHaveTextContent('The desk refused that edit.');
    expect(pitchOf('n1')).toEqual([6000]);
  });
});

describe('carry-over: a failed ramp commit is not kept', () => {
  async function paint() {
    // Tool > Paint, then drag a ramp across the two heads in the lane (the track has no layout in
    // jsdom, so x is the time in pixels at 64 px per quarter and y is measured from the lane top).
    await userEvent.click(screen.getByRole('button', { name: /^Tool:/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Paint/ }));
    const track = screen.getByRole('group', { name: 'Velocity lane' });
    fireEvent.pointerDown(track, { clientX: 2, clientY: 2, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 135, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 135, clientY: 40, pointerId: 1 });
    return track;
  }

  it('keeps the ramp as a secondary selection when the commit lands', async () => {
    await open(oldClip([seedNote('n1', 0, 6000), seedNote('n2', 2, 6400)]));
    await paint();
    expect(versions().at(-1)?.operation).toBe('edit-notes');
    expect(screen.queryByTestId('velocity-ramp')).not.toBeNull();
  });

  it('stores no ramp when the commit failed', async () => {
    await open(oldClip([seedNote('n1', 0, 6000), seedNote('n2', 2, 6400)]));
    failing.commits = true;
    await paint();
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect(screen.queryByTestId('velocity-ramp')).toBeNull();
  });
});

describe('the panel as a standalone component', () => {
  it('renders nothing selected-specific without an editor and still runs on the whole clip', async () => {
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Standalone />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addSnippet(oldClip());
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Octave up' }));
    expect(['n1', 'n2', 'n3'].map(pitchOf)).toEqual([[7200], [7600], [7900]]);
    expect(versions().at(-1)?.operation).toBe('transform-transpose');
  });
});

function Standalone() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return clip ? <ClipActionsPanel snippet={clip} /> : null;
}

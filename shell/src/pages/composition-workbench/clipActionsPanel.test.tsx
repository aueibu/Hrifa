import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeClipProperties } from './clipProperties';
import { ClipActionsPanel } from './components/ClipActionsPanel';
import { CompositionInspector } from './components/CompositionInspector';
import { NoteClipEditor } from './components/NoteClipEditor';
import { CompositionSettingsProvider } from './compositionSettings';
import { DeskProvider, useDesk } from './desk';
import { historyChangeCount, redo, resetHistory, undo } from './history';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition, rationalFromNumber } from './musicalTime';
import { clearNoteClipboard } from './noteClipboard';
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
      interOnset: { quarterNotes: rationalFromNumber(length) },
      duration: { quarterNotes: rationalFromNumber(length) },
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
  clearNoteClipboard();
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
    // Every action button is disabled (the section headers are not actions and stay usable).
    for (const control of within(group).getAllByRole('button')) {
      if (control.hasAttribute('aria-expanded')) {
        continue;
      }
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
    // Every action button is disabled (the section headers are not actions and stay usable).
    for (const control of within(group).getAllByRole('button')) {
      if (control.hasAttribute('aria-expanded')) {
        continue;
      }
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

describe('the selection after a transform is exactly the transformed notes (chord slots)', () => {
  // Two chord slots of single-pitch notes: three at 0 (C4 E4 G4), two at 2 (D4 F4).
  const chords = () => [
    seedNote('p1', 0, 6000),
    seedNote('p2', 0, 6400),
    seedNote('p3', 0, 6700),
    seedNote('r1', 2, 6200),
    seedNote('r2', 2, 6500),
  ];

  /** Opens the chord clip with all five notes selected (click one, shift-click the rest). */
  async function openSelected() {
    const roll = await open(oldClip(chords()));
    const picks: [RegExp, number, number][] = [
      [/^C4 · 0\.000 qn/, 20, 60],
      [/^E4 · 0\.000 qn/, 20, 64],
      [/^G4 · 0\.000 qn/, 20, 67],
      [/^D4 · 2\.000 qn/, 140, 62],
      [/^F4 · 2\.000 qn/, 140, 65],
    ];
    picks.forEach(([title, x, midi], index) => {
      fireEvent.pointerDown(screen.getByTitle(title), {
        clientX: x,
        clientY: rowY(midi),
        pointerId: 1,
        shiftKey: index > 0,
      });
      fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
    });
    expect(roll).toHaveAccessibleName(/, 5 selected/);
    return roll;
  }

  const selectedIds = () => [...readNoteEditor('old')!.selection.ids].sort();
  const allIds = () =>
    items()
      .map((item) => item.id)
      .sort();

  it.each([
    'Reverse order',
    'Rotate values',
    'Rotate durations',
    'Rotate in time',
    'Legato',
    'Quantize',
    'Octave up',
    'Scale by 2',
    'Make all durations equal',
    'Make all velocities equal',
  ])('%s leaves every resulting note selected, none dropped', async (name) => {
    const roll = await openSelected();
    await userEvent.click(button(name));
    // Every item in this clip was a target, so the selection is every item now there (kept ids, ids a
    // rebuilt slot created, the wrapped pieces of a rotation), and the roll shows that many selected.
    expect(selectedIds()).toEqual(allIds());
    expect(roll).toHaveAccessibleName(new RegExp(`, ${items().length} selected`));
    expect(items().length).toBeGreaterThanOrEqual(5);
  });

  it('Make all pitches equal keeps the whole selection too', async () => {
    const roll = await openSelected();
    await userEvent.click(button('Make all pitches equal'));
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(70), pointerId: 1 });
    // Notes of one onset that now share a pitch are one note (no duplicates): five became two, the
    // selection is the survivors.
    expect(selectedIds()).toEqual(allIds());
    expect(items().map((item) => pitchOf(item.id))).toEqual(Array(2).fill([7000]));
  });

  it('reverse order across unequal slots keeps every note: ids created are added, none lost', async () => {
    await openSelected();
    await userEvent.click(button('Reverse order'));
    // Slots of 3 and 2 swapped: the 3-slot became 2 notes and the 2-slot 3 (one new id).
    expect(items()).toHaveLength(5);
    expect(
      items().filter((item) => noteValue(item.id).onset.quarterNotes.numerator === 0)
    ).toHaveLength(2);
    expect(selectedIds()).toEqual(allIds());
    expect(selectedIds()).not.toContain('p3');
    // And no multi-pitch item was created.
    items().forEach((item) => expect(pitchOf(item.id)).toHaveLength(1));
  });

  it('Duplicate selects exactly the copies', async () => {
    await openSelected();
    await userEvent.click(button('Duplicate selection'));
    const originals = ['p1', 'p2', 'p3', 'r1', 'r2'];
    expect(items()).toHaveLength(10);
    expect(selectedIds()).toEqual(allIds().filter((id) => !originals.includes(id)));
    expect(selectedIds()).toHaveLength(5);
  });
});

describe('pick-pitch mode (Invert and Make all pitches equal)', () => {
  const banner = () => screen.queryByTestId('roll-pick-banner');

  /** Selects the E4 note only (the middle of the three). */
  async function openWithE4() {
    const roll = await open(oldClip());
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    return roll;
  }

  it('Invert enters the mode, a click on a pitch row sets the axis and applies, the selection is kept', async () => {
    const roll = await openWithE4();
    await userEvent.click(button('Invert'));
    expect(banner()).toHaveTextContent(/Click a pitch/);
    expect(roll).toHaveAttribute('data-picking');
    expect(screen.getByText('Pick a pitch in the roll.')).toBeInTheDocument();
    // Nothing is written until the pick.
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    // The row under the pointer is highlighted.
    fireEvent.pointerMove(roll, { clientX: 300, clientY: rowY(62), pointerId: 1 });
    expect(screen.getByTestId('roll-pick-row')).toHaveAttribute('data-midi', '62');
    // D4 (6200) is the axis: E4 (6400) mirrors to C4 (6000).
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(62), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 300, clientY: rowY(62), pointerId: 1 });
    expect(pitchOf('n2')).toEqual([6000]);
    expect(pitchOf('n1')).toEqual([6000]);
    expect(pitchOf('n3')).toEqual([6700]);
    expect(items()).toHaveLength(3);
    expect(banner()).toBeNull();
    // The pick click did not change the selection (still the one note) and is one undo step.
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(versions().map((version) => version.operation)).toEqual([
      'original',
      'transform-invert',
    ]);
    act(() => undo());
    expect(pitchOf('n2')).toEqual([6400]);
  });

  it('a press on a note or on a key is a pick too, not a selection or a draw', async () => {
    const roll = await openWithE4();
    await userEvent.click(button('Invert'));
    // Press on the C4 note: the axis is C4 (6000), the selection stays on E4, nothing is added.
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 1,
    });
    expect(pitchOf('n2')).toEqual([5600]);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(items()).toHaveLength(3);
    // The keys gutter: a second pick on key 62 (D4) as the axis; E4 is now 5600 -> 6800.
    await userEvent.click(button('Invert'));
    const key = document.querySelector('[data-midi="62"]') as HTMLElement;
    fireEvent.pointerDown(key, { clientX: 5, clientY: 5, pointerId: 1 });
    expect(pitchOf('n2')).toEqual([6800]);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
  });

  it('presses on the velocity lane and the ruler while a pick waits are swallowed: selection and pick stay', async () => {
    const roll = await openWithE4();
    await userEvent.click(button('Invert'));
    const lane = screen.getByRole('group', { name: 'Velocity lane' });
    fireEvent.pointerDown(lane, { clientX: 400, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(lane, { clientX: 400, clientY: 10, pointerId: 1 });
    const ruler = screen.getByTestId('roll-ruler');
    fireEvent.pointerDown(ruler, { clientX: 400, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 400, clientY: 5, pointerId: 1 });
    expect(banner()).toBeInTheDocument();
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect(pitchOf('n2')).toEqual([6400]);
  });

  it('Escape cancels with no edit, keeps the selection and the mode ends', async () => {
    const roll = await openWithE4();
    await userEvent.click(button('Invert'));
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(banner()).toBeNull();
    expect(roll).not.toHaveAttribute('data-picking');
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(desk.snippets[0].lineage).toBeUndefined();
    // A later click on the roll is an ordinary click again (it clears the selection).
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(80), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(80), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/, 0 selected/);
  });

  it('Enter applies the default axis (the middle of the notes)', async () => {
    const roll = await open(oldClip());
    await userEvent.click(button('Invert'));
    fireEvent.keyDown(roll, { key: 'Enter' });
    // C4 6000, E4 6400, G4 6700: the middle 6350 swaps C4 and G4 and sends E4 to 6300.
    expect(['n1', 'n2', 'n3'].map(pitchOf)).toEqual([[6700], [6300], [6000]]);
    expect(banner()).toBeNull();
    expect(versions().map((version) => version.operation)).toEqual([
      'original',
      'transform-invert',
    ]);
  });

  it('Enter during a pick is ignored from an unrelated control outside the editor and panel', async () => {
    const roll = await open(oldClip());
    await userEvent.click(button('Invert'));
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      fireEvent.keyDown(outside, { key: 'Enter' });
      expect(banner()).not.toBeNull();
      expect(['n1', 'n2', 'n3'].map(pitchOf)).toEqual([[6000], [6400], [6700]]);
      // From the panel's own button the default still applies.
      fireEvent.keyDown(button('Cancel pick'), { key: 'Enter' });
      expect(banner()).toBeNull();
      expect(['n1', 'n2', 'n3'].map(pitchOf)).toEqual([[6700], [6300], [6000]]);
    } finally {
      outside.remove();
    }
    expect(roll).toBeInTheDocument();
  });

  it('switching the tool cancels the pick without an edit', async () => {
    const roll = await openWithE4();
    await userEvent.click(button('Invert'));
    await userEvent.click(screen.getByRole('button', { name: /^Tool:/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Time/ }));
    expect(banner()).toBeNull();
    expect(roll).not.toHaveAttribute('data-picking');
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect(readNoteEditor('old')!.picking).toBeNull();
  });

  it('the panel Cancel button and another action both end a waiting pick', async () => {
    await openWithE4();
    await userEvent.click(button('Invert'));
    await userEvent.click(button('Cancel pick'));
    expect(banner()).toBeNull();
    await userEvent.click(button('Invert'));
    await userEvent.click(button('Octave up'));
    expect(banner()).toBeNull();
    expect(pitchOf('n2')).toEqual([7600]);
  });

  it('Make all pitches equal: pick a row; Escape cancels with no edit', async () => {
    const roll = await openWithE4();
    await userEvent.click(button('Make all pitches equal'));
    expect(banner()).toHaveTextContent(/every note that pitch/);
    // Enter has no default here: it changes nothing and the mode stays.
    fireEvent.keyDown(roll, { key: 'Enter' });
    expect(banner()).not.toBeNull();
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(banner()).toBeNull();
    expect(desk.snippets[0].lineage).toBeUndefined();
    await userEvent.click(button('Make all pitches equal'));
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(72), pointerId: 1 });
    expect(pitchOf('n2')).toEqual([7200]);
    expect(pitchOf('n1')).toEqual([6000]);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(versions().at(-1)?.operation).toBe('transform-equal-pitch');
  });

  it('the typed Make all equal controls apply duration and velocity as their own versions', async () => {
    await open(oldClip([seedNote('n1', 0, 6000, 1, 0.4), seedNote('n2', 2, 6400, 2, 0.9)]));
    const length = screen.getByRole('textbox', { name: 'Equal duration' });
    await userEvent.type(length, '1/8');
    await userEvent.click(button('Make all durations equal'));
    expect(noteValue('n1').duration.quarterNotes).toEqual({ numerator: 1, denominator: 2 });
    expect(noteValue('n2').duration.quarterNotes).toEqual({ numerator: 1, denominator: 2 });
    expect(versions().at(-1)?.operation).toBe('transform-equal-duration');
    const velocity = screen.getByRole('textbox', { name: 'Equal velocity' });
    await userEvent.type(velocity, '60%');
    await userEvent.click(button('Make all velocities equal'));
    expect(noteValue('n1').velocity).toBe(0.6);
    expect(noteValue('n2').velocity).toBe(0.6);
    expect(versions().at(-1)?.operation).toBe('transform-equal-velocity');
    // Blank means the first note's: a refusal message for nonsense, nothing written.
    const count = versions().length;
    await userEvent.type(length, 'abc');
    await userEvent.click(button('Make all durations equal'));
    expect(screen.getByRole('alert')).toHaveTextContent(/quarter notes/);
    expect(versions()).toHaveLength(count);
  });
});

describe('the end-to-end path of every existing action button (real editor, real panel)', () => {
  it.each([
    ['Scale by 2', 'transform-scale'],
    ['Reverse in time', 'transform-reverse-time'],
    ['Reverse order', 'transform-reverse-order'],
    ['Rotate values', 'transform-rotate-values'],
    ['Rotate durations', 'transform-rotate-durations'],
    ['Rotate in time', 'transform-rotate-time'],
    ['Legato', 'transform-legato'],
    ['Octave up', 'transform-transpose'],
    ['Quantize', 'transform-quantize'],
    ['Duplicate selection', 'transform-duplicate'],
    ['Invert', 'transform-invert'],
  ])('%s changes the packet, is one version and one undo step', async (name, operation) => {
    const roll = await open(
      oldClip([
        seedNote('n1', 0.1, 6000, 0.5),
        seedNote('n2', 2.2, 6400),
        seedNote('n3', 4.3, 6700, 2),
      ])
    );
    selectNote(roll, /^E4 · 2\.200 qn/, 160, 64);
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.100 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 1 });
    const before = desk.snippets[0].packet;
    await userEvent.click(button(name));
    if (name === 'Invert') {
      fireEvent.keyDown(roll, { key: 'Enter' });
    }
    const after = desk.snippets[0].packet;
    expect(after.items).not.toEqual(before.items);
    expect(versions().map((version) => version.operation)).toEqual(['original', operation]);
    act(() => undo());
    expect(desk.snippets[0].packet).toEqual(before);
  });
});

describe('the rotation session through the real editor and panel', () => {
  const frozenAqhae = () => {
    const seed = oldClip();
    const held = freezeClipProperties(seed.packet);
    return {
      ...seed,
      packet: {
        ...held,
        items: [seedNote('q', 0, 6900, 1), seedNote('h', 1, 6900, 2), seedNote('e', 3, 6900, 0.5)],
      },
    } as Snippet;
  };
  const sound = () =>
    items().reduce((sum, item) => {
      const duration = noteValue(item.id).duration.quarterNotes;
      return sum + duration.numerator / duration.denominator;
    }, 0);

  async function openSelectedAqhae() {
    const roll = await open(frozenAqhae());
    const picks: [RegExp, number, number][] = [
      [/^A4 · 0\.000 qn/, 20, 69],
      [/^A4 · 1\.000 qn/, 80, 69],
      [/^A4 · 3\.000 qn/, 210, 69],
    ];
    picks.forEach(([title, x, midi], index) => {
      fireEvent.pointerDown(screen.getByTitle(title), {
        clientX: x,
        clientY: rowY(midi),
        pointerId: 1,
        shiftKey: index > 0,
      });
      fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
    });
    expect(roll).toHaveAccessibleName(/, 3 selected/);
    const snap = readNoteEditor('old')!.snapUnit;
    const amount = screen.getByRole('textbox', { name: 'Rotate amount' });
    await userEvent.clear(amount);
    // Half a quarter per press, whatever the grid is.
    await userEvent.type(amount, String(Math.round(0.5 / snap)));
    return roll;
  }

  it('splits and rejoins across presses and a full cycle restores the original notes', async () => {
    const roll = await openSelectedAqhae();
    const originals = items();
    const counts: number[] = [];
    for (let press = 0; press < 7; press += 1) {
      await userEvent.click(button('Rotate in time'));
      counts.push(items().length);
      expect(sound()).toBe(3.5);
      expect(selectedIdsOf()).toEqual(allIdsOf());
    }
    expect(counts).toEqual([3, 4, 4, 4, 3, 4, 3]);
    expect(items().map((item) => item.id)).toEqual(['q', 'h', 'e']);
    expect(roll).toHaveAccessibleName(/, 3 selected/);
    // Same values as at the start (provenance is stamped by each commit).
    expect(items().map((item) => item.value)).toEqual(originals.map((item) => item.value));
    // Each press was its own version and its own undo step.
    expect(
      versions().filter((version) => version.operation === 'transform-rotate-time')
    ).toHaveLength(7);
  });

  it('rotating back by the same total restores the notes, with the same ids', async () => {
    await openSelectedAqhae();
    const originals = items();
    for (let press = 0; press < 3; press += 1) {
      await userEvent.click(button('Rotate in time'));
    }
    expect(items()).toHaveLength(4);
    const amount = screen.getByRole('textbox', { name: 'Rotate amount' });
    await userEvent.clear(amount);
    await userEvent.type(amount, String(-Math.round(0.5 / readNoteEditor('old')!.snapUnit)));
    for (let press = 0; press < 3; press += 1) {
      await userEvent.click(button('Rotate in time'));
    }
    expect(items().map((item) => item.id)).toEqual(['q', 'h', 'e']);
    expect(items().map((item) => item.value)).toEqual(originals.map((item) => item.value));
  });

  it('another edit ends the session: the pieces stay separate notes', async () => {
    await openSelectedAqhae();
    for (let press = 0; press < 3; press += 1) {
      await userEvent.click(button('Rotate in time'));
    }
    expect(items()).toHaveLength(4);
    await userEvent.click(button('Octave up'));
    for (let press = 0; press < 4; press += 1) {
      await userEvent.click(button('Rotate in time'));
    }
    // With the session the 4th press after press 3 would have rejoined h; it never does now.
    expect(items().length).toBeGreaterThanOrEqual(4);
    expect(sound()).toBe(3.5);
  });

  it('undo then redo of a press ends the session (and an untouched run keeps it)', async () => {
    await openSelectedAqhae();
    for (let press = 0; press < 2; press += 1) {
      await userEvent.click(button('Rotate in time'));
    }
    expect(items()).toHaveLength(4);
    act(() => undo());
    expect(items()).toHaveLength(3);
    act(() => redo());
    expect(items()).toHaveLength(4);
    for (let press = 0; press < 3; press += 1) {
      await userEvent.click(button('Rotate in time'));
    }
    // Five presses in all: an unbroken session would show the rejoined 3 notes here.
    expect(items().length).toBeGreaterThanOrEqual(4);
    expect(sound()).toBe(3.5);
  });
});

const selectedIdsOf = () => [...readNoteEditor('old')!.selection.ids].sort();
const allIdsOf = () =>
  items()
    .map((item) => item.id)
    .sort();

/** Two clips on the desk, one open at a time, to cross the clipboard and the pick between them. */
function TwoClips() {
  desk = useDesk();
  const [active, setActive] = useState('old');
  const clip = desk.snippets.find((entry) => entry.id === active);
  return (
    <>
      <button type="button" onClick={() => setActive('two')}>
        Show second
      </button>
      <button type="button" onClick={() => setActive('old')}>
        Show first
      </button>
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

describe('copy and paste across clips', () => {
  const second = () =>
    ({ ...oldClip([seedNote('m1', 1, 7200, 1, 0.3)]), id: 'two', name: 'two' }) as Snippet;
  const clipOf = (id: string) => desk.snippets.find((entry) => entry.id === id)!;
  const itemsOf = (id: string) => clipOf(id).packet.items;

  async function openTwo() {
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <TwoClips />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addSnippet(oldClip());
      desk.addSnippet(second());
    });
    return screen.findByRole('group', { name: /Note clip piano roll/ });
  }

  it('Ctrl+C then Ctrl+V crosses clips: relative layout, fresh ids, selected, one version and undo step', async () => {
    const roll = await openTwo();
    // Select n1 (C4 at 0) and n2 (E4 at 2) and copy.
    selectNote(roll, /^C4 · 0\.000 qn/, 20, 60);
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/, 2 selected/);
    const copyVersions = versions().length;
    fireEvent.keyDown(roll, { key: 'c', ctrlKey: true });
    expect(screen.getByText('Copied 2 notes.')).toBeInTheDocument();
    // Copy writes nothing.
    expect(versions()).toHaveLength(copyVersions);
    expect(clipOf('old').lineage).toBeUndefined();
    // The second clip: select its one note (at 1) and paste: the copy lands at that note's start.
    await userEvent.click(screen.getByRole('button', { name: 'Show second' }));
    const roll2 = await screen.findByRole('group', { name: /Note clip piano roll/ });
    selectNote(roll2, /^C5 · 1\.000 qn/, 80, 72);
    fireEvent.keyDown(roll2, { key: 'v', ctrlKey: true });
    const pasted = itemsOf('two').slice(1);
    expect(itemsOf('two')).toHaveLength(3);
    expect(pasted.map((entry) => entry.id)).not.toContain('n1');
    expect(new Set(itemsOf('two').map((entry) => entry.id)).size).toBe(3);
    const onsets = pasted.map((entry) => {
      const q = (entry.value as NoteEventValue).onset.quarterNotes;
      return q.numerator / q.denominator;
    });
    expect(onsets).toEqual([1, 3]);
    expect(pasted.map((entry) => (entry.value as NoteEventValue).pitches)).toEqual([
      [6000],
      [6400],
    ]);
    // The pasted notes are the selection; the original note is not.
    expect(roll2).toHaveAccessibleName(/, 2 selected/);
    expect([...readNoteEditor('two')!.selection.ids].sort()).toEqual(
      pasted.map((entry) => entry.id).sort()
    );
    const ops = clipOf('two').lineage!.versions.map((version) => version.operation);
    expect(ops).toEqual(['original', 'transform-paste']);
    act(() => undo());
    expect(itemsOf('two')).toHaveLength(1);
    // The first clip was never touched.
    expect(itemsOf('old')).toHaveLength(3);
  });

  it('the Copy and Paste buttons do the same; Paste is disabled until something was copied', async () => {
    const roll = await openTwo();
    expect(button('Paste notes')).toBeDisabled();
    // Nothing selected: Copy says so and writes nothing.
    await userEvent.click(button('Copy notes'));
    expect(screen.getByRole('alert')).toHaveTextContent('Select the notes to copy first.');
    expect(button('Paste notes')).toBeDisabled();
    selectNote(roll, /^G4 · 4\.000 qn/, 260, 67);
    await userEvent.click(button('Copy notes'));
    expect(screen.getByText('Copied 1 note.')).toBeInTheDocument();
    expect(button('Paste notes')).toBeEnabled();
    await userEvent.click(button('Paste notes'));
    // Pasted at the selected note's start (4) on the same pitch: that is the note already there, and
    // two notes of one onset and pitch are one note, so nothing changes and no version is made.
    expect(itemsOf('old')).toHaveLength(3);
    expect(screen.getByText('Those notes are already in the clip.')).toBeInTheDocument();
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(clipOf('old').lineage).toBeUndefined();
    // Select nothing: the paste lands at the clip start, a new note there (Cmd+V works too).
    fireEvent.keyDown(roll, { key: 'Escape' });
    fireEvent.keyDown(roll, { key: 'v', metaKey: true });
    expect(itemsOf('old')).toHaveLength(4);
    expect(clipOf('old').lineage!.versions.at(-1)?.operation).toBe('transform-paste');
  });

  it('is not taken while typing in a field, and plain or modified-by-shift keys are left alone', async () => {
    const roll = await openTwo();
    selectNote(roll, /^G4 · 4\.000 qn/, 260, 67);
    const field = screen.getByRole('textbox', { name: 'Scale factor' });
    fireEvent.keyDown(field, { key: 'c', ctrlKey: true });
    expect(screen.queryByText('Copied 1 note.')).toBeNull();
    fireEvent.keyDown(roll, { key: 'c' });
    fireEvent.keyDown(roll, { key: 'c', ctrlKey: true, shiftKey: true });
    expect(screen.queryByText('Copied 1 note.')).toBeNull();
    fireEvent.keyDown(roll, { key: 'c', ctrlKey: true });
    expect(screen.getByText('Copied 1 note.')).toBeInTheDocument();
    fireEvent.keyDown(field, { key: 'v', ctrlKey: true });
    expect(itemsOf('old')).toHaveLength(3);
  });

  it('a held Ctrl+V (auto-repeat) pastes once', async () => {
    const roll = await openTwo();
    selectNote(roll, /^G4 · 4\.000 qn/, 260, 67);
    fireEvent.keyDown(roll, { key: 'c', ctrlKey: true });
    // Nothing selected: the paste lands at the clip start (not on top of the copied note).
    fireEvent.keyDown(roll, { key: 'Escape' });
    fireEvent.keyDown(roll, { key: 'v', ctrlKey: true });
    expect(itemsOf('old')).toHaveLength(4);
    fireEvent.keyDown(roll, { key: 'v', ctrlKey: true, repeat: true });
    fireEvent.keyDown(roll, { key: 'v', ctrlKey: true, repeat: true });
    expect(itemsOf('old')).toHaveLength(4);
    expect(
      clipOf('old').lineage!.versions.filter((v) => v.operation === 'transform-paste')
    ).toHaveLength(1);
    // A fresh press pastes onto the pasted note's own start and pitch: merged into it, nothing new.
    fireEvent.keyDown(roll, { key: 'v', ctrlKey: true });
    expect(itemsOf('old')).toHaveLength(4);
  });

  it('pasting into an empty selection lands at the clip start; the clip length never grows', async () => {
    const roll = await openTwo();
    selectNote(roll, /^G4 · 4\.000 qn/, 260, 67);
    fireEvent.keyDown(roll, { key: 'c', ctrlKey: true });
    await userEvent.click(screen.getByRole('button', { name: 'Show second' }));
    const roll2 = await screen.findByRole('group', { name: /Note clip piano roll/ });
    // A click on empty space clears the selection.
    fireEvent.pointerDown(roll2, { clientX: 400, clientY: rowY(100), pointerId: 1 });
    fireEvent.pointerUp(roll2, { clientX: 400, clientY: rowY(100), pointerId: 1 });
    const before = clipOf('two').packet;
    fireEvent.keyDown(roll2, { key: 'v', ctrlKey: true });
    const added = itemsOf('two')[1].value as NoteEventValue;
    expect(added.onset.quarterNotes).toEqual({ numerator: 0, denominator: 1 });
    expect(clipOf('two').packet.frame).toEqual(before.frame);
  });

  it('switching clips cancels a waiting pick', async () => {
    const roll = await openTwo();
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    await userEvent.click(button('Invert'));
    expect(screen.getByTestId('roll-pick-banner')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show second' }));
    await screen.findByRole('group', { name: /Note clip piano roll/ });
    expect(screen.queryByTestId('roll-pick-banner')).toBeNull();
    expect(readNoteEditor('two')!.picking).toBeNull();
    expect(clipOf('old').lineage).toBeUndefined();
  });
});

describe('the actions panel sections', () => {
  const header = (name: string) => screen.getByRole('button', { name });

  it('groups the controls into Time, Pitch, Values and Clipboard, all open at first', async () => {
    await open(oldClip());
    const group = screen.getByRole('group', { name: 'Clip actions' });
    for (const name of ['Time', 'Pitch', 'Values', 'Clipboard']) {
      expect(within(group).getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true');
    }
    // Every action is reachable under its section.
    const section = (id: string) => group.querySelector(`[data-section="${id}"]`) as HTMLElement;
    for (const name of ['Scale by 2', 'Reverse in time', 'Rotate values', 'Legato', 'Quantize']) {
      expect(within(section('time')).getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Octave up', 'Invert', 'Make all pitches equal']) {
      expect(within(section('pitch')).getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Make all durations equal', 'Make all velocities equal']) {
      expect(within(section('values')).getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Duplicate selection', 'Copy notes', 'Paste notes']) {
      expect(within(section('clipboard')).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('collapses sections independently (several open at once) and remembers it per viewer', async () => {
    await open(oldClip());
    await userEvent.click(header('Time'));
    await userEvent.click(header('Values'));
    expect(header('Time')).toHaveAttribute('aria-expanded', 'false');
    expect(header('Pitch')).toHaveAttribute('aria-expanded', 'true');
    expect(header('Clipboard')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'Legato' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Octave up' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('hrifa.note-editor.v1') ?? '{}').actionSections).toEqual(
      ['pitch', 'clipboard']
    );
    // Never part of the history or a project: nothing was committed, and the key is outside the
    // workbench prefix.
    expect(desk.snippets[0].lineage).toBeUndefined();
    expect('hrifa.note-editor.v1'.startsWith('hrifa.composition-workbench.')).toBe(false);
    // Remembered: a fresh mount finds the same sections closed.
    cleanup();
    await open(oldClip());
    expect(header('Time')).toHaveAttribute('aria-expanded', 'false');
    expect(header('Pitch')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(header('Time'));
    expect(await screen.findByRole('button', { name: 'Legato' })).toBeInTheDocument();
  });

  it('pressing a header moves no focus and keeps the selection; actions still work one version each', async () => {
    const roll = await open(oldClip());
    selectNote(roll, /^E4 · 2\.000 qn/, 140, 64);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(fireEvent.mouseDown(header('Pitch'))).toBe(false);
    await userEvent.click(header('Pitch'));
    await userEvent.click(header('Pitch'));
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    expect(desk.snippets[0].lineage).toBeUndefined();
    await userEvent.click(button('Octave up'));
    expect(versions().map((version) => version.operation)).toEqual([
      'original',
      'transform-transpose',
    ]);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
  });
});

describe('same-pitch overlaps from the transforms', () => {
  const ops = () => versions().map((version) => version.operation);
  const lengthOf = (id: string) => {
    const duration = noteValue(id).duration.quarterNotes;
    return duration.numerator / duration.denominator;
  };

  it('transposing a note onto a shorter note of the same onset overwrites it, in one version and one undo step', async () => {
    const roll = await open(
      oldClip([
        seedNote('a', 0, 6000, 1, 0.4),
        seedNote('b', 0, 6100, 2, 0.9),
        seedNote('c', 4, 6700),
      ])
    );
    // b is the two-quarter note at 0: select it.
    fireEvent.pointerDown(screen.getByTitle(/ · 0\.000 qn · 2\.000 qn$/), {
      clientX: 60,
      clientY: rowY(61),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 60, clientY: rowY(61), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    const field = screen.getByRole('textbox', { name: 'Transpose semitones' });
    await userEvent.clear(field);
    await userEvent.type(field, '-1');
    await userEvent.click(button('Transpose by semitones'));
    // The transposed note (2 quarters) covers a (1 quarter) completely: a is gone, b stays as it is.
    expect(items().map((item) => item.id)).toEqual(['b', 'c']);
    expect(noteValue('b').velocity).toBe(0.9);
    expect(lengthOf('b')).toBe(2);
    expect(ops()).toEqual(['original', 'transform-transpose']);
    // The transposed note stays selected.
    expect([...readNoteEditor('old')!.selection.ids]).toEqual(['b']);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    act(() => undo());
    expect(items().map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('Duplicate onto a shorter note that is already there overwrites it, one step', async () => {
    const roll = await open(
      oldClip([seedNote('a', 0, 6000, 1), seedNote('b', 1, 6000, 0.5), seedNote('c', 4, 6700)])
    );
    selectNote(roll, /^C4 · 0\.000 qn · 1\.000 qn$/, 30, 60);
    expect(roll).toHaveAccessibleName(/, 1 selected/);
    await userEvent.click(button('Duplicate selection'));
    // The copy (1 to 2) covers the half-quarter note b (1 to 1.5) completely: b is gone.
    const copy = items().find((item) => !['a', 'b', 'c'].includes(item.id))!;
    expect(items().map((item) => item.id)).toEqual(['a', 'c', copy.id]);
    expect(ops()).toEqual(['original', 'transform-duplicate']);
    expect([...readNoteEditor('old')!.selection.ids]).toEqual([copy.id]);
  });
});

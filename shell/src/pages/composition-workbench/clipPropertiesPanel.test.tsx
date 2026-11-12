import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editClipProperties, readClipProperties, withClipProperties } from './clipProperties';
import { ClipPropertiesPanel } from './components/ClipPropertiesPanel';
import { CompositionInspector } from './components/CompositionInspector';
import { DeskView } from './components/DeskView';
import { NoteClipEditor } from './components/NoteClipEditor';
import { CompositionSettingsProvider, useCompositionSettings } from './compositionSettings';
import { DeskProvider, useDesk } from './desk';
import { getProject, listProjects } from './deskStore';
import { renderDesk, storedDesk } from './deskTestUtils';
import { canUndo, historyChangeCount, resetHistory, undo } from './history';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition, rational } from './musicalTime';
import { openProject, saveProject } from './projects';
import type { Snippet } from './snippet';
import { compositionStateKeys } from './usePersistentState';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    play: async () => undefined,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

/** The clip inspector as the workbench mounts it, for the clip the desk holds. */
function InspectorHarness() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return (
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
  );
}

let desk: ReturnType<typeof useDesk>;
let settings: ReturnType<typeof useCompositionSettings>;

function Harness() {
  desk = useDesk();
  settings = useCompositionSettings();
  const clip = desk.snippets[0];
  return (
    <>
      {clip && <NoteClipEditor snippet={clip} />}
      {clip && <ClipPropertiesPanel key={clip.id} snippet={clip} />}
      <DeskView onMakeSource={() => undefined} />
    </>
  );
}

function seedNote(id: string, start: number, midicents: number): DataItem {
  return {
    id,
    value: {
      onset: musicalPosition(start),
      interOnset: musicalDuration(1),
      duration: musicalDuration(1),
      pitches: [midicents],
      velocity: 1,
    },
    label: id,
    provenance: [],
  };
}

/** A clip as an earlier version of the app stored it: frame only, no clip properties. */
function legacyClip(id = 'old', extent = 8): Snippet {
  return {
    schemaVersion: 1,
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [seedNote('n1', 0, 6000), seedNote('n2', 2, 6400)]),
      frame: {
        topology: 'linear',
        unit: 'quarterNote',
        extent,
        origin: 0,
        musicalExtent: musicalDuration(extent),
        musicalOrigin: musicalPosition(0),
      },
    },
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

const inLoop = (element: HTMLElement) => element.closest('[aria-label="Loop"]') !== null;
/** A clip-level field (the loop's own Start and Length are `loopField`). */
const field = (name: RegExp | string) =>
  screen.getAllByRole('textbox', { name }).find((element) => !inLoop(element))!;
const loopField = (name: 'Start' | 'Length') =>
  within(screen.getByRole('group', { name: 'Loop' })).getByRole('textbox', {
    name: name === 'Start' ? 'Loop start' : 'Loop length',
  });
const looping = () => screen.getByRole('button', { name: 'Looping' });

async function enter(name: RegExp | string, text: string) {
  const input = field(name);
  await userEvent.clear(input);
  await userEvent.type(input, `${text}{Enter}`);
}

async function enterLoop(name: 'Start' | 'Length', text: string) {
  const input = loopField(name);
  await userEvent.clear(input);
  await userEvent.type(input, `${text}{Enter}`);
}

const current = () => readClipProperties(desk.snippets[0].packet);

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('the clip properties panel', () => {
  it('shows a blank clip with every property filled in', async () => {
    await open();
    expect(field(/^Length/)).toHaveValue('1.0.0');
    expect(field(/^Playback start/)).toHaveValue('1.1.0');
    expect(loopField('Start')).toHaveValue('1.1.0');
    expect(loopField('Length')).toHaveValue('1.0.0');
    expect(field(/^Time signature/)).toHaveValue('4/4');
    expect(looping()).toHaveAttribute('aria-pressed', 'true');
    expect(desk.snippets[0].packet.metadata?.clip).toBeDefined();
  });

  it('a new clip takes the project time signature and is one bar of it long', async () => {
    await open();
    act(() => settings.updateTransport({ meter: '7/8' }));
    await userEvent.click(screen.getByRole('button', { name: 'New clip' }));
    await waitFor(() => expect(desk.snippets).toHaveLength(2));
    const made = readClipProperties(desk.snippets[1].packet);
    expect(made.timeSignature).toBe('7/8');
    expect(made.length).toEqual(rational(7, 2));
    expect(made.loopEnd).toEqual(rational(7, 2));
  });

  it('every field edits through bars.beats.ticks, each edit its own version and one undo step', async () => {
    await open(legacyClip());
    // Old clip: defaults on read, the frame's 8 quarters kept.
    expect(current()).toMatchObject({ length: rational(8), loopOn: true, timeSignature: '4/4' });
    expect(field(/^Length/)).toHaveValue('2.0.0');
    expect(desk.snippets[0].lineage).toBeUndefined();

    await enter(/^Length/, '3.0.0');
    expect(current().length).toEqual(rational(12));
    expect(desk.snippets[0].packet.frame).toMatchObject({ extent: 12 });
    expect(desk.snippets[0].lineage!.versions).toHaveLength(2);

    await enter(/^Playback start/, '1.2.480');
    expect(current().start).toEqual(rational(3, 2));
    await enterLoop('Start', '2.1.0');
    await enterLoop('Length', '0.2.0');
    expect(current()).toMatchObject({ loopStart: rational(4), loopEnd: rational(6) });
    await userEvent.click(looping());
    expect(current().loopOn).toBe(false);
    await enter(/^Time signature/, '7/8');
    expect(current().timeSignature).toBe('7/8');

    const lineage = desk.snippets[0].lineage!;
    expect(lineage.versions).toHaveLength(7);
    expect(lineage.versions.slice(1).every((v) => v.operation === 'edit-clip-properties')).toBe(
      true
    );

    // One undo step each, newest first.
    act(() => undo());
    expect(current().timeSignature).toBe('4/4');
    act(() => undo());
    expect(current().loopOn).toBe(true);
    act(() => undo());
    // Back to the state after the loop Start edit, which moved the end with it (length kept).
    expect(current().loopEnd).toEqual(rational(12));
    expect(canUndo()).toBe(true);
  });

  it('rejects bad input with a visible message and changes nothing', async () => {
    await open(legacyClip());
    const before = desk.snippets[0];
    const changes = historyChangeCount();

    await enterLoop('Length', 'nonsense');
    expect(await screen.findByText(/Enter a length as bars\.beats\.ticks/)).toBeVisible();
    expect(desk.snippets[0]).toBe(before);

    await enterLoop('Length', '9.0.0');
    expect(await screen.findByText(/loop must stay within the total length/)).toBeVisible();

    await enterLoop('Length', '0.0.0');
    expect(await screen.findByText(/loop length must be longer than zero/)).toBeVisible();

    // A Start edit never says the length is zero: it keeps the length, or the loop would pass the end.
    await enterLoop('Start', '1.2.0');
    expect(await screen.findAllByText(/loop must stay within the total length/)).toHaveLength(1);
    expect(screen.queryAllByText(/loop length must be longer than zero/)).toHaveLength(1);

    await enter(/^Playback start/, '3.1.0');
    expect(await screen.findByText(/start must be inside the clip/)).toBeVisible();

    await enter(/^Length/, '1.0.0');
    expect(await screen.findAllByText(/loop must stay within the total length/)).toHaveLength(2);

    await enter(/^Time signature/, '4/3');
    expect(await screen.findByText(/time signature must be like 4\/4/)).toBeVisible();
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
  });

  it('shows the total length as the end marker and the loop as a band, and keeps notes past the end', async () => {
    const roll = await open(legacyClip());
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('512px');
    expect(screen.getByTestId('roll-loop-band').style.left).toBe('0px');
    expect(screen.getByTestId('roll-loop-band').style.width).toBe('512px');

    await enterLoop('Length', '1.0.0');
    await enterLoop('Start', '1.3.0');
    expect(screen.getByTestId('roll-loop-band').style.left).toBe('128px');
    expect(screen.getByTestId('roll-loop-band').style.width).toBe('256px');
    await userEvent.click(looping());
    expect(screen.queryByTestId('roll-loop-band')).toBeNull();

    // Shorten the clip below its last note: refused for the loop, so move the loop first.
    await userEvent.click(looping());
    await enterLoop('Start', '1.1.0');
    await enterLoop('Length', '0.2.0');
    await enter(/^Length/, '0.2.0');
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('128px');
    // The note at 2..3 stays, past the marker.
    expect(desk.snippets[0].packet.items).toHaveLength(2);
    expect(within(roll).getByTitle(/^E4/)).toBeInTheDocument();
  });

  it('keeps the editor selection and its time range while the inspector is used', async () => {
    const roll = await open(legacyClip());
    // A marquee over empty space: a time selection (with its band) and no notes.
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 420, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 420, clientY: 30, pointerId: 1 });
    expect(roll).toHaveAccessibleName(/0 selected/);
    const band = screen.getByTestId('roll-range');
    const left = band.style.left;

    await enterLoop('Length', '1.0.0');
    await userEvent.click(looping());
    await enter(/^Length/, '3.0.0');
    await enterLoop('Length', 'bad');

    expect(roll).toHaveAccessibleName(/0 selected/);
    expect(screen.getByTestId('roll-range').style.left).toBe(left);
    expect(screen.getByTestId('roll-range').style.width).toBe(band.style.width);
  });
});

describe('clip properties robustness', () => {
  it('Escape puts the stored value back and changes nothing', async () => {
    await open(legacyClip());
    const before = desk.snippets[0];
    const input = field(/^Length/);
    await userEvent.clear(input);
    await userEvent.type(input, '9.0.0{Escape}');
    expect(input).toHaveValue('2.0.0');
    await userEvent.tab();
    expect(desk.snippets[0]).toBe(before);
  });

  it('an equivalent value typed another way creates no version', async () => {
    await open(legacyClip());
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    await enter(/^Playback start/, '01.1.0');
    expect(desk.snippets[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
    expect(field(/^Playback start/)).toHaveValue('1.1.0');
  });

  it('a refusal shows its message once', async () => {
    await open(legacyClip());
    await enterLoop('Length', '9.0.0');
    expect(await screen.findAllByText(/loop must stay within the total length/)).toHaveLength(1);
  });

  it('an editor commit that lands before the panel re-renders survives the property edit', async () => {
    await open(legacyClip());
    const input = field(/^Length/);
    await userEvent.clear(input);
    await userEvent.type(input, '3.0.0');
    const stale = desk.snippets[0];
    // In ONE act the editor's commit lands in the desk and the panel's Enter fires before React
    // re-renders the panel: the panel still holds the old snippet and its old apply.
    act(() => {
      const items = stale.packet.items.filter((item) => item.id !== 'n1');
      const landed = desk.commitSnippetEditById(
        stale.id,
        { ...stale.packet, items },
        'edit-notes',
        {
          handEdit: true,
        }
      );
      expect(landed.ok).toBe(true);
      // Not re-rendered yet: the desk has the new packet, the panel's props are the old snippet.
      expect(desk.latestSnippetById(stale.id)!.packet.items).toHaveLength(1);
      expect(stale.packet.items).toHaveLength(2);
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(current().length).toEqual(rational(12));
    expect(desk.snippets[0].packet.items.map((item) => item.id)).toEqual(['n2']);
  });

  it('shows no panel for a clip that is not in quarter notes and leaves it untouched', async () => {
    const pulse: Snippet = {
      ...legacyClip('pulse', 7),
      packet: {
        ...packet('events', 'rhythmPattern', []),
        frame: { topology: 'cyclic', unit: 'pulse', extent: 7, origin: 0 },
      },
    };
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Harness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addSnippet(pulse));
    await screen.findByText('pulse');
    expect(screen.queryByRole('group', { name: 'Clip properties' })).toBeNull();
    const before = JSON.stringify(desk.snippets[0].packet);
    const result = desk.commitSnippetEditById(
      'pulse',
      withClipProperties(desk.snippets[0].packet, readClipProperties(desk.snippets[0].packet)),
      'edit-clip-properties'
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(desk.snippets[0].packet)).toBe(before);
  });
});

describe('clip properties in storage', () => {
  it('loads an earlier desk unchanged and reads defaults from it', async () => {
    const old = [legacyClip('a', 8), legacyClip('b', 4)];
    localStorage.setItem(compositionStateKeys.desk, JSON.stringify(old));
    const { result } = await renderDesk();
    expect(result.current.snippets).toHaveLength(2);
    // Nothing was written into the stored clips by loading.
    expect(result.current.snippets[0].packet.metadata?.clip).toBeUndefined();
    expect(readClipProperties(result.current.snippets[0].packet)).toMatchObject({
      length: rational(8),
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(8),
      timeSignature: '4/4',
    });
  });

  it('round-trips an edited clip through the stored desk and a saved project', async () => {
    await open(legacyClip());
    await enter(/^Length/, '3.0.0');
    await enterLoop('Start', '1.3.0');
    await userEvent.click(looping());
    await enter(/^Time signature/, '6/8');
    const edited = desk.snippets;
    const expected = readClipProperties(edited[0].packet);
    expect(expected).toMatchObject({ loopOn: false, timeSignature: '6/8' });

    const stored = await storedDesk(desk);
    expect(stored).toEqual(edited);
    expect(readClipProperties(stored[0].packet)).toEqual(expected);

    const saved = await saveProject({ name: 'Props', existing: null, desk: edited });
    expect(saved.ok).toBe(true);
    const [listed] = await listProjects();
    const project = await getProject(listed.id);
    expect(project?.desk).toEqual(edited);
    let opened: Awaited<ReturnType<typeof openProject>> | undefined;
    await act(async () => {
      opened = await openProject({ id: listed.id, desk, includeSettings: false });
    });
    expect(opened?.ok).toBe(true);
    const reopened = await storedDesk(desk);
    expect(readClipProperties(reopened[0].packet)).toEqual(expected);
    expect(reopened[0].lineage).toEqual(edited[0].lineage);
  });
});

describe('freezing an old clip at its first edit', () => {
  const rowY = (midi: number) => (127 - midi) * 22 + 11;
  const lengthOf = () => readClipProperties(desk.snippets[0].packet).length;

  it('reading an untouched old clip writes nothing', async () => {
    await open(legacyClip());
    expect(desk.snippets[0].packet.metadata?.clip).toBeUndefined();
    expect(desk.snippets[0].lineage).toBeUndefined();
  });

  it('a note edit freezes the length: a note moved to 8..9 leaves Length alone, undo restores the packet', async () => {
    const roll = await open(legacyClip('old', 8));
    const original = JSON.stringify(desk.snippets[0]);
    expect(lengthOf()).toEqual(rational(8));
    // Move n2 (2..3, E4) to 8..9: six quarters right at 64 px per quarter.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerMove(roll, { clientX: 140 + 6 * 64, clientY: rowY(64), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 140 + 6 * 64, clientY: rowY(64), pointerId: 1 });
    const moved = desk.snippets[0].packet.items.find((item) => item.id === 'n2')!;
    expect((moved.value as { onset: { quarterNotes: unknown } }).onset.quarterNotes).toEqual(
      rational(8)
    );
    expect(lengthOf()).toEqual(rational(8));
    expect(field(/^Length/)).toHaveValue('2.0.0');
    expect(desk.snippets[0].packet.frame).toMatchObject({ extent: 8 });
    expect(desk.snippets[0].packet.metadata?.clip).toMatchObject({ loopEnd: rational(8) });
    // The freeze rode in the same version as the edit.
    expect(desk.snippets[0].lineage!.versions).toHaveLength(2);

    // A second edit (a delete) writes no extra properties.
    const frozen = desk.snippets[0].packet.metadata?.clip;
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 1 });
    fireEvent.keyDown(roll, { key: 'Delete' });
    expect(desk.snippets[0].packet.items.map((item) => item.id)).toEqual(['n2']);
    expect(desk.snippets[0].packet.metadata?.clip).toEqual(frozen);
    expect(lengthOf()).toEqual(rational(8));

    // One undo step per edit: undo the delete, then the move, back to the exact old clip.
    act(() => undo());
    expect(desk.snippets[0].packet.items).toHaveLength(2);
    expect(desk.snippets[0].packet.metadata?.clip).toEqual(frozen);
    act(() => undo());
    expect(JSON.stringify(desk.snippets[0])).toBe(original);
  });

  it('a property edit on an old clip writes the full set in its own single version', async () => {
    await open(legacyClip());
    await enterLoop('Length', '0.2.0');
    const clip = desk.snippets[0].packet.metadata?.clip as Record<string, unknown>;
    expect(Object.keys(clip).sort()).toEqual(
      ['loopEnd', 'loopOn', 'loopStart', 'start', 'timeSignature'].sort()
    );
    expect(desk.snippets[0].lineage!.versions).toHaveLength(2);
  });
});

describe('the clip inspector', () => {
  function mountInspector() {
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <InspectorHarness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
  }

  it('shows no properties panel for a note clip with a pulse frame', async () => {
    const base = legacyClip('pulsed', 7);
    const pulseNotes: Snippet = {
      ...base,
      packet: {
        ...base.packet,
        frame: { topology: 'cyclic', unit: 'pulse', extent: 7, origin: 0 },
      },
    };
    mountInspector();
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addSnippet(pulseNotes));
    expect(await screen.findByRole('heading', { name: 'pulsed' })).toBeInTheDocument();
    expect(screen.getByText('events | note')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Clip properties' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^Length/ })).toBeNull();
  });

  it('shows no panel for a cyclic quarter-note note packet (melodicization)', async () => {
    const base = legacyClip('cyclic', 4);
    const cyclic: Snippet = {
      ...base,
      packet: { ...base.packet, frame: { ...base.packet.frame!, topology: 'cyclic' } },
    };
    mountInspector();
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addSnippet(cyclic));
    expect(await screen.findByRole('heading', { name: 'cyclic' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Clip properties' })).toBeNull();
  });

  it('shows the panel for a plain note clip', async () => {
    mountInspector();
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addSnippet(legacyClip('plain', 8)));
    expect(await screen.findByRole('group', { name: 'Clip properties' })).toBeInTheDocument();
  });
});

describe('the note editor commit path', () => {
  const rowY = (midi: number) => (127 - midi) * 22 + 11;

  it('a note edit that changes nothing on a legacy clip writes nothing (no freeze, no version)', async () => {
    const roll = await open(legacyClip());
    const before = desk.snippets[0];
    const changes = historyChangeCount();
    // Drag E4 past the click dead zone but less than a snap step: the move resolves to no change.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerMove(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
    expect(desk.snippets[0]).toBe(before);
    expect(desk.snippets[0].packet.metadata?.clip).toBeUndefined();
    expect(historyChangeCount()).toBe(changes);
  });

  it('edits from the desk as it is now: a property change that landed first is not reverted by a note edit', async () => {
    const roll = await open(legacyClip());
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    expect(roll).toHaveAccessibleName(/1 selected/);
    // In ONE act the length edit lands in the desk and the roll's Delete fires before React
    // re-renders the editor: it still holds the old packet, which it must not build on.
    act(() => {
      const stale = desk.latestSnippetById('old')!;
      const edit = editClipProperties(stale.packet, { length: rational(12) });
      expect(edit.ok).toBe(true);
      if (edit.ok) {
        expect(desk.commitSnippetEditById('old', edit.packet, 'edit-clip-properties').ok).toBe(
          true
        );
      }
      expect(desk.latestSnippetById('old')!.packet).not.toBe(stale.packet);
      fireEvent.keyDown(roll, { key: 'Delete' });
    });
    expect(desk.snippets[0].packet.items.map((item) => item.id)).toEqual(['n1']);
    expect(current().length).toEqual(rational(12));
  });
});

describe('the loop controls', () => {
  it('Looping is a toggle button, and Start and Length are listed beneath it', async () => {
    await open(legacyClip());
    const group = screen.getByRole('group', { name: 'Loop' });
    const labels = [...group.querySelectorAll('button, input')].map(
      (element) =>
        element.textContent ||
        element.getAttribute('aria-label') ||
        (element as HTMLInputElement).value
    );
    expect(within(group).getByRole('button', { name: 'Looping' })).toBe(looping());
    expect(within(group).queryByRole('switch')).toBeNull();
    expect(labels).toHaveLength(3);
    expect(looping().compareDocumentPosition(loopField('Start'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(looping()).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(looping());
    expect(looping()).toHaveAttribute('aria-pressed', 'false');
    expect(current().loopOn).toBe(false);
  });

  it('the loop Length is a duration; editing Start keeps it and moves the end', async () => {
    await open(legacyClip());
    await enterLoop('Length', '1.0.0');
    expect(current()).toMatchObject({ loopStart: rational(0), loopEnd: rational(4) });
    await enterLoop('Start', '1.3.0');
    expect(current()).toMatchObject({ loopStart: rational(2), loopEnd: rational(6) });
    expect(loopField('Length')).toHaveValue('1.0.0');
    // Start plus length past the clip's end is refused (with the within-length message), kept as is.
    await enterLoop('Start', '2.3.0');
    expect(await screen.findByText(/loop must stay within the total length/)).toBeVisible();
    expect(screen.queryByText(/must be longer than zero/)).toBeNull();
    expect(current()).toMatchObject({ loopStart: rational(2), loopEnd: rational(6) });
    await enterLoop('Length', '1.2.0');
    expect(current().loopEnd).toEqual(rational(8));
    await enterLoop('Length', '1.3.0');
    expect(current().loopEnd).toEqual(rational(8));
    // A clip shorter than the loop's end is still refused.
    await enter(/^Length/, '1.0.0');
    expect(current().length).toEqual(rational(8));
  });

  it('a Length edit reads the loop start from the latest packet, not the render', async () => {
    await open(legacyClip());
    const input = loopField('Length');
    await userEvent.clear(input);
    await userEvent.type(input, '0.2.0');
    // The loop start lands behind the panel's back (as the editor or another tab could commit).
    act(() => {
      const latest = desk.snippets[0];
      const edit = editClipProperties(latest.packet, {
        loopStart: rational(4),
        loopEnd: rational(8),
      });
      if (!edit.ok) {
        throw new Error(edit.error);
      }
      desk.commitSnippetEditById(latest.id, edit.packet, 'edit-clip-properties');
      // Before React re-renders the panel: its render still has the old loop start.
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(current()).toMatchObject({ loopStart: rational(4), loopEnd: rational(6) });
  });

  it('the two Length fields have different names', async () => {
    await open(legacyClip());
    expect(screen.getByRole('textbox', { name: 'Loop length' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Loop start' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: /^Length/ })).toHaveLength(1);
  });
});

import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionInspector } from './components/CompositionInspector';
import { DeskView } from './components/DeskView';
import { NotesEditor } from './components/NotesEditor';
import { NotesPropertiesPanel } from './components/NotesPropertiesPanel';
import { CompositionSettingsProvider, useCompositionSettings } from './compositionSettings';
import type { PacketBlock } from './dataBlock';
import { DeskProvider, useDesk } from './desk';
import { getProject, listProjects } from './deskStore';
import { renderDesk, seedDesk, storedDesk } from './deskTestUtils';
import { canUndo, historyChangeCount, resetHistory, undo } from './history';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition, rational } from './musicalTime';
import { editNotesProperties, readNotesProperties, withNotesProperties } from './notesProperties';
import { openProject, saveProject } from './projects';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    play: async () => undefined,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

/** The data-block inspector as the workbench mounts it, for the data-block the desk holds. */
function InspectorHarness() {
  desk = useDesk();
  const dataBlock = desk.dataBlocks[0];
  return (
    <CompositionInspector
      selected={{ kind: 'canvas' }}
      activeInstanceId={null}
      dataBlockId={dataBlock?.id ?? null}
      outputs={[]}
      instances={[]}
      routes={{}}
      onRemoveNode={() => undefined}
      onNodeSlot={() => undefined}
      onRouteTreatment={() => undefined}
    />
  );
}

let desk: ReturnType<typeof useDesk>;
let settings: ReturnType<typeof useCompositionSettings>;

function Harness() {
  desk = useDesk();
  settings = useCompositionSettings();
  const dataBlock = desk.dataBlocks[0];
  return (
    <>
      {dataBlock && <NotesEditor dataBlock={dataBlock} />}
      {dataBlock && <NotesPropertiesPanel key={dataBlock.id} dataBlock={dataBlock} />}
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

/** A data-block as an earlier version of the app stored it: frame only, no notes properties. */
function legacyDataBlock(id = 'old', extent = 8): PacketBlock {
  return {
    schemaVersion: 2,
    typeId: 'notes',
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    payload: {
      kind: 'packet',
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
    },
  };
}

async function open(seed?: PacketBlock) {
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
      desk.addDataBlock(seed);
    } else {
      desk.addBlankDataBlock('notes', rational(4));
    }
  });
  return screen.findByRole('group', { name: /Notes piano roll/ });
}

const inLoop = (element: HTMLElement) => element.closest('[aria-label="Loop"]') !== null;
/** A block-level field (the loop's own Start and Length are `loopField`). */
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

const current = () => readNotesProperties(desk.dataBlocks[0].payload.packet);

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('the notes properties panel', () => {
  it('shows a blank data-block with every property filled in', async () => {
    await open();
    expect(field(/^Length/)).toHaveValue('1.0.0.00');
    expect(field(/^Playback start/)).toHaveValue('1.1.1.00');
    expect(loopField('Start')).toHaveValue('1.1.1.00');
    expect(loopField('Length')).toHaveValue('1.0.0.00');
    expect(field(/^Time signature/)).toHaveValue('4/4');
    expect(looping()).toHaveAttribute('aria-pressed', 'true');
    expect(desk.dataBlocks[0].payload.packet.metadata?.notes).toBeDefined();
  });

  it('a new data-block takes the project time signature and is one bar of it long', async () => {
    await open();
    act(() => settings.updateTransport({ meter: '7/8' }));
    await userEvent.click(screen.getByRole('button', { name: 'New data-block' }));
    await waitFor(() => expect(desk.dataBlocks).toHaveLength(2));
    const made = readNotesProperties(desk.dataBlocks[1].payload.packet);
    expect(made.timeSignature).toBe('7/8');
    expect(made.length).toEqual(rational(7, 2));
    expect(made.loopEnd).toEqual(rational(7, 2));
  });

  it('every field edits through bars.beats.ticks, each edit its own version and one undo step', async () => {
    await open(legacyDataBlock());
    // Old data-block: defaults on read, the frame's 8 quarters kept.
    expect(current()).toMatchObject({ length: rational(8), loopOn: true, timeSignature: '4/4' });
    expect(field(/^Length/)).toHaveValue('2.0.0.00');
    expect(desk.dataBlocks[0].lineage).toBeUndefined();

    await enter(/^Length/, '3.0.0');
    expect(current().length).toEqual(rational(12));
    expect(desk.dataBlocks[0].payload.packet.frame).toMatchObject({ extent: 12 });
    expect(desk.dataBlocks[0].lineage!.versions).toHaveLength(2);

    await enter(/^Playback start/, '1.2.3');
    expect(current().start).toEqual(rational(3, 2));
    await enterLoop('Start', '2.1.1');
    await enterLoop('Length', '0.2.0');
    expect(current()).toMatchObject({ loopStart: rational(4), loopEnd: rational(6) });
    await userEvent.click(looping());
    expect(current().loopOn).toBe(false);
    await enter(/^Time signature/, '7/8');
    expect(current().timeSignature).toBe('7/8');

    const lineage = desk.dataBlocks[0].lineage!;
    expect(lineage.versions).toHaveLength(7);
    expect(lineage.versions.slice(1).every((v) => v.operation === 'edit-properties')).toBe(true);

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
    await open(legacyDataBlock());
    const before = desk.dataBlocks[0];
    const changes = historyChangeCount();

    await enterLoop('Length', 'nonsense');
    expect(await screen.findByText(/Enter time as BARs\.BEATs\.TICKs\.%/)).toBeVisible();
    expect(desk.dataBlocks[0]).toBe(before);

    await enterLoop('Length', '9.0.0');
    expect(await screen.findByText(/loop must stay within the total length/)).toBeVisible();

    await enterLoop('Length', '0.0.0');
    expect(await screen.findByText(/loop length must be longer than zero/)).toBeVisible();

    // A Start at or after the data-block's end leaves no loop: refused. (A start that only makes the loop
    // run past the end is not an error: it shortens the length, see the loop controls tests.)
    await enterLoop('Start', '3.1.1');
    expect(
      await screen.findByText(/loop start must be before the end of the data-block/)
    ).toBeVisible();
    expect(screen.queryAllByText(/loop length must be longer than zero/)).toHaveLength(1);

    await enter(/^Playback start/, '3.1.1');
    expect(await screen.findByText(/start must be inside the data-block/)).toBeVisible();

    await enter(/^Length/, '1.0.0');
    expect(await screen.findAllByText(/loop must stay within the total length/)).toHaveLength(1);

    await enter(/^Time signature/, '4/3');
    expect(await screen.findByText(/time signature must be like 4\/4/)).toBeVisible();
    expect(desk.dataBlocks[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
  });

  it('shows the total length as the end marker and the loop as a band, and keeps notes past the end', async () => {
    const roll = await open(legacyDataBlock());
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('512px');
    expect(screen.getByTestId('roll-loop-band').style.left).toBe('0px');
    expect(screen.getByTestId('roll-loop-band').style.width).toBe('512px');

    await enterLoop('Length', '1.0.0');
    await enterLoop('Start', '1.3.1');
    expect(screen.getByTestId('roll-loop-band').style.left).toBe('128px');
    expect(screen.getByTestId('roll-loop-band').style.width).toBe('256px');
    await userEvent.click(looping());
    expect(screen.queryByTestId('roll-loop-band')).toBeNull();

    // Shorten the data-block below its last note: refused for the loop, so move the loop first.
    await userEvent.click(looping());
    await enterLoop('Start', '1.1.1');
    await enterLoop('Length', '0.2.0');
    await enter(/^Length/, '0.2.0');
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('128px');
    // The note at 2..3 stays, past the marker.
    expect(desk.dataBlocks[0].payload.packet.items).toHaveLength(2);
    expect(within(roll).getByTitle(/^E4/)).toBeInTheDocument();
  });

  it('keeps the editor selection and its time range while the inspector is used', async () => {
    const roll = await open(legacyDataBlock());
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

describe('notes properties robustness', () => {
  it('Escape puts the stored value back and changes nothing', async () => {
    await open(legacyDataBlock());
    const before = desk.dataBlocks[0];
    const input = field(/^Length/);
    await userEvent.clear(input);
    await userEvent.type(input, '9.0.0{Escape}');
    expect(input).toHaveValue('2.0.0.00');
    await userEvent.tab();
    expect(desk.dataBlocks[0]).toBe(before);
  });

  it('an equivalent value typed another way creates no version', async () => {
    await open(legacyDataBlock());
    const before = desk.dataBlocks[0];
    const changes = historyChangeCount();
    await enter(/^Playback start/, '01.1.1');
    expect(desk.dataBlocks[0]).toBe(before);
    expect(historyChangeCount()).toBe(changes);
    expect(field(/^Playback start/)).toHaveValue('1.1.1.00');
  });

  it('a refusal shows its message once', async () => {
    await open(legacyDataBlock());
    await enterLoop('Length', '9.0.0');
    expect(await screen.findAllByText(/loop must stay within the total length/)).toHaveLength(1);
  });

  it('an editor commit that lands before the panel re-renders survives the property edit', async () => {
    await open(legacyDataBlock());
    const input = field(/^Length/);
    await userEvent.clear(input);
    await userEvent.type(input, '3.0.0');
    const stale = desk.dataBlocks[0];
    // In ONE act the editor's commit lands in the desk and the panel's Enter fires before React
    // re-renders the panel: the panel still holds the old data-block and its old apply.
    act(() => {
      const items = stale.payload.packet.items.filter((item) => item.id !== 'n1');
      const landed = desk.commitDataBlockEditById(
        stale.id,
        { ...stale.payload.packet, items },
        'edit-notes',
        {
          handEdit: true,
        }
      );
      expect(landed.ok).toBe(true);
      // Not re-rendered yet: the desk has the new packet, the panel's props are the old data-block.
      expect(desk.latestDataBlockById(stale.id)!.payload.packet.items).toHaveLength(1);
      expect(stale.payload.packet.items).toHaveLength(2);
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(current().length).toEqual(rational(12));
    expect(desk.dataBlocks[0].payload.packet.items.map((item) => item.id)).toEqual(['n2']);
  });

  it('shows no panel for a data-block that is not in quarter notes and leaves it untouched', async () => {
    const pulse: PacketBlock = {
      ...legacyDataBlock('pulse', 7),
      payload: {
        kind: 'packet',
        packet: {
          ...packet('events', 'rhythmPattern', []),
          frame: { topology: 'cyclic', unit: 'pulse', extent: 7, origin: 0 },
        },
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
    act(() => desk.addDataBlock(pulse));
    await screen.findByText('pulse');
    expect(screen.queryByRole('group', { name: 'Notes properties' })).toBeNull();
    const before = JSON.stringify(desk.dataBlocks[0].payload.packet);
    const result = desk.commitDataBlockEditById(
      'pulse',
      withNotesProperties(
        desk.dataBlocks[0].payload.packet,
        readNotesProperties(desk.dataBlocks[0].payload.packet)
      ),
      'edit-properties'
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(desk.dataBlocks[0].payload.packet)).toBe(before);
  });
});

describe('notes properties in storage', () => {
  it('loads a stored desk unchanged and reads defaults from it', async () => {
    const old = [legacyDataBlock('a', 8), legacyDataBlock('b', 4)];
    await seedDesk(old);
    const { result } = await renderDesk();
    expect(result.current.dataBlocks).toHaveLength(2);
    // Nothing was written into the stored data-blocks by loading.
    expect(result.current.dataBlocks[0].payload.packet.metadata?.notes).toBeUndefined();
    expect(readNotesProperties(result.current.dataBlocks[0].payload.packet)).toMatchObject({
      length: rational(8),
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(8),
      timeSignature: '4/4',
    });
  });

  it('round-trips an edited data-block through the stored desk and a saved project', async () => {
    await open(legacyDataBlock());
    await enter(/^Length/, '3.0.0');
    await enterLoop('Start', '1.3.1');
    await userEvent.click(looping());
    await enter(/^Time signature/, '6/8');
    const edited = desk.dataBlocks;
    const expected = readNotesProperties(edited[0].payload.packet);
    expect(expected).toMatchObject({ loopOn: false, timeSignature: '6/8' });

    const stored = await storedDesk(desk);
    expect(stored).toEqual(edited);
    expect(readNotesProperties(stored[0].payload.packet)).toEqual(expected);

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
    expect(readNotesProperties(reopened[0].payload.packet)).toEqual(expected);
    expect(reopened[0].lineage).toEqual(edited[0].lineage);
  });
});

describe('freezing an old data-block at its first edit', () => {
  const rowY = (midi: number) => (127 - midi) * 22 + 11;
  const lengthOf = () => readNotesProperties(desk.dataBlocks[0].payload.packet).length;

  it('reading an untouched old data-block writes nothing', async () => {
    await open(legacyDataBlock());
    expect(desk.dataBlocks[0].payload.packet.metadata?.notes).toBeUndefined();
    expect(desk.dataBlocks[0].lineage).toBeUndefined();
  });

  it('a note edit freezes the length: a note moved to 8..9 leaves Length alone, undo restores the packet', async () => {
    const roll = await open(legacyDataBlock('old', 8));
    const original = JSON.stringify(desk.dataBlocks[0]);
    expect(lengthOf()).toEqual(rational(8));
    // Move n2 (2..3, E4) to 8..9: six quarters right at 64 px per quarter.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerMove(roll, { clientX: 140 + 6 * 64, clientY: rowY(64), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 140 + 6 * 64, clientY: rowY(64), pointerId: 1 });
    const moved = desk.dataBlocks[0].payload.packet.items.find((item) => item.id === 'n2')!;
    expect((moved.value as { onset: { quarterNotes: unknown } }).onset.quarterNotes).toEqual(
      rational(8)
    );
    expect(lengthOf()).toEqual(rational(8));
    expect(field(/^Length/)).toHaveValue('2.0.0.00');
    expect(desk.dataBlocks[0].payload.packet.frame).toMatchObject({ extent: 8 });
    expect(desk.dataBlocks[0].payload.packet.metadata?.notes).toMatchObject({
      loopEnd: rational(8),
    });
    // The freeze rode in the same version as the edit.
    expect(desk.dataBlocks[0].lineage!.versions).toHaveLength(2);

    // A second edit (a delete) writes no extra properties.
    const frozen = desk.dataBlocks[0].payload.packet.metadata?.notes;
    fireEvent.pointerDown(screen.getByTitle(/^C4 · 0\.000 qn/), {
      clientX: 20,
      clientY: rowY(60),
      pointerId: 1,
    });
    fireEvent.pointerUp(roll, { clientX: 20, clientY: rowY(60), pointerId: 1 });
    fireEvent.keyDown(roll, { key: 'Delete' });
    expect(desk.dataBlocks[0].payload.packet.items.map((item) => item.id)).toEqual(['n2']);
    expect(desk.dataBlocks[0].payload.packet.metadata?.notes).toEqual(frozen);
    expect(lengthOf()).toEqual(rational(8));

    // One undo step per edit: undo the delete, then the move, back to the exact old data-block.
    act(() => undo());
    expect(desk.dataBlocks[0].payload.packet.items).toHaveLength(2);
    expect(desk.dataBlocks[0].payload.packet.metadata?.notes).toEqual(frozen);
    act(() => undo());
    expect(JSON.stringify(desk.dataBlocks[0])).toBe(original);
  });

  it('a property edit on an old data-block writes the full set in its own single version', async () => {
    await open(legacyDataBlock());
    await enterLoop('Length', '0.2.0');
    const dataBlock = desk.dataBlocks[0].payload.packet.metadata?.notes as Record<string, unknown>;
    expect(Object.keys(dataBlock).sort()).toEqual(
      ['loopEnd', 'loopOn', 'loopStart', 'start', 'timeSignature'].sort()
    );
    expect(desk.dataBlocks[0].lineage!.versions).toHaveLength(2);
  });
});

describe('the data-block inspector', () => {
  function mountInspector() {
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <InspectorHarness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
  }

  it('shows no properties panel for a notes data-block with a pulse frame', async () => {
    const base = legacyDataBlock('pulsed', 7);
    const pulseNotes: PacketBlock = {
      ...base,
      payload: {
        kind: 'packet',
        packet: {
          ...base.payload.packet,
          frame: { topology: 'cyclic', unit: 'pulse', extent: 7, origin: 0 },
        },
      },
    };
    mountInspector();
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addDataBlock(pulseNotes));
    expect(await screen.findByRole('heading', { name: 'pulsed' })).toBeInTheDocument();
    expect(screen.getByText('events | note')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Notes properties' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^Length/ })).toBeNull();
  });

  it('shows no panel for a cyclic quarter-note note packet (melodicization)', async () => {
    const base = legacyDataBlock('cyclic', 4);
    const cyclic: PacketBlock = {
      ...base,
      payload: {
        kind: 'packet',
        packet: {
          ...base.payload.packet,
          frame: { ...base.payload.packet.frame!, topology: 'cyclic' },
        },
      },
    };
    mountInspector();
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addDataBlock(cyclic));
    expect(await screen.findByRole('heading', { name: 'cyclic' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Notes properties' })).toBeNull();
  });

  it('shows the panel for a plain notes data-block', async () => {
    mountInspector();
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => desk.addDataBlock(legacyDataBlock('plain', 8)));
    expect(await screen.findByRole('group', { name: 'Notes properties' })).toBeInTheDocument();
  });
});

describe('the note editor commit path', () => {
  const rowY = (midi: number) => (127 - midi) * 22 + 11;

  it('a note edit that changes nothing on a legacy data-block writes nothing (no freeze, no version)', async () => {
    const roll = await open(legacyDataBlock());
    const before = desk.dataBlocks[0];
    const changes = historyChangeCount();
    // Drag E4 past the click dead zone but less than a snap step: the move resolves to no change.
    fireEvent.pointerDown(screen.getByTitle(/^E4 · 2\.000 qn/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
    });
    fireEvent.pointerMove(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 150, clientY: rowY(64), pointerId: 1 });
    expect(desk.dataBlocks[0]).toBe(before);
    expect(desk.dataBlocks[0].payload.packet.metadata?.notes).toBeUndefined();
    expect(historyChangeCount()).toBe(changes);
  });

  it('edits from the desk as it is now: a property change that landed first is not reverted by a note edit', async () => {
    const roll = await open(legacyDataBlock());
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
      const stale = desk.latestDataBlockById('old')!;
      const edit = editNotesProperties(stale.payload.packet, { length: rational(12) });
      expect(edit.ok).toBe(true);
      if (edit.ok) {
        expect(desk.commitDataBlockEditById('old', edit.packet, 'edit-properties').ok).toBe(true);
      }
      expect(desk.latestDataBlockById('old')!.payload.packet).not.toBe(stale.payload.packet);
      fireEvent.keyDown(roll, { key: 'Delete' });
    });
    expect(desk.dataBlocks[0].payload.packet.items.map((item) => item.id)).toEqual(['n1']);
    expect(current().length).toEqual(rational(12));
  });
});

describe('the loop controls', () => {
  it('Looping is a toggle button, and Start and Length are listed beneath it', async () => {
    await open(legacyDataBlock());
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
    await open(legacyDataBlock());
    await enterLoop('Length', '1.0.0');
    expect(current()).toMatchObject({ loopStart: rational(0), loopEnd: rational(4) });
    await enterLoop('Start', '1.3.1');
    expect(current()).toMatchObject({ loopStart: rational(2), loopEnd: rational(6) });
    expect(loopField('Length')).toHaveValue('1.0.0.00');
    // Start plus length past the data-block's end shortens the length to fit (the end stops at the data-block's
    // end); it is not refused.
    await enterLoop('Start', '2.3.1');
    expect(current()).toMatchObject({ loopStart: rational(6), loopEnd: rational(8) });
    expect(loopField('Length')).toHaveValue('0.2.0.00');
    expect(screen.queryByText(/loop must stay within the total length/)).toBeNull();
    // A start at or after the end of the data-block is still refused, and changes nothing.
    await enterLoop('Start', '3.1.1');
    expect(
      await screen.findByText(/loop start must be before the end of the data-block/)
    ).toBeVisible();
    expect(current()).toMatchObject({ loopStart: rational(6), loopEnd: rational(8) });
    await enterLoop('Start', '1.3.1');
    expect(current()).toMatchObject({ loopStart: rational(2), loopEnd: rational(4) });
    await enterLoop('Length', '1.2.0');
    expect(current().loopEnd).toEqual(rational(8));
    await enterLoop('Length', '1.3.0');
    expect(current().loopEnd).toEqual(rational(8));
    // A data-block shorter than the loop's end is still refused.
    await enter(/^Length/, '1.0.0');
    expect(current().length).toEqual(rational(8));
  });

  it('a Length edit reads the loop start from the latest packet, not the render', async () => {
    await open(legacyDataBlock());
    const input = loopField('Length');
    await userEvent.clear(input);
    await userEvent.type(input, '0.2.0');
    // The loop start lands behind the panel's back (as the editor or another tab could commit).
    act(() => {
      const latest = desk.dataBlocks[0];
      const edit = editNotesProperties(latest.payload.packet, {
        loopStart: rational(4),
        loopEnd: rational(8),
      });
      if (!edit.ok) {
        throw new Error(edit.error);
      }
      desk.commitDataBlockEditById(latest.id, edit.packet, 'edit-properties');
      // Before React re-renders the panel: its render still has the old loop start.
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(current()).toMatchObject({ loopStart: rational(4), loopEnd: rational(6) });
  });

  it('the Looping toggle flips the latest packet, not the render it was drawn from', async () => {
    await open(legacyDataBlock());
    expect(current().loopOn).toBe(true);
    act(() => {
      const latest = desk.dataBlocks[0];
      const edit = editNotesProperties(latest.payload.packet, { loopOn: false });
      if (!edit.ok) {
        throw new Error(edit.error);
      }
      desk.commitDataBlockEditById(latest.id, edit.packet, 'edit-properties');
      // Before React re-renders the panel: its render still shows Looping on.
      fireEvent.click(looping());
    });
    // The desk had it off, so the click turns it back on (a stale read would have written "off").
    expect(current().loopOn).toBe(true);
  });

  it('the two Length fields have different names', async () => {
    await open(legacyDataBlock());
    expect(screen.getByRole('textbox', { name: 'Loop length' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Loop start' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: /^Length/ })).toHaveLength(1);
  });
});

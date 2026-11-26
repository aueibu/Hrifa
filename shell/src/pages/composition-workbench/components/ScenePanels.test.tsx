import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider } from '../desk';
import { seedDesk } from '../deskTestUtils';
import { redo, resetHistory, undo } from '../history';
import { HARMONIZE_ID, MELODICIZE_ID, SNAP_TO_PITCH_SET_ID } from '../scene/modifiers';
import { writeSceneSession } from '../scene/sceneSession';
import {
  claveBlock,
  collectionBlock,
  modifierOf,
  objectBlock,
  pitchSetBlock,
  sceneBlock,
} from '../scene/sceneTestHelpers';
import type { ModifierInstance } from '../scene/sceneTypes';
import { mockEngineState } from './sceneEngineMock';
import { OutlinerPanel, PropertiesPanel } from './ScenePanels';

// A stand-in engine (components/sceneEngineMock.ts): sessions per source id, like the real one.
vi.mock('../audio/AudioEngineProvider', async () => {
  const { mockEngine } = await import('./sceneEngineMock');
  return { useAudioEngine: () => mockEngine };
});
const played = mockEngineState.played;

async function renderPanels() {
  await seedDesk([claveBlock()]);
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <OutlinerPanel />
        <PropertiesPanel />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await screen.findByText('No scene yet');
  // The desk loads asynchronously and the button stays disabled until it has: wait, never click early.
  await waitFor(() => expect(screen.getByRole('button', { name: 'New scene' })).toBeEnabled());
}

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const openTab = (name: string) => userEvent.click(screen.getByRole('tab', { name }));
const playButton = () => screen.getByRole('button', { name: /Play|Stop/ });
const names = () => screen.queryAllByRole('treeitem').map((item) => item.textContent);

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  mockEngineState.reset();
});

describe('the Outliner and Properties panels (O2a)', () => {
  it('adds a scene and an Empty, renames it, sets Mapping and Data, and Play follows the data', async () => {
    await renderPanels();
    expect(playButton()).toBeDisabled();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Add Child Empty' })).toBeDisabled();

    await click('Add Empty');
    const item = await screen.findByRole('treeitem', { name: /Empty/ });
    expect(item).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Name')).toHaveValue('Empty');
    // An empty scene is not sent to the engine.
    expect(playButton()).toBeDisabled();
    expect(playButton().getAttribute('data-info')).toMatch(/Add an object with data/);

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bass{Enter}');
    await waitFor(() => expect(names()[0]).toContain('Bass'));

    await userEvent.click(screen.getByText('Stretch'));
    // Data moved to its own tab (U6): open it first.
    await openTab('Data');
    await userEvent.click(screen.getByRole('button', { name: 'Data' }));
    await userEvent.click(await screen.findByRole('button', { name: /Clave/ }));
    await waitFor(() => expect(playButton()).toBeEnabled());
    expect(names()[0]).toContain('Clave');

    await userEvent.click(playButton());
    await waitFor(() => expect(played).toHaveLength(1));
    const plan = played[0].plan as MusicalPerformancePlan;
    expect(plan.events).toHaveLength(5);
    expect(played[0].loop).toBeFalsy();
    await userEvent.click(await screen.findByRole('button', { name: '■ Stop' }));
    expect(mockEngineState.stopped).toBe(1);
  });

  it('Register: Fold and the span land in the record, the readout follows, and Low cannot pass High', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await screen.findByRole('treeitem', { name: /Empty/ });

    expect(screen.getByText('Data range')).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(screen.queryByText(/moved/)).not.toBeInTheDocument();

    const mapping = screen.getByRole('radiogroup', { name: 'Register mapping' });
    await userEvent.click(within(mapping).getByText('Fold'));
    expect(await screen.findByText('0 moved, 0 dropped')).toBeInTheDocument();
    expect(within(mapping).getByLabelText('Fold')).toBeChecked();

    const scrub = async (name: string, text: string) => {
      const spin = screen.getByRole('spinbutton', { name });
      fireEvent.pointerDown(spin, { button: 0, clientX: 10 });
      fireEvent.pointerUp(spin, { button: 0, clientX: 10 });
      const input = await screen.findByRole('textbox', { name });
      fireEvent.change(input, { target: { value: text } });
      fireEvent.keyDown(input, { key: 'Enter' });
    };
    const value = (name: string) =>
      screen.getByRole('spinbutton', { name }).getAttribute('aria-valuenow');
    expect(value('High')).toBe('12700');
    await scrub('High', '7200');
    await waitFor(() => expect(value('High')).toBe('7200'));
    await scrub('Low', '3600');
    await waitFor(() => expect(value('Low')).toBe('3600'));

    // Low is clamped by High: it can never pass it, so nothing is refused.
    await scrub('Low', '9000');
    await waitFor(() => expect(value('Low')).toBe('7200'));
    expect(value('High')).toBe('7200');
  });

  it('Start: a bar drag and typed text land in the record', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await screen.findByRole('treeitem', { name: /Empty/ });

    const spin = () => screen.getByRole('spinbutton', { name: 'Start' });
    expect(spin()).toHaveAttribute('aria-valuetext', '1.1.1.00');
    const bar = spin().querySelector('[data-part="bar"]') as HTMLElement;
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(spin(), { clientX: 112, clientY: 50 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 112, clientY: 50 });
    await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', '3.1.1.00'));

    fireEvent.pointerDown(spin(), { button: 0, clientX: 10 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 10 });
    const input = await screen.findByRole('textbox', { name: 'Start' });
    fireEvent.change(input, { target: { value: '1/4n' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', '1.2.1.00'));
  });

  it('Duration: a bar drag and typed text land in the record', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await screen.findByRole('treeitem', { name: /Empty/ });

    const spin = () => screen.getByRole('spinbutton', { name: 'Duration' });
    expect(spin()).toHaveAttribute('aria-valuetext', '1.0.0.00');
    const bar = spin().querySelector('[data-part="bar"]') as HTMLElement;
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(spin(), { clientX: 106, clientY: 50 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 106, clientY: 50 });
    await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', '2.0.0.00'));

    fireEvent.pointerDown(spin(), { button: 0, clientX: 10 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 10 });
    const input = await screen.findByRole('textbox', { name: 'Duration' });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', '3.0.0.00'));
  });

  it('one Start drag is one undo step: undo restores the value from before the drag', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await screen.findByRole('treeitem', { name: /Empty/ });

    const spin = () => screen.getByRole('spinbutton', { name: 'Start' });
    const bar = spin().querySelector('[data-part="bar"]') as HTMLElement;
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 50 });
    for (const x of [106, 112, 118]) {
      fireEvent.pointerMove(spin(), { clientX: x, clientY: 50 });
      await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', expect.any(String)));
    }
    fireEvent.pointerUp(spin(), { button: 0, clientX: 118, clientY: 50 });
    await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', '4.1.1.00'));
    act(() => undo());
    await waitFor(() => expect(spin()).toHaveAttribute('aria-valuetext', '1.1.1.00'));
  });

  it('deleting a parent keeps the child in place, and undo and redo restore and remove it', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await click('Add Child Empty');
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(2));
    expect(screen.getAllByRole('treeitem')[1]).toHaveAttribute('aria-level', '2');

    await userEvent.click(screen.getAllByRole('treeitem')[0]);
    await click('Delete');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(1));
    // The child stays, now at the top level.
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-level', '1');
    expect(screen.getByRole('treeitem').textContent).toContain('Empty.001');

    act(() => undo());
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(2));
    expect(screen.getAllByRole('treeitem')[1]).toHaveAttribute('aria-level', '2');
    act(() => redo());
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(1));
  });

  it('inline rename: Escape cancels, Enter commits once (one undo step)', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await userEvent.dblClick(await screen.findByRole('treeitem', { name: /Empty/ }));
    await userEvent.type(await screen.findByLabelText('Rename Empty'), 'Bass{Escape}');
    await waitFor(() => expect(screen.queryByLabelText(/^Rename /)).toBeNull());
    expect(names()[0]).toContain('Empty');

    await userEvent.dblClick(screen.getByRole('treeitem', { name: /Empty/ }));
    const input = await screen.findByLabelText('Rename Empty');
    await userEvent.clear(input);
    await userEvent.type(input, 'Bass{Enter}');
    await waitFor(() => expect(names()[0]).toContain('Bass'));
    act(() => undo());
    await waitFor(() => expect(names()[0]).toContain('Empty'));
  });

  it('a selected collection shows only Name and Mute, and Delete moves its items up', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Collection' })).toBeEnabled()
    );
    await click('Add Collection');
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(1));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start')).toBeNull();
    expect(screen.queryByLabelText('Duration')).toBeNull();
    expect(screen.queryByLabelText('Parent')).toBeNull();

    await click('Add Empty');
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(2));
    expect(screen.getAllByRole('treeitem')[1]).toHaveAttribute('aria-level', '2');
    await userEvent.click(screen.getAllByRole('treeitem')[0]);
    await click('Delete');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(1));
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-level', '1');
    expect(screen.getByRole('treeitem').textContent).toContain('Empty');
  });
});

describe('Duplicate Object and Duplicate Linked in Properties (W-77)', () => {
  it('Duplicate Object adds a copy after the original and selects it; Duplicate Linked shares the data', async () => {
    await renderPanels();
    await click('New scene');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Empty' })).toBeEnabled());
    await click('Add Empty');
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(1));
    // Duplicate is a folded section of the Object tab (U6).
    await click('Duplicate section');
    await click('Duplicate Object');
    await waitFor(() => expect(names()).toHaveLength(2));
    expect(screen.getByLabelText('Name')).toHaveValue('Empty.001');
    await click('Duplicate Linked');
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.getByLabelText('Name')).toHaveValue('Empty.001.001');
    // The copy lands after the original in time: starts 0, then 4, then 8.
    expect(screen.getByRole('spinbutton', { name: 'Start' })).toHaveAttribute(
      'aria-valuetext',
      '3.1.1.00'
    );
  });
});

describe('the Used by table in Properties (L5)', () => {
  it('is folded by default, opens sorted by start, marks this one and selects a clicked row', async () => {
    await seedDesk([
      claveBlock(),
      objectBlock('a', { primaryDataRef: { id: 'clave' }, start: 16, duration: 6 }, 'Late'),
      objectBlock('b', { primaryDataRef: { id: 'clave' }, start: 0, duration: 8 }, 'First'),
      objectBlock('d', { primaryDataRef: { id: 'clave' }, start: 4 }, 'Middle'),
      collectionBlock('verse', ['a', 'b'], {}, 'Verse'),
      collectionBlock('chorus', ['d'], {}, 'Chorus'),
      collectionBlock('root', ['verse', 'chorus']),
      sceneBlock('s', 'root'),
    ]);
    writeSceneSession({
      activeSceneId: 's',
      selectedId: 'a',
      usersOpen: false,
      propertiesTab: 'data',
    });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <PropertiesPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    const toggle = await screen.findByRole('button', { name: /Used by 3/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    const body = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(body.map((row) => row.textContent)).toEqual([
      'FirstVerse' + 'bar 1 beat 1' + '2 bars',
      'MiddleChorus' + 'bar 2 beat 1' + '1 bar',
      'Late (this one)Verse' + 'bar 5 beat 1' + '1 bar 2 beats',
    ]);
    await userEvent.click(within(body[0]).getByRole('button', { name: 'First' }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('hrifa.scene-session.v1') ?? '{}').selectedId).toBe(
        'b'
      )
    );
    // The fold state is the viewer's session state.
    expect(JSON.parse(localStorage.getItem('hrifa.scene-session.v1') ?? '{}').usersOpen).toBe(true);
  });
});

describe('the Modifiers section of Properties (O3-ii)', () => {
  async function renderObject(modifiers: ModifierInstance[], withPitchSet = true) {
    await seedDesk([
      claveBlock(),
      ...(withPitchSet ? [pitchSetBlock('P', [6000, 6400, 6700], 'P')] : []),
      objectBlock('o', { primaryDataRef: { id: 'clave' }, modifiers }, 'Obj'),
      collectionBlock('c', ['o']),
      sceneBlock('s', 'c'),
    ]);
    writeSceneSession({ activeSceneId: 's', selectedId: 'o', propertiesTab: 'modifiers' });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <PropertiesPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await screen.findByRole('button', { name: 'Add Modifier' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Modifier' })).toBeEnabled());
  }
  const stack = () =>
    screen.queryAllByRole('button', { name: /^Remove / }).map((button) => button.ariaLabel);

  it('Add Modifier adds at the bottom of the stack', async () => {
    await renderObject([modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })]);
    expect(stack()).toEqual(['Remove Melodicize']);
    await click('Add Modifier');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Harmonize' }));
    await waitFor(() => expect(stack()).toEqual(['Remove Melodicize', 'Remove Harmonize']));
  });

  it('Apply is enabled on the top card only, and the lower one says why', async () => {
    await renderObject([
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', SNAP_TO_PITCH_SET_ID, { set: 'P' }),
    ]);
    expect(screen.getByRole('button', { name: 'Apply Melodicize' })).toBeEnabled();
    const lower = screen.getByRole('button', { name: 'Apply Snap to Pitch Set' });
    expect(lower).toBeDisabled();
    expect(lower.getAttribute('data-info')).toBe('Apply the modifiers above it first.');
    expect(screen.getByRole('button', { name: 'Move Melodicize Up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Snap to Pitch Set Down' })).toBeDisabled();
  });

  it('Apply on the top card bakes a Notes block and the stack shrinks', async () => {
    await renderObject([
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', HARMONIZE_ID, { set: 'P' }),
    ]);
    await click('Apply Melodicize');
    await waitFor(() => expect(stack()).toEqual(['Remove Harmonize']));
    await openTab('Data');
    expect(screen.getByLabelText('Name')).toHaveValue('Clave (applied)');
  });

  it('Apply All clears the stack and is disabled with no modifiers', async () => {
    await renderObject([
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', HARMONIZE_ID, { set: 'P' }),
    ]);
    await click('Apply All');
    await waitFor(() => expect(stack()).toEqual([]));
    expect(screen.getByRole('button', { name: 'Apply All' })).toBeDisabled();
    await openTab('Data');
    expect(screen.getByLabelText('Name')).toHaveValue('Clave (applied)');
  });

  it('a deleted pitch set shows the missing line inside its card', async () => {
    await renderObject([modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })], false);
    expect(await screen.findByText('Melodicize: Pitch set is missing')).toBeInTheDocument();
  });

  it('the On switch mutes a modifier, and Apply on a muted top card says to turn it on', async () => {
    await renderObject([modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })]);
    const on = screen.getByRole('switch', { name: 'Melodicize On' });
    expect(on).toBeChecked();
    await userEvent.click(on);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Melodicize On' })).not.toBeChecked()
    );
    await click('Apply Melodicize');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Turn the modifier on to apply it.'
    );
    expect(stack()).toEqual(['Remove Melodicize']);
  });

  it('a Period edit lands and a bad one shows the refusal', async () => {
    await renderObject([modifierOf('m1', SNAP_TO_PITCH_SET_ID, { set: 'P' })]);
    const period = screen.getByLabelText('Period of Snap to Pitch Set');
    expect(period).toHaveValue('1200');
    await userEvent.clear(period);
    await userEvent.type(period, '-5{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Period must be a number of cents above zero.'
    );
    await userEvent.clear(period);
    await userEvent.type(period, '1300{Enter}');
    await waitFor(() =>
      expect(screen.getByLabelText('Period of Snap to Pitch Set')).toHaveValue('1300')
    );
  });
});

describe('the tabs of Properties (U6)', () => {
  async function renderTabs(session: Parameters<typeof writeSceneSession>[0]) {
    await seedDesk([
      claveBlock(),
      objectBlock('a', { primaryDataRef: { id: 'clave' }, start: 0 }, 'First'),
      objectBlock('b', { primaryDataRef: { id: 'clave' }, start: 4 }, 'Second'),
      collectionBlock('verse', ['a', 'b'], {}, 'Verse'),
      collectionBlock('root', ['verse']),
      sceneBlock('s', 'root'),
    ]);
    writeSceneSession({ activeSceneId: 's', ...session });
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <PropertiesPanel />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await screen.findByRole('tablist');
    // The desk loads asynchronously: wait until the selection is found.
    const first = session.selectedId === 'a' ? 'First' : '';
    await waitFor(() => expect(screen.getByLabelText('Path').textContent).toContain(first));
  }
  const tab = (name: string) => screen.getByRole('tab', { name });
  const dimmed = () =>
    screen
      .getAllByRole('tab')
      .filter((item) => item.getAttribute('aria-disabled') === 'true')
      .map((item) => item.getAttribute('aria-label'));

  it('dims the tabs that do not apply, with the reason on hover, and the rail never changes', async () => {
    await renderTabs({ selectedId: 'a' });
    expect(screen.getAllByRole('tab').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Scene',
      'Collection',
      'Object',
      'Modifiers',
      'Data',
    ]);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    expect(dimmed()).toEqual(['Collection']);
    expect(tab('Collection')).toHaveAttribute(
      'title',
      'Collection: select a collection in the Outliner'
    );
    act(() => writeSceneSession({ selectedId: 'verse' }));
    await waitFor(() => expect(dimmed()).toEqual(['Object', 'Modifiers', 'Data']));
    expect(tab('Object')).toHaveAttribute('title', 'Object: select an object in the Outliner');
    act(() => writeSceneSession({ selectedId: null }));
    await waitFor(() => expect(dimmed()).toEqual(['Collection', 'Object', 'Modifiers', 'Data']));
    expect(tab('Scene')).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByText('Select an object or a collection in the Outliner.')
    ).toBeInTheDocument();
  });

  it('falls back to the tab that applies, and remembers the last tab for an object', async () => {
    await renderTabs({ selectedId: 'a' });
    await openTab('Modifiers');
    expect(tab('Modifiers')).toHaveAttribute('aria-selected', 'true');
    act(() => writeSceneSession({ selectedId: 'verse' }));
    await waitFor(() => expect(tab('Collection')).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
    // A dimmed tab does not open.
    await openTab('Data');
    expect(tab('Collection')).toHaveAttribute('aria-selected', 'true');
    act(() => writeSceneSession({ selectedId: 'b' }));
    await waitFor(() => expect(tab('Modifiers')).toHaveAttribute('aria-selected', 'true'));
    expect(JSON.parse(localStorage.getItem('hrifa.scene-session.v1') ?? '{}').lastObjectTab).toBe(
      'modifiers'
    );
  });

  it('the Scene tab shows the settings', async () => {
    await renderTabs({ selectedId: 'a' });
    await openTab('Scene');
    expect(screen.getByRole('group', { name: 'Pitches in the set' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('s');
  });

  it('the Data row shows the user count, makes a single user copy, and unlinks', async () => {
    await renderTabs({ selectedId: 'a', propertiesTab: 'data' });
    const count = await screen.findByRole('button', { name: 'Make single user' });
    expect(count).toHaveTextContent('2');
    await waitFor(() => expect(count).toBeEnabled());
    await userEvent.click(count);
    await waitFor(() => expect(screen.getByLabelText('Name')).not.toHaveValue('Clave'));
    expect(screen.getByRole('button', { name: 'Make single user' })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Make single user' })).toBeDisabled();
    await click('Unlink');
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New' })).toBeDisabled();
  });

  it('New copies the data-block for this object', async () => {
    await renderTabs({ selectedId: 'a', propertiesTab: 'data' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'New' })).toBeEnabled());
    await click('New');
    await waitFor(() => expect(screen.getByLabelText('Name')).not.toHaveValue('Clave'));
  });
});

import { act, render, screen, userEvent, waitFor, within } from '@test-utils';
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
    await click('Duplicate Object');
    await waitFor(() => expect(names()).toHaveLength(2));
    expect(screen.getByLabelText('Name')).toHaveValue('Empty.001');
    await click('Duplicate Linked');
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.getByLabelText('Name')).toHaveValue('Empty.001.001');
    // The copy lands after the original in time: starts 0, then 4, then 8.
    expect(screen.getByLabelText('Start')).toHaveValue('3.1.0');
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
    writeSceneSession({ activeSceneId: 's', selectedId: 'a', usersOpen: false });
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
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('First'));
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
    writeSceneSession({ activeSceneId: 's', selectedId: 'o' });
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
    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent('Clave (applied)');
  });

  it('Apply All clears the stack and is disabled with no modifiers', async () => {
    await renderObject([
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', HARMONIZE_ID, { set: 'P' }),
    ]);
    await click('Apply All');
    await waitFor(() => expect(stack()).toEqual([]));
    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent('Clave (applied)');
    expect(screen.getByRole('button', { name: 'Apply All' })).toBeDisabled();
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

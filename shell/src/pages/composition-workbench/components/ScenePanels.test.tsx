import { act, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider } from '../desk';
import { seedDesk } from '../deskTestUtils';
import { redo, resetHistory, undo } from '../history';
import { claveBlock } from '../scene/sceneTestHelpers';
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

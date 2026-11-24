import { render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionWorkbenchPage } from '../CompositionWorkbench.page';
import { captureDataBlock } from './dataBlock';
import * as dataBlockModule from './dataBlock';
import { DATA_BLOCK_DEFAULTS_KEY } from './dataBlockPreferences';
import { seedDesk } from './deskTestUtils';
import { canUndo, resetHistory } from './history';
import { storeDefaultScreensets } from './layout/screensetFixtures';
import { packet } from './model';
import { compositionStateKeys } from './usePersistentState';

vi.mock('./dataBlock', async (importOriginal) => {
  const original = await importOriginal<typeof import('./dataBlock')>();
  return { ...original, endEditSession: vi.fn(original.endEditSession) };
});

function dataBlock(id: string, name: string) {
  const result = captureDataBlock({
    id,
    createdAt: '2026-11-11T00:00:00Z',
    name,
    moduleInstance: 'pitch-list',
    packet: packet('list', 'pitch', [{ id: `${id}:0`, value: 60, provenance: [] }]),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.dataBlock;
}

// The dock keeps its own permanent role="status" notice, so the data-block editor's status is found by its text.
const dataBlockStatus = () =>
  screen.getByText('No editor for this data-block yet.').closest('[role="status"]') as HTMLElement;
// The screenset meta-tabs in the footer (the docker tabs have their own, same-named, tabs).
const footerTab = (name: string) =>
  within(screen.getByRole('contentinfo')).getByRole('tab', { name });

async function seed(options: { view?: 'canvas' | 'desk'; collapsed?: boolean } = {}) {
  await seedDesk([dataBlock('block-a', 'Alpha'), dataBlock('block-b', 'Beta')]);
  storeDefaultScreensets({ active: options.view ?? 'desk', detailCollapsed: !!options.collapsed });
}

async function card(name: string) {
  const input = await screen.findByDisplayValue(name);
  return input.closest('div[class*="card"]') as HTMLElement;
}

describe('the bottom panel targets a module or a data-block', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
    vi.mocked(dataBlockModule.endEditSession).mockClear();
  });

  it('still shows a selected module editor, and the data-block slot stays empty', async () => {
    const user = userEvent.setup();
    await seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toBeVisible();
    expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument();
  });

  it('double-clicking a desk card targets that data-block and expands a collapsed panel', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    const alpha = await card('Alpha');
    // Collapse the Detail docker through its own menu first.
    await user.click(screen.getByRole('button', { name: 'Docker menu for Detail' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Collapse' }));
    expect(screen.getByTitle('Expand Detail')).toBeInTheDocument();

    await user.dblClick(within(alpha).getByText(/^list \| pitch/));
    expect(screen.queryByTitle('Expand Detail')).not.toBeInTheDocument();
    const status = dataBlockStatus();
    expect(status).toBeVisible();
    expect(status).toHaveTextContent('No editor for this data-block yet.');
    expect(status).toHaveTextContent('Alpha');
    // The module editors stay mounted, only hidden.
    // Looked up by label, not by role and name: the module panel is parked (visibility hidden) while a data-block is open,
    // and a hidden element has an empty accessible name.
    const pattern = document.querySelector<HTMLElement>('input[aria-label="Generator 1 pattern"]')!;
    expect(pattern).not.toBeNull();
    expect(pattern).not.toBeVisible();
    expect(pattern.closest('[hidden]')).not.toBeNull();
  });

  it('does not open a data-block on a double-click in its name field', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await user.dblClick(await screen.findByDisplayValue('Alpha'));
    expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument();
  });

  it('works from the canvas view too, with the hidden-view rule unchanged', async () => {
    const user = userEvent.setup();
    await seed({ view: 'desk' });
    render(<CompositionWorkbenchPage />);
    await user.dblClick(within(await card('Alpha')).getByText(/^list \| pitch/));
    const canvas = screen.getByLabelText('Composition canvas');
    const hiddenCanvasCell = canvas.closest('[inert]') as HTMLElement;
    expect(hiddenCanvasCell).not.toBeNull();
    expect(hiddenCanvasCell.style.display).not.toBe('none');
    expect(hiddenCanvasCell.style.visibility).toBe('hidden');
    expect(hiddenCanvasCell.style.opacity).toBe('0');
    expect(hiddenCanvasCell.style.pointerEvents).toBe('none');

    await user.click(footerTab('Canvas'));
    expect(dataBlockStatus()).toBeVisible();
    // Selecting a module from the canvas returns the panel to its editor.
    await user.click(
      within(screen.getByLabelText('Composition canvas')).getByRole('button', {
        name: /^Pitch List/,
      })
    );
    expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toBeVisible();
  });

  it('ends the edit session when the target leaves the data-block', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await user.dblClick(within(await card('Alpha')).getByText(/^list \| pitch/));
    expect(dataBlockModule.endEditSession).not.toHaveBeenCalled();

    await user.dblClick(within(await card('Beta')).getByText(/^list \| pitch/));
    expect(dataBlockModule.endEditSession).toHaveBeenCalledWith('block-a');
    expect(dataBlockStatus()).toHaveTextContent('Beta');
  });

  async function openAlpha(user: ReturnType<typeof userEvent.setup>) {
    const alpha = await card('Alpha');
    await user.dblClick(within(alpha).getByText(/^list \| pitch/));
    expect(dataBlockStatus()).toBeVisible();
    return alpha;
  }

  function nothingOpen() {
    expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox', { name: /Pitch values|pattern/ })).toHaveLength(0);
  }

  it('shows a blank panel when the targeted data-block is deleted, and promotes no module', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    const alpha = await openAlpha(user);

    await user.click(within(alpha).getByRole('button', { name: 'Delete' }));
    await user.click(within(alpha).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument()
    );
    expect(dataBlockModule.endEditSession).toHaveBeenCalledWith('block-a');
    nothingOpen();
    expect(localStorage.getItem(compositionStateKeys.editorTarget)).toBe('null');
    expect(localStorage.getItem(compositionStateKeys.activeCompositionModule)).toBe('null');
  });

  it('counts no module as active while a data-block is open', async () => {
    const user = userEvent.setup();
    await seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    expect(screen.getByRole('button', { name: 'Remove Pitch List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play selected module' })).toBeEnabled();

    await user.click(footerTab('Desk'));
    await openAlpha(user);
    expect(screen.getByRole('button', { name: 'Play selected module' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove Pitch List' })).not.toBeInTheDocument();
    // The inspector shows the data-block, not a module.
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('list | pitch', { selector: 'p' })).toBeInTheDocument();
  });

  it('keeps the data-block open when an earlier module add is undone', async () => {
    const user = userEvent.setup();
    await seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List' }));
    await user.click(footerTab('Desk'));
    await openAlpha(user);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(dataBlockStatus()).toHaveTextContent('Alpha');
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
  }, 15_000);

  it('shows a blank panel when the open module is removed, and promotes no other', async () => {
    const user = userEvent.setup();
    await seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove Pitch List' }));
    nothingOpen();
    expect(within(grid).queryByRole('button', { name: /^Pitch List/ })).not.toBeInTheDocument();
  }, 15_000);

  it('shows a blank panel, without errors, when undo removes the open module', async () => {
    const user = userEvent.setup();
    await seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List' }));
    expect(within(grid).queryAllByRole('button', { name: /^Pitch List/ })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: 'Pitch values' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(grid).queryAllByRole('button', { name: /^Pitch List/ })).toHaveLength(1);
    nothingOpen();
    // Redo brings the module back without opening anything on its own.
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(within(grid).queryAllByRole('button', { name: /^Pitch List/ })).toHaveLength(2);
    nothingOpen();
  }, 15_000);

  it('records no history entry for targeting a data-block', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await user.dblClick(within(await card('Alpha')).getByText(/^list \| pitch/));
    expect(dataBlockStatus()).toBeVisible();
    expect(canUndo()).toBe(false);
    expect(localStorage.getItem(compositionStateKeys.editorTarget)).toBe('"block-a"');
  });
});

describe('New data-block', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  async function renderEmptyDesk() {
    storeDefaultScreensets({ active: 'desk', detailCollapsed: true });
    render(<CompositionWorkbenchPage />);
    // Disabled until the desk has loaded, so enabled means ready.
    // The loading view and the loaded view are different elements, so look the button up each time.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'New data-block' })).toBeEnabled(),
      {
        timeout: 10_000,
      }
    );
    return screen.getByRole('button', { name: 'New data-block' });
  }

  it('one click adds an empty note data-block to the desk and opens it in the bottom panel', async () => {
    const user = userEvent.setup();
    await user.click(await renderEmptyDesk());
    // The Notes type has an editor now (K5): its piano roll opens on the empty data-block.
    expect(await screen.findByRole('group', { name: /Notes piano roll; 0 notes/ })).toBeVisible();
    expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument();
    const input = await screen.findByDisplayValue('New data-block');
    expect(input).toBeVisible();
    expect(canUndo()).toBe(true);
    const scope = input.closest('div[class*="card"]') as HTMLElement;
    expect(within(scope).getByRole('button', { name: /Audition/ })).toBeDisabled();
    expect(within(scope).getByRole('button', { name: 'Make source' })).toBeDisabled();
  }, 15_000);

  it('undoing New data-block while it is open leaves a blank panel and promotes no module', async () => {
    const user = userEvent.setup();
    await user.click(await renderEmptyDesk());
    await screen.findByDisplayValue('New data-block');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(screen.queryByDisplayValue('New data-block')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('No editor for this data-block yet.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox', { name: /Pitch values|pattern/ })).toHaveLength(0);
    expect(localStorage.getItem(compositionStateKeys.activeCompositionModule)).toBe('null');
  }, 15_000);

  it('uses the stored defaults for the one click', async () => {
    const user = userEvent.setup();
    localStorage.setItem(DATA_BLOCK_DEFAULTS_KEY, JSON.stringify({ typeId: 'notes', bars: 2 }));
    await user.click(await renderEmptyDesk());
    await screen.findByDisplayValue('New data-block');
    expect(screen.getByText(/· 8 qn/)).toBeVisible();
  }, 15_000);
});

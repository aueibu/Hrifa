import { render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionWorkbenchPage } from '../CompositionWorkbench.page';
import { CLIP_DEFAULTS_KEY } from './clipPreferences';
import { canUndo, resetHistory } from './history';
import { packet } from './model';
import { captureSnippet } from './snippet';
import * as snippetModule from './snippet';
import { compositionStateKeys } from './usePersistentState';

vi.mock('./snippet', async (importOriginal) => {
  const original = await importOriginal<typeof import('./snippet')>();
  return { ...original, endEditSession: vi.fn(original.endEditSession) };
});

function clip(id: string, name: string) {
  const result = captureSnippet({
    id,
    createdAt: '2026-11-11T00:00:00Z',
    name,
    moduleInstance: 'pitch-list',
    packet: packet('list', 'pitch', [{ id: `${id}:0`, value: 60, provenance: [] }]),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.snippet;
}

function seed(options: { view?: 'canvas' | 'desk'; collapsed?: boolean } = {}) {
  localStorage.setItem(
    compositionStateKeys.desk,
    JSON.stringify([clip('clip-a', 'Alpha'), clip('clip-b', 'Beta')])
  );
  localStorage.setItem(compositionStateKeys.workspaceView, JSON.stringify(options.view ?? 'desk'));
  localStorage.setItem(compositionStateKeys.detailCollapsed, JSON.stringify(!!options.collapsed));
}

async function card(name: string) {
  const input = await screen.findByDisplayValue(name);
  return input.closest('div[class*="card"]') as HTMLElement;
}

describe('the bottom panel targets a module or a clip', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
    vi.mocked(snippetModule.endEditSession).mockClear();
  });

  it('still shows a selected module editor, and the clip slot stays empty', async () => {
    const user = userEvent.setup();
    seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toBeVisible();
    expect(screen.queryByText('No editor for this clip yet.')).not.toBeInTheDocument();
  });

  it('double-clicking a desk card targets that clip and expands a collapsed panel', async () => {
    const user = userEvent.setup();
    seed({ collapsed: true });
    render(<CompositionWorkbenchPage />);
    const alpha = await card('Alpha');
    expect(screen.getByRole('button', { name: 'Show detail panel' })).toBeInTheDocument();

    await user.dblClick(within(alpha).getByText(/^list \| pitch/));
    expect(screen.getByRole('button', { name: 'Hide detail panel' })).toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toBeVisible();
    expect(status).toHaveTextContent('No editor for this clip yet.');
    expect(status).toHaveTextContent('Alpha');
    // The module editors stay mounted, only hidden.
    const pattern = screen.getByRole('textbox', { name: 'Generator 1 pattern', hidden: true });
    expect(pattern).not.toBeVisible();
    expect(pattern.closest('[hidden]')).not.toBeNull();
  });

  it('does not open a clip on a double-click in its name field', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    await user.dblClick(await screen.findByDisplayValue('Alpha'));
    expect(screen.queryByText('No editor for this clip yet.')).not.toBeInTheDocument();
  });

  it('works from the canvas view too, with the hidden-view rule unchanged', async () => {
    const user = userEvent.setup();
    seed({ view: 'desk' });
    render(<CompositionWorkbenchPage />);
    await user.dblClick(within(await card('Alpha')).getByText(/^list \| pitch/));
    const canvas = screen.getByLabelText('Composition canvas');
    const hiddenCanvasCell = canvas.closest('[inert]') as HTMLElement;
    expect(hiddenCanvasCell).not.toBeNull();
    expect(hiddenCanvasCell.style.display).not.toBe('none');
    expect(hiddenCanvasCell.style.visibility).toBe('hidden');
    expect(hiddenCanvasCell.style.opacity).toBe('0');
    expect(hiddenCanvasCell.style.pointerEvents).toBe('none');

    await user.click(screen.getByRole('radio', { name: /canvas/i }));
    expect(screen.getByRole('status')).toBeVisible();
    // Selecting a module from the canvas returns the panel to its editor.
    await user.click(
      within(screen.getByLabelText('Composition canvas')).getByRole('button', {
        name: /^Pitch List/,
      })
    );
    expect(screen.queryByText('No editor for this clip yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toBeVisible();
  });

  it('ends the edit session when the target leaves the clip', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    await user.dblClick(within(await card('Alpha')).getByText(/^list \| pitch/));
    expect(snippetModule.endEditSession).not.toHaveBeenCalled();

    await user.dblClick(within(await card('Beta')).getByText(/^list \| pitch/));
    expect(snippetModule.endEditSession).toHaveBeenCalledWith('clip-a');
    expect(screen.getByRole('status')).toHaveTextContent('Beta');
  });

  async function openAlpha(user: ReturnType<typeof userEvent.setup>) {
    const alpha = await card('Alpha');
    await user.dblClick(within(alpha).getByText(/^list \| pitch/));
    expect(screen.getByRole('status')).toBeVisible();
    return alpha;
  }

  function nothingOpen() {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox', { name: /Pitch values|pattern/ })).toHaveLength(0);
  }

  it('shows a blank panel when the targeted clip is deleted, and promotes no module', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    const alpha = await openAlpha(user);

    await user.click(within(alpha).getByRole('button', { name: 'Delete' }));
    await user.click(within(alpha).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(snippetModule.endEditSession).toHaveBeenCalledWith('clip-a');
    nothingOpen();
    expect(localStorage.getItem(compositionStateKeys.editorClipTarget)).toBe('null');
    expect(localStorage.getItem(compositionStateKeys.activeCompositionModule)).toBe('null');
  });

  it('counts no module as active while a clip is open', async () => {
    const user = userEvent.setup();
    seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    expect(screen.getByRole('button', { name: 'Remove Pitch List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play selected module' })).toBeEnabled();

    await user.click(screen.getByRole('radio', { name: /desk/i }));
    await openAlpha(user);
    expect(screen.getByRole('button', { name: 'Play selected module' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove Pitch List' })).not.toBeInTheDocument();
    // The inspector shows the clip, not a module.
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('list | pitch', { selector: 'p' })).toBeInTheDocument();
  });

  it('keeps the clip open when an earlier module add is undone', async () => {
    const user = userEvent.setup();
    seed({ view: 'canvas' });
    render(<CompositionWorkbenchPage />);
    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List' }));
    await user.click(screen.getByRole('radio', { name: /desk/i }));
    await openAlpha(user);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Alpha');
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
  }, 15_000);

  it('shows a blank panel when the open module is removed, and promotes no other', async () => {
    const user = userEvent.setup();
    seed({ view: 'canvas' });
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
    seed({ view: 'canvas' });
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

  it('records no history entry for targeting a clip', async () => {
    const user = userEvent.setup();
    seed();
    render(<CompositionWorkbenchPage />);
    await user.dblClick(within(await card('Alpha')).getByText(/^list \| pitch/));
    expect(screen.getByRole('status')).toBeVisible();
    expect(canUndo()).toBe(false);
    expect(localStorage.getItem(compositionStateKeys.editorClipTarget)).toBe('"clip-a"');
  });
});

describe('New clip', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  async function renderEmptyDesk() {
    localStorage.setItem(compositionStateKeys.workspaceView, JSON.stringify('desk'));
    localStorage.setItem(compositionStateKeys.detailCollapsed, JSON.stringify(true));
    render(<CompositionWorkbenchPage />);
    // Disabled until the desk has loaded, so enabled means ready.
    // The loading view and the loaded view are different elements, so look the button up each time.
    await waitFor(() => expect(screen.getByRole('button', { name: 'New clip' })).toBeEnabled(), {
      timeout: 10_000,
    });
    return screen.getByRole('button', { name: 'New clip' });
  }

  it('one click adds an empty note clip to the desk and opens it in the bottom panel', async () => {
    const user = userEvent.setup();
    await user.click(await renderEmptyDesk());
    // The Notes type has an editor now (K5): its piano roll opens on the empty clip.
    expect(
      await screen.findByRole('group', { name: /Note clip piano roll; 0 notes/ })
    ).toBeVisible();
    expect(screen.queryByText('No editor for this clip yet.')).not.toBeInTheDocument();
    const input = await screen.findByDisplayValue('New clip');
    expect(input).toBeVisible();
    expect(canUndo()).toBe(true);
    const scope = input.closest('div[class*="card"]') as HTMLElement;
    expect(within(scope).getByRole('button', { name: /Audition/ })).toBeDisabled();
    expect(within(scope).getByRole('button', { name: 'Make source' })).toBeDisabled();
  }, 15_000);

  it('undoing New clip while it is open leaves a blank panel and promotes no module', async () => {
    const user = userEvent.setup();
    await user.click(await renderEmptyDesk());
    await screen.findByDisplayValue('New clip');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByDisplayValue('New clip')).not.toBeInTheDocument());
    expect(screen.queryByText('No editor for this clip yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox', { name: /Pitch values|pattern/ })).toHaveLength(0);
    expect(localStorage.getItem(compositionStateKeys.activeCompositionModule)).toBe('null');
  }, 15_000);

  it('uses the stored defaults for the one click', async () => {
    const user = userEvent.setup();
    localStorage.setItem(CLIP_DEFAULTS_KEY, JSON.stringify({ typeId: 'notes', bars: 2 }));
    await user.click(await renderEmptyDesk());
    await screen.findByDisplayValue('New clip');
    expect(screen.getByText(/· 8 qn/)).toBeVisible();
  }, 15_000);
});

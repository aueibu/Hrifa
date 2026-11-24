import { fireEvent, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { dockerHolding, parseScreensetStore, type ScreensetStore } from '../../../lib/stage';
import { CompositionWorkbenchPage } from '../../CompositionWorkbench.page';
import { canUndo, resetHistory } from '../history';
import { compositionStateKeys } from '../usePersistentState';
import { storeDefaultScreensets } from './screensetFixtures';
import { WORKBENCH_KNOWN_IDS } from './workbenchScreensets';

const footerTab = (name: string) =>
  within(screen.getByRole('contentinfo')).getByRole('tab', { name });

function storedStore(): ScreensetStore {
  const raw = localStorage.getItem(compositionStateKeys.screensets);
  if (raw === null) {
    throw new Error('no screenset store was stored');
  }
  return parseScreensetStore(raw, WORKBENCH_KNOWN_IDS, {
    fallback: undefined as unknown as ScreensetStore,
  });
}

function clearProject() {
  localStorage.clear();
  resetHistory();
}

describe('the workbench center on the dock Stage', () => {
  beforeEach(clearProject);

  it('keeps the canvas and every module editor mounted when screensets flip, and outputs still reach a routed module', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const canvas = screen.getByLabelText('Composition canvas');

    // Route the rhythm from Interference into Melodicization (22 notes with the default resultant).
    await user.click(within(canvas).getByRole('button', { name: /^Melodicization/ }));
    await user.click(screen.getByRole('button', { name: 'Rhythm source' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Interference' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Resultant' }));
    await user.click(screen.getByRole('button', { name: 'Pitch source' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List · Pitches' }));
    expect(screen.getByText('22 notes', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    const editorBefore = document.querySelector('input[aria-label="Generator 1 pattern"]');
    expect(editorBefore).not.toBeNull();

    // Desk and Edit screensets: the canvas is the very same element afterwards, parked then back.
    await user.click(footerTab('Desk'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New data-block' })).toBeVisible()
    );
    expect(canvas.closest('[inert]')).not.toBeNull();
    // Interference changes its resultant while the Desk screenset shows: Melodicization still gets it.
    fireEvent.change(document.querySelector('input[aria-label="Generator 1 pattern"]')!, {
      target: { value: '4' },
    });
    expect(
      screen.queryByText('22 notes', { selector: '.mantine-Badge-label' })
    ).not.toBeInTheDocument();
    await user.click(footerTab('Edit'));
    await user.click(footerTab('Canvas'));

    expect(screen.getByLabelText('Composition canvas')).toBe(canvas);
    expect(canvas.closest('[inert]')).toBeNull();
    expect(document.querySelector('input[aria-label="Generator 1 pattern"]')).toBe(editorBefore);
    // flipping screensets is layout, never an undo step
    expect(canUndo()).toBe(true); // the routing above is
    resetHistory();
    await user.click(footerTab('Desk'));
    await user.click(footerTab('Canvas'));
    expect(canUndo()).toBe(false);
  }, 40_000);

  it('restores the active screenset and a docker sent elsewhere after a reload', async () => {
    const user = userEvent.setup();
    const first = render(<CompositionWorkbenchPage />);
    await user.click(footerTab('Desk'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New data-block' })).toBeVisible()
    );

    // Send the desk to the Tools docker from its tab's context menu.
    const deskTab = within(screen.getByRole('region', { name: 'Desk' })).getByRole('tab', {
      name: 'Desk',
    });
    fireEvent.contextMenu(deskTab);
    await user.click(await screen.findByRole('menuitem', { name: 'Tools' }));
    await waitFor(() =>
      expect(dockerHolding(storedStore().screensets.desk.tree, 'desk')?.name).toBe('Tools')
    );
    expect(canUndo()).toBe(false);
    first.unmount();

    // A reload: the same project storage, a fresh page.
    render(<CompositionWorkbenchPage />);
    expect(footerTab('Desk')).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('region', { name: 'Tools' })).getByRole('tab', { name: 'Desk' })
    ).toBeInTheDocument();
    expect(storedStore().active).toBe('desk');
  }, 40_000);

  it('clears the open data-block target when its data-block is deleted while the data-block editor tab is closed', async () => {
    const user = userEvent.setup();
    storeDefaultScreensets({ active: 'desk' });
    render(<CompositionWorkbenchPage />);
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'New data-block' })).toBeEnabled(),
      {
        timeout: 10_000,
      }
    );
    await user.click(screen.getByRole('button', { name: 'New data-block' }));
    const input = await screen.findByDisplayValue('New data-block');
    expect(localStorage.getItem(compositionStateKeys.editorTarget)).not.toBe('null');

    // Close the Data-block editor tab, so nothing of the editor panel is mounted.
    fireEvent.contextMenu(
      within(screen.getByRole('region', { name: 'Detail' })).getByRole('tab', {
        name: 'Data-block editor',
      })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Close Data-block editor' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Detail' })).queryByRole('tab', {
          name: 'Data-block editor',
        })
      ).not.toBeInTheDocument()
    );

    const card = input.closest('div[class*="card"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Delete' }));
    await user.click(within(card).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(localStorage.getItem(compositionStateKeys.editorTarget)).toBe('null')
    );
  }, 40_000);
});

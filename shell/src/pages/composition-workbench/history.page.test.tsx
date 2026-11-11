import { render, screen, userEvent, within } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { CompositionWorkbenchPage } from '../CompositionWorkbench.page';
import { canUndo, resetHistory } from './history';
import { compositionStateKeys } from './usePersistentState';

describe('workbench page history', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  it('undoes and redoes a generator edit, typed as one burst', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const pattern = screen.getByRole('textbox', { name: 'Generator 1 pattern' });
    const original = (pattern as HTMLInputElement).value;
    await user.click(pattern);
    await user.clear(pattern);
    await user.keyboard('7'); // not type(): it clicks first, and a click ends the burst
    expect(pattern).toHaveValue('7');

    await user.keyboard('{Control>}z{/Control}');
    expect(pattern).toHaveValue(original);
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(pattern).toHaveValue('7');
  }, 15_000);

  it('records a module add as one step and undoes it', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    const count = () => within(grid).queryAllByRole('button', { name: /^Pitch List/ }).length;
    expect(count()).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List' }));
    expect(count()).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(count()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(count()).toBe(2);
  }, 15_000);

  it('restores a deleted module with its state, and removes it again on redo', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    const values = screen.getByRole('textbox', { name: 'Pitch values' });
    await user.clear(values);
    await user.type(values, '61, 62');
    const stateKey = compositionStateKeys.pitchValues;
    const stored = localStorage.getItem(stateKey);
    expect(stored).toContain('61');

    await user.click(screen.getByRole('button', { name: 'Remove Pitch List' }));
    expect(within(grid).queryByRole('button', { name: /^Pitch List/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(stateKey)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(grid).getByRole('button', { name: /^Pitch List/ })).toBeInTheDocument();
    expect(localStorage.getItem(stateKey)).toBe(stored);
    await user.click(within(grid).getByRole('button', { name: /^Pitch List/ }));
    expect(screen.getByRole('textbox', { name: 'Pitch values' })).toHaveValue('61, 62');

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(within(grid).queryByRole('button', { name: /^Pitch List/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(stateKey)).toBeNull();
  }, 20_000);

  it('undoes a canvas move (Tidy) in one step', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const positions = () => localStorage.getItem(compositionStateKeys.compositionInstances);
    const before = positions();
    await user.click(screen.getByRole('button', { name: 'Tidy' }));
    const after = positions();
    expect(after).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(positions()).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(positions()).toBe(after);
  }, 15_000);

  it('undoes and redoes connecting two modules', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    const routes = () => localStorage.getItem(compositionStateKeys.moduleRouteStates);
    await user.click(within(grid).getByRole('button', { name: /^Melodicization/ }));
    const before = routes();
    await user.click(screen.getByRole('button', { name: 'Rhythm source' }));
    const direct = screen.queryByRole('menuitem', { name: 'Interference · Resultant' });
    if (direct) {
      await user.click(direct);
    } else {
      await user.click(await screen.findByRole('menuitem', { name: 'Interference' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Resultant' }));
    }
    const after = routes();
    expect(after).not.toBe(before);
    expect(after).toContain('"instanceId":"interference"');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(routes()).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(routes()).toBe(after);
  }, 20_000);

  it('makes selection and view changes no history', async () => {
    const user = userEvent.setup();
    render(<CompositionWorkbenchPage />);
    const grid = screen.getByLabelText('Composition canvas');
    await user.click(within(grid).getByRole('button', { name: /^Melodicization/ }));
    await user.click(within(grid).getByRole('button', { name: /^Interference/ }));
    await user.click(screen.getByRole('button', { name: 'Hide inspector' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(canUndo()).toBe(false);
  }, 15_000);
});

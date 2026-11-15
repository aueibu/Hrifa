/** The screenset meta-tab strip: roving keyboard, add, rename, duplicate, delete (never the last). */
import { useState } from 'react';
import { act, render, screen, userEvent, waitFor, within } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import { makeDocker, makeScreenset, makeStore, type ScreensetStore } from '../../../lib/stage';
import {
  addScreenset,
  deleteScreenset,
  duplicateScreenset,
  renameScreenset,
  setActiveScreenset,
} from './screensetStore';
import { ScreensetTabs } from './ScreensetTabs';

vi.setConfig({ testTimeout: 15_000 });

const set = (id: string, name: string) =>
  makeScreenset({ id, name, tree: makeDocker('d1', 'Main', ['canvas']) });
const three = () => makeStore([set('x', 'Canvas'), set('y', 'Desk'), set('z', 'Edit')], 'x');

function Host({ initial = three() }: { initial?: ScreensetStore }) {
  const [st, setSt] = useState(initial);
  return (
    <>
      <ScreensetTabs
        store={st}
        onActivate={(id) => setSt((s) => setActiveScreenset(s, id))}
        onAdd={() => setSt((s) => addScreenset(s))}
        onRename={(id, name) => setSt((s) => renameScreenset(s, id, name))}
        onDuplicate={(id) => setSt((s) => duplicateScreenset(s, id))}
        onDelete={(id) => setSt((s) => deleteScreenset(s, id))}
      />
      <output data-testid="store">{JSON.stringify(st)}</output>
    </>
  );
}
const stored = () => JSON.parse(screen.getByTestId('store').textContent!) as ScreensetStore;
const tab = (name: string) => screen.getByRole('tab', { name });
const active = () => document.activeElement as HTMLElement | null;
const names = () =>
  within(screen.getByRole('tablist'))
    .getAllByRole('tab')
    .map((t) => t.textContent);

describe('ScreensetTabs', () => {
  it('shows one tab per screenset in order, the active one selected, one Tab stop', () => {
    render(<Host />);
    expect(names()).toEqual(['Canvas', 'Desk', 'Edit']);
    expect(tab('Canvas')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
  });

  it('a click activates through the callback', async () => {
    const onActivate = vi.fn();
    render(
      <ScreensetTabs
        store={three()}
        onActivate={onActivate}
        onAdd={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await userEvent.click(tab('Edit'));
    expect(onActivate).toHaveBeenCalledWith('z');
  });

  it('arrows, Home and End move focus without activating; Enter and Space activate', async () => {
    render(<Host />);
    act(() => tab('Canvas').focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(active()).toBe(tab('Desk'));
    expect(stored().active).toBe('x');
    await userEvent.keyboard('{End}');
    expect(active()).toBe(tab('Edit'));
    await userEvent.keyboard('{ArrowRight}'); // wraps
    expect(active()).toBe(tab('Canvas'));
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    expect(stored().active).toBe('z');
    await userEvent.keyboard('{Home} ');
    expect(stored().active).toBe('x');
    expect(tab('Canvas')).toHaveAttribute('tabindex', '0');
  });

  it('keeps the add and menu buttons out of the tablist', () => {
    render(<Host />);
    const list = screen.getByRole('tablist');
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    expect(list.contains(screen.getByRole('button', { name: 'Add screenset' }))).toBe(false);
    expect(list.contains(screen.getByRole('button', { name: 'Menu for Canvas' }))).toBe(false);
  });

  it('adds a screenset (a copy of the active one) and focuses its tab', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Add screenset' }));
    expect(names()).toEqual(['Canvas', 'Desk', 'Edit', 'Screenset 4']);
    expect(stored().active).toBe('s4');
    expect(active()).toBe(tab('Screenset 4'));
  });

  it('duplicates the active screenset right after it', async () => {
    render(<Host />);
    await userEvent.click(tab('Desk'));
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Desk' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(names()).toEqual(['Canvas', 'Desk', 'Desk copy', 'Edit']);
    expect(stored().active).toBe('s4');
  });

  it('renames through a prompt that refuses an empty or taken name', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Canvas' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename...' }));
    const input = await screen.findByRole('textbox', { name: 'Screenset name' });
    expect(input).toHaveValue('Canvas');
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(await screen.findByText('Enter a name for the screenset.')).toBeInTheDocument();
    await userEvent.type(input, 'desk{Enter}');
    expect(await screen.findByText('A screenset named "desk" already exists.')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'Arrange{Enter}');
    await waitFor(() => expect(names()).toEqual(['Arrange', 'Desk', 'Edit']));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(active()).toBe(screen.getByRole('button', { name: 'Menu for Arrange' }));
  });

  it('deletes the active screenset, activating a neighbour, but never the last one', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Canvas' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(names()).toEqual(['Desk', 'Edit']);
    expect(stored().active).toBe('y');
    expect(active()).toBe(tab('Desk'));

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Desk' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(names()).toEqual(['Edit']);
    await userEvent.click(screen.getByRole('button', { name: 'Menu for Edit' }));
    expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(names()).toEqual(['Edit']);
  });
});

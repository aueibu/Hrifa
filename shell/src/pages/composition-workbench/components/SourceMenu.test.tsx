import { useState } from 'react';
import { render, screen, userEvent } from '@test-utils';
import { buildSourceTree, SourceMenu, type SourceOption } from './SourceMenu';

const options: SourceOption[] = [
  {
    value: 'int|resultant',
    label: 'Interference · Resultant',
    path: ['Interference', 'Resultant'],
  },
  { value: 'int|g1', label: 'Interference · Generator 1', path: ['Interference', 'Generator 1'] },
  { value: 'pl|pitches', label: 'Pitch List · Pitches', path: ['Pitch List', 'Pitches'] },
  {
    value: 'sc|seq|0',
    label: 'Scale Construction · Sequence · Mode 1',
    path: ['Scale Construction', 'Sequence', 'Mode 1'],
  },
  {
    value: 'sc|seq|1',
    label: 'Scale Construction · Sequence · Mode 2',
    path: ['Scale Construction', 'Sequence', 'Mode 2'],
  },
];

describe('buildSourceTree', () => {
  const tree = buildSourceTree(options);

  it('groups outputs under their module, in order', () => {
    expect(tree.map((node) => node.label)).toEqual([
      'Interference',
      'Pitch List · Pitches',
      'Scale Construction · Sequence',
    ]);
    expect(tree[0].children.map((node) => node.label)).toEqual(['Resultant', 'Generator 1']);
  });

  it('collapses a module with a single output into one pickable item', () => {
    expect(tree[1].option?.value).toBe('pl|pitches');
    expect(tree[1].children).toEqual([]);
  });

  it('keeps bank entries as a submenu of the collapsed output', () => {
    expect(tree[2].option).toBeUndefined();
    expect(tree[2].children.map((node) => node.label)).toEqual(['Mode 1', 'Mode 2']);
  });
});

function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <SourceMenu
      label="Rhythm source"
      placeholder="Connect a rhythm"
      options={[
        ...options,
        {
          value: 'gone|x',
          label: 'Missing source · x',
          path: ['Missing source', 'x'],
          disabled: true,
        },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

describe('SourceMenu', () => {
  it('shows the placeholder, then the picked source', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Rhythm source' });
    expect(trigger).toHaveTextContent('Connect a rhythm');

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Pitch List · Pitches' }));
    expect(trigger).toHaveTextContent('Pitch List · Pitches');
  });

  it('opens a module to its outputs on click, three levels deep for bank entries', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Rhythm source' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Scale Construction · Sequence' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Mode 2' }));

    expect(screen.getByRole('button', { name: 'Rhythm source' })).toHaveTextContent(
      'Scale Construction · Sequence · Mode 2'
    );
  });

  it('can disconnect, and never offers a missing source as a choice', async () => {
    const user = userEvent.setup();
    render(<Harness initial="gone|x" />);
    const trigger = screen.getByRole('button', { name: 'Rhythm source' });
    // The missing source stays visible as the current value...
    expect(trigger).toHaveTextContent('Missing source · x');

    await user.click(trigger);
    // ...but is not in the menu.
    expect(screen.queryByRole('menuitem', { name: /Missing source/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    expect(trigger).toHaveTextContent('Connect a rhythm');
  });
});

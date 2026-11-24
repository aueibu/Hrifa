import { useEffect, useRef } from 'react';
import { act, render, screen, userEvent, waitFor, within } from '@test-utils';
import { CompositionSettingsProvider } from '../compositionSettings';
import { acceptsCompositionInstances, type CompositionNodeInstance } from '../compositionWorkspace';
import { DataBlockOpsProvider } from '../dataBlockOps';
import { registerReferencer, type Referencer } from '../dataBlocks/dataBlockRefs';
import { DATA_BLOCK_SCHEMA_VERSION, type PacketBlock } from '../dataBlocks/registry';
import { DeskProvider, useDesk } from '../desk';
import { resetHistory, undo } from '../history';
import { packet } from '../model';
import { usePersistentState } from '../usePersistentState';
import { DataBlockSourceNode } from './DataBlockSourceNode';
import { DeskView } from './DeskView';

vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: async () => undefined, subscribe: () => () => undefined }),
}));
// The node view reads its runner's evaluation; there is no runner here.
vi.mock('../runtime/evaluationStore', () => ({
  useNodeEvaluationResult: () => ({ outputs: [] }),
}));

function block(id: string, name: string, typeId: string, values: number[]): PacketBlock {
  const domain = typeId === 'rhythm' ? 'duration' : 'pitch';
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id,
    typeId,
    name,
    createdAt: '2026-11-24T00:00:00Z',
    payload: {
      kind: 'packet',
      packet: packet(
        'list',
        domain,
        values.map((value, index) => ({ id: `${id}:${index}`, value, provenance: [] }))
      ),
    },
  };
}

const CLAVE = block('clave', 'Clave', 'rhythm', [3, 3, 4, 2, 4]);
const TRESILLO = block('tresillo', 'Tresillo', 'rhythm', [3, 3, 2]);
const RING = block('ring', 'Ring A', 'pitch-set', [6000, 6200]);
const MELODY = block('melody', 'Melody', 'pitch-set', [6400, 6500]);
const DERIVED: PacketBlock = {
  ...block('derived', 'Clave shifted', 'rhythm', [4, 4, 2]),
  lineage: {
    head: 'v0',
    versions: [{ id: 'v0', parentId: null, at: '2026-11-24T00:00:00Z', operation: 'rotate' }],
    derivedFrom: { dataBlockId: 'clave', versionId: null, operation: 'rotate' },
  },
};

function source(id: string, dataBlockId?: string): CompositionNodeInstance {
  return { id, nodeId: 'data-block-source', x: 0, y: 0, ...(dataBlockId ? { dataBlockId } : {}) };
}

let counter = 0;

function Seed({ blocks }: { blocks: PacketBlock[] }) {
  const { addDataBlock, loading } = useDesk();
  const done = useRef(false);
  useEffect(() => {
    if (!loading && !done.current) {
      done.current = true;
      blocks.forEach(addDataBlock);
    }
  }, [addDataBlock, blocks, loading]);
  return null;
}

function Page({
  blocks,
  instances,
  storageKey,
}: {
  blocks: PacketBlock[];
  instances: CompositionNodeInstance[];
  storageKey: string;
}) {
  const [current, setCurrent] = usePersistentState<CompositionNodeInstance[]>(
    storageKey,
    instances,
    acceptsCompositionInstances,
    undefined,
    { coalesce: false }
  );
  return (
    <CompositionSettingsProvider>
      <DeskProvider>
        <Seed blocks={blocks} />
        <DataBlockOpsProvider instances={current} setInstances={setCurrent}>
          <DeskView />
          {current.map((instance) => (
            <section key={instance.id} aria-label={`node ${instance.id}`}>
              <DataBlockSourceNode
                instanceId={instance.id}
                instanceLabel={instance.id}
                dataBlockId={instance.dataBlockId}
              />
            </section>
          ))}
          <div data-testid="instances">
            {JSON.stringify(current.map((instance) => [instance.id, instance.dataBlockId ?? null]))}
          </div>
        </DataBlockOpsProvider>
      </DeskProvider>
    </CompositionSettingsProvider>
  );
}

async function setup(blocks: PacketBlock[], instances: CompositionNodeInstance[]) {
  localStorage.clear();
  counter += 1;
  render(<Page blocks={blocks} instances={instances} storageKey={`test.instances.${counter}`} />);
  await waitFor(() =>
    expect(screen.getAllByLabelText('Data-block name')).toHaveLength(blocks.length)
  );
  act(() => resetHistory());
}

const names = () =>
  screen.getAllByLabelText<HTMLInputElement>('Data-block name').map((input) => input.value);
const instancesOf = () =>
  JSON.parse(screen.getByTestId('instances').textContent ?? '[]') as [string, string | null][];
function card(name: string) {
  const input = screen
    .getAllByLabelText<HTMLInputElement>('Data-block name')
    .find((candidate) => candidate.value === name);
  if (!input) {
    throw new Error(`No card named ${name}`);
  }
  return input.closest('div[class*="card"]') as HTMLElement;
}
const node = (id: string) => screen.getByRole('region', { name: `node ${id}` });

describe('Make source node states and the data-block menu (B2)', () => {
  it('swaps its data-block in place and keeps the node', async () => {
    const user = userEvent.setup();
    await setup([CLAVE, TRESILLO, RING], [source('n1', 'clave')]);
    await user.click(within(node('n1')).getByRole('button', { name: 'Choose data-block' }));
    const dialog = within(node('n1')).getByRole('dialog', { name: 'Choose data-block' });
    // A Make source takes every packet type: all three are listed, with their user counts.
    expect(within(dialog).getByText(/Clave/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ring A/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Search data-blocks'), 'tres');
    expect(within(dialog).queryByText(/Ring A/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Tresillo/ }));
    expect(instancesOf()).toEqual([['n1', 'tresillo']]);
    expect(within(node('n1')).getByText('Tresillo')).toBeInTheDocument();
    expect(screen.queryByText(/A copy kept on the desk/)).not.toBeInTheDocument();
  });

  it('Unlink gives the blank state and its own wording; a deleted data-block gives the missing state', async () => {
    const user = userEvent.setup();
    await setup([CLAVE, RING], [source('n1', 'clave'), source('n2', 'ring')]);
    await user.click(within(node('n1')).getByRole('button', { name: 'Unlink' }));
    expect(instancesOf()).toEqual([
      ['n1', null],
      ['n2', 'ring'],
    ]);
    expect(within(node('n1')).getAllByText('No data-block chosen').length).toBeGreaterThan(0);
    expect(within(node('n1')).queryByText(/no longer on the desk/)).not.toBeInTheDocument();
    expect(within(node('n1')).getByRole('button', { name: 'Unlink' })).toBeDisabled();
    // The unlinked data-block is still on the desk and now has no users.
    expect(names()).toEqual(['Clave', 'Ring A']);

    const ring = card('Ring A');
    await user.click(within(ring).getByRole('button', { name: 'Delete' }));
    await user.click(within(ring).getByRole('button', { name: 'Confirm delete' }));
    expect(names()).toEqual(['Clave']);
    expect(
      within(node('n2')).getByText('This data-block is no longer on the desk')
    ).toBeInTheDocument();
    // The node stays and can be pointed at another data-block, or its users repointed.
    expect(instancesOf()[1]).toEqual(['n2', 'ring']);
  });

  it('repoints the users of a deleted data-block with Replace everywhere', async () => {
    const user = userEvent.setup();
    await setup([CLAVE, TRESILLO], [source('n1', 'clave'), source('n2', 'clave')]);
    const clave = card('Clave');
    await user.click(within(clave).getByRole('button', { name: 'Delete' }));
    await user.click(within(clave).getByRole('button', { name: 'Confirm delete' }));
    await user.click(within(node('n1')).getByRole('button', { name: 'Replace everywhere with' }));
    await user.click(
      within(within(node('n1')).getByRole('dialog', { name: 'Replace everywhere with' })).getByRole(
        'button',
        { name: /Tresillo/ }
      )
    );
    expect(
      within(node('n1')).getByText('Replace it in 2 places with Tresillo?')
    ).toBeInTheDocument();
    await user.click(within(node('n1')).getByRole('button', { name: 'Replace everywhere' }));
    expect(instancesOf()).toEqual([
      ['n1', 'tresillo'],
      ['n2', 'tresillo'],
    ]);
  });
});

describe('the desk card: users, delete impact, make single user, unused and purge (B2)', () => {
  const collectionRoles = [{ role: 'rhythm', id: 'clave' }];
  const strip = { id: 'S1', dataBlockId: 'clave' };
  const removers: (() => void)[] = [];
  const collection: Referencer = {
    name: 'collection-sim',
    refs: () =>
      collectionRoles.map((entry) => ({
        ownerKind: 'collection-sim',
        ownerId: 'C1',
        label: 'Collection C1 (rhythm)',
        ref: { id: entry.id },
        slot: entry.role,
      })),
    repoint: (project) => project,
  };
  const stripReferencer: Referencer = {
    name: 'strip-sim',
    refs: () => [
      {
        ownerKind: 'strip-sim',
        ownerId: strip.id,
        label: 'bar 9 (strip)',
        ref: { id: strip.dataBlockId },
      },
    ],
    repoint: (project) => project,
  };

  afterEach(() => {
    removers.splice(0).forEach((remove) => remove());
  });

  it('the delete confirm lists the three users of Clave and, apart, what is derived from it', async () => {
    removers.push(registerReferencer(collection), registerReferencer(stripReferencer));
    const user = userEvent.setup();
    await setup([CLAVE, DERIVED, RING], [source('n1', 'clave')]);
    const clave = card('Clave');
    expect(within(clave).getByRole('button', { name: 'Used by 3' })).toBeInTheDocument();
    await user.click(within(clave).getByRole('button', { name: 'Delete' }));
    const text = within(clave).getByText(/Used by 3:/).textContent ?? '';
    expect(text).toContain('Data-block (node)');
    expect(text).toContain('Collection C1 (rhythm)');
    expect(text).toContain('bar 9 (strip)');
    expect(within(clave).getByText(/Derived from it: Clave shifted/)).toBeInTheDocument();
    // Still two clicks: nothing was deleted by the first.
    expect(names()).toEqual(['Clave', 'Clave shifted', 'Ring A']);
    await user.click(within(clave).getByRole('button', { name: 'Confirm delete' }));
    expect(names()).toEqual(['Clave shifted', 'Ring A']);
  });

  it('Make single user from the count repoints only that node, and one undo reverses it', async () => {
    const user = userEvent.setup();
    await setup([CLAVE, RING], [source('n1', 'clave'), source('n2', 'clave')]);
    const clave = card('Clave');
    await user.click(within(clave).getByRole('button', { name: 'Used by 2' }));
    const row = within(clave).getByText('Data-block 1 (node)').parentElement as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Make single user' }));
    const [first, second] = instancesOf();
    expect(first[1]).not.toBe('clave');
    expect(first[1]).toMatch(/^data-block-/);
    expect(second).toEqual(['n2', 'clave']);
    expect(names()).toEqual(['Clave', 'Clave (variation)', 'Ring A']);
    expect(within(card('Clave')).getByRole('button', { name: 'Used by 1' })).toBeInTheDocument();

    // One undo step restores the desk and the instance together.
    act(() => undo());
    await waitFor(() => expect(names()).toEqual(['Clave', 'Ring A']));
    expect(instancesOf()).toEqual([
      ['n1', 'clave'],
      ['n2', 'clave'],
    ]);
  });

  it('Make single user is disabled with a reason at one user', async () => {
    const user = userEvent.setup();
    await setup([CLAVE], [source('n1', 'clave')]);
    await user.click(within(card('Clave')).getByRole('button', { name: 'Used by 1' }));
    const button = within(card('Clave')).getByRole('button', { name: 'Make single user' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-info', expect.stringContaining('already single user'));
  });

  it('Unused filters to what nothing uses; Purge lists exactly that, then deletes exactly that', async () => {
    const user = userEvent.setup();
    await setup([CLAVE, RING, MELODY], [source('n1', 'clave')]);
    await user.click(screen.getByRole('button', { name: 'Unused (2)' }));
    expect(names()).toEqual(['Ring A', 'Melody']);
    await user.click(screen.getByRole('button', { name: 'Unused (2)' }));
    expect(names()).toEqual(['Clave', 'Ring A', 'Melody']);

    await user.click(screen.getByRole('button', { name: 'Purge unused' }));
    const list = screen.getByText('Delete these 2 unused data-blocks?')
      .parentElement as HTMLElement;
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Ring A', 'Melody']);
    // Listing the purge deletes nothing; only the confirm does.
    expect(names()).toEqual(['Clave', 'Ring A', 'Melody']);
    await user.click(within(list).getByRole('button', { name: 'Confirm purge' }));
    expect(names()).toEqual(['Clave']);
    expect(instancesOf()).toEqual([['n1', 'clave']]);
  });

  it('Replace everywhere with on a card shows the count first, then repoints every node', async () => {
    const user = userEvent.setup();
    await setup([CLAVE, TRESILLO], [source('n1', 'clave'), source('n2', 'clave')]);
    const clave = card('Clave');
    await user.click(within(clave).getByRole('button', { name: 'Replace Clave everywhere with' }));
    await user.click(
      within(
        within(clave).getByRole('dialog', { name: 'Replace Clave everywhere with' })
      ).getByRole('button', { name: /Tresillo/ })
    );
    expect(await screen.findByText('Replace Clave in 2 places with Tresillo?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(instancesOf()).toEqual([
      ['n1', 'tresillo'],
      ['n2', 'tresillo'],
    ]);
    expect(names()).toEqual(['Clave', 'Tresillo']);
  });
});

import { act, render, renderHook, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { NewDataBlockPopover } from './components/NewDataBlockPopover';
import { CompositionSettingsProvider } from './compositionSettings';
import { acceptsDataBlocks, pitchClassConversionRefusal } from './dataBlock';
import {
  DATA_BLOCK_DEFAULTS_KEY,
  readDataBlockDefaults,
  writeDataBlockDefaults,
} from './dataBlockPreferences';
import {
  auditionRefusal,
  barsLength,
  blankDataBlock,
  dataBlockEditorOf,
  dataBlockTypeOf,
  listDataBlockTypes,
  makeSourceRefusal,
  nextDataBlockName,
  registerDataBlockEditor,
  registerDataBlockType,
} from './dataBlockTypes';
import { DeskProvider, useDesk } from './desk';
import { renderDesk, storedDesk } from './deskTestUtils';
import { canUndo, resetHistory, undo } from './history';
import { rational } from './musicalTime';

const length = rational(4);
const request = {
  id: 'blank-1',
  createdAt: '2026-11-11T00:00:00Z',
  name: 'New data-block',
  length,
};

describe('the data-block-type registry', () => {
  it('lists Notes only for now', () => {
    expect(listDataBlockTypes().map((type) => type.label)).toEqual(['Notes']);
  });

  it('makes every registered blank data-block a valid packet accepted by acceptsDataBlocks', () => {
    for (const type of listDataBlockTypes()) {
      const dataBlock = type.createBlank(request);
      expect(acceptsDataBlocks([dataBlock])).toBe(true);
      expect(dataBlock.packet.kind).toBe(type.kind);
      expect(dataBlock.packet.domain).toBe(type.domain);
      expect(dataBlock.packet.items).toEqual([]);
      expect(dataBlock.lineage).toBeUndefined();
    }
  });

  it('makes a blank note data-block empty events | note with a linear frame from origin 0', () => {
    const dataBlock = dataBlockTypeOf({ kind: 'events', domain: 'note' })!.createBlank({
      ...request,
      length: barsLength('6/8', 2),
    });
    expect(dataBlock.packet.frame).toMatchObject({
      topology: 'linear',
      unit: 'quarterNote',
      extent: 6,
      origin: 0,
    });
    expect(dataBlock.packet.frame?.musicalExtent?.quarterNotes).toEqual(rational(6));
  });

  it('measures bars of the meter exactly', () => {
    expect(barsLength('4/4', 1)).toEqual(rational(4));
    expect(barsLength('7/8', 1)).toEqual(rational(7, 2));
  });

  it('refuses or disables unsupported actions on an empty data-block', () => {
    const dataBlock = dataBlockTypeOf({ kind: 'events', domain: 'note' })!.createBlank(request);
    expect(pitchClassConversionRefusal(dataBlock)).toMatch(/nothing to convert/);
    expect(auditionRefusal(dataBlock)).toMatch(/empty/);
    expect(makeSourceRefusal(dataBlock)).toMatch(/empty/);
  });

  it('names new data-blocks New data-block, New data-block 2, ...', () => {
    const named = (name: string) => ({ ...request, name });
    const a = blankDataBlock(named('New data-block'), { kind: 'events', domain: 'note' });
    const b = blankDataBlock(named('New data-block 2'), { kind: 'events', domain: 'note' });
    expect(nextDataBlockName([])).toBe('New data-block');
    expect(nextDataBlockName([a])).toBe('New data-block 2');
    expect(nextDataBlockName([a, b])).toBe('New data-block 3');
  });

  it('adds a type with no desk or persistence change', async () => {
    const remove = registerDataBlockType({
      id: 'throwaway',
      label: 'Throwaway',
      kind: 'list',
      domain: 'duration',
      editorId: 'throwaway-editor',
      playable: false,
      createBlank: (req) =>
        blankDataBlock(req, { kind: 'list', domain: 'duration', role: 'interOnset' }),
    });
    const removeEditor = registerDataBlockEditor('throwaway-editor', () => null);
    try {
      expect(listDataBlockTypes().map((type) => type.id)).toContain('throwaway');
      resetHistory();
      const { result } = await renderDesk();
      let made: ReturnType<typeof result.current.addBlankDataBlock> = null;
      act(() => {
        made = result.current.addBlankDataBlock('throwaway', length);
      });
      expect(made).not.toBeNull();
      expect(result.current.dataBlocks).toHaveLength(1);
      expect(dataBlockEditorOf(result.current.dataBlocks[0])).toBeDefined();
      expect(auditionRefusal(result.current.dataBlocks[0])).toMatch(/Only note/);
      const stored = await storedDesk(result.current);
      expect(stored).toHaveLength(1);
      expect(stored[0].packet.domain).toBe('duration');
    } finally {
      remove();
      removeEditor();
    }
    expect(listDataBlockTypes().map((type) => type.id)).not.toContain('throwaway');
  });
});

describe('desk.addBlankDataBlock', () => {
  beforeEach(() => resetHistory());

  it('adds one undoable step, stores no lineage and persists', async () => {
    const { result } = await renderDesk();
    let first: ReturnType<typeof result.current.addBlankDataBlock> = null;
    let second: ReturnType<typeof result.current.addBlankDataBlock> = null;
    act(() => {
      first = result.current.addBlankDataBlock('notes', length);
      second = result.current.addBlankDataBlock('notes', length);
    });
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.name)).toEqual([
      'New data-block',
      'New data-block 2',
    ]);
    expect(first!.lineage).toBeUndefined();
    expect(result.current.dataBlocks.every((dataBlock) => dataBlock.lineage === undefined)).toBe(
      true
    );
    expect(acceptsDataBlocks(await storedDesk(result.current))).toBe(true);
    expect(canUndo()).toBe(true);
    act(() => undo());
    expect(result.current.dataBlocks).toHaveLength(1);
    act(() => undo());
    expect(result.current.dataBlocks).toHaveLength(0);
    expect(second).not.toBeNull();
  });

  it('returns null for an unknown type and adds nothing', async () => {
    const { result } = await renderDesk();
    act(() => {
      expect(result.current.addBlankDataBlock('nope', length)).toBeNull();
    });
    expect(result.current.dataBlocks).toHaveLength(0);
    expect(canUndo()).toBe(false);
  });
});

describe('registry replacement', () => {
  it('restores a replaced type when the replacement is removed', () => {
    const original = listDataBlockTypes().find((type) => type.id === 'notes')!;
    const remove = registerDataBlockType({ ...original, label: 'Replaced' });
    expect(listDataBlockTypes().find((type) => type.id === 'notes')?.label).toBe('Replaced');
    remove();
    expect(listDataBlockTypes().find((type) => type.id === 'notes')).toBe(original);
    expect(listDataBlockTypes()).toHaveLength(1);
  });
});

describe('desk.addBlankDataBlock while the desk cannot take it', () => {
  beforeEach(() => resetHistory());

  it('is refused while the desk is loading', () => {
    const { result } = renderHook(() => useDesk(), { wrapper: DeskProvider });
    expect(result.current.loading).toBe(true);
    act(() => {
      expect(result.current.addBlankDataBlock('notes', length)).toBeNull();
    });
    expect(result.current.dataBlocks).toHaveLength(0);
    expect(canUndo()).toBe(false);
  });

  it('is refused on a locked desk', async () => {
    const seed = await renderDesk();
    act(() => seed.result.current.addBlankDataBlock('notes', length));
    await storedDesk(seed.result.current);
    seed.unmount();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hrifa-workbench');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('desk-data-blocks', 'readwrite');
        const all = tx.objectStore('desk-data-blocks').getAll();
        all.onsuccess = () => {
          for (const record of all.result) {
            tx.objectStore('desk-data-blocks').put({ ...record, schemaVersion: 2 });
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    resetHistory();
    const { result } = await renderDesk();
    expect(result.current.locked).toBe(true);
    act(() => {
      expect(result.current.addBlankDataBlock('notes', length)).toBeNull();
    });
    expect(result.current.dataBlocks).toHaveLength(0);
    expect(canUndo()).toBe(false);
  });
});

describe('the New data-block control', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  function Harness({ onCreated }: { onCreated(name: string): void }) {
    return (
      <CompositionSettingsProvider>
        <DeskProvider>
          <NewDataBlockPopover onCreated={(dataBlock) => onCreated(dataBlock.name)} />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
  }

  it('is disabled with a reason while the desk loads, then one click creates a data-block', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    render(<Harness onCreated={(name) => created.push(name)} />);
    const button = screen.getByRole('button', { name: 'New data-block' });
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-info')).toMatch(/loading/);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New data-block' })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: 'New data-block' }));
    expect(created).toEqual(['New data-block']);
    expect(canUndo()).toBe(true);
  });

  it('keeps the defaults per viewer: outside history and under a non-workbench key', async () => {
    const user = userEvent.setup();
    render(<Harness onCreated={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New data-block' })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: 'New data-block defaults' }));
    const bars = await screen.findByRole('textbox', { name: 'Length (bars)' });
    await user.clear(bars);
    await user.type(bars, '3');
    expect(readDataBlockDefaults()).toEqual({ typeId: 'notes', bars: 3 });
    expect(JSON.parse(localStorage.getItem(DATA_BLOCK_DEFAULTS_KEY)!)).toEqual({
      typeId: 'notes',
      bars: 3,
    });
    expect(DATA_BLOCK_DEFAULTS_KEY.startsWith('hrifa.composition-workbench.')).toBe(false);
    expect(canUndo()).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
  });

  it('reads damaged or out-of-range stored defaults as the defaults', () => {
    localStorage.setItem(DATA_BLOCK_DEFAULTS_KEY, JSON.stringify({ typeId: 'notes', bars: 500 }));
    expect(readDataBlockDefaults().bars).toBe(1);
    localStorage.setItem(DATA_BLOCK_DEFAULTS_KEY, '{nope');
    expect(readDataBlockDefaults()).toEqual({ typeId: 'notes', bars: 1 });
    writeDataBlockDefaults({ bars: 2 });
    expect(readDataBlockDefaults().bars).toBe(2);
  });
});

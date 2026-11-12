import { act, render, renderHook, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLIP_DEFAULTS_KEY, readClipDefaults, writeClipDefaults } from './clipPreferences';
import {
  auditionRefusal,
  barsLength,
  blankSnippet,
  clipEditorOf,
  clipTypeOf,
  listClipTypes,
  makeSourceRefusal,
  nextClipName,
  registerClipEditor,
  registerClipType,
} from './clipTypes';
import { NewClipPopover } from './components/NewClipPopover';
import { CompositionSettingsProvider } from './compositionSettings';
import { DeskProvider, useDesk } from './desk';
import { renderDesk, storedDesk } from './deskTestUtils';
import { canUndo, resetHistory, undo } from './history';
import { rational } from './musicalTime';
import { acceptsSnippets, pitchClassConversionRefusal } from './snippet';

const length = rational(4);
const request = { id: 'blank-1', createdAt: '2026-11-11T00:00:00Z', name: 'New clip', length };

describe('the clip-type registry', () => {
  it('lists Notes only for now', () => {
    expect(listClipTypes().map((type) => type.label)).toEqual(['Notes']);
  });

  it('makes every registered blank clip a valid packet accepted by acceptsSnippets', () => {
    for (const type of listClipTypes()) {
      const clip = type.createBlank(request);
      expect(acceptsSnippets([clip])).toBe(true);
      expect(clip.packet.kind).toBe(type.kind);
      expect(clip.packet.domain).toBe(type.domain);
      expect(clip.packet.items).toEqual([]);
      expect(clip.lineage).toBeUndefined();
    }
  });

  it('makes a blank note clip empty events | note with a linear frame from origin 0', () => {
    const clip = clipTypeOf({ kind: 'events', domain: 'note' })!.createBlank({
      ...request,
      length: barsLength('6/8', 2),
    });
    expect(clip.packet.frame).toMatchObject({
      topology: 'linear',
      unit: 'quarterNote',
      extent: 6,
      origin: 0,
    });
    expect(clip.packet.frame?.musicalExtent?.quarterNotes).toEqual(rational(6));
  });

  it('measures bars of the meter exactly', () => {
    expect(barsLength('4/4', 1)).toEqual(rational(4));
    expect(barsLength('7/8', 1)).toEqual(rational(7, 2));
  });

  it('refuses or disables unsupported actions on an empty clip', () => {
    const clip = clipTypeOf({ kind: 'events', domain: 'note' })!.createBlank(request);
    expect(pitchClassConversionRefusal(clip)).toMatch(/nothing to convert/);
    expect(auditionRefusal(clip)).toMatch(/empty/);
    expect(makeSourceRefusal(clip)).toMatch(/empty/);
  });

  it('names new clips New clip, New clip 2, ...', () => {
    const named = (name: string) => ({ ...request, name });
    const a = blankSnippet(named('New clip'), { kind: 'events', domain: 'note' });
    const b = blankSnippet(named('New clip 2'), { kind: 'events', domain: 'note' });
    expect(nextClipName([])).toBe('New clip');
    expect(nextClipName([a])).toBe('New clip 2');
    expect(nextClipName([a, b])).toBe('New clip 3');
  });

  it('adds a type with no desk or persistence change', async () => {
    const remove = registerClipType({
      id: 'throwaway',
      label: 'Throwaway',
      kind: 'list',
      domain: 'duration',
      editorId: 'throwaway-editor',
      playable: false,
      createBlank: (req) =>
        blankSnippet(req, { kind: 'list', domain: 'duration', role: 'interOnset' }),
    });
    const removeEditor = registerClipEditor('throwaway-editor', () => null);
    try {
      expect(listClipTypes().map((type) => type.id)).toContain('throwaway');
      resetHistory();
      const { result } = await renderDesk();
      let made: ReturnType<typeof result.current.addBlankClip> = null;
      act(() => {
        made = result.current.addBlankClip('throwaway', length);
      });
      expect(made).not.toBeNull();
      expect(result.current.snippets).toHaveLength(1);
      expect(clipEditorOf(result.current.snippets[0])).toBeDefined();
      expect(auditionRefusal(result.current.snippets[0])).toMatch(/Only note/);
      const stored = await storedDesk(result.current);
      expect(stored).toHaveLength(1);
      expect(stored[0].packet.domain).toBe('duration');
    } finally {
      remove();
      removeEditor();
    }
    expect(listClipTypes().map((type) => type.id)).not.toContain('throwaway');
  });
});

describe('desk.addBlankClip', () => {
  beforeEach(() => resetHistory());

  it('adds one undoable step, stores no lineage and persists', async () => {
    const { result } = await renderDesk();
    let first: ReturnType<typeof result.current.addBlankClip> = null;
    let second: ReturnType<typeof result.current.addBlankClip> = null;
    act(() => {
      first = result.current.addBlankClip('notes', length);
      second = result.current.addBlankClip('notes', length);
    });
    expect(result.current.snippets.map((clip) => clip.name)).toEqual(['New clip', 'New clip 2']);
    expect(first!.lineage).toBeUndefined();
    expect(result.current.snippets.every((clip) => clip.lineage === undefined)).toBe(true);
    expect(acceptsSnippets(await storedDesk(result.current))).toBe(true);
    expect(canUndo()).toBe(true);
    act(() => undo());
    expect(result.current.snippets).toHaveLength(1);
    act(() => undo());
    expect(result.current.snippets).toHaveLength(0);
    expect(second).not.toBeNull();
  });

  it('returns null for an unknown type and adds nothing', async () => {
    const { result } = await renderDesk();
    act(() => {
      expect(result.current.addBlankClip('nope', length)).toBeNull();
    });
    expect(result.current.snippets).toHaveLength(0);
    expect(canUndo()).toBe(false);
  });
});

describe('registry replacement', () => {
  it('restores a replaced type when the replacement is removed', () => {
    const original = listClipTypes().find((type) => type.id === 'notes')!;
    const remove = registerClipType({ ...original, label: 'Replaced' });
    expect(listClipTypes().find((type) => type.id === 'notes')?.label).toBe('Replaced');
    remove();
    expect(listClipTypes().find((type) => type.id === 'notes')).toBe(original);
    expect(listClipTypes()).toHaveLength(1);
  });
});

describe('desk.addBlankClip while the desk cannot take it', () => {
  beforeEach(() => resetHistory());

  it('is refused while the desk is loading', () => {
    const { result } = renderHook(() => useDesk(), { wrapper: DeskProvider });
    expect(result.current.loading).toBe(true);
    act(() => {
      expect(result.current.addBlankClip('notes', length)).toBeNull();
    });
    expect(result.current.snippets).toHaveLength(0);
    expect(canUndo()).toBe(false);
  });

  it('is refused on a locked desk', async () => {
    const seed = await renderDesk();
    act(() => seed.result.current.addBlankClip('notes', length));
    await storedDesk(seed.result.current);
    seed.unmount();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hrifa-composition-workbench');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('desk-clips', 'readwrite');
        const all = tx.objectStore('desk-clips').getAll();
        all.onsuccess = () => {
          for (const record of all.result) {
            tx.objectStore('desk-clips').put({ ...record, schemaVersion: 2 });
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
      expect(result.current.addBlankClip('notes', length)).toBeNull();
    });
    expect(result.current.snippets).toHaveLength(0);
    expect(canUndo()).toBe(false);
  });
});

describe('the New clip control', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  function Harness({ onCreated }: { onCreated(name: string): void }) {
    return (
      <CompositionSettingsProvider>
        <DeskProvider>
          <NewClipPopover onCreated={(clip) => onCreated(clip.name)} />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
  }

  it('is disabled with a reason while the desk loads, then one click creates a clip', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    render(<Harness onCreated={(name) => created.push(name)} />);
    const button = screen.getByRole('button', { name: 'New clip' });
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-info')).toMatch(/loading/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New clip' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'New clip' }));
    expect(created).toEqual(['New clip']);
    expect(canUndo()).toBe(true);
  });

  it('keeps the defaults per viewer: outside history and under a non-workbench key', async () => {
    const user = userEvent.setup();
    render(<Harness onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New clip' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'New clip defaults' }));
    const bars = await screen.findByRole('textbox', { name: 'Length (bars)' });
    await user.clear(bars);
    await user.type(bars, '3');
    expect(readClipDefaults()).toEqual({ typeId: 'notes', bars: 3 });
    expect(JSON.parse(localStorage.getItem(CLIP_DEFAULTS_KEY)!)).toEqual({
      typeId: 'notes',
      bars: 3,
    });
    expect(CLIP_DEFAULTS_KEY.startsWith('hrifa.composition-workbench.')).toBe(false);
    expect(canUndo()).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
  });

  it('reads damaged or out-of-range stored defaults as the defaults', () => {
    localStorage.setItem(CLIP_DEFAULTS_KEY, JSON.stringify({ typeId: 'notes', bars: 500 }));
    expect(readClipDefaults().bars).toBe(1);
    localStorage.setItem(CLIP_DEFAULTS_KEY, '{nope');
    expect(readClipDefaults()).toEqual({ typeId: 'notes', bars: 1 });
    writeClipDefaults({ bars: 2 });
    expect(readClipDefaults().bars).toBe(2);
  });
});

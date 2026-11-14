/** Presets: the pure rules (switch, key, parse) and the defensive store. */
import { describe, expect, it } from 'vitest';
import { createRegistry, type Layout } from '../../lib/stage';
import {
  initialStore,
  layoutOf,
  loadPresets,
  parsePresets,
  presetForKey,
  PRESETS_STORAGE_KEY,
  savePresets,
  serializePresets,
  switchPreset,
  type PresetDef,
} from './presets';

const L = (...slots: string[]): Layout => ({
  version: 1,
  columns: slots.map((s) => ({ slots: [s], width: 24 })),
});
const defs: PresetDef[] = [
  { id: 'sketch', label: 'Sketch', layout: L('a') },
  { id: 'audition', label: 'Audition', layout: L('a', 'b') },
];
const known = createRegistry([
  {
    id: 'a',
    title: 'A',
    sizes: [{ width: 'narrow', height: 'short' }],
    minSize: { width: 'narrow', height: 'short' },
  },
  {
    id: 'b',
    title: 'B',
    sizes: [{ width: 'narrow', height: 'short' }],
    minSize: { width: 'narrow', height: 'short' },
  },
]);

describe('presets', () => {
  it('starts on the first preset at its default layout', () => {
    const s = initialStore(defs);
    expect(s.active).toBe('sketch');
    expect(layoutOf(s, defs, 'audition')).toEqual(defs[1].layout);
    expect(initialStore([])).toEqual({ active: '', layouts: {} });
  });

  it('saves the current layout into the one it leaves, and keeps it for the way back', () => {
    const edited = L('b', 'a');
    const s1 = switchPreset(initialStore(defs), defs, 'audition', edited);
    expect(s1.active).toBe('audition');
    expect(layoutOf(s1, defs, 'sketch')).toEqual(edited);
    const back = switchPreset(s1, defs, 'sketch', L('a', 'b', 'a'));
    expect(back.active).toBe('sketch');
    expect(layoutOf(back, defs, 'audition')).toEqual(L('a', 'b', 'a'));
  });

  it('ignores an unknown preset', () => {
    const s = switchPreset(initialStore(defs), defs, 'nope', L('b'));
    expect(s.active).toBe('sketch');
  });

  it('maps Alt+digit to the nth preset and nothing else', () => {
    const key = (code: string, mods: Partial<KeyboardEvent> = {}) => ({
      code,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...mods,
    });
    expect(presetForKey(key('Digit1'), defs)).toBe('sketch');
    expect(presetForKey(key('Digit2'), defs)).toBe('audition');
    expect(presetForKey(key('Digit3'), defs)).toBeNull();
    expect(presetForKey(key('Digit1', { altKey: false }), defs)).toBeNull();
    expect(presetForKey(key('Digit1', { ctrlKey: true }), defs)).toBeNull();
    expect(presetForKey(key('KeyA'), defs)).toBeNull();
  });

  it('parses stored text defensively and drops unknown modules', () => {
    expect(parsePresets('not json', defs, known)).toEqual(initialStore(defs));
    expect(parsePresets(null, defs, known)).toEqual(initialStore(defs));
    const raw = JSON.stringify({
      active: 'audition',
      layouts: { sketch: L('ghost', 'b'), other: L('a') },
    });
    const s = parsePresets(raw, defs, known);
    expect(s.active).toBe('audition');
    expect(layoutOf(s, defs, 'sketch').columns.map((c) => c.slots)).toEqual([['b']]);
    expect(layoutOf(s, defs, 'audition')).toEqual(defs[1].layout);
    expect(s.layouts.other).toBeUndefined();
    expect(parsePresets(JSON.stringify({ active: 'zzz' }), defs, known).active).toBe('sketch');
  });

  it('round-trips through storage under the hrifa.stage. prefix and survives a throwing store', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const store = switchPreset(initialStore(defs), defs, 'audition', L('b'));
    expect(savePresets(storage, store)).toBe(true);
    expect([...data.keys()]).toEqual([PRESETS_STORAGE_KEY]);
    expect(PRESETS_STORAGE_KEY.startsWith('hrifa.stage.')).toBe(true);
    expect(loadPresets(storage, defs, known)).toEqual(
      parsePresets(serializePresets(store), defs, known)
    );
    const broken = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    };
    expect(savePresets(broken, store)).toBe(false);
    expect(savePresets(undefined, store)).toBe(false);
    expect(loadPresets(broken, defs, known)).toEqual(initialStore(defs));
  });
});

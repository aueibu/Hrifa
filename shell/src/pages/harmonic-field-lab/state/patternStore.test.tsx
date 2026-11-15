import { act } from 'react';
import { render, screen } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { PRESET_PATTERNS } from '../../../lib/harmonic-field';
import { useLab } from './context';
import { LabProvider, restoreState } from './LabProvider';
import { labReducer } from './labState';
import { MAX_PATTERNS, defaultPatterns } from './patterns';
import { loadPatterns, patternsToStored, sanitizePatterns, savePatterns } from './patternStore';
import { KEY_CHORDFINDER, KEY_PATTERNS, KEY_SETTINGS, sanitizeSettings } from './persist';

const defaults = [...PRESET_PATTERNS];
const list = (l: string[]) => ({ list: l, refusal: null });

describe('patterns.v1 store', () => {
  beforeEach(() => window.localStorage.clear());

  it('round trips through plain JSON', () => {
    const s = list(['2-3-2', '2-2', '1-1']);
    const json = JSON.parse(JSON.stringify(patternsToStored(s))) as unknown;
    expect(json).toEqual({
      version: 1,
      patterns: [{ text: '2-3-2' }, { text: '2-2' }, { text: '1-1' }],
    });
    expect(sanitizePatterns(json).list).toEqual(s.list);
    expect(savePatterns(s)).toBe(true);
    expect(loadPatterns().list).toEqual(s.list);
  });

  it('bad data falls back to the defaults; a stored empty list stays empty', () => {
    for (const bad of [undefined, null, 5, 'x', [], { patterns: 'x' }, { version: 1 }]) {
      expect(sanitizePatterns(bad).list).toEqual(defaults);
    }
    const allBad = { patterns: [{ text: '0' }, 7, null, { text: 'a-b' }] };
    expect(sanitizePatterns(allBad).list).toEqual(defaults);
    expect(sanitizePatterns({ patterns: [] }).list).toEqual([]);
    window.localStorage.setItem(KEY_PATTERNS, '{not json');
    expect(loadPatterns().list).toEqual(defaults);
  });

  it('sanitises entry by entry: bad dropped, good kept, canonical, no duplicates, capped', () => {
    const raw = {
      patterns: [
        { text: ' 2-3 ' },
        { text: '10' },
        '3-3',
        { text: '2-3' },
        { x: 1 },
        { text: '2-2' },
      ],
    };
    expect(sanitizePatterns(raw).list).toEqual(['2-3', '3-3', '2-2']);
    const many = {
      patterns: Array.from({ length: 200 }, (_, i) => ({
        text: `${(i % 9) + 1}-${(Math.floor(i / 9) % 9) + 1}-${Math.floor(i / 81) + 1}`,
      })),
    };
    expect(sanitizePatterns(many).list).toHaveLength(MAX_PATTERNS);
  });

  it('restoring the defaults after edits gives the preset list again', () => {
    let s = restoreState();
    s = labReducer(s, { type: 'patterns/delete', at: 0 });
    s = labReducer(s, { type: 'patterns/restore' });
    expect(s.patterns.list).toEqual(defaults);
  });

  it('restoreState reads patterns.v1 without writing; chordfinder.v1 is read only for templates', () => {
    window.localStorage.setItem(
      KEY_CHORDFINDER,
      JSON.stringify({ templates: [{ text: '4:5:6', name: 'major' }] })
    );
    window.localStorage.setItem(KEY_PATTERNS, JSON.stringify(patternsToStored(list(['2-3-2']))));
    const before = JSON.stringify({ ...window.localStorage });
    const s = restoreState();
    expect(s.patterns.list).toEqual(['2-3-2']);
    expect(s.templates.map((t) => t.text)).toEqual(['4:5:6']);
    expect(JSON.stringify({ ...window.localStorage })).toBe(before);
  });

  it('old chordfinder data alone: default patterns, patterns.v1 never created, chordfinder untouched', () => {
    const old = JSON.stringify({ templates: [{ text: '4:5:6' }] });
    window.localStorage.setItem(KEY_CHORDFINDER, old);
    const s = restoreState();
    expect(s.patterns).toEqual(defaultPatterns());
    expect(window.localStorage.getItem(KEY_PATTERNS)).toBeNull();
    expect(window.localStorage.getItem(KEY_CHORDFINDER)).toBe(old);
    // saving the patterns never touches chordfinder.v1
    savePatterns(list(['2-2']));
    expect(window.localStorage.getItem(KEY_CHORDFINDER)).toBe(old);
  });
});

describe('ui.positionalPattern in settings.v1', () => {
  beforeEach(() => window.localStorage.clear());

  it('is optional: absent or damaged is null, a valid text is kept canonical; no write on mount', () => {
    expect(sanitizeSettings({}).positionalPattern).toBeNull();
    expect(sanitizeSettings({ positionalPattern: 5 }).positionalPattern).toBeNull();
    expect(sanitizeSettings({ positionalPattern: '2--3' }).positionalPattern).toBeNull();
    expect(sanitizeSettings({ positionalPattern: '2-3-2' }).positionalPattern).toBe('2-3-2');
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ tol: 20 }));
    const before = window.localStorage.getItem(KEY_SETTINGS);
    restoreState();
    expect(window.localStorage.getItem(KEY_SETTINGS)).toBe(before);
  });
});

function Probe() {
  const { state, dispatch } = useLab();
  return (
    <div>
      <div data-testid="list">{state.patterns.list.join('|')}</div>
      <button type="button" onClick={() => dispatch({ type: 'patterns/add', text: '2-3-2' })}>
        add
      </button>
    </div>
  );
}

describe('patterns in the provider', () => {
  beforeEach(() => window.localStorage.clear());

  it('no write on mount; an add is saved; a storage event takes the other window list', () => {
    render(
      <LabProvider>
        <Probe />
      </LabProvider>
    );
    expect(window.localStorage.getItem(KEY_PATTERNS)).toBeNull();
    act(() => screen.getByText('add').click());
    expect(screen.getByTestId('list').textContent).toBe([...defaults, '2-3-2'].join('|'));
    const saved = JSON.parse(window.localStorage.getItem(KEY_PATTERNS) as string) as {
      patterns: { text: string }[];
    };
    expect(saved.patterns.at(-1)).toEqual({ text: '2-3-2' });
    window.localStorage.setItem(
      KEY_PATTERNS,
      JSON.stringify(patternsToStored(list(['3-3', '1-1'])))
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY_PATTERNS }));
    });
    expect(screen.getByTestId('list').textContent).toBe('3-3|1-1');
  });
});

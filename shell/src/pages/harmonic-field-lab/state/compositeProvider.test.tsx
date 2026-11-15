import { act } from 'react';
import { render, screen } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { ratioNote } from '../../../lib/harmonic-field';
import { addItem, emptyComposites, addComposite } from './composites';
import { compositesToStored } from './compositeStore';
import { useLab } from './context';
import { LabProvider, restoreState } from './LabProvider';
import { KEY_COMPOSITES } from './persist';

const withNames = (names: string[]) => {
  let s = emptyComposites();
  for (const name of names) {
    s = addComposite(s, '', name);
    s = addItem(
      s,
      s.recent[0],
      {
        kind: 'chord',
        label: 'c',
        pitches: [ratioNote(1, 1), ratioNote(3, 2)],
        rep: ratioNote(2, 1),
      },
      ''
    );
  }
  return s;
};

function Probe() {
  const { state, dispatch } = useLab();
  return (
    <div>
      <div data-testid="names">{state.composites.list.map((c) => c.name).join('|')}</div>
      <button
        type="button"
        onClick={() =>
          dispatch({ type: 'composite/new', date: '2026-11-15T10:00:00.000Z', name: 'Fresh' })
        }
      >
        new
      </button>
    </div>
  );
}

describe('composites in the provider', () => {
  beforeEach(() => window.localStorage.clear());

  it('restoreState loads the stored composites without writing', () => {
    window.localStorage.setItem(
      KEY_COMPOSITES,
      JSON.stringify(compositesToStored(withNames(['A'])))
    );
    const before = window.localStorage.getItem(KEY_COMPOSITES);
    const s = restoreState();
    expect(s.composites.list.map((c) => c.name)).toEqual(['A']);
    expect(window.localStorage.getItem(KEY_COMPOSITES)).toBe(before);
  });

  it('writes nothing on mount, saves on change, and takes another window’s composites on a storage event', () => {
    render(
      <LabProvider>
        <Probe />
      </LabProvider>
    );
    expect(window.localStorage.getItem(KEY_COMPOSITES)).toBeNull();
    act(() => screen.getByText('new').click());
    expect(screen.getByTestId('names').textContent).toBe('Fresh');
    expect(JSON.parse(window.localStorage.getItem(KEY_COMPOSITES)!).composites).toHaveLength(1);
    window.localStorage.setItem(
      KEY_COMPOSITES,
      JSON.stringify(compositesToStored(withNames(['A', 'B'])))
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY_COMPOSITES }));
    });
    expect(screen.getByTestId('names').textContent).toBe('A|B');
  });
});

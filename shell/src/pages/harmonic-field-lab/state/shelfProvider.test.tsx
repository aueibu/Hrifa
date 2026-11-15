import { act } from 'react';
import { render, screen } from '@test-utils';
import { describe, expect, it, beforeEach } from 'vitest';
import { ratioNote, sketchPitches } from '../../../lib/harmonic-field';
import { emptyShelf, stashChord } from './chordShelf';
import { useLab } from './context';
import { LabProvider, restoreState } from './LabProvider';
import { activeTab } from './labState';
import { KEY_CHORDSHELF, KEY_TABS } from './persist';
import { shelfToStored } from './shelfStore';

const shelfWith = (names: string[]) => {
  let sh = emptyShelf();
  for (const name of names) {
    sh = stashChord(sh, {
      name,
      pitches: sketchPitches(ratioNote(1, 1), '4:5:6')!,
      template: '4:5:6',
      rootDeg: 0,
      tol: 18,
      date: '',
      refHz: 261.6256,
      frame: 'parallel',
      parent: null,
      source: null,
    });
  }
  return sh;
};

function Probe() {
  const { state } = useLab();
  return <div data-testid="names">{state.shelf.chords.map((c) => c.name).join('|')}</div>;
}

describe('shelf in the provider', () => {
  beforeEach(() => window.localStorage.clear());

  it('restoreState maps tabs.v1 `from` to the tab fromChord, and loads the stored shelf without writing', () => {
    window.localStorage.setItem(
      KEY_TABS,
      JSON.stringify({ active: 0, list: [{ id: 't1', name: null, from: 'c4', snap: {} }] })
    );
    window.localStorage.setItem(KEY_CHORDSHELF, JSON.stringify(shelfToStored(shelfWith(['A']))));
    const before = window.localStorage.getItem(KEY_CHORDSHELF);
    const s = restoreState();
    expect(activeTab(s).fromChord).toBe('c4');
    expect(s.shelf.chords.map((c) => c.name)).toEqual(['A']);
    expect(window.localStorage.getItem(KEY_CHORDSHELF)).toBe(before);
  });

  it('a storage event for the shelf key takes the other window’s chords; no write on mount', () => {
    window.localStorage.setItem(KEY_CHORDSHELF, JSON.stringify(shelfToStored(shelfWith(['A']))));
    const stored = window.localStorage.getItem(KEY_CHORDSHELF);
    render(
      <LabProvider>
        <Probe />
      </LabProvider>
    );
    expect(screen.getByTestId('names').textContent).toBe('A');
    expect(window.localStorage.getItem(KEY_CHORDSHELF)).toBe(stored);
    window.localStorage.setItem(
      KEY_CHORDSHELF,
      JSON.stringify(shelfToStored(shelfWith(['A', 'B'])))
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY_CHORDSHELF }));
    });
    expect(screen.getByTestId('names').textContent).toBe('A|B');
  });
});

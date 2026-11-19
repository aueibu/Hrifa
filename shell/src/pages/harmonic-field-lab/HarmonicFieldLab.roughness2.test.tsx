/** Live roughness register and real (stacked) pitches: `Shape` equals the positional card's score, `Pitch` the real register. */
import { fireEvent, render, screen, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roughnessOf, scoreRoughness } from '../../lib/harmonic-field';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS } from './state/persist';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

const KEY_LAYOUT = 'hrifa.harmonic-field-lab.layout.v1';
const BASE = 261.6256;
const total = () => screen.getByTestId('live-total').textContent;
const note = (c: number) => ({ m: null, c });
const asPlayed = (cs: number[]) => scoreRoughness(cs.map((c) => BASE * 2 ** (c / 1200))).score;
const rowOf = (label: string) =>
  within(screen.getByRole('list', { name: 'Positional chords 2-2' })).getByRole('button', {
    name: new RegExp(`^${label},`),
  });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const pick = (idx: number[]) => {
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  const dots = within(ring()).getAllByRole('button');
  idx.forEach((i) => fireEvent.click(dots[i]));
};
const mode = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

const ctxs: FakeCtx[] = [];
class TestCtx extends FakeCtx {
  constructor() {
    super();
    ctxs.push(this);
  }
}
beforeEach(() => {
  ctxs.length = 0;
  window.localStorage.clear();
  ungroupShapes();
  window.innerWidth = 3840;
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
  window.localStorage.setItem(
    KEY_LAYOUT,
    JSON.stringify({ left: [['keys', 'chords']], right: [['viz4']] })
  );
});
afterEach(() => {
  window.innerWidth = 1024;
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

describe('Live roughness register', () => {
  it('minor shape 2-2 on 2 (D F A): Shape = the card score, Pitch = the real pitch', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    pick([0, 2, 4, 5, 7, 9, 11]);
    const r = rowOf('2-2 on 2');
    fireEvent.mouseEnter(r);
    const card = roughnessOf([note(200), note(500), note(900)]);
    expect(card.toFixed(2)).toBe('5.54');
    expect(total()).toBe(card.toFixed(2)); // default register: like the cards
    mode('Pitch');
    expect(total()).toBe(asPlayed([200, 500, 900]).toFixed(2));
    expect(asPlayed([200, 500, 900]).toFixed(2)).toBe('5.09');
    // C E G sits at 1/1: both registers agree
    fireEvent.mouseLeave(r);
    fireEvent.mouseEnter(rowOf('2-2 on 1'));
    expect(total()).toBe(asPlayed([0, 400, 700]).toFixed(2));
    mode('Shape');
    expect(total()).toBe(roughnessOf([note(0), note(400), note(700)]).toFixed(2));
  });

  it('a chord that stacks past the repeat keeps its real pitches (pentatonic D G C), hovered and sounding', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    pick([0, 2, 4, 7, 9]);
    const r = rowOf('2-2 on 2');
    fireEvent.mouseEnter(r);
    const stacked = roughnessOf([note(200), note(700), note(1200)]);
    const collapsed = roughnessOf([note(0), note(200), note(700)]);
    expect(stacked.toFixed(2)).toBe('4.88');
    expect(collapsed.toFixed(2)).toBe('5.70');
    expect(total()).toBe('4.88');
    mode('Pitch');
    expect(total()).toBe(asPlayed([200, 700, 1200]).toFixed(2));
    fireEvent.mouseLeave(r);
    // played: Parallel puts the chord's own root on 1/1, so it sounds 0, 500, 1000 c
    mode('Shape');
    fireEvent.click(r);
    await waitFor(() => expect(total()).toBe('4.88'));
    expect(screen.getAllByTestId('live-pair')).toHaveLength(3);
  });

  it('the stored register loads, and nothing is written on mount', () => {
    const settings = JSON.stringify({ viz: { viz4: { register: 'pitch' } } });
    window.localStorage.setItem(KEY_SETTINGS, settings);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<HarmonicFieldLabPage />);
    expect(screen.getByRole('radio', { name: 'Pitch' })).toBeChecked();
    expect(setItem.mock.calls.filter((c) => c[0] === KEY_SETTINGS)).toHaveLength(0);
    expect(window.localStorage.getItem(KEY_SETTINGS)).toBe(settings);
    setItem.mockRestore();
  });

  it('an old entry with no register, or a bad one, reads as Shape', () => {
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ viz: { viz4: { register: 'x' } } }));
    render(<HarmonicFieldLabPage />);
    expect(screen.getByRole('radio', { name: 'Shape' })).toBeChecked();
  });
});

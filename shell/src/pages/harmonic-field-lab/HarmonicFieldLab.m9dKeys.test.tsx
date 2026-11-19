/**
 * M9d keys (SCENARIOS.M9d.md G11 to G13), through the picker on the page. Source 5/4, hovered cell 6/5: Step measures the 6/5 step,
 * Landing measures the 3/2 it lands on from 1/1, so the two differ in the readout and in what hold 4 plays.
 *   G11: the backtick (physical Backquote) flips the open view's Measure while held; keyup and window blur restore it; ignored while typing.
 *   G12: Alt held first, then 1 / 4 / 5, starts the hold preview.
 *   G13: hold 4 plays source + landing under Step, 1/1 + landing under Landing or while the backtick is held.
 */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';

vi.setConfig({ testTimeout: 30_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const running = () => oscs().filter((o) => o.stopAt === null);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
/** The sounding voices' Hz, low to high. */
const heard = () =>
  running()
    .map(hz)
    .sort((a, b) => a - b);

const BACKQUOTE = { key: '`', code: 'Backquote' };
const digit = (d: string, init: KeyboardEventInit = {}) => ({
  key: d,
  code: `Digit${d}`,
  ...init,
});
const mainRing = () => screen.getByRole('group', { name: /^Pitch circle/ });
const ringNotes = () =>
  within(mainRing()).getAllByRole('button', { name: /^\S+, -?\d+\.\d cents/ });
const half = (ratio: string) =>
  screen.getAllByTestId('relative-half').find((h) => h.getAttribute('data-ratio') === ratio)!;
const readout = () => screen.getByTestId('relative-line').textContent ?? '';

/** Rel mode, picker open on source 5/4 (1/1 and 5/4 in the field), the pointer on the 6/5 cell. */
function openOn54(measure: 'step' | 'landing') {
  render(<HarmonicFieldLabPage />);
  fireEvent.click(screen.getByRole('radio', { name: 'Rel' }));
  fireEvent.click(ringNotes()[0], { shiftKey: true });
  fireEvent.click(half('5/4'));
  fireEvent.click(
    ringNotes().find((n) => n.getAttribute('aria-label')!.startsWith('5/4'))!,
    { shiftKey: true }
  );
  if (measure === 'landing') {
    fireEvent.click(
      within(screen.getByTestId('relative-color-measure')).getByRole('radio', { name: 'Landing' })
    );
  }
  fireEvent.mouseEnter(half('6/5'));
}

beforeEach(() => {
  window.localStorage.clear();
  contexts = [];
  class TestCtx extends FakeCtx {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('M9d keys', () => {
  it('G11: the backtick flips the Measure while held, keyup and blur restore it, typing ignores it', () => {
    openOn54('step');
    expect(readout()).toContain('· 6/5 step');
    fireEvent.keyDown(window, BACKQUOTE);
    expect(readout()).toContain('· 3/2 from 1/1');
    fireEvent.keyUp(window, BACKQUOTE);
    expect(readout()).toContain('· 6/5 step');
    // window blur while held restores too
    fireEvent.keyDown(window, BACKQUOTE);
    expect(readout()).toContain('· 3/2 from 1/1');
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(readout()).toContain('· 6/5 step');
    // the stored Measure is untouched by the flip
    expect(
      within(screen.getByTestId('relative-color-measure')).getByRole('radio', { name: 'Step' })
    ).toBeChecked();
    // from Landing the flip goes the other way
    fireEvent.click(
      within(screen.getByTestId('relative-color-measure')).getByRole('radio', { name: 'Landing' })
    );
    expect(readout()).toContain('· 3/2 from 1/1');
    fireEvent.keyDown(window, BACKQUOTE);
    expect(readout()).toContain('· 6/5 step');
    fireEvent.keyUp(window, BACKQUOTE);
    expect(readout()).toContain('· 3/2 from 1/1');
    // typing in a field: no flip
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, BACKQUOTE);
    expect(readout()).toContain('· 3/2 from 1/1');
    fireEvent.keyUp(input, BACKQUOTE);
    input.remove();
  });

  it('G12: Alt held first, then 1, 4 and 5, starts the hold preview', () => {
    openOn54('step');
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(running()).toHaveLength(0);
    for (const [d, voices] of [
      ['1', 1],
      ['4', 2],
    ] as const) {
      fireEvent.keyDown(window, digit(d, { altKey: true }));
      expect(running(), `Alt, then ${d}`).toHaveLength(voices);
      fireEvent.keyUp(window, digit(d, { altKey: true }));
      expect(running(), `release ${d}`).toHaveLength(0);
    }
    // 5 is the whole field and the landing: 1/1, 5/4 and the landing below (25/24)
    fireEvent.keyDown(window, digit('5', { altKey: true }));
    expect(running().length).toBeGreaterThanOrEqual(2);
    fireEvent.keyUp(window, digit('5', { altKey: true }));
    expect(running()).toHaveLength(0);
    fireEvent.keyUp(window, { key: 'Alt', altKey: false });
  });

  it('G13: hold 4 plays source + landing under Step, 1/1 + landing under Landing and while the backtick is held', () => {
    const pair = () => {
      const h = heard();
      expect(h).toHaveLength(2);
      return h[1] / h[0];
    };
    // Step: 5/4 and 3/2 (a 6/5 apart)
    openOn54('step');
    fireEvent.keyDown(window, digit('4'));
    expect(pair()).toBeCloseTo(6 / 5, 3);
    fireEvent.keyUp(window, digit('4'));
    expect(running()).toHaveLength(0);
    // Step with the backtick held: 1/1 and 3/2
    fireEvent.keyDown(window, BACKQUOTE);
    fireEvent.keyDown(window, digit('4'));
    expect(pair()).toBeCloseTo(3 / 2, 3);
    fireEvent.keyUp(window, digit('4'));
    fireEvent.keyUp(window, BACKQUOTE);
    expect(running()).toHaveLength(0);
    // the backtick pressed during a held 4 changes the sound live
    fireEvent.keyDown(window, digit('4'));
    expect(pair()).toBeCloseTo(6 / 5, 3);
    fireEvent.keyDown(window, BACKQUOTE);
    expect(pair()).toBeCloseTo(3 / 2, 3);
    fireEvent.keyUp(window, BACKQUOTE);
    // releasing the backtick puts the held 4 back to the Step pair (the 3/2 pair's voices have ended)
    expect(pair()).toBeCloseTo(6 / 5, 3);
    fireEvent.keyUp(window, digit('4'));
    expect(running()).toHaveLength(0);
    // Landing: 1/1 and 3/2
    fireEvent.click(
      within(screen.getByTestId('relative-color-measure')).getByRole('radio', { name: 'Landing' })
    );
    fireEvent.keyDown(window, digit('4'));
    expect(pair()).toBeCloseTo(3 / 2, 3);
    fireEvent.keyUp(window, digit('4'));
    expect(running()).toHaveLength(0);
  });
});

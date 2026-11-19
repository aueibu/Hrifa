/** M10 (Scala-tools arc): the JI reach visualizer view (SCENARIOS.M10.md R1, R2, R14). The math is tested in `state/jiReach.test.ts`; here only the wiring is. */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS } from './state/persist';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

const KEY_LAYOUT = 'hrifa.harmonic-field-lab.layout.v1';

let contexts: FakeCtx[] = [];
const running = () => contexts.flatMap((c) => c.oscs).filter((o) => o.stopAt === null);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
/** The sounding voices' pitches in cents above the lowest, low to high. */
const heardCents = () => {
  const f = running()
    .map(hz)
    .sort((a, b) => a - b);
  return f.map((x) => 1200 * Math.log2(x / f[0]));
};

beforeEach(() => {
  window.localStorage.clear();
  window.innerWidth = 3840;
  contexts = [];
  class TestCtx extends FakeCtx {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
  window.localStorage.setItem(
    KEY_LAYOUT,
    JSON.stringify({ left: [['keys']], right: [['viz2']], views: { viz2: 'reach' } })
  );
});
afterEach(() => {
  window.innerWidth = 1024;
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const row = (ratio: string) =>
  screen.getAllByTestId('reach-row').find((r) => r.dataset.ratio === ratio)!;

describe('JI reach view', () => {
  it('is named after the view, sits in the rail with a summary, and loads from a stored view choice', () => {
    render(<HarmonicFieldLabPage />);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    expect(
      within(rail).getByRole('tab', { name: /^Visualizer 2 – JI reach7-limit 12\/12$/ })
    ).toBeInTheDocument();
    expect(screen.getByTestId('reach-table')).toBeInTheDocument();
  });

  it('R1, R2: Harmonics 8-15 at the 7-limit: 7/6 is exact for two notes and 63 c flat from the root; 12 of 12 against 3 of 12', () => {
    render(<HarmonicFieldLabPage />);
    expect(within(row('7/6')).getByTestId('reach-any').textContent).toMatch(/^0 c 5→7 ×1$/);
    expect(within(row('7/6')).getByTestId('reach-root').textContent).toMatch(/^−63\.0 c 2$/);
    const line7 = screen.getAllByTestId('reach-line').find((l) => l.textContent?.startsWith('7'))!;
    expect(line7.textContent).toContain('12 of 12');
    expect(line7.textContent).toContain('3 of 12');
    expect(screen.getAllByTestId('reach-row')).toHaveLength(12);
  });

  it('R14: a click on 3/2 unfolds its three pairs, the wrap pair marked; a second click folds them', () => {
    render(<HarmonicFieldLabPage />);
    expect(screen.queryAllByTestId('reach-pair')).toHaveLength(0);
    fireEvent.click(within(row('3/2')).getByRole('button', { name: /3\/2: show the pairs/ }));
    const pairs = screen.getAllByTestId('reach-pair');
    expect(
      pairs.map((p) => `${p.dataset.from}>${p.dataset.to}${p.dataset.wrap === 'true' ? '^' : ''}`)
    ).toEqual(['1>5', '3>8', '5>2^']);
    fireEvent.click(within(row('3/2')).getByRole('button', { name: /3\/2: hide the pairs/ }));
    expect(screen.queryAllByTestId('reach-pair')).toHaveLength(0);
    // a click anywhere on the row toggles it, once
    fireEvent.click(within(row('3/2')).getByTestId('reach-any'));
    expect(screen.getAllByTestId('reach-pair')).toHaveLength(3);
  });

  it('R20: 7/6 has one pair (12 to 14): no chevron, no unfold; a click on the row plays it', () => {
    render(<HarmonicFieldLabPage />);
    const r = row('7/6');
    expect(within(r).getByRole('button').hasAttribute('aria-expanded')).toBe(false);
    expect(r.querySelector('[data-folded]')).toBeNull();
    expect(contexts.flatMap((c) => c.oscs)).toHaveLength(0);
    fireEvent.click(r);
    expect(screen.queryAllByTestId('reach-pair')).toHaveLength(0);
    expect(contexts.flatMap((c) => c.oscs).length).toBeGreaterThan(0);
    // 3/2 has three pairs and still unfolds
    expect(row('3/2').querySelector('[data-folded]')).not.toBeNull();
  });

  it('the limit and tolerance are saved in settings.v1 only when changed', () => {
    render(<HarmonicFieldLabPage />);
    expect(JSON.parse(window.localStorage.getItem(KEY_SETTINGS) ?? '{}').reach).toBeUndefined();
    fireEvent.change(screen.getByRole('combobox', { name: 'Odd limit' }), {
      target: { value: '5' },
    });
    expect(screen.getAllByTestId('reach-row')).toHaveLength(6);
    expect(JSON.parse(window.localStorage.getItem(KEY_SETTINGS)!).reach).toEqual({
      limit: 5,
      tol: 15,
    });
  });

  it('R16: Expand all unfolds every target, Collapse all folds them again', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all targets' }));
    // only the rows with several entries open; a one-entry row is its own pair (R20)
    const toggles = screen
      .getAllByTestId('reach-row')
      .map((r) => within(r).getAllByRole('button')[0])
      .filter((b) => b.hasAttribute('aria-expanded'));
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles.length).toBeLessThan(12);
    expect(toggles.every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
    expect(screen.queryAllByTestId('reach-pair').length).toBeGreaterThanOrEqual(2 * toggles.length);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all targets' }));
    expect(screen.queryAllByTestId('reach-pair')).toHaveLength(0);
  });

  it('R17, R18: in 12-EDO, hovering 5/4 and holding 1 or 4 plays the 400 c scale pair; holding 5 plays the pure 386.3 c pair from the same lower note', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.mouseEnter(row('5/4'));
    const lows: number[] = [];
    for (const [d, gap] of [
      ['1', 400],
      ['4', 400],
      ['5', 386.3],
    ] as const) {
      fireEvent.keyDown(window, { key: d, code: `Digit${d}` });
      const c = heardCents();
      expect(c, `hold ${d}`).toHaveLength(2);
      expect(c[1] - c[0], `hold ${d}`).toBeCloseTo(gap, 0);
      lows.push(
        running()
          .map(hz)
          .sort((a, b) => a - b)[0]
      );
      fireEvent.keyUp(window, { key: d, code: `Digit${d}` });
      expect(running()).toHaveLength(0);
    }
    expect(lows[1]).toBeCloseTo(lows[0], 3);
    expect(lows[2]).toBeCloseTo(lows[0], 3);
  });

  const chordEdges = () =>
    [...document.querySelectorAll('polygon')]
      .filter((g) => /chordFill/.test(g.getAttribute('class') ?? ''))
      .map((g) => (g.getAttribute('points') ?? '').split(' ').filter(Boolean).length)
      .filter((n) => n === 2).length;

  it('R14, P3: hovering a row sets the chord highlight on the ring, leaving clears it', () => {
    render(<HarmonicFieldLabPage />);
    expect(chordEdges()).toBe(0);
    fireEvent.mouseEnter(row('7/6'));
    expect(chordEdges()).toBeGreaterThan(0);
    fireEvent.mouseLeave(row('7/6'));
    expect(chordEdges()).toBe(0);
  });

  it('a hovered row that goes away (the view is switched) clears the ring highlight and the hold preview', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.mouseEnter(row('7/6'));
    expect(chordEdges()).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /^View: .*JI reach\. Change view$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'EDO fit' }));
    expect(screen.queryByTestId('reach-table')).toBeNull();
    expect(chordEdges()).toBe(0);
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    expect(running()).toHaveLength(0);
    fireEvent.keyUp(window, { key: '1', code: 'Digit1' });
  });

  it('the pure pair follows the hovered target even when two targets share the best pair (12-EDO 6/5 then 7/6)', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const hold5 = () => {
      fireEvent.keyDown(window, { key: '5', code: 'Digit5' });
      const c = heardCents();
      fireEvent.keyUp(window, { key: '5', code: 'Digit5' });
      return c[1] - c[0];
    };
    fireEvent.mouseEnter(row('6/5'));
    expect(hold5()).toBeCloseTo(315.6, 0);
    fireEvent.mouseEnter(row('7/6'));
    expect(hold5()).toBeCloseTo(266.9, 0);
  });

  it('R18: the wrapped 3/2 pair (12 to 9 in Harmonics 8-15) plays from the 12/8 note, the pure pair and hold 1 alike', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(row('3/2')).getByRole('button', { name: /3\/2: show the pairs/ }));
    const pair = (from: string) =>
      screen.getAllByTestId('reach-pair').find((p) => p.dataset.from === from)!;
    const hold = (d: string, el: HTMLElement) => {
      fireEvent.mouseEnter(el);
      fireEvent.keyDown(window, { key: d, code: `Digit${d}` });
      const f = running()
        .map(hz)
        .sort((a, b) => a - b);
      fireEvent.keyUp(window, { key: d, code: `Digit${d}` });
      return f;
    };
    // the first pair starts on 1/1 (8/8): its lower note is the reference
    const [f0] = hold('1', pair('1'));
    for (const d of ['1', '5']) {
      const [lo, hi] = hold(d, pair('5'));
      expect(lo / f0, `hold ${d} low`).toBeCloseTo(1.5, 3);
      expect(1200 * Math.log2(hi / lo), `hold ${d} gap`).toBeCloseTo(701.96, 1);
      expect(1200 * Math.log2(hi / f0), `hold ${d} high`).toBeCloseTo(1403.9, 1);
    }
  });
});

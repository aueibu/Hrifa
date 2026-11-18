/**
 * M3b (Scala-tools arc): the Pairs panel's Beats view and Add pitch. The numbers are tested in
 * `src/lib/harmonic-field/beats.test.ts` and `addedPitches.test.ts`; here only the wiring is (table rows 3, 6, 10, 11).
 */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REACH_MAX,
  REACH_MIDDLE,
  REACH_MIN,
  extraTints,
  fmtRatio,
  intervalPairs,
  mulNotes,
  ratioNote,
  rotateSubset,
  tenneyHeight,
} from '../../lib/harmonic-field';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import {
  LAB_DEVELOPER_KEY,
  resetDeveloperOptionsCache,
  writeDeveloperOptions,
} from './state/developerOptions';
import { pickPresetNow } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const cells = () => screen.getAllByTestId('matrix-cell');
const added = () => screen.queryAllByTestId('matrix-added-cell');
const box = (name: string) => screen.getByRole('textbox', { name });

function openPairs() {
  fireEvent.click(within(rail()).getByRole('tab', { name: /^Pairs/ }));
}
function setTol(v: string) {
  fireEvent.change(box('Find tolerance in cents'), { target: { value: v } });
}
/** 12-EDO reduced to C E G (degrees 1, 5, 8): the others are removed from the end so the numbers stay put. */
function triad() {
  pickPresetNow('12-EDO');
  openPairs();
  for (const n of [12, 11, 10, 9, 7, 6, 4, 3, 2]) {
    const h = screen
      .getAllByTestId('matrix-row-head')
      .find((x) => (x as HTMLElement).dataset.degree === String(n))!;
    fireEvent.click(h);
  }
}
function addPitch(text: string) {
  fireEvent.change(box('Pitch to add'), { target: { value: text } });
  fireEvent.keyDown(box('Pitch to add'), { key: 'Enter' });
}

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('Pairs panel: Beats and Add pitch', () => {
  it('row 3: Beats view, Find 3/2 on the 5-limit major scale: exact cells read 0.00, 40/27 reads -10.90, the Locations rows total it', () => {
    render(<HarmonicFieldLabPage />);
    pickPresetNow("Ptolemy's intense diatonic");
    openPairs();
    expect(cells()).toHaveLength(42);
    fireEvent.click(screen.getByRole('radio', { name: 'Beats' }));
    fireEvent.change(box('Interval to find'), { target: { value: '3/2' } });
    setTol('25');
    const hit = cells().filter((c) => c.dataset.match === 'yes');
    expect(hit.map((c) => (c.textContent ?? '').replace('↑', '')).sort()).toEqual(
      ['-10.90', '0.00', '0.00', '0.00', '0.00', '0.00'].sort()
    );
    expect(hit.find((c) => c.textContent === '-10.90')!.getAttribute('aria-label')).toMatch(
      /minus 10\.90 hertz$/
    );
    const text = screen.getByTestId('matrix-result').textContent ?? '';
    expect(text).toMatch(/Beats total10\.90 HzBeats average1\.82 HzBeats highest10\.90 Hz/);
    // the Intervals view has no beat rows
    fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    expect(screen.getByTestId('matrix-result').textContent).not.toContain('Beats total');
  });

  it('row 6 and 11: adding 3/2 to C E G draws a dashed row and column with +0.44 for G; abc shows a message and adds nothing', () => {
    render(<HarmonicFieldLabPage />);
    triad();
    expect(cells()).toHaveLength(6);
    fireEvent.click(screen.getByRole('radio', { name: 'Beats' }));
    setTol('20');
    addPitch('3/2');
    expect(screen.getByTestId('matrix-added-col-head')).toHaveTextContent('3/2');
    expect(screen.getByTestId('matrix-added-row-head')).toHaveTextContent('3/2');
    expect(added()).toHaveLength(6);
    expect(
      added().some((c) =>
        /^700\.0 c to 3\/2, plus 0\.44 hertz$/.test(c.getAttribute('aria-label')!)
      )
    ).toBe(true);
    // every column has the same width (the spacer excepted)
    const cols = (screen.getByTestId('matrix-grid').getAttribute('style') ?? '').match(
      /grid-template-columns:\s*([^;]+)/
    )![1];
    const widths = cols
      .replace(/repeat\((\d+),\s*([^)]+)\)/g, (_m, n, wd) => Array(Number(n)).fill(wd).join(' '))
      .split(/\s+/);
    const wide = widths.filter((x) => x.endsWith('ch'));
    expect(wide.length).toBe(widths.length - 1);
    expect(new Set(wide).size).toBe(1);
    // the subset's grid is unchanged
    expect(cells()).toHaveLength(6);
    addPitch('abc');
    expect(screen.getByText(/Not a ratio or cents/)).toBeInTheDocument();
    expect(added()).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: /^Remove added pitch/ })).toHaveLength(1);
    // Intervals view keeps the added row and column
    fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    expect(added()).toHaveLength(6);
  });

  it('row 8: Find 15/8 on 12-EDO shows the beats undimmed; a Beat partial limit of 7 dims them and names the partials', () => {
    render(<HarmonicFieldLabPage />);
    pickPresetNow('12-EDO');
    openPairs();
    fireEvent.click(screen.getByRole('radio', { name: 'Beats' }));
    fireEvent.change(box('Interval to find'), { target: { value: '15/8' } });
    setTol('15');
    const hits = () => cells().filter((c) => c.dataset.match === 'yes');
    // all 12 degrees: every semitone-step B to C style pair near 15/8 is listed; the numbers come from the lib tests
    expect(hits().map((c) => c.textContent)).toContain('+26.68');
    expect(hits().some((c) => c.dataset.theory === 'true')).toBe(false);
    expect(hits().some((c) => /partials/.test(c.getAttribute('aria-label')!))).toBe(false);
    act(() => writeDeveloperOptions({ beatPartialLimit: 7 }));
    expect(hits().every((c) => c.dataset.theory === 'true')).toBe(true);
    expect(hits()[0].getAttribute('aria-label')).toMatch(
      /plus 26\.68 hertz, partials 15 and 8, above the limit of 7$/
    );
    act(() => writeDeveloperOptions({ beatPartialLimit: null }));
    expect(hits().some((c) => c.dataset.theory === 'true')).toBe(false);
  });

  it('the readout keeps its full wording and adds the beat in Beats view', () => {
    render(<HarmonicFieldLabPage />);
    pickPresetNow("Ptolemy's intense diatonic");
    openPairs();
    expect(screen.getByTestId('matrix-status').textContent).toBe('Point at a cell');
    fireEvent.click(screen.getByRole('radio', { name: 'Beats' }));
    fireEvent.mouseEnter(cells().find((c) => c.dataset.from === '1' && c.dataset.to === '5')!);
    expect(screen.getByTestId('matrix-status').textContent).toMatch(
      /^Degree 1 to degree 5: .*\. Beat [-+]?\d+\.\d\d Hz vs 3\/2\.$/
    );
  });

  it('an added pitch tints its row and column headers and the chip like the cells when Color is Interval', () => {
    render(<HarmonicFieldLabPage />);
    triad();
    fireEvent.click(screen.getByRole('radio', { name: 'Interval' }));
    addPitch('11/6');
    expect(screen.getByTestId('matrix-added-col-head')).toHaveAttribute('data-tile');
    expect(screen.getByTestId('matrix-added-row-head')).toHaveAttribute('data-tile');
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(screen.getByTestId('matrix-added-col-head')).not.toHaveAttribute('data-tile');
  });

  it('added cells read like subset cells: ratios when both pitches are exact, cents when one is not (12-EDO C E G, 3/2 and 5/4 added)', () => {
    render(<HarmonicFieldLabPage />);
    triad();
    addPitch('3/2');
    addPitch('5/4');
    const text = (c: HTMLElement) => (c.textContent ?? '').replace('↑', '');
    const names = added().map((c) => c.getAttribute('aria-label')!);
    // the cells between the two added pitches: 5/4 to 3/2 is 6/5; 3/2 to 5/4 wraps to 5/3 (computed from the monzos)
    const up = fmtRatio(mulNotes(ratioNote(3, 2), ratioNote(5, 4), -1));
    const down = fmtRatio(
      mulNotes(mulNotes(ratioNote(5, 4), ratioNote(2, 1), 1), ratioNote(3, 2), -1)
    );
    const exact = added().filter((c) =>
      /^(3\/2 to 5\/4|5\/4 to 3\/2): /.test(c.getAttribute('aria-label')!)
    );
    expect(exact).toHaveLength(2);
    expect(exact.map(text).sort()).toEqual([up, down].sort());
    expect(exact.filter((c) => c.querySelector('[aria-hidden]'))).toHaveLength(1); // only 3/2 to 5/4 wraps
    expect(names.find((n) => n.startsWith('3/2 to 5/4'))).toMatch(
      /, [\d.]+ c, up to the next repeat$/
    );
    // the root C is exact (1/1), so its 4 cells with the added pitches read as ratios too; E and G are 12-EDO, so their 8 cells stay in cents
    const ratios = added().filter((c) => text(c).includes('/'));
    expect(ratios).toHaveLength(6);
    const cents = added().filter((c) => !text(c).includes('/'));
    expect(cents).toHaveLength(8);
    expect(cents.every((c) => /^-?\d+(\.\d)?$/.test(text(c)))).toBe(true);
  });

  it('on a just subset an added 11/6 shows exact ratios with the wrap arrow where the upper pitch is read up the next repeat', () => {
    render(<HarmonicFieldLabPage />);
    pickPresetNow("Ptolemy's intense diatonic");
    openPairs();
    addPitch('11/6');
    const subset: [number, number][] = [
      [1, 1],
      [9, 8],
      [5, 4],
      [4, 3],
      [3, 2],
      [5, 3],
      [15, 8],
    ];
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const fmt = (p: number, q: number) => {
      let n = p;
      let d = q;
      while (n / d < 1) {
        n *= 2;
      }
      while (n / d >= 2) {
        d *= 2;
      }
      const g = gcd(n, d);
      return `${n / g}/${d / g}`;
    };
    // from a subset note to 11/6 is 11/6 over it; from 11/6 up to a note is that note over 11/6, wrapped
    const wantUp = subset.map(([p, q]) => fmt(11 * q, 6 * p));
    const wantDown = subset.map(([p, q]) => fmt(6 * p, 11 * q));
    // the monzo route must agree with the hand arithmetic above for one case
    expect(wantUp[1]).toBe(fmtRatio(mulNotes(ratioNote(11, 6), ratioNote(9, 8), -1)));
    const text = (c: HTMLElement) => (c.textContent ?? '').replace('↑', '');
    const cs = added();
    expect(cs).toHaveLength(14);
    expect(cs.map(text).sort()).toEqual([...wantUp, ...wantDown].sort());
    expect(wantDown).toContain('16/11'); // 4/3 over 11/6, wrapped
    expect(wantUp).toContain('11/9');
    // 11/6 (1.833) lies above every note but 15/8 (1.875): the 7 cells from 11/6 to a lower note wrap, and 15/8 to 11/6 wraps
    expect(cs.filter((c) => c.querySelector('[aria-hidden]'))).toHaveLength(7);
  });

  it('Interval color: a Tinted cell is a hard-edged band, a Solid cell a full fill, a dimmed one keeps its band', () => {
    render(<HarmonicFieldLabPage />);
    pickPresetNow("Ptolemy's intense diatonic");
    openPairs();
    fireEvent.click(screen.getByRole('radio', { name: 'Interval' }));
    const prop = (c: HTMLElement, k: string) => c.style.getPropertyValue(k);
    expect(
      cells().every(
        (c) =>
          prop(c, '--mx-bg').startsWith('linear-gradient(to right') &&
          !prop(c, '--mx-bg').includes('radial-gradient')
      )
    ).toBe(true);
    const r3 = prop(
      cells().find((c) => c.dataset.from === '1' && c.dataset.to === '5')!,
      '--mx-bg'
    ); // 3/2
    const r45 = prop(
      cells().find((c) => c.dataset.from === '1' && c.dataset.to === '7')!,
      '--mx-bg'
    ); // 15/8
    expect(r3).not.toBe(r45);
    // a search dims the other cells but they keep a band
    fireEvent.change(screen.getByRole('textbox', { name: 'Interval to find' }), {
      target: { value: '3/2' },
    });
    const dimmed = cells().filter((c) => c.dataset.match === 'no');
    expect(dimmed.length).toBeGreaterThan(0);
    expect(dimmed.every((c) => prop(c, '--mx-dim-bg').startsWith('linear-gradient('))).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Interval to find' }), {
      target: { value: '' },
    });
    act(() => writeDeveloperOptions({ tileLook: 'solid' }));
    expect(cells().every((c) => prop(c, '--mx-bg') === '')).toBe(true);
  }, 30_000);

  it('every drawing of an added pitch (chip, row header, column header) is a band of its own reach, exact widths', () => {
    // expected widths from the lib: the pitch's Tenney height placed on the subset's heights (Ptolemy = the five-limit set)
    const rep = ratioNote(2, 1);
    const field = [1, 9, 5, 4, 3, 5, 15].map((n, i) => ratioNote(n, [1, 8, 4, 3, 2, 3, 8][i]));
    const m = intervalPairs(
      rotateSubset(
        field,
        field.map((_, i) => i),
        0,
        rep
      ),
      rep
    )!;
    const hs = m.groups.map((g) => g.h!);
    const lo = Math.min(...hs);
    const hi = Math.max(...hs);
    const want = (n: number, d: number, dir: 'faint' | 'strong') => {
      const t = Math.min(1, Math.max(0, (tenneyHeight(ratioNote(n, d))! - lo) / (hi - lo)));
      return REACH_MIN + (dir === 'faint' ? t : 1 - t) * (REACH_MAX - REACH_MIN);
    };
    const w116 = want(11, 6, 'faint');
    const w74 = want(7, 4, 'faint');
    expect(w116).not.toBeCloseTo(w74, 1);
    expect(w116).toBeCloseTo(
      extraTints(
        m,
        [{ c: 1200 * Math.log2(11 / 6), note: ratioNote(11, 6) }],
        1200,
        'size',
        'faint'
      )[0].reach,
      10
    );

    // H-37: the default is Simple strong; this case checks the Complex strong (faint) direction
    writeDeveloperOptions({ intervalIntensity: 'faint' });
    render(<HarmonicFieldLabPage />);
    pickPresetNow("Ptolemy's intense diatonic");
    openPairs();
    fireEvent.click(screen.getByRole('radio', { name: 'Interval' }));
    addPitch('11/6');
    addPitch('7/4');
    addPitch('1013.7');
    const bg = (c: HTMLElement) => c.style.getPropertyValue('--mx-bg');
    // center `transparent 0 L%, tint L% R%, ...` gives W = R - L; left `tint 0 W%, transparent ...` gives W
    const center = (c: HTMLElement) => {
      expect(bg(c)).not.toContain('radial');
      const g = /transparent 0 ([\d.]+)%, .* ([\d.]+)% ([\d.]+)%, /.exec(bg(c))!;
      return Number(g[3]) - Number(g[2]);
    };
    const left = (c: HTMLElement) => Number(/ 0 ([\d.]+)%, transparent/.exec(bg(c))![1]);
    const chips = () => screen.getAllByTestId('matrix-added-chip');
    const rows = () => screen.getAllByTestId('matrix-added-row-head');
    const cols = () => screen.getAllByTestId('matrix-added-col-head');
    expect(chips()).toHaveLength(3);
    expect(rows()).toHaveLength(3);
    expect(cols()).toHaveLength(3);
    const widths = [w116, w74, REACH_MIDDLE];
    for (const els of [chips, rows, cols]) {
      els().forEach((c, i) => expect(center(c)).toBeCloseTo(widths[i], 1));
    }
    expect(widths[0]).not.toBeCloseTo(widths[1], 1);
    expect(widths[2]).toBeCloseTo(67.5, 5); // no exact ratio: the middle width
    act(() => writeDeveloperOptions({ tintBand: 'left' }));
    for (const els of [chips, rows, cols]) {
      els().forEach((c, i) => expect(left(c)).toBeCloseTo(widths[i], 1));
    }
    // the other direction: simple = wider
    act(() => writeDeveloperOptions({ intervalIntensity: 'strong' }));
    expect(left(chips()[0])).toBeCloseTo(want(11, 6, 'strong'), 1);
    expect(left(rows()[1])).toBeCloseTo(want(7, 4, 'strong'), 1);
    act(() => writeDeveloperOptions({ tileLook: 'solid' }));
    for (const els of [chips, rows, cols]) {
      expect(els().every((c) => bg(c) === '')).toBe(true);
    }
  }, 30_000);

  it('the added dashed outline takes a visible hue color under Color: Interval, even with the outline option off; Color Off keeps the muted default', () => {
    window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ tileOutline: false }));
    resetDeveloperOptionsCache();
    render(<HarmonicFieldLabPage />);
    pickPresetNow("Ptolemy's intense diatonic");
    openPairs();
    addPitch('7/4');
    expect(added().length).toBeGreaterThan(0);
    expect(added()[0].style.getPropertyValue('--mx-added-bd')).toBe('');
    fireEvent.click(screen.getByRole('radio', { name: 'Interval' }));
    const bd = added()[0].style.getPropertyValue('--mx-added-bd');
    expect(bd).toMatch(/^(var\(--rx-|color-mix)/);
    expect(bd).not.toBe('transparent');
    expect(added()[0].style.getPropertyValue('--mx-bd')).toBe('transparent');
  }, 30_000);

  it('row 10: an added pitch is still there after a reload, and its x removes it', () => {
    const first = render(<HarmonicFieldLabPage />);
    triad();
    addPitch('3/2');
    expect(added()).toHaveLength(6);
    first.unmount();
    render(<HarmonicFieldLabPage />);
    openPairs();
    expect(added()).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Remove added pitch 3/2' }));
    expect(added()).toHaveLength(0);
  });
});

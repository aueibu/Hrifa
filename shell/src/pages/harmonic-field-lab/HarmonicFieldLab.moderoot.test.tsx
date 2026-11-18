/**
 * The mode-root chevron in every view that draws single notes, the Keys panel's inner scroll, and the big key view's
 * colors. 12-EDO with C major selected: the first mode is rooted on step 0, the second on step 2 (D dorian).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { addSubsetNamed, pickPreset } from './testUtils';
import { MODE_ROOT_TIP, TIPS } from './texts';

// whole-page renders are slow in jsdom; under a full parallel run some take over the 5 s default
vi.setConfig({ testTimeout: 30_000 });

const KEY = 'hrifa.harmonic-field-lab.layout.v1';
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const noteDots = () => within(ring()).getAllByRole('button');
const css = (f: string) =>
  readFileSync(resolve(process.cwd(), `src/pages/harmonic-field-lab/components/${f}`), 'utf8');
const rule = (sheet: string, selector: string) => {
  const m = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(sheet);
  return m ? m[1] : '';
};

beforeEach(() => {
  window.localStorage.clear();
  window.innerWidth = 3840;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.innerWidth = 1024;
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

/** Everything pinned so every view is on screen: Keys, Chords and the three visualizers (lattice, iso, dissonance). */
async function openAll() {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      left: [['keys', 'chords']],
      right: [['viz1'], ['viz2'], ['viz3']],
      views: { viz2: 'iso' },
    })
  );
  render(<HarmonicFieldLabPage />);
  await pickPreset('12-EDO');
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  MAJOR.forEach((i) => fireEvent.click(noteDots()[i]));
}
const nextMode = () => fireEvent.click(screen.getByRole('button', { name: 'Next mode' }));
const rootsIn = (el: Element) => [...el.querySelectorAll('[data-testid="mode-root"]')];

describe('mode-root marker', () => {
  it('the pitch ring has one chevron, on the root, and the dot says so; Next mode moves it', async () => {
    await openAll();
    expect(rootsIn(ring())).toHaveLength(1);
    expect(noteDots()[0]).toHaveAccessibleName(/, in subset, mode root/);
    expect(within(ring()).getAllByLabelText(/mode root/)).toHaveLength(1);
    nextMode();
    expect(rootsIn(ring())).toHaveLength(1);
    expect(noteDots()[0]).not.toHaveAccessibleName(/mode root/);
    expect(noteDots()[2]).toHaveAccessibleName(/mode root/);
    // the chevron sits in the root's group
    expect(noteDots()[2].closest('g')!.contains(rootsIn(ring())[0])).toBe(true);
  });

  it('labels sit on distinct spots, inside a view fitted to the ring and its labels', async () => {
    await openAll();
    const [x0, y0, w, h] = (ring().getAttribute('viewBox') ?? '').split(' ').map(Number);
    // a square view centered on the ring (300 units, center 150), only as wide as the labels need
    expect(w).toBeCloseTo(h);
    expect(x0 + w / 2).toBeCloseTo(150);
    expect(y0 + h / 2).toBeCloseTo(150);
    const texts = [...ring().querySelectorAll('text[class*="svgLabel"]')];
    for (const t of texts) {
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      expect(x > x0 && x < x0 + w && y > y0 && y < y0 + h).toBe(true);
    }
    const spots = new Set(texts.map((t) => `${t.getAttribute('x')},${t.getAttribute('y')}`));
    expect(spots.size).toBe(texts.length);
  });

  it('no chevron when nothing is selected', async () => {
    await openAll();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(rootsIn(document.body)).toHaveLength(0);
  });

  it('works in the Fifths view too', async () => {
    await openAll();
    fireEvent.click(screen.getByRole('radio', { name: 'Fifths' }));
    expect(rootsIn(ring())).toHaveLength(1);
    expect(within(ring()).getAllByLabelText(/mode root/)).toHaveLength(1);
  });

  it('the tuner strip marks the root tick with a pair of chevrons', async () => {
    await openAll();
    const strip = screen.getByRole('region', { name: 'Tuner strip' });
    expect(within(strip).getAllByTestId('mode-root-pair')).toHaveLength(1);
    expect(rootsIn(strip)).toHaveLength(2);
    const cols = [...strip.querySelectorAll('[data-ratio]')].filter(
      (e) => e.getAttribute('role') === 'button'
    );
    expect(cols[0]).toHaveAccessibleName(/mode root/);
    nextMode();
    expect(cols[0]).not.toHaveAccessibleName(/mode root/);
    expect(cols[2]).toHaveAccessibleName(/mode root/);
  });

  it('the >|< pair is centered vertically on the root tick, on the strip and in a saved row', async () => {
    await openAll();
    await addSubsetNamed('major');
    const marks = [...document.querySelectorAll('[data-testid="mode-root-pair"]')].map((g) =>
      g.closest('svg')!
    );
    expect(marks).toHaveLength(2); // the main strip and the saved row
    const heights = new Set<string>();
    for (const svg of marks) {
      const line = svg.querySelector('rect[class*="markLine"]')!;
      const tickMid = Number(line.getAttribute('y')) + Number(line.getAttribute('height')) / 2;
      const ys = [...svg.querySelectorAll('[data-testid="mode-root"]')].map((c) => {
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(c.getAttribute('transform')!)!;
        return Number(m[2]);
      });
      expect(ys).toHaveLength(2);
      ys.forEach((y) => expect(y).toBeCloseTo(tickMid, 6));
      heights.add(svg.getAttribute('height')!);
    }
    expect(heights.size).toBe(2); // two different strip heights, both centered
  });

  it('the big key ring marks the shown key root; pointing at another key moves it', async () => {
    await openAll();
    const big = screen.getByTestId('big-key-ring');
    expect(rootsIn(big)).toHaveLength(1);
    expect(big.querySelector('[data-root="true"]')).toHaveAccessibleName(/, mode root$/);
    expect(big.querySelector('[data-root="true"]')!.getAttribute('data-note')).toBe('0');
    const ringButtons = within(screen.getByRole('list', { name: 'Keys' })).getAllByRole('button');
    fireEvent.mouseEnter(ringButtons[1]);
    expect(rootsIn(big)).toHaveLength(1);
    expect(big.querySelector('[data-root="true"]')!.getAttribute('data-note')).not.toBe('0');
  });

  it('the 2D lattice, the iso keyboard and the dissonance marks each carry the chevron', async () => {
    await openAll();
    const lattice = screen.getByRole('group', { name: /^Lattice of the field/ });
    expect(rootsIn(lattice)).toHaveLength(1);
    expect(within(lattice).getAllByLabelText(/mode root/)).toHaveLength(1);
    const iso = screen.getByRole('group', { name: /^Isomorphic keyboard: hexagons/ });
    expect(rootsIn(iso).length).toBeGreaterThanOrEqual(1);
    expect(within(iso).getAllByLabelText(/mode root/).length).toBeGreaterThanOrEqual(1);
    const diss = screen.getByRole('group', { name: /^Dissonance curve/ });
    expect(rootsIn(diss)).toHaveLength(1);
    expect(within(diss).getAllByLabelText(/mode root/)).toHaveLength(1);
  });

  it('the field table rows (compact and full) carry a glyph in the root row only', async () => {
    await openAll();
    const compact = screen.getByRole('table', { name: 'Field notes' });
    expect(rootsIn(compact)).toHaveLength(1);
    const row = within(compact)
      .getAllByRole('row')
      .find((r) => /mode root/.test(r.getAttribute('aria-label') ?? ''));
    expect(row).toBeDefined();
    expect(rootsIn(row!)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Open full table/ }));
    expect(rootsIn(screen.getByRole('dialog'))).toHaveLength(1);
  });

  it('a saved subset row marks its own mode root in its sparkline', async () => {
    await openAll();
    nextMode();
    await addSubsetNamed('dorian');
    const list = screen.getByRole('list', { name: 'Saved subsets list' });
    const marked = [...list.querySelectorAll('[data-root="true"]')];
    expect(marked).toHaveLength(1);
    const ratios = [...list.querySelectorAll('[data-ratio]')].map((e) =>
      e.getAttribute('data-ratio')
    );
    expect(marked[0].getAttribute('data-ratio')).toBe(ratios[2]);
    // going on to mode 2 does not move the saved row's marker
    nextMode();
    expect(list.querySelectorAll('[data-root="true"]')).toHaveLength(1);
  });

  it('is drawn in --text only, and has a glossary entry with an example, reachable from the views', () => {
    const lab = css('lab.module.css');
    expect(rule(lab, '.modeChevron')).toMatch(/stroke:\s*var\(--text\)/);
    expect(rule(lab, '.modeGlyph')).toMatch(/stroke:\s*var\(--text\)/);
    expect(TIPS.modeRoot.text).toMatch(/in C major, mode 2 starts on D/i);
    expect(MODE_ROOT_TIP).toContain(TIPS.modeRoot.term);
    expect(TIPS.mode.see).toContain('modeRoot');
    const keys = [
      'pitchCircle',
      'tunerStrip',
      'keyView',
      'fieldTable',
      'lattice',
      'isoHex',
      'dissMarks',
      'savedRow',
      'lattice3d',
    ] as const;
    for (const k of keys) {
      expect(TIPS[k].text.toLowerCase()).toContain('chevron');
    }
  });
});

describe('Keys panel scroll', () => {
  it('only the key-ring list is the inner scroll container; the big ring, summary, legend and buttons are outside it', async () => {
    await openAll();
    const list = screen.getByTestId('key-rings-scroll');
    const big = screen.getByRole('region', { name: 'Key comparison' });
    expect(list.contains(big)).toBe(false);
    expect(big.contains(list)).toBe(false);
    for (const el of [
      screen.getByTestId('big-key-ring'),
      screen.getByTestId('key-summary'),
      screen.getByRole('group', { name: 'Key actions' }),
    ]) {
      expect(list.contains(el)).toBe(false);
    }
    expect(list).toHaveAccessibleName('Keys');
    const panels = css('panels.module.css');
    expect(rule(panels, '.keyRingsScroll')).toMatch(/overflow-y:\s*auto/);
    expect(rule(panels, '.keyRingsScroll')).toMatch(/flex:\s*1 1/);
  });
});

describe('big key view colors (H-4)', () => {
  it('added is green, dropped red, missing orange, common neutral; the shapes are unchanged', () => {
    const panels = css('panels.module.css');
    expect(rule(panels, '.bigKeyAdded')).toMatch(/stroke:\s*var\(--mark-green\)/);
    expect(rule(panels, '.bigKeyGlyph')).toMatch(/stroke:\s*var\(--mark-green\)/);
    expect(rule(panels, '.bigKeyDropped')).toMatch(/stroke:\s*var\(--mark-red\)/);
    expect(rule(panels, '.bigKeyStrike')).toMatch(/stroke:\s*var\(--mark-red\)/);
    expect(rule(panels, '.bigKeyMissing')).toMatch(/stroke:\s*var\(--mark-orange\)/);
    expect(rule(panels, '.bigKeyCommon')).toMatch(/fill:\s*var\(--text\)/);
    expect(rule(panels, '.bigKeyMissing')).toMatch(/stroke-dasharray/);
  });

  it('the legend uses the same classes, so it takes the same colors', async () => {
    await openAll();
    // M8m: added / dropped / missing are drawn as the same change ticks as the big ring (ChangeTicks), common as the plain dot
    const legend = screen.getByLabelText('Marks');
    expect(legend.querySelector('[class*="bigKeyCommon"]')).not.toBeNull();
    for (const kind of ['added', 'dropped', 'missing']) {
      expect(
        legend.querySelector(`[data-testid="change-tick"][data-kind="${kind}"]`)
      ).not.toBeNull();
    }
  });
});

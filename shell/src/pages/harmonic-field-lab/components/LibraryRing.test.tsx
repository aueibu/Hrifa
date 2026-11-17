/**
 * M7c-b: the ring panel of the chord library dialog and hold 1 on a library row. The numbers are the rows of
 * SCENARIOS.M7c.md (field = the 5-limit major scale, tolerance 0, unless a test says otherwise); each chord note is named by
 * its ABSOLUTE pitch in the readout. The ring is the main ring's own component (`PitchRing`) at radius 181: its dots, labels and
 * polygons are the main ring's marks (field dots carry `data-kind="field"` and `data-index` from the library's `dotProps`; the
 * lit ones have the `dotLit` class), and the chord's own marks (outline rings, ghosts, flags, inside labels) are the overlay's
 * (`ring-dot`, `ring-flag`, `ring-dot-label`). jsdom applies no CSS and does no layout, so what these tests cannot prove: the
 * ring's geometry (1/1 at the top, clockwise, the flag's drawn size, where a label ends up), the real colors, the panel beside
 * the list and the height the list gives up, how the muted note looks, and how hold 1 sounds. Those are checked by eye.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryRing, parseInterval, ratioNote, type Note } from '../../../lib/harmonic-field';
import { FakeCtx } from '../audio/fakeContext';
import type { Lab } from '../state/context';
import { LabProvider } from '../state/LabProvider';
import type { Action } from '../state/labState';
import { compareNotes } from '../state/libraryPreview';
import { ChordsPanel } from './ChordsPanel';
import {
  LIBRARY_RING_R,
  LibraryRingPanel,
  MIN_FLAG_DEG,
  READOUT_COLUMNS,
  RING_EMPTY_TEXT,
  flagDegrees,
  readoutRows,
} from './LibraryRing';
import { RING_DOT_R, RING_SOUND_R, markScaleFor } from './ringMarks';
import { useLab } from './ui';

/** The library ring's marks scale: its radius over the main ring's. */
const K = markScaleFor(LIBRARY_RING_R);

vi.setConfig({ testTimeout: 30_000 });

let lab: Lab;
function Probe() {
  lab = useLab();
  return null;
}
const send = (...actions: Action[]) =>
  act(() => {
    for (const a of actions) {
      lab.dispatch(a);
    }
  });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const running = () => oscs().filter((o) => o.stopAt === null);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const C4 = 261.6256;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

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

/** The 5-limit major scale, all notes selected, tolerance 0. */
const major5 = (): Action[] => [
  { type: 'gen/custom', custom: '9/8\n5/4\n4/3\n3/2\n5/3\n15/8', rep: '2/1' },
  { type: 'sel/all' },
  { type: 'ui', patch: { tol: 0 } },
];

const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const search = (dialog: HTMLElement, text: string) =>
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search chords' }), {
    target: { value: text },
  });

async function open(setup: Action[] = major5()) {
  render(
    <LabProvider>
      <ChordsPanel />
      <Probe />
    </LabProvider>
  );
  send(...setup);
  fireEvent.click(screen.getByRole('button', { name: 'Chord library' }));
  return screen.findByRole('dialog', { name: 'Chord library' });
}

/** Searches, opens every shape found, and returns the row of exactly this chord text (plain DOM queries: role queries are slow with 313 headings). */
function rowOf(dialog: HTMLElement, text: string, query = text): HTMLElement {
  search(dialog, query);
  for (const b of dialog.querySelectorAll('button[aria-expanded="false"]')) {
    fireEvent.click(b);
  }
  const row = [...dialog.querySelectorAll('tr[data-folds]')].find(
    (r) => textOf(r).split(' ')[0] === text
  );
  if (!row) {
    throw new Error(`no row ${text}`);
  }
  return row as HTMLElement;
}

const panel = (dialog: HTMLElement) => within(dialog).getByTestId('library-ring-panel');
/** The table's body rows as `chord | pitch | nearest | error` (the swatch column holds no text). */
const readout = (dialog: HTMLElement) => tableRows(panel(dialog));
function tableRows(root: HTMLElement): string[] {
  const table = within(root).getByRole('table', { name: 'Chord readout' });
  return [...table.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td[data-col]')].map(textOf).join(' | ')
  );
}
const headers = (root: HTMLElement) =>
  [...within(root).getByRole('table', { name: 'Chord readout' }).querySelectorAll('th')].map(
    textOf
  );
const dots = (dialog: HTMLElement) => [
  ...panel(dialog).querySelectorAll<SVGElement>('[data-testid="ring-dot"]'),
];
const flags = (dialog: HTMLElement) => [
  ...panel(dialog).querySelectorAll<SVGElement>('[data-testid="ring-flag"]'),
];
/** The chord's dots by direction: the exact ones (the field dots with the blue chord ring) first, then the overlay's ghosts. */
const dirs = (dialog: HTMLElement) => [
  ...[...panel(dialog).querySelectorAll('[data-kind="field"][data-chord="true"]')].map(
    () => 'exact'
  ),
  ...dots(dialog).map((d) => d.getAttribute('data-direction')),
];
const deg = (f: SVGElement) => Number(f.getAttribute('data-degrees'));

describe('the flag and the readout (pure)', () => {
  it('a flag is the error as degrees of the repeat, never under 4 degrees', () => {
    expect(MIN_FLAG_DEG).toBe(4);
    expect(flagDegrees(84.467, 1200)).toBeCloseTo(25.34, 2);
    expect(flagDegrees(-266.87, 1200)).toBeCloseTo(80.06, 2);
    // 2 c is 0.6 degrees of a 1200 c repeat: drawn at the minimum
    expect(flagDegrees(2, 1200)).toBe(4);
    expect(flagDegrees(0.001, 1200)).toBe(4);
    expect(flagDegrees(10, 0)).toBe(4);
  });

  it('the rows carry chord, pitch, nearest and error as data; a merged octave dot keeps the joined ratios', () => {
    const field = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'].map(
      (s) => parseInterval(s) as Note
    );
    const rep = ratioNote(2, 1);
    const five = libraryRing('4:5:6:7', field[2], rep, field)!;
    expect(readoutRows(five)).toEqual([
      { chord: '1', pitch: '5/4', near: '5/4', error: 'exact', direction: 'exact', band: 0 },
      { chord: '5/4', pitch: '25/16', near: '3/2', error: '+70.7 c', direction: 'above', band: 4 },
      { chord: '3/2', pitch: '15/8', near: '15/8', error: 'exact', direction: 'exact', band: 0 },
      { chord: '7/4', pitch: '35/32', near: '9/8', error: '−48.8 c', direction: 'below', band: 4 },
    ]);
    const fold = libraryRing('1:2:3', field[0], rep, field)!;
    expect(readoutRows(fold)).toEqual([
      { chord: '1, 2', pitch: '1/1', near: '1/1', error: 'exact', direction: 'exact', band: 0 },
      { chord: '3', pitch: '3/2', near: '3/2', error: 'exact', direction: 'exact', band: 0 },
    ]);
    // an empty comparison set: nothing to compare with
    const none = libraryRing('4:5:6', field[0], rep, [])!;
    expect(readoutRows(none).map((r) => [r.near, r.error, r.direction])).toEqual([
      ['none', '–', 'none'],
      ['none', '–', 'none'],
      ['none', '–', 'none'],
    ]);
  });

  it('draws the empty panel and the Field | Subset switch with no chord', () => {
    const onCmp = vi.fn();
    render(
      <LabProvider>
        <LibraryRingPanel ring={null} title={null} rootText={null} cmp="field" onCmp={onCmp} />
      </LabProvider>
    );
    expect(screen.getByTestId('ring-empty')).toHaveTextContent(RING_EMPTY_TEXT);
    expect(screen.getByRole('radio', { name: 'Field' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Subset' }));
    expect(onCmp).toHaveBeenCalledWith('subset');
  });
});

/**
 * The panel drawn on its own, inside a lab: the 5-limit major scale as the field (`FIELD7`, 1/1 first: the lab adds the unison
 * itself), a chord from a given root against the whole field or a subset (field indices of FIELD7).
 */
const FIELD7 = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
function Harness({ text, root, cmp }: { text: string; root: string; cmp: 'field' | 'subset' }) {
  const l = useLab();
  const ring = libraryRing(
    text,
    parseInterval(root) as Note,
    l.base.rep,
    compareNotes(l.base, cmp)
  );
  return (
    <LibraryRingPanel
      ring={ring}
      title="a chord"
      rootText={root}
      cmp={cmp}
      onCmp={() => undefined}
    />
  );
}
function drawn(opts: {
  text?: string;
  root?: string;
  cmp?: 'field' | 'subset';
  subset?: number[];
  field?: string[];
}) {
  const view = render(
    <LabProvider>
      <Harness text={opts.text ?? '4:5:6:7'} root={opts.root ?? '1/1'} cmp={opts.cmp ?? 'field'} />
      <Probe />
    </LabProvider>
  );
  const fieldText = opts.field ?? FIELD7.slice(1);
  send(
    { type: 'gen/custom', custom: fieldText.join('\n'), rep: '2/1' },
    { type: 'ui', patch: { tol: 0 } },
    ...(opts.subset
      ? [
          { type: 'sel/none' } as Action,
          ...opts.subset.map((i): Action => ({ type: 'sel/toggle', i })),
        ]
      : [{ type: 'sel/all' } as Action])
  );
  return { view, root: screen.getByTestId('library-ring-panel') };
}
const attr = (el: Element, name: string) => el.getAttribute(name);
/** The main ring's field dots of the panel, in field order. */
const fieldDots = (root: HTMLElement) => [
  ...root.querySelectorAll<SVGElement>('[data-kind="field"]'),
];
/** The field dots that carry the main ring's blue chord ring: the chord's exact notes. */
const exactDots = (root: HTMLElement) => [
  ...root.querySelectorAll<SVGElement>('[data-kind="field"][data-chord="true"]'),
];
const isSolid = (d: Element) => (attr(d, 'class') ?? '').includes('dotOn');
const isHollow = (d: Element) => (attr(d, 'class') ?? '').includes('dotOff');

describe('the ring drawing (the main ring component at a larger radius)', () => {
  it('the marks scale with the ring: field dots r 5.5 x k, the chord marks r 8 x k and the outline r 12 x k', () => {
    expect(RING_DOT_R).toBe(5.5);
    expect(RING_SOUND_R).toBe(8);
    expect(K).toBeCloseTo(181 / 104, 10);
    const { root } = drawn({});
    for (const f of fieldDots(root)) {
      expect(attr(f, 'r')).toBe(String(RING_DOT_R * K));
    }
    // an exact note keeps the field note's own dot and gets the main ring's blue ring (`data-chord`, no extra outline mark); a
    // note that is not exact is the r 8 x k dashed ghost
    const chord = [...root.querySelectorAll('[data-testid="ring-dot"]')];
    expect(chord.map((d) => attr(d, 'r'))).toEqual([String(RING_SOUND_R * K)]);
    expect(chord.map((d) => attr(d, 'data-direction'))).toEqual(['above']);
    expect(chord.map((d) => attr(d, 'data-look'))).toEqual(['ghost']);
    expect(exactDots(root)).toHaveLength(3);
    expect(root.querySelector('circle[class*="selRing"]')).toBeNull();
  });

  it('only radii scale: the strokes and dashes are the main ring values (no --ring-k, no calc)', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/pages/harmonic-field-lab/components/ringMarks.module.css'),
      'utf8'
    );
    expect(css).not.toContain('--ring-k');
    expect(css).toContain('stroke-width: 1.5;');
    expect(css).toContain('stroke-dasharray: 3 2.5;');
    const { root } = drawn({});
    expect(root.querySelector('svg[role="group"]')!.hasAttribute('style')).toBe(true);
    expect(attr(root.querySelector('svg[role="group"]')!, 'style')).not.toContain('--ring-k');
  });

  it('the polygon outlines stop at the dot edges (trimmed edges), the main ring polygons are whole', () => {
    const { root } = drawn({});
    const svg = root.querySelector('svg[role="group"]')!;
    // the fill polygons stay (the subset one keeps its test id); the outlines are separate edge paths
    expect(svg.querySelector('[data-testid="subset-polygon"]')).not.toBeNull();
    expect(svg.querySelector('path[data-edges="subset"]')).not.toBeNull();
    const chordEdges = svg.querySelector('path[data-edges="chord"]')!;
    // 4 corners, 4 edges: each is a segment shorter than the chord between its centers
    expect((attr(chordEdges, 'd') ?? '').match(/M/g)).toHaveLength(4);
  });

  it('Field mode: every field note is solid; Subset mode: a note outside the subset is hollow', () => {
    const field = drawn({});
    expect(fieldDots(field.root).map(isSolid)).toEqual(Array(7).fill(true));
    field.view.unmount();
    // subset = 1/1 and 3/2 (indices 0 and 4)
    const sub = drawn({ cmp: 'subset', subset: [0, 4] });
    const hollow = [false, true, true, true, false, true, true];
    expect(fieldDots(sub.root).map(isHollow)).toEqual(hollow);
    // the outside labels follow the dots: --text for a solid note, --text-muted for a hollow one (CSS, data-on here); they are
    // the first seven texts of the ring (the inside labels come after the dots)
    expect(
      [...sub.root.querySelectorAll('svg[role="group"] text[data-on]')]
        .slice(0, 7)
        .map((f) => attr(f, 'data-on'))
    ).toEqual(hollow.map((h) => String(!h)));
  });

  it('solidAll (the Field switch) makes every field dot solid even when the subset is two notes; Subset leaves the main ring rule', () => {
    const field = drawn({ cmp: 'field', subset: [0, 4] });
    expect(fieldDots(field.root).filter(isSolid)).toHaveLength(7);
    expect(fieldDots(field.root).filter(isHollow)).toHaveLength(0);
    field.view.unmount();
    const sub = drawn({ cmp: 'subset', subset: [0, 4] });
    expect(fieldDots(sub.root).filter(isSolid)).toHaveLength(2);
    expect(fieldDots(sub.root).filter(isHollow)).toHaveLength(5);
  });

  it('inside labels name only the not exact dots, by pitch ratio; the field labels are the main ring labels', () => {
    const { root } = drawn({});
    const inside = [...root.querySelectorAll('[data-testid="ring-dot-label"]')];
    // 4:5:6:7 from 1/1: only 7/4 is not on a field note
    expect(inside.map(textOf)).toEqual(['7/4']);
    // every field dot has its own label in its group, as on the main ring
    expect(fieldDots(root).every((d) => d.parentElement!.querySelector('text') !== null)).toBe(
      true
    );
  });

  it('a merged octave dot is labeled 1, 2 inside the ring when it is not exact; one that is exact has no inside label', () => {
    const exactOnly = drawn({ text: '1:2:3' });
    expect(exactOnly.root.querySelectorAll('[data-testid="ring-dot-label"]')).toHaveLength(0);
    exactOnly.view.unmount();
    // compared with 3/2 alone: 1 and 2 share a dot with no exact match, 3 is exact
    const merged = drawn({ text: '1:2:3', cmp: 'subset', subset: [4] });
    expect([...merged.root.querySelectorAll('[data-testid="ring-dot-label"]')].map(textOf)).toEqual(
      ['1, 2']
    );
  });

  it('the ring is the main ring component: it has the main ring polygon, the field labels, and a leader line for a crowded label', () => {
    const { root } = drawn({ field: Array.from({ length: 24 }, (_, i) => `${(i + 1) * 20}c`) });
    expect(root.querySelector('[data-testid="subset-polygon"]')).not.toBeNull();
    // 24 notes 20 c apart: the labels cannot all sit at their own spot, the main ring's lanes and leader lines apply
    expect(root.querySelectorAll('[data-testid="label-leader"]').length).toBeGreaterThan(0);
  });

  it('the blue chord polygon goes through the exact pitches (7/4 has a corner although it is no field note)', () => {
    const { root } = drawn({});
    const svg = root.querySelector('svg[role="group"]')!;
    const line = svg.querySelector('circle')!;
    const cx = Number(attr(line, 'cx'));
    const cy = Number(attr(line, 'cy'));
    const polygons = svg.querySelectorAll('polygon');
    // the subset polygon first, then the chord's
    const pts = (polygons[1].getAttribute('points') ?? '')
      .split(' ')
      .map((p) => p.split(',').map(Number));
    const cents = pts.map(
      ([x, y]) =>
        (((((Math.atan2(y - cy, x - cx) + Math.PI / 2) / (2 * Math.PI)) % 1) + 1) % 1) * 1200
    );
    // 1/1, 5/4, 3/2 and 7/4 (968.8 c); the field has 5/3 (884.4 c) there, not 7/4
    expect(cents).toHaveLength(4);
    [0, 386.3, 702, 968.8].forEach((c, i) => {
      // compared round the circle: 0 may come out as a hair under 1200
      const d = Math.abs(cents[i] - c);
      expect(Math.min(d, 1200 - d)).toBeLessThan(0.1);
    });
    expect(Math.hypot(pts[0][0] - cx, pts[0][1] - cy)).toBeCloseTo(LIBRARY_RING_R, 5);
  });

  it('a pointer on a dot sets nothing in the lab and a click on it does nothing', () => {
    const { root } = drawn({});
    const d = fieldDots(root)[5];
    const before = [...lab.selected];
    fireEvent.mouseEnter(d);
    fireEvent.focus(d);
    expect(lab.hover).toBeNull();
    fireEvent.click(d);
    fireEvent.keyDown(d, { key: 'Enter' });
    expect([...lab.selected]).toEqual(before);
    expect(lab.hover).toBeNull();
    // not a toggle button: no pressed state
    expect(d.hasAttribute('aria-pressed')).toBe(false);
  });

  it('the table has the same columns for a root of 1/1 and a root of 5/4', () => {
    const a = drawn({ root: '1/1' });
    const headA = headers(a.root);
    const cellsA = [...a.root.querySelectorAll('tbody tr')].map((r) => r.children.length);
    a.view.unmount();
    const b = drawn({ root: '5/4' });
    expect(headers(b.root)).toEqual(headA);
    expect(headA).toEqual(['Mark', ...READOUT_COLUMNS]);
    expect([...b.root.querySelectorAll('tbody tr')].map((r) => r.children.length)).toEqual(cellsA);
    expect(cellsA.every((n) => n === 5)).toBe(true);
    expect(tableRows(b.root)).toEqual([
      '1 | 5/4 | 5/4 | exact',
      '5/4 | 25/16 | 3/2 | +70.7 c',
      '3/2 | 15/8 | 15/8 | exact',
      '7/4 | 35/32 | 9/8 | −48.8 c',
    ]);
  });
});

describe('the ring panel in the dialog', () => {
  it('row 11: nothing hovered or checked: the panel is there with the empty text', async () => {
    const dialog = await open();
    expect(panel(dialog)).toBeInTheDocument();
    expect(within(dialog).getByTestId('ring-empty')).toHaveTextContent(
      'Hover or check a chord to see it here.'
    );
    expect(dots(dialog)).toHaveLength(0);
    // the field's notes are drawn even so
    expect(panel(dialog).querySelectorAll('[data-kind="field"]')).toHaveLength(7);
  });

  it('row 4: 4:5:6:7 from 1/1 is not found: 7/4 is an orange dot with a flag back to 5/3', async () => {
    const dialog = await open();
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6:7'));
    expect(within(dialog).getByTestId('ring-root')).toHaveTextContent('from 1/1');
    expect(readout(dialog)).toEqual([
      '1 | 1/1 | 1/1 | exact',
      '5/4 | 5/4 | 5/4 | exact',
      '3/2 | 3/2 | 3/2 | exact',
      '7/4 | 7/4 | 5/3 | +84.5 c',
    ]);
    expect(dirs(dialog)).toEqual(['exact', 'exact', 'exact', 'above']);
    expect(flags(dialog)).toHaveLength(1);
    expect(flags(dialog)[0].getAttribute('data-direction')).toBe('above');
    expect(deg(flags(dialog)[0])).toBeCloseTo(25.34, 1);
  });

  it('row 5: the stepper root 5/4: 25/16 orange, 35/32 teal', async () => {
    const dialog = await open([...major5(), { type: 'sketch/set', patch: { rootDeg: 2 } }]);
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6:7'));
    expect(within(dialog).getByTestId('ring-root')).toHaveTextContent('from 5/4');
    expect(readout(dialog)).toEqual([
      '1 | 5/4 | 5/4 | exact',
      '5/4 | 25/16 | 3/2 | +70.7 c',
      '3/2 | 15/8 | 15/8 | exact',
      '7/4 | 35/32 | 9/8 | −48.8 c',
    ]);
    expect(dirs(dialog)).toEqual(['exact', 'exact', 'above', 'below']);
    expect(flags(dialog).map((f) => f.getAttribute('data-direction'))).toEqual(['above', 'below']);
  });

  it('row 7: 13/8 is a teal dot with a flag to 5/3 (the library has 8:10:13, not the 8:10:12:13 of the scenario)', async () => {
    const dialog = await open();
    fireEvent.mouseEnter(rowOf(dialog, '8:10:13'));
    expect(readout(dialog)).toEqual([
      '1 | 1/1 | 1/1 | exact',
      '5/4 | 5/4 | 5/4 | exact',
      '13/8 | 13/8 | 5/3 | −43.8 c',
    ]);
    expect(dirs(dialog).filter((d) => d === 'below')).toHaveLength(1);
    expect(flags(dialog)).toHaveLength(1);
    expect(flags(dialog)[0].getAttribute('data-direction')).toBe('below');
  });

  it('row 8: 6:7:9: 7/6 is orange, +63.0 c from 9/8; 3/2 is exact', async () => {
    const dialog = await open();
    fireEvent.mouseEnter(rowOf(dialog, '6:7:9'));
    expect(readout(dialog)).toEqual([
      '1 | 1/1 | 1/1 | exact',
      '7/6 | 7/6 | 9/8 | +63.0 c',
      '3/2 | 3/2 | 3/2 | exact',
    ]);
    expect(dirs(dialog)).toEqual(['exact', 'exact', 'above']);
  });

  it('hovering a shape heading previews its first entry and leaves the shape closed', async () => {
    const dialog = await open();
    const heading = within(dialog).getAllByRole('button', {
      name: /^4:5:6:7 Harmonic Dominant Seventh/,
    })[0];
    fireEvent.mouseEnter(heading.closest('tr') as HTMLElement);
    // the card's two lines: the name, then the ratio under it
    expect(within(dialog).getByTestId('ring-title-name')).toHaveTextContent(
      'Harmonic Dominant Seventh'
    );
    expect(within(dialog).getByTestId('ring-title-ratio')).toHaveTextContent('4:5:6:7');
    expect(dirs(dialog)).toEqual(['exact', 'exact', 'exact', 'above']);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
  });

  it('row 9: Subset compares with the selected notes only, Field with all of them', async () => {
    const dialog = await open([
      ...major5(),
      { type: 'sel/none' },
      { type: 'sel/toggle', i: 0 },
      { type: 'sel/toggle', i: 4 },
    ]);
    expect(lab.state.ui.libCmp).toBe('field');
    fireEvent.mouseEnter(rowOf(dialog, '6:7:9'));
    expect(readout(dialog)[1]).toBe('7/6 | 7/6 | 9/8 | +63.0 c');
    const flagField = deg(flags(dialog)[0]);
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Subset' }));
    expect(lab.state.ui.libCmp).toBe('subset');
    expect(readout(dialog)[1]).toBe('7/6 | 7/6 | 1/1 | +266.9 c');
    // the flag is long now
    expect(deg(flags(dialog)[0])).toBeGreaterThan(flagField * 2);
    expect(deg(flags(dialog)[0])).toBeCloseTo(80.06, 1);
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Field' }));
    expect(readout(dialog)[1]).toBe('7/6 | 7/6 | 9/8 | +63.0 c');
  });

  it('row 10: in 12-EDO a 2 c error still gets a flag of the minimum length', async () => {
    const dialog = await open([
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/all' },
      { type: 'ui', patch: { tol: 25 } },
    ]);
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6'));
    const lines = readout(dialog);
    expect(lines.some((l) => l.endsWith(' | 700.0 c | +2.0 c'))).toBe(true);
    expect(lines.some((l) => l.endsWith(' | 400.0 c | −13.7 c'))).toBe(true);
    const fl = flags(dialog);
    expect(fl).toHaveLength(2);
    const fifth = fl.find((f) => f.getAttribute('data-direction') === 'above')!;
    expect(deg(fifth)).toBe(MIN_FLAG_DEG);
    const third = fl.find((f) => f.getAttribute('data-direction') === 'below')!;
    expect(deg(third)).toBeGreaterThanOrEqual(MIN_FLAG_DEG);
  });

  it('row 12: the pointer leaving a row keeps the chord; a new row replaces it', async () => {
    const dialog = await open();
    const a = rowOf(dialog, '6:7:9');
    fireEvent.mouseEnter(a);
    fireEvent.mouseLeave(a);
    expect(within(dialog).queryByTestId('ring-empty')).toBeNull();
    expect(readout(dialog)).toHaveLength(3);
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6:7'));
    expect(readout(dialog)).toHaveLength(4);
  });

  it('a Check shows the checked row in the panel', async () => {
    const dialog = await open();
    const row = rowOf(dialog, '10:12:15', 'minor triad');
    fireEvent.click(within(row).getByRole('button', { name: 'Check 10:12:15' }));
    // found on 5/4 and 5/3 and the stepper is on 1/1: the lowest root, 5/4
    expect(within(dialog).getByTestId('ring-root')).toHaveTextContent('from 5/4');
    expect(readout(dialog)).toEqual([
      '1 | 5/4 | 5/4 | exact',
      '6/5 | 3/2 | 3/2 | exact',
      '3/2 | 15/8 | 15/8 | exact',
    ]);
    expect(dirs(dialog)).toEqual(['exact', 'exact', 'exact']);
    expect(flags(dialog)).toHaveLength(0);
  });

  it('row 13: a folding row draws one dot for 1 and 2, has no Check, and still draws', async () => {
    const dialog = await open();
    const row = rowOf(dialog, '1:2:3', 'Triunisonus');
    expect(within(row).getByRole('button', { name: 'Check 1:2:3' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.mouseEnter(row);
    expect(within(dialog).getByTestId('ring-root')).toHaveTextContent('from 1/1');
    // two dots (1 and 2 merged, and 3), both exact: the field notes carry the blue chord ring, the overlay draws nothing
    expect(exactDots(panel(dialog))).toHaveLength(2);
    expect(dots(dialog)).toHaveLength(0);
    expect(readout(dialog)).toEqual(['1, 2 | 1/1 | 1/1 | exact', '3 | 3/2 | 3/2 | exact']);
  });
});

/** M7d: "In your subset: found on N roots" (SCENARIOS.M7d.md; written, not yet run). jsdom: no layout, so the two regions' heights and the pinned marker's look are checked by eye. */
describe('the roots table (M7d)', () => {
  const tol = (n: number): Action[] => [...major5(), { type: 'ui', patch: { tol: n } }];
  const minor = (dialog: HTMLElement) => rowOf(dialog, '10:12:15', 'minor triad');
  const rootRows = (dialog: HTMLElement) => [
    ...panel(dialog).querySelectorAll<HTMLElement>('[data-testid="roots-row"]'),
  ];
  const rootTexts = (dialog: HTMLElement) => rootRows(dialog).map(textOf);
  const title = (dialog: HTMLElement) => within(dialog).getByTestId('roots-title');
  const rootOf = (dialog: HTMLElement) => within(dialog).getByTestId('ring-root');
  const rowFor = (dialog: HTMLElement, root: string) =>
    rootRows(dialog).find((r) => textOf(r).startsWith(`${root} `)) as HTMLElement;

  it('row 1: tolerance 0, Minor Triad: two roots, both 0.0, the ring from the lowest (5/4)', async () => {
    const dialog = await open();
    fireEvent.mouseEnter(minor(dialog));
    expect(textOf(title(dialog))).toBe('In your subset: found on 2 roots');
    expect(within(dialog).getByRole('table', { name: 'Roots' })).toBeInTheDocument();
    expect(rootTexts(dialog)).toEqual(['5/4 0.0 0.0', '5/3 0.0 0.0']);
    expect(rootOf(dialog)).toHaveTextContent('from 5/4');
  });

  it('row 2: tolerance 25: three roots with their numbers; Worst and Avg use the heat bands', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    expect(rootTexts(dialog)).toEqual(['9/8 21.5 21.5', '5/4 0.0 0.0', '5/3 0.0 0.0']);
    expect(rootOf(dialog)).toHaveTextContent('from 9/8');
    const stats = [...rowFor(dialog, '9/8').querySelectorAll('td[data-col="stat"] > span')];
    expect(stats.map((s) => s.getAttribute('data-sev'))).toEqual(['3', '3']);
    const exact = [...rowFor(dialog, '5/4').querySelectorAll('td[data-col="stat"] > span')];
    expect(exact.map((s) => s.getAttribute('data-sev'))).toEqual(['0', '0']);
  });

  it('row 3: the pointer on a root row previews it (ring, readout); leaving goes back to the default', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    const r = rowFor(dialog, '5/3');
    fireEvent.mouseEnter(r);
    expect(rootOf(dialog)).toHaveTextContent('from 5/3');
    expect(readout(dialog)[0]).toBe('1 | 5/3 | 5/3 | exact');
    fireEvent.mouseLeave(r);
    expect(rootOf(dialog)).toHaveTextContent('from 9/8');
  });

  it('row 4: a click pins the root (marked, kept after the pointer leaves); a second click unpins', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    const r = rowFor(dialog, '5/3');
    fireEvent.mouseEnter(r);
    fireEvent.click(r);
    expect(r).toHaveAttribute('data-pinned', 'true');
    fireEvent.mouseLeave(r);
    expect(rootOf(dialog)).toHaveTextContent('from 5/3');
    expect(rowFor(dialog, '5/3')).toHaveAttribute('data-pinned', 'true');
    expect(rowFor(dialog, '9/8')).toHaveAttribute('data-pinned', 'false');
    fireEvent.click(rowFor(dialog, '5/3'));
    expect(rowFor(dialog, '5/3')).toHaveAttribute('data-pinned', 'false');
    expect(rootOf(dialog)).toHaveTextContent('from 9/8');
  });

  it('Enter and Space on a focused root row pin it', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    const r = rowFor(dialog, '5/4');
    expect(r).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(r, { key: 'Enter' });
    expect(rowFor(dialog, '5/4')).toHaveAttribute('data-pinned', 'true');
    fireEvent.keyDown(rowFor(dialog, '5/4'), { key: ' ' });
    expect(rowFor(dialog, '5/4')).toHaveAttribute('data-pinned', 'false');
  });

  it('row 5: hovering a different library row switches the table and drops the pin', async () => {
    const dialog = await open(tol(25));
    const a = minor(dialog);
    fireEvent.mouseEnter(a);
    fireEvent.click(rowFor(dialog, '5/3'));
    fireEvent.mouseLeave(a);
    // the same chord again keeps the pin
    fireEvent.mouseEnter(a);
    expect(rootOf(dialog)).toHaveTextContent('from 5/3');
    fireEvent.mouseLeave(a);
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6'));
    expect(rootRows(dialog).every((r) => r.getAttribute('data-pinned') === 'false')).toBe(true);
    fireEvent.mouseEnter(minor(dialog));
    expect(rootOf(dialog)).toHaveTextContent('from 9/8');
  });

  it('a Check resets the pin', async () => {
    const dialog = await open(tol(25));
    const a = minor(dialog);
    fireEvent.mouseEnter(a);
    fireEvent.click(rowFor(dialog, '5/3'));
    fireEvent.click(within(a).getByRole('button', { name: 'Check 10:12:15' }));
    expect(rowFor(dialog, '5/3')).toHaveAttribute('data-pinned', 'false');
    expect(rootOf(dialog)).toHaveTextContent('from 9/8');
  });

  it('row 11: hovering never checks the row: no Clear checks, no Check line', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    expect(rootRows(dialog)).toHaveLength(3);
    expect(within(dialog).queryByRole('button', { name: /^Clear checks/ })).toBeNull();
    expect(within(dialog).queryByTestId('check-line')).toBeNull();
    expect(lab.state.ui.libChecked).toEqual([]);
  });

  it('row 12: a pinned root stays when the tolerance drops while it is still found, and is dropped when it is not', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    fireEvent.click(rowFor(dialog, '5/3'));
    send({ type: 'ui', patch: { tol: 0 } });
    expect(rowFor(dialog, '5/3')).toHaveAttribute('data-pinned', 'true');
    expect(rootOf(dialog)).toHaveTextContent('from 5/3');
    // 9/8 is pinned at 25 c and gone at 0 c: the default root applies
    send({ type: 'ui', patch: { tol: 25 } });
    fireEvent.click(rowFor(dialog, '9/8'));
    send({ type: 'ui', patch: { tol: 0 } });
    expect(rootOf(dialog)).toHaveTextContent('from 5/4');
    send({ type: 'ui', patch: { tol: 25 } });
    expect(rowFor(dialog, '9/8')).toHaveAttribute('data-pinned', 'false');
  });

  it('row 6: tolerance 90, 4:5:6:7: five roots low to high, from 1/1 (the stepper root)', async () => {
    const dialog = await open(tol(90));
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6:7'));
    expect(rootTexts(dialog)).toEqual([
      '1/1 84.5 28.2',
      '5/4 70.7 39.8',
      '4/3 63.0 21.0',
      '3/2 27.3 9.1',
      '5/3 70.7 39.8',
    ]);
    expect(rootOf(dialog)).toHaveTextContent('from 1/1');
  });

  it('row 7: tolerance 0, 4:5:6:7: the message in the table place, the ring from the stepper root', async () => {
    const dialog = await open();
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6:7'));
    expect(within(dialog).getByTestId('roots-message')).toHaveTextContent(
      'Not found in this subset at this tolerance.'
    );
    expect(within(dialog).queryByRole('table', { name: 'Roots' })).toBeNull();
    expect(rootOf(dialog)).toHaveTextContent('from 1/1');
  });

  it('row 8: tolerance 30: one root, titled in the singular', async () => {
    const dialog = await open(tol(30));
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6:7'));
    expect(textOf(title(dialog))).toBe('In your subset: found on 1 root');
    expect(rootTexts(dialog)).toEqual(['3/2 27.3 9.1']);
    expect(rootOf(dialog)).toHaveTextContent('from 3/2');
  });

  it('row 9: a subset of one note shows the range hint, the same sentence as Check', async () => {
    const dialog = await open([...major5(), { type: 'sel/none' }, { type: 'sel/toggle', i: 0 }]);
    fireEvent.mouseEnter(rowOf(dialog, '4:5:6'));
    expect(within(dialog).getByTestId('roots-message')).toHaveTextContent(
      'Chords are found for a subset of 2 to 128 notes. Select a few more notes.'
    );
    expect(within(dialog).queryByRole('table', { name: 'Roots' })).toBeNull();
  });

  it('row 10: a folding chord shows the folding note, no table', async () => {
    const dialog = await open();
    fireEvent.mouseEnter(rowOf(dialog, '1:2:3', 'Triunisonus'));
    expect(within(dialog).getByTestId('roots-message')).toHaveTextContent(
      'Octave notes merge in this repeat; the finder skips it here.'
    );
    expect(within(dialog).queryByRole('table', { name: 'Roots' })).toBeNull();
  });

  it('no chord shown: no roots table, the empty text stays', async () => {
    const dialog = await open();
    expect(within(dialog).queryByTestId('library-roots')).toBeNull();
    expect(within(dialog).getByTestId('ring-empty')).toBeInTheDocument();
  });

  it('the quiet note is there only while the switch is on Field (its line stays)', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    const note = within(dialog).getByTestId('roots-note');
    expect(note).toHaveTextContent('Ring compares with the whole field.');
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Subset' }));
    expect(within(dialog).getByTestId('roots-note')).toBeEmptyDOMElement();
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Field' }));
    expect(within(dialog).getByTestId('roots-note')).toHaveTextContent(
      'Ring compares with the whole field.'
    );
  });

  it('row 14: hold 1 with the pointer on a root row sounds the chord from that root', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    const r = rowFor(dialog, '5/3');
    fireEvent.mouseEnter(r);
    fireEvent.keyDown(r, { key: '1' });
    const list = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(list).toHaveLength(3);
    // 5/3 is 884.4 c above 1/1; 10:12:15 from it: 5/3, 2, 5/2
    expect(Math.round(cents(list[0], C4))).toBe(884);
    fireEvent.keyUp(r, { key: '1' });
    expect(running()).toHaveLength(0);
  });
});

describe('hold 1 on a library row', () => {
  const heard = () =>
    running()
      .map(hz)
      .sort((x, y) => x - y);
  const rel = (list: number[]) => list.map((h) => Math.round(cents(h, list[0]) * 10) / 10);

  it('row 5: not found, stepper root 5/4: hold 1 plays the rounded chord on 1/1 (M7e); leaving the row or typing in the search box does not', async () => {
    const dialog = await open([...major5(), { type: 'sketch/set', patch: { rootDeg: 2 } }]);
    const row = rowOf(dialog, '4:5:6:7');
    // no pointer on the row yet: nothing
    fireEvent.keyDown(row, { key: '1' });
    expect(running()).toHaveLength(0);
    fireEvent.keyUp(row, { key: '1' });
    fireEvent.mouseEnter(row);
    // typing in the search box ignores the key (the box is not the pointer's row, but the guard is the box having focus)
    const box = within(dialog).getByRole('textbox', { name: 'Search chords' });
    fireEvent.keyDown(box, { key: '1' });
    expect(running()).toHaveLength(0);
    fireEvent.keyUp(box, { key: '1' });
    // the key reaches the page through the dialog (a portal): the pointer is on the row, nothing is typed in
    fireEvent.keyDown(row, { key: '1' });
    const list = heard();
    expect(list).toHaveLength(4);
    // M7e: not found at 0 c, so hold 1 plays like hold 4 rooted on the field's 1/1: 1/1, 5/4, 3/2 and 7/4 rounded to 5/3
    expect(Math.round(cents(list[0], C4))).toBe(0);
    expect(rel(list)).toEqual([0, 386.3, 702, 884.4]);
    fireEvent.keyUp(row, { key: '1' });
    expect(running()).toHaveLength(0);
    // the pointer leaves the row: the target is gone
    fireEvent.mouseLeave(row);
    fireEvent.keyDown(row, { key: '1' });
    expect(running()).toHaveLength(0);
  });

  it('row 1: found on 5/4 and 5/3: sounds from 5/4; a folding row sounds its real octaves from 1/1', async () => {
    const dialog = await open();
    const minor = rowOf(dialog, '10:12:15', 'minor triad');
    fireEvent.mouseEnter(minor);
    fireEvent.keyDown(minor, { key: '1' });
    expect(Math.round(cents(heard()[0], C4))).toBe(386);
    expect(rel(heard())).toEqual([0, 315.6, 702]);
    fireEvent.keyUp(minor, { key: '1' });
    fireEvent.mouseLeave(minor);
    const fold = rowOf(dialog, '1:2:3', 'Triunisonus');
    fireEvent.mouseEnter(fold);
    fireEvent.keyDown(fold, { key: '1' });
    // 1, 2 and 3 over 1/1: the octave is real here (it merges only on the ring)
    expect(Math.round(cents(heard()[0], C4))).toBe(0);
    expect(rel(heard())).toEqual([0, 1200, 1902]);
    fireEvent.keyUp(fold, { key: '1' });
  });
});

/**
 * M7e: holds 1, 4 and 5 on a library row, a shape heading or a root row (SCENARIOS.M7e.md; written, not yet run). Pitches are read
 * from the oscillators (relative to the lowest, and the lowest against 1/1 = C4). jsdom cannot say how any of it sounds.
 */
describe('hold 1, 4 and 5 on a library chord (M7e)', () => {
  const heard = () =>
    running()
      .map(hz)
      .sort((x, y) => x - y);
  const rel = (list: number[]) => list.map((h) => Math.round(cents(h, list[0]) * 10) / 10);
  const low = (list: number[]) => Math.round(cents(list[0], C4));
  const tol = (n: number): Action[] => [...major5(), { type: 'ui', patch: { tol: n } }];
  const minor = (dialog: HTMLElement) => rowOf(dialog, '10:12:15', 'minor triad');
  const rootRow = (dialog: HTMLElement, root: string) =>
    [...panel(dialog).querySelectorAll<HTMLElement>('[data-testid="roots-row"]')].find((r) =>
      textOf(r).startsWith(`${root} `)
    ) as HTMLElement;
  /** Holds `key`, returns what sounds, and lets it go. */
  const hold = (el: Element, key: string): number[] => {
    fireEvent.keyDown(el, { key });
    const list = heard();
    fireEvent.keyUp(el, { key });
    expect(running()).toHaveLength(0);
    return list;
  };

  it('row 3: 10:12:15 at 25 c, ring root 9/8, stepper 1/1: 1 plays the finder notes on 9/8, 4 and 5 play from the stepper 1/1', async () => {
    const dialog = await open(tol(25));
    const row = minor(dialog);
    fireEvent.mouseEnter(row);
    // 1: the ring's root 9/8 (203.9 c): 9/8, 4/3 (498.0), 5/3 (884.4)
    const own = hold(row, '1');
    expect(low(own)).toBe(204);
    expect(rel(own)).toEqual([0, 294.1, 680.4]);
    // 4: rounded from 1/1: 1/1, 5/4 (6/5 rounds to it), 3/2
    const four = hold(row, '4');
    expect(low(four)).toBe(0);
    expect(rel(four)).toEqual([0, 386.3, 702]);
    // 5: exact from 1/1: 1/1, 6/5 (315.6 c), 3/2
    const exact = hold(row, '5');
    expect(low(exact)).toBe(0);
    expect(rel(exact)).toEqual([0, 315.6, 702]);
  });

  it('row 2: the stepper on 5/3: 4 and 5 play 5/3, 1/1, 5/4; moving the stepper while 4 is held moves the sounding root', async () => {
    const dialog = await open([...tol(25), { type: 'sketch/set', patch: { rootDeg: 5 } }]);
    const row = minor(dialog);
    fireEvent.mouseEnter(row);
    for (const key of ['4', '5']) {
      const list = hold(row, key);
      // 5/3, 1/1 an octave up, 5/4 an octave up: 884.4, 1200, 1586.3 c
      expect(low(list)).toBe(884);
      expect(rel(list)).toEqual([0, 315.6, 702]);
    }
    fireEvent.keyDown(row, { key: '4' });
    expect(low(heard())).toBe(884);
    send({ type: 'sketch/set', patch: { rootDeg: 0 } });
    // still held: now from 1/1, rounded: 1/1, 5/4, 3/2
    expect(low(heard())).toBe(0);
    expect(rel(heard())).toEqual([0, 386.3, 702]);
    fireEvent.keyUp(row, { key: '4' });
    expect(running()).toHaveLength(0);
  });

  it('a pinned root row is an explicit choice: all three keys play from it, whatever the stepper', async () => {
    const dialog = await open(tol(25));
    const row = minor(dialog);
    fireEvent.mouseEnter(row);
    // pin 5/3 (a click on its row), stepper still on 1/1
    fireEvent.click(rootRow(dialog, '5/3'));
    fireEvent.mouseLeave(rootRow(dialog, '5/3'));
    fireEvent.mouseEnter(row);
    for (const key of ['1', '4', '5']) {
      expect(low(hold(row, key))).toBe(884);
    }
  });

  it('row 4: the pointer on a root row plays from that root, and moving to another row changes the sounding root', async () => {
    const dialog = await open(tol(25));
    fireEvent.mouseEnter(minor(dialog));
    const on53 = rootRow(dialog, '5/3');
    fireEvent.mouseEnter(on53);
    for (const key of ['1', '4', '5']) {
      const list = hold(on53, key);
      // 5/3, 1/1 an octave up, 5/4 an octave up: 884.4, 1200, 1586.3 c
      expect(low(list)).toBe(884);
      expect(rel(list)).toEqual([0, 315.6, 702]);
    }
    fireEvent.keyDown(on53, { key: '4' });
    expect(low(heard())).toBe(884);
    const on54 = rootRow(dialog, '5/4');
    fireEvent.mouseLeave(on53);
    fireEvent.mouseEnter(on54);
    // still held: now from 5/4 (386.3 c)
    expect(low(heard())).toBe(386);
    fireEvent.keyUp(on54, { key: '4' });
    expect(running()).toHaveLength(0);
  });

  it('rows 5 to 7: tolerance 0, stepper 5/4, 4:5:6:7: 1 = rounded on 1/1, 4 = rounded from 5/4, 5 = exact on 5/4', async () => {
    const dialog = await open([...tol(0), { type: 'sketch/set', patch: { rootDeg: 2 } }]);
    const row = rowOf(dialog, '4:5:6:7');
    fireEvent.mouseEnter(row);
    expect(within(dialog).getByTestId('roots-message')).toHaveTextContent(
      'Not found in this subset at this tolerance.'
    );
    const one = hold(row, '1');
    expect(low(one)).toBe(0);
    expect(rel(one)).toEqual([0, 386.3, 702, 884.4]);
    const four = hold(row, '4');
    expect(low(four)).toBe(386);
    // 5/4, 3/2 (25/16 rounded), 15/8, 9/4 (35/16 rounded to 9/8, an octave up)
    expect(rel(four)).toEqual([0, 315.6, 702, 1017.6]);
    const five = hold(row, '5');
    expect(low(five)).toBe(386);
    expect(rel(five)).toEqual([0, 386.3, 702, 968.8]);
  });

  it('rows 8 and 9: a 3-note subset 1/1, 5/4, 3/2: 7/4 rounds to 2/1 on Subset and to 5/3 on Field, also while the key is held', async () => {
    const dialog = await open([
      ...tol(0),
      { type: 'sel/none' },
      { type: 'sel/toggle', i: 0 },
      { type: 'sel/toggle', i: 2 },
      { type: 'sel/toggle', i: 4 },
    ]);
    const row = rowOf(dialog, '4:5:6:7');
    fireEvent.mouseEnter(row);
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Subset' }));
    expect(rel(hold(row, '1'))).toEqual([0, 386.3, 702, 1200]);
    expect(rel(hold(row, '4'))).toEqual([0, 386.3, 702, 1200]);
    expect(rel(hold(row, '5'))).toEqual([0, 386.3, 702, 968.8]);
    // the switch changes the rounding under a held key
    fireEvent.keyDown(row, { key: '1' });
    expect(rel(heard())).toEqual([0, 386.3, 702, 1200]);
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Field' }));
    expect(rel(heard())).toEqual([0, 386.3, 702, 884.4]);
    fireEvent.keyUp(row, { key: '1' });
    expect(running()).toHaveLength(0);
  });

  it('row 11: a folding row is never silent: 1 and 4 round, 5 is exact with its real octaves', async () => {
    const dialog = await open();
    const fold = rowOf(dialog, '1:2:3', 'Triunisonus');
    fireEvent.mouseEnter(fold);
    for (const key of ['1', '4', '5']) {
      const list = hold(fold, key);
      expect(low(list)).toBe(0);
      expect(rel(list)).toEqual([0, 1200, 1902]);
    }
  });

  it('the sounding marks of the ring: M7e scenario 3b (written, not yet run)', async () => {
    const dialog = await open(tol(25));
    const row = minor(dialog);
    fireEvent.mouseEnter(row);
    // the main ring's own marks: a sounding field note is its field dot drawn lit (class dotLit), a sounding pitch that is no
    // field note is the ring's ghost (aria-label "Ghost: 315.6 c, ...")
    const lit = () =>
      [...panel(dialog).querySelectorAll<SVGElement>('[data-kind="field"]')]
        .filter((m) => (m.getAttribute('class') ?? '').includes('dotLit'))
        .map((m) => Number(m.getAttribute('data-index')));
    const ghosts = () =>
      [...panel(dialog).querySelectorAll<SVGElement>('[data-testid="ring-ghost"]')].map(
        (m) => /Ghost: ([\d.]+) c/.exec(m.getAttribute('aria-label') ?? '')?.[1]
      );
    expect(lit()).toEqual([]);
    expect(ghosts()).toEqual([]);
    // field indices: 0 = 1/1, 1 = 9/8, 2 = 5/4, 3 = 4/3, 4 = 3/2, 5 = 5/3, 6 = 15/8; the stepper is on 1/1
    // hold 5: exact 1/1, 6/5, 3/2: 1/1 and 3/2 light, 6/5 (315.6 c) is a dashed green circle
    fireEvent.keyDown(row, { key: '5' });
    expect(lit()).toEqual([0, 4]);
    expect(ghosts()).toEqual(['315.6']);
    const mark = panel(dialog).querySelector('[data-kind="field"][class*="dotLit"]')!;
    expect(attr(mark, 'r')).toBe(String(RING_SOUND_R * K));
    const ghost = panel(dialog).querySelector('[data-testid="ring-ghost"]')!;
    expect(attr(ghost, 'r')).toBe(String(RING_SOUND_R * K));
    // the chord's own marks stay (the three exact notes carry the blue chord ring), and the sounding ghost is drawn after the overlay (over it)
    expect(exactDots(panel(dialog))).toHaveLength(3);
    const all = [...panel(dialog).querySelectorAll('svg *')];
    expect(all.indexOf(ghost)).toBeGreaterThan(
      all.indexOf(panel(dialog).querySelector('[data-testid="ring-overlay"]')!)
    );
    fireEvent.keyUp(row, { key: '5' });
    expect(lit()).toEqual([]);
    expect(ghosts()).toEqual([]);
    // hold 4: 1/1, 5/4, 3/2, no ghost
    fireEvent.keyDown(row, { key: '4' });
    expect(lit()).toEqual([0, 2, 4]);
    expect(ghosts()).toEqual([]);
    fireEvent.keyUp(row, { key: '4' });
    // hold 1: 9/8, 4/3, 5/3
    fireEvent.keyDown(row, { key: '1' });
    expect(lit()).toEqual([1, 3, 5]);
    expect(ghosts()).toEqual([]);
    fireEvent.keyUp(row, { key: '1' });
    expect(lit()).toEqual([]);
  });

  it('a shape heading plays too, and 2 and 3 stay silent on a library row', async () => {
    const dialog = await open(tol(25));
    search(dialog, 'minor triad');
    // the first row of the first shape's tbody is its heading row
    const head = dialog.querySelector(
      'table[aria-label="Chord library shapes"] tbody tr'
    ) as HTMLElement;
    fireEvent.mouseEnter(head);
    expect(hold(head, '4').length).toBeGreaterThan(0);
    fireEvent.keyDown(head, { key: '2' });
    fireEvent.keyDown(head, { key: '3' });
    expect(running()).toHaveLength(0);
  });
});

/**
 * Holds 1, 4 and 5 with the pointer on a field dot of the library ring (written, not run): 1 = that note, 4 = the SHOWN chord on
 * it rounded to the comparison set, 5 = its exact ratios on it. A dot is an explicit root: the Sketch stepper is not read.
 */
describe('hold 1, 4 and 5 on a field dot of the library ring', () => {
  const heard = () =>
    running()
      .map(hz)
      .sort((x, y) => x - y);
  const abs = (list: number[]) => list.map((h) => Math.round(cents(h, C4)));
  const dot = (dialog: HTMLElement, i: number) =>
    panel(dialog).querySelector<SVGElement>(`[data-kind="field"][data-index="${i}"]`)!;
  /** Holds `key` (the pointer stays where it is), returns what sounds in cents above 1/1, and lets it go. */
  const hold = (el: Element, key: string): number[] => {
    fireEvent.keyDown(el, { key });
    const list = abs(heard());
    fireEvent.keyUp(el, { key });
    expect(running()).toHaveLength(0);
    return list;
  };
  /** Shows 4:5:6:7 (the pointer enters its row and leaves it: the ring keeps it), stepper on 1/1. */
  const showChord = (dialog: HTMLElement) => {
    const row = rowOf(dialog, '4:5:6:7');
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
  };

  it('4:5:6:7 shown, the 5/3 dot: 1 plays 5/3, 4 the chord rounded on 5/3 (octaves kept), 5 its exact ratios; the stepper is ignored', async () => {
    const dialog = await open([...major5(), { type: 'sketch/set', patch: { rootDeg: 2 } }]);
    showChord(dialog);
    const d = dot(dialog, 5);
    fireEvent.mouseEnter(d);
    expect(hold(d, '1')).toEqual([884]);
    // 5/3, 25/12 rounded to 1/1 an octave up, 5/2, 35/12 rounded to 3/2 an octave up
    expect(hold(d, '4')).toEqual([884, 1200, 1586, 1902]);
    // 5/3, 25/12 (1270.7 c), 5/2, 35/12 (1853.2 c)
    expect(hold(d, '5')).toEqual([884, 1271, 1586, 1853]);
    // the shown chord did not change by hovering a dot
    expect(within(dialog).getByTestId('ring-title-ratio')).toHaveTextContent('4:5:6:7');
  });

  it('the Field | Subset switch changes the rounding under a held 4', async () => {
    const dialog = await open([
      ...major5(),
      { type: 'sel/none' },
      { type: 'sel/toggle', i: 0 },
      { type: 'sel/toggle', i: 2 },
      { type: 'sel/toggle', i: 4 },
    ]);
    showChord(dialog);
    const d = dot(dialog, 5);
    fireEvent.mouseEnter(d);
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Subset' }));
    // the subset is 1/1, 5/4, 3/2: 5/3 itself rounds to 3/2
    fireEvent.keyDown(d, { key: '4' });
    expect(abs(heard())).toEqual([702, 1200, 1586, 1902]);
    fireEvent.click(within(panel(dialog)).getByRole('radio', { name: 'Field' }));
    expect(abs(heard())).toEqual([884, 1200, 1586, 1902]);
    fireEvent.keyUp(d, { key: '4' });
    expect(running()).toHaveLength(0);
  });

  it('a folding chord still plays on a dot (1:2:3 on 5/3)', async () => {
    const dialog = await open();
    const row = rowOf(dialog, '1:2:3', 'Triunisonus');
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    const d = dot(dialog, 5);
    fireEvent.mouseEnter(d);
    expect(hold(d, '5')).toEqual([884, 2084, 2786]);
    expect(hold(d, '4')).toEqual([884, 2084, 2786]);
  });

  it('no chord shown: 1 plays the note, 4 and 5 stay silent', async () => {
    const dialog = await open();
    const d = dot(dialog, 5);
    fireEvent.mouseEnter(d);
    expect(hold(d, '1')).toEqual([884]);
    for (const key of ['4', '5']) {
      fireEvent.keyDown(d, { key });
      expect(running()).toHaveLength(0);
      fireEvent.keyUp(d, { key });
    }
  });

  it('leaving the dot clears the target: no key plays, and a row sounds again afterwards', async () => {
    const dialog = await open();
    showChord(dialog);
    const d = dot(dialog, 5);
    fireEvent.mouseEnter(d);
    expect(hold(d, '1')).toEqual([884]);
    fireEvent.mouseLeave(d);
    fireEvent.keyDown(d, { key: '1' });
    expect(running()).toHaveLength(0);
    fireEvent.keyUp(d, { key: '1' });
    // focus and blur do the same
    fireEvent.focus(d);
    expect(hold(d, '1')).toEqual([884]);
    fireEvent.blur(d);
    fireEvent.keyDown(d, { key: '1' });
    expect(running()).toHaveLength(0);
  });

  it('the marks drawn over the field dots take no pointer, so a hover on a lit dot is a hover on the field dot under it', async () => {
    const dialog = await open();
    showChord(dialog);
    const d = dot(dialog, 5);
    fireEvent.mouseEnter(d);
    fireEvent.keyDown(d, { key: '4' });
    // a lit dot is a field dot itself (it carries the dot's handlers); the chord's own marks are in the pointer-less overlay
    const lit = panel(dialog).querySelector('[data-kind="field"][class*="dotLit"]')!;
    expect(lit.closest('[data-pointer="none"]')).toBeNull();
    for (const m of panel(dialog).querySelectorAll('[data-testid="ring-dot"]')) {
      expect(m.closest('[data-pointer="none"]')).not.toBeNull();
    }
    // the field dots themselves are outside it
    expect(d.closest('[data-pointer="none"]')).toBeNull();
    fireEvent.keyUp(d, { key: '4' });
    // the rules are in the stylesheet (jsdom applies no CSS modules): the overlay, and the sounding ghosts drawn over it
    const css = readFileSync(
      resolve(process.cwd(), 'src/pages/harmonic-field-lab/components/libraryRing.module.css'),
      'utf8'
    );
    expect(css).toMatch(/\[data-pointer='none'\] \*\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\[data-testid='ring-ghost'\]\s*\{[^}]*pointer-events:\s*none/);
  });
});

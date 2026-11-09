/**
 * Everything the Scale tab shows for one pitch-class selection, derived in one place: the modes in display
 * order, the summary rows, and the plain-text copy of the results.
 */
import {
  chordsOf,
  chordTally,
  spellPcs,
  noteNames,
  type ChordContext,
  type NameMode,
} from './chords';
import {
  axisLabel,
  fmt,
  joinSigned,
  sgn1,
  TIP_RANGE_VS_EXPECTED,
  TIP_RANGE_VS_SIZE,
  widthWord,
} from './format';
import { pathLayout } from './neighbours';
import {
  fixedAxis,
  icvOf,
  icvText,
  modesOf,
  neighboursOf,
  setStats,
  type InversionMode,
  type Mode,
  type ModeSet,
  type PrimeConvention,
  type SetStats,
} from './pitchSets';
import type { PlayAs, SortMode } from './settings';

export interface ViewOptions {
  invMode: InversionMode;
  sortMode: SortMode;
  expansion: number | 'all';
  nameMode: NameMode;
  flats: boolean;
  playAs: PlayAs;
  /** Pitch class played/shown as the root when playing "set to zero". */
  zeroRoot: number;
  conv: PrimeConvention;
}

export interface ScaleView {
  s: number[];
  res: ModeSet;
  /** Distinct modes in the chosen order; chord and play indices refer to this list. */
  view: Mode[];
  stats: SetStats;
}

export function buildView(s: number[], o: ViewOptions): ScaleView | null {
  if (!s.length) {
    return null;
  }
  const res = modesOf(s, o.invMode);
  const view = [...res.list];
  if (o.sortMode === 'fifths') {
    view.sort((a, b) => a.fs - b.fs || a.k - b.k);
  }
  return { s, res, view, stats: setStats(s, o.conv) };
}

/** A mode's pitch classes as shown and played: original pitches (rotation) or relative to the chosen root. */
export function displayPcs(m: Mode, o: Pick<ViewOptions, 'playAs' | 'zeroRoot'>): number[] {
  return o.playAs === 'zero' ? m.z.map((x) => (o.zeroRoot + x) % 12) : m.abs;
}

export const chordContext = (m: Mode, o: ViewOptions): ChordContext => ({
  displayPcs: displayPcs(m, o),
  flats: o.flats,
  nameMode: o.nameMode,
});

/** Which expansions (E0..) are shown for a mode of n notes. */
export function expansionList(n: number, expansion: number | 'all'): number[] {
  if (expansion === 'all') {
    return Array.from({ length: n }, (_, e) => e);
  }
  return [Math.max(0, Math.min(expansion, n - 1))];
}

/** The single expansion used for the summary tallies. */
const tallyExpansion = (n: number, expansion: number | 'all') =>
  expansion === 'all' ? 1 : Math.min(expansion, n - 1);

export interface SummaryRow {
  label: string;
  value: string;
  /** Smaller secondary text after the value. */
  note?: string;
  tip?: string;
  /** Plain rows (like Order) are not repeated per comparison. */
  plain?: boolean;
}

export function summaryRows(v: ScaleView, o: ViewOptions): SummaryRow[] {
  const { s, res, view, stats } = v;
  const names = noteNames(o.flats);
  const first = res.list[0];
  const e1 = tallyExpansion(first.z.length, o.expansion);
  const ctx = chordContext(first, o);
  const rows: SummaryRow[] = [];
  const add = (label: string, value: string, extra: Partial<SummaryRow> = {}) =>
    rows.push({ label, value, ...extra });

  const hemTxt = stats.semis.hem === 0 ? '0 (anhemitonic)' : String(stats.semis.hem);
  const ratio = stats.semis.hem ? fmt(stats.semis.coh / stats.semis.hem) : 'n/a';
  const invSymTxt = stats.invSym.length
    ? stats.invSym.map((q) => `I${q} (${axisLabel(q, names)})`).join(', ')
    : 'none';
  const fixed = fixedAxis(o.invMode);

  add('Input PC Set', `{${s.join(', ')}}`);
  add('Notes', String(s.length));
  add('Distinct Modes', view.length + (view.length < res.total ? ` of ${res.total}` : ''));
  add(
    'Rotational Symmetry',
    stats.rotSym.length ? stats.rotSym.map((k) => `T${k}`).join(', ') : 'none'
  );
  add(`Triads (E${e1})`, chordTally(chordsOf(first, 3, e1 + 1, ctx)));
  add(`Seventh Chords (E${e1})`, chordTally(chordsOf(first, 4, e1 + 1, ctx)));
  add('Notes with a P5 Above', `${stats.withP5.length} of ${s.length}`);
  add('No P5 Above', stats.noP5.length ? stats.noP5.map((p) => names[p]).join(', ') : 'none');
  add('Longest Fifth Chain', String(stats.chainLen));
  const rve = stats.rve;
  if (rve) {
    add('Range vs Size Average', `${sgn1(rve.zs)} · ${widthWord(rve.zs)} for its size`, {
      note: `(range ${rve.fr}, average ${Math.round(rve.avg)})`,
      tip: TIP_RANGE_VS_SIZE,
    });
    add('Range vs Expected', `${sgn1(rve.z)} · ${widthWord(rve.z)} for its P5 count`, {
      note: `(range ${rve.fr}, expected ${Math.round(rve.exp)})`,
      tip: TIP_RANGE_VS_EXPECTED,
    });
  }
  add('Inversional Symmetry', invSymTxt);
  if (fixed !== null) {
    add('Inverted Set', `{${res.base.join(', ')}}`);
  }
  add('Interval Vector', icvText(icvOf(s)));
  if (stats.zRelated.length) {
    add('Same Vector, Different Set', stats.zRelated.map((k) => `[${k}]`).join(' '));
  }
  add('Hemitonia', hemTxt);
  add('Isolated / Chained', `${stats.semis.iso} / ${stats.semis.chain}`);
  add('Cohemitonia', String(stats.semis.coh));
  add('Chaining (Coh ÷ Hem)', ratio);
  add('Semitone Runs', stats.semis.runs.length ? stats.semis.runs.join(', ') : 'none');
  add('Hemitonia Density', fmt(stats.density), { note: 'per note' });
  add('Order', o.sortMode === 'fifths' ? 'Fifths brightness, dark to bright' : 'By starting note', {
    plain: true,
  });
  return rows;
}

/** Plain-text copy of the results, matching the artifact's "Copy results" output. */
export function copyText(v: ScaleView, o: ViewOptions, pathMax: number): string {
  const { s, res, view, stats } = v;
  const names = noteNames(o.flats);
  const st = stats.semis;
  const fixed = fixedAxis(o.invMode);
  const rve = stats.rve;
  const ratio = st.hem ? fmt(st.coh / st.hem) : 'n/a';
  const invTxt =
    o.invMode === 'off'
      ? 'off'
      : o.invMode === 'root'
        ? 'each mode about its root'
        : `${o.invMode} (${axisLabel(fixed ?? 0, names)})`;
  const invSetTxt = fixed !== null ? `{${res.base.join(', ')}}` : null;
  const noP5Txt = stats.noP5.length ? stats.noP5.map((p) => names[p]).join(', ') : 'none';
  const invSymTxt = stats.invSym.length
    ? stats.invSym.map((q) => `I${q} (${axisLabel(q, names)})`).join(', ')
    : 'none';
  const zRel = stats.zRelated.map((k) => `[${k}]`).join(' ');
  const lines: string[] = [
    `Input pc set: {${s.join(', ')}}`,
    `Rotational symmetry: ${stats.rotSym.length ? stats.rotSym.map((k) => `T${k}`).join(', ') : 'none'}`,
    `Inversional symmetry: ${invSymTxt}`,
    `Inversion: ${invTxt}${invSetTxt ? `  inverted set: ${invSetTxt}` : ''}`,
    `Hemitonia: ${st.hem} (isolated ${st.iso}, chained ${st.chain})  density: ${fmt(stats.density)} per note`,
    `Perfect fifths: ${stats.withP5.length} of ${s.length} notes have a P5 above; none above: ${noP5Txt}; longest fifth chain: ${stats.chainLen}`,
    rve
      ? `Range vs size average: ${sgn1(rve.zs).replace('−', '-')} (range ${rve.fr}, average ${Math.round(rve.avg)})`
      : 'Range vs size average: n/a',
    rve
      ? `Range vs expected: ${rve.z >= 0 ? '+' : '-'}${fmt(Math.abs(Math.round(rve.z * 10) / 10))} (range ${rve.fr}, expected ${Math.round(rve.exp)} for ${rve.n} notes with ${rve.p5} P5s)`
      : 'Range vs expected: n/a',
    `Interval vector: ${icvText(icvOf(s))}${zRel ? `  same vector: ${zRel}` : ''}`,
    `Cohemitonia: ${st.coh}  chaining (coh/hem): ${ratio}  semitone runs: ${st.runs.length ? st.runs.join(', ') : 'none'}`,
    '',
  ];
  const layout = pathLayout(view, pathMax);
  if (layout) {
    lines.push(layout.text, '');
  }
  view.forEach((m) => {
    const nb = neighboursOf(m, view, pathMax)
      .filter((g) => g.items.length)
      .map(
        (g) =>
          `${g.d} ${g.d === 1 ? 'note' : 'notes'} away: ${g.items
            .map((q) => `mode ${q.o.ks[0]} (${q.rel})`)
            .join(', ')}`
      );
    const sp = spellPcs(displayPcs(m, o), o.flats);
    const title = `${m.ks.length > 1 ? 'Modes ' : 'Mode '}${m.ks.join(', ')}${o.invMode === 'root' ? ' inverted' : ''}`;
    let starts = m.ks.length === 1 ? sp[0] : m.starts.map((p) => names[p]).join(' / ');
    if (m.srcs.length) {
      starts += ` · inverse of ${m.srcs.length > 1 ? 'modes ' : 'mode '}${m.srcs.join(', ')}`;
    }
    const ctx = chordContext(m, o);
    const expansions = expansionList(m.z.length, o.expansion).map((e) => {
      const f = (k: number) =>
        chordsOf(m, k, e + 1, ctx)
          .map((c) => `${c.rootName} ${c.q}${c.bassName ? `/${c.bassName}` : ''}`)
          .join(', ') || 'n/a';
      return `  E${e} triads:   ${f(3)}\n  E${e} sevenths: ${f(4)}`;
    });
    lines.push(
      `${title} (starts on ${starts})`,
      `  pc set:      [${m.abs.join(' ')}]`,
      `  set to 0:    [${m.z.join(' ')}]`,
      `  spelled:     ${sp.join(' ')}`,
      `  distances:   ${m.dl.join(' ')}`,
      expansions.join('\n'),
      `  modal neighbors: ${nb.length ? nb.join('; ') : 'none'}`,
      `  P5 above root: ${m.p5root ? 'yes' : 'no'}`,
      `  P5 above each: ${m.z.map((x, i) => `${x}>${m.fm[i] === null ? '-' : m.fm[i]}`).join(' ')}`,
      `  fifths:      ${joinSigned(m.f)} = ${m.fs}`,
      ''
    );
  });
  return lines.join('\n');
}

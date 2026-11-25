/**
 * Pairs panel (M1 of the Scala-tools arc): every directed pair of degrees of the subset with the interval
 * between them, the content table (each distinct interval, how often, by generic step), and the location search.
 *
 * The lab object changes on every hover and sound change, so each cell is a memoized component that takes only primitive
 * props and stable callbacks (they read the latest lab through a ref).
 */
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { Modal, useComputedColorScheme } from '@mantine/core';
import {
  addedCellNote,
  addedCells,
  beatCell,
  beatCellName,
  beatSummary,
  drawnAdded,
  fmtRatio,
  extraTints,
  parseInterval,
  parsePitchText,
  reduceNote,
  pitchPlace,
  pairCoverage,
  tintReaches,
  tintStrengthsFor,
  wheelPositions,
  locateInterval,
  mod,
  nearestRatio,
  stepsTable,
  type AddedCell,
  type BeatCell,
  type BeatTarget,
  type ExtraInterval,
  type Note,
  type PairCell,
  type PitchRef,
} from '../../../lib/harmonic-field';
import { Button, SegmentedControl, TextInput, ActionIcon } from '../../../ui';
import { MAX_PAIRS, noteLabel } from '../state/derive';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { checkAddedPitch, type PairsColor } from '../state/labState';
import { PAIRS_LABEL } from '../state/layout';
import { parseFind } from '../state/pairsFind';
import { colWidthCh } from '../state/pairsWidth';
import {
  SIGNED_BANDS,
  signedBand,
  signedBandTileStyle,
  signedErrorTextColor,
  strengthLevel,
  tileColors,
  tileStyle,
  wheelHue,
} from '../state/tileColors';
import { CloseIcon, ExpandIcon } from './icons';
import { SignedErrorLegend } from './SignedErrorLegend';
import { Num, Row, Strip, Tip, signed, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

const COLOR_DATA = [
  { value: 'off', label: 'Off' },
  { value: 'error', label: 'Error' },
  { value: 'interval', label: 'Interval' },
];

const VIEW_DATA = [
  { value: 'intervals', label: 'Intervals' },
  { value: 'beats', label: 'Beats' },
];

/** A beat in Hz: signed, two decimals; a value that rounds to zero has no sign. */
const fmtBeat = (hz: number): string => {
  const t = Math.abs(hz).toFixed(2);
  return Number(t) === 0 ? t : `${hz < 0 ? '-' : '+'}${t}`;
};
/** The accessible name of a beat; one above the Developer option's partial limit says which partials and the limit. */
const beatName = (from: string, to: string, b: BeatCell, limit: number | null): string =>
  b.theoretical && limit !== null
    ? `${beatCellName(from, to, b.hz)}, partials ${b.partials[0]} and ${b.partials[1]}, above the limit of ${limit}`
    : beatCellName(from, to, b.hz);

const cellText = (c: PairCell): string => c.ratio ?? String(Math.round(c.c * 10) / 10);

interface CellProps {
  i: number;
  j: number;
  text: string;
  label: string;
  wrap: boolean;
  /** The signed error band -4 (flat, 30 c or more) to 4 (sharp), 0 exact, or null when the coloring is not Error. */
  sev: number | null;
  /** The Interval tile's custom properties (fill, border, text and their dimmed versions), or undefined for none. */
  tile: CSSProperties | undefined;
  look: string;
  /** The Error tile's custom properties (from the signed band). */
  sevStyle?: CSSProperties;
  /** A beat above the Developer option's partial limit (dimmed). */
  theory?: boolean;
  /** 0 = no search or pick active, 1 = this cell matches, 2 = it does not. */
  match: 0 | 1 | 2;
  lit: boolean;
  chord: boolean;
  hot: boolean;
  pinned: boolean;
  onEnter: (i: number, j: number) => void;
  onLeave: (i: number, j: number) => void;
  onPlay: (i: number, j: number) => void;
}

const Cell = memo(function Cell(p: CellProps) {
  const { i, j, onEnter, onLeave, onPlay } = p;
  return (
    <button
      type="button"
      className={`${classes.heatCell} ${classes.mxCell}`}
      data-sev={p.sev === null ? undefined : Math.abs(p.sev)}
      data-dir={p.sev ? (p.sev > 0 ? 'sharp' : 'flat') : undefined}
      data-tint={p.tile ? 'wheel' : undefined}
      data-tile={p.tile || p.sev !== null ? p.look : undefined}
      style={p.tile ?? (p.sev !== null ? p.sevStyle : undefined)}
      data-match={p.match === 1 ? 'yes' : p.match === 2 ? 'no' : undefined}
      data-lit={p.lit}
      data-chord={p.chord}
      data-hot={p.hot}
      data-pin={p.pinned}
      data-wrap={p.wrap}
      data-theory={p.theory || undefined}
      data-testid="matrix-cell"
      data-from={i + 1}
      data-to={j + 1}
      aria-label={p.label}
      onMouseEnter={() => onEnter(i, j)}
      onMouseLeave={() => onLeave(i, j)}
      onFocus={() => onEnter(i, j)}
      onBlur={() => onLeave(i, j)}
      onClick={() => onPlay(i, j)}
    >
      <Num>{p.text}</Num>
      {p.wrap && (
        <span className={classes.mxWrap} aria-hidden="true">
          &uarr;
        </span>
      )}
    </button>
  );
});

interface HeadProps {
  /** Position in the subset (0-based). */
  i: number;
  /** The label when it is not the degree number (Beats view: the interval from 1/1). */
  text?: string;
  axis: 'row' | 'col';
  hot: boolean;
  pinned: boolean;
  lit: boolean;
  onEnter: (i: number) => void;
  onLeave: (i: number) => void;
  onClick: (i: number, alt: boolean) => void;
}

const Head = memo(function Head(p: HeadProps) {
  const { i, onEnter, onLeave, onClick } = p;
  return (
    <button
      type="button"
      className={classes.mxHead}
      data-axis={p.axis}
      data-hot={p.hot}
      data-pin={p.pinned}
      data-lit={p.lit}
      data-testid={`matrix-${p.axis}-head`}
      data-degree={i + 1}
      aria-label={`Degree ${i + 1}${p.pinned ? ', pinned' : ''}`}
      onMouseEnter={() => onEnter(i)}
      onMouseLeave={() => onLeave(i)}
      onFocus={() => onEnter(i)}
      onBlur={() => onLeave(i)}
      onClick={(e: MouseEvent) => onClick(i, e.altKey)}
    >
      <Num>{p.text ?? i + 1}</Num>
    </button>
  );
});

const arrow = (c: { from: number; to: number }, wrap: boolean) =>
  `${c.from + 1}→${c.to + 1}${wrap ? '↑' : ''}`;

/** What the panel and its large window share, kept above the window so closing it loses nothing. */
function usePairsUi() {
  /** The picked interval's size in cents (its identity), not its index, so a changed subset cannot outline another interval. */
  const [pick, setPick] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [tolText, setTolText] = useState<string | null>(null);
  /** Intervals or Beats (runtime only, not stored). */
  const [view, setView] = useState<'intervals' | 'beats'>('intervals');
  const [addText, setAddText] = useState('');
  const [addMsg, setAddMsg] = useState('');
  return {
    pick,
    setPick,
    query,
    setQuery,
    tolText,
    setTolText,
    view,
    setView,
    addText,
    setAddText,
    addMsg,
    setAddMsg,
  };
}
type PairsUi = ReturnType<typeof usePairsUi>;

function PairsBody({ ui }: { ui: PairsUi; big?: boolean }) {
  const lab = useLab();
  const { base, an } = lab;
  const m = an.pairs;
  const ctx = useRef({ lab, m });
  ctx.current = { lab, m };
  const { pick, setPick, query, setQuery, tolText, setTolText } = ui;
  const { view, setView, addText, setAddText, addMsg, setAddMsg } = ui;
  const beats = view === 'beats';
  const color = lab.state.ui.pairsColor;
  const setColor = (v: PairsColor) => lab.dispatch({ type: 'ui', patch: { pairsColor: v } });
  const findRef = useRef<HTMLInputElement>(null);
  const [rowHover, setRowHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ i: number; j: number } | null>(null);

  const centsOf = useCallback((i: number, j: number): number[] | null => {
    const { lab: l, m: mx } = ctx.current;
    const cell = mx?.cells[i]?.[j];
    const a = l.base.rel[i];
    if (!cell || !a) {
      return null;
    }
    const from = l.base.field[a.src].c;
    return [from, from + cell.c];
  }, []);
  const target = (i: number, j: number) =>
    ({
      kind: 'pitches',
      key: `matrix:${i}.${j}`,
      cents: centsOf(i, j) ?? [],
    }) as const;
  const onEnter = useCallback(
    (i: number, j: number) => {
      const { lab: l } = ctx.current;
      const cents = centsOf(i, j);
      if (!cents) {
        return;
      }
      l.setChord(new Set([l.base.rel[i].src, l.base.rel[j].src]));
      l.audio.setPreviewTarget(target(i, j));
      setFocus({ i, j });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centsOf]
  );
  const onLeave = useCallback(
    (i: number, j: number) => {
      const { lab: l } = ctx.current;
      l.setChord(null);
      l.audio.clearPreviewTarget(target(i, j));
      setFocus((f) => (f && f.i === i && f.j === j ? null : f));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centsOf]
  );
  const onPlay = useCallback(
    (i: number, j: number) => {
      const cents = centsOf(i, j);
      if (cents) {
        ctx.current.lab.audio.playCents(cents, cents);
      }
    },
    [centsOf]
  );
  const headPreview = useRef<number | null>(null);
  const onHeadEnter = useCallback((i: number) => {
    const { lab: l } = ctx.current;
    const src = l.base.rel[i].src;
    headPreview.current = src;
    l.setHover(src);
    l.audio.setPreviewTarget({ kind: 'note', i: src });
  }, []);
  const onHeadLeave = useCallback(() => {
    const { lab: l } = ctx.current;
    // clear the target that was set for this header, whatever the subset is now
    const src = headPreview.current;
    headPreview.current = null;
    l.setHover(null);
    if (src !== null) {
      l.audio.clearPreviewTarget({ kind: 'note', i: src });
    }
  }, []);
  const onHeadClick = useCallback((i: number, alt: boolean) => {
    const { lab: l } = ctx.current;
    const src = l.base.rel[i].src;
    if (alt) {
      l.pinNote(src);
    } else {
      l.clickNote(src);
    }
  }, []);

  const [dev] = useLabDeveloperOptions();
  const scheme = useComputedColorScheme('light');
  const look = dev.tileLook;
  // one tile per interval group: the wheel position (size or rank) picks the hue, the strength (simple strong or faint)
  // the level; the look decides the Radix steps (state/tileColors.ts)
  const tiles = useMemo(() => {
    if (!m) {
      return [] as CSSProperties[];
    }
    const pos = wheelPositions(m, base.rep.c, dev.intervalColor);
    const str = tintStrengthsFor(m, dev.intervalIntensity, dev.tintScale);
    const reach = tintReaches(m, dev.intervalIntensity);
    return m.groups.map((g) =>
      tileStyle(
        tileColors(
          look,
          dev.tileOutline,
          strengthLevel(str[g.id]),
          wheelHue(pos[g.id]),
          scheme,
          reach[g.id],
          dev.tintBand
        )
      )
    );
  }, [
    m,
    base.rep.c,
    dev.intervalColor,
    dev.intervalIntensity,
    dev.tintScale,
    dev.tintBand,
    dev.tileOutline,
    scheme,
    look,
  ]);
  const sevStyles = useMemo(
    () => SIGNED_BANDS.map((b) => signedBandTileStyle(b, look, dev.tileOutline, scheme)),
    [look, dev.tileOutline, scheme]
  );
  const steps = useMemo(() => (m ? stepsTable(m) : []), [m]);

  if (!m) {
    return (
      <span className={classes.hint} role="status">
        {base.rel.length === 0
          ? 'Select notes to see their intervals.'
          : `The pairs are shown for up to ${MAX_PAIRS} notes. Select fewer notes.`}
      </span>
    );
  }
  if (m.N < 2) {
    return (
      <span className={classes.hint} role="status">
        Pairs need at least 2 notes.
      </span>
    );
  }

  const { rel, rep } = base;
  const tol = (() => {
    const t = tolText === null || tolText.trim() === '' ? NaN : Number(tolText);
    return Number.isFinite(t) && t >= 0 ? t : lab.state.ui.tol;
  })();
  const parsed = parseFind(query);
  const searchBad = parsed === 'bad';
  const find = parsed && parsed !== 'bad' ? parsed : null;
  const searchC = find ? (find.c > rep.c + 1e-6 || find.c < 0 ? mod(find.c, rep.c) : find.c) : null;
  const found = searchC !== null ? locateInterval(m, searchC, tol) : null;
  const pickedGroup =
    pick !== null ? (m.groups.find((g) => Math.abs(g.c - pick) < 1e-6) ?? null) : null;
  const pickId = pickedGroup ? pickedGroup.id : null;
  // what is highlighted: the hovered table row (a preview), else the search, else the picked row
  const shown = rowHover !== null ? m.groups[rowHover] : null;
  const matchKeys = new Set<number>();
  const add = (cells: { from: number; to: number }[]) =>
    cells.forEach((c) => matchKeys.add(c.from * m.N + c.to));
  if (shown) {
    add(shown.cells);
  } else if (found) {
    add(found.cells);
  } else if (pickedGroup) {
    add(pickedGroup.cells);
  }
  const active = matchKeys.size > 0;
  const result = found
    ? {
        name: `${find?.label ?? query.trim()} within ${tol} c`,
        cells: found.cells,
        cov: found.coverage,
      }
    : pickedGroup
      ? {
          name: pickedGroup.ratio ?? `${pickedGroup.c.toFixed(1)} c`,
          cells: pickedGroup.cells.map((c) => m.cells[c.from][c.to] as PairCell),
          cov: pairCoverage(pickedGroup.cells, m.N),
        }
      : null;

  // sounding: a cell lights when both of its notes sound; a table row when any of its cells does
  const litCell = (i: number, j: number) =>
    lab.sounding.has(rel[i].src) && lab.sounding.has(rel[j].src);
  const litGroups = new Set<number>();
  for (let i = 0; i < m.N; i++) {
    for (let j = 0; j < m.N; j++) {
      const c = m.cells[i][j];
      if (c && litCell(i, j)) {
        litGroups.add(c.group);
      }
    }
  }
  const chordHas = (i: number) => lab.chord.has(rel[i].src);
  const pinOf = (i: number) => lab.pin === rel[i].src;

  const sevOfGroup = (g: number) => signedBand(m.groups[g].err);
  const cellLabel = (c: PairCell) =>
    `Degree ${c.from + 1} to degree ${c.to + 1}: ${cellText(c)}, ${c.c.toFixed(1)} c, ${c.k} ${c.k === 1 ? 'step' : 'steps'}${c.wrap ? ', up to the next repeat' : ''}`;
  const focusCell = focus ? m.cells[focus.i]?.[focus.j] : null;
  const rows = Array.from({ length: m.N }, (_, i) => i);

  // Beats view (M3): the ratio picked in Find, the notes' places in the field, the added pitches
  const baseHz = lab.state.ui.baseHz;
  const pickedParsed = /[/:]/.test(query) ? parsePitchText(query) : null;
  const pickedM =
    pickedParsed && pickedParsed !== 'bad' ? /^(\d+)\/(\d+)$/.exec(pickedParsed.canon) : null;
  const picked: BeatTarget | null = pickedM
    ? { p: Number(pickedM[1]), q: Number(pickedM[2]) }
    : null;
  const beatOf = (loC: number, hiC: number): BeatCell | null =>
    beatCell(loC, hiC, {
      repC: rep.c,
      baseHz,
      tolC: tol,
      picked,
      partialLimit: dev.beatPartialLimit,
    });
  const labelOf = (i: number) => noteLabel(base.field[rel[i].src]);
  const placeOf = (i: number) => base.field[rel[i].src].c;
  const focusBeat =
    beats && focus && m.cells[focus.i]?.[focus.j]
      ? beatOf(placeOf(focus.i), placeOf(focus.i) + (m.cells[focus.i][focus.j] as PairCell).c)
      : null;
  /** The full wording of the pointed cell, with the beat's details added in Beats view. */
  const readout = !focusCell
    ? ''
    : !beats
      ? cellLabel(focusCell)
      : `${cellLabel(focusCell)}. ${
          focusBeat
            ? `Beat ${fmtBeat(focusBeat.hz)} Hz vs ${focusBeat.target.p === 1 && focusBeat.target.q === 1 ? 'unison' : `${focusBeat.target.p}/${focusBeat.target.q}`}${focusBeat.source === 'picked' ? ' (picked)' : ''}.`
            : 'No beat.'
        }`;
  const subsetPlaces = rel.map((r) => pitchPlace(base.field[r.src].c, rep.c));
  const stored = lab.state.ui.pairsAdded;
  const added = drawnAdded(stored, subsetPlaces, rep.c);
  const addedList = addedCells(subsetPlaces, added, rep.c, tol);
  const addedAt = (from: PitchRef, to: PitchRef): number =>
    addedList.findIndex(
      (c) =>
        c.from.kind === from.kind && c.from.i === from.i && c.to.kind === to.kind && c.to.i === to.i
    );
  const refName = (r: PitchRef) => (r.kind === 'subset' ? labelOf(r.i) : added[r.i].text);
  /** The pitch's ratio as a note, or null for a pitch with none (cents typed, or an irrational field note). */
  const ratioOf = (r: PitchRef): Note | null => {
    if (r.kind === 'subset') {
      const n = base.field[rel[r.i].src];
      return n.m ? n : null;
    }
    return /[/:]/.test(added[r.i].text) ? parseInterval(added[r.i].text) : null;
  };
  /**
   * The Color setting for the added pitches (H-20 follow-up): every interval that is not a subset cell (the added cells,
   * the added row and column headers and the chips) uses its OWN interval. The strength and the rank come from the
   * exact ratio when both pitches have one (`extraTints`, lib intervalPairs.ts), else from the cents alone.
   */
  const extra: ExtraInterval[] = [];
  /** The exact ratio of each added cell (null when either pitch has no ratio), in the order of `addedList`. */
  const addedNotes = addedList.map((c) => {
    const lo = ratioOf(c.from);
    const hi = ratioOf(c.to);
    return lo && hi ? addedCellNote(c, lo, hi, rep) : null;
  });
  addedList.forEach((c, k) => {
    extra.push({ c: c.c, note: addedNotes[k] });
  });
  const headBase = extra.length;
  added.forEach((a, k) => {
    const n = ratioOf({ kind: 'added', i: k });
    extra.push({ c: a.c, note: n ? reduceNote(n, a.c, rep) : null });
  });
  const chipBase = extra.length;
  const chipPitch = stored.map((t) => {
    const pt = parsePitchText(t);
    return pt && pt !== 'bad' ? pt : null;
  });
  chipPitch.forEach((pt, k) => {
    const place = pt ? pitchPlace(pt.c, rep.c) : 0;
    const n = pt && /[/:]/.test(stored[k]) ? parseInterval(stored[k]) : null;
    extra.push({ c: place, note: n ? reduceNote(n, place, rep) : null });
  });
  const extraTint =
    color === 'interval'
      ? extraTints(m, extra, rep.c, dev.intervalColor, dev.intervalIntensity, dev.tintScale)
      : [];
  const colorOf = (
    idx: number,
    withReach = false
  ): { sev: number | null; style: CSSProperties | undefined } => {
    if (color === 'error') {
      const place = pitchPlace(extra[idx].c, rep.c);
      const sev = signedBand(nearestRatio(place, m.oddLimit, rep.c).err);
      return { sev, style: sevStyles[sev + 4] };
    }
    if (color !== 'interval') {
      return { sev: null, style: undefined };
    }
    const t = extraTint[idx];
    return {
      sev: null,
      style: tileStyle(
        tileColors(
          look,
          dev.tileOutline,
          strengthLevel(t.strength),
          wheelHue(t.pos),
          scheme,
          withReach ? t.reach : undefined,
          dev.tintBand
        )
      ),
    };
  };
  /** An added cell reads like a subset cell: its ratio when both pitches are exact, else its cents (Beats: the Hz). */
  const addedRatio = (c: AddedCell): string | null => {
    const n = addedNotes[addedList.indexOf(c)];
    return n?.m ? fmtRatio(n) : null;
  };
  const addedText = (c: AddedCell): string => {
    if (beats) {
      const b = beatOf(c.loC, c.hiC);
      return b ? fmtBeat(b.hz) : '';
    }
    return addedRatio(c) ?? String(Math.round(c.c * 10) / 10);
  };
  const addedCellView = (from: PitchRef, to: PitchRef, key: string) => {
    const ci = addedAt(from, to);
    if (ci < 0) {
      return <span key={key} className={classes.mxDiag} aria-hidden="true" />;
    }
    const c = addedList[ci];
    const b = beats ? beatOf(c.loC, c.hiC) : null;
    const text = addedText(c);
    const col = colorOf(ci, true);
    const name = b
      ? beatName(refName(from), refName(to), b, dev.beatPartialLimit)
      : beats
        ? `${refName(from)} to ${refName(to)}: no beat`
        : `${refName(from)} to ${refName(to)}: ${text}${addedRatio(c) ? `, ${c.c.toFixed(1)} c` : ' c'}${c.wrap ? ', up to the next repeat' : ''}`;
    return (
      <span
        key={key}
        role="img"
        className={`${classes.heatCell} ${classes.mxCell}`}
        data-added="true"
        data-sev={col.sev === null ? undefined : Math.abs(col.sev)}
        data-dir={col.sev ? (col.sev > 0 ? 'sharp' : 'flat') : undefined}
        data-tint={color === 'interval' ? 'wheel' : undefined}
        data-tile={col.style ? look : undefined}
        style={col.style}
        data-theory={b?.theoretical || undefined}
        data-testid="matrix-added-cell"
        aria-label={name}
      >
        <Num>{text}</Num>
        {c.wrap && (
          <span className={classes.mxWrap} aria-hidden="true">
            &uarr;
          </span>
        )}
      </span>
    );
  };
  const addedHead = (k: number, axis: 'row' | 'col') => {
    const col = colorOf(headBase + k, true);
    return (
      <span
        key={`a${axis}${k}`}
        className={classes.mxHead}
        data-added="true"
        data-axis={axis}
        data-sev={col.sev === null ? undefined : Math.abs(col.sev)}
        data-dir={col.sev ? (col.sev > 0 ? 'sharp' : 'flat') : undefined}
        data-tint={color === 'interval' ? 'wheel' : undefined}
        data-tile={col.style ? look : undefined}
        style={col.style}
        data-testid={`matrix-added-${axis}-head`}
        role="img"
        aria-label={`Added pitch ${added[k].text}, ${axis}`}
      >
        <Num>{added[k].text}</Num>
      </span>
    );
  };
  const hasAdded = added.length > 0;
  const widthTexts: string[] = [
    ...rows.map((i) => (beats ? labelOf(i) : String(i + 1))),
    ...added.map((a) => a.text),
    ...addedList.map(addedText),
  ];
  for (let i = 0; i < m.N; i++) {
    for (let j = 0; j < m.N; j++) {
      const c = m.cells[i][j];
      if (c) {
        const b = beats ? beatOf(placeOf(i), placeOf(i) + c.c) : null;
        widthTexts.push(beats ? (b ? fmtBeat(b.hz) : '') : cellText(c));
      }
    }
  }
  const colCh = colWidthCh(widthTexts);
  const addedRefs = added.map((_, k) => ({ kind: 'added', i: k }) as PitchRef);
  const submitAdd = () => {
    const r = checkAddedPitch(lab.state, addText);
    if (r.ok) {
      lab.dispatch({ type: 'pairs/addPitch', text: addText });
      setAddText('');
      setAddMsg('');
    } else if (r.kind === 'duplicate') {
      setAddText('');
      setAddMsg('');
    } else if (r.kind !== 'empty') {
      setAddMsg(r.message);
    }
  };
  const locBeats = (() => {
    if (!beats || !found) {
      return null;
    }
    const list = found.cells.flatMap((c) => {
      const lo = placeOf(c.from);
      const b = beatOf(lo, lo + c.c);
      return b ? [b] : [];
    });
    return beatSummary(list);
  })();

  return (
    <>
      <div className={classes.mxControls}>
        <Tip k="matrixView">View</Tip>
        <SegmentedControl
          size="xs"
          aria-label="View"
          value={view}
          onChange={(v) => setView(v as 'intervals' | 'beats')}
          data={VIEW_DATA}
        />
      </div>
      <div className={classes.mxControls}>
        <Tip k="matrixColor">Color</Tip>
        <SegmentedControl
          size="xs"
          aria-label="Color"
          value={color}
          onChange={(v) => setColor(v as PairsColor)}
          data={COLOR_DATA}
        />
        {color === 'error' && (
          <SignedErrorLegend
            look={look}
            outline={dev.tileOutline}
            scheme={scheme}
            label="Error legend"
          />
        )}
      </div>
      {color === 'error' && (
        <span className={classes.hint}>
          {`Distance of each interval from the nearest ratio of odd limit ${m.oddLimit} (the tuner strip's vs JI setting).`}
        </span>
      )}
      <h3 className={classes.familyHead}>
        <Tip k="matrixGrid">Every pair of degrees</Tip>
        <Num muted>
          {m.N} degrees, {m.N * (m.N - 1)} intervals
        </Num>
      </h3>
      <div className={classes.mxScroll}>
        <div
          className={classes.mxGrid}
          role="group"
          aria-label="Interval matrix: row degree to column degree"
          style={{
            gridTemplateColumns: `repeat(${m.N + 1}, ${colCh}ch)${hasAdded ? ` 0.5rem repeat(${added.length}, ${colCh}ch)` : ''}`,
          }}
          data-col-ch={colCh}
          data-testid="matrix-grid"
        >
          <span aria-hidden="true" />
          {rows.map((j) => (
            <Head
              key={`c${j}`}
              i={j}
              axis="col"
              hot={lab.hover === rel[j].src}
              pinned={pinOf(j)}
              lit={lab.sounding.has(rel[j].src)}
              onEnter={onHeadEnter}
              onLeave={onHeadLeave}
              onClick={onHeadClick}
              text={beats ? labelOf(j) : undefined}
            />
          ))}
          {hasAdded && <span aria-hidden="true" />}
          {added.map((_, k) => addedHead(k, 'col'))}
          {rows.map((i) => [
            <Head
              key={`r${i}`}
              i={i}
              axis="row"
              hot={lab.hover === rel[i].src}
              pinned={pinOf(i)}
              lit={lab.sounding.has(rel[i].src)}
              onEnter={onHeadEnter}
              onLeave={onHeadLeave}
              onClick={onHeadClick}
              text={beats ? labelOf(i) : undefined}
            />,
            ...rows.map((j) => {
              const c = m.cells[i][j];
              if (!c) {
                return <span key={`${i}.${j}`} className={classes.mxDiag} aria-hidden="true" />;
              }
              const b = beats ? beatOf(placeOf(i), placeOf(i) + c.c) : null;
              return (
                <Cell
                  key={`${i}.${j}`}
                  i={i}
                  j={j}
                  text={beats ? (b ? fmtBeat(b.hz) : '') : cellText(c)}
                  label={
                    b ? beatName(labelOf(i), labelOf(j), b, dev.beatPartialLimit) : cellLabel(c)
                  }
                  theory={b?.theoretical}
                  wrap={c.wrap}
                  sev={color === 'error' ? sevOfGroup(c.group) : null}
                  tile={color === 'interval' ? tiles[c.group] : undefined}
                  sevStyle={sevStyles[sevOfGroup(c.group) + 4]}
                  look={look}
                  match={active ? (matchKeys.has(i * m.N + j) ? 1 : 2) : 0}
                  lit={litCell(i, j)}
                  chord={chordHas(i) && chordHas(j)}
                  hot={lab.hover === rel[i].src || lab.hover === rel[j].src}
                  pinned={pinOf(i) || pinOf(j)}
                  onEnter={onEnter}
                  onLeave={onLeave}
                  onPlay={onPlay}
                />
              );
            }),
            ...(hasAdded
              ? [
                  <span key={`s${i}`} aria-hidden="true" />,
                  ...added.map((_, k) =>
                    addedCellView({ kind: 'subset', i }, addedRefs[k], `as${i}.${k}`)
                  ),
                ]
              : []),
          ])}
          {hasAdded && (
            <span
              className={classes.mxSpacer}
              style={{ gridColumn: '1 / -1' }}
              aria-hidden="true"
            />
          )}
          {added.map((_, k) => [
            addedHead(k, 'row'),
            ...rows.map((j) =>
              addedCellView(addedRefs[k], { kind: 'subset', i: j }, `sa${k}.${j}`)
            ),
            <span key={`sp${k}`} aria-hidden="true" />,
            ...added.map((_, l) => addedCellView(addedRefs[k], addedRefs[l], `aa${k}.${l}`)),
          ])}
        </div>
      </div>
      <div className={classes.mxReadout} data-testid="matrix-status">
        {focusCell && focus ? readout : 'Point at a cell'}
      </div>
      <section className={classes.mxSearch} aria-label="Find an interval">
        <Tip k="matrixSearch">Find</Tip>
        <TextInput
          size="xs"
          ref={findRef}
          aria-label="Interval to find"
          placeholder="e.g. 3/2 or 700 c"
          value={query}
          error={
            searchBad ? 'Write a ratio such as 3/2 or a size in cents such as 700 c' : undefined
          }
          classNames={{ error: classes.inputError }}
          rightSection={
            query === '' ? undefined : (
              <Tip k="matrixFindClear" as="control">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Clear Find"
                  onClick={() => {
                    setQuery('');
                    findRef.current?.focus();
                  }}
                >
                  <CloseIcon />
                </ActionIcon>
              </Tip>
            )
          }
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          aria-label="Find tolerance in cents"
          placeholder={String(lab.state.ui.tol)}
          value={tolText ?? String(lab.state.ui.tol)}
          onChange={(e) => setTolText(e.currentTarget.value)}
        />
        <Num muted>c</Num>
      </section>
      <section className={classes.mxAdd} aria-label="Add a pitch">
        <Tip k="matrixAdd">Add pitch</Tip>
        <TextInput
          size="xs"
          aria-label="Pitch to add"
          placeholder="e.g. 3/2 or 702 c"
          value={addText}
          error={addMsg || undefined}
          classNames={{ error: classes.inputError }}
          onChange={(e) => {
            setAddText(e.currentTarget.value);
            setAddMsg('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submitAdd();
            }
          }}
        />
        <Button size="xs" variant="default" onClick={submitAdd}>
          Add
        </Button>
        {stored.length > 0 && (
          <span className={classes.sizeChips}>
            {stored.map((t, k) => {
              const col = colorOf(chipBase + k, true);
              return (
                <span
                  key={`${k}.${t}`}
                  data-testid="matrix-added-chip"
                  className={`${classes.sizeChip} ${classes.mxChip}`}
                  data-tile={col.style ? look : undefined}
                  style={col.style}
                >
                  <Num>{t}</Num>
                  <ActionIcon
                    className={`${classes.mxChipX} ${labClasses.dangerHover}`}
                    variant="subtle"
                    color="gray"
                    size={16}
                    aria-label={`Remove added pitch ${t}`}
                    onClick={() => lab.dispatch({ type: 'pairs/removePitch', index: k })}
                  >
                    <CloseIcon />
                  </ActionIcon>
                </span>
              );
            })}
          </span>
        )}
      </section>
      {result && (
        <section className={classes.mxResult} aria-label="Locations" data-testid="matrix-result">
          <strong className={classes.mxResultHead}>{result.name}</strong>
          <Row name={result.cov.matches === 1 ? 'Place' : 'Places'}>
            <Num>{result.cov.matches}</Num>
          </Row>
          <Row name="Degrees with it above them">
            <Num>{`${result.cov.above} of ${result.cov.N}`}</Num>
          </Row>
          <Row name="Covered degrees">
            <Num>{result.cov.covered}</Num>
          </Row>
          <Row name="Used more than once">
            <Num>{result.cov.multi}</Num>
          </Row>
          <Row name="Highest coverage">
            <Num>{result.cov.highest}</Num>
          </Row>
          {locBeats && (
            <>
              <Row name={<Tip k="matrixBeats">Beats total</Tip>}>
                <Num>{`${locBeats.total.toFixed(2)} Hz`}</Num>
              </Row>
              <Row name={<Tip k="matrixBeats">Beats average</Tip>}>
                <Num>{`${locBeats.average.toFixed(2)} Hz`}</Num>
              </Row>
              <Row name={<Tip k="matrixBeats">Beats highest</Tip>}>
                <Num>{`${locBeats.highest.toFixed(2)} Hz`}</Num>
              </Row>
            </>
          )}
          <span className={classes.sizeChips}>
            {result.cells.map((c) => (
              <span key={`${c.from}.${c.to}`} className={classes.sizeChip}>
                <Num>{arrow(c, c.wrap)}</Num>
              </span>
            ))}
          </span>
        </section>
      )}
      {found && found.cells.length === 0 && (
        <span className={classes.hint} role="status">
          {`Nothing within ${tol} c of ${find?.label ?? query.trim()}.`}
        </span>
      )}
      <h3 className={classes.familyHead}>
        <Tip k="matrixTable">Content</Tip>
        <Num muted>{m.groups.length} distinct intervals</Num>
      </h3>
      <table className={classes.spec} data-testid="matrix-table">
        <thead>
          <tr>
            <th>Interval</th>
            <th>Size (c)</th>
            <th>Count</th>
            {color === 'error' && <th>Error (c)</th>}
          </tr>
        </thead>
        <tbody>
          {m.groups.map((g) => (
            <tr
              key={g.id}
              data-testid="matrix-row"
              data-lit={litGroups.has(g.id)}
              data-pick={pickId === g.id}
              onMouseEnter={() => setRowHover(g.id)}
              onMouseLeave={() => setRowHover(null)}
            >
              <td>
                {color === 'interval' && (
                  <span
                    className={classes.mxSwatch}
                    style={tiles[g.id]}
                    data-tile={look}
                    data-testid="matrix-swatch"
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  className={classes.mxRowBtn}
                  aria-pressed={pickId === g.id}
                  onClick={() => setPick(pickId === g.id ? null : g.c)}
                >
                  <Num>{g.ratio ?? `${g.c.toFixed(1)} c`}</Num>
                </button>
              </td>
              <td>
                <Num muted>{g.c.toFixed(1)}</Num>
              </td>
              <td>
                <Num>{g.count}</Num>
              </td>
              {color === 'error' && (
                <td
                  className={classes.err}
                  data-sev={Math.abs(sevOfGroup(g.id))}
                  data-dir={sevOfGroup(g.id) ? (g.err > 0 ? 'sharp' : 'flat') : undefined}
                  style={{ color: signedErrorTextColor(g.err) }}
                >
                  <Num>{Math.abs(g.err) < 0.05 ? 'exact' : signed(g.err)}</Num>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <section className={classes.family} aria-label="Intervals by number of steps">
        <h3 className={classes.familyHead}>
          <Tip k="matrixSteps">By steps</Tip>
        </h3>
        {steps.map((s) => (
          <div key={s.k} className={classes.clash} data-testid="matrix-steps-row">
            <span className={classes.clashName}>
              {s.k} {s.k === 1 ? 'step' : 'steps'}
            </span>
            <span className={classes.sizeChips}>
              {s.items.map((it) => (
                <span key={it.group} className={classes.sizeChip}>
                  <Num>{m.groups[it.group].ratio ?? `${m.groups[it.group].c.toFixed(1)} c`}</Num>
                  {it.count > 1 && <Num muted> &times;{it.count}</Num>}
                </span>
              ))}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

/** The Pairs panel: every directed pair of degrees of the subset (the interval matrix), the content table and the location search; a large window shows the same view. */
export function PairsPanel() {
  const ui = usePairsUi();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Strip title={<Tip k="matrix">{PAIRS_LABEL}</Tip>}>
        <Tip k="pairsPopOut" as="control">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Open ${PAIRS_LABEL} in a large window`}
            onClick={() => setOpen(true)}
          >
            <ExpandIcon />
          </ActionIcon>
        </Tip>
      </Strip>
      <div className={classes.panelBody}>
        <PairsBody ui={ui} />
      </div>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={PAIRS_LABEL}
        size="min(64rem, 94vw)"
        transitionProps={{ duration: 0 }}
      >
        <div className={`${classes.vizModal} ${classes.mxBig}`}>
          <PairsBody ui={ui} big />
        </div>
      </Modal>
    </>
  );
}

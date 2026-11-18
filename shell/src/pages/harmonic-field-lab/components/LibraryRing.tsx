/**
 * M7c-b: the ring panel at the bottom of the chord library dialog. It shows ONE chord (the last hovered or checked row) on a
 * ring of the repeat, 1/1 at the top, clockwise. The ring IS the main ring: `PitchRing` (`RingStats.tsx`), with a few optional
 * props, so its circle, field dots, labels (with their lanes and leader lines), subset polygon, blue chord polygon, pin ring,
 * mode-root chevron, lit dots and ghosts are the main ring's own, not a copy:
 *  - `radius` {@link LIBRARY_RING_R}: drawn larger so the labels have room; the marks' radii scale with it (`markScaleFor`),
 *    their strokes, dashes and the label text do not, and the svg is `pxPerUnit` wide per unit (the main ring's scale);
 *  - `trimPolygons`: the subset and chord polygon outlines stop at the edge of each corner's mark, not at its center;
 *  - `solidAll` on the Field switch (every field dot solid; Subset: the main ring's rule, dots outside the subset hollow);
 *  - `chord` = the field notes the chord's EXACT notes sit on (the main ring's blue ring on their dots, no extra outline) and
 *    `chordCents` (the blue polygon runs through the exact pitches, so a note that matches no field note still has its corner);
 *  - `dotProps`: a pointer or focus on a dot only reports it to the dialog (hold 1, 4 and 5 play that note); a click does nothing;
 *  - `overlay`: `LibraryRingMarks`, the one thing the main ring does not have: for each chord note that is not exact, the
 *    dashed orange (above) or teal (below) ghost, its flag (an arc along the ring toward its nearest note) and its label inside
 *    the ring (placed like the main ring's outside labels, with lanes and a leader line, mirrored inward).
 * The sounding notes and pitches (green lit dots, green dashed ghosts) come from the lab, as on the main ring.
 *
 * Beside the ring: a Field | Subset switch, the title, the readout table (one row per drawn dot) and the roots table. The ring is
 * absolute (a pitch is where it sits above 1/1), so the table names each chord note by its pitch ratio too; that is in
 * `readoutRows`, the one place to change it. The data comes from the lib's `libraryRing` (see `state/libraryPreview.ts`).
 */
import { useCallback, useMemo, useState } from 'react';
import { SegmentedControl, VisuallyHidden } from '@mantine/core';
import type { LibraryRing, RingDot as LibRingDot } from '../../../lib/harmonic-field';
import { fitList } from '../state/fitList';
import type { Ghost } from '../state/ghosts';
import { layoutLabels, leaderEnds, type Box } from '../state/labelLayout';
import type { LibCmp } from '../state/libraryState';
import { signedBandTextColor, signedErrorTextColor } from '../state/tileColors';
import { SVG_FS_LABEL } from '../state/typeScale';
import { RING_SOUND_R, RingDot, RingLabel, RingOutline } from './ringMarks';
import { PitchRing, type RingDotExtra, type RingOverlayArgs } from './RingStats';
import { Hint, Num, Tip, severity, signed, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './libraryRing.module.css';
import panelClasses from './panels.module.css';

export const RING_EMPTY_TEXT = 'Hover or check a chord to see it here.';

/** A flag is never shorter than this many degrees of the repeat, so a 2 c error is still visible. */
export const MIN_FLAG_DEG = 4;

/** The drawn length of a flag: the error as degrees of the repeat, but at least `MIN_FLAG_DEG`. */
export function flagDegrees(err: number, repC: number): number {
  const deg = repC > 0 ? (Math.abs(err) / repC) * 360 : 0;
  return Math.max(MIN_FLAG_DEG, deg);
}

/** One row of the chord table: the five columns (always all present), as text, plus the dot's direction. */
export interface ReadoutRow {
  /** The chord's own interval above its root (`5/4`); a merged octave dot keeps its joined ratios (`1, 2`). */
  chord: string;
  /** The whole list when `chord` was cut to `1, 2 +2` (the cell's tooltip); absent otherwise. */
  chordFull?: string;
  /** The note's pitch in the repeat (`35/32`; `386.3 c` for a note with no ratio). */
  pitch: string;
  /** The nearest comparison note (the note itself when exact); `none` for an empty comparison set. */
  near: string;
  /** `exact`, or the signed error with the true minus (`+84.5 c`, `−48.8 c`); `–` for an empty comparison set. */
  error: string;
  direction: LibRingDot['direction'];
  /** The heat band of the error (0 exact to 4, the lab's `errorBand`); null for an empty comparison set. It sets how strongly the error text is colored. */
  band: LibRingDot['band'];
}

/** A signed one-decimal error in cents with the true minus sign (U+2212), as the lib's readout line writes it. */
const signedCents = (e: number): string => `${e < 0 ? '−' : '+'}${Math.abs(e).toFixed(1)} c`;

/** How many characters the Interval cell and a ring label hold before a merged list is cut to `+N`. */
export const INTERVAL_FIT = 8;
export const RING_LABEL_FIT = 7;

/** The ratios a drawn dot stands for, one per chord note on it. */
const ratiosOf = (ring: LibraryRing, d: LibRingDot): string[] =>
  d.notes.map((i) => ring.notes[i].ratio);

/** The table's rows: one per drawn dot, a merged dot named by its comma list of chord ratios (cut to `+N` when it does not fit) and the first note's pitch. */
export function readoutRows(ring: LibraryRing): ReadoutRow[] {
  return ring.dots.map((d) => {
    const n = ring.notes[d.notes[0]];
    const fit = d.notes.length > 1 ? fitList(ratiosOf(ring, d), INTERVAL_FIT) : null;
    return {
      chord: fit ? fit.text : n.ratio,
      ...(fit?.cut ? { chordFull: fit.full } : {}),
      pitch: n.pitch,
      near: d.near ?? 'none',
      error: d.direction === 'exact' ? 'exact' : d.err === null ? '–' : signedCents(d.err),
      direction: d.direction,
      band: d.band,
    };
  });
}

/** The column titles, in order; the first column is the swatch. */
export const READOUT_COLUMNS = ['Interval', 'Pitch', 'Nearest', 'Error'] as const;

/**
 * The library ring's radius in units: 1.75 times the main ring's 104 (the human asked for 150% of the first version's 121). The
 * ring is drawn larger than the main ring so its labels have room; the marks scale with it and the label text does not.
 */
export const LIBRARY_RING_R = 181;

const ANGLE = (c: number, turn: number) => (c / turn) * 2 * Math.PI - Math.PI / 2;

/** The flag's pole at the chord note's place: a radial bar from the ring line OUTWARD (its inner end touches the perimeter), as thick as the flag, so pole and arc read as one flag. Its length follows the error: this many units at the least, at the most. */
export const POLE_MIN = 9;
export const POLE_MAX = 25;
/** The error (cents) at which the pole reaches `POLE_MAX` (the lab's red band starts at 30 c); in between the length is proportional to the error. */
export const POLE_FULL_C = 30;
/** The pole ends in a small hollow circle (a pinhead): its radius in units, its stroke is `.flagHead` in the CSS (thin, hollow, the flag's color). */
export const POLE_HEAD_R = 3;

/** The pole's length in units for an error in cents: proportional (`POLE_MAX` at `POLE_FULL_C`), never under `POLE_MIN` or over `POLE_MAX`. */
export const poleLength = (err: number): number =>
  Math.min(POLE_MAX, Math.max(POLE_MIN, (Math.abs(err) / POLE_FULL_C) * POLE_MAX));

/** The flag's width in units (the arc's stroke, `.flag` in the CSS) and the width the pole narrows to at the pinhead (the head's own stroke, `.flagHead`). */
export const FLAG_W = 4;
export const HEAD_STROKE = 1.5;

/** The arc along the ring from the chord note toward its nearest note (a chord note above it runs back, below it runs forward; never under `MIN_FLAG_DEG`). */
function flagPath(folded: number, err: number, repC: number, C: number, R: number): string {
  const a0 = ANGLE(folded, repC);
  const sign = err > 0 ? -1 : 1;
  const a1 = a0 + (sign * (flagDegrees(err, repC) * Math.PI)) / 180;
  // the arc starts on the pole's centerline; the flag's corner is rounded by a disc of half the flag's width at that point (`flagCorner`)
  const at = (a: number) =>
    `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
  return `M${at(a0)}A${R} ${R} 0 0 ${err > 0 ? 0 : 1} ${at(a1)}`;
}

/**
 * The pole as a filled shape (a stroke cannot taper): standing outward from the ring line at the chord note's place, as wide
 * as the flag where it meets the arc (`FLAG_W`) and narrowing to the pinhead's stroke width (`HEAD_STROKE`) where it reaches
 * the head's edge, so the pole meets the circle cleanly. `points` for a `<polygon>`.
 */
export function polePoints(
  folded: number,
  err: number,
  repC: number,
  C: number,
  R: number
): string {
  const a = ANGLE(folded, repC);
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const t = { x: -Math.sin(a), y: Math.cos(a) };
  const tip = R + poleLength(err) - POLE_HEAD_R;
  const corner = (r: number, w: number) =>
    `${(C + r * u.x + w * t.x).toFixed(2)},${(C + r * u.y + w * t.y).toFixed(2)}`;
  const b = FLAG_W / 2;
  const e = HEAD_STROKE / 2;
  return [corner(R, b), corner(tip, e), corner(tip, -e), corner(R, -b)].join(' ');
}

/** An inside label's natural place: this far inside the ring (center), at the main ring's scale (times the marks' scale). */
const LABEL_IN = 22;

export interface LibraryRingMarksProps extends RingOverlayArgs {
  ring: LibraryRing;
  /** The index (in `ring.dots`) of the readout row the pointer is on; its note gets the hover outline. */
  hovered?: number | null;
}

/**
 * What the library ring draws that the main ring does not (the `overlay` of `PitchRing`), per chord dot:
 *  - an exact note: nothing here (the main ring's blue ring on its field dot and the blue polygon are its highlight);
 *  - a note that is not exact: no dot of its own (the flag marks it); a note with no note to compare with, the empty
 *    comparison set, is a plain field-size dot;
 *  - the flag of a note that is not exact, orange above its nearest note and teal below it: a pole standing outward from the
 *    ring at the note (its length follows the error) and an arc along the ring toward its nearest note (never under `MIN_FLAG_DEG`);
 *  - its pitch ratio inside the ring, for a note that is not exact (a merged octave dot: the compact list, the whole list in the tooltip). The labels are
 *    placed by the main ring's `layoutLabels` mirrored inward: one that does not fit at its own spot (a field dot, a ghost,
 *    the outside labels or another inside label is in the way) moves to the next lane toward the center, and a leader line
 *    (the main ring's `labelLeader`) joins it to its dot.
 */
export function LibraryRingMarks({
  ring,
  hovered,
  at,
  C,
  R,
  turn,
  k,
  dots,
  labels,
}: LibraryRingMarksProps) {
  // an exact dot is named by the field note's own label outside; every other dot is named inside, by its pitch ratio
  const shown = useMemo(() => ring.dots.filter((d) => d.direction !== 'exact'), [ring]);
  const places = useMemo(() => {
    const r = RING_SOUND_R * k;
    const dotBox = (p: { x: number; y: number }): Box => ({ x: p.x, y: p.y, w: 2 * r, h: 2 * r });
    // the field dots, the chord's own marks and the field labels are in the way; the other inside labels are placed in turn
    const obstacles: Box[] = [
      ...dots.map(dotBox),
      ...ring.dots.map((d) => dotBox(at(d.folded))),
      ...labels,
    ];
    return layoutLabels(
      shown.map((d) => {
        const p = at(d.folded, R - LABEL_IN * k);
        const text =
          d.notes.length > 1
            ? fitList(ratiosOf(ring, d), RING_LABEL_FIT).text
            : ring.notes[d.notes[0]].pitch;
        return { x: p.x, y: p.y, text };
      }),
      {
        cx: C,
        cy: C,
        laneStep: 22,
        lanes: 3,
        advance: 6.6,
        subAdvance: 5.4,
        lineH: 12,
        subH: 10,
        subDy: 10,
        pad: 5.5,
        obstacles,
        bounds: { x0: C - R, y0: C - R, x1: C + R, y1: C + R },
        inward: true,
      }
    );
  }, [ring, shown, at, C, R, k, dots, labels]);
  return (
    <>
      {ring.dots.map((d, i) =>
        d.err !== null && d.direction !== 'exact' && d.direction !== 'none' ? (
          <g key={`f${i}`}>
            <path
              className={classes.flag}
              d={flagPath(d.folded, d.err, turn, C, R)}
              data-testid="ring-flag"
              data-direction={d.direction}
              data-degrees={flagDegrees(d.err, turn).toFixed(2)}
            />
            <circle
              className={classes.flagCorner}
              cx={at(d.folded).x}
              cy={at(d.folded).y}
              r={FLAG_W / 2}
              data-testid="ring-flag-corner"
              data-direction={d.direction}
            />
            <polygon
              className={classes.flagPole}
              points={polePoints(d.folded, d.err, turn, C, R)}
              data-testid="ring-flag-pole"
              data-direction={d.direction}
            />
            <circle
              className={classes.flagHead}
              cx={at(d.folded, R + poleLength(d.err)).x}
              cy={at(d.folded, R + poleLength(d.err)).y}
              r={POLE_HEAD_R}
              data-testid="ring-flag-head"
              data-direction={d.direction}
            />
          </g>
        ) : null
      )}
      {hovered !== null &&
        hovered !== undefined &&
        ring.dots[hovered] && (
          // a readout row is pointed at: its note on the ring gets the main ring's hover outline (an exact note has the lab's own hover instead)
          <RingOutline
            cx={at(ring.dots[hovered].folded).x}
            cy={at(ring.dots[hovered].folded).y}
            scale={k}
            data-testid="ring-row-halo"
          />
        )}
      {ring.dots.map((d, i) => {
        const p = at(d.folded);
        const slot = shown.indexOf(d);
        const place = slot >= 0 ? places[slot] : null;
        const fit = d.notes.length > 1 ? fitList(ratiosOf(ring, d), RING_LABEL_FIT) : null;
        return (
          <g key={`d${i}`}>
            {d.direction === 'none' ? (
              // no field note under it (an empty comparison set): a plain field-size dot
              <RingDot
                kind="on"
                scale={k}
                cx={p.x}
                cy={p.y}
                data-testid="ring-dot"
                data-direction={d.direction}
                data-look="dot"
                data-label={d.label}
              />
            ) : null}
            {place && (
              <>
                {place.leader && (
                  <line
                    className={labClasses.labelLeader}
                    data-testid="ring-inside-leader"
                    {...leaderEnds(p.x, p.y, place.x, place.y, 7 * k)}
                  />
                )}
                <RingLabel
                  on
                  x={place.x}
                  y={place.y}
                  style={place.scale < 1 ? { fontSize: SVG_FS_LABEL * place.scale } : undefined}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  data-testid="ring-dot-label"
                >
                  {fit ? fit.text : ring.notes[d.notes[0]].pitch}
                  {fit?.cut && <title>{fit.full}</title>}
                </RingLabel>
              </>
            )}
          </g>
        );
      })}
    </>
  );
}

/** The small mark in the table's first column: the dot as drawn (solid neutral when exact, a dashed orange or teal ring otherwise). */
function Swatch({ direction }: { direction: LibRingDot['direction'] }) {
  return (
    <svg
      className={classes.swatch}
      viewBox="0 0 12 12"
      aria-hidden="true"
      data-direction={direction}
    >
      {direction === 'above' || direction === 'below' ? (
        // a small flag, as drawn on the ring: the pole and the bar
        <path className={classes.swatchFlag} d="M3 10V3h7" data-direction={direction} />
      ) : (
        <circle className={classes.swatchDot} cx={6} cy={6} r={4.5} data-direction={direction} />
      )}
    </svg>
  );
}

/** The quiet line under the roots table, shown only while the ring's switch is on Field. */
export const RING_FIELD_NOTE = 'Ring compares with the whole field.';

/** One root of "In your subset: found on N roots": the field index, the root's ratio text and the chord's error there. */
export interface RootsRow {
  idx: number;
  root: string;
  /** The signed error in cents of the note with the largest size (the chord card's worst). */
  worst: number;
  /** The signed mean error over the notes except the root (the chord card's avg). */
  avg: number;
}

export interface LibraryRootsProps {
  /** The table's title (`In your subset: found on 5 roots`); with a `message` there is no table and no title. */
  title: string;
  rows: readonly RootsRow[];
  /** A sentence in the table's place: not found, the range hint or the folding note. */
  message: string | null;
  /** The pinned root's field index, or null. */
  pinned: number | null;
  /** The pointer or focus reached / left a root row: the ring, the readout and hold 1 preview it. */
  onEnter: (idx: number) => void;
  onLeave: (idx: number) => void;
  /** A click, Enter or Space on a root row: pin it, or unpin it when it is the pinned one. */
  onToggle: (idx: number) => void;
}

/** A Worst or Avg figure in cents, signed (H-38), one decimal, colored by the shared signed error scale (orange sharp, cyan flat). */
function ErrCell({ value }: { value: number }) {
  return (
    <td className={classes.numCol} data-col="stat">
      <span
        className={panelClasses.err}
        data-sev={severity(Math.abs(value))}
        style={{ color: signedErrorTextColor(value) }}
      >
        {signed(value)}
      </span>
    </td>
  );
}

/** The roots table (or the message in its place) and its one quiet note: fixed regions, so hovering moves nothing. */
function RootsBlock({ roots, cmp }: { roots: LibraryRootsProps; cmp: LibCmp }) {
  const { rows, message, pinned, onEnter, onLeave, onToggle } = roots;
  return (
    <div className={classes.roots} data-testid="library-roots">
      {message ? (
        <div className={classes.rootsMsg} data-testid="roots-message">
          {message}
        </div>
      ) : (
        <>
          <div className={classes.rootsTitle} data-testid="roots-title">
            <Tip k="libraryRoots">{roots.title}</Tip>
          </div>
          <div className={classes.rootsScroll}>
            <table className={`${classes.table} ${classes.rootsTable}`} aria-label="Roots">
              <colgroup>
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Root</th>
                  <th scope="col" className={classes.numCol}>
                    Worst
                  </th>
                  <th scope="col" className={classes.numCol}>
                    Avg
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.idx}
                    className={classes.rootRow}
                    tabIndex={0}
                    data-testid="roots-row"
                    data-root={r.idx}
                    data-pinned={pinned === r.idx}
                    aria-current={pinned === r.idx ? 'true' : undefined}
                    onMouseEnter={() => onEnter(r.idx)}
                    onMouseLeave={() => onLeave(r.idx)}
                    onFocus={() => onEnter(r.idx)}
                    onBlur={() => onLeave(r.idx)}
                    onClick={() => onToggle(r.idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle(r.idx);
                      }
                    }}
                  >
                    <td data-col="root">{r.root}</td>
                    <ErrCell value={r.worst} />
                    <ErrCell value={r.avg} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* its line is always reserved, so switching Field | Subset moves nothing */}
      <div className={classes.rootsNote} data-testid="roots-note">
        {cmp === 'field' ? RING_FIELD_NOTE : null}
      </div>
    </div>
  );
}

export interface LibraryRingPanelProps {
  /** The chord to show; null shows the empty text. */
  ring: LibraryRing | null;
  /** The chord's first name (the card's title line: the larger, whiter type). */
  title: string | null;
  /** Its ratio text (`4:5:6:7`; the card's second line: the smaller muted type). */
  ratio?: string | null;
  /** The pointer or focus reached / left the title block: hold 1, 4 or 5 there plays the shown chord, as on its library row (the dialog passes its row handlers). */
  onTitleEnter?: () => void;
  onTitleLeave?: () => void;
  /** The root's ratio text (`5/4`, `1/1`). */
  rootText: string | null;
  /** What the ring compares with: the whole field (every field dot solid) or the subset (a note outside it hollow). The ring's field, subset and sounding notes are the lab's (`useLab`), as on the main ring. */
  cmp: LibCmp;
  onCmp: (c: LibCmp) => void;
  /** M7d: the roots table under the readout (absent: none, as in the panel drawn on its own). */
  roots?: LibraryRootsProps | null;
  /** The pointer or focus reached / left a field dot (its field index): hold 1, 4 or 5 there plays that note, the shown chord on it rounded, or its exact ratios (the dialog sets the preview target). Hovering a dot changes nothing else in the lab, and a click does nothing. */
  onDotEnter?: (index: number) => void;
  /** The lit field notes and ghost marks to draw (the dialog's own lights: see `LabAudio.setLightSuppressed`). Absent: the lab's. */
  sounding?: ReadonlySet<number>;
  ghosts?: readonly Ghost[];
  onDotLeave?: (index: number) => void;
}

const NO_NOTES: ReadonlySet<number> = new Set();

export function LibraryRingPanel({
  ring,
  title,
  ratio = null,
  onTitleEnter,
  onTitleLeave,
  rootText,
  cmp,
  onCmp,
  roots,
  onDotEnter,
  onDotLeave,
  sounding,
  ghosts,
}: LibraryRingPanelProps) {
  const { base } = useLab();
  const rows = ring ? readoutRows(ring) : [];
  // the note a dot or an exact readout row points at wears the main ring's hover outline. It is this panel's own state: setting
  // the lab's hover would re-draw every view behind the dialog on each dot, and sweeping the ring would skip dots
  const [dotHover, setDotHover] = useState<number | null>(null);
  // the readout row the pointer is on (index in `ring.dots`): an exact note lights through the dot hover above, any other note by an outline drawn here
  const [rowHover, setRowHover] = useState<number | null>(null);
  const fieldOf = useCallback(
    (d: LibRingDot): number | null => {
      if (d.direction !== 'exact' || d.nearIdx === null) {
        return null;
      }
      return (cmp === 'field' ? d.nearIdx : base.idx[d.nearIdx]) ?? null;
    },
    [cmp, base.idx]
  );
  const rowEnter = (i: number) => {
    const d = ring?.dots[i];
    const f = d ? fieldOf(d) : null;
    if (f !== null) {
      setDotHover(f);
    } else {
      setRowHover(i);
    }
  };
  const rowLeave = () => {
    setDotHover(null);
    setRowHover(null);
  };
  // the field indices the chord's EXACT notes sit on (`nearIdx` indexes the comparison set: the field, or the subset's notes in field order)
  const exact = useMemo(() => {
    if (!ring) {
      return NO_NOTES;
    }
    const out = new Set<number>();
    for (const d of ring.dots) {
      if (d.direction === 'exact' && d.nearIdx !== null) {
        const f = cmp === 'field' ? d.nearIdx : base.idx[d.nearIdx];
        if (f !== undefined) {
          out.add(f);
        }
      }
    }
    return out;
  }, [ring, cmp, base.idx]);
  const chordCents = useMemo(() => ring?.dots.map((d) => d.folded), [ring]);
  // a dot is a mark of the ring here, not a button: no click, no toggle; pointing at it gives the main ring's hover feedback (the outline, and the note lit in every view)
  const dotProps = useCallback(
    (i: number): RingDotExtra => ({
      role: 'img',
      'aria-pressed': undefined,
      'data-kind': 'field',
      'data-index': i,
      onMouseEnter: () => {
        setDotHover(i);
        onDotEnter?.(i);
      },
      onMouseLeave: () => {
        setDotHover((h) => (h === i ? null : h));
        onDotLeave?.(i);
      },
      onFocus: () => {
        setDotHover(i);
        onDotEnter?.(i);
      },
      onBlur: () => {
        setDotHover((h) => (h === i ? null : h));
        onDotLeave?.(i);
      },
    }),
    [onDotEnter, onDotLeave]
  );
  const overlay = useCallback(
    (a: RingOverlayArgs) =>
      ring ? <LibraryRingMarks ring={ring} hovered={rowHover} {...a} /> : null,
    [ring, rowHover]
  );
  return (
    <section className={classes.panel} aria-label="Chord ring" data-testid="library-ring-panel">
      <PitchRing
        view="chromatic"
        steps={12}
        radius={LIBRARY_RING_R}
        trimPolygons
        solidAll={cmp === 'field'}
        chord={exact}
        chordCents={chordCents}
        hover={dotHover}
        sounding={sounding}
        ghosts={ghosts}
        dotProps={dotProps}
        overlay={overlay}
        className={classes.ring}
        ariaLabel={ring ? `Ring of ${title ?? 'the chord'}` : 'Ring, no chord yet'}
      />
      <div className={classes.side}>
        <div className={classes.top}>
          <Tip k="libraryRing">Ring</Tip>
          <Tip k="libraryRing" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Compare the ring against"
              value={cmp}
              onChange={(v) => onCmp(v as LibCmp)}
              data={[
                { label: 'Field', value: 'field' },
                { label: 'Subset', value: 'subset' },
              ]}
            />
          </Tip>
        </div>
        {ring ? (
          <>
            <Hint k="libraryRow" position="bottom">
              <div
                className={classes.titleBlock}
                data-testid="ring-title"
                tabIndex={onTitleEnter ? 0 : undefined}
                onMouseEnter={onTitleEnter}
                onMouseLeave={onTitleLeave}
                onFocus={onTitleEnter}
                onBlur={onTitleLeave}
              >
                <span
                  className={`${panelClasses.cardLine1} ${classes.titleName}`}
                  data-testid="ring-title-name"
                >
                  {title}
                </span>
                {ratio && (
                  <span
                    className={`${panelClasses.cardLine2} ${classes.titleRatio}`}
                    data-testid="ring-title-ratio"
                  >
                    <Num muted>{ratio}</Num>
                  </span>
                )}
              </div>
            </Hint>
            <div className={classes.from} data-testid="ring-root">
              from {rootText}
            </div>
            <div className={classes.scroll}>
              <table className={classes.table} aria-label="Chord readout">
                <colgroup>
                  <col className={classes.colMark} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">
                      <VisuallyHidden>Mark</VisuallyHidden>
                    </th>
                    {READOUT_COLUMNS.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      data-direction={r.direction}
                      data-testid="readout-row"
                      onMouseEnter={() => rowEnter(i)}
                      onMouseLeave={rowLeave}
                    >
                      <td>
                        <Swatch direction={r.direction} />
                      </td>
                      <td data-col="chord">
                        {r.chordFull ? (
                          <Hint label={r.chordFull}>
                            <span>{r.chord}</span>
                          </Hint>
                        ) : (
                          r.chord
                        )}
                      </td>
                      <td data-col="pitch">{r.pitch}</td>
                      <td data-col="near">{r.near}</td>
                      <td
                        className={classes.err}
                        data-col="error"
                        data-direction={r.direction}
                        data-band={r.band ?? undefined}
                        style={{
                          color: signedBandTextColor(
                            r.band === null
                              ? 0
                              : r.direction === 'below'
                                ? -r.band
                                : r.direction === 'above'
                                  ? r.band
                                  : 0
                          ),
                        }}
                      >
                        {r.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {roots && <RootsBlock roots={roots} cmp={cmp} />}
          </>
        ) : (
          <div className={classes.empty} data-testid="ring-empty">
            {RING_EMPTY_TEXT}
          </div>
        )}
      </div>
    </section>
  );
}

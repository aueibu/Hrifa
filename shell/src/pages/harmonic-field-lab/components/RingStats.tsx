/** Pitch circle, glanceable stats and step-size bars to its right, and the note inspector under them. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ActionIcon,
  Button,
  NativeSelect,
  Popover,
  SegmentedControl,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import {
  landingPitch,
  landingReadout,
  noteText,
  parseInterval,
  type FifthsLayout,
  type Note,
} from '../../../lib/harmonic-field';
import type { PreviewTarget } from '../audio/plan';
import { fieldRowsOf, fifthsFor, periodText, spectrumOf } from '../state/derive';
import { useLabDeveloperOptions } from '../state/developerOptions';
import type { Ghost } from '../state/ghosts';
import { chevronBox, fitView, layoutLabels, leaderEnds, type Box } from '../state/labelLayout';
import type { RingView } from '../state/labState';
import { SVG_FS_LABEL, SVG_FS_SMALL } from '../state/typeScale';
import { FieldCompact } from './FieldPanel';
import { OutsideCount, useGhosts } from './GhostMarks';
import { GearIcon } from './icons';
import { RING_GAP, RingChevron, rootLabel, useModeRoot } from './ModeRoot';
import type { MonzoView } from './MonzoPanel';
import {
  META_SETS_DEFAULTS,
  RelativeModal,
  mainPxPerUnit,
  type BandMode,
  type MetaSets,
  type RelativeHover,
  type RelativeMode,
} from './RelativeMenu';
import {
  RING_BOX_REM,
  RING_OFF_CHAIN_R,
  RING_PAD as PAD,
  RING_R as R,
  RING_SIZE as SIZE,
  RingCircle,
  RingDot,
  RingLabel,
  RingOutline,
  haloRadius,
  RingPolygon,
  dotReach,
  markScaleFor,
} from './ringMarks';
import { Num, Row, Tip, noteHandlers, signed, useLab } from './ui';
import classes from './lab.module.css';

/** Ring radius in the Fifths view (smaller: it carries step names, ratios and offsets outside). Not scaled by `radius`. */
const RF = 92;
/** The yellow ring round a pinned note (at the main ring's scale). */
const RING_PIN_R = 12;
const CHAINS = ['12', '17', '19', '31'];
/** Note names for the 12-step chain with 3/2, D-flat to F-sharp (steps -5 to +6); other lengths show the step number. */
const CHAIN12 = ['D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯'];

/** Marks of one note on the ring: where, how big, and the label lines. */
interface Mark {
  x: number;
  y: number;
  lx: number;
  ly: number;
  /** Position round the ring as a fraction of a turn (clockwise from the top), for the subset polygon's order. */
  turn: number;
  offset?: number;
  offChain?: boolean;
}

/** The drawing's geometry for a ring line of radius `R` (in the Chromatic view; the Fifths view keeps its own `RF`). */
interface Geo {
  /** The ring line's radius. */
  R: number;
  /** The drawing is a square of this many units, the ring in its middle at (C, C). */
  size: number;
  C: number;
  /** The marks' scale (1 for the main ring). */
  k: number;
}

/** The main ring has radius `RING_R` in a drawing of `RING_SIZE`: the room round the ring line (46 units) stays when the radius changes. */
function geoFor(radius: number): Geo {
  const size = SIZE + 2 * (radius - R);
  return { R: radius, size, C: size / 2, k: markScaleFor(radius) };
}

/** A point at pitch `c` of a repeat `repC` on the circle of radius `r` round the ring's center. */
function polarAt(g: Geo, c: number, repC: number, r: number) {
  const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
  return { x: g.C + r * Math.cos(a), y: g.C + r * Math.sin(a) };
}

/** A pitch folded into [0, repeat). */
const foldInto = (c: number, repC: number) => (repC > 0 ? ((c % repC) + repC) % repC : c);

function marksFor(
  view: RingView,
  cents: readonly number[],
  repC: number,
  L: FifthsLayout | null,
  g: Geo
): Mark[] {
  if (view === 'chromatic' || !L) {
    return cents.map((c) => {
      const p = polarAt(g, c, repC, g.R);
      const l = polarAt(g, c, repC, g.R + 30);
      return { x: p.x, y: p.y, lx: l.x, ly: l.y, turn: c / repC };
    });
  }
  return L.notes.map((p) => {
    const a = p.turn * 2 * Math.PI - Math.PI / 2;
    const r = p.offChain ? RF - 30 : RF - 20 * p.stack;
    const rl = RF + 32;
    return {
      x: g.C + r * Math.cos(a),
      y: g.C + r * Math.sin(a),
      lx: g.C + rl * Math.cos(a),
      ly: g.C + rl * Math.sin(a),
      turn: p.turn,
      offset: p.offset,
      offChain: p.offChain,
    };
  });
}

/** What the `overlay` render prop gets: where things are on this ring. */
export interface RingOverlayArgs {
  /** The point at pitch `c` (cents above 1/1, folded or not) on the circle of radius `r` (default: the ring line). */
  at: (c: number, r?: number) => { x: number; y: number };
  /** The ring's center (x and y). */
  C: number;
  /** The ring line's radius. */
  R: number;
  /** The repeat in cents: one full turn. */
  turn: number;
  /** The marks' scale (`radius / RING_R`): offsets of marks the overlay draws next to a dot should follow it. */
  k: number;
  /** Where the field dots are, by field index. */
  dots: readonly { x: number; y: number }[];
  /** The boxes of the field labels as placed (a label an overlay mark must not cover). */
  labels: readonly Box[];
}

/** Props a host may give a field dot: the circle's own (not its place, size or class) and any `data-*`. */
type CircleExtra = Omit<ComponentPropsWithoutRef<'circle'>, 'cx' | 'cy' | 'r' | 'className'>;
export type RingDotExtra = CircleExtra & {
  [attr: `data-${string}`]: string | number | boolean | undefined;
};

export interface PitchRingProps {
  view: RingView;
  steps: number;
  /** The ring line's radius in units (default `RING_R`, 104). The drawing, the label bounds and the fitted view follow it, and the marks' RADII (dots, ghosts, the hover and pin rings, the chevron) are scaled by `radius / RING_R`; stroke widths, dashes, the label text size and the label lanes keep their size in units. */
  radius?: number;
  /** The outline of the subset and chord polygons is drawn as separate edges that stop at the edge of each corner's mark (its scaled radius plus half its stroke), the fill still running to the centers. Default: the polygons are drawn whole, as on the main ring. */
  trimPolygons?: boolean;
  /** Every field dot is drawn solid (default: only the subset's, the rest hollow). */
  solidAll?: boolean;
  /** The field indices shown as the chord (blue polygon and outlines); default: the lab's highlighted chord. */
  chord?: ReadonlySet<number>;
  /** With `chord`: the blue polygon goes through these exact pitches (cents, folded into the repeat), so a pitch that is no field note still has a corner. Chromatic view only. */
  chordCents?: readonly number[];
  /** The field notes that sound (lit green), in place of the lab's `sounding`: a host that gets the lights from its own channel (the chord library's ring) passes them. Default: the lab's. */
  sounding?: ReadonlySet<number>;
  /** The ghost marks (sounding pitches that match no field note), in place of `useGhosts()`. Default: the lab's. */
  ghosts?: readonly Ghost[];
  /** The note that wears the hover outline, in place of the lab's hover (null: none). A host that keeps its own hover (the chord library's ring) passes it, so a hover there does not re-draw the rest of the lab. Default: the lab's hover. */
  hover?: number | null;
  /** The props of field dot `i`, in place of the main ring's (hover sets the lab hover, a click toggles the subset). Handlers, `role`, `aria-*` and `data-*` here replace the dot's own. */
  dotProps?: (i: number) => RingDotExtra;
  /** Extra marks drawn after the dots (pointer-events none); the sounding ghosts then come after them. */
  overlay?: (a: RingOverlayArgs) => ReactNode;
  /** The drawing's on-screen pixels per unit; the svg gets that width (default: the svg fills its box). */
  pxPerUnit?: number;
  /** An extra class on the svg (after the ring's own). */
  className?: string;
  /** The svg's accessible name (default: the pitch circle's description). */
  ariaLabel?: string;
}

export function PitchRing({
  view,
  steps,
  radius = R,
  trimPolygons = false,
  solidAll = false,
  chord: chordProp,
  chordCents,
  sounding: soundingProp,
  ghosts: ghostsProp,
  hover: hoverProp,
  dotProps,
  overlay,
  pxPerUnit,
  className,
  ariaLabel,
}: PitchRingProps) {
  const lab = useLab();
  const { base, state, selected } = lab;
  const sounding = soundingProp ?? lab.sounding;
  const chord = chordProp ?? lab.chord;
  const hoverIdx = hoverProp !== undefined ? hoverProp : lab.hover;
  const { field, repC, ratios } = base;
  const modeRoot = useModeRoot();
  const g = useMemo(() => geoFor(radius), [radius]);
  const { C, k } = g;
  const L = useMemo(
    () => (view === 'fifths' ? fifthsFor(field, repC, state.ui.ringGen, steps) : null),
    [view, field, repC, state.ui.ringGen, steps]
  );
  const marks = useMemo(
    () =>
      marksFor(
        view,
        field.map((n) => n.c),
        repC,
        L,
        g
      ),
    [view, field, repC, L, g]
  );
  // label places: the root first (it must clear its chevron), then the rest; none overlap another or the chevron
  const places = useMemo(() => {
    const order = field
      .map((_, i) => i)
      .sort((a, b) => (a === modeRoot ? -1 : b === modeRoot ? 1 : a - b));
    const obstacles: Box[] =
      modeRoot !== null && marks[modeRoot]
        ? [chevronBox(C, C, marks[modeRoot].x, marks[modeRoot].y, RING_GAP * k, k)]
        : [];
    const out = layoutLabels(
      order.map((i) => ({
        x: marks[i].lx,
        y: marks[i].ly,
        text: ratios[i],
        sub:
          marks[i].offset === undefined
            ? undefined
            : marks[i].offChain
              ? 'off'
              : signed(marks[i].offset as number),
      })),
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
        bounds: { x0: -PAD, y0: -PAD, x1: g.size + PAD, y1: g.size + PAD },
      }
    );
    const byNote = new Map(order.map((i, n) => [i, out[n]]));
    const list = field.map((_, i) => byNote.get(i)!);
    // fit the drawing to the ring, the chevron and the labels actually placed (no room kept for unused lanes)
    const view = fitView(C, C, g.R + 10, [...obstacles, ...out.map((p) => p.box)]);
    return { list, view };
  }, [field, marks, ratios, modeRoot, g, C, k]);
  // how far field dot i's mark reaches from its center (its radius times the marks' scale plus half its stroke): where a trimmed polygon edge stops
  const reachOf = (i: number) =>
    dotReach(sounding.has(i) ? 'lit' : solidAll || selected.has(i) ? 'on' : 'off', {
      chord: chord.has(i),
      r: !sounding.has(i) && marks[i].offChain ? RING_OFF_CHAIN_R : undefined,
      scale: k,
    });
  // the blue polygon: through the exact pitches when they are given (a pitch that is no field note has its corner), else through the chord's field notes
  let chordPts: { x: number; y: number }[];
  let chordReach: number[];
  if (chordCents && view === 'chromatic') {
    const corners = chordCents
      .map((c) => foldInto(c, repC))
      .sort((a, b) => a - b)
      .map((c) => {
        // a corner on a field dot of the chord is that dot's mark; any other pitch (it matches no field note) has no mark of its own, only the library's flag pole
        const near = [...chord].find((i) => {
          const d = Math.abs(foldInto(field[i]?.c ?? NaN, repC) - c);
          return Math.min(d, repC - d) < 1;
        });
        return {
          pt: polarAt(g, c, repC, g.R),
          reach: near !== undefined ? reachOf(near) : 0,
        };
      });
    chordPts = corners.map((c) => c.pt);
    chordReach = corners.map((c) => c.reach);
  } else {
    const idx = [...chord].filter((i) => i < field.length).sort((a, b) => a - b);
    chordPts = idx.map((i) => marks[i]);
    chordReach = idx.map(reachOf);
  }
  const subsetIdx = [...selected]
    .filter((i) => i < field.length)
    .sort((a, b) => marks[a].turn - marks[b].turn || a - b);
  const subsetPts = subsetIdx.map((i) => marks[i]);
  const lit = [...sounding].filter((i) => i < field.length).sort((a, b) => a - b);
  const labGhosts = useGhosts();
  const ghosts = ghostsProp ?? labGhosts;
  // the sounding pitches that are no field note: under the polygons and dots on the main ring; over an overlay's marks when there is one
  const ghostMarks =
    view === 'chromatic' &&
    ghosts.map((gh) => {
      const a = gh.turn * 2 * Math.PI - Math.PI / 2;
      return (
        <RingDot
          key={gh.c}
          kind="ghost"
          scale={k}
          data-testid="ring-ghost"
          cx={C + g.R * Math.cos(a)}
          cy={C + g.R * Math.sin(a)}
          role="img"
          aria-label={`Ghost: ${gh.text}`}
        >
          <title>{gh.text}</title>
        </RingDot>
      );
    });
  const svgStyle: CSSProperties | undefined =
    pxPerUnit !== undefined ? { width: Number(places.view.split(' ')[2]) * pxPerUnit } : undefined;
  return (
    <svg
      viewBox={places.view}
      className={className ? `${classes.ringSvg} ${className}` : classes.ringSvg}
      style={svgStyle}
      role="group"
      aria-label={
        ariaLabel ??
        `Pitch circle, ${view} view: ${selected.size} of ${field.length} notes selected${
          lit.length ? `; ${lit.map((i) => ratios[i]).join(', ')} sounding` : ''
        }`
      }
    >
      <RingCircle cx={C} cy={C} r={view === 'fifths' ? RF : g.R} />
      {L?.positions.map((p) => {
        const a = p.turn * 2 * Math.PI - Math.PI / 2;
        const name = steps === 12 ? CHAIN12[p.step - L.lo] : String(p.step);
        return (
          <g key={p.step} aria-hidden="true">
            <line
              className={classes.tickLine}
              x1={C + (RF - 3) * Math.cos(a)}
              y1={C + (RF - 3) * Math.sin(a)}
              x2={C + (RF + 3) * Math.cos(a)}
              y2={C + (RF + 3) * Math.sin(a)}
            />
            {steps <= 19 && (
              <text
                className={classes.chainLabel}
                x={C + (RF - 12) * Math.cos(a)}
                y={C + (RF - 12) * Math.sin(a)}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {name}
              </text>
            )}
          </g>
        );
      })}
      {!overlay && ghostMarks}
      <RingPolygon
        kind="subset"
        data-testid="subset-polygon"
        points={subsetPts}
        trim={trimPolygons ? subsetIdx.map(reachOf) : undefined}
      />
      <RingPolygon kind="chord" points={chordPts} trim={trimPolygons ? chordReach : undefined} />
      {field.map((n, i) => {
        const m = marks[i];
        const isLit = sounding.has(i);
        const on = selected.has(i);
        // the dot is solid when it is in the subset, or for every note when `solidAll`
        const solid = solidAll || on;
        const inChord = chord.has(i);
        const extra =
          m.offset !== undefined && L
            ? `, step ${L.notes[i].step}, ${m.offset >= 0 ? '+' : ''}${m.offset.toFixed(1)} cents${m.offChain ? ', off the chain' : ''}`
            : '';
        const label = places.list[i];
        return (
          <g key={i} data-root={modeRoot === i ? 'true' : undefined}>
            {lab.pin === i && (
              <circle className={classes.pinRing} cx={m.x} cy={m.y} r={haloRadius(RING_PIN_R, k)} />
            )}
            {hoverIdx === i && <RingOutline cx={m.x} cy={m.y} scale={k} />}
            {modeRoot === i && (
              <RingChevron cx={C} cy={C} x={m.x} y={m.y} gap={RING_GAP * k} scale={k} />
            )}
            <RingDot
              kind={isLit ? 'lit' : solid ? 'on' : 'off'}
              data-chord={inChord ? 'true' : undefined}
              data-off={m.offChain ? 'true' : undefined}
              cx={m.x}
              cy={m.y}
              r={!isLit && m.offChain ? RING_OFF_CHAIN_R : undefined}
              tabIndex={0}
              role="button"
              aria-label={`${ratios[i]}, ${n.c.toFixed(1)} cents${on ? ', in subset' : ''}${lab.pin === i ? ', pinned' : ''}${isLit ? ', sounding' : ''}${rootLabel(modeRoot, i)}${extra}`}
              aria-pressed={on}
              {...(dotProps
                ? (dotProps(i) as CircleExtra)
                : {
                    onMouseEnter: () => lab.setHover(i),
                    onMouseLeave: () => lab.setHover(null),
                    onFocus: () => lab.setHover(i),
                    onBlur: () => lab.setHover(null),
                    ...noteHandlers(lab, i),
                  })}
              scale={k}
            />
            {label.leader && (
              <line
                className={classes.labelLeader}
                data-testid="label-leader"
                {...leaderEnds(m.x, m.y, label.x, label.y, 7 * k)}
              />
            )}
            <RingLabel
              x={label.x}
              y={label.y}
              style={label.scale < 1 ? { fontSize: SVG_FS_LABEL * label.scale } : undefined}
              on={solid}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ratios[i]}
              {m.offset !== undefined && (
                <tspan
                  className={classes.offLabel}
                  style={label.scale < 1 ? { fontSize: SVG_FS_SMALL * label.scale } : undefined}
                  x={label.x}
                  dy={10 * label.scale}
                >
                  {m.offChain ? 'off' : signed(m.offset)}
                </tspan>
              )}
            </RingLabel>
          </g>
        );
      })}
      {overlay && (
        <g data-pointer="none" data-testid="ring-overlay" style={{ pointerEvents: 'none' }}>
          {overlay({
            at: (c, r = g.R) => polarAt(g, c, repC, r),
            C,
            R: g.R,
            turn: repC,
            k,
            dots: marks,
            labels: places.list.map((p) => p.box),
          })}
        </g>
      )}
      {overlay && ghostMarks}
    </svg>
  );
}

/** The ring with its header: caption, the view toggle (Chromatic | Fifths) centered over the ring, and the ring menu. */
export function RingPanel() {
  const lab = useLab();
  const { state, dispatch, tab, base } = lab;
  const { ringView: view, ringSteps: steps, ringGen } = state.ui;
  const genOk = parseInterval(ringGen) !== null;
  const [devOptions] = useLabDeveloperOptions();
  // Relative pitches (M8b): with this generator a small toggle turns the ring's note clicks into the modal. A click SELECTS the
  // note (it becomes the source) and opens the modal; it no longer toggles the subset in this mode. The modal is kept by the
  // source note's pitch (adding a note moves field indices); `hover` is the half the pointer is on.
  const isRelative = tab.gen.method === 'relative' && view === 'chromatic';
  const [relativeOn, setRelativeOn] = useState(true);
  const [menuC, setMenuC] = useState<number | null>(null);
  const [hover, setHover] = useState<RelativeHover | null>(null);
  // the main ring's pixels per unit, measured when the modal opens; how the bands are turned (runtime only)
  const boxRef = useRef<HTMLDivElement>(null);
  const [mainPpu, setMainPpu] = useState(() => mainPxPerUnit(null));
  const [bandMode, setBandMode] = useState<BandMode>('from');
  const [ringStart, setRingStart] = useState(0);
  const [metaSets, setMetaSets] = useState<MetaSets>(META_SETS_DEFAULTS);
  const [relMode, setRelMode] = useState<RelativeMode>('rings');
  const [monzoView, setMonzoView] = useState<MonzoView>('strips');
  const menuIdx =
    isRelative && relativeOn && menuC !== null
      ? base.field.findIndex((n) => Math.abs(n.c - menuC) < 1e-6)
      : -1;
  const menuOpen = menuIdx >= 0;
  const closeMenu = useCallback(() => {
    setMenuC(null);
    setHover(null);
    dispatch({ type: 'relative/dismiss' });
  }, [dispatch]);
  // a note that is gone (or another method, or the toggle off) closes the modal
  useEffect(() => {
    if (menuC !== null && !menuOpen) {
      setMenuC(null);
      setHover(null);
    }
  }, [menuC, menuOpen]);
  const from = menuOpen ? base.field[menuIdx] : null;
  // M8c hover keys: the landing under the pointer in the modal; holds 1 / 4 / 5 sound it (1 = that pitch alone, 4 = the picked
  // note and it, 5 = the whole field and it). The three sets are absolute pitches (field cents), like a library row's. The key
  // carries the landing, the source and the field, so a held key follows a change under a resting pointer.
  const [relLanding, setRelLanding] = useState<Note | null>(null);
  const audio = lab.audio;
  const lastRelTarget = useRef<PreviewTarget | null>(null);
  const fieldCents = base.field.map((n) => n.c);
  const fieldSig = fieldCents.join(',');
  useEffect(() => {
    const prev = lastRelTarget.current;
    if (!relLanding || !from) {
      if (prev) {
        audio.clearPreviewTarget(prev);
        lastRelTarget.current = null;
      }
      return;
    }
    const l = relLanding.c;
    const exact = fieldCents.some((c) => Math.abs(c - l) < 1e-6)
      ? [...fieldCents]
      : [...fieldCents, l].sort((a, b) => a - b);
    const next: PreviewTarget = {
      kind: 'pitches',
      key: `rel:${from.c}:${l}:${fieldSig}`,
      cents: [l],
      variants: { own: [l], rounded: [from.c, l], exact },
    };
    lastRelTarget.current = next;
    audio.setPreviewTarget(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldCents is rebuilt each render; fieldSig stands for it
  }, [relLanding, from?.c, fieldSig, audio]);
  const relativeDots = useCallback(
    (i: number): RingDotExtra => {
      const open = () => {
        // the main ring's svg is the box's direct child (the header has its own icons)
        const svg = Array.from(boxRef.current?.children ?? []).find((el) => el.tagName === 'svg');
        setMainPpu(mainPxPerUnit(svg ?? null));
        setMenuC(base.field[i]?.c ?? null);
      };
      return {
        onMouseEnter: () => lab.setHover(i),
        onMouseLeave: () => lab.setHover(null),
        onFocus: () => lab.setHover(i),
        onBlur: () => lab.setHover(null),
        onClick: open,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        },
        'aria-pressed': undefined,
      };
    },
    [lab, base.field]
  );
  const landing = from && hover ? landingPitch(from, hover.ratio.note, hover.dir, base.rep) : null;
  const line =
    menuOpen && state.relative.message
      ? state.relative.message
      : from && hover && landing
        ? landingReadout(hover.ratio.text, hover.dir, from, landing)
        : null;
  return (
    <div
      ref={boxRef}
      className={classes.ringBox}
      style={{ '--ring-box-w': `${RING_BOX_REM}rem` } as CSSProperties}
    >
      <div className={classes.ringHead}>
        <span className={classes.ringCap}>
          <Tip k="pitchCircle">Pitch circle</Tip>
          <OutsideCount />
        </span>
        <Tip k="ringView" as="control">
          <SegmentedControl
            size="xs"
            aria-label="Ring view"
            value={view}
            onChange={(v) =>
              dispatch({ type: 'ui', patch: { ringView: v === 'fifths' ? 'fifths' : 'chromatic' } })
            }
            data={[
              { value: 'chromatic', label: 'Chromatic' },
              { value: 'fifths', label: 'Fifths' },
            ]}
          />
        </Tip>
        <span className={`${classes.ringHeadEnd} ${classes.inline}`}>
          {tab.gen.method === 'relative' && (
            <Tip k="relativeMenu" as="control">
              <Button
                size="compact-xs"
                variant={relativeOn ? 'filled' : 'default'}
                aria-pressed={relativeOn}
                onClick={() => setRelativeOn((on) => !on)}
              >
                Relative
              </Button>
            </Tip>
          )}
          <Tip k="ringMenu" as="control">
            <Popover position="bottom-end" width={220} transitionProps={{ duration: 0 }}>
              <Popover.Target>
                <ActionIcon variant="default" size="sm" aria-label="Ring menu">
                  <GearIcon />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <div className={classes.formStack}>
                  <TextInput
                    size="xs"
                    label="Generator (stacked)"
                    value={ringGen}
                    error={genOk ? undefined : 'Cannot read this interval; using 3/2'}
                    classNames={{ error: classes.inputError }}
                    description="3/2, 4/3, 701.96c or 7&#92;12"
                    onChange={(e) =>
                      dispatch({ type: 'ui', patch: { ringGen: e.currentTarget.value } })
                    }
                  />
                  <NativeSelect
                    size="xs"
                    label="Chain length"
                    data={CHAINS}
                    value={String(steps)}
                    onChange={(e) =>
                      dispatch({ type: 'ui', patch: { ringSteps: Number(e.currentTarget.value) } })
                    }
                  />
                </div>
              </Popover.Dropdown>
            </Popover>
          </Tip>
        </span>
      </div>
      <PitchRing
        view={view}
        steps={steps}
        dotProps={isRelative && relativeOn ? relativeDots : undefined}
      />
      {menuOpen && from && (
        <RelativeModal
          opened
          from={from}
          fromIdx={menuIdx}
          rep={base.rep}
          repC={base.repC}
          step={devOptions.relativeRingStep}
          mainPpu={mainPpu}
          hover={hover}
          onHover={(h) => {
            setHover(h);
            if (h && state.relative.message) {
              dispatch({ type: 'relative/dismiss' });
            }
          }}
          onPick={(h) => {
            const to = landingPitch(from, h.ratio.note, h.dir, base.rep);
            dispatch({ type: 'relative/add', text: noteText(to) });
          }}
          // the note goes and the modal closes on its own (its note is gone); 1/1 never reaches here (its modal has no Remove button, and the state refuses it with KEEP_UNISON)
          onRemove={() => dispatch({ type: 'relative/remove', index: menuIdx })}
          onClose={closeMenu}
          line={line}
          bandMode={bandMode}
          onBandMode={setBandMode}
          metaSets={metaSets}
          onMetaSets={setMetaSets}
          ringStart={ringStart}
          onRingStart={setRingStart}
          mode={relMode}
          onMode={setRelMode}
          monzoView={monzoView}
          onMonzoView={setMonzoView}
          monzo={state.relative.monzo}
          onMonzo={(prime, value) => {
            dispatch({ type: 'relative/monzo', prime, value });
            if (state.relative.message) {
              dispatch({ type: 'relative/dismiss' });
            }
          }}
          onMonzoReset={() => dispatch({ type: 'relative/monzoReset' })}
          onAdd={(text) => dispatch({ type: 'relative/add', text })}
          message={state.relative.message}
          onPreview={setRelLanding}
        />
      )}
    </div>
  );
}

const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

/** The row of the note pointed at (or pinned with Alt+click): a small readout card; dashes until something is pointed at. */
function Inspector() {
  const lab = useLab();
  const { field, repC } = lab.base;
  const rows = useMemo(() => fieldRowsOf(field, repC), [field, repC]);
  const i = lab.hover ?? lab.pin;
  const r = i === null ? null : (rows[i] ?? null);
  const dash = <span className={classes.kvName}>&ndash;</span>;
  return (
    <Tip k="inspector" as="control" block>
      <div className={classes.inspector} aria-live="polite">
        <div className={classes.inspHead}>
          {r ? (
            <>
              <Num>{r.ratio}</Num>
              {lab.pin === i && (
                <Tip k="unpinNote" as="control">
                  <button
                    type="button"
                    className={classes.pinBadge}
                    aria-label="Unpin this note"
                    onClick={() => lab.setPin(null)}
                  >
                    pinned
                  </button>
                </Tip>
              )}
            </>
          ) : (
            <span className={classes.kvName}>Point at a note (Alt+click pins it)</span>
          )}
        </div>
        <Row name="cents">{r ? <Num>{r.cents.toFixed(2)}</Num> : dash}</Row>
        <Row name="monzo">
          {r ? (
            <span role="img" aria-label={r.monzoName ?? 'monzo: none, an irrational note'}>
              <Num>{r.monzo}</Num>
            </span>
          ) : (
            dash
          )}
        </Row>
        <Row name="top / bottom">
          {r ? (
            <span role="img" aria-label={r.topBottomName ?? 'none, an irrational note'}>
              <Num>{r.topBottom ?? '—'}</Num>
            </span>
          ) : (
            dash
          )}
        </Row>
        <Row name="Tenney">{r ? <Num>{r.tenney ?? '—'}</Num> : dash}</Row>
        <Row name="12-EDO">{r ? <Num>{r.vs12}</Num> : dash}</Row>
        <Row name="vs JI">{r ? <Num>{r.vsJI}</Num> : dash}</Row>
      </div>
    </Tip>
  );
}

/** Glanceable basics beside the ring, and the note inspector. */
export function Stats() {
  const { base } = useLab();
  const { analysis, field } = base;
  return (
    <div className={classes.stats}>
      <div className={classes.statGrid}>
        <Row name={<Tip k="notes">Notes</Tip>}>
          <Num>
            {base.idx.length}/{field.length}
          </Num>
        </Row>
        <Row name={<Tip k="period">Period</Tip>}>
          <Num>{periodText(base.rep)}</Num>
        </Row>
        <Row name={<Tip k="stepPattern">Steps</Tip>}>
          <Num>{analysis ? analysis.N : '–'}</Num>
        </Row>
        <Row name={<Tip k="primeLimit">Prime limit</Tip>}>
          <Num>{analysis?.primeLimit ?? '–'}</Num>
        </Row>
        <Row name={<Tip k="meanTenney">Mean Tenney</Tip>}>
          <Num>{analysis?.meanTenney != null ? analysis.meanTenney.toFixed(2) : '–'}</Num>
        </Row>
      </div>
      <Inspector />
    </div>
  );
}

/** Beside the strip: the shape verdicts and the step-size bars (their letters are the ones under the strip). */
export function ShapeStats() {
  const { base } = useLab();
  const { analysis } = base;
  const sp = useMemo(() => spectrumOf(base), [base]);
  const maxStep = analysis ? Math.max(...analysis.groups.map((g) => g.size)) : 1;
  return (
    <div className={classes.side}>
      <section className={classes.sideBlock} aria-label="Shape">
        <h3 className={classes.sideHead}>
          <Tip k="shape">Shape</Tip>
        </h3>
        <Row name={<Tip k="propriety">Propriety</Tip>}>{sp ? sp.prop.verdict : '–'}</Row>
        <Row name={<Tip k="constantStructure">Const. structure</Tip>}>
          {sp ? (sp.cs.cs ? 'yes' : 'no') : '–'}
          {sp && !sp.cs.cs && sp.cs.example && (
            <Num muted>
              {' '}
              ({ordinal((sp.cs.example.ks[0] ?? 0) + 1)}/{ordinal((sp.cs.example.ks[1] ?? 0) + 1)})
            </Num>
          )}
        </Row>
        <Row name={<Tip k="variety">Variety</Tip>}>
          <Num>{sp?.spectrum[0]?.variety ?? '–'}</Num>
        </Row>
        <Row name={<Tip k="structure">Structure</Tip>}>
          {!analysis
            ? '–'
            : analysis.structure.kind === 'mos'
              ? `MOS ${analysis.structure.L}L ${analysis.structure.s}s`
              : analysis.structure.kind === 'equal'
                ? 'equal'
                : 'not MOS'}
        </Row>
      </section>
      <section className={classes.sideBlock} aria-label="Step sizes">
        <h3 className={classes.sideHead}>
          <Tip k="stepBars">Step sizes (c)</Tip>
        </h3>
        <ul className={classes.bars} aria-label="Step sizes">
          {analysis?.groups.map((g) => (
            <li key={g.letter} className={classes.barRow}>
              <Num muted>{g.letter}</Num>
              <span className={classes.barTrack}>
                <span
                  className={classes.sizeBar}
                  aria-hidden="true"
                  style={{ width: `${(g.size / maxStep) * 100}%` }}
                />
              </span>
              <Num>{g.size.toFixed(1)}</Num>
              <VisuallyHidden>cents, </VisuallyHidden>
              <Num muted>&times;{g.count}</Num>
            </li>
          ))}
        </ul>
      </section>
      <FieldCompact />
    </div>
  );
}

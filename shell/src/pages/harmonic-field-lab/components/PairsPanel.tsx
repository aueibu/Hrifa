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
import {
  ActionIcon,
  Modal,
  SegmentedControl,
  TextInput,
  useComputedColorScheme,
} from '@mantine/core';
import {
  pairCoverage,
  tintStrengths,
  wheelPositions,
  locateInterval,
  mod,
  stepsTable,
  type PairCell,
} from '../../../lib/harmonic-field';
import { MAX_PAIRS } from '../state/derive';
import { useLabDeveloperOptions } from '../state/developerOptions';
import type { PairsColor } from '../state/labState';
import { PAIRS_LABEL } from '../state/layout';
import { parseFind } from '../state/pairsFind';
import { sevTileStyle, strengthLevel, tileColors, tileStyle, wheelHue } from '../state/tileColors';
import { CloseIcon, ExpandIcon } from './icons';
import { Num, Row, SEV_LABEL, Strip, Tip, severity, useLab } from './ui';
import classes from './panels.module.css';

const COLOR_DATA = [
  { value: 'off', label: 'Off' },
  { value: 'error', label: 'Error' },
  { value: 'interval', label: 'Interval' },
];

const cellText = (c: PairCell): string => c.ratio ?? String(Math.round(c.c * 10) / 10);

interface CellProps {
  i: number;
  j: number;
  text: string;
  label: string;
  wrap: boolean;
  /** Error severity 0 to 4, or -1 when the coloring is not Error. */
  sev: number;
  /** The Interval tile's custom properties (fill, border, text and their dimmed versions), or undefined for none. */
  tile: CSSProperties | undefined;
  look: string;
  /** The Error tile's custom properties (from the severity). */
  sevStyle?: CSSProperties;
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
      data-sev={p.sev >= 0 ? p.sev : undefined}
      data-tint={p.tile ? 'wheel' : undefined}
      data-tile={p.tile || p.sev >= 0 ? p.look : undefined}
      style={p.tile ?? (p.sev >= 0 ? p.sevStyle : undefined)}
      data-match={p.match === 1 ? 'yes' : p.match === 2 ? 'no' : undefined}
      data-lit={p.lit}
      data-chord={p.chord}
      data-hot={p.hot}
      data-pin={p.pinned}
      data-wrap={p.wrap}
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
      <Num>{i + 1}</Num>
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
  return { pick, setPick, query, setQuery, tolText, setTolText };
}
type PairsUi = ReturnType<typeof usePairsUi>;

function PairsBody({ ui, big }: { ui: PairsUi; big?: boolean }) {
  const lab = useLab();
  const { base, an } = lab;
  const m = an.pairs;
  const ctx = useRef({ lab, m });
  ctx.current = { lab, m };
  const { pick, setPick, query, setQuery, tolText, setTolText } = ui;
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
    const str = tintStrengths(m, dev.intervalIntensity);
    return m.groups.map((g) =>
      tileStyle(
        tileColors(look, dev.tileOutline, strengthLevel(str[g.id]), wheelHue(pos[g.id]), scheme)
      )
    );
  }, [m, base.rep.c, dev.intervalColor, dev.intervalIntensity, dev.tileOutline, scheme, look]);
  const sevStyles = useMemo(
    () => [0, 1, 2, 3, 4].map((s) => sevTileStyle(look, dev.tileOutline, s, scheme)),
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

  const sevOfGroup = (g: number) => severity(Math.abs(m.groups[g].err));
  const cellLabel = (c: PairCell) =>
    `Degree ${c.from + 1} to degree ${c.to + 1}: ${cellText(c)}, ${c.c.toFixed(1)} c, ${c.k} ${c.k === 1 ? 'step' : 'steps'}${c.wrap ? ', up to the next repeat' : ''}`;
  const focusCell = focus ? m.cells[focus.i]?.[focus.j] : null;
  const rows = Array.from({ length: m.N }, (_, i) => i);

  return (
    <>
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
          <span className={classes.legend} aria-label="Error legend">
            {SEV_LABEL.map((n, i) => (
              <span key={n} className={classes.legendItem}>
                <span
                  className={classes.swatch}
                  data-sev={i}
                  data-tile={look}
                  style={sevStyles[i]}
                  aria-hidden="true"
                />
                {n}
              </span>
            ))}
          </span>
        )}
      </div>
      {color === 'error' && (
        <span className={classes.hint}>
          {`Distance of each interval from the nearest ratio of odd limit ${m.oddLimit} (the tuner strip's vs JI setting).`}
        </span>
      )}
      <h3 className={classes.familyHead}>
        Every pair of degrees
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
            gridTemplateColumns: `1.5rem repeat(${m.N}, minmax(${big ? 3.75 : 2.5}rem, max-content))`,
          }}
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
            />
          ))}
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
            />,
            ...rows.map((j) => {
              const c = m.cells[i][j];
              if (!c) {
                return <span key={`${i}.${j}`} className={classes.mxDiag} aria-hidden="true" />;
              }
              return (
                <Cell
                  key={`${i}.${j}`}
                  i={i}
                  j={j}
                  text={cellText(c)}
                  label={cellLabel(c)}
                  wrap={c.wrap}
                  sev={color === 'error' ? sevOfGroup(c.group) : -1}
                  tile={color === 'interval' ? tiles[c.group] : undefined}
                  sevStyle={sevStyles[sevOfGroup(c.group)]}
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
          ])}
        </div>
      </div>
      <span className={classes.hint} data-testid="matrix-status">
        {focusCell
          ? cellLabel(focusCell)
          : 'Point at a cell to read it; click it to hear it. An arrow marks an interval that wraps to the next repeat.'}
      </span>
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
                <td className={classes.err} data-sev={sevOfGroup(g.id)}>
                  <Num>{Math.abs(g.err) < 0.05 ? 'exact' : Math.abs(g.err).toFixed(1)}</Num>
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

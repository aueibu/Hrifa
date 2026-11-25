/**
 * The JI reach view (M10, H-43): which just intervals of an odd-limit diamond the selected subset can play, and how well.
 * Top: the limit and the tolerance, then one summary line per prime limit. Below: the target table (target, cents, the
 * best pair of any two notes with the count of pairs within the tolerance, and the note nearest the target above the
 * mode root); a click on a row with several pairs unfolds every pair within the tolerance, a row with one pair is that pair (a click plays it). Hovering a row or a pair lights its two notes on
 * the ring and sets the hold-1 preview target to that pair. The math is `state/jiReach.ts`, memoized on the subset, mode
 * root, limit and tolerance (never on hover).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { NativeSelect, Button } from '../../../ui';
import type { PreviewTarget } from '../audio/plan';
import {
  REACH_LIMITS,
  REACH_MAX_NOTES,
  REACH_TOL_MAX,
  REACH_TOL_MIN,
  isOctaveRepeat,
  reachCached,
  type ReachLine,
  type ReachPair,
} from '../state/jiReach';
import { signedErrorTextColor } from '../state/tileColors';
import { ChevronDownIcon } from './icons';
import { CommitNumber, Num, Tip, signedCents, useLab } from './ui';
import classes from './panels.module.css';

const arrow = (p: { fromDeg: number; toDeg: number; wrap: boolean }) =>
  `${p.fromDeg + 1}→${p.toDeg + 1}${p.wrap ? '↑' : ''}`;

/** A signed error in the lab's error colors (orange sharp, cyan flat), the number printed beside the color. */
function Err({ x }: { x: number | null | undefined }) {
  if (x === null || x === undefined) {
    return <Num muted>-</Num>;
  }
  return (
    <span className={classes.err} style={{ color: signedErrorTextColor(x) }}>
      <Num>{signedCents(x)}</Num>
    </span>
  );
}

const lineName = (l: ReachLine) => (l.overall ? `${l.limit}-limit` : `${l.limit}`);

export function ReachBody() {
  const lab = useLab();
  const { base } = lab;
  const { limit, tol } = lab.state.ui.reach;
  const setReach = (p: Partial<{ limit: number; tol: number }>) =>
    lab.dispatch({
      type: 'ui',
      patch: { reach: { limit, tol, ...p } as typeof lab.state.ui.reach },
    });
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const octave = isOctaveRepeat(base.repC);
  const tooBig = base.idx.length > REACH_MAX_NOTES;
  const notes = useMemo(() => base.idx.map((i) => base.field[i].c), [base.idx, base.field]);
  const reach = useMemo(
    () => (octave && !tooBig ? reachCached(notes, base.mode, limit, tol, base.repC) : null),
    [notes, base.mode, base.repC, limit, tol, octave, tooBig]
  );

  // The latest lab handles and the last target SET: a hovered row can go away (pop-out closed, view or tab switched) or its
  // pair can change under the pointer, so clearing goes by what was set and also happens on unmount (the same pattern as
  // CompositesPanel's useChordHover and the Chord library's lastTarget).
  const labRef = useRef(lab);
  labRef.current = lab;
  const lastTarget = useRef<PreviewTarget | null>(null);
  const clearHover = () => {
    if (lastTarget.current) {
      labRef.current.audio.clearPreviewTarget(lastTarget.current);
      lastTarget.current = null;
      labRef.current.setChord(null);
    }
  };
  const clearRef = useRef(clearHover);
  clearRef.current = clearHover;
  useEffect(() => () => clearRef.current(), []);

  const light = (p: ReachPair, ratio: string, targetCents: number) => {
    const a = base.idx[p.from];
    const b = base.idx[p.to];
    const lo = base.field[a].c;
    const scalePair = [lo, lo + p.cents];
    lab.setChord(new Set([a, b]));
    // holds 1 and 4 play the scale pair, hold 5 the pure pair built up from the lower note (the library rows' mechanism, M7e);
    // the key includes the target so two rows with the same best pair (12-EDO 6/5 and 7/6) are different previews
    const target: PreviewTarget = {
      kind: 'pitches',
      key: `reach:${ratio}:${a}.${b}`,
      cents: scalePair,
      variants: { own: scalePair, rounded: scalePair, exact: [lo, lo + targetCents] },
    };
    lastTarget.current = target;
    lab.audio.setPreviewTarget(target);
  };
  const unlight = () => clearHover();
  const play = (p: ReachPair) => {
    const lo = base.field[base.idx[p.from]].c;
    lab.audio.playCents([lo, lo + p.cents], [lo, lo + p.cents]);
  };
  const pairLabel = (p: ReachPair) =>
    `${base.ratios[base.idx[p.from]]} to ${base.ratios[base.idx[p.to]]}${p.wrap ? ', up to the next repeat' : ''}`;

  return (
    <>
      <div className={classes.vizTools}>
        <Tip k="reachLimit" as="control">
          <NativeSelect
            size="xs"
            aria-label="Odd limit"
            value={String(limit)}
            onChange={(e) => setReach({ limit: Number(e.currentTarget.value) })}
            data={REACH_LIMITS.map((l) => ({ value: String(l), label: `${l}-limit` }))}
            w={92}
          />
        </Tip>
        <Tip k="reachTol" as="control">
          <span className={classes.reachTol}>
            <span>Within</span>
            <CommitNumber
              size="xs"
              aria-label="Within (cents)"
              value={tol}
              min={REACH_TOL_MIN}
              max={REACH_TOL_MAX}
              allowDecimal
              onCommit={(t) => setReach({ tol: t })}
              w={64}
            />
            <span>c</span>
          </span>
        </Tip>
      </div>
      {!octave && (
        <span className={classes.hint} role="status" data-testid="reach-note">
          JI reach needs a repeat of 2/1; this field repeats at {base.repText}.
        </span>
      )}
      {tooBig && (
        <span className={classes.hint} role="status" data-testid="reach-note">
          {`The subset has ${base.idx.length} notes; JI reach shows up to ${REACH_MAX_NOTES}.`}
        </span>
      )}
      {reach && base.idx.length < 2 && (
        <span className={classes.hint} role="status" data-testid="reach-note">
          Select at least two notes to see which intervals they play.
        </span>
      )}
      {reach && (
        <>
          <table className={classes.spec} data-testid="reach-summary">
            <thead>
              <tr>
                <th>
                  <Tip k="reachSummary">Limit</Tip>
                </th>
                <th>Misfit</th>
                <th>Any two</th>
                <th>From root</th>
                <th>Worst</th>
              </tr>
            </thead>
            <tbody>
              {reach.lines.map((l) => (
                <tr key={`${l.limit}${l.overall}`} data-testid="reach-line">
                  <td>
                    <Num>{lineName(l)}</Num>
                  </td>
                  <td>
                    <Num>{l.misfit === null || l.overall ? '-' : l.misfit.toFixed(1)}</Num>
                  </td>
                  <td>
                    <Num>{`${l.within} of ${l.targets}`}</Num>
                  </td>
                  <td>
                    <Num>{`${l.withinRoot} of ${l.targets}`}</Num>
                  </td>
                  <td>
                    {l.worst ? (
                      <>
                        <Num muted>{l.worst.ratio} </Num>
                        <Err x={l.worst.error} />
                      </>
                    ) : (
                      <Num muted>-</Num>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={classes.vizTools}>
            <Tip k="reachExpandAll" as="control">
              <Button
                size="compact-xs"
                variant="default"
                aria-label="Expand all targets"
                onClick={() =>
                  setOpen(
                    new Set(reach.targets.filter((t) => t.pairs.length > 1).map((t) => t.ratio))
                  )
                }
              >
                Expand all
              </Button>
            </Tip>
            <Tip k="reachCollapseAll" as="control">
              <Button
                size="compact-xs"
                variant="default"
                aria-label="Collapse all targets"
                onClick={() => setOpen(new Set())}
              >
                Collapse all
              </Button>
            </Tip>
          </div>
          <table className={classes.spec} data-testid="reach-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Cents</th>
                <th>
                  <Tip k="reachAny">Any two notes</Tip>
                </th>
                <th>
                  <Tip k="reachRoot">From the root</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {reach.targets.flatMap((t) => {
                const b = t.best;
                const shown = t.pairs.length ? t.pairs : b ? [b] : [];
                // R20: a target with one entry is that pair itself (like a one-entry shape in the chord library): it does not unfold
                const foldable = shown.length > 1;
                const isOpen = foldable && open.has(t.ratio);
                const only = shown.length === 1 ? shown[0] : null;
                const rows = [
                  <tr
                    key={t.ratio}
                    data-testid="reach-row"
                    data-ratio={t.ratio}
                    className={shown.length > 0 ? classes.reachRow : undefined}
                    onMouseEnter={() => b && light(b, t.ratio, t.cents)}
                    onMouseLeave={() => b && unlight()}
                    onClick={() => {
                      if (only) {
                        play(only);
                      } else if (foldable) {
                        setOpen((s) => {
                          const n = new Set(s);
                          if (!n.delete(t.ratio)) {
                            n.add(t.ratio);
                          }
                          return n;
                        });
                      }
                    }}
                  >
                    <td>
                      {/* the whole row toggles or plays (a click on the button bubbles to it); the button is the keyboard control */}
                      <button
                        type="button"
                        className={classes.mxRowBtn}
                        aria-expanded={foldable ? isOpen : undefined}
                        aria-label={
                          foldable
                            ? `${t.ratio}: ${isOpen ? 'hide' : 'show'} the pairs`
                            : only
                              ? `${t.ratio}: play ${pairLabel(only)}`
                              : t.ratio
                        }
                        onFocus={only ? () => light(only, t.ratio, t.cents) : undefined}
                        onBlur={only ? () => unlight() : undefined}
                      >
                        <Num>{t.ratio}</Num>
                        {/* M10 look 2 (human): a row that unfolds shows a fold chevron right of its ratio */}
                        {foldable && (
                          <span
                            className={`${classes.foldChevron} ${classes.reachChevron}`}
                            data-folded={!isOpen}
                            aria-hidden="true"
                          >
                            <ChevronDownIcon />
                          </span>
                        )}
                      </button>
                    </td>
                    <td>
                      <Num muted>{t.cents.toFixed(1)}</Num>
                    </td>
                    <td data-testid="reach-any">
                      <Err x={b?.error} />
                      {b && <Num muted>{` ${arrow(b)} ×${t.pairs.length}`}</Num>}
                    </td>
                    <td data-testid="reach-root">
                      <Err x={t.root?.error} />
                      {t.root && <Num muted>{` ${t.root.toDeg + 1}`}</Num>}
                    </td>
                  </tr>,
                ];
                if (isOpen) {
                  shown.forEach((p, k) =>
                    rows.push(
                      <tr
                        key={`${t.ratio}:${p.from}.${p.to}`}
                        className={classes.reachPair}
                        data-testid="reach-pair"
                        data-from={p.fromDeg + 1}
                        data-to={p.toDeg + 1}
                        data-wrap={p.wrap}
                        data-outside={t.pairs.length === 0 ? true : undefined}
                        onMouseEnter={() => light(p, t.ratio, t.cents)}
                        onMouseLeave={() => unlight()}
                        onClick={() => play(p)}
                      >
                        <td colSpan={2}>
                          {/* the button makes the pair reachable by keyboard: focus previews like hover, Enter or Space plays */}
                          <button
                            type="button"
                            className={classes.mxRowBtn}
                            aria-label={pairLabel(p)}
                            onFocus={() => light(p, t.ratio, t.cents)}
                            onBlur={() => unlight()}
                          >
                            <Num muted>{`pair ${k + 1}`}</Num>
                          </button>
                        </td>
                        <td colSpan={2}>
                          <Err x={p.error} />
                          <Num muted>{` ${arrow(p)}`}</Num>
                        </td>
                      </tr>
                    )
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

/** Rail summary of the view: the chosen limit and how many of its targets some pair reaches. */
export function reachSummary(
  base: { idx: number[]; field: { c: number }[]; mode: number; repC: number },
  s: { limit: number; tol: number }
): string {
  if (!isOctaveRepeat(base.repC)) {
    return 'n/a';
  }
  if (base.idx.length > REACH_MAX_NOTES) {
    return 'too many';
  }
  const r = reachCached(
    base.idx.map((i) => base.field[i].c),
    base.mode,
    s.limit,
    s.tol,
    base.repC
  );
  const l = r.lines[r.lines.length - 1];
  return `${s.limit}-limit ${l.within}/${l.targets}`;
}

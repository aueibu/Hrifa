/**
 * M8o D23: the legend of the picker's Color menu, under the Color select (in `RelativeColorControls`, so the Near panel and the Rings
 * and Monzo panel both show it). Prime: one chip per prime in the open view, in the same tile look as the cells. Tenney, Odd limit,
 * Roughness: a bar sampled from the function that colors the cells, with its end values and the strong end named. Error: the lab's
 * signed error strip (`SignedErrorLegend`, fixed to the bands). Interval class: 12 chips. Off: nothing.
 *
 * Memoized: the parent hands it the hovered interval as ONE value (`mark`, rebuilt only when the hovered interval changes), so a
 * pointer move over a cell redraws this small component and never the ring.
 */
import { memo, useMemo } from 'react';
import {
  FIRST_DOZEN_PRIMES,
  INTERVAL_CLASSES,
  intervalClassTints,
  legendBounds,
  legendNumber,
  primeTint,
  shadeBarColors,
  strongEndOf,
  tintVars,
  type Bounds,
  type LegendMark,
  type RelColorMetric,
  type TintContext,
} from '../state/intervalColor';
import { SignedErrorLegend } from './SignedErrorLegend';
import { Tip } from './ui';
import classes from './relativeMenu.module.css';

export interface RelativeColorLegendProps {
  metric: RelColorMetric;
  /** The bounds of the shaded ramps (null: the fixed ones). */
  bounds: Bounds | null;
  intensity: TintContext['intensity'];
  look: TintContext['look'];
  outline: boolean;
  scheme: TintContext['scheme'];
  /** The primes present in the open view (Prime). */
  primes: readonly number[];
  /** The hovered interval's place on the legend (null: none). */
  mark: LegendMark | null;
}

/** A bar of hard-edged color steps, left to right. */
function stepsGradient(colors: readonly string[]): string {
  const w = 100 / colors.length;
  return `linear-gradient(to right, ${colors
    .map((c, i) => `${c} ${i * w}% ${(i + 1) * w}%`)
    .join(', ')})`;
}

function Bar({ colors, mark }: { colors: readonly string[]; mark: LegendMark | null }) {
  const m = mark?.kind === 'pos' ? mark : null;
  return (
    <div
      className={classes.legendBar}
      style={{ background: stepsGradient(colors) }}
      data-testid="relative-legend-bar"
    >
      {m && (
        <span
          className={classes.legendTick}
          style={{ left: `${m.pos * 100}%` }}
          data-beyond={m.beyond === 0 ? undefined : m.beyond}
          data-testid="relative-legend-tick"
        />
      )}
    </div>
  );
}

function RelativeColorLegendView({
  metric,
  bounds,
  intensity,
  look,
  outline,
  scheme,
  primes,
  mark,
}: RelativeColorLegendProps) {
  const ctx = useMemo(() => ({ look, outline, scheme }), [look, outline, scheme]);
  const key = mark?.kind === 'key' ? mark.key : null;
  const chips = useMemo(() => {
    if (metric === 'prime') {
      return (primes.length ? primes : FIRST_DOZEN_PRIMES).map((p) => ({
        id: String(p),
        label: String(p),
        value: p,
        tint: primeTint(p, ctx),
      }));
    }
    if (metric === 'interval') {
      return intervalClassTints(ctx).map((tint, k) => ({
        id: INTERVAL_CLASSES[k],
        label: INTERVAL_CLASSES[k],
        value: k,
        tint,
      }));
    }
    return null;
  }, [metric, primes, ctx]);
  const bar = useMemo(
    () => (legendBounds(metric, bounds) ? shadeBarColors({ ...ctx, intensity }) : null),
    [metric, bounds, ctx, intensity]
  );
  if (metric === 'off') {
    return null;
  }
  const b = legendBounds(metric, bounds);
  return (
    <Tip k="relColorLegend" as="control" block>
      <div className={classes.colorLegend} data-testid="relative-color-legend" data-metric={metric}>
        {chips && (
          <div className={classes.metaLegend}>
            {chips.map((c) => (
              <span
                key={c.id}
                className={classes.legendChip}
                style={tintVars(c.tint)}
                data-hover={key === c.value ? 'true' : undefined}
                data-testid="relative-legend-chip"
              >
                {c.label}
              </span>
            ))}
            {metric === 'prime' && primes.some((p) => p > 41) && (
              <span className={classes.metaLegendNote}>43+ repeat the hues, fainter per dozen</span>
            )}
          </div>
        )}
        {bar && <Bar colors={bar} mark={mark} />}
        {metric === 'error' && (
          <SignedErrorLegend
            look={look}
            outline={outline}
            scheme={scheme}
            label="Error vs 12-EDO"
            mark={mark?.kind === 'error' ? mark.cents : null}
          />
        )}
        {bar && b && (
          <>
            <div className={classes.legendEnds}>
              <span>{legendNumber(metric, b.lo)} simple</span>
              <span>{legendNumber(metric, b.hi)} complex</span>
            </div>
            <div className={classes.metaNote}>Strong end: {strongEndOf(intensity)}</div>
          </>
        )}
      </div>
    </Tip>
  );
}

export const RelativeColorLegend = memo(RelativeColorLegendView);

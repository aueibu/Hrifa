/**
 * M8o D23 + M9c: the legend of the picker's Color menu, under the Brightness select (in `RelativeColorControls`, so the Near panel and
 * the Rings and Monzo panel both show it). Two parts, each drawn only while its channel is on:
 * - the HUE legend: Prime, one chip per prime in the open view; Interval class, 12 chips; Error sign, the lab's signed error strip
 *   (`SignedErrorLegend`) when the Brightness is the error size (strip = sign and size), else three chips (flat, exact, sharp);
 * - the BRIGHTNESS bar: sampled from the function that colors the cells (the blue ramp, or a neutral ramp when a Hue is set), with
 *   its end values and the strong end named. The error size bar has one segment per band.
 *
 * Memoized: the parent hands it the hovered interval as ONE value (`mark`, rebuilt only when the hovered interval changes), so a
 * pointer move over a cell redraws this small component and never the ring.
 */
import { memo, useMemo } from 'react';
import {
  FIRST_DOZEN_PRIMES,
  INTERVAL_CLASSES,
  barEndWords,
  brightBarColors,
  errorSignTints,
  hueBarColors,
  hueMeasure,
  intervalClassTints,
  legendBounds,
  legendNumber,
  primeTint,
  strongEndOf,
  tintVars,
  type Bounds,
  type LegendMarks,
  type RelBright,
  type RelHue,
  type RelMetric,
  type TintContext,
} from '../state/intervalColor';
import { SignedErrorLegend } from './SignedErrorLegend';
import { Tip } from './ui';
import classes from './relativeMenu.module.css';

export interface RelativeColorLegendProps {
  hue: RelHue;
  bright: RelBright;
  /** The bounds of the Brightness ramp (null: the fixed ones). */
  bounds: Bounds | null;
  /** The bounds of a measure on Hue (null: the fixed ones). */
  hueBounds?: Bounds | null;
  intensity: TintContext['intensity'];
  look: TintContext['look'];
  outline: boolean;
  scheme: TintContext['scheme'];
  /** The primes present in the open view (Prime). */
  primes: readonly number[];
  /** The hovered interval's place on the legends (null: none). */
  mark: LegendMarks | null;
  /** Entropy: a curve is being built (the first one: the cells are plain; a rebuild: the old curve is kept). */
  building?: boolean;
}

/** A bar of hard-edged color steps, left to right. */
function stepsGradient(colors: readonly string[]): string {
  const w = 100 / colors.length;
  return `linear-gradient(to right, ${colors
    .map((c, i) => `${c} ${i * w}% ${(i + 1) * w}%`)
    .join(', ')})`;
}

function Bar({
  colors,
  mark,
  testId = 'relative-legend-bar',
  tickTestId = 'relative-legend-tick',
}: {
  colors: readonly string[];
  mark: LegendMarks['bright'] | undefined;
  testId?: string;
  tickTestId?: string;
}) {
  const m = mark?.kind === 'pos' ? mark : null;
  return (
    <div
      className={classes.legendBar}
      style={{ background: stepsGradient(colors) }}
      data-testid={testId}
    >
      {m && (
        <span
          className={classes.legendTick}
          style={{ left: `${m.pos * 100}%` }}
          data-beyond={m.beyond === 0 ? undefined : m.beyond}
          data-testid={tickTestId}
        />
      )}
    </div>
  );
}

/** A bar with its end values and the strong end (a measure on Hue or Brightness). */
function BarBlock({
  title,
  measure,
  colors,
  mark,
  bounds,
  intensity,
  testId,
  tickTestId,
}: {
  /** Shown above the bar when two bars stack. */
  title: string | null;
  measure: RelMetric;
  colors: readonly string[];
  mark: LegendMarks['bright'] | undefined;
  bounds: Bounds | null;
  intensity: TintContext['intensity'];
  testId?: string;
  tickTestId?: string;
}) {
  const b = legendBounds(measure, bounds);
  const [simpleWord, complexWord] = barEndWords(measure);
  return (
    <>
      {title && <div className={classes.metaNote}>{title}</div>}
      <Bar colors={colors} mark={mark} testId={testId} tickTestId={tickTestId} />
      {b && (
        <>
          <div className={classes.legendEnds}>
            <span>
              {legendNumber(measure, b.lo)} {simpleWord}
            </span>
            <span>
              {legendNumber(measure, b.hi)} {complexWord}
            </span>
          </div>
          <div className={classes.metaNote}>
            {measure === 'errorSize'
              ? 'Strong end: large error'
              : `Strong end: ${strongEndOf(intensity)}`}
          </div>
        </>
      )}
    </>
  );
}

function RelativeColorLegendView({
  hue,
  bright,
  bounds,
  hueBounds = null,
  intensity,
  look,
  outline,
  scheme,
  primes,
  mark,
  building,
}: RelativeColorLegendProps) {
  const ctx = useMemo(() => ({ look, outline, scheme }), [look, outline, scheme]);
  const hueMark = mark?.hue ?? null;
  // a hovered key: the prime, the interval class, or (Error sign chips) the sign -1, 0, 1
  const key =
    hueMark?.kind === 'key'
      ? hueMark.key
      : hueMark?.kind === 'error'
        ? Math.sign(Math.abs(hueMark.cents) < 1e-9 ? 0 : hueMark.cents)
        : null;
  const strip = hue === 'errorSign' && bright === 'errorSize';
  const chips = useMemo(() => {
    if (hue === 'prime') {
      return (primes.length ? primes : FIRST_DOZEN_PRIMES).map((p) => ({
        id: String(p),
        label: String(p),
        value: p,
        tint: primeTint(p, ctx),
      }));
    }
    if (hue === 'interval') {
      return intervalClassTints(ctx).map((tint, k) => ({
        id: INTERVAL_CLASSES[k],
        label: INTERVAL_CLASSES[k],
        value: k,
        tint,
      }));
    }
    if (hue === 'errorSign' && !strip) {
      return errorSignTints(ctx).map((c) => ({
        id: c.label,
        label: c.label,
        value: c.key,
        tint: c.tint,
      }));
    }
    return null;
  }, [hue, strip, primes, ctx]);
  const barOn = bright !== 'off' && !strip;
  const bar = useMemo(
    () => (barOn ? brightBarColors({ ...ctx, hue, bright, intensity }) : null),
    [barOn, hue, bright, ctx, intensity]
  );
  // F14: a measure on Hue is its own bar (the ramp), stacked above the Brightness bar
  const hueMeasureOf = hueMeasure(hue);
  const hueBar = useMemo(
    () => (hueMeasureOf ? hueBarColors({ ...ctx, hue, intensity }) : null),
    [hueMeasureOf, hue, ctx, intensity]
  );
  if (hue === 'off' && bright === 'off') {
    return null;
  }
  const brightMeasure = bright === 'off' ? null : (bright as RelMetric);
  const stacked = hueMeasureOf !== null && bar !== null;
  return (
    <Tip k="relColorLegend" as="control" block>
      <div
        className={classes.colorLegend}
        data-testid="relative-color-legend"
        data-hue={hue}
        data-bright={bright}
      >
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
            {hue === 'prime' && primes.some((p) => p > 41) && (
              <span className={classes.metaLegendNote}>43+ repeat the hues, fainter per dozen</span>
            )}
          </div>
        )}
        {strip && (
          <SignedErrorLegend
            look={look}
            outline={outline}
            scheme={scheme}
            label="Error vs 12-EDO"
            mark={hueMark?.kind === 'error' ? hueMark.cents : null}
          />
        )}
        {hueBar && hueMeasureOf && (
          <BarBlock
            title={stacked ? 'Hue' : null}
            measure={hueMeasureOf}
            colors={hueBar}
            mark={mark?.hue?.kind === 'pos' ? mark.hue : undefined}
            bounds={hueBounds}
            intensity={intensity}
            testId="relative-legend-hue-bar"
            tickTestId="relative-legend-hue-tick"
          />
        )}
        {bar && brightMeasure && (
          <BarBlock
            title={stacked ? 'Brightness' : null}
            measure={brightMeasure}
            colors={bar}
            mark={mark?.bright}
            bounds={bounds}
            intensity={intensity}
          />
        )}
        {(bright === 'entropy' || hue === 'entropy') && building && (
          <div className={classes.metaNote} data-testid="relative-legend-building">
            Building entropy…
          </div>
        )}
      </div>
    </Tip>
  );
}

export const RelativeColorLegend = memo(RelativeColorLegendView);

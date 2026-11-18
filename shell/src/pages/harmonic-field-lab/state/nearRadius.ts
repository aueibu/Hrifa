/**
 * M9c (H-40): the RADIUS channel of the Near meta ring, pure (no React). Near's radius used to be a two-way toggle (Odd limit or
 * Tenney); it is now any of the Brightness measures: each supplies its value per ratio (`radiusValue`), the round values of the
 * complexity rings (`radiusRingValues`) and their label (`radiusRingLabel`), and how the Scale switch transforms it
 * (`radiusScaleValue`). The ratios that exist (the Ceiling, an odd limit) and the Span do not depend on the radius; only the order the
 * 3500-dot cap keeps does (`radiusOrder`).
 */
import type { NearOrder, NearRatio } from '../../../lib/harmonic-field';
import { metricValue, type EntropySource, type RelRadius } from './intervalColor';

export type RadiusScale = 'linear' | 'log' | 'even';

/** The Radius choices' labels, in the menu's order. */
export const RADIUS_LABELS: Record<RelRadius, string> = {
  tenney: 'Tenney',
  odd: 'Odd limit',
  roughness: 'Roughness',
  entropy: 'Harmonic entropy',
  errorSize: '|error| vs 12-EDO',
};

/** The unit word a radius metric's value is printed with (the Scale hint and the help text). */
export const RADIUS_UNITS: Record<RelRadius, string> = {
  tenney: 'log2 of n x d',
  odd: 'the larger odd part',
  roughness: 'dyad roughness',
  entropy: 'nats',
  errorSize: 'cents',
};

/**
 * The value that places a near ratio on the radius. Entropy needs its curve (`he`); without one it is 0 (the caller falls back to
 * Tenney until the curve exists, see `effectiveRadius`).
 */
export function radiusValue(
  radius: RelRadius,
  r: Pick<NearRatio, 'note' | 'odd' | 'tenney'>,
  he?: EntropySource | null
): number {
  if (radius === 'tenney') {
    return r.tenney;
  }
  if (radius === 'odd') {
    return r.odd;
  }
  return metricValue(radius, r.note, he) ?? 0;
}

/**
 * M9c F10: the share of the radius (rMin to rMax) that the values BELOW the Entropy Fixed bounds (the unison and octave dips, which the
 * bounds leave out) are drawn in, so the dip is still plotted, inward past the innermost labeled ring, down to rMin (which already
 * clears the center ring and its labels). The values from the bounds up use the rest, so the ring labels and the dots of 3/2, 5/4, 7/4
 * keep their own, wider scale.
 */
export const RADIUS_DIP_SHARE = 0.2;

/**
 * The value where the main radius scale starts (Entropy only): the Fixed bounds' low end, when the dots reach below it and the dots'
 * range [lo, hi] has room above it; otherwise undefined (one scale from lo to hi, as for every other radius).
 */
export function radiusFloor(
  radius: RelRadius,
  he: EntropySource | null | undefined,
  lo: number,
  hi: number
): number | undefined {
  return radius === 'entropy' && he && he.lo > lo && he.lo < hi ? he.lo : undefined;
}

/** The radius actually drawn: Entropy waits for its curve (Tenney meanwhile), so a half-built state never mixes two scales. */
export const effectiveRadius = (radius: RelRadius, heReady: boolean): RelRadius =>
  radius === 'entropy' && !heReady ? 'tenney' : radius;

/** What the dot cap keeps first: the odd limit radius keeps the lowest odd limits, every other one the lowest Tenney height. */
export const radiusOrder = (radius: RelRadius): NearOrder => (radius === 'odd' ? 'odd' : 'tenney');

/**
 * The radius transform, one function for the dots, the highlight and the rings. Linear: v. Log: log(1 + v). Even: for Tenney the
 * count-like size 2^(v/2) = sqrt(n x d), so the dots spread evenly; the other measures have no count-like size (the odd limit already
 * grows about with the radius), so for them Even is Linear.
 */
export function radiusScaleValue(radius: RelRadius, scale: RadiusScale, v: number): number {
  if (scale === 'log') {
    return Math.log(1 + Math.max(0, v));
  }
  if (scale === 'even' && radius === 'tenney') {
    return 2 ** (v / 2);
  }
  return v;
}

/** Odd limits the complexity rings of the odd limit radius can sit on. */
const ODD_RING_VALUES = [7, 15, 31, 63, 127, 255, 511];
/** About how many rings a continuous radius (roughness, entropy, error size) is cut into before the pixel thinning. */
const ROUND_RING_TARGET = 8;

/** A round step (1, 2 or 5 times a power of ten) that cuts `span` into about `ROUND_RING_TARGET` parts. */
function roundStep(span: number): number {
  const raw = span / ROUND_RING_TARGET;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

/**
 * The round values the complexity rings may sit on inside the drawn range [lo, hi] (the caller thins them by pixel distance):
 * Tenney every whole number; the odd limit 7, 15, 31, ... and the outermost value; Roughness, Entropy and the error size multiples of a
 * round step (1, 2, 5 x 10^k) that gives about eight rings.
 */
export function radiusRingValues(radius: RelRadius, lo: number, hi: number): number[] {
  if (radius === 'odd') {
    const out = ODD_RING_VALUES.filter((v) => v >= lo && v <= hi);
    return out.includes(hi) ? out : [...out, hi];
  }
  const out: number[] = [];
  if (radius === 'tenney') {
    for (let v = Math.ceil(lo); v <= Math.floor(hi); v++) {
      out.push(v);
    }
    return out;
  }
  if (!(hi > lo)) {
    return out;
  }
  const step = roundStep(hi - lo);
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) {
    out.push(Math.round(k * step * 1e6) / 1e6 || 0);
  }
  return out;
}

/** The ring label of a value: `T7` (Tenney), `o15` (odd limit), `R0.50` (roughness), `H1.20` (entropy, nats), `12c` (error size). */
export function radiusRingLabel(radius: RelRadius, v: number): string {
  switch (radius) {
    case 'tenney':
      return `T${v}`;
    case 'odd':
      return `o${v}`;
    case 'roughness':
      return `R${v.toFixed(2)}`;
    case 'entropy':
      return `H${v.toFixed(2)}`;
    case 'errorSize':
      return `${Math.round(v * 10) / 10}c`;
  }
}

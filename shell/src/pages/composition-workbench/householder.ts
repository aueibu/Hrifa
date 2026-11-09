/**
 * Rhythm Householder: alters an inter-onset rhythm along a chosen bias axis while keeping its
 * attack count and total span. Two modes:
 *
 * - Reflect (duration space). The duration vector d is reflected across the hyperplane
 *   orthogonal to a zero-sum axis q:  d' = d + (c − 1)·(q·d / q·q)·q.
 *   c = −1 is the exact Householder reflection, c = 0 removes the axis component, c = 1 is the
 *   identity. Because Σq = 0 the total span is preserved by construction, and every component
 *   orthogonal to q is untouched. (q = e_i − e_j swaps two durations, so permutations are
 *   products of these reflections.)
 * - Metric (onset slots). Attacks sit on a slot grid; each enabled axis measures where they
 *   land (against an accent pattern, or early/late in the span). The search looks for the
 *   attack set whose bias is closest to c × the input's bias — clamped to what the rhythm
 *   length can actually reach — while staying near the input's attacks.
 *
 * This replaces an older C# implementation whose greedy search barely depended on the input
 * rhythm, and whose reflected onset field was dominated by the input's own spikes.
 */

import { packet, type DataItem, type DataPacket, type PacketFrame } from './model';
import { rhythmOrigin } from './rhythmFrame';

export type HouseholderMode = 'reflect' | 'metric';
export type ReflectAxisPreset = 'trend' | 'swing' | 'arch' | 'custom';
export type MetricAxisKey = 'accent' | 'position';

const EPS = 1e-9;
/** Above this many valid attack sets, Metric mode switches from exhaustive search to local search. */
export const EXHAUSTIVE_LIMIT = 100_000;

export interface MetricAxisReport {
  key: MetricAxisKey;
  label: string;
  input: number;
  target: number;
  realized: number;
  min: number;
  max: number;
  /** The requested target (coefficient × input) was outside [min, max] and was clamped. */
  clamped: boolean;
}

export interface HouseholderCandidate {
  /** Durations in the input's own unit (units / grid). */
  durations: number[];
  /** Durations in integer grid steps. */
  units: number[];
  score: number;
  /** Sum of attack displacements versus the input, in grid steps (j-th attack vs j-th attack). */
  movement: number;
  isInput: boolean;
  /**
   * Where the candidate's first attack sits in the frame, in the input's unit and in grid steps.
   * Absent (Reflect mode) means "same start as the input".
   */
  origin?: number;
  originUnits?: number;
  /** Metric mode: share of attack pairs whose distance changed versus the input (0 to 1). */
  identityChange?: number;
  /** Reflect mode: the coefficient this candidate was asked for, and what rounding delivered. */
  coefficient?: number;
  realizedCoefficient?: number;
  /** Metric mode: per-axis bias report. */
  axes?: MetricAxisReport[];
}

export interface HouseholderResult {
  candidates: HouseholderCandidate[];
  inputUnits: number[];
  warnings: string[];
  error?: string;
  /** Metric mode: how the candidates were found. */
  search?: 'exhaustive' | 'local';
}

function failure(error: string, inputUnits: number[] = []): HouseholderResult {
  return { candidates: [], inputUnits, warnings: [], error };
}

// ---------------------------------------------------------------------------------------------
// Shared helpers

/** Converts durations to integer grid steps, or explains why they don't fall on the grid. */
export function toGridUnits(
  durations: number[],
  grid: number
): { units: number[] } | { error: string } {
  if (!Number.isInteger(grid) || grid < 1) {
    return { error: 'Grid subdivision must be a positive whole number.' };
  }
  const units: number[] = [];
  for (const duration of durations) {
    if (!Number.isFinite(duration) || duration <= 0) {
      return { error: `Duration ${duration} is not a positive number.` };
    }
    const scaled = duration * grid;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 1e-6) {
      return {
        error: `Duration ${duration} doesn't fall on a 1/${grid} grid. Raise the grid subdivision.`,
      };
    }
    units.push(rounded);
  }
  return { units };
}

function dot(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function onsetsFromUnits(units: number[]) {
  const onsets: number[] = [];
  let at = 0;
  for (const unit of units) {
    onsets.push(at);
    at += unit;
  }
  return onsets;
}

function l1(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum;
}

function sameList(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function compareLexicographic(a: number[], b: number[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

/**
 * Nearest point (Euclidean) to x with every entry ≥ floor and the same total — a projection
 * onto a shifted simplex. Used when an exact reflection would push a duration below the minimum.
 */
export function projectToFloor(x: number[], floor: number, total: number): number[] {
  const budget = total - floor * x.length;
  const y = x.map((value) => value - floor);
  const sorted = [...y].sort((left, right) => right - left);
  let cumulative = 0;
  let theta = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i];
    const candidate = (cumulative - budget) / (i + 1);
    if (sorted[i] - candidate > 0) {
      theta = candidate;
    }
  }
  return y.map((value) => Math.max(value - theta, 0) + floor);
}

/**
 * Rounds real durations to whole grid steps with the exact same total (largest-remainder
 * rounding). Entries already ≥ an integer floor stay ≥ that floor.
 */
export function roundPreservingTotal(x: number[], total: number, floor = 1): number[] {
  const floors = x.map((value) => Math.max(floor, Math.floor(value + EPS)));
  let deficit = total - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = x
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let i = 0; deficit > 0 && byRemainder.length; i = (i + 1) % byRemainder.length) {
    floors[byRemainder[i].index] += 1;
    deficit -= 1;
  }
  // Only reachable through floating-point noise: take back from the smallest remainders first.
  for (let i = byRemainder.length - 1; deficit < 0 && i >= 0; i -= 1) {
    const index = byRemainder[i].index;
    if (floors[index] > floor) {
      floors[index] -= 1;
      deficit += 1;
    }
  }
  return floors;
}

// ---------------------------------------------------------------------------------------------
// Reflect mode

/** Raw (uncentered) axis values over event index 0..k-1 for a preset. */
export function reflectAxisPreset(
  preset: Exclude<ReflectAxisPreset, 'custom'>,
  k: number
): number[] {
  return Array.from({ length: k }, (_, index) => {
    if (preset === 'trend') {
      return index;
    }
    if (preset === 'swing') {
      return index % 2 === 0 ? 1 : -1;
    }
    const middle = (k - 1) / 2;
    return -((index - middle) ** 2);
  });
}

export const reflectAxisLabels: Record<ReflectAxisPreset, string> = {
  trend: 'Trend (lengthening ↔ shortening)',
  swing: 'Swing (long-short ↔ short-long)',
  arch: 'Arch (long middle ↔ long edges)',
  custom: 'Custom contour',
};

export interface ReflectOptions {
  durations: number[];
  /** Raw axis contour over event index; cycled to the rhythm's length and centered. */
  axis: number[];
  /** −1 reflects, 0 neutralizes, 1 keeps; values beyond ±1 exaggerate. */
  coefficient: number;
  grid: number;
  minUnits: number;
  /** How many morph steps from the input to the requested coefficient go into the bank. */
  steps: number;
}

export function reflectRhythm(options: ReflectOptions): HouseholderResult {
  const converted = toGridUnits(options.durations, options.grid);
  if ('error' in converted) {
    return failure(converted.error);
  }
  const units = converted.units;
  const k = units.length;
  const total = units.reduce((sum, value) => sum + value, 0);
  const minUnits = Math.max(1, Math.floor(options.minUnits));
  if (k < 2) {
    return failure('Reflection needs at least two attacks.', units);
  }
  if (k * minUnits > total) {
    return failure(`${k} attacks of at least ${minUnits} grid steps don't fit in ${total}.`, units);
  }
  if (!options.axis.length || options.axis.some((value) => !Number.isFinite(value))) {
    return failure('The axis needs at least one finite number.', units);
  }

  const warnings: string[] = [];
  if (options.axis.length !== k) {
    warnings.push(`Axis has ${options.axis.length} values; cycled across ${k} attacks.`);
  }
  const cycled = Array.from({ length: k }, (_, index) => options.axis[index % options.axis.length]);
  const axisMean = mean(cycled);
  const q = cycled.map((value) => value - axisMean);
  const qq = dot(q, q);
  if (qq < EPS) {
    return failure(
      'The axis is constant across these attacks, so there is nothing to reflect.',
      units
    );
  }
  const alpha = dot(q, units) / qq;
  if (Math.abs(alpha) < EPS) {
    warnings.push('The input has no component along this axis; reflection leaves it unchanged.');
  }

  const steps = Math.max(1, Math.floor(options.steps));
  const seen = new Set<string>();
  const candidates: HouseholderCandidate[] = [];
  let projectedFinal = false;
  // Strongest first: index 0 is the requested coefficient, later entries morph back toward the input.
  for (let step = steps; step >= 1; step -= 1) {
    const coefficient = 1 + ((options.coefficient - 1) * step) / steps;
    const exact = units.map((value, index) => value + (coefficient - 1) * alpha * q[index]);
    const belowFloor = exact.some((value) => value < minUnits - EPS);
    const feasible = belowFloor ? projectToFloor(exact, minUnits, total) : exact;
    if (step === steps) {
      projectedFinal = belowFloor;
    }
    const rounded = roundPreservingTotal(feasible, total, minUnits);
    const key = rounded.join(',');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const realizedCoefficient = Math.abs(alpha) < EPS ? 1 : dot(q, rounded) / qq / alpha;
    candidates.push({
      units: rounded,
      durations: rounded.map((value) => value / options.grid),
      coefficient,
      realizedCoefficient,
      score: Math.abs(realizedCoefficient - coefficient),
      movement: l1(onsetsFromUnits(rounded), onsetsFromUnits(units)),
      isInput: sameList(rounded, units),
    });
  }

  if (candidates[0].isInput && Math.abs(alpha) >= EPS && options.coefficient !== 1) {
    warnings.push(
      'The input has very little of this axis: every duration changes by less than half a grid step, ' +
        'so rounding returns the input. Try a finer grid or another axis.'
    );
  } else if (projectedFinal) {
    warnings.push(
      `The exact reflection would push some durations below ${minUnits} grid step${minUnits === 1 ? '' : 's'}; ` +
        `used the nearest valid rhythm (realized coefficient ${candidates[0].realizedCoefficient!.toFixed(2)}).`
    );
  }
  return { candidates, inputUnits: units, warnings };
}

// ---------------------------------------------------------------------------------------------
// Metric mode

export interface MetricAxisSpec {
  key: MetricAxisKey;
  enabled: boolean;
  /** Accent: per-slot weights, repeating. Ignored for position. */
  pattern?: number[];
  coefficient: number;
  weight: number;
}

export interface MetricOptions {
  durations: number[];
  grid: number;
  minUnits: number;
  axes: MetricAxisSpec[];
  /** Penalty weight on attack movement (per whole span moved). */
  closeness: number;
  /** Penalty weight on change in interval content (0 = rhythm keeps every pairwise distance). */
  identity?: number;
  /** Loop (default) or linear frame. Loops wrap gaps and interval content around the cycle. */
  cyclic?: boolean;
  /** Where the input's first attack sits in the frame, in the input's unit (see rhythmFrame.ts). */
  origin?: number;
  /** Keep the first attack where the input's is (default), or let the search move the start. */
  pinStart?: boolean;
  maxCandidates: number;
}

/**
 * The rhythm's interval content: how many attack pairs lie at each distance (Toussaint's
 * "interval vector" for rhythms, the analogue of a pitch-class set's interval-class vector).
 * In a cyclic frame distances wrap, so rotating a rhythm leaves it unchanged — which is what
 * lets a displaced rhythm count as "the same rhythm" even though every attack moved.
 */
export function intervalContent(onsets: number[], total: number, cyclic: boolean): number[] {
  const histogram = new Array<number>(cyclic ? Math.floor(total / 2) + 1 : total).fill(0);
  for (let i = 0; i < onsets.length; i += 1) {
    for (let j = i + 1; j < onsets.length; j += 1) {
      const distance = Math.abs(onsets[j] - onsets[i]);
      histogram[cyclic ? Math.min(distance, total - distance) : distance] += 1;
    }
  }
  return histogram;
}

/** Share of attack pairs whose distance changed, from 0 (same interval content) to 1. */
export function identityChange(reference: number[], candidate: number[], pairs: number) {
  return pairs ? l1(reference, candidate) / (2 * pairs) : 0;
}

export const metricAxisLabels: Record<MetricAxisKey, string> = {
  accent: 'Accent',
  position: 'Early / late',
};

interface ActiveAxis {
  key: MetricAxisKey;
  values: number[];
  weight: number;
  width: number;
  report: Omit<MetricAxisReport, 'realized'>;
}

/** Number of ways to split `total` into `k` parts each ≥ m, capped once it exceeds `cap`. */
export function compositionCount(
  total: number,
  k: number,
  m: number,
  cap = Number.MAX_SAFE_INTEGER
) {
  const n = total - k * m + k - 1;
  const r = k - 1;
  if (n < r || r < 0) {
    return 0;
  }
  let count = 1;
  for (let i = 1; i <= r; i += 1) {
    count = (count * (n - r + i)) / i;
    if (count > cap) {
      return cap + 1;
    }
  }
  return Math.round(count);
}

function axisValues(spec: MetricAxisSpec, slots: number): number[] | undefined {
  if (spec.key === 'position') {
    return Array.from({ length: slots }, (_, slot) => slot / slots);
  }
  const pattern = spec.pattern ?? [];
  if (!pattern.length || pattern.some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  return Array.from({ length: slots }, (_, slot) => pattern[slot % pattern.length]);
}

/**
 * Reachable bias range, ignoring spacing: with the start pinned, slot 0 plus the k − 1 most
 * extreme other slots; with it free, the k most extreme slots.
 */
function reachableBounds(values: number[], k: number, pinStart: boolean) {
  const sumOf = (list: number[]) => list.reduce((sum, value) => sum + value, 0);
  if (!pinStart) {
    const sorted = [...values].sort((left, right) => left - right);
    return { min: sumOf(sorted.slice(0, k)), max: sumOf(sorted.slice(sorted.length - k)) };
  }
  const rest = values.slice(1).sort((left, right) => left - right);
  return {
    min: values[0] + sumOf(rest.slice(0, k - 1)),
    max: values[0] + sumOf(rest.slice(rest.length - (k - 1))),
  };
}

function bias(values: number[], onsets: number[]) {
  return onsets.reduce((sum, slot) => sum + values[slot], 0);
}

export function searchMetric(options: MetricOptions): HouseholderResult {
  const converted = toGridUnits(options.durations, options.grid);
  if ('error' in converted) {
    return failure(converted.error);
  }
  const units = converted.units;
  const k = units.length;
  const durationTotal = units.reduce((sum, value) => sum + value, 0);
  const minUnits = Math.max(1, Math.floor(options.minUnits));
  const cyclic = options.cyclic ?? true;
  const pinStart = options.pinStart ?? true;
  if (k < 2) {
    return failure('Metric search needs at least two attacks.', units);
  }
  if (k * minUnits > durationTotal) {
    return failure(
      `${k} attacks of at least ${minUnits} grid steps don't fit in ${durationTotal}.`,
      units
    );
  }
  const originScaled = (options.origin ?? 0) * options.grid;
  if (originScaled < 0 || Math.abs(originScaled - Math.round(originScaled)) > 1e-6) {
    return failure(`The rhythm's start (${options.origin}) doesn't fall on the grid.`, units);
  }
  const inputOrigin = cyclic ? Math.round(originScaled) % durationTotal : Math.round(originScaled);

  // Slots 0..frameSlots-1 cover the whole frame: one cycle, or the leading rest plus the rhythm.
  const frameSlots = cyclic ? durationTotal : inputOrigin + durationTotal;
  const inputAbsolute = onsetsFromUnits(units).map((onset) =>
    cyclic ? (onset + inputOrigin) % frameSlots : onset + inputOrigin
  );

  // Search coordinates q. With the start pinned, shift so the input's first attack sits at
  // q = 0 — the search is then the same as for a rhythm starting on the downbeat. With the start
  // free, q is simply the frame position.
  const shift = pinStart ? inputOrigin : 0;
  const span = cyclic ? frameSlots : frameSlots - shift;
  const toAbsolute = (q: number) => (cyclic ? (q + shift) % frameSlots : q + shift);
  const inputQ = inputAbsolute
    .map((slot) => (cyclic ? (slot - shift + frameSlots) % frameSlots : slot - shift))
    .sort((left, right) => left - right);
  const closingGap = (onsets: number[]) =>
    cyclic ? span - onsets[k - 1] + onsets[0] : span - onsets[k - 1];
  const feasible = (onsets: number[]) =>
    (!pinStart || onsets[0] === 0) &&
    onsets[0] >= 0 &&
    onsets[k - 1] < span &&
    onsets.every((slot, index) => index === k - 1 || onsets[index + 1] - slot >= minUnits) &&
    closingGap(onsets) >= minUnits;

  const warnings: string[] = [];
  const active: ActiveAxis[] = [];
  for (const spec of options.axes) {
    if (!spec.enabled) {
      continue;
    }
    const label = metricAxisLabels[spec.key];
    const raw = axisValues(spec, frameSlots);
    if (!raw) {
      warnings.push(`${label}: pattern needs at least one finite number; axis skipped.`);
      continue;
    }
    const center = mean(raw);
    const absoluteValues = raw.map((value) => value - center);
    const values = Array.from({ length: span }, (_, q) => absoluteValues[toAbsolute(q)]);
    const { min, max } = reachableBounds(values, k, pinStart);
    if (max - min < EPS) {
      warnings.push(
        `${label}: no attack placement changes this axis at this length; axis skipped.`
      );
      continue;
    }
    const input = bias(values, inputQ);
    const requested = spec.coefficient * input;
    const target = Math.min(max, Math.max(min, requested));
    const clamped = Math.abs(target - requested) > 1e-6;
    if (clamped) {
      warnings.push(
        `${label}: target ${requested.toFixed(2)} is out of reach; aiming for ${target.toFixed(2)}, the closest reachable bias.`
      );
    }
    active.push({
      key: spec.key,
      values,
      weight: Math.max(0, spec.weight),
      width: max - min,
      report: { key: spec.key, label, input, target, min, max, clamped },
    });
  }
  if (!active.length) {
    return {
      candidates: [],
      inputUnits: units,
      warnings,
      error: 'Enable at least one axis that can change.',
    };
  }

  const closeness = Math.max(0, options.closeness);
  const identityWeight = Math.max(0, options.identity ?? 0);
  const pairs = (k * (k - 1)) / 2;
  const inputContent = intervalContent(inputQ, span, cyclic);
  const identityOf = (onsets: number[]) =>
    identityChange(inputContent, intervalContent(onsets, span, cyclic), pairs);
  // In a loop, which attack counts as "first" is only a label, so movement pairs attacks up
  // under the alignment that moves them least, measuring distance around the cycle.
  const movementOf = (onsets: number[]) => {
    if (!cyclic) {
      return l1(onsets, inputQ);
    }
    let best = Infinity;
    for (let offset = 0; offset < k; offset += 1) {
      let total = 0;
      for (let index = 0; index < k; index += 1) {
        const distance = Math.abs(onsets[(index + offset) % k] - inputQ[index]);
        total += Math.min(distance, span - distance);
      }
      best = Math.min(best, total);
    }
    return best;
  };
  const maxCandidates = Math.max(1, Math.floor(options.maxCandidates));
  // Axis error says "did it change what I asked"; identity says "did it change anything else".
  // Interval content ignores where attacks sit relative to the grid, so it is close to
  // independent of the placement axes rather than an exact orthogonal complement.
  const scoreOf = (onsets: number[]) => {
    let score = 0;
    for (const axis of active) {
      score +=
        (axis.weight * Math.abs(bias(axis.values, onsets) - axis.report.target)) / axis.width;
    }
    if (identityWeight > 0) {
      score += identityWeight * identityOf(onsets);
    }
    return closeness > 0 ? score + (closeness * movementOf(onsets)) / span : score;
  };

  const seen = new Set<string>();
  const top: { onsets: number[]; score: number; movement: number }[] = [];
  const consider = (onsets: number[], score = scoreOf(onsets)) => {
    const key = onsets.join(',');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    if (top.length >= maxCandidates && score > top[top.length - 1].score + EPS) {
      return;
    }
    const movement = movementOf(onsets);
    const entry = { onsets: [...onsets], score, movement };
    const position = top.findIndex(
      (other) =>
        entry.score < other.score - EPS ||
        (Math.abs(entry.score - other.score) <= EPS &&
          (entry.movement < other.movement ||
            (entry.movement === other.movement &&
              compareLexicographic(entry.onsets, other.onsets) < 0)))
    );
    if (position === -1) {
      if (top.length < maxCandidates) {
        top.push(entry);
      }
    } else {
      top.splice(position, 0, entry);
      if (top.length > maxCandidates) {
        top.pop();
      }
    }
  };

  // Latest slot attack `index` may take while leaving room for the attacks after it.
  const latest = (index: number, first: number) => {
    const remaining = k - 1 - index;
    const closingLimit = cyclic ? first + span - minUnits : span - minUnits;
    return Math.min(span - 1 - remaining * minUnits, closingLimit - remaining * minUnits);
  };

  const pinnedCount = compositionCount(span, k, minUnits, EXHAUSTIVE_LIMIT);
  const count = pinStart
    ? pinnedCount
    : cyclic
      ? Math.ceil((pinnedCount * span) / k)
      : compositionCount(span + minUnits, k + 1, minUnits, EXHAUSTIVE_LIMIT);
  let search: 'exhaustive' | 'local';
  if (count <= EXHAUSTIVE_LIMIT) {
    search = 'exhaustive';
    const onsets = new Array<number>(k).fill(0);
    const place = (index: number) => {
      if (index === k) {
        consider(onsets);
        return;
      }
      for (let slot = onsets[index - 1] + minUnits; slot <= latest(index, onsets[0]); slot += 1) {
        onsets[index] = slot;
        place(index + 1);
      }
    };
    const lastFirst = pinStart ? 0 : latest(0, 0);
    for (let first = 0; first <= lastFirst; first += 1) {
      onsets[0] = first;
      place(1);
    }
  } else {
    search = 'local';
    const even = Array.from({ length: k }, (_, index) =>
      Math.min(Math.round((index * span) / k), span - (k - index) * minUnits)
    );
    // Displacements move every attack at once, so single-attack moves can never reach one, yet
    // they keep the rhythm's interval content intact. With the start pinned these are the
    // attack rotations; with it free, every shift of the whole rhythm along the frame.
    const displacements = pinStart
      ? Array.from({ length: k }, (_, rotation) =>
          onsetsFromUnits([...units.slice(rotation), ...units.slice(0, rotation)])
        )
      : Array.from({ length: span }, (_, step) =>
          inputQ
            .map((slot) => (cyclic ? (slot + step) % span : slot - inputQ[0] + step))
            .sort((left, right) => left - right)
        );
    const ranked = displacements
      .filter(feasible)
      .map((onsets) => ({ onsets, score: scoreOf(onsets) }))
      .sort((left, right) => left.score - right.score);
    ranked.forEach(({ onsets, score }) => consider(onsets, score));
    const starts = [
      feasible(inputQ) ? inputQ : undefined,
      feasible(even) ? even : undefined,
      ...ranked.slice(0, 3).map(({ onsets }) => onsets),
    ].filter((start): start is number[] => Boolean(start));
    for (const start of starts) {
      let current = [...start];
      let currentScore = scoreOf(current);
      consider(current, currentScore);
      for (let iteration = 0; iteration < 500; iteration += 1) {
        let best: number[] | undefined;
        let bestScore = currentScore;
        for (let index = pinStart ? 1 : 0; index < k; index += 1) {
          const low =
            index === 0
              ? Math.max(0, cyclic ? current[k - 1] + minUnits - span : 0)
              : current[index - 1] + minUnits;
          const high = index === k - 1 ? latest(index, current[0]) : current[index + 1] - minUnits;
          for (let slot = low; slot <= high; slot += 1) {
            if (slot === current[index]) {
              continue;
            }
            const neighbor = [...current];
            neighbor[index] = slot;
            if (!feasible(neighbor)) {
              continue;
            }
            const score = scoreOf(neighbor);
            consider(neighbor, score);
            if (score < bestScore - EPS) {
              best = neighbor;
              bestScore = score;
            }
          }
        }
        if (!best) {
          break;
        }
        current = best;
        currentScore = bestScore;
      }
    }
    warnings.push(
      `More than ${EXHAUSTIVE_LIMIT.toLocaleString()} possible attack sets; used local search from the input and its displacements, so the best set isn't guaranteed.`
    );
  }

  const gapsOf = (onsets: number[]) =>
    onsets.map((slot, index) => (index === k - 1 ? closingGap(onsets) : onsets[index + 1] - slot));
  const inputKey = `${toAbsolute(inputQ[0])}|${gapsOf(inputQ).join(',')}`;
  const candidates = top.map(({ onsets, score, movement }): HouseholderCandidate => {
    const candidateUnits = gapsOf(onsets);
    const originUnits = toAbsolute(onsets[0]);
    return {
      units: candidateUnits,
      durations: candidateUnits.map((value) => value / options.grid),
      originUnits,
      origin: originUnits / options.grid,
      score,
      movement,
      isInput: `${originUnits}|${candidateUnits.join(',')}` === inputKey,
      identityChange: identityOf(onsets),
      axes: active.map((axis) => ({ ...axis.report, realized: bias(axis.values, onsets) })),
    };
  });
  return { candidates, inputUnits: units, warnings, search };
}

// ---------------------------------------------------------------------------------------------
// Packets

/** The candidate's start: Metric mode chooses one; Reflect keeps the input's. */
export function candidateOrigin(candidate: HouseholderCandidate, input: DataPacket) {
  return candidate.origin ?? rhythmOrigin(input);
}

export function candidateLabel(candidate: HouseholderCandidate, inputOrigin = 0) {
  const origin = candidate.origin ?? inputOrigin;
  const start = origin > 0 ? ` (starts +${origin})` : '';
  return `${candidate.durations.join(' ')}${start}${candidate.isInput ? ' (input)' : ''}`;
}

/** The input's frame with the candidate's start; a frame is created if the input had none. */
function candidateFrame(input: DataPacket, origin: number): PacketFrame {
  const total = input.items.reduce((sum, item) => sum + Number(item.value), 0);
  const frame = input.frame ?? { topology: 'cyclic', unit: 'pulse', extent: total, origin: 0 };
  return frame.topology === 'linear'
    ? { ...frame, origin, extent: frame.extent ?? total + rhythmOrigin(input) }
    : { ...frame, origin };
}

/**
 * The chosen candidate as an ordinary inter-onset list. Attack j inherits the provenance of the
 * input's attack j (in order from each rhythm's start).
 */
export function householderSelectedPacket(
  candidate: HouseholderCandidate,
  input: DataPacket<number>,
  warnings: string[],
  sourceId: string,
  transformation: string,
  parameters: Record<string, unknown>
): DataPacket<number> {
  const items: DataItem<number>[] = candidate.durations.map((duration, index) => {
    const source = input.items[index];
    return {
      id: `${sourceId}:attack:${index}`,
      value: duration,
      provenance: [
        ...(source?.provenance ?? []),
        {
          sourceModuleInstance: sourceId,
          sourceItemIds: source ? [source.id] : [],
          transformation,
          parameters,
        },
      ],
    };
  });
  return packet(
    'list',
    'duration',
    items,
    [...input.warnings, ...warnings],
    { inputDurations: input.items.map((item) => item.value), inputOrigin: rhythmOrigin(input) },
    {
      role: 'interOnset',
      frame: candidateFrame(input, candidateOrigin(candidate, input)),
    }
  );
}

/**
 * Every candidate as one bank entry; downstream inlets pick an entry by index. Entries can start
 * in different places, so each entry's start is listed in `metadata.entryOrigins` and applied
 * when an entry is selected (see compositionRouting.ts).
 */
export function householderCandidatesPacket(
  candidates: HouseholderCandidate[],
  input: DataPacket<number>,
  warnings: string[],
  sourceId: string,
  transformation: string,
  parameters: Record<string, unknown>
): DataPacket<number[]> {
  const inputOrigin = rhythmOrigin(input);
  const items: DataItem<number[]>[] = candidates.map((candidate, index) => ({
    id: `${sourceId}:candidate:${index}`,
    value: candidate.durations,
    label: candidateLabel(candidate, inputOrigin),
    provenance: [
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: input.items.map((item) => item.id),
        transformation,
        parameters: {
          ...parameters,
          candidate: index,
          score: candidate.score,
          origin: candidateOrigin(candidate, input),
        },
      },
    ],
  }));
  return packet(
    'bank',
    'duration',
    items,
    [...input.warnings, ...warnings],
    { entryOrigins: candidates.map((candidate) => candidateOrigin(candidate, input)) },
    {
      role: 'interOnset',
      frame: candidateFrame(input, inputOrigin),
    }
  );
}

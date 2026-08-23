/**
 * Schillinger's "composition of groups by pairs" (Absil, ch. 5): balancing, expanding and
 * contracting. Stripped of the book's case split, all three are one operation — concatenate
 * the fractioning duration series r_frac(a,b) with the binary-synchronization duration
 * series r_sync(a,b) — plus, for balancing only, a multiplicity and a remainder so both
 * halves reach equal length.
 *
 * Absil gives balancing as two formulas (Eq. 5.1 for a < 2b, Eq. 5.2 otherwise). They are
 * the same formula: with m = floor(a/b) (equivalently floor(a^2/(ab))), Eq. 5.1 is just the
 * m = 1 case of Eq. 5.2. There is no real case split, only unmotivated integer rounding
 * dressed up as a special rule.
 */

import { generateFractioning } from "./fractioning";
import { packet, type DataPacket } from "./model";

export type PairCompositionMode = "balancing" | "expanding" | "contracting";

export interface PairCompositionSegment {
  label: string;
  durations: number[];
}

export interface PairCompositionResult {
  mode: PairCompositionMode;
  a: number;
  b: number;
  period: number;
  durations: number[];
  segments: PairCompositionSegment[];
}

/**
 * Schillinger's binary synchronization resultant r_{a÷b} (Absil, section 2.1): the union of
 * two unbroken clocks ticking at intervals a and b, taken over one period a*b (not reduced
 * to the LCM, matching the book's convention).
 */
export function binarySynchronizationDurations(a: number, b: number) {
  const period = a * b;
  const attackSet = new Set<number>();
  for (let tick = 0; tick * a < period; tick += 1) {
    attackSet.add(tick * a);
  }
  for (let tick = 0; tick * b < period; tick += 1) {
    attackSet.add(tick * b);
  }
  const attacks = [...attackSet].sort((left, right) => left - right);
  return attacks.map((attack, index) => (attacks[index + 1] ?? period) - attack);
}

export function generatePairComposition(
  a: number,
  b: number,
  mode: PairCompositionMode,
): PairCompositionResult {
  if (!Number.isInteger(a) || !Number.isInteger(b) || b <= 0 || a <= b) {
    throw new Error("Composing a pair requires whole numbers with a strictly greater than b.");
  }

  const sync = binarySynchronizationDurations(a, b);
  const fractioning = generateFractioning(a, b).durations;
  const syncLabel = `Binary sync ${a}÷${b}`;
  const fracLabel = `Fractioning ${a}÷${b}`;

  if (mode === "expanding") {
    return {
      mode,
      a,
      b,
      period: a * a + a * b,
      durations: [...fractioning, ...sync],
      segments: [
        { label: fracLabel, durations: fractioning },
        { label: syncLabel, durations: sync },
      ],
    };
  }

  if (mode === "contracting") {
    return {
      mode,
      a,
      b,
      period: a * b + a * a,
      durations: [...sync, ...fractioning],
      segments: [
        { label: syncLabel, durations: sync },
        { label: fracLabel, durations: fractioning },
      ],
    };
  }

  // Balancing: pad the second half (repeated sync statements) with a remainder note so both
  // halves equal a^2, giving a total period of 2a^2.
  const multiplicity = Math.floor(a / b);
  const repeatedSync = Array.from({ length: multiplicity }, () => sync).flat();
  const tail = a * a - multiplicity * a * b;
  const segments: PairCompositionSegment[] = [{ label: fracLabel, durations: fractioning }];
  if (multiplicity > 0) {
    segments.push({
      label: multiplicity > 1 ? `${syncLabel} ×${multiplicity}` : syncLabel,
      durations: repeatedSync,
    });
  }
  if (tail > 0) {
    segments.push({ label: "Balancing remainder", durations: [tail] });
  }

  return {
    mode,
    a,
    b,
    period: 2 * a * a,
    durations: tail > 0 ? [...fractioning, ...repeatedSync, tail] : [...fractioning, ...repeatedSync],
    segments,
  };
}

function durationsPacket(
  durations: number[],
  sourceId: string,
  port: string,
  extent: number,
  parameters: Record<string, unknown>,
): DataPacket<number> {
  let onset = 0;
  const items = durations.map((duration, index) => {
    const item = {
      id: `${sourceId}:${port}:attack:${onset}`,
      value: duration,
      provenance: [
        {
          sourceModuleInstance: sourceId,
          sourceItemIds: [] as string[],
          transformation: "pair-composition",
          parameters: { ...parameters, index, attackTime: onset },
        },
      ],
    };
    onset += duration;
    return item;
  });
  return packet(
    "list",
    "duration",
    items,
    [],
    undefined,
    { role: "interOnset", frame: { topology: "cyclic", unit: "pulse", extent, origin: 0 } },
  );
}

/** Combined output: the full concatenated pair-composition duration series. */
export function pairCompositionDurationPacket(
  result: PairCompositionResult,
  sourceId: string,
): DataPacket<number> {
  return durationsPacket(result.durations, sourceId, "combined", result.period, {
    mode: result.mode,
    a: result.a,
    b: result.b,
  });
}

/** One output per labeled segment (fractioning statement, sync statement, remainder, ...). */
export function pairCompositionSegmentPackets(
  result: PairCompositionResult,
  sourceId: string,
): { port: string; label: string; packet: DataPacket<number> }[] {
  return result.segments.map((segment, index) => ({
    port: `segment:${index}`,
    label: segment.label,
    packet: durationsPacket(
      segment.durations,
      sourceId,
      `segment:${index}`,
      segment.durations.reduce((sum, value) => sum + value, 0),
      { mode: result.mode, a: result.a, b: result.b, segment: segment.label },
    ),
  }));
}

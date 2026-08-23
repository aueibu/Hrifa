/**
 * Schillinger's "fractioning" technique (Absil, ch. 4), stripped to its actual mechanism.
 *
 * Binary synchronization (see interference.ts) unions two *unbroken* periodic clocks A and
 * B. Fractioning instead unions one unbroken A-clock (period a, a ticks) with a-b+1 copies
 * of a B-clock (spacing b, a ticks each) that each restart their phase at a multiple of a.
 * There is no interference-of-periodicities metaphor needed to specify this: it is a union
 * of a+1 arithmetic progressions of length a, offset in a fixed way, taken over one period a^2.
 */

import { packet, type DataPacket } from "./model";

export interface FractioningResult {
  /** a^2, the pattern's recurrence length in time units. */
  period: number;
  attacks: number[];
  durations: number[];
}

/** Number of staggered B-clocks: N_b = a - b + 1. */
export function fractioningShiftCount(a: number, b: number) {
  return a - b + 1;
}

export function generateFractioning(a: number, b: number): FractioningResult {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    throw new Error("Fractioning requires two positive whole-number generators.");
  }
  if (a <= b) {
    throw new Error("Fractioning requires a major generator a strictly greater than the minor generator b.");
  }

  const period = a * a;
  const attackSet = new Set<number>();

  // The A-clock: a ticks spaced a apart, covering [0, a^2).
  for (let tick = 0; tick < a; tick += 1) {
    attackSet.add(tick * a);
  }

  // N_b staggered B-clocks: each has a ticks spaced b apart, starting at k*a.
  const shiftCount = fractioningShiftCount(a, b);
  for (let shift = 0; shift < shiftCount; shift += 1) {
    for (let tick = 0; tick < a; tick += 1) {
      attackSet.add(shift * a + tick * b);
    }
  }

  const attacks = [...attackSet].sort((left, right) => left - right);
  const durations = attacks.map((attack, index) => (attacks[index + 1] ?? period) - attack);
  return { period, attacks, durations };
}

export function fractioningDurationPacket(
  result: FractioningResult,
  a: number,
  b: number,
  sourceId: string,
): DataPacket<number> {
  return packet(
    "list",
    "duration",
    result.durations.map((duration, index) => ({
      id: `${sourceId}:attack:${result.attacks[index]}`,
      value: duration,
      provenance: [
        {
          sourceModuleInstance: sourceId,
          sourceItemIds: [`generator:a:${a}`, `generator:b:${b}`],
          transformation: "fractioning-resultant",
          parameters: { a, b, attackTime: result.attacks[index], period: result.period },
        },
      ],
    })),
    [],
    { attackTimes: result.attacks },
    {
      role: "interOnset",
      frame: { topology: "cyclic", unit: "pulse", extent: result.period, origin: 0 },
    },
  );
}

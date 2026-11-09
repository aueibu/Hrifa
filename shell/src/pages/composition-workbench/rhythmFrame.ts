/**
 * Where a rhythm starts inside its frame.
 *
 * An inter-onset list says how far apart attacks are, but not where the first one falls. That
 * lives in `frame.origin`: the first attack's position, in frame units, measured from the start
 * of the frame (the downbeat). Origin 0 is the old behaviour — first attack on the downbeat.
 *
 * - Cyclic frames: 0 ≤ origin < cycle length. The durations still sum to the cycle length; the
 *   last one wraps past the end of the cycle into the next cycle's first attack, so a rhythm
 *   starting on pulse 2 of a 16-pulse loop sounds its leading two pulses as the tail of the
 *   previous cycle.
 * - Linear frames: origin is a leading rest before the first attack, and the frame's extent is
 *   origin + the sum of the durations.
 */

import type { DataPacket, PacketFrame } from './model';

/** The first attack's position in frame units; 0 when the frame doesn't say. */
export function rhythmOrigin(packet?: Pick<DataPacket, 'frame'>): number {
  const origin = packet?.frame?.origin;
  return typeof origin === 'number' && Number.isFinite(origin) && origin > 0 ? origin : 0;
}

/** Brings an origin into [0, cycle) for a cyclic frame; linear origins are only floored at 0. */
export function normalizeRhythmOrigin(
  origin: number,
  topology: PacketFrame['topology'],
  cycle: number
): { origin: number; clamped: boolean } {
  if (topology === 'cyclic' && cycle > 0) {
    return { origin: ((origin % cycle) + cycle) % cycle, clamped: false };
  }
  return origin < 0 ? { origin: 0, clamped: true } : { origin, clamped: false };
}

/** Attack positions in frame units: origin plus the running sum of the durations. */
export function attackPositions(durations: number[], origin = 0): number[] {
  let at = origin;
  return durations.map((duration) => {
    const position = at;
    at += duration;
    return position;
  });
}

/** Short human description, e.g. "starts on pulse 2" — empty for a downbeat start. */
export function describeRhythmOrigin(origin: number, unit = 'pulse') {
  return origin > 0 ? `starts ${origin} ${unit}${origin === 1 ? '' : 's'} in` : '';
}

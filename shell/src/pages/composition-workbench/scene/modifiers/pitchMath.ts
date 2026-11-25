/**
 * Pitch arithmetic for the pitch modifiers, in exact midicents with a PERIOD (default 1200). A set
 * either repeats every period in both directions (`repeat`) or is only its listed pitches. Nothing
 * here knows about 12 steps or an octave of 1200: the EDO of a Pitch classes block only decides
 * where its members sit (`pitchClassMembers`), and the period is always an input.
 */

export const DEFAULT_PERIOD = 1200;

/** Distances closer than this (cents) count as equal, so a tie survives floating point. */
const EPSILON = 1e-9;

/** The members of a pitch-class set as cents above the base C: `pc * (1200 / edo)` plus the base. */
export function pitchClassMembers(
  pitchClasses: readonly number[],
  edo: number,
  baseMidicents: number
): number[] {
  return pitchClasses.map((pc) => baseMidicents + pc * (1200 / edo));
}

function uniqueSorted(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > EPSILON);
}

/**
 * The member of the set nearest `pitch` by cents, ties to the LOWER pitch. With `repeat` the set
 * repeats every `period` cents both ways; without it only `members` count. Null for an empty set.
 */
export function nearestMember(
  pitch: number,
  members: readonly number[],
  repeat: boolean,
  period: number
): number | null {
  if (members.length === 0) {
    return null;
  }
  const candidates: number[] = [];
  for (const member of members) {
    if (repeat) {
      const k = Math.floor((pitch - member) / period);
      candidates.push(member + k * period, member + (k + 1) * period);
    } else {
      candidates.push(member);
    }
  }
  let best = candidates[0];
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - pitch);
    const bestDistance = Math.abs(best - pitch);
    if (
      distance < bestDistance - EPSILON ||
      (Math.abs(distance - bestDistance) <= EPSILON && candidate < best)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * The first `count` members of the set strictly ABOVE `pitch`, ascending. With `repeat` the set
 * continues upward every `period` (there are always enough); without it only the listed pitches
 * above `pitch` count, so there can be fewer than `count` (no wrap).
 */
export function membersAbove(
  pitch: number,
  members: readonly number[],
  repeat: boolean,
  period: number,
  count: number
): number[] {
  if (members.length === 0 || count <= 0) {
    return [];
  }
  if (!repeat) {
    return uniqueSorted(members)
      .filter((member) => member > pitch + EPSILON)
      .slice(0, count);
  }
  const pool: number[] = [];
  for (const member of members) {
    // The first copy of this member above the pitch, then enough later copies to fill `count`.
    const first = Math.floor((pitch - member) / period + EPSILON) + 1;
    for (let k = 0; k < count; k += 1) {
      pool.push(member + (first + k) * period);
    }
  }
  return uniqueSorted(pool).slice(0, count);
}

/**
 * Harmonize one pitch: itself, then every `step`-th member above it, up to `voices` pitches in all.
 * Step 1 takes the next members in turn; Step 2 skips every other one.
 */
export function harmonizePitch(
  pitch: number,
  members: readonly number[],
  options: { voices: number; step: number; repeat: boolean; period: number }
): number[] {
  const { voices, step, repeat, period } = options;
  const above = membersAbove(pitch, members, repeat, period, (voices - 1) * step);
  const added: number[] = [];
  for (let voice = 1; voice < voices; voice += 1) {
    const member = above[voice * step - 1];
    if (member === undefined) {
      break;
    }
    added.push(member);
  }
  return [pitch, ...added];
}

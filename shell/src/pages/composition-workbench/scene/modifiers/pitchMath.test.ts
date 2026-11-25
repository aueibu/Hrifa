import { describe, expect, it } from 'vitest';
import { harmonizePitch, membersAbove, nearestMember, pitchClassMembers } from './pitchMath';

const P = [6000, 6400, 6700];
const TRITAVE = 1901.955;

describe('nearestMember (Snap to Pitch Set, scenario row 3)', () => {
  it('repeat on (default period 1200): 6250 to 6400, 7250 to 7200', () => {
    expect(nearestMember(6250, P, true, 1200)).toBe(6400);
    expect(nearestMember(7250, P, true, 1200)).toBe(7200);
  });

  it('repeat off: only the listed pitches: 6250 to 6400, 7250 to 6700', () => {
    expect(nearestMember(6250, P, false, 1200)).toBe(6400);
    expect(nearestMember(7250, P, false, 1200)).toBe(6700);
  });

  it('a tie goes to the LOWER pitch', () => {
    expect(nearestMember(6200, [6000, 6400], false, 1200)).toBe(6000);
    expect(nearestMember(6200, [6400, 6000], true, 1200)).toBe(6000);
    // Equal distance across the period seam: 6950 sits 250 from 6700 and 250 from 7200.
    expect(nearestMember(6950, P, true, 1200)).toBe(6700);
  });

  it('an empty set has no member', () => {
    expect(nearestMember(6000, [], true, 1200)).toBeNull();
  });

  it('works in cents with a tritave period, not in steps of 12', () => {
    // 7950 is 50 above 7900 (6700 + 1200) but 48.045 above 7901.955 (6000 + tritave): the period
    // decides which copy of the set exists.
    expect(nearestMember(7950, P, true, 1200)).toBe(7900);
    expect(nearestMember(7950, P, true, TRITAVE)).toBeCloseTo(6000 + TRITAVE, 6);
    expect(nearestMember(6010 - TRITAVE, P, true, TRITAVE)).toBeCloseTo(6000 - TRITAVE, 6);
  });

  it('quarter-tone pitches: 6050 is a tie between 6000 and 6100 and goes down; a quarter-tone member is exact', () => {
    expect(nearestMember(6050, [6000, 6100], false, 1200)).toBe(6000);
    expect(nearestMember(6240, [6050, 6350], false, 1200)).toBe(6350);
    expect(nearestMember(6070, [6050, 6350], true, 1200)).toBe(6050);
  });

  it('a 19-EDO pitch-class set repeats every 1200 cents above the base C', () => {
    const members = pitchClassMembers([0, 4, 8, 11], 19, 6000);
    expect(members[1]).toBeCloseTo(6000 + 4 * (1200 / 19), 9);
    expect(nearestMember(6030, members, true, 1200)).toBeCloseTo(6000, 9);
    expect(nearestMember(6300, members, true, 1200)).toBeCloseTo(6000 + 4 * (1200 / 19), 9);
    expect(nearestMember(7260, members, true, 1200)).toBeCloseTo(7200, 9);
  });
});

describe('membersAbove and harmonizePitch (Harmonize, scenario row 4)', () => {
  it('members strictly above, ascending, repeating every period', () => {
    expect(membersAbove(6400, P, true, 1200, 4)).toEqual([6700, 7200, 7600, 7900]);
    expect(membersAbove(6000, P, true, 1200, 2)).toEqual([6400, 6700]);
  });

  it('6000 gives 6000, 6400, 6700; 6400 gives 6400, 6700, 7200 (Voices 3, Step 1)', () => {
    const options = { voices: 3, step: 1, repeat: true, period: 1200 };
    expect(harmonizePitch(6000, P, options)).toEqual([6000, 6400, 6700]);
    expect(harmonizePitch(6400, P, options)).toEqual([6400, 6700, 7200]);
  });

  it('Step 2 skips every other member: 6000 gives 6000, 6700, 7600', () => {
    expect(harmonizePitch(6000, P, { voices: 3, step: 2, repeat: true, period: 1200 })).toEqual([
      6000, 6700, 7600,
    ]);
  });

  it('repeat off adds fewer when too few members are above (no wrap)', () => {
    const options = { voices: 3, step: 1, repeat: false, period: 1200 };
    expect(harmonizePitch(6400, P, options)).toEqual([6400, 6700]);
    expect(harmonizePitch(6700, P, options)).toEqual([6700]);
    expect(harmonizePitch(6000, P, { ...options, voices: 8 })).toEqual([6000, 6400, 6700]);
  });

  it('a note that is not in the set still gains the members above it', () => {
    expect(harmonizePitch(6050, P, { voices: 3, step: 1, repeat: true, period: 1200 })).toEqual([
      6050, 6400, 6700,
    ]);
  });

  it('non-12: a tritave period repeats the set every 1901.955 cents', () => {
    const result = harmonizePitch(6000, P, {
      voices: 5,
      step: 1,
      repeat: true,
      period: TRITAVE,
    });
    expect(result.slice(0, 3)).toEqual([6000, 6400, 6700]);
    expect(result[3]).toBeCloseTo(6000 + TRITAVE, 6);
    expect(result[4]).toBeCloseTo(6400 + TRITAVE, 6);
  });

  it('quarter-tone members: 6050 and 6350 repeating', () => {
    const result = harmonizePitch(6050, [6050, 6350], {
      voices: 3,
      step: 1,
      repeat: true,
      period: 1200,
    });
    expect(result).toEqual([6050, 6350, 7250]);
  });

  it('a 19-EDO pitch-class set harmonizes in its own steps', () => {
    const members = pitchClassMembers([0, 7, 11], 19, 6000);
    const result = harmonizePitch(6000, members, {
      voices: 3,
      step: 1,
      repeat: true,
      period: 1200,
    });
    expect(result[1]).toBeCloseTo(6000 + 7 * (1200 / 19), 9);
    expect(result[2]).toBeCloseTo(6000 + 11 * (1200 / 19), 9);
  });
});

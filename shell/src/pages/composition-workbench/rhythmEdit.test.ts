import { describe, expect, it } from 'vitest';
import { packet } from './model';
import {
  editRhythm,
  parseEditRules,
  parseLengthAction,
  parseLengthProgram,
  parseStructureProgram,
  runProgram,
  scaleStepsToLength,
  traceProgram,
} from './rhythmEdit';
import { formatRhythmText } from './rhythmNotation';

function rhythm(values: number[], topology: 'cyclic' | 'linear' = 'cyclic') {
  return packet(
    'list',
    'duration',
    values.map((value, index) => ({ id: `r:${index}`, value, provenance: [] })),
    [],
    undefined,
    {
      role: 'interOnset',
      frame: {
        topology,
        unit: 'pulse',
        extent: values.reduce((total, value) => total + Math.abs(value), 0),
        origin: 0,
      },
    }
  );
}

const written = (result: ReturnType<typeof editRhythm>) =>
  formatRhythmText(
    (result.packet?.items ?? []).map((item) => ({ duration: Number(item.value), tie: item.tie }))
  );

const noVariable = { start: 1, change: 0, every: 1 };

describe('programs', () => {
  it('reads blocks and bare actions, and refuses anything else', () => {
    expect(parseStructureProgram('[x,2][r,1]').blocks).toEqual([
      { action: 'keep', count: 2 },
      { action: 'rest', count: 1 },
    ]);
    expect(parseStructureProgram('x x r').blocks).toHaveLength(3);
    expect(parseStructureProgram('xxr').blocks).toHaveLength(3);
    expect(parseStructureProgram('[r,n]').blocks[0].count).toBe('n');
    expect(parseStructureProgram('x q').errors[0]).toMatch(/q:/);
    expect(parseStructureProgram('[r,0]').errors[0]).toMatch(/at least one/);
    expect(parseStructureProgram('  ')).toEqual({ blocks: [], errors: [] });
    expect(parseLengthProgram('[*3/5,2][o,1]').blocks).toHaveLength(2);
    expect(parseLengthProgram('*3/5 +1 -1/2 =2 o').blocks).toHaveLength(5);
    expect(parseLengthProgram('*0').errors).toHaveLength(1);
    expect(parseLengthAction('*3/0')).toBeUndefined();
  });

  it('runs a cyclic program, each block covering its count of notes', () => {
    const blocks = parseStructureProgram('[x,2][r,1]').blocks;
    expect(runProgram(blocks, 7, noVariable, { phase: 0, rate: 1 })).toEqual([
      'keep',
      'keep',
      'rest',
      'keep',
      'keep',
      'rest',
      'keep',
    ]);
  });

  it('grows n as blocks complete: start, change, every K blocks, never below 1', () => {
    const blocks = parseStructureProgram('[x,n][r,1]').blocks;
    // As in Grid Traversal, n changes after every 2 completed blocks (the x block and the r block
    // each count): n = 1 for the first x, 2 for the second, 3 for the third.
    const actions = runProgram(blocks, 9, { start: 1, change: 1, every: 2 }, { phase: 0, rate: 1 });
    expect(actions).toEqual(['keep', 'rest', 'keep', 'keep', 'rest', 'keep', 'keep', 'keep', 'rest']);
    const shrinking = runProgram(blocks, 6, { start: 2, change: -5, every: 1 }, { phase: 0, rate: 1 });
    expect(shrinking.slice(0, 3)).toEqual(['keep', 'keep', 'rest']);
  });

  it('delays a program by its phase and ticks it only on every rate-th note', () => {
    const blocks = parseStructureProgram('r').blocks;
    expect(runProgram(blocks, 6, noVariable, { phase: 2, rate: 2 })).toEqual([
      undefined,
      undefined,
      'rest',
      undefined,
      'rest',
      undefined,
    ]);
  });
});

describe('structure', () => {
  it('makes rests and ties by program, keeping lengths', () => {
    const result = editRhythm({
      instanceId: 'e',
      source: rhythm([2, 1, 3, 2, 1, 3]),
      program: 'x x r',
    });
    expect(written(result)).toBe('2 1 r3 2 1 r3');
    expect(result.changed).toBe(2);
    expect(
      written(editRhythm({ instanceId: 'e', source: rhythm([1, 2, 1, 2]), program: '~ x' }))
    ).toBe('1~ 2 1~ 2');
  });

  it('turns an existing rest into an attack under ~ and drops a tie under r', () => {
    expect(
      written(editRhythm({ instanceId: 'e', source: rhythm([2, -1, 1]), program: 'x ~ x' }))
    ).toBe('2 1~ 1');
    const withTie = rhythm([2, 1]);
    withTie.items[0].tie = true;
    expect(written(editRhythm({ instanceId: 'e', source: withTie, program: 'r x' }))).toBe('r2 1');
  });

  it('reports a tie that ends a linear rhythm', () => {
    const result = editRhythm({ instanceId: 'e', source: rhythm([1, 2], 'linear'), program: 'x ~' });
    expect(result.packet?.warnings.join(' ')).toMatch(/ends with a tie/);
  });

  it('refuses a source that is not an inter-onset rhythm or text it cannot read', () => {
    expect(editRhythm({ instanceId: 'e', program: 'x' }).errors[0]).toMatch(/inter-onset/);
    expect(editRhythm({ instanceId: 'e', source: rhythm([1]), program: 'q' }).errors[0]).toMatch(
      /q:/
    );
  });
});

describe('lengths, per note', () => {
  it('multiplies exactly and recomputes the frame from the new lengths', () => {
    const result = editRhythm({ instanceId: 'e', source: rhythm([2, 1, 3, 2]), lengths: '*3/5' });
    expect(written(result)).toBe('6/5 3/5 9/5 6/5');
    expect(result.packet?.frame?.extent).toBeCloseTo(24 / 5);
  });

  it('applies a block program note by note and leaves skipped notes alone', () => {
    const result = editRhythm({
      instanceId: 'e',
      source: rhythm([2, 2, 2, 2, 2, 2]),
      lengths: '[*3/2,2][o,1]',
    });
    expect(written(result)).toBe('3 3 2 3 3 2');
    expect(result.packet?.frame?.extent).toBe(16);
  });

  it('adds, subtracts and sets, and keeps a note whose length would reach zero', () => {
    expect(
      written(editRhythm({ instanceId: 'e', source: rhythm([2, 2, 2]), lengths: '+1 -1/2 =5' }))
    ).toBe('3 3/2 5');
    const clamped = editRhythm({ instanceId: 'e', source: rhythm([2, 1]), lengths: '-2' });
    expect(written(clamped)).toBe('2 1');
    expect(clamped.packet?.warnings.join(' ')).toMatch(/at or below zero/);
  });

  it('scales rests by magnitude, keeps ties, and combines with structure', () => {
    const source = rhythm([2, -2, 4]);
    source.items[0].tie = true;
    expect(written(editRhythm({ instanceId: 'e', source, lengths: '*1/2' }))).toBe('1~ r1 2');
    expect(
      written(
        editRhythm({
          instanceId: 'e',
          source: rhythm([2, 4, 2]),
          program: 'x r x',
          lengths: '*3/2',
        })
      )
    ).toBe('3 r6 3');
  });

  it('runs on its own phase and rate', () => {
    const result = editRhythm({
      instanceId: 'e',
      source: rhythm([2, 2, 2, 2, 2, 2]),
      lengths: '*2',
      lengthTiming: { phase: 1, rate: 2 },
    });
    expect(written(result)).toBe('2 4 2 4 2 4');
  });

  it('drops a grouping that note lengths no longer match, and says so', () => {
    const source = rhythm([2, 2]);
    source.frame = {
      ...source.frame!,
      grouping: { id: 'g', label: 'g', units: 2, boundaries: [2] },
    };
    const result = editRhythm({ instanceId: 'e', source, lengths: '*2' });
    expect(result.packet?.frame?.grouping).toBeUndefined();
    expect(result.packet?.warnings.join(' ')).toMatch(/grouping was dropped/);
    const kept = editRhythm({ instanceId: 'e', source, lengths: '*2', grouping: 'keep' });
    expect(kept.packet?.frame?.grouping).toEqual(source.frame.grouping);
    expect(kept.packet?.warnings.join(' ')).not.toMatch(/grouping/);
  });

  it('can move boundaries with the notes they fall in', () => {
    // Notes 2 2 2 2 (total 8); boundaries at 2 (start of note 2), 5 (halfway through note 3), 8
    // (the very end). Doubling note 1 makes it 4, so everything after it moves up by 2.
    const source = rhythm([2, 2, 2, 2]);
    source.frame = {
      ...source.frame!,
      grouping: { id: 'g', label: 'g', units: 2, boundaries: [1, 2, 5, 8] },
    };
    const result = editRhythm({
      instanceId: 'e',
      source,
      lengths: '[*2,1][o,1]',
      lengthTiming: { phase: 0, rate: 4 },
      grouping: 'follow',
    });
    const grouping = result.packet?.frame?.grouping;
    // Note 1: 2 -> 4. A boundary halfway through it (1) moves to halfway through (2); the start of
    // note 2 (2) moves to 4; halfway through note 3 (5) to 7; the end (8) to 10.
    expect(grouping?.boundaries).toEqual([2, 4, 7, 10]);
    expect(grouping?.units).toBeCloseTo(2 * (10 / 8));
    expect(result.packet?.warnings.join(' ')).not.toMatch(/grouping/);
  });

  it('follows the notes through fractional lengths exactly', () => {
    const source = rhythm([5, 5]);
    source.frame = {
      ...source.frame!,
      grouping: { id: 'g', label: 'g', units: 5, boundaries: [5] },
    };
    const result = editRhythm({ instanceId: 'e', source, lengths: '*3/5', grouping: 'follow' });
    expect(result.packet?.frame?.grouping?.boundaries).toEqual([3]);
  });
});

describe('rules', () => {
  const source = () => rhythm([1, 2, 3, 1, 2, 3, 1, 2]);
  const run = (rules: string) =>
    written(editRhythm({ instanceId: 'e', source: source(), mode: 'rules', rules }));

  it('picks notes by number, range, step, position and length, later rules overriding', () => {
    expect(run('3: r')).toBe('1 2 r3 1 2 3 1 2');
    expect(run('2-4: r')).toBe('1 r2 r3 r1 2 3 1 2');
    expect(run('every 3 from 2: r')).toBe('1 r2 3 1 r2 3 1 r2');
    expect(run('last: ~')).toBe('1 2 3 1 2 3 1 2~');
    expect(run('>2: r')).toBe('1 2 r3 1 2 r3 1 2');
    expect(run('all: r; 4: x')).toBe('r1 r2 r3 1 r2 r3 r1 r2');
    expect(run('1,3,5: ~')).toBe('1~ 2 3~ 1 2~ 3 1 2');
  });

  it('also carries length actions, which override the length program', () => {
    expect(run('3, 6: *3/2')).toBe('1 2 9/2 1 2 9/2 1 2');
    const result = editRhythm({
      instanceId: 'e',
      source: rhythm([2, 2, 2]),
      mode: 'rules',
      rules: 'last: =7',
      lengths: '*2',
    });
    expect(written(result)).toBe('4 4 7');
  });

  it('removes a tie with u and reports unreadable rules with their number', () => {
    const tied = rhythm([2, 1]);
    tied.items[0].tie = true;
    expect(
      written(editRhythm({ instanceId: 'e', source: tied, mode: 'rules', rules: 'first: u' }))
    ).toBe('2 1');
    expect(parseEditRules('every 3: r; banana: r').errors[0]).toMatch(/Rule 2/);
    expect(parseEditRules('3: q').errors).toHaveLength(1);
  });
});

describe('scaling the original to the edit\'s length', () => {
  it('stretches every note by one exact factor to reach the target length', () => {
    // 2 1 3 sums to 6; at length 9 every note is 3/2 as long.
    expect(scaleStepsToLength([{ duration: 2 }, { duration: 1 }, { duration: 3 }], 9)).toEqual([
      { duration: 3 },
      { duration: 1.5 },
      { duration: 4.5 },
    ]);
    // 5/7 is exact: 3 + 4 = 7 shrinks to 5 as 15/7 and 20/7.
    const shrunk = scaleStepsToLength([{ duration: 3 }, { duration: 4 }], 5);
    expect(shrunk[0].duration).toBeCloseTo(15 / 7, 12);
    expect(shrunk[1].duration).toBeCloseTo(20 / 7, 12);
    expect(shrunk[0].duration + shrunk[1].duration).toBeCloseTo(5, 12);
  });

  it('keeps rests negative and ties on their notes, and leaves an empty or zero case alone', () => {
    const steps = [{ duration: 2, tie: true }, { duration: -2 }, { duration: 4 }];
    expect(scaleStepsToLength(steps, 16)).toEqual([
      { duration: 4, tie: true },
      { duration: -4 },
      { duration: 8 },
    ]);
    expect(scaleStepsToLength([], 4)).toEqual([]);
    expect(scaleStepsToLength([{ duration: 2 }], 0)).toEqual([{ duration: 2 }]);
  });
});

describe('tracing a program', () => {
  const blocks = parseStructureProgram('[x,2][r,1]').blocks;

  it('marks each note as waiting, skipped or a tick, numbering the blocks', () => {
    const trace = traceProgram(blocks, 8, noVariable, { phase: 1, rate: 2 });
    // Note 1 waits (phase). Ticks fall on notes 2, 4, 6, 8; notes 3, 5, 7 are skipped.
    expect(trace.map((note) => note.state)).toEqual([
      'waiting', 'tick', 'skipped', 'tick', 'skipped', 'tick', 'skipped', 'tick',
    ]);
    // Four ticks make [x,2] then [r,1] then the start of [x,2] again: blocks 0, 0, 1, 2.
    expect(trace.filter((note) => note.state === 'tick').map((note) => [note.action, note.block])).toEqual([
      ['keep', 0],
      ['keep', 0],
      ['rest', 1],
      ['keep', 2],
    ]);
  });

  it('lets a block grow with n, so its bracket covers more ticks each time', () => {
    const growing = traceProgram(parseStructureProgram('[x,n][r,1]').blocks, 9, { start: 1, change: 1, every: 2 }, { phase: 0, rate: 1 });
    const sizes = new Map<number, number>();
    growing.forEach((note) => {
      if (note.block !== undefined) sizes.set(note.block, (sizes.get(note.block) ?? 0) + 1);
    });
    expect([...sizes.values()]).toEqual([1, 1, 2, 1, 3, 1].slice(0, sizes.size));
  });

  it('gives editRhythm tracks for programs and rules, and none for a program that is empty', () => {
    const source = rhythm([2, 2, 2, 2, 2, 2]);
    const programmed = editRhythm({ instanceId: 'e', source, program: '[x,2][r,1]', lengths: '*2' });
    expect(programmed.tracks?.structure?.map((note) => note.action)).toEqual(['x', 'x', 'r', 'x', 'x', 'r']);
    expect(programmed.tracks?.length?.every((note) => note.action === '*2')).toBe(true);
    const lengthOnly = editRhythm({ instanceId: 'e', source, lengths: '*2' });
    expect(lengthOnly.tracks?.structure).toBeUndefined();
    const ruled = editRhythm({ instanceId: 'e', source, mode: 'rules', rules: 'every 3: r\n2: *3/2' });
    expect(ruled.tracks?.structure?.map((note) => note.state)).toEqual(['tick', 'skipped', 'skipped', 'tick', 'skipped', 'skipped']);
    expect(ruled.tracks?.length?.map((note) => note.action)).toEqual([undefined, '*3/2', undefined, undefined, undefined, undefined]);
    expect(editRhythm({ instanceId: 'e', source }).tracks).toEqual({ structure: undefined, length: undefined });
  });
});

describe('bare multipliers and decimals', () => {
  const half = { kind: 'multiply', factor: { numerator: 1, denominator: 2 } };

  it('reads a bare fraction as a multiplier, the same as with a star, and decimals with a star', () => {
    expect(parseLengthAction('1/2')).toEqual(half);
    expect(parseLengthAction('*1/2')).toEqual(half);
    expect(parseLengthAction('*.5')).toEqual(half);
    expect(parseLengthAction('*0.5')).toEqual(half);
    expect(parseLengthAction('3/5')).toEqual({ kind: 'multiply', factor: { numerator: 3, denominator: 5 } });
    expect(parseLengthAction('*1.5')).toEqual({ kind: 'multiply', factor: { numerator: 3, denominator: 2 } });
  });

  it('does not read a bare whole number or decimal as a multiplier', () => {
    expect(parseLengthAction('2')).toBeUndefined();
    expect(parseLengthAction('.5')).toBeUndefined();
    expect(parseLengthAction('0.5')).toBeUndefined();
    expect(parseLengthAction('1.5')).toBeUndefined();
    expect(editRhythm({ instanceId: 'e', source: rhythm([2]), lengths: '2' }).errors[0]).toMatch(/2:/);
  });

  it('reads a leading slash as a divisor', () => {
    expect(parseLengthAction('/2')).toEqual(half);
    expect(parseLengthAction('/.5')).toEqual({ kind: 'multiply', factor: { numerator: 2, denominator: 1 } });
    expect(parseLengthAction('/3')).toEqual({ kind: 'multiply', factor: { numerator: 1, denominator: 3 } });
  });

  it('keeps the other operators and refuses a zero or unreadable multiplier', () => {
    expect(parseLengthAction('+.5')).toEqual({ kind: 'add', pulses: { numerator: 1, denominator: 2 } });
    expect(parseLengthAction('-1/2')).toEqual({ kind: 'subtract', pulses: { numerator: 1, denominator: 2 } });
    expect(parseLengthAction('=.25')).toEqual({ kind: 'set', pulses: { numerator: 1, denominator: 4 } });
    expect(parseLengthAction('0')).toBeUndefined();
    expect(parseLengthAction('/0')).toBeUndefined();
    expect(parseLengthAction('1/0')).toBeUndefined();
    expect(parseLengthAction('abc')).toBeUndefined();
  });

  it('halves notes the same way however it is written, in programs and in rules', () => {
    const source = () => rhythm([4, 2, 6]);
    const expected = '2 1 3';
    for (const lengths of ['*1/2', '1/2', '*.5', '/2', '[1/2,3]', '[*.5,3]', '[/2,3]']) {
      expect(written(editRhythm({ instanceId: 'e', source: source(), lengths })), lengths).toBe(expected);
    }
    expect(
      written(editRhythm({ instanceId: 'e', source: source(), mode: 'rules', rules: 'all: 1/2' }))
    ).toBe(expected);
    expect(
      written(editRhythm({ instanceId: 'e', source: source(), mode: 'rules', rules: 'all: *.5' }))
    ).toBe(expected);
    // Double, then the original, alternating: the double needs its star.
    expect(written(editRhythm({ instanceId: 'e', source: rhythm([1, 1, 1, 1]), lengths: '*2 o' }))).toBe('2 1 2 1');
  });
});

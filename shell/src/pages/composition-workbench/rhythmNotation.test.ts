import { describe, expect, it } from 'vitest';
import { packet, type DataPacket } from './model';
import { formatRhythmText, parseRhythmText } from './rhythmNotation';
import { applyRhythmRouteTreatment, defaultRhythmRouteTreatment } from './routeTreatments';

describe('rhythm notation', () => {
  it('reads attacks, rests and ties and writes them back', () => {
    const { steps, errors } = parseRhythmText('2~ 1, r2 3 r1');
    expect(errors).toEqual([]);
    expect(steps).toEqual([
      { duration: 2, tie: true },
      { duration: 1 },
      { duration: -2 },
      { duration: 3 },
      { duration: -1 },
    ]);
    expect(formatRhythmText(steps)).toBe('2~ 1 r2 3 r1');
  });

  it('refuses what it cannot read instead of guessing', () => {
    expect(parseRhythmText('2 -1').errors[0]).toMatch(/-1/);
    expect(parseRhythmText('r2~').errors[0]).toMatch(/cannot be tied/);
    expect(parseRhythmText('0').errors[0]).toMatch(/greater than zero/);
    expect(parseRhythmText('1.x').errors).toHaveLength(1);
    expect(parseRhythmText('6/5 1.5 r3/2').steps.map((step) => step.duration)).toEqual([1.2, 1.5, -1.5]);
  });
});

function rhythm(text: string) {
  const { steps } = parseRhythmText(text);
  return packet(
    'list',
    'duration',
    steps.map((step, index) => ({
      id: `r:${index}`,
      value: step.duration,
      ...(step.tie ? { tie: true } : {}),
      provenance: [],
    })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: steps.reduce((t, s) => t + Math.abs(s.duration), 0) } }
  );
}

const written = (source?: DataPacket) =>
  formatRhythmText((source?.items ?? []).map((item) => ({ duration: Number(item.value), tie: item.tie })));

describe('rests and ties through route treatments', () => {
  it('rotates items with their own tie markers', () => {
    const out = applyRhythmRouteTreatment(rhythm('1 2~ 3'), { ...defaultRhythmRouteTreatment, rotation: 1 });
    expect(written(out)).toBe('2~ 3 1');
  });

  it('reverses items with their own tie markers', () => {
    const reverse = { ...defaultRhythmRouteTreatment, retrograde: true };
    expect(written(applyRhythmRouteTreatment(rhythm('1 2~ 3'), reverse))).toBe('3 2~ 1');
    expect(written(applyRhythmRouteTreatment(rhythm('1 2 3~ 4'), reverse))).toBe('4 3~ 2 1');
  });

  it('scales rests by magnitude, keeps the sign, and counts the span as the sum of lengths', () => {
    const out = applyRhythmRouteTreatment(rhythm('2~ 1 r2'), { ...defaultRhythmRouteTreatment, durationScale: 2 });
    expect(written(out)).toBe('4~ 2 r4');
    expect(out?.frame?.extent).toBe(10);
  });
});

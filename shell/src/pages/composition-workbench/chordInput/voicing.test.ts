import { describe, expect, it } from 'vitest';
import type { Chord } from './chords';
import { chordToneIndex, voiceChord, voiceChordTones, type SpreadStyle } from './voicing';

function chord(edo: number, steps: number[]): Chord {
  return {
    name: 'test',
    templateId: 'test',
    edo,
    rootPc: 0,
    steps,
    roles: [],
    tier: 'simple',
    pcs: steps.map((s) => s % edo),
  };
}

const Am = chord(12, [0, 3, 7]); // A C E
const Cmaj7 = chord(12, [0, 4, 7, 11]);
const C = { kind: 'bass', midicents: 6000 } as const;
const close = (inversion: number) => ({ inversion, spread: 'close' as const });
const spreadOf = (spread: SpreadStyle) => ({ inversion: 0, spread });

describe('voiceChord: inversions', () => {
  it('Am first inversion from bass C4 gives C4 E4 A4', () => {
    expect(voiceChord(Am, C, close(1))).toEqual([6000, 6400, 6900]);
  });

  it('root position and second inversion', () => {
    expect(voiceChord(Am, C, close(0))).toEqual([6000, 6300, 6700]);
    expect(voiceChord(Am, C, close(2))).toEqual([6000, 6500, 6800]);
  });

  it('wraps beyond the chord size: inversion n equals root position', () => {
    expect(voiceChord(Am, C, close(3))).toEqual(voiceChord(Am, C, close(0)));
    expect(voiceChord(Am, C, close(4))).toEqual(voiceChord(Am, C, close(1)));
    expect(voiceChord(Cmaj7, C, close(6))).toEqual(voiceChord(Cmaj7, C, close(2)));
  });

  it('wrapped inversion keeps tone indices and anchors a tone exactly', () => {
    const tones = voiceChordTones(Am, { kind: 'tone', index: 0, midicents: 5700 }, close(3));
    expect(tones.map((t) => t.index)).toEqual([0, 1, 2]);
    expect(tones[0].midicents).toBe(5700);
  });

  it('keeps a 9th chord ascending with the bass tone lowest', () => {
    const m9 = chord(12, [0, 3, 7, 10, 14]);
    expect(voiceChord(m9, C, close(1))).toEqual([6000, 6400, 6700, 6900, 7100]);
    const t = voiceChordTones(m9, C, close(1));
    expect(t[0].index).toBe(1);
  });
});

describe('voiceChord: spread styles', () => {
  it('drop2 of Cmaj7 close: G3 C4 E4 B4 (tone anchor on the root)', () => {
    const tones = voiceChordTones(
      Cmaj7,
      { kind: 'tone', index: 0, midicents: 6000 },
      spreadOf('drop2')
    );
    expect(tones.map((t) => [t.index, t.midicents])).toEqual([
      [2, 5500],
      [0, 6000],
      [1, 6400],
      [3, 7100],
    ]);
  });

  it('drop3 of Cmaj7 close: E3 C4 G4 B4', () => {
    const tones = voiceChordTones(
      Cmaj7,
      { kind: 'tone', index: 0, midicents: 6000 },
      spreadOf('drop3')
    );
    expect(tones.map((t) => [t.index, t.midicents])).toEqual([
      [1, 5200],
      [0, 6000],
      [2, 6700],
      [3, 7100],
    ]);
  });

  it('bass anchor puts the lowest sounding voice at the anchor after a drop', () => {
    expect(voiceChord(Cmaj7, C, spreadOf('drop2'))).toEqual([6000, 6500, 6900, 7600]);
  });

  it('drop2 on a triad drops the middle voice; drop3 needs 4 voices', () => {
    // C E G -> E drops: E3 C4 G4
    const tones = voiceChordTones(
      chord(12, [0, 4, 7]),
      { kind: 'tone', index: 0, midicents: 6000 },
      spreadOf('drop2')
    );
    expect(tones.map((t) => t.midicents)).toEqual([5200, 6000, 6700]);
    const tri = chord(12, [0, 4, 7]);
    expect(voiceChord(tri, C, spreadOf('drop3'))).toEqual(voiceChord(tri, C, spreadOf('close')));
  });

  it('drop2 on a dyad is unchanged', () => {
    const dyad = chord(12, [0, 7]);
    expect(voiceChord(dyad, C, spreadOf('drop2'))).toEqual([6000, 6700]);
  });

  it('drop2 applies to the inverted close voicing', () => {
    // Cmaj7 first inversion close: E G B C -> B drops: B3 E4 G4 C5
    const tones = voiceChordTones(
      Cmaj7,
      { kind: 'tone', index: 0, midicents: 7200 },
      { inversion: 1, spread: 'drop2' }
    );
    expect(tones.map((t) => [t.index, t.midicents])).toEqual([
      [3, 5900],
      [1, 6400],
      [2, 6700],
      [0, 7200],
    ]);
  });

  it('open raises the 2nd and 4th voices an octave', () => {
    // C E G B -> C G E5 B5
    expect(voiceChord(Cmaj7, C, spreadOf('open'))).toEqual([6000, 6700, 7600, 8300]);
  });

  it('open on a triad raises the middle voice', () => {
    expect(voiceChord(chord(12, [0, 4, 7]), C, spreadOf('open'))).toEqual([6000, 6700, 7600]);
  });
});

describe('voiceChord: non-12 EDO', () => {
  it('19-EDO: exact step arithmetic, no semitone rounding', () => {
    const tri = chord(19, [0, 5, 11]);
    const out = voiceChord(tri, C, close(1));
    const sc = 1200 / 19;
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(6000);
    expect(out[1]).toBeCloseTo(6000 + 6 * sc, 9);
    expect(out[2]).toBeCloseTo(6000 + 14 * sc, 9);
    expect(Number.isInteger(out[1])).toBe(false);
  });

  it('31-EDO seventh chord drop2 equals step arithmetic', () => {
    const sev = chord(31, [0, 10, 18, 26]);
    const sc = 1200 / 31;
    const out = voiceChord(sev, { kind: 'tone', index: 0, midicents: 6000 }, spreadOf('drop2'));
    // voices: 0,10,18,26 -> 18 drops an octave: -13, 0, 10, 26
    expect(out).toHaveLength(4);
    [-13, 0, 10, 26].forEach((s, i) => expect(out[i]).toBeCloseTo(6000 + s * sc, 9));
  });
});

describe('voiceChord: tone anchor', () => {
  const chords = [Am, Cmaj7, chord(19, [0, 5, 11]), chord(31, [0, 10, 18, 26, 45])];
  const spreads: SpreadStyle[] = ['close', 'open', 'drop2', 'drop3'];
  it('the chosen tone sits exactly at the anchor for every inversion and spread', () => {
    for (const ch of chords) {
      for (let inversion = 0; inversion <= ch.steps.length * 2; inversion++) {
        for (const spread of spreads) {
          for (let index = 0; index < ch.steps.length; index++) {
            const tones = voiceChordTones(
              ch,
              { kind: 'tone', index, midicents: 7234 },
              {
                inversion,
                spread,
              }
            );
            expect(tones.find((t) => t.index === index)?.midicents).toBe(7234);
            const sorted = tones.map((t) => t.midicents);
            expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
            expect(tones).toHaveLength(ch.steps.length);
          }
        }
      }
    }
  });

  it('root-mode placement: Am with root A4 clicked, first inversion gives C4 E4 A4', () => {
    const out = voiceChord(Am, { kind: 'tone', index: 0, midicents: 6900 }, close(1));
    expect(out).toEqual([6000, 6400, 6900]);
  });

  it('chordToneIndex finds a pitch class and throws when absent', () => {
    const am: Chord = { ...chord(12, [0, 3, 7]), pcs: [9, 0, 4] };
    expect(chordToneIndex(am, 4)).toBe(2);
    expect(chordToneIndex(am, 9)).toBe(0);
    expect(() => chordToneIndex(am, 1)).toThrow(RangeError);
  });

  it('rejects bad edo, unknown spread and non-ascending steps', () => {
    for (const edo of [0, -12, 12.5]) {
      expect(() => voiceChord(chord(edo, [0, 4, 7]), C, close(0))).toThrow(RangeError);
    }
    expect(() =>
      voiceChord(Am, C, { inversion: 0, spread: 'wide' as unknown as SpreadStyle })
    ).toThrow(RangeError);
    expect(() => voiceChord(chord(12, [0, 7, 4]), C, close(0))).toThrow(RangeError);
    expect(() => voiceChord(chord(12, [0, 4, 4]), C, close(0))).toThrow(RangeError);
    expect(() => voiceChordTones(chord(0, [0, 4]), C, close(0))).toThrow(RangeError);
  });

  it('rejects an out-of-range tone index and a bad inversion', () => {
    expect(() => voiceChord(Am, { kind: 'tone', index: 3, midicents: 0 }, close(0))).toThrow(
      RangeError
    );
    expect(() => voiceChord(Am, C, close(-1))).toThrow(RangeError);
  });
});

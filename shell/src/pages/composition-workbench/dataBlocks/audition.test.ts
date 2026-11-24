import { describe, expect, it } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import {
  packet,
  type DataDomain,
  type DataEncoding,
  type DataKind,
  type PacketFrame,
} from '../model';
import { musicalDuration, rational, rationalToNumber } from '../musicalTime';
import { defaultSoundSettings, layerSound } from '../sounds';
import { registerConversion } from './acceptance';
import { auditionBlock, EMPTY_AUDITION_REASON, HEAR_AS_CONVERSION_IDS } from './audition';
import { defaultAuditionContext } from './auditionPlans';
import {
  auditionSupport,
  DATA_BLOCK_SCHEMA_VERSION,
  defaultAuditionSettings,
  getDataBlockType,
  registerDataBlockType,
  type AuditionSettings,
  type PacketBlock,
} from './registry';
import './types';

function block(
  typeId: string,
  name: string,
  kind: DataKind,
  domain: DataDomain,
  values: unknown[],
  semantics: { encoding?: DataEncoding; frame?: PacketFrame } = {}
): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id: name.toLowerCase().replace(/\s+/g, '-'),
    typeId,
    name,
    createdAt: '2026-11-24T00:00:00Z',
    payload: {
      kind: 'packet',
      packet: packet(
        kind,
        domain,
        values.map((value, index) => ({ id: `i${index}`, value, provenance: [] })),
        [],
        undefined,
        semantics
      ),
    },
  };
}

const settings = (patch: Partial<AuditionSettings> = {}): AuditionSettings => ({
  ...defaultAuditionSettings,
  ...patch,
});

function planOf(result: ReturnType<typeof auditionBlock>): MusicalPerformancePlan {
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.plan;
}

const pitches = (plan: MusicalPerformancePlan) => plan.events.map((e) => e.pitchMidicents);
const starts = (plan: MusicalPerformancePlan) =>
  plan.events.map((e) => rationalToNumber(e.at.quarterNotes));

describe('A2: a pitch set plays exactly its pitches', () => {
  // The human's `0 1 4 6` above middle C, stored as midicents, deliberately out of order.
  const ring = block('pitch-set', 'Ring A', 'list', 'pitch', [6600, 6000, 6400, 6100], {
    encoding: 'midicent',
  });

  it('in sequence: ascending, one quarter each, back to back, no extra octave note', () => {
    const result = auditionBlock(ring, settings());
    const plan = planOf(result);
    expect(pitches(plan)).toEqual([6000, 6100, 6400, 6600]);
    expect(starts(plan)).toEqual([0, 1, 2, 3]);
    expect(plan.events.every((e) => e.duration.quarterNotes.numerator === 1)).toBe(true);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(4));
  });

  it('together: the same four pitches as one group, one quarter long', () => {
    const result = auditionBlock(ring, settings({ mode: 'together' }));
    const plan = planOf(result);
    expect(pitches(plan)).toEqual([6000, 6100, 6400, 6600]);
    expect(starts(plan)).toEqual([0, 0, 0, 0]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(1));
  });

  it('ignores base octave and offset: they are for pitch classes', () => {
    const plan = planOf(auditionBlock(ring, settings({ baseOctave: 6, offset: 5 })));
    expect(pitches(plan)).toEqual([6000, 6100, 6400, 6600]);
  });

  it('A3: a 19-EDO 5-step set plays as stored, fractional midicents kept', () => {
    const step = 1200 / 19;
    const set = block('pitch-set', 'Nineteen', 'list', 'pitch', [6000 + 5 * step, 6000], {
      encoding: 'midicent',
    });
    expect(pitches(planOf(auditionBlock(set, settings())))).toEqual([6000, 6000 + 5 * step]);
  });

  it('reads a bracketed group as its pitches', () => {
    const chord = block('pitch-set', 'Chord', 'list', 'pitch', [[6000, 6400], 6700]);
    expect(pitches(planOf(auditionBlock(chord, settings())))).toEqual([6000, 6400, 6700]);
  });
});

describe('A4: pitch classes need a register', () => {
  const triad = block('pitch-classes', 'Triad', 'list', 'pitchClass', [0, 4, 7], {
    encoding: 'chromatic-12',
  });

  it('offset 0 at octave 4 gives 0, 4, 7 above middle C', () => {
    expect(pitches(planOf(auditionBlock(triad, settings())))).toEqual([6000, 6400, 6700]);
  });

  it('offset 3 gives pitch classes 3, 7, 10: no wrap, no mod', () => {
    expect(pitches(planOf(auditionBlock(triad, settings({ offset: 3 }))))).toEqual([
      6300, 6700, 7000,
    ]);
    // 7 + 7 would wrap past the octave in a mod reading; here it climbs.
    expect(pitches(planOf(auditionBlock(triad, settings({ offset: 7 }))))).toEqual([
      6700, 7100, 7400,
    ]);
  });

  it('base octave 5 shifts everything by 1200 cents', () => {
    expect(pitches(planOf(auditionBlock(triad, settings({ baseOctave: 5 }))))).toEqual([
      7200, 7600, 7900,
    ]);
  });

  it('plays together as one group', () => {
    const plan = planOf(auditionBlock(triad, settings({ mode: 'together' })));
    expect(starts(plan)).toEqual([0, 0, 0]);
  });

  it('reads the EDO from the encoding: chromatic-19 steps are 1200/19 cents', () => {
    const nineteen = block('pitch-classes', 'Nineteen', 'list', 'pitchClass', [0, 11], {
      encoding: 'chromatic-19',
    });
    const [low, high] = pitches(planOf(auditionBlock(nineteen, settings({ offset: 1 }))));
    expect(low).toBeCloseTo(6000 + 1200 / 19);
    expect(high).toBeCloseTo(6000 + (12 * 1200) / 19);
  });

  it('reads the events form (the desk To pitch classes) and leaves the data alone', () => {
    const events = block(
      'pitch-classes',
      'Events',
      'events',
      'pitchClass',
      [{ pitchClasses: [4, 7] }, { pitchClasses: [0] }],
      { encoding: 'chromatic-12' }
    );
    const before = JSON.stringify(events);
    expect(pitches(planOf(auditionBlock(events, settings({ offset: 3 }))))).toEqual([
      6300, 6700, 7000,
    ]);
    expect(JSON.stringify(events)).toBe(before);
  });
});

describe('pitch classes in the events form play as a set (vetoable, W-63)', () => {
  it('Melody C4 E4 C5 G4 is events [0], [4], [0], [7]: plays 0 4 7 once each, timing ignored', () => {
    const melody = block(
      'pitch-classes',
      'Melody classes',
      'events',
      'pitchClass',
      [{ pitchClasses: [0] }, { pitchClasses: [4] }, { pitchClasses: [0] }, { pitchClasses: [7] }],
      { encoding: 'chromatic-12' }
    );
    const plan = planOf(auditionBlock(melody, settings()));
    expect(pitches(plan)).toEqual([6000, 6400, 6700]);
    expect(starts(plan)).toEqual([0, 1, 2]);
  });
});

describe('A1: notes play as written', () => {
  it('Melody C4 D4 E4 G4 keeps its positions, pitches and length', () => {
    const value = (index: number, midicents: number) => ({
      onset: { quarterNotes: rational(index) },
      interOnset: musicalDuration(1),
      duration: musicalDuration(1),
      pitches: [midicents],
      velocity: 1,
    });
    const melody = block('notes', 'Melody', 'events', 'note', [
      value(0, 6000),
      value(1, 6200),
      value(2, 6400),
      value(3, 6700),
    ]);
    const result = auditionBlock(melody, settings({ mode: 'together', offset: 4 }));
    const plan = planOf(result);
    expect(pitches(plan)).toEqual([6000, 6200, 6400, 6700]);
    expect(starts(plan)).toEqual([0, 1, 2, 3]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(4));
    expect(result.ok && result.label).toBe('Auditioning Melody.');
  });
});

describe('A5: a rhythm plays as dry clicks, one cycle', () => {
  // 3-2 son clave in sixteenths: onsets at 0, 3, 6, 10, 12 of a 16-sixteenth cycle.
  const clave = block('rhythm', 'Clave', 'list', 'duration', [3, 3, 4, 2, 4], {
    frame: { topology: 'cyclic', unit: 'pulse', extent: 16 },
  });

  it('puts the onsets at 0, 3/4, 3/2, 5/2, 3 quarters of a 4-quarter cycle', () => {
    const result = auditionBlock(clave, settings());
    const plan = planOf(result);
    expect(plan.events.map((e) => e.at.quarterNotes)).toEqual([
      rational(0),
      rational(3, 4),
      rational(3, 2),
      rational(5, 2),
      rational(3),
    ]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(4));
    expect(plan.duration).toEqual(musicalDuration(4));
  });

  it('uses the rhythm voice of the sound settings by default (the woodblock), not a click', () => {
    const plan = planOf(auditionBlock(clave, settings({ loop: false })));
    const voice = layerSound(defaultSoundSettings.rhythm, 0);
    expect(defaultAuditionContext.rhythmSound).toEqual(voice);
    expect(new Set(plan.events.map((e) => e.pitchMidicents))).toEqual(
      new Set([voice.pitchMidicents])
    );
    expect(new Set(plan.events.map((e) => e.instrumentId))).toEqual(new Set(['sound.woodblock']));
  });

  it('takes the sound from context.rhythmSound when given', () => {
    const rhythmSound = { instrumentId: 'sound.drum' as const, pitchMidicents: 3600 };
    const plan = planOf(
      auditionBlock(clave, settings(), undefined, { ...defaultAuditionContext, rhythmSound })
    );
    expect(
      plan.events.every((e) => e.instrumentId === 'sound.drum' && e.pitchMidicents === 3600)
    ).toBe(true);
  });

  it('a pulse of eighths (context) makes the onsets twice as long, and the cycle too', () => {
    const open = block('rhythm', 'Open clave', 'list', 'duration', [3, 3, 4, 2, 4]);
    const eighths = { ...defaultAuditionContext, pulseUnit: musicalDuration(1, 2) };
    const result = auditionBlock(open, settings(), undefined, eighths);
    expect(starts(planOf(result))).toEqual([0, 1.5, 3, 5, 6]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(8));
  });

  it('the frame extent wins over the sum of the durations', () => {
    // The durations sum to 8 pulses but the frame says 16: a 4-quarter cycle with 2 quarters of rest.
    const padded = block('rhythm', 'Padded', 'list', 'duration', [3, 3, 2], {
      frame: { topology: 'cyclic', unit: 'pulse', extent: 16 },
    });
    const result = auditionBlock(padded, settings());
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(4));
    expect(starts(planOf(result))).toEqual([0, 0.75, 1.5]);
  });

  it('the pulse comes from musicalExtent / extent when the frame has both', () => {
    const framed = block('rhythm', 'Framed', 'list', 'duration', [2, 2], {
      frame: {
        topology: 'cyclic',
        unit: 'pulse',
        extent: 4,
        musicalExtent: musicalDuration(3),
      },
    });
    const result = auditionBlock(framed, settings());
    // 4 pulses over 3 quarters: a pulse is 3/4 of a quarter, the second onset at 3/2.
    expect(starts(planOf(result))).toEqual([0, 1.5]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(3));
  });

  it('unit quarterNote counts pulses as quarters, whatever the context pulse', () => {
    const quarters = block('rhythm', 'Quarters', 'list', 'duration', [1, 2, 1], {
      frame: { topology: 'linear', unit: 'quarterNote', extent: 4 },
    });
    const result = auditionBlock(quarters, settings());
    expect(starts(planOf(result))).toEqual([0, 1, 3]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(4));
  });

  it('a cyclic rhythm starting late wraps its tail to the start of the cycle', () => {
    // Starts on pulse 2 of a 4-pulse (quarter) cycle: onsets at 2, 3 and 4, and 4 wraps to 0.
    const late = block('rhythm', 'Late', 'list', 'duration', [1, 1, 2], {
      frame: { topology: 'cyclic', unit: 'quarterNote', extent: 4, origin: 2 },
    });
    expect(starts(planOf(auditionBlock(late, settings())))).toEqual([0, 2, 3]);
  });

  it('a tie joins 2 and 1 into one three-pulse click, so onsets are at pulses 0 and 3', () => {
    const tied: PacketBlock = block('rhythm', 'Tied', 'list', 'duration', [2, 1, 1]);
    tied.payload.packet.items[0].tie = true;
    const result = auditionBlock(tied, settings());
    expect(starts(planOf(result))).toEqual([0, 0.75]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(1));
  });

  it('reads a rhythm pattern as pulses that are onsets or rests', () => {
    const pattern = block('rhythm', 'Pattern', 'list', 'rhythmPattern', [{ bits: [1, 0, 1, 1] }]);
    const result = auditionBlock(pattern, settings());
    expect(starts(planOf(result))).toEqual([0, 0.5, 0.75]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(1));
  });

  it('with no frame the cycle is the sum of the durations; rests make no click', () => {
    const open = block('rhythm', 'Open', 'list', 'duration', [2, -1, 1]);
    const result = auditionBlock(open, settings());
    expect(starts(planOf(result))).toEqual([0, 0.75]);
    expect(result.ok && result.cycleLength).toEqual(musicalDuration(1));
  });
});

describe('A6: Values have no sound unless the listener chooses', () => {
  const values = block('values', 'Numbers', 'list', 'integer', [3, 5, 8]);

  it('refuses with the exact text', () => {
    expect(auditionBlock(values, settings())).toEqual({
      ok: false,
      reason: 'Values have no sound of their own.',
    });
  });

  it('Hear as MIDI note numbers plays 3, 5, 8 as 300, 500, 800 midicents, data unchanged', () => {
    const before = JSON.stringify(values);
    const plan = planOf(auditionBlock(values, settings(), 'values-as-midi-notes'));
    expect(pitches(plan)).toEqual([300, 500, 800]);
    expect(JSON.stringify(values)).toBe(before);
    const together = planOf(
      auditionBlock(values, settings({ mode: 'together' }), 'values-as-midi-notes')
    );
    expect(starts(together)).toEqual([0, 0, 0]);
  });

  it('keeps rationals unrounded and plays 60 as C4', () => {
    const mixed = block('values', 'Mixed', 'list', 'rational', [
      60,
      61.5,
      { numerator: 1, denominator: 4 },
    ]);
    expect(pitches(planOf(auditionBlock(mixed, settings(), 'values-as-midi-notes')))).toEqual([
      25, 6000, 6150,
    ]);
  });

  it('empty Values refuse even when heard as MIDI notes; a wrong conversion refuses', () => {
    const none = block('values', 'None', 'list', 'integer', []);
    expect(auditionBlock(none, settings(), 'values-as-midi-notes')).toEqual({
      ok: false,
      reason: EMPTY_AUDITION_REASON,
    });
    const ring = block('pitch-set', 'Ring', 'list', 'pitch', [6000]);
    expect(auditionBlock(ring, settings(), 'values-as-midi-notes').ok).toBe(false);
    expect(auditionBlock(values, settings(), 'no-such-conversion').ok).toBe(false);
  });
});

describe('hear as', () => {
  it('only conversions meant for hearing are accepted', () => {
    expect(HEAR_AS_CONVERSION_IDS).toEqual(['values-as-midi-notes']);
    const values = block('values', 'Numbers', 'list', 'integer', [3]);
    expect(auditionBlock(values, settings(), 'some-other-conversion').ok).toBe(false);
  });

  it('values that are not numbers refuse with a reason instead of throwing', () => {
    const odd = block('values', 'Odd', 'list', 'integer', [3, 'x']);
    expect(auditionBlock(odd, settings(), 'values-as-midi-notes')).toEqual({
      ok: false,
      reason: 'Some values are not numbers, so they cannot be heard as MIDI notes.',
    });
  });
});

describe('refusals are never silent', () => {
  it('A8: every type with an audition refuses an empty block with the exact text', () => {
    const empties = [
      block('notes', 'E1', 'events', 'note', []),
      block('pitch-set', 'E2', 'list', 'pitch', []),
      block('pitch-classes', 'E3', 'list', 'pitchClass', []),
      block('rhythm', 'E4', 'list', 'duration', []),
    ];
    empties.forEach((empty) => {
      expect(auditionBlock(empty, settings())).toEqual({
        ok: false,
        reason: 'This data-block is empty, so there is nothing to play yet.',
      });
    });
  });

  it('List and Bank refuse with their own text', () => {
    expect(auditionBlock(block('list', 'L', 'list', 'symbol', ['a']), settings())).toEqual({
      ok: false,
      reason: 'A List has no sound of its own; use Hear as ... or a node.',
    });
    expect(auditionBlock(block('bank', 'B', 'bank', 'symbol', ['a']), settings())).toEqual({
      ok: false,
      reason: 'A Bank has no sound of its own; use Hear as ... or a node.',
    });
  });

  it('an unregistered type refuses', () => {
    expect(auditionBlock(block('gone', 'G', 'list', 'pitch', [1]), settings())).toEqual({
      ok: false,
      reason: 'This data-block has no registered type.',
    });
  });

  it('an `audition: {}` definition counts as unsupported', () => {
    const bare = {
      id: 'bare-audition',
      label: 'Bare',
      family: 'generic',
      channels: [],
      payload: 'packet',
      accepts: () => false,
      createBlank: () => block('bare-audition', 'x', 'list', 'symbol', []),
      audition: {},
    } as unknown as Parameters<typeof registerDataBlockType>[0];
    expect(auditionSupport(bare)).toEqual({
      supported: false,
      reason: 'Bare has no audition yet.',
    });
    const remove = registerDataBlockType(bare);
    try {
      expect(
        auditionBlock(block('bare-audition', 'x', 'list', 'symbol', ['a']), settings())
      ).toEqual({ ok: false, reason: 'Bare has no audition yet.' });
    } finally {
      remove();
    }
  });

  it('the Hear-as conversion is registered once, and Values themselves stay silent', () => {
    expect(() =>
      registerConversion({
        id: 'values-as-midi-notes',
        from: 'values',
        to: 'pitch-set',
        label: 'x',
        describe: 'x',
        convert: (b) => b,
      })
    ).toThrow(/already registered/);
    expect(getDataBlockType('values')?.audition).toBeUndefined();
  });
});

describe('plans are musical: tempo is the transport job', () => {
  it('every plan is a musical-time plan with exact rational positions', () => {
    const ring = block('pitch-set', 'Ring', 'list', 'pitch', [6000, 6100]);
    const plan = planOf(auditionBlock(ring, settings()));
    expect(plan.timebase.kind).toBe('musical');
    expect(plan.events[1].at.quarterNotes).toEqual(rational(1));
  });
});

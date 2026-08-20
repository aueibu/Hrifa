import { packet } from './model';
import { interpretPitchList } from './pitch';
import {
  applyPitchRouteTreatment,
  applyRhythmRouteTreatment,
  defaultPitchRouteTreatment,
  defaultRhythmRouteTreatment,
  isPitchRouteTreatmentIdentity,
  isRhythmRouteTreatmentIdentity,
} from './routeTreatments';

describe('composition route treatments', () => {
  it('distinguishes bare identity wires from required or active treatment badges', () => {
    const concrete = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 64, 67',
    }).packet;
    const pitchClasses = interpretPitchList({
      instanceId: 'pitch-classes',
      format: 'pitch-class',
      inlineText: '[0 4 7]',
    }).packet;

    expect(isPitchRouteTreatmentIdentity(defaultPitchRouteTreatment, concrete)).toBe(true);
    // voiceAsPitch defaults to off: an untouched pitch-class route is identity too now, since
    // nothing forces it into a concrete register unless explicitly turned on.
    expect(isPitchRouteTreatmentIdentity(defaultPitchRouteTreatment, pitchClasses)).toBe(true);
    expect(
      isPitchRouteTreatmentIdentity(
        { ...defaultPitchRouteTreatment, voiceAsPitch: true },
        pitchClasses
      )
    ).toBe(false);
    expect(
      isPitchRouteTreatmentIdentity({ ...defaultPitchRouteTreatment, transposition: 2 }, concrete)
    ).toBe(false);
    expect(isRhythmRouteTreatmentIdentity(defaultRhythmRouteTreatment)).toBe(true);
    expect(
      isRhythmRouteTreatmentIdentity({ ...defaultRhythmRouteTreatment, durationScale: 2 })
    ).toBe(false);
  });

  it('leaves pitch classes raw by default (voiceAsPitch off)', () => {
    const source = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '[0 3 7]',
    }).packet;
    const result = applyPitchRouteTreatment(source, defaultPitchRouteTreatment)!;

    expect(result).toMatchObject({ kind: 'list', domain: 'pitchClass' });
    expect(
      (result.items[0].value as { pitches: { pitchClass: number }[] }).pitches.map(
        (pitch) => pitch.pitchClass
      )
    ).toEqual([0, 3, 7]);
  });

  it('transposes and inverts raw pitch classes mod 12 with voiceAsPitch off', () => {
    const source = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '[0 3 7]',
    }).packet;
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      transposition: 2,
      inverted: true,
    })!;

    expect(result.domain).toBe('pitchClass');
    expect(
      (result.items[0].value as { pitches: { pitchClass: number }[] }).pitches.map(
        (pitch) => pitch.pitchClass
      )
    ).toEqual([2, 11, 7]);
  });

  it('voices pitch classes into a concrete register when voiceAsPitch is on', () => {
    const source = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '[0 3 7]',
    }).packet;
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      voiceAsPitch: true,
    })!;

    expect(result).toMatchObject({ kind: 'list', domain: 'pitch', encoding: 'midicent' });
    expect(
      (result.items[0].value as { pitches: { midicents: number }[] }).pitches.map(
        (pitch) => pitch.midicents
      )
    ).toEqual([6000, 6300, 6700]);
    expect(result.items[0].provenance.at(-1)).toMatchObject({
      transformation: 'assign-register',
      parameters: { registerBaseMidi: 60, voicing: 'ascending-close' },
    });
  });

  it('combines inversion, transposition, voicing inversion, and sequence treatment', () => {
    const source = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '[0 3 7] 2',
    }).packet;
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      voiceAsPitch: true,
      inverted: true,
      transposition: 2,
      retrograde: true,
      rotation: 1,
      voicingInversion: 1,
    })!;

    expect(result.items.map((item) => item.label)).toEqual(['[G4 B4 D5]', 'C4']);
    expect(result.items[0].provenance.map((step) => step.transformation)).toEqual(
      expect.arrayContaining([
        'retrograde-sequence',
        'rotate-sequence',
        'invert-pitch-classes',
        'transpose-pitch-classes',
        'assign-register',
      ])
    );
  });

  it('treats concrete pitch material without rewriting the source packet', () => {
    const source = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60 64',
    }).packet;
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      transposition: 7,
    })!;

    expect(
      (result.items[0].value as { pitches: { midicents: number }[] }).pitches[0].midicents
    ).toBe(6700);
    expect(
      (source.items[0].value as { pitches: { midicents: number }[] }).pitches[0].midicents
    ).toBe(6000);
  });

  it('rotates, retrogrades, and scales rhythm material with provenance', () => {
    const source = packet(
      'list',
      'duration',
      [1, 2, 3].map((value, index) => ({
        id: `rhythm:${index}`,
        value,
        provenance: [],
      })),
      [],
      undefined,
      { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 6 } }
    );
    const result = applyRhythmRouteTreatment(source, {
      ...defaultRhythmRouteTreatment,
      retrograde: true,
      rotation: 1,
      durationScale: 2,
    })!;

    expect(result.items.map((item) => item.value)).toEqual([4, 2, 6]);
    expect(result.frame?.extent).toBe(12);
    expect(result.items[0].provenance.map((step) => step.transformation)).toEqual([
      'retrograde-sequence',
      'rotate-sequence',
      'scale-durations',
    ]);
  });

  it('bypasses without changing the packet identity', () => {
    const source = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '[0 3 7]',
    }).packet;
    expect(
      applyPitchRouteTreatment(source, { ...defaultPitchRouteTreatment, bypassed: true })
    ).toBe(source);
  });

  it('leaves a generic numeric source untouched by default (not pitch material yet)', () => {
    const source = packet(
      'list',
      'integer',
      [60, 62, 64].map((value, index) => ({ id: `n:${index}`, value, provenance: [] }))
    );
    const result = applyPitchRouteTreatment(source, defaultPitchRouteTreatment);
    expect(result).toBe(source);
    expect(result?.domain).toBe('integer');
  });

  it('reads a generic numeric source as MIDI notes when explicitly turned on', () => {
    const source = packet(
      'list',
      'integer',
      [60, 62, 64].map((value, index) => ({ id: `n:${index}`, value, provenance: [] }))
    );
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      readAsMidiNotes: true,
      midiNoteBase: 0,
    })!;
    expect(result.domain).toBe('pitch');
    expect(
      (result.items[0].value as { pitches: { midicents: number }[] }).pitches.map(
        (pitch) => pitch.midicents
      )
    ).toEqual([6000]);
    expect(result.items.map((item) => item.label)).toEqual(['C4', 'D4', 'E4']);
  });

  it('applies transpose to a read-as-MIDI-notes source', () => {
    const source = packet(
      'list',
      'integer',
      [60].map((value, index) => ({ id: `n:${index}`, value, provenance: [] }))
    );
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      readAsMidiNotes: true,
      midiNoteBase: 0,
      transposition: 2,
    })!;
    expect(
      (result.items[0].value as { pitches: { midicents: number }[] }).pitches[0].midicents
    ).toBe(6200);
  });

  it('defaults the MIDI note base to 60 (C4), offsetting raw values from there', () => {
    const source = packet(
      'list',
      'integer',
      [0].map((value, index) => ({ id: `n:${index}`, value, provenance: [] }))
    );
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      readAsMidiNotes: true,
    })!;
    expect(
      (result.items[0].value as { pitches: { midicents: number }[] }).pitches[0].midicents
    ).toBe(6000);
    expect(result.items[0].label).toBe('C4');
  });

  it('reads a chord (number[] item, from a mismatched-domain Arithmetic result) as MIDI notes', () => {
    // Arithmetic keeps a grouped side's structure as a raw array when domains mismatch (see
    // arithmetic.test.ts's "falls back to an honest neutral domain..." case) — item.value can
    // be [3, 7], not just a bare number.
    const source = packet('list', 'integer', [
      { id: 'g:0', value: [3, 7], provenance: [] },
    ]);
    const result = applyPitchRouteTreatment(source, {
      ...defaultPitchRouteTreatment,
      readAsMidiNotes: true,
      midiNoteBase: 0,
    })!;
    expect(result.domain).toBe('pitch');
    expect(
      (result.items[0].value as { pitches: { midicents: number }[] }).pitches.map(
        (pitch) => pitch.midicents
      )
    ).toEqual([300, 700]);
    expect(result.items[0].label).toBe('[E♭-1 G-1]');
  });
});

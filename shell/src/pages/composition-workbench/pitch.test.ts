import { packet } from './model';
import { interpretPitchList, pitchFrequency, previewMidicents } from './pitch';

describe('pitch-list interpretation', () => {
  it('reads MIDI notes without discarding fractional pitches', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 62, 66.5',
    });
    expect(result.errors).toEqual([]);
    expect(result.packet).toMatchObject({ kind: 'list', domain: 'pitch', role: 'pitchMaterial' });
    expect(
      result.packet.items.map((item) =>
        'midicents' in item.value.pitches[0] ? item.value.pitches[0].midicents : null
      )
    ).toEqual([6000, 6200, 6650]);
  });

  it('reads midicents and preserves note-name spelling', () => {
    expect(
      interpretPitchList({
        instanceId: 'pitch-list',
        format: 'midicent',
        inlineText: '6000 6050',
      }).packet.items.map((item) =>
        'midicents' in item.value.pitches[0] ? item.value.pitches[0].midicents : null
      )
    ).toEqual([6000, 6050]);
    const named = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'note-name',
      inlineText: 'C4, Bb3, F#4',
    });
    expect(named.packet.items.map((item) => item.value.pitches[0])).toMatchObject([
      { midicents: 6000, spelling: 'C4' },
      { midicents: 5800, spelling: 'Bb3' },
      { midicents: 6600, spelling: 'F#4' },
    ]);
  });

  it('preserves bracketed pitches as one ordered group', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'note-name',
      inlineText: 'C4 E4 [C4 E4 G4] C5 [C4 G4]',
    });

    expect(result.errors).toEqual([]);
    expect(
      result.packet.items.map((item) => item.value.pitches.map((pitch) => pitch.label))
    ).toEqual([['C4'], ['E4'], ['C4', 'E4', 'G4'], ['C5'], ['C4', 'G4']]);
    expect(result.packet.items[2].label).toBe('[C4 E4 G4]');
    expect(result.packet.items[2].provenance[0].parameters).toMatchObject({ grouped: true });
  });

  it('rejects malformed or partially invalid groups without flattening them', () => {
    const malformed = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60 [64 nope] [67',
    });

    expect(malformed.packet.items.map((item) => item.value.label)).toEqual(['C4']);
    expect(malformed.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/missing a closing bracket/),
        expect.stringMatching(/nope: enter a finite number/),
      ])
    );
  });

  it('keeps pitch classes unregistered while providing an explicit preview register', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '0, D, F#',
    });
    expect(result.packet.domain).toBe('pitchClass');
    expect(
      result.packet.items.map((item) =>
        'pitchClass' in item.value.pitches[0] ? item.value.pitches[0].pitchClass : null
      )
    ).toEqual([0, 2, 6]);
    expect(previewMidicents(result.packet.items[2].value.pitches[0], 4)).toBe(6600);
  });

  it('retains catalog provenance on the pitch group that supplied it', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '0 [0 3 7]',
      inlineProvenance: {
        '1': [
          {
            sourceModuleInstance: 'pitch-list',
            sourceItemIds: [],
            transformation: 'select-forte-set',
            parameters: { forteNumber: '3-11', transposition: 0, inverted: false },
          },
        ],
      },
    });

    expect(result.packet.items[0].provenance).toHaveLength(1);
    expect(result.packet.items[1].provenance.map((step) => step.transformation)).toEqual([
      'select-forte-set',
      'read-as-pitch-class',
    ]);
    expect(result.packet.items[1].provenance[0].parameters).toMatchObject({
      forteNumber: '3-11',
    });
  });

  it('rejects rather than wrapping or clamping invalid values', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '12, C',
    });
    expect(result.errors[0]).toMatch(/0 to 11/);
    expect(result.packet.items).toHaveLength(1);
  });

  it('defers to an upstream typed packet and an upstream raw list', () => {
    const typed = packet('list', 'pitch', [
      {
        id: 'upstream:pitch:0',
        value: { midicents: 6900, label: 'A4', sourceValue: 69 },
        provenance: [],
      },
    ]);
    expect(
      interpretPitchList({
        instanceId: 'pitch-list',
        format: 'pitch-class',
        inlineText: '0',
        upstream: typed,
      }).packet.items[0].value.pitches
    ).toMatchObject([{ midicents: 6900, label: 'A4' }]);

    const raw = packet('list', 'integer', [
      { id: 'math:0', value: 60, provenance: [] },
      { id: 'math:1', value: 64, provenance: [] },
    ]);
    const interpreted = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '72',
      upstream: raw,
    });
    expect(interpreted.source).toBe('upstream');
    expect(
      interpreted.packet.items.map((item) =>
        'midicents' in item.value.pitches[0] ? item.value.pitches[0].midicents : null
      )
    ).toEqual([6000, 6400]);
    expect(interpreted.packet.items[0].provenance[0].sourceItemIds).toEqual(['math:0']);
  });

  it('converts midicents to frequency without semitone quantization', () => {
    expect(pitchFrequency(6900)).toBeCloseTo(440);
    expect(pitchFrequency(6950)).toBeCloseTo(452.893, 3);
  });
});

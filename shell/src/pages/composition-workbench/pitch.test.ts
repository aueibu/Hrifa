import { packet } from './model';
import {
  interpretPitchList,
  pitchClassPreviewMidicents,
  pitchFrequency,
  type PitchClassItemValue,
  type PitchItemValue,
} from './pitch';

describe('pitch-list interpretation', () => {
  it('reads MIDI notes without discarding fractional pitches', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 62, 66.5',
    });
    expect(result.errors).toEqual([]);
    expect(result.packet).toMatchObject({ kind: 'list', domain: 'pitch', role: 'pitchMaterial' });
    expect(result.packet.items.map((item) => item.value)).toEqual([6000, 6200, 6650]);
  });

  it('reads midicents and preserves note-name spelling as the displayed label', () => {
    expect(
      interpretPitchList({
        instanceId: 'pitch-list',
        format: 'midicent',
        inlineText: '6000 6050',
      }).packet.items.map((item) => item.value)
    ).toEqual([6000, 6050]);
    const named = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'note-name',
      inlineText: 'C4, Bb3, F#4',
    });
    expect(named.packet.items.map((item) => item.value)).toEqual([6000, 5800, 6600]);
    expect(named.packet.items.map((item) => item.label)).toEqual(['C4', 'Bb3', 'F#4']);
  });

  it('preserves bracketed pitches as one ordered group', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'note-name',
      inlineText: 'C4 E4 [C4 E4 G4] C5 [C4 G4]',
    });

    expect(result.errors).toEqual([]);
    expect(result.packet.items.map((item) => item.value)).toEqual([
      6000,
      6400,
      [6000, 6400, 6700],
      7200,
      [6000, 6700],
    ]);
    expect(result.packet.items[2].label).toBe('[C4 E4 G4]');
    expect(result.packet.items[2].provenance[0].parameters).toMatchObject({ grouped: true });
  });

  it('rejects malformed or partially invalid groups without flattening them', () => {
    const malformed = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60 [64 nope] [67',
    });

    expect(malformed.packet.items.map((item) => item.label)).toEqual(['C4']);
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
    expect(result.packet.items.map((item) => item.value)).toEqual([0, 2, 6]);
    expect(
      pitchClassPreviewMidicents(result.packet.items[2].value as PitchClassItemValue, 4)
    ).toEqual([6600]);
  });

  it('preserves the literal typed spelling as source metadata, not a per-item field', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '0, D, Bb',
    });
    // "Bb" displays as typed (not canonicalized to "A#")...
    expect(result.packet.items.map((item) => item.label)).toEqual(['C', 'D', 'Bb']);
    // ...and the literal spelling is recorded once, on the packet, keyed by item id.
    const bbItem = result.packet.items[2];
    expect((result.packet.metadata?.spellings as Record<string, string> | undefined)?.[bbItem.id]).toBe(
      'Bb'
    );
    // A plain integer input has nothing to preserve — no spelling entry for it.
    const zeroItem = result.packet.items[0];
    expect((result.packet.metadata?.spellings as Record<string, string> | undefined)?.[zeroItem.id]).toBeUndefined();
  });

  it('preserves the literal typed note-name spelling as source metadata too', () => {
    const result = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'note-name',
      inlineText: 'Bb3',
    });
    const item = result.packet.items[0];
    expect((result.packet.metadata?.spellings as Record<string, string> | undefined)?.[item.id]).toBe(
      'Bb3'
    );
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

  it('defers to an upstream typed pitch packet and an upstream raw list', () => {
    const typed = packet<PitchItemValue>('list', 'pitch', [
      { id: 'upstream:pitch:0', value: 6900, provenance: [], label: 'A4' },
    ]);
    const passthrough = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '0',
      upstream: typed,
    });
    expect(passthrough.packet).toBe(typed);
    expect(passthrough.source).toBe('upstream');

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
    expect(interpreted.packet.items.map((item) => item.value)).toEqual([6000, 6400]);
    expect(interpreted.packet.items[0].provenance[0].sourceItemIds).toEqual(['math:0']);
  });

  it('reinterprets an upstream raw list as pitch classes when format says pitch-class', () => {
    // Regression: routing must not hardcode the concrete-pitch parser for every upstream source
    // that isn't already pitch/pitchClass domain — it must dispatch on `format` per token.
    const raw = packet('list', 'integer', [
      { id: 'n:0', value: 0, provenance: [] },
      { id: 'n:1', value: 4, provenance: [] },
      { id: 'n:2', value: 7, provenance: [] },
    ]);
    const interpreted = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '',
      upstream: raw,
    });
    expect(interpreted.packet.domain).toBe('pitchClass');
    expect(interpreted.packet.items.map((item) => item.value)).toEqual([0, 4, 7]);
  });

  it('passes an upstream pitchClass packet through unchanged (already bare numbers)', () => {
    const upstream = packet<PitchClassItemValue>('list', 'pitchClass', [
      { id: 'src:0', value: 3, provenance: [] },
      { id: 'src:1', value: [0, 4, 7], provenance: [] },
    ]);
    const interpreted = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'pitch-class',
      inlineText: '',
      upstream,
    });
    expect(interpreted.packet).toBe(upstream);
    expect(interpreted.source).toBe('upstream');
  });

  it('converts midicents to frequency without semitone quantization', () => {
    expect(pitchFrequency(6900)).toBeCloseTo(440);
    expect(pitchFrequency(6950)).toBeCloseTo(452.893, 3);
  });
});

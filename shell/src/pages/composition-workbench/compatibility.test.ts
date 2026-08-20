import { operationsForPacket } from './compatibility';
import { packet } from './model';

describe('packet compatibility', () => {
  it('offers direct, combination, and interpretation operations for cyclic inter-onset durations', () => {
    const result = operationsForPacket(
      packet('list', 'duration', [], [], undefined, {
        role: 'interOnset',
        frame: { topology: 'cyclic', unit: 'pulse', extent: 6 },
      })
    );
    expect(new Set(result.map((operation) => operation.group))).toEqual(
      new Set(['direct', 'combine', 'interpret'])
    );
    expect(result.map((operation) => operation.id)).toContain('assign-pitches');
    expect(result.find((operation) => operation.id === 'assign-pitches')?.target).toEqual({
      moduleId: 'melodicization',
      port: 'rhythm',
    });
  });

  it('does not treat an untyped integer list as a rhythmic cycle', () => {
    expect(operationsForPacket(packet('list', 'integer', []))).toEqual([]);
  });

  it('offers Melodicization for concrete and route-treated pitch classes', () => {
    const pitch = packet('list', 'pitch', [], [], undefined, { role: 'pitchMaterial' });
    const pitchClass = packet('list', 'pitchClass', [], [], undefined, {
      role: 'pitchMaterial',
    });
    expect(operationsForPacket(pitch).map((operation) => operation.id)).toContain('melodicization');
    expect(
      operationsForPacket(pitch).find((operation) => operation.id === 'melodicization')?.target
    ).toEqual({ moduleId: 'melodicization', port: 'pitches' });
    expect(operationsForPacket(pitchClass).map((operation) => operation.id)).toContain(
      'melodicization'
    );
    expect(
      operationsForPacket(pitchClass).find((operation) => operation.id === 'melodicization')?.target
    ).toEqual({ moduleId: 'melodicization', port: 'pitches' });
    expect(operationsForPacket(pitchClass).map((operation) => operation.id)).toContain(
      'voice-pitch-classes'
    );
  });
});

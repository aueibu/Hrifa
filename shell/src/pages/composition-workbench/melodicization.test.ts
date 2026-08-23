import { melodicize } from './melodicization';
import { packet, type DataPacket } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import { interpretPitchList } from './pitch';

function rhythmPacket(values = [2, 1, 1, 2]) {
  return packet(
    'list',
    'duration',
    values.map((value, index) => ({
      id: `rhythm:${index}`,
      value,
      provenance: [
        {
          sourceModuleInstance: 'interference',
          sourceItemIds: [`generator:${index}`],
          transformation: 'interference-resultant',
        },
      ],
    })),
    [],
    undefined,
    {
      role: 'interOnset',
      frame: {
        topology: 'cyclic',
        unit: 'pulse',
        extent: values.reduce((total, value) => total + value, 0),
      },
    }
  );
}

function pitchPacket(format: 'midi-note' | 'pitch-class' = 'midi-note') {
  return interpretPitchList({
    instanceId: 'pitch-list',
    format,
    inlineText: format === 'pitch-class' ? '0, 2' : '60, 62',
  }).packet;
}

function run(
  allocation: 'cycle' | 'cycle-rhythm' | 'zip' | 'cartesian',
  options: { rhythm?: DataPacket; pitches?: DataPacket; articulationPercent?: number } = {}
) {
  return melodicize({
    instanceId: 'melodicization',
    rhythm: options.rhythm ?? rhythmPacket(),
    pitches: options.pitches ?? pitchPacket(),
    allocation,
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: options.articulationPercent ?? 100,
  });
}

describe('melodicization', () => {
  it('cycles concrete pitches across the complete rhythmic spine', () => {
    const result = run('cycle');

    expect(result.errors).toEqual([]);
    expect(result.packet.items.map((item) => item.value.onset)).toEqual([
      musicalPosition(0),
      musicalPosition(1, 2),
      musicalPosition(3, 4),
      musicalPosition(1),
    ]);
    expect(result.packet.items.map((item) => item.value.pitches[0])).toEqual([
      6000, 6200, 6000, 6200,
    ]);
    expect(result.packet.frame).toMatchObject({
      topology: 'cyclic',
      unit: 'quarterNote',
      musicalExtent: musicalDuration(3, 2),
    });
  });

  it('cycles a shorter rhythm until every pitch group has played', () => {
    const pitches = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60 62 64 65 67',
    }).packet;
    const result = run('cycle-rhythm', {
      rhythm: rhythmPacket([2, 1]),
      pitches,
    });

    expect(result.errors).toEqual([]);
    expect(result.packet.items.map((item) => item.value.onset)).toEqual([
      musicalPosition(0),
      musicalPosition(1, 2),
      musicalPosition(3, 4),
      musicalPosition(5, 4),
      musicalPosition(3, 2),
    ]);
    expect(result.packet.items.map((item) => item.value.pitches[0])).toEqual([
      6000, 6200, 6400, 6500, 6700,
    ]);
    expect(result.packet.items.map((item) => item.provenance.at(-1)?.parameters)).toMatchObject([
      { attackIndex: 0, rhythmIndex: 0, pitchIndex: 0 },
      { attackIndex: 1, rhythmIndex: 1, pitchIndex: 1 },
      { attackIndex: 2, rhythmIndex: 0, pitchIndex: 2 },
      { attackIndex: 3, rhythmIndex: 1, pitchIndex: 3 },
      { attackIndex: 4, rhythmIndex: 0, pitchIndex: 4 },
    ]);
    expect(result.packet.frame).toMatchObject({
      topology: 'linear',
      musicalExtent: musicalDuration(2),
    });
  });

  it('makes Zip truncation explicit and changes an incomplete cycle to a line', () => {
    const result = run('zip');

    expect(result.packet.items).toHaveLength(2);
    expect(result.packet.frame).toMatchObject({
      topology: 'linear',
      musicalExtent: musicalDuration(3, 4),
    });
    expect(result.messages).toEqual(['2 trailing rhythm items unused by Zip.']);
    expect(result.packet.warnings).toContain('2 trailing rhythm items unused by Zip.');
  });

  it('creates simultaneous chord tones with Cartesian allocation', () => {
    const result = run('cartesian');

    expect(result.packet.items).toHaveLength(8);
    expect(result.packet.items.slice(0, 2).map((item) => item.value.onset)).toEqual([
      musicalPosition(0),
      musicalPosition(0),
    ]);
  });

  it('allocates one complete pitch group to each rhythmic attack', () => {
    const pitches = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60 [60 64 67] 62',
    }).packet;
    const result = run('cycle', { pitches });

    expect(result.packet.items).toHaveLength(4);
    expect(result.packet.items.map((item) => item.value.pitches)).toEqual([
      [6000],
      [6000, 6400, 6700],
      [6200],
      [6000],
    ]);
    expect(result.packet.items[1].value.onset).toEqual(musicalPosition(1, 2));
  });

  it('stores articulation as musical duration and preserves both source histories', () => {
    const result = run('cycle', { articulationPercent: 150 });
    const first = result.packet.items[0];

    expect(first.value.interOnset).toEqual(musicalDuration(1, 2));
    expect(first.value.duration).toEqual(musicalDuration(3, 4));
    expect(first.provenance.map((entry) => entry.transformation)).toEqual([
      'interference-resultant',
      'read-as-midi-note',
      'melodicize',
    ]);
    expect(first.provenance.at(-1)?.parameters).toMatchObject({
      allocation: 'cycle',
      articulationPercent: 150,
    });
  });

  it('requires pitch classes to receive an explicit register first', () => {
    const result = run('cycle', { pitches: pitchPacket('pitch-class') });

    expect(result.packet.items).toEqual([]);
    expect(result.errors).toEqual([
      'Pitch classes need an explicit register assignment before melodicization.',
    ]);
  });
});

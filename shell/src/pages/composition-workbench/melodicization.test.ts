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

  it('plays every pitch at every attack in turn with Cartesian allocation', () => {
    // Four attacks against five pitches realign after 20 attacks: five rhythm cycles, no stacking.
    const pitches = interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 62, 64, 65, 67',
    }).packet;
    const result = run('cartesian', { pitches });
    const items = result.packet.items;

    expect(items).toHaveLength(20);
    expect(
      new Set(
        items.map(
          (item) =>
            item.value.onset.quarterNotes.numerator / item.value.onset.quarterNotes.denominator
        )
      ).size
    ).toBe(20);
    const pairs = items.map((item) => {
      const parameters = item.provenance.at(-1)!.parameters as {
        rhythmIndex: number;
        pitchIndex: number;
      };
      return `${parameters.rhythmIndex}:${parameters.pitchIndex}`;
    });
    expect(new Set(pairs).size).toBe(20);
    expect(result.packet.frame).toMatchObject({ musicalExtent: musicalDuration(30, 4) });
  });

  it('still covers every pair when the cycle lengths share a factor', () => {
    const result = run('cartesian');
    const pairs = result.packet.items.map((item) => {
      const parameters = item.provenance.at(-1)!.parameters as {
        rhythmIndex: number;
        pitchIndex: number;
      };
      return `${parameters.rhythmIndex}:${parameters.pitchIndex}`;
    });

    expect(result.packet.items).toHaveLength(8);
    expect(new Set(pairs).size).toBe(8);
  });

  it('skips rests without consuming a pitch and merges tied items into one note', () => {
    // 2~ 1 is one three-pulse note; r2 is silence; 1 is a one-pulse note. Two attacks, two pitches.
    const rhythm = rhythmPacket([2, 1, -2, 1]);
    rhythm.items[0].tie = true;
    const result = run('cycle', { rhythm });
    const events = result.packet.items;

    expect(events).toHaveLength(2);
    expect(events.map((item) => item.value.pitches)).toEqual([[6000], [6200]]);
    expect(events.map((item) => item.value.onset)).toEqual([
      musicalPosition(0),
      musicalPosition(5, 4),
    ]);
    expect(events[0].value.interOnset).toEqual(musicalDuration(3, 4));
    expect(result.packet.frame).toMatchObject({ musicalExtent: musicalDuration(6, 4) });
  });

  it('places notes on fractional pulses exactly', () => {
    const result = run('cycle', { rhythm: rhythmPacket([2 * (3 / 5), 2 * (3 / 5), 3 / 5]) });
    expect(result.errors).toEqual([]);
    expect(result.packet.items.map((item) => item.value.onset)).toEqual([
      musicalPosition(0),
      musicalPosition(3, 10),
      musicalPosition(3, 5),
    ]);
    expect(result.packet.frame).toMatchObject({ musicalExtent: musicalDuration(3, 4) });
  });

  it('carries a grouping with fractional boundaries and units into musical time', () => {
    // Rhythm Edit can leave a grouping whose boundaries and unit size are fractions of a pulse.
    const rhythm = rhythmPacket([2, 1, 1, 2]);
    rhythm.frame = {
      ...rhythm.frame!,
      grouping: { id: 'g', label: 'g', units: 7 / 2, boundaries: [0, 7 / 2, 5 / 3] },
    };
    const result = run('cycle', { rhythm });
    expect(result.errors).toEqual([]);
    expect(result.packet.frame?.grouping?.musicalUnits).toEqual(musicalDuration(7, 8));
    expect(result.packet.frame?.grouping?.musicalBoundaries).toEqual([
      musicalPosition(0),
      musicalPosition(7, 8),
      musicalPosition(5, 12),
    ]);
  });

  it('reports a failure to place notes as an error instead of throwing', () => {
    const rhythm = rhythmPacket([2, 1, 1, 2]);
    rhythm.items[0].value = 1e300;
    const result = run('cycle', { rhythm });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('refuses a rhythm that is only rests and ties', () => {
    const result = run('cycle', { rhythm: rhythmPacket([-1, -2]) });
    expect(result.errors[0]).toMatch(/no attacks/);
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

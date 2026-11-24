import { describe, expect, it } from 'vitest';
import { acceptsDataBlocks, commitDataBlockEdit, type PacketBlock } from './dataBlock';
import { getDataBlockType, type BlankRequest } from './dataBlocks/registry';
import { barsLength } from './dataBlockTypes';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition, rational } from './musicalTime';
import {
  notesPropertiesError,
  notesPropertiesRefusal,
  editNotesProperties,
  freezeNotesProperties,
  hasNotesProperties,
  readNotesProperties,
  roundUpToBar,
  withNotesProperties,
} from './notesProperties';

function note(id: string, start: number, length: number): DataItem {
  return {
    id,
    value: {
      onset: musicalPosition(start),
      interOnset: musicalDuration(length),
      duration: musicalDuration(length),
      pitches: [6000],
      velocity: 1,
    },
    provenance: [],
  };
}

/** A data-block as it was stored before notes properties existed: items and maybe a frame, no more. */
const legacy = (items: DataItem[], extent?: number) => ({
  ...packet('events', 'note', items),
  ...(extent === undefined
    ? {}
    : {
        frame: {
          topology: 'linear' as const,
          unit: 'quarterNote' as const,
          extent,
          origin: 0,
          musicalExtent: musicalDuration(extent),
          musicalOrigin: musicalPosition(0),
        },
      }),
});

describe('reading notes properties', () => {
  it('fills the defaults for a data-block made before they existed', () => {
    expect(readNotesProperties(legacy([note('a', 0, 1)]))).toEqual({
      length: rational(4),
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(4),
      timeSignature: '4/4',
    });
    expect(readNotesProperties(packet('events', 'note', []))).toMatchObject({
      length: rational(4),
    });
  });

  it('gives an old data-block whose content runs past 4 quarters a whole number of bars, never shorter', () => {
    // Ends at 5: two bars of 4/4.
    expect(readNotesProperties(legacy([note('a', 3, 2)])).length).toEqual(rational(8));
    // Ends exactly on a bar line: stays that long.
    expect(readNotesProperties(legacy([note('a', 4, 4)])).length).toEqual(rational(8));
    expect(readNotesProperties(legacy([note('a', 10, 1)])).length).toEqual(rational(12));
    const long = readNotesProperties(legacy([note('a', 9, 4)]));
    expect(long.length).toEqual(rational(16));
    expect(long.loopEnd).toEqual(rational(16));
  });

  it('keeps the exact length a stored frame names, never rounding it up to a bar', () => {
    expect(readNotesProperties(legacy([], 8)).length).toEqual(rational(8));
    expect(readNotesProperties(legacy([], 2)).length).toEqual(rational(2));
    expect(readNotesProperties(legacy([], 6)).length).toEqual(rational(6));
    // A 3/4 data-block of 3 quarters stays 3.
    const threeFour = withNotesProperties(legacy([note('a', 0, 1)], 3), {
      ...readNotesProperties(legacy([], 3)),
      timeSignature: '3/4',
    });
    expect(readNotesProperties(threeFour).length).toEqual(rational(3));
  });

  it('rounds content past the stored frame up to a whole bar of the data-block meter', () => {
    expect(readNotesProperties(legacy([note('a', 3, 2)], 3)).length).toEqual(rational(8));
    // No frame, a 3/4 meter stored: content ends at 4, so two bars of 3/4.
    const threeFour = {
      ...legacy([note('a', 2, 2)]),
      metadata: { notes: { timeSignature: '3/4' } },
    };
    // Content ends at 4: two bars of 3/4.
    expect(readNotesProperties(threeFour).length).toEqual(rational(6));
  });

  it('reads each stored field and falls back per field when one is malformed', () => {
    const stored = withNotesProperties(legacy([], 8), {
      length: rational(8),
      start: rational(1),
      loopOn: false,
      loopStart: rational(2),
      loopEnd: rational(6),
      timeSignature: '3/4',
    });
    expect(readNotesProperties(stored)).toEqual({
      length: rational(8),
      start: rational(1),
      loopOn: false,
      loopStart: rational(2),
      loopEnd: rational(6),
      timeSignature: '3/4',
    });
    const damaged = {
      ...stored,
      metadata: {
        notes: {
          start: 'x',
          loopOn: 3,
          loopStart: rational(2),
          loopEnd: rational(1),
          timeSignature: '4/3',
        },
      },
    };
    expect(readNotesProperties(damaged)).toEqual({
      length: rational(8),
      start: rational(0),
      loopOn: true,
      loopStart: rational(2),
      loopEnd: rational(8),
      timeSignature: '4/4',
    });
  });

  it('rounds up to a bar of the meter', () => {
    expect(roundUpToBar(rational(3, 2), '7/8')).toEqual(rational(7, 2));
    expect(roundUpToBar(rational(4), '3/4')).toEqual(rational(6));
    expect(roundUpToBar(rational(0), '4/4')).toEqual(rational(4));
  });
});

const blankNotes = (request: BlankRequest) =>
  getDataBlockType('notes')!.createBlank(request) as PacketBlock;

describe('new data-blocks', () => {
  it('carry every property, with the meter they were made in', () => {
    const dataBlock = blankNotes({
      id: 'c',
      createdAt: '2026-11-12T00:00:00Z',
      name: 'c',
      length: rational(7, 2),
      timeSignature: '7/8',
    });
    expect(dataBlock.payload.packet.metadata?.notes).toEqual({
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(7, 2),
      timeSignature: '7/8',
    });
    expect(readNotesProperties(dataBlock.payload.packet)).toMatchObject({
      length: rational(7, 2),
      timeSignature: '7/8',
    });
    expect(acceptsDataBlocks([dataBlock])).toBe(true);
    const plainBlank = blankNotes({
      id: 'd',
      createdAt: 'x',
      name: 'd',
      length: barsLength('4/4', 1),
    });
    expect(readNotesProperties(plainBlank.payload.packet).timeSignature).toBe('4/4');
  });
});

describe('editing notes properties', () => {
  const base = withNotesProperties(legacy([note('a', 0, 1)], 8), {
    length: rational(8),
    start: rational(0),
    loopOn: true,
    loopStart: rational(0),
    loopEnd: rational(8),
    timeSignature: '4/4',
  });

  it('writes the whole set, keeping the length in the frame the editor already reads', () => {
    const edit = editNotesProperties(base, { length: rational(12), loopEnd: rational(12) });
    const written = (edit as { packet: DataPacket }).packet;
    expect(edit.ok).toBe(true);
    expect(written.frame).toMatchObject({ extent: 12, musicalExtent: musicalDuration(12) });
    expect(readNotesProperties(written).loopEnd).toEqual(rational(12));
    expect(written.items).toBe(base.items);
  });

  it('refuses nonsense and says why', () => {
    const refused = (change: Parameters<typeof editNotesProperties>[1]) => {
      const edit = editNotesProperties(base, change);
      return edit.ok ? null : edit.error;
    };
    expect(refused({ loopEnd: rational(0) })).toMatch(/loop length must be longer than zero/);
    expect(refused({ loopStart: rational(7) })).toBeNull();
    expect(refused({ loopStart: rational(8) })).toMatch(/loop length must be longer than zero/);
    expect(refused({ loopEnd: rational(9) })).toMatch(/within the total length/);
    expect(refused({ length: rational(6) })).toMatch(/within the total length/);
    expect(refused({ length: rational(0) })).toMatch(/longer than zero/);
    expect(refused({ start: rational(8) })).toMatch(/inside the data-block/);
    expect(refused({ start: rational(-1) })).toMatch(/inside the data-block/);
    expect(refused({ timeSignature: '4/3' })).toMatch(/time signature/);
    expect(notesPropertiesError(readNotesProperties(base))).toBeNull();
  });

  it('is a version of its own and stamps no provenance on the notes', () => {
    const dataBlock: PacketBlock = {
      schemaVersion: 2,
      typeId: 'notes',
      id: 's',
      name: 's',
      createdAt: '2026-11-12T00:00:00Z',
      payload: { kind: 'packet', packet: base },
    };
    const edit = editNotesProperties(base, { loopOn: false });
    expect(edit.ok).toBe(true);
    const result = commitDataBlockEdit(
      dataBlock,
      (edit as { packet: DataPacket }).packet,
      'edit-properties'
    ) as { dataBlock: PacketBlock };
    expect(result.dataBlock.lineage?.versions).toHaveLength(2);
    expect(result.dataBlock.lineage?.versions.at(-1)?.operation).toBe('edit-properties');
    expect(result.dataBlock.payload.packet.items[0].provenance).toEqual([]);
  });
});

describe('data-blocks the properties do not apply to', () => {
  const frameOf = (unit: 'pulse' | 'abstract', extent: number) => ({
    topology: 'cyclic' as const,
    unit,
    extent,
    origin: 0,
  });
  const pulse: DataPacket = {
    ...packet('events', 'rhythmPattern', [note('a', 0, 1)]),
    frame: frameOf('pulse', 7),
  };
  const abstract: DataPacket = {
    ...packet('list', 'integer', []),
    frame: frameOf('abstract', 5),
  };

  it('refuses the edit and the write, leaving the packet byte-identical', () => {
    for (const dataBlock of [pulse, abstract]) {
      const before = JSON.stringify(dataBlock);
      const edit = editNotesProperties(dataBlock, { length: rational(8) });
      expect(edit.ok).toBe(false);
      expect(hasNotesProperties(dataBlock)).toBe(false);
      expect(notesPropertiesRefusal(dataBlock)).toEqual(expect.any(String));
      expect(withNotesProperties(dataBlock, readNotesProperties(dataBlock))).toBe(dataBlock);
      expect(JSON.stringify(dataBlock)).toBe(before);
    }
  });

  it('refuses a notes data-block whose frame is not in quarter notes', () => {
    const cyclicNotes: DataPacket = {
      ...packet('events', 'note', [note('a', 0, 1)]),
      frame: frameOf('pulse', 7),
    };
    expect(editNotesProperties(cyclicNotes, { loopOn: false }).ok).toBe(false);
    expect(hasNotesProperties(legacy([note('a', 0, 1)], 4))).toBe(true);
    expect(hasNotesProperties(legacy([]))).toBe(true);
  });
});

describe('editing is exact and conservative', () => {
  it('keeps unknown keys already inside metadata.notes', () => {
    const base = legacy([], 8);
    const marked = { ...base, metadata: { notes: { future: 'kept', start: 'junk' } } };
    const edit = editNotesProperties(marked, { loopOn: false });
    expect(edit.ok && (edit.packet.metadata?.notes as Record<string, unknown>).future).toBe('kept');
  });

  it('an equivalent value is a no-op: same packet, no defaults written', () => {
    const base = legacy([], 8);
    const edit = editNotesProperties(base, { length: rational(16, 2), loopOn: true });
    expect(edit.ok && edit.packet).toBe(base);
  });
});

describe('melodicization packets and freezing', () => {
  const cyclicQuarterNotes: DataPacket = {
    ...packet('events', 'note', [note('a', 0, 1)]),
    frame: {
      topology: 'cyclic',
      unit: 'quarterNote',
      extent: 4,
      origin: 0,
      musicalExtent: musicalDuration(4),
      musicalOrigin: musicalPosition(0),
    },
  };

  it('refuses a cyclic note packet even when it is measured in quarter notes', () => {
    expect(notesPropertiesRefusal(cyclicQuarterNotes)).toEqual(expect.any(String));
    expect(hasNotesProperties(cyclicQuarterNotes)).toBe(false);
    expect(editNotesProperties(cyclicQuarterNotes, { loopOn: false }).ok).toBe(false);
    expect(freezeNotesProperties(cyclicQuarterNotes)).toBe(cyclicQuarterNotes);
  });

  it('freezes an old data-block with the full default set computed from its content now', () => {
    const old = legacy([note('a', 0, 1), note('b', 5, 1)]);
    const frozen = freezeNotesProperties(old);
    expect(frozen).not.toBe(old);
    expect(old.metadata?.notes).toBeUndefined();
    expect(frozen.metadata?.notes).toMatchObject({
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(8),
      timeSignature: '4/4',
    });
    expect(frozen.frame).toMatchObject({ extent: 8 });
    // Frozen once: reading it back is the same, and freezing again writes nothing.
    expect(readNotesProperties(frozen)).toEqual(readNotesProperties(old));
    expect(freezeNotesProperties(frozen)).toBe(frozen);
  });

  it('rejects a length over the cap', () => {
    const base = readNotesProperties(legacy([], 4));
    const longest = rational(4 * 72_000);
    const tooLong = rational(4 * 72_001);
    expect(notesPropertiesError({ ...base, length: longest, loopEnd: longest })).toBeNull();
    expect(notesPropertiesError({ ...base, length: tooLong, loopEnd: tooLong })).toMatch(
      /72000 bars/
    );
  });
});

describe('a data-block already over the 72000-bar cap', () => {
  const OVER = 4 * 80_000;

  it('reads as the cap, so its properties stay editable', () => {
    const far = legacy([note('far', OVER, 1)]);
    const props = readNotesProperties(far);
    expect(props.length).toEqual(rational(4 * 72_000));
    expect(props.loopEnd).toEqual(rational(4 * 72_000));
    expect(notesPropertiesError(props)).toBeNull();
    // A stored frame longer than the cap reads as the cap too.
    expect(readNotesProperties(legacy([note('a', 0, 1)], OVER)).length).toEqual(
      rational(4 * 72_000)
    );
  });

  it('freezes at the cap and a property edit is not locked out', () => {
    const frozen = freezeNotesProperties(legacy([note('far', OVER, 1)]));
    expect(frozen.frame).toMatchObject({ extent: 4 * 72_000 });
    const edit = editNotesProperties(frozen, { loopOn: false });
    expect(edit.ok).toBe(true);
    // Editing a never-frozen over-cap data-block works the same, and the content stays past the end.
    const direct = editNotesProperties(legacy([note('far', OVER, 1)]), { loopOn: false });
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.packet.items).toHaveLength(1);
      expect(readNotesProperties(direct.packet).length).toEqual(rational(4 * 72_000));
    }
  });
});

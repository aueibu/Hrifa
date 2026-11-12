import { describe, expect, it } from 'vitest';
import {
  clipPropertiesError,
  clipPropertiesRefusal,
  editClipProperties,
  freezeClipProperties,
  hasClipProperties,
  readClipProperties,
  roundUpToBar,
  withClipProperties,
} from './clipProperties';
import { blankSnippet } from './clipTypes';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition, rational } from './musicalTime';
import { acceptsSnippets, commitSnippetEdit, type Snippet } from './snippet';

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

/** A clip as it was stored before clip properties existed: items and maybe a frame, no more. */
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

describe('reading clip properties', () => {
  it('fills the defaults for a clip made before they existed', () => {
    expect(readClipProperties(legacy([note('a', 0, 1)]))).toEqual({
      length: rational(4),
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(4),
      timeSignature: '4/4',
    });
    expect(readClipProperties(packet('events', 'note', []))).toMatchObject({ length: rational(4) });
  });

  it('gives an old clip whose content runs past 4 quarters a whole number of bars, never shorter', () => {
    // Ends at 5: two bars of 4/4.
    expect(readClipProperties(legacy([note('a', 3, 2)])).length).toEqual(rational(8));
    // Ends exactly on a bar line: stays that long.
    expect(readClipProperties(legacy([note('a', 4, 4)])).length).toEqual(rational(8));
    expect(readClipProperties(legacy([note('a', 10, 1)])).length).toEqual(rational(12));
    const long = readClipProperties(legacy([note('a', 9, 4)]));
    expect(long.length).toEqual(rational(16));
    expect(long.loopEnd).toEqual(rational(16));
  });

  it('keeps the exact length a stored frame names, never rounding it up to a bar', () => {
    expect(readClipProperties(legacy([], 8)).length).toEqual(rational(8));
    expect(readClipProperties(legacy([], 2)).length).toEqual(rational(2));
    expect(readClipProperties(legacy([], 6)).length).toEqual(rational(6));
    // A 3/4 clip of 3 quarters stays 3.
    const threeFour = withClipProperties(legacy([note('a', 0, 1)], 3), {
      ...readClipProperties(legacy([], 3)),
      timeSignature: '3/4',
    });
    expect(readClipProperties(threeFour).length).toEqual(rational(3));
  });

  it('rounds content past the stored frame up to a whole bar of the clip meter', () => {
    expect(readClipProperties(legacy([note('a', 3, 2)], 3)).length).toEqual(rational(8));
    // No frame, a 3/4 meter stored: content ends at 4, so two bars of 3/4.
    const threeFour = {
      ...legacy([note('a', 2, 2)]),
      metadata: { clip: { timeSignature: '3/4' } },
    };
    // Content ends at 4: two bars of 3/4.
    expect(readClipProperties(threeFour).length).toEqual(rational(6));
  });

  it('reads each stored field and falls back per field when one is malformed', () => {
    const stored = withClipProperties(legacy([], 8), {
      length: rational(8),
      start: rational(1),
      loopOn: false,
      loopStart: rational(2),
      loopEnd: rational(6),
      timeSignature: '3/4',
    });
    expect(readClipProperties(stored)).toEqual({
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
        clip: {
          start: 'x',
          loopOn: 3,
          loopStart: rational(2),
          loopEnd: rational(1),
          timeSignature: '4/3',
        },
      },
    };
    expect(readClipProperties(damaged)).toEqual({
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

describe('new clips', () => {
  it('carry every property, with the meter they were made in', () => {
    const clip = blankSnippet(
      {
        id: 'c',
        createdAt: '2026-11-12T00:00:00Z',
        name: 'c',
        length: rational(7, 2),
        timeSignature: '7/8',
      },
      { kind: 'events', domain: 'note' }
    );
    expect(clip.packet.metadata?.clip).toEqual({
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(7, 2),
      timeSignature: '7/8',
    });
    expect(readClipProperties(clip.packet)).toMatchObject({
      length: rational(7, 2),
      timeSignature: '7/8',
    });
    expect(acceptsSnippets([clip])).toBe(true);
    const plainBlank = blankSnippet(
      { id: 'd', createdAt: 'x', name: 'd', length: rational(4) },
      { kind: 'events', domain: 'note' }
    );
    expect(readClipProperties(plainBlank.packet).timeSignature).toBe('4/4');
  });
});

describe('editing clip properties', () => {
  const base = withClipProperties(legacy([note('a', 0, 1)], 8), {
    length: rational(8),
    start: rational(0),
    loopOn: true,
    loopStart: rational(0),
    loopEnd: rational(8),
    timeSignature: '4/4',
  });

  it('writes the whole set, keeping the length in the frame the editor already reads', () => {
    const edit = editClipProperties(base, { length: rational(12), loopEnd: rational(12) });
    const written = (edit as { packet: DataPacket }).packet;
    expect(edit.ok).toBe(true);
    expect(written.frame).toMatchObject({ extent: 12, musicalExtent: musicalDuration(12) });
    expect(readClipProperties(written).loopEnd).toEqual(rational(12));
    expect(written.items).toBe(base.items);
  });

  it('refuses nonsense and says why', () => {
    const refused = (change: Parameters<typeof editClipProperties>[1]) => {
      const edit = editClipProperties(base, change);
      return edit.ok ? null : edit.error;
    };
    expect(refused({ loopEnd: rational(0) })).toMatch(/loop length must be longer than zero/);
    expect(refused({ loopStart: rational(7) })).toBeNull();
    expect(refused({ loopStart: rational(8) })).toMatch(/loop length must be longer than zero/);
    expect(refused({ loopEnd: rational(9) })).toMatch(/within the total length/);
    expect(refused({ length: rational(6) })).toMatch(/within the total length/);
    expect(refused({ length: rational(0) })).toMatch(/longer than zero/);
    expect(refused({ start: rational(8) })).toMatch(/inside the clip/);
    expect(refused({ start: rational(-1) })).toMatch(/inside the clip/);
    expect(refused({ timeSignature: '4/3' })).toMatch(/time signature/);
    expect(clipPropertiesError(readClipProperties(base))).toBeNull();
  });

  it('is a version of its own and stamps no provenance on the notes', () => {
    const snippet: Snippet = {
      schemaVersion: 1,
      id: 's',
      name: 's',
      createdAt: '2026-11-12T00:00:00Z',
      packet: base,
    };
    const edit = editClipProperties(base, { loopOn: false });
    expect(edit.ok).toBe(true);
    const result = commitSnippetEdit(
      snippet,
      (edit as { packet: DataPacket }).packet,
      'edit-clip-properties'
    ) as { snippet: Snippet };
    expect(result.snippet.lineage?.versions).toHaveLength(2);
    expect(result.snippet.lineage?.versions.at(-1)?.operation).toBe('edit-clip-properties');
    expect(result.snippet.packet.items[0].provenance).toEqual([]);
  });
});

describe('clips the properties do not apply to', () => {
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
    for (const clip of [pulse, abstract]) {
      const before = JSON.stringify(clip);
      const edit = editClipProperties(clip, { length: rational(8) });
      expect(edit.ok).toBe(false);
      expect(hasClipProperties(clip)).toBe(false);
      expect(clipPropertiesRefusal(clip)).toEqual(expect.any(String));
      expect(withClipProperties(clip, readClipProperties(clip))).toBe(clip);
      expect(JSON.stringify(clip)).toBe(before);
    }
  });

  it('refuses a note clip whose frame is not in quarter notes', () => {
    const cyclicNotes: DataPacket = {
      ...packet('events', 'note', [note('a', 0, 1)]),
      frame: frameOf('pulse', 7),
    };
    expect(editClipProperties(cyclicNotes, { loopOn: false }).ok).toBe(false);
    expect(hasClipProperties(legacy([note('a', 0, 1)], 4))).toBe(true);
    expect(hasClipProperties(legacy([]))).toBe(true);
  });
});

describe('editing is exact and conservative', () => {
  it('keeps unknown keys already inside metadata.clip', () => {
    const base = legacy([], 8);
    const marked = { ...base, metadata: { clip: { future: 'kept', start: 'junk' } } };
    const edit = editClipProperties(marked, { loopOn: false });
    expect(edit.ok && (edit.packet.metadata?.clip as Record<string, unknown>).future).toBe('kept');
  });

  it('an equivalent value is a no-op: same packet, no defaults written', () => {
    const base = legacy([], 8);
    const edit = editClipProperties(base, { length: rational(16, 2), loopOn: true });
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
    expect(clipPropertiesRefusal(cyclicQuarterNotes)).toEqual(expect.any(String));
    expect(hasClipProperties(cyclicQuarterNotes)).toBe(false);
    expect(editClipProperties(cyclicQuarterNotes, { loopOn: false }).ok).toBe(false);
    expect(freezeClipProperties(cyclicQuarterNotes)).toBe(cyclicQuarterNotes);
  });

  it('freezes an old clip with the full default set computed from its content now', () => {
    const old = legacy([note('a', 0, 1), note('b', 5, 1)]);
    const frozen = freezeClipProperties(old);
    expect(frozen).not.toBe(old);
    expect(old.metadata?.clip).toBeUndefined();
    expect(frozen.metadata?.clip).toMatchObject({
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: rational(8),
      timeSignature: '4/4',
    });
    expect(frozen.frame).toMatchObject({ extent: 8 });
    // Frozen once: reading it back is the same, and freezing again writes nothing.
    expect(readClipProperties(frozen)).toEqual(readClipProperties(old));
    expect(freezeClipProperties(frozen)).toBe(frozen);
  });

  it('rejects a length over the cap', () => {
    const base = readClipProperties(legacy([], 4));
    const longest = rational(4 * 72_000);
    const tooLong = rational(4 * 72_001);
    expect(clipPropertiesError({ ...base, length: longest, loopEnd: longest })).toBeNull();
    expect(clipPropertiesError({ ...base, length: tooLong, loopEnd: tooLong })).toMatch(
      /72000 bars/
    );
  });
});

describe('a clip already over the 72000-bar cap', () => {
  const OVER = 4 * 80_000;

  it('reads as the cap, so its properties stay editable', () => {
    const far = legacy([note('far', OVER, 1)]);
    const props = readClipProperties(far);
    expect(props.length).toEqual(rational(4 * 72_000));
    expect(props.loopEnd).toEqual(rational(4 * 72_000));
    expect(clipPropertiesError(props)).toBeNull();
    // A stored frame longer than the cap reads as the cap too.
    expect(readClipProperties(legacy([note('a', 0, 1)], OVER)).length).toEqual(
      rational(4 * 72_000)
    );
  });

  it('freezes at the cap and a property edit is not locked out', () => {
    const frozen = freezeClipProperties(legacy([note('far', OVER, 1)]));
    expect(frozen.frame).toMatchObject({ extent: 4 * 72_000 });
    const edit = editClipProperties(frozen, { loopOn: false });
    expect(edit.ok).toBe(true);
    // Editing a never-frozen over-cap clip works the same, and the content stays past the end.
    const direct = editClipProperties(legacy([note('far', OVER, 1)]), { loopOn: false });
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.packet.items).toHaveLength(1);
      expect(readClipProperties(direct.packet).length).toEqual(rational(4 * 72_000));
    }
  });
});

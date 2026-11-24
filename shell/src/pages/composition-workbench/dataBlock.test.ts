import { createElement } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataBlockPreview } from './components/DataBlockPreview';
import {
  acceptsDataBlocks,
  canCaptureSelection,
  captureDataBlock,
  convertDataBlockToPitchClass,
  duplicateDataBlock,
  editDataBlockNote,
  PITCH_GRID_TOLERANCE_MIDICENTS,
  pitchClassConversionRefusal,
  type PitchClassConversionResult,
  type PitchClassEventValue,
  type DataBlock,
} from './dataBlock';
import { renderDesk } from './deskTestUtils';
import { melodicize, type NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, rationalToNumber } from './musicalTime';
import { interpretPitchList } from './pitch';

function rhythm(values = [2, 1, 1, 2]) {
  return packet(
    'list',
    'duration',
    values.map((value, index) => ({ id: `rhythm:${index}`, value, provenance: [] })),
    [],
    undefined,
    {
      role: 'interOnset',
      frame: { topology: 'cyclic', unit: 'pulse', extent: values.reduce((sum, v) => sum + v, 0) },
    }
  );
}

function notes(): DataPacket<NoteEventValue> {
  const result = melodicize({
    instanceId: 'melodicization',
    rhythm: rhythm(),
    pitches: interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 62, 66.5',
    }).packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  });
  expect(result.errors).toEqual([]);
  return result.packet;
}

const base = {
  id: 'data-block-1',
  createdAt: '2026-11-11T00:00:00Z',
  name: 'Gesture',
  nodeInstance: 'mel-1',
};

describe('captureDataBlock', () => {
  it('captures a note selection and starts it at zero with exact time', () => {
    const source = notes();
    // Notes 1 and 2 (0-based): onsets 1/2 and 3/4 quarter notes in the source.
    const ids = [source.items[1].id, source.items[2].id];
    const result = captureDataBlock({ ...base, packet: source, itemIds: ids });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const items = result.dataBlock.packet.items as DataItem<NoteEventValue>[];
    expect(items.map((item) => item.id)).toEqual(ids);
    expect(rationalToNumber(items[0].value.onset.quarterNotes)).toBe(0);
    const original = source.items[2].value.onset.quarterNotes;
    const first = source.items[1].value.onset.quarterNotes;
    expect(rationalToNumber(items[1].value.onset.quarterNotes)).toBeCloseTo(
      rationalToNumber(original) - rationalToNumber(first),
      12
    );
    expect(result.dataBlock.packet.frame).toMatchObject({
      topology: 'linear',
      origin: 0,
      unit: 'quarterNote',
    });
  });

  it('keeps pitches, microtones, velocity and packet semantics', () => {
    const source = notes();
    const result = captureDataBlock({ ...base, packet: source, itemIds: [source.items[2].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const [item] = result.dataBlock.packet.items as DataItem<NoteEventValue>[];
    expect(item.value.pitches).toEqual(source.items[2].value.pitches);
    expect(item.value.velocity).toBe(source.items[2].value.velocity);
    expect(result.dataBlock.packet.kind).toBe('events');
    expect(result.dataBlock.packet.domain).toBe('note');
  });

  it('appends capture provenance after the inherited chain, without touching the source', () => {
    const source = notes();
    const before = JSON.stringify(source);
    const result = captureDataBlock({ ...base, packet: source, itemIds: [source.items[0].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const [item] = result.dataBlock.packet.items;
    const last = item.provenance[item.provenance.length - 1];
    expect(last).toMatchObject({
      sourceNodeInstance: 'mel-1',
      sourceItemIds: [source.items[0].id],
      transformation: 'capture',
    });
    expect(item.provenance.length).toBe(source.items[0].provenance.length + 1);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('uses packet order, not selection order', () => {
    const source = notes();
    const result = captureDataBlock({
      ...base,
      packet: source,
      itemIds: [source.items[3].id, source.items[0].id],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.dataBlock.packet.items.map((item) => item.id)).toEqual([
      source.items[0].id,
      source.items[3].id,
    ]);
  });

  it('drops the source grouping with a warning and makes the frame linear', () => {
    const source = notes();
    source.frame = {
      ...source.frame!,
      topology: 'cyclic',
      grouping: { id: 'g', label: 'g', units: 2, boundaries: [1] },
    };
    const result = captureDataBlock({ ...base, packet: source, itemIds: [source.items[0].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.warnings).toHaveLength(1);
    expect(result.dataBlock.packet.frame?.grouping).toBeUndefined();
    expect(result.dataBlock.packet.frame?.topology).toBe('linear');
  });

  it('rejects an empty selection and ids that are not in the source', () => {
    const source = notes();
    expect(captureDataBlock({ ...base, packet: source, itemIds: [] }).ok).toBe(false);
    const missing = captureDataBlock({ ...base, packet: source, itemIds: ['nope'] });
    expect(missing).toMatchObject({ ok: false });
  });

  it('captures any packet whole, unchanged apart from provenance', () => {
    const source = rhythm();
    const result = captureDataBlock({ ...base, packet: source });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.dataBlock.packet.kind).toBe('list');
    expect(result.dataBlock.packet.frame).toEqual(source.frame);
    expect(result.dataBlock.packet.items.map((item) => item.value)).toEqual([2, 1, 1, 2]);
    expect(result.dataBlock.origin?.nodeInstance).toBe('mel-1');
    expect(result.dataBlock.origin).not.toHaveProperty('itemIds');
  });

  it('snapshots a whole node output as a copy that does not share state with the source', () => {
    const source = notes();
    const before = JSON.stringify(source);
    const result = captureDataBlock({ ...base, packet: source, portId: 'notes' });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const { dataBlock } = result;
    expect(dataBlock.origin).toEqual({ nodeInstance: 'mel-1', portId: 'notes' });
    expect(dataBlock.packet.items.map((item) => item.id)).toEqual(source.items.map((i) => i.id));
    expect(dataBlock.packet.items.at(-1)?.provenance.at(-1)?.transformation).toBe('capture');
    expect(dataBlock.packet).not.toBe(source);
    expect(dataBlock.packet.frame).not.toBe(source.frame);
    expect(() => JSON.stringify(dataBlock)).not.toThrow();
    expect(JSON.stringify(source)).toBe(before);
    // Mutating the source afterwards does not reach the snapshot.
    source.items[0].value.velocity = 0.123;
    expect((dataBlock.packet.items as DataItem<NoteEventValue>[])[0].value.velocity).not.toBe(
      0.123
    );
  });

  it('refuses a partial capture of a kind it cannot select from, instead of guessing', () => {
    const source = rhythm();
    const result = captureDataBlock({ ...base, packet: source, itemIds: [source.items[0].id] });
    expect(result).toMatchObject({ ok: false });
    expect(canCaptureSelection('events')).toBe(true);
    expect(canCaptureSelection('list')).toBe(false);
  });

  it('refuses an empty source', () => {
    expect(captureDataBlock({ ...base, packet: packet('list', 'integer', []) })).toMatchObject({
      ok: false,
    });
  });

  it('survives a JSON round trip and passes the persistence check', () => {
    const source = notes();
    const result = captureDataBlock({ ...base, packet: source, itemIds: [source.items[1].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const restored: unknown = JSON.parse(JSON.stringify([result.dataBlock]));
    expect(acceptsDataBlocks(restored)).toBe(true);
    expect(restored).toEqual([result.dataBlock]);
    expect(acceptsDataBlocks([{ ...result.dataBlock, schemaVersion: 2 }])).toBe(false);
    expect(acceptsDataBlocks('nope')).toBe(false);
  });
});

describe('editDataBlockNote', () => {
  function dataBlockOf(): DataBlock {
    const source = notes();
    const result = captureDataBlock({
      ...base,
      note: 'first',
      packet: source,
      itemIds: [source.items[1].id],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.dataBlock;
  }

  it('changes only the note and leaves packet, id and createdAt identical', () => {
    const original = dataBlockOf();
    const before = JSON.stringify(original);
    const edited = editDataBlockNote(original, 'second');
    expect(edited.note).toBe('second');
    expect(edited.packet).toBe(original.packet);
    expect(edited.id).toBe(original.id);
    expect(edited.createdAt).toBe(original.createdAt);
    expect({ ...edited, note: undefined }).toEqual({ ...original, note: undefined });
    expect(JSON.stringify(original)).toBe(before);
  });

  it('clears the note when the text is blank, and survives persistence', () => {
    const cleared = editDataBlockNote(dataBlockOf(), '   ');
    expect('note' in cleared).toBe(false);
    const restored: unknown = JSON.parse(
      JSON.stringify([editDataBlockNote(dataBlockOf(), 'kept')])
    );
    expect(acceptsDataBlocks(restored)).toBe(true);
    expect((restored as DataBlock[])[0].note).toBe('kept');
  });

  it('still loads a saved v1 desk that has no note, and can add one', () => {
    const { note: _note, ...noNote } = dataBlockOf();
    const restored: unknown = JSON.parse(JSON.stringify([noNote]));
    expect(acceptsDataBlocks(restored)).toBe(true);
    expect(editDataBlockNote((restored as DataBlock[])[0], 'added').note).toBe('added');
  });
});

describe('duplicateDataBlock', () => {
  function dataBlockOf(): DataBlock {
    const source = notes();
    const result = captureDataBlock({
      ...base,
      note: 'first',
      packet: source,
      itemIds: [source.items[0].id, source.items[1].id],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.dataBlock;
  }
  const request = { id: 'data-block-2', createdAt: '2026-11-12T00:00:00Z' };

  it('makes a new data-block with a fresh id, a variation name and a deep copy of the values', () => {
    const original = dataBlockOf();
    const copy = duplicateDataBlock(original, request);
    expect(copy.id).toBe('data-block-2');
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Gesture (variation)');
    expect(copy.createdAt).toBe(request.createdAt);
    expect(copy.note).toBe('first');
    expect(copy.packet.items.map((item) => item.id)).toEqual(
      original.packet.items.map((item) => item.id)
    );
    expect(copy.packet.items.map((item) => item.value)).toEqual(
      original.packet.items.map((item) => item.value)
    );
    expect(copy.packet.frame).toEqual(original.packet.frame);
    expect(copy.packet).not.toBe(original.packet);
    expect(copy.packet.items[0].value).not.toBe(original.packet.items[0].value);
  });

  it('appends a duplicate provenance step to every item and leaves the original unchanged', () => {
    const original = dataBlockOf();
    const before = JSON.stringify(original);
    const copy = duplicateDataBlock(original, request);
    copy.packet.items.forEach((item, index) => {
      const source = original.packet.items[index];
      expect(item.provenance.length).toBe(source.provenance.length + 1);
      expect(item.provenance.slice(0, -1)).toEqual(source.provenance);
      expect(item.provenance[item.provenance.length - 1]).toMatchObject({
        sourceItemIds: [source.id],
        transformation: 'duplicate',
        parameters: { dataBlockId: 'data-block-2', sourceDataBlockId: 'data-block-1' },
      });
    });
    expect(JSON.stringify(original)).toBe(before);
  });

  it('persists across reload through the desk provider', async () => {
    localStorage.clear();
    const original = dataBlockOf();
    const first = await renderDesk();
    act(() => first.result.current.addDataBlock(original));
    act(() => first.result.current.duplicateDataBlockById(original.id));
    const names = first.result.current.dataBlocks.map((dataBlock) => dataBlock.name);
    expect(names).toEqual(['Gesture', 'Gesture (variation)']);
    first.unmount();

    const reloaded = await renderDesk();
    expect(reloaded.result.current.dataBlocks.map((dataBlock) => dataBlock.name)).toEqual(names);
    const [kept, variation] = reloaded.result.current.dataBlocks;
    expect(kept).toEqual(original);
    expect(variation.id).not.toBe(original.id);
    expect(variation.packet.items[0].provenance.at(-1)?.transformation).toBe('duplicate');
    expect(acceptsDataBlocks(reloaded.result.current.dataBlocks)).toBe(true);
    reloaded.unmount();
  });
});

describe('convertDataBlockToPitchClass', () => {
  const request = { id: 'data-block-pc', createdAt: '2026-11-12T00:00:00Z' };

  function noteDataBlock(text = '60, 64, 67, 72', allocation: 'cycle' = 'cycle'): DataBlock {
    const result = melodicize({
      instanceId: 'melodicization',
      rhythm: rhythm([1, 1, 2, 1]),
      pitches: interpretPitchList({
        instanceId: 'pitch-list',
        format: 'midi-note',
        inlineText: text,
      }).packet,
      allocation,
      pulseUnit: musicalDuration(1, 4),
      articulationPercent: 100,
    });
    expect(result.errors).toEqual([]);
    const captured = captureDataBlock({ ...base, note: 'arp', packet: result.packet });
    if (!captured.ok) {
      throw new Error(captured.error);
    }
    return captured.dataBlock;
  }

  function converted(source: DataBlock): DataBlock {
    const result = convertDataBlockToPitchClass(source, request);
    if (!result.ok) {
      throw new Error(result.needsSnap ? result.message : result.error);
    }
    return result.dataBlock;
  }

  it('turns MIDI 60, 64, 67, 72 into 0, 4, 7, 0 and keeps timing, frame and velocity', () => {
    const source = noteDataBlock();
    const copy = converted(source);
    const items = copy.packet.items as DataItem<PitchClassEventValue>[];
    expect(items.map((item) => item.value.pitchClasses)).toEqual([[0], [4], [7], [0]]);
    expect(copy.packet.kind).toBe('events');
    expect(copy.packet.domain).toBe('pitchClass');
    expect(copy.packet.encoding).toBe('chromatic-12');
    expect(copy.packet.frame).toEqual(source.packet.frame);
    (source.packet.items as DataItem<NoteEventValue>[]).forEach((item, index) => {
      expect(items[index].id).toBe(item.id);
      expect(items[index].value.onset).toEqual(item.value.onset);
      expect(items[index].value.duration).toEqual(item.value.duration);
      expect(items[index].value.interOnset).toEqual(item.value.interOnset);
      expect(items[index].value.velocity).toBe(item.value.velocity);
      expect('pitches' in items[index].value).toBe(false);
    });
  });

  it('makes a new data-block with a fresh id, appends to-pitch-class provenance and leaves the original alone', () => {
    const source = noteDataBlock();
    const before = JSON.stringify(source);
    const copy = converted(source);
    expect(copy.id).toBe('data-block-pc');
    expect(copy.name).toBe('Gesture (pitch classes)');
    expect(copy.schemaVersion).toBe(1);
    copy.packet.items.forEach((item, index) => {
      const original = source.packet.items[index];
      expect(item.provenance.slice(0, -1)).toEqual(original.provenance);
      expect(item.provenance.at(-1)).toMatchObject({
        sourceItemIds: [original.id],
        transformation: 'to-pitch-class',
        parameters: { dataBlockId: 'data-block-pc', sourceDataBlockId: 'data-block-1' },
      });
    });
    expect(JSON.stringify(source)).toBe(before);
    expect(source.packet.domain).toBe('note');
  });

  it('reduces chords and upper-octave pitches mod 12, keeping each group', () => {
    const copy = converted(noteDataBlock('[60 64 67] 71 61 [59 73]'));
    const items = copy.packet.items as DataItem<PitchClassEventValue>[];
    expect(items.map((item) => item.value.pitchClasses)).toEqual([[0, 4, 7], [11], [1], [11, 1]]);
  });

  it('refuses a non-note data-block with a message instead of guessing', () => {
    const captured = captureDataBlock({ ...base, packet: rhythm() });
    if (!captured.ok) {
      throw new Error(captured.error);
    }
    const result = convertDataBlockToPitchClass(captured.dataBlock, request);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && !result.needsSnap && result.error).toMatch(/note data-blocks/);
    expect(pitchClassConversionRefusal(captured.dataBlock)).toMatch(/list \| duration/);
  });

  /** The same data-block with each event's pitches replaced by the given midicent groups. */
  function withPitches(source: DataBlock, groups: number[][]): DataBlock {
    const items = (source.packet.items as DataItem<NoteEventValue>[]).map((item, index) => ({
      ...item,
      value: { ...item.value, pitches: groups[index] },
    }));
    return { ...source, packet: { ...source.packet, items } as DataPacket };
  }

  const step19 = 1200 / 19;

  it('converts exact 19-EDO steps directly in a 19-EDO project, encoding chromatic-19', () => {
    // Steps 0, 5, 11, and 19 (an octave up) of a 19-EDO, as midicents from middle C.
    const source = withPitches(noteDataBlock(), [
      [6000],
      [6000 + 5 * step19],
      [6000 + 11 * step19],
      [6000 + 19 * step19],
    ]);
    const result = convertDataBlockToPitchClass(source, { ...request, edo: 19 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const items = result.dataBlock.packet.items as DataItem<PitchClassEventValue>[];
    expect(result.dataBlock.packet.encoding).toBe('chromatic-19');
    expect(result.dataBlock.packet.domain).toBe('pitchClass');
    // 6000 midicents is step 95 of 19-EDO (five octaves), so it is pitch class 0.
    expect(items.map((item) => item.value.pitchClasses)).toEqual([[0], [5], [11], [0]]);
    expect(items[0].provenance.at(-1)?.parameters).toMatchObject({ edo: 19, snappedCount: 0 });
  });

  it('asks for a snap when pitches are off the project EDO grid, and changes nothing', () => {
    const source = noteDataBlock('60, 66.5, 64, 67');
    const before = JSON.stringify(source);
    const result = convertDataBlockToPitchClass(source, { ...request, edo: 12 });
    expect(result).toMatchObject({ ok: false, needsSnap: true, edo: 12, offGridCount: 1 });
    expect(result.ok === false && result.needsSnap && result.message).toBe(
      '1 pitch is off the 12-EDO grid. Snap it to the nearest step?'
    );
    expect(JSON.stringify(source)).toBe(before);
    // Explicitly not snapping behaves the same.
    expect(
      convertDataBlockToPitchClass(source, { ...request, edo: 12, snap: false })
    ).toMatchObject({
      needsSnap: true,
    });
  });

  it('counts a pitch as on the grid within the tolerance and off it just beyond', () => {
    const tol = PITCH_GRID_TOLERANCE_MIDICENTS;
    const near = withPitches(noteDataBlock(), [
      [6000 + tol * 0.9],
      [6400 - tol * 0.9],
      [6700],
      [7200],
    ]);
    expect(convertDataBlockToPitchClass(near, request).ok).toBe(true);
    const far = withPitches(noteDataBlock(), [[6000 + tol * 1.1], [6400], [6700], [7200]]);
    expect(convertDataBlockToPitchClass(far, request)).toMatchObject({
      needsSnap: true,
      offGridCount: 1,
    });
  });

  it('treats a 12-EDO melody in a 19-EDO project as off the grid', () => {
    const result = convertDataBlockToPitchClass(noteDataBlock(), { ...request, edo: 19 });
    // 6000 and 7200 are whole octaves, on every grid; 6400 and 6700 are not on the 19-EDO grid.
    expect(result).toMatchObject({ ok: false, needsSnap: true, edo: 19 });
    expect(result.ok === false && result.needsSnap && result.offGridCount).toBe(2);
  });

  it('snaps to the nearest step with snap: true and records it in the provenance parameters', () => {
    const source = withPitches(noteDataBlock(), [[6000], [6400], [6700], [7200]]);
    const result = convertDataBlockToPitchClass(source, { ...request, edo: 19, snap: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const items = result.dataBlock.packet.items as DataItem<PitchClassEventValue>[];
    const expected = [6000, 6400, 6700, 7200].map(
      (midicents) => Math.round(midicents / step19) % 19
    );
    expect(items.map((item) => item.value.pitchClasses)).toEqual(expected.map((pc) => [pc]));
    expect(result.dataBlock.packet.encoding).toBe('chromatic-19');
    expect(items[0].provenance.at(-1)).toMatchObject({
      transformation: 'to-pitch-class',
      parameters: { edo: 19, snappedCount: 2 },
    });
    expect(source.packet.domain).toBe('note');
  });

  it('keeps pitch classes in 0..edo-1 for negative and out-of-range midicents, never -0', () => {
    const source = withPitches(noteDataBlock(), [[-100], [-1200], [-6000], [12100]]);
    const result = convertDataBlockToPitchClass(source, request);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const items = result.dataBlock.packet.items as DataItem<PitchClassEventValue>[];
    const classes = items.map((item) => item.value.pitchClasses[0]);
    expect(classes).toEqual([11, 0, 0, 1]);
    classes.forEach((value) => expect(Object.is(value, -0)).toBe(false));
    const small = convertDataBlockToPitchClass(
      withPitches(noteDataBlock(), [[-30], [0], [1200], [-1200]]),
      {
        ...request,
        edo: 24,
        snap: true,
      }
    );
    expect(
      small.ok &&
        small.dataBlock.packet.items.map(
          (item) => (item.value as PitchClassEventValue).pitchClasses[0]
        )
    ).toEqual([23, 0, 0, 0]);
  });

  it('refuses non-finite pitches and an empty data-block outright', () => {
    const bad = withPitches(noteDataBlock(), [[60], [Number.NaN], [67], [72]]);
    expect(pitchClassConversionRefusal(bad)).toMatch(/not a finite number/);
    expect(convertDataBlockToPitchClass(bad, { ...request, snap: true })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/finite/),
    });
    const infinite = withPitches(noteDataBlock(), [[Infinity], [0], [0], [0]]);
    expect(pitchClassConversionRefusal(infinite)).not.toBeNull();
    const empty = { ...noteDataBlock(), packet: { ...noteDataBlock().packet, items: [] } };
    expect(pitchClassConversionRefusal(empty)).toMatch(/nothing to convert/);
  });

  it('renders in the preview without error, as text', () => {
    const copy = converted(noteDataBlock('[60 64 67] 62 65 69'));
    const { container, unmount } = render(createElement(DataBlockPreview, { packet: copy.packet }));
    expect(container.textContent).toContain('[0 4 7]');
    expect(container.textContent).toContain('2  5  9');
    unmount();
  });

  it('persists across reload through the desk provider, and is accepted by acceptsDataBlocks', async () => {
    localStorage.clear();
    const source = noteDataBlock();
    const first = await renderDesk();
    act(() => first.result.current.addDataBlock(source));
    let outcome: PitchClassConversionResult | undefined;
    act(() => {
      outcome = first.result.current.convertToPitchClassById(source.id, { edo: 12 });
    });
    expect(outcome?.ok).toBe(true);
    const [original, result] = first.result.current.dataBlocks;
    expect(original).toEqual(source);
    expect(result.packet.domain).toBe('pitchClass');
    expect(result.id).not.toBe(source.id);
    // Refused kinds add nothing and report why.
    act(() => {
      outcome = first.result.current.convertToPitchClassById(result.id, { edo: 12 });
    });
    expect(!outcome?.ok && !outcome?.needsSnap && outcome?.error).toMatch(/note data-blocks/);
    expect(first.result.current.dataBlocks).toHaveLength(2);
    first.unmount();

    const reloaded = await renderDesk();
    expect(reloaded.result.current.dataBlocks).toEqual([original, result]);
    expect(acceptsDataBlocks(reloaded.result.current.dataBlocks)).toBe(true);
    expect(acceptsDataBlocks(JSON.parse(JSON.stringify([result])))).toBe(true);
    reloaded.unmount();
  });
});

import { describe, expect, it } from 'vitest';
import { melodicize, type NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, rationalToNumber } from './musicalTime';
import { interpretPitchList } from './pitch';
import {
  acceptsSnippets,
  canCaptureSelection,
  captureSnippet,
  editSnippetNote,
  type Snippet,
} from './snippet';

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
  id: 'snip-1',
  createdAt: '2026-11-11T00:00:00Z',
  name: 'Gesture',
  moduleInstance: 'mel-1',
};

describe('captureSnippet', () => {
  it('captures a note selection and starts it at zero with exact time', () => {
    const source = notes();
    // Notes 1 and 2 (0-based): onsets 1/2 and 3/4 quarter notes in the source.
    const ids = [source.items[1].id, source.items[2].id];
    const result = captureSnippet({ ...base, packet: source, itemIds: ids });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const items = result.snippet.packet.items as DataItem<NoteEventValue>[];
    expect(items.map((item) => item.id)).toEqual(ids);
    expect(rationalToNumber(items[0].value.onset.quarterNotes)).toBe(0);
    const original = source.items[2].value.onset.quarterNotes;
    const first = source.items[1].value.onset.quarterNotes;
    expect(rationalToNumber(items[1].value.onset.quarterNotes)).toBeCloseTo(
      rationalToNumber(original) - rationalToNumber(first),
      12
    );
    expect(result.snippet.packet.frame).toMatchObject({
      topology: 'linear',
      origin: 0,
      unit: 'quarterNote',
    });
  });

  it('keeps pitches, microtones, velocity and packet semantics', () => {
    const source = notes();
    const result = captureSnippet({ ...base, packet: source, itemIds: [source.items[2].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const [item] = result.snippet.packet.items as DataItem<NoteEventValue>[];
    expect(item.value.pitches).toEqual(source.items[2].value.pitches);
    expect(item.value.velocity).toBe(source.items[2].value.velocity);
    expect(result.snippet.packet.kind).toBe('events');
    expect(result.snippet.packet.domain).toBe('note');
  });

  it('appends capture provenance after the inherited chain, without touching the source', () => {
    const source = notes();
    const before = JSON.stringify(source);
    const result = captureSnippet({ ...base, packet: source, itemIds: [source.items[0].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const [item] = result.snippet.packet.items;
    const last = item.provenance[item.provenance.length - 1];
    expect(last).toMatchObject({
      sourceModuleInstance: 'mel-1',
      sourceItemIds: [source.items[0].id],
      transformation: 'capture-snippet',
    });
    expect(item.provenance.length).toBe(source.items[0].provenance.length + 1);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('uses packet order, not selection order', () => {
    const source = notes();
    const result = captureSnippet({
      ...base,
      packet: source,
      itemIds: [source.items[3].id, source.items[0].id],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.snippet.packet.items.map((item) => item.id)).toEqual([
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
    const result = captureSnippet({ ...base, packet: source, itemIds: [source.items[0].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.warnings).toHaveLength(1);
    expect(result.snippet.packet.frame?.grouping).toBeUndefined();
    expect(result.snippet.packet.frame?.topology).toBe('linear');
  });

  it('rejects an empty selection and ids that are not in the source', () => {
    const source = notes();
    expect(captureSnippet({ ...base, packet: source, itemIds: [] }).ok).toBe(false);
    const missing = captureSnippet({ ...base, packet: source, itemIds: ['nope'] });
    expect(missing).toMatchObject({ ok: false });
  });

  it('captures any packet whole, unchanged apart from provenance', () => {
    const source = rhythm();
    const result = captureSnippet({ ...base, packet: source });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.snippet.packet.kind).toBe('list');
    expect(result.snippet.packet.frame).toEqual(source.frame);
    expect(result.snippet.packet.items.map((item) => item.value)).toEqual([2, 1, 1, 2]);
    expect(result.snippet.origin?.itemIds).toHaveLength(4);
  });

  it('refuses a partial capture of a kind it cannot select from, instead of guessing', () => {
    const source = rhythm();
    const result = captureSnippet({ ...base, packet: source, itemIds: [source.items[0].id] });
    expect(result).toMatchObject({ ok: false });
    expect(canCaptureSelection('events')).toBe(true);
    expect(canCaptureSelection('list')).toBe(false);
  });

  it('refuses an empty source', () => {
    expect(captureSnippet({ ...base, packet: packet('list', 'integer', []) })).toMatchObject({
      ok: false,
    });
  });

  it('survives a JSON round trip and passes the persistence check', () => {
    const source = notes();
    const result = captureSnippet({ ...base, packet: source, itemIds: [source.items[1].id] });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const restored: unknown = JSON.parse(JSON.stringify([result.snippet]));
    expect(acceptsSnippets(restored)).toBe(true);
    expect(restored).toEqual([result.snippet]);
    expect(acceptsSnippets([{ ...result.snippet, schemaVersion: 2 }])).toBe(false);
    expect(acceptsSnippets('nope')).toBe(false);
  });
});

describe('editSnippetNote', () => {
  function snippetOf(): Snippet {
    const source = notes();
    const result = captureSnippet({
      ...base,
      note: 'first',
      packet: source,
      itemIds: [source.items[1].id],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.snippet;
  }

  it('changes only the note and leaves packet, id and createdAt identical', () => {
    const original = snippetOf();
    const before = JSON.stringify(original);
    const edited = editSnippetNote(original, 'second');
    expect(edited.note).toBe('second');
    expect(edited.packet).toBe(original.packet);
    expect(edited.id).toBe(original.id);
    expect(edited.createdAt).toBe(original.createdAt);
    expect({ ...edited, note: undefined }).toEqual({ ...original, note: undefined });
    expect(JSON.stringify(original)).toBe(before);
  });

  it('clears the note when the text is blank, and survives persistence', () => {
    const cleared = editSnippetNote(snippetOf(), '   ');
    expect('note' in cleared).toBe(false);
    const restored: unknown = JSON.parse(JSON.stringify([editSnippetNote(snippetOf(), 'kept')]));
    expect(acceptsSnippets(restored)).toBe(true);
    expect((restored as Snippet[])[0].note).toBe('kept');
  });

  it('still loads a saved v1 desk that has no note, and can add one', () => {
    const { note: _note, ...noNote } = snippetOf();
    const restored: unknown = JSON.parse(JSON.stringify([noNote]));
    expect(acceptsSnippets(restored)).toBe(true);
    expect(editSnippetNote((restored as Snippet[])[0], 'added').note).toBe('added');
  });
});

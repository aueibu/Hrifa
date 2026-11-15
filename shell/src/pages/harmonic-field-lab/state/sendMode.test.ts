import { describe, expect, it } from 'vitest';
import { exactShape, placeShape, ratioNote, type Note } from '../../../lib/harmonic-field';
import { emptySketch } from './chordShelf';
import {
  compositesReduce,
  emptyComposites,
  type CompositeItem,
  type CompositesState,
} from './composites';
import { sanitizeComposites, compositesToStored } from './compositeStore';
import { sendModeOf, sendModeReason, sendPitches, previewSend } from './sendMode';
import type { SendItem } from './sendStore';

const D = '2026-11-15T10:00:00.000Z';
const oct = ratioNote(2, 1);
const round = (n: readonly Note[]) => n.map((p) => Math.round(p.c * 10) / 10);

// scenario a: JI 4:5:6 chip in a 12-EDO field: the field's nearest notes are C E G, the exact ones 0, 386.3, 702 c
const root: Note = { m: null, c: 0 };
const chip: SendItem = {
  kind: 'chord',
  label: '4:5:6 on C',
  pitches: [0, 400, 700].map((c) => ({ m: null, c })),
  rep: oct,
  exact: placeShape(root, exactShape('4:5:6')!),
  detail: { template: '4:5:6', root: 'C' },
};
// d: a positional chord
const positional: SendItem = {
  kind: 'chord',
  label: '2-2 on 1',
  pitches: [0, 400, 700].map((c) => ({ m: null, c })),
  rep: oct,
  fixed: true,
  detail: { pattern: '2-2', tail: '7 of 12-EDO · 400-300 c', root: 'degree 1' },
};

const sendTo = (s: CompositesState, item: SendItem, mode: 'field' | 'exact') =>
  compositesReduce(s, {
    type: 'composite/addItem',
    to: 'new',
    item: {
      kind: item.kind,
      label: item.label,
      pitches: sendPitches(item, mode),
      rep: item.rep,
      detail: item.detail,
    },
    date: D,
  });

const addNote = () =>
  compositesReduce(emptyComposites(), {
    type: 'composite/addItem',
    to: 'new',
    item: { kind: 'note', label: 'n', pitches: [{ m: null, c: 5 }] },
    date: D,
  });

describe('send mode: as in field vs exact (scenarios a to d)', () => {
  it('a: shelf on As in field: the composite gets the nearest field notes 0, 400, 700 c', () => {
    const mode = sendModeOf({ ...emptySketch(), exact: false });
    expect(mode).toBe('field');
    const s = sendTo(emptyComposites(), chip, mode);
    expect(round(s.list[0].items[0].pitches)).toEqual([0, 400, 700]);
    expect(s.list[0].items[0].pitches.every((p) => p.m === null)).toBe(true);
  });

  it('b: flipped to Exact, the composite gets 0, 386.3, 702 c and the preview shows them before the send', () => {
    const p = previewSend([], chip, 'exact', oct);
    expect(round(p.added)).toEqual([0, 386.3, 702]);
    const s = sendTo(emptyComposites(), chip, 'exact');
    expect(round(s.list[0].items[0].pitches)).toEqual([0, 386.3, 702]);
    // the same pitches the preview showed
    expect(round(sendPitches(chip, 'exact'))).toEqual(round(p.added));
  });

  it('the preview of As in field differs from Exact', () => {
    expect(round(previewSend([], chip, 'field', oct).added)).toEqual([0, 400, 700]);
  });

  it('c: shelf switch on Exact: the default mode is exact', () => {
    const mode = sendModeOf({ ...emptySketch(), exact: true });
    expect(mode).toBe('exact');
    expect(round(sendPitches(chip, mode))).toEqual([0, 386.3, 702]);
  });

  it('d: a positional chord is fixed: mode is disabled with a reason and both modes send the field notes', () => {
    expect(sendModeReason(positional)).toMatch(/positional/i);
    expect(round(sendPitches(positional, 'exact'))).toEqual([0, 400, 700]);
    expect(round(sendPitches(positional, 'field'))).toEqual([0, 400, 700]);
    expect(round(previewSend([], positional, 'exact', oct).added)).toEqual([0, 400, 700]);
  });

  it('an item without an exact form (a note, a subset) ignores the mode', () => {
    const note: SendItem = { kind: 'note', label: 'n', pitches: [{ m: null, c: 100 }], rep: oct };
    expect(sendModeReason(note)).not.toBeNull();
    expect(round(sendPitches(note, 'exact'))).toEqual([100]);
    expect(sendModeReason(chip)).toBeNull();
  });
});

describe('composite item detail (scenario f, composite side)', () => {
  it('f: a positional chord keeps its pattern and tail, plus the cents list', () => {
    const s = sendTo(emptyComposites(), positional, 'field');
    const d = s.list[0].items[0].detail!;
    expect(d.pattern).toBe('2-2');
    expect(d.tail).toBe('7 of 12-EDO · 400-300 c');
    expect(d.root).toBe('degree 1');
    expect(d.cents).toEqual([0, 400, 700]);
  });

  it('a ratio chord keeps template and root; a selection without detail still gets its cents', () => {
    const s = sendTo(emptyComposites(), chip, 'exact');
    const d = s.list[0].items[0].detail!;
    expect(d).toMatchObject({ template: '4:5:6', root: 'C', pattern: null, tail: null });
    expect(d.cents).toEqual([0, 386.31, 701.96]);
    const bare = compositesReduce(emptyComposites(), {
      type: 'composite/addItem',
      to: 'new',
      item: { kind: 'selection', label: 's', pitches: [{ m: null, c: 5 }] },
      date: D,
    });
    expect(bare.list[0].items[0].detail?.cents).toEqual([5]);
  });

  it('a note or subset without a detail has none', () => {
    expect(addNote().list[0].items[0].detail).toBeNull();
  });

  it('survives a store round trip; an item without a detail is stored byte for byte as before', () => {
    const s = sendTo(emptyComposites(), positional, 'field');
    const json = JSON.parse(JSON.stringify(compositesToStored(s))) as unknown;
    expect(sanitizeComposites(json)!.list[0].items[0].detail).toEqual(s.list[0].items[0].detail);
    const stored = compositesToStored(addNote()) as { composites: { items: object[] }[] };
    expect('detail' in stored.composites[0].items[0]).toBe(false);
  });

  it('old stored data (no detail) loads with detail null; damaged detail entries are cleaned', () => {
    const p = [{ m: null, c: 0 }];
    const old = {
      version: 1,
      composites: [
        {
          id: 1,
          name: 'C',
          next: 4,
          updated: D,
          items: [
            { id: 'i1', kind: 'chord', label: 'old', pitches: p, rep: null, source: null },
            {
              id: 'i2',
              kind: 'chord',
              label: 'bad',
              pitches: p,
              rep: null,
              source: null,
              detail: {
                template: 5,
                tail: 'x'.repeat(500),
                pattern: 'zz',
                root: 'C',
                cents: [1, 'a', null, 2.555],
              },
            },
            { id: 'i3', kind: 'chord', label: 'junk', pitches: p, detail: 'nope' },
          ],
        },
      ],
    };
    const items = sanitizeComposites(old)!.list[0].items as CompositeItem[];
    expect(items).toHaveLength(3);
    expect(items[0].detail).toBeNull();
    expect(items[1].detail).toEqual({
      template: null,
      root: 'C',
      pattern: null,
      tail: null,
      cents: [1, 2.56],
    });
    expect(items[2].detail).toBeNull();
  });
});

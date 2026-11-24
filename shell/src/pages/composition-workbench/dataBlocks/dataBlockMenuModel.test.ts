import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packet } from '../model';
import { registerConversion } from './acceptance';
import { dataBlockMenuModel, makeSourceInputSpec } from './dataBlockMenuModel';
import {
  registerDataBlockType,
  makeSourceRefusal,
  type DataBlockTypeDef,
  type PacketBlock,
} from './registry';
import { notesTestType, pitchSetTestType, rhythmTestType } from './testTypes';

function block(id: string, name: string, typeId: string, count = 3): PacketBlock {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `${id}:${i}`,
    value: 6000 + i,
    provenance: [],
  }));
  return {
    schemaVersion: 2,
    id,
    typeId,
    name,
    createdAt: '2026-11-24T00:00:00Z',
    payload: { kind: 'packet', packet: packet('list', 'pitch', items) },
  };
}

const R = block('R', 'Clave', 'rhythm-test');
const P = block('P', 'Ring A', 'pitch-set-test');
const M = block('M', 'Melody', 'notes-test');
const E = block('E', 'Empty', 'pitch-set-test', 0);

let removers: (() => void)[] = [];
function register(def: DataBlockTypeDef) {
  removers.push(registerDataBlockType(def));
}

beforeEach(() => {
  [notesTestType, pitchSetTestType, rhythmTestType].forEach(register);
});
afterEach(() => {
  removers.forEach((remove) => remove());
  removers = [];
});

const usersOf = (id: string) => (id === 'R' ? 3 : 0);

describe('dataBlockMenuModel', () => {
  it('lists only exact matches for the input, with the user count and type label (S8 A)', () => {
    const model = dataBlockMenuModel({
      spec: { accepts: ['pitch-set-test'] },
      blocks: [R, P, M],
      usersOf,
    });
    expect(model.exact.map((row) => row.block.id)).toEqual(['P']);
    expect(model.exact[0].typeLabel).toBe('Pitch set');
    expect(model.reinterpret).toEqual([]);
  });

  it('puts exact matches first and reinterpret rows apart, each with the conversion wording', () => {
    removers.push(
      registerConversion({
        id: 'notes-to-pitch-set-test',
        from: 'notes-test',
        to: 'pitch-set-test',
        label: 'Pitch set',
        describe: 'drops the timing',
        convert: (b) => ({ ...b, typeId: 'pitch-set-test' }),
      })
    );
    const model = dataBlockMenuModel({
      spec: { accepts: ['pitch-set-test'], conversions: ['notes-to-pitch-set-test'] },
      blocks: [M, P, R],
      usersOf,
    });
    expect(model.exact.map((row) => row.block.id)).toEqual(['P']);
    expect(model.reinterpret.map((row) => row.block.id)).toEqual(['M']);
    expect(model.reinterpret[0].conversion).toEqual({
      id: 'notes-to-pitch-set-test',
      label: 'Pitch set',
      describe: 'drops the timing',
    });
  });

  it('does not offer a conversion the input does not list', () => {
    removers.push(
      registerConversion({
        id: 'unlisted-test',
        from: 'notes-test',
        to: 'pitch-set-test',
        label: 'Pitch set',
        describe: 'x',
        convert: (b) => ({ ...b, typeId: 'pitch-set-test' }),
      })
    );
    const model = dataBlockMenuModel({
      spec: { accepts: ['pitch-set-test'], conversions: [] },
      blocks: [M, P],
      usersOf,
    });
    expect(model.reinterpret).toEqual([]);
  });

  it('searches name, note and type label, ignoring case, in both lists', () => {
    const spec = { accepts: ['pitch-set-test', 'rhythm-test'] };
    const search = (query: string) =>
      dataBlockMenuModel({ spec, blocks: [R, P, M], query, usersOf }).exact.map(
        (row) => row.block.id
      );
    expect(search('')).toEqual(['R', 'P']);
    expect(search('CLAVE')).toEqual(['R']);
    expect(search('pitch set')).toEqual(['P']);
    expect(search('zzz')).toEqual([]);
  });

  it('reports user counts and leaves out excluded ids', () => {
    const model = dataBlockMenuModel({
      spec: { accepts: ['pitch-set-test', 'rhythm-test'] },
      blocks: [R, P],
      usersOf,
      exclude: ['P'],
    });
    expect(model.exact.map((row) => [row.block.id, row.users])).toEqual([['R', 3]]);
  });

  it('carries a row refusal (a Make source cannot show an empty data-block)', () => {
    const model = dataBlockMenuModel({
      spec: makeSourceInputSpec(),
      blocks: [P, E],
      usersOf,
      refuse: makeSourceRefusal,
    });
    expect(model.exact.map((row) => [row.block.id, row.refusal === null])).toEqual([
      ['P', true],
      ['E', false],
    ]);
  });

  it('the Make source input takes every registered packet type', () => {
    expect(makeSourceInputSpec().accepts).toEqual(
      expect.arrayContaining(['notes-test', 'pitch-set-test', 'rhythm-test'])
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildStageRegistry,
  instanceId,
  isReservedPanelId,
  knownPanelIds,
  parseInstanceId,
  type PanelKind,
} from './instances';

const kind = (id: string, over: Partial<PanelKind> = {}): PanelKind => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  sizes: [{ width: 'regular', height: 'regular' }],
  minSize: { width: 'narrow', height: 'short' },
  render: () => null,
  ...over,
});
const KINDS = [kind('canvas'), kind('set', { multiple: true, home: 'Tools' })];

describe('dynamic registry helpers', () => {
  it('names instance ids <kind>:<key> and parses them back', () => {
    expect(instanceId('set', 'a1')).toBe('set:a1');
    expect(parseInstanceId('set:a1')).toEqual({ kind: 'set', key: 'a1' });
    expect(parseInstanceId('set:a:b')).toEqual({ kind: 'set', key: 'a:b' });
    expect(parseInstanceId('canvas')).toBeNull();
    expect(parseInstanceId(':x')).toBeNull();
    expect(parseInstanceId('x:')).toBeNull();
  });

  it('knows the single kinds and the instances of multiple kinds before any workspace is parsed', () => {
    const known = knownPanelIds(KINDS, [
      { kind: 'set', key: '1' },
      { kind: 'set', key: '2' },
      { kind: 'canvas', key: 'zz' }, // not a multiple kind: ignored
      { kind: 'gone', key: '1' }, // unknown kind: ignored
    ]);
    expect([...known].sort()).toEqual(['canvas', 'set:1', 'set:2']);
    expect(known.has('set')).toBe(false);
  });

  it('builds a registry of the single kinds and one panel per instance, with titles and homes', () => {
    const reg = buildStageRegistry(KINDS, [
      { kind: 'set', key: '1' },
      { kind: 'set', key: '2', title: 'Carter hexachord' },
      { kind: 'set', key: '1' }, // a repeated key is ignored
    ]);
    expect([...reg.meta.keys()]).toEqual(['canvas', 'set:1', 'set:2']);
    expect(reg.meta.get('set:1')?.title).toBe('Set 1');
    expect(reg.meta.get('set:2')?.title).toBe('Carter hexachord');
    expect(reg.meta.get('set:1')?.home).toBe('Tools');
    expect([...reg.modules.keys()]).toEqual(['canvas', 'set:1', 'set:2']);
  });

  it('hands the instance key to the kind render', () => {
    const seen: (string | undefined)[] = [];
    const reg = buildStageRegistry(
      [kind('set', { multiple: true, render: (_s, key) => void seen.push(key) })],
      [{ kind: 'set', key: 'k' }]
    );
    reg.modules.get('set:k')!.render({ width: 'regular', height: 'regular' });
    expect(seen).toEqual(['k']);
  });

  it('reserves ids that start with two underscores', () => {
    expect(isReservedPanelId('__api')).toBe(true);
    expect(isReservedPanelId('api')).toBe(false);
  });
});

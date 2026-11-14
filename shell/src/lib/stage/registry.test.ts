import { describe, expect, it } from 'vitest';
import {
  createRegistry,
  hasModule,
  registryProblems,
  sizesSatisfyMin,
  type ModuleMeta,
} from './registry';

const meta = (id: string, over: Partial<ModuleMeta> = {}): ModuleMeta => ({
  id,
  title: id,
  sizes: [{ width: 'regular', height: 'regular' }],
  minSize: { width: 'narrow', height: 'short' },
  ...over,
});

describe('registry', () => {
  it('is an open map by plain string id', () => {
    const r = createRegistry([meta('a'), meta('b')]);
    expect(hasModule(r, 'a')).toBe(true);
    expect(hasModule(r, 'zzz')).toBe(false);
    expect(hasModule(r, 5)).toBe(false);
  });
  it('rejects a repeated id', () => {
    expect(() => createRegistry([meta('a'), meta('a')])).toThrow();
  });
  it('checks that declared sizes satisfy minSize', () => {
    const bad = meta('bad', {
      sizes: [{ width: 'narrow', height: 'short' }],
      minSize: { width: 'regular', height: 'short' },
    });
    expect(sizesSatisfyMin(meta('ok'))).toBe(true);
    expect(sizesSatisfyMin(bad)).toBe(false);
    expect(registryProblems(createRegistry([meta('ok'), bad]))).toEqual(['bad']);
  });
});

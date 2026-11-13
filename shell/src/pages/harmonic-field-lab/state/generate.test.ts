import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../../lib/harmonic-field';
import {
  autoName,
  defaultGen,
  genFromPreset,
  genKey,
  generateField,
  mosFor,
  parseRepeat,
  presetByName,
} from './generate';

describe('generateField', () => {
  it('builds every preset: a non-empty field, and the preset name is kept', () => {
    for (const p of PRESETS) {
      const g = genFromPreset(p);
      expect(g.preset).toBe(p.name);
      const r = generateField(g);
      expect(r.ok).toBe(true);
      const field = r.ok ? r.field : [];
      expect(field.length).toBeGreaterThan(0);
      expect(field[0]?.c ?? 1).toBeCloseTo(0, 6);
    }
  });

  it('Harmonics 8-15 is eight notes from 1/1 to 15/8 and the default prime filter keeps all primes', () => {
    const p = presetByName('Harmonics 8–15')!;
    const g = genFromPreset(p);
    const r = generateField(g);
    expect(r.ok && r.field.length).toBe(8);
    expect(g.mask.every(Boolean)).toBe(true);
    expect(g.method).toBe('harmonic');
    expect(g.h).toBe(8);
  });

  it('applies the prime filter: only 3 and 5 on a harmonic field drops 7, 11, 13', () => {
    const g = { ...defaultGen(), method: 'harmonic' as const, h: 8 };
    g.mask = g.mask.map((_, i) => i === 0 || i === 1 || i === 2); // 2, 3, 5
    const r = generateField(g);
    expect(r.ok && r.field.length).toBe(5); // 1/1 9/8 5/4 3/2 15/8
  });

  it('shows a parse failure as a message, never a throw', () => {
    for (const rep of ['', 'abc', '0', '1/1', '0/0', '-3', '1\\0']) {
      const r = generateField({ ...defaultGen(), rep });
      expect(r.ok).toBe(false);
      expect(r.ok ? 0 : r.err.length).toBeGreaterThan(5);
    }
    const bad = parseRepeat('nonsense');
    expect('err' in bad && bad.err).toMatch(/cannot read "nonsense"/);
    const one = parseRepeat('1/1');
    expect('err' in one && one.err).toMatch(/larger than 1\/1/);
  });

  it('names the bad lattice axis and the bad CPS factor', () => {
    const lat = defaultGen();
    lat.method = 'lattice';
    lat.axes[1] = { on: true, g: 'zzz', n: 3, ctr: 1 };
    const r = generateField(lat);
    expect(!r.ok && r.err).toMatch(/Axis 2: cannot read the generator "zzz"/);
    // an axis that is off is not read
    lat.axes[1].on = false;
    expect(generateField(lat).ok).toBe(true);
    // a generator of 1/1 is refused
    lat.axes[0].g = '1/1';
    expect(generateField(lat).ok).toBe(false);
    const cps = { ...defaultGen(), method: 'cps' as const, cpsF: '1 3 x 7' };
    const c = generateField(cps);
    expect(!c.ok && c.err).toMatch(/CPS factor: cannot read "x"/);
  });

  it('clamps silly numbers instead of failing', () => {
    const edo = generateField({ ...defaultGen(), method: 'edo', edoN: 99999 });
    expect(edo.ok && edo.field.length).toBe(2048);
    const h = generateField({ ...defaultGen(), method: 'harmonic', h: Number.NaN });
    expect(h.ok).toBe(true);
    const cps = generateField({ ...defaultGen(), method: 'cps', cpsK: 0 });
    expect(cps.ok).toBe(true);
  });

  it('a custom list with junk lines does not throw', () => {
    const r = generateField({ ...defaultGen(), method: 'custom', custom: '9/8\nnonsense\n\n5/4' });
    expect(typeof r.ok).toBe('boolean');
  });

  it('keeps 1/1 even when every prime is off, and warns when the field is cut', () => {
    const g = { ...defaultGen(), method: 'harmonic' as const, h: 8 };
    g.mask = g.mask.map(() => false);
    const r = generateField(g);
    expect(r.ok && r.field.length).toBe(1);
    const big = generateField({ ...defaultGen(), method: 'harmonic', h: 3000, rep: '3/1' });
    expect(big.ok && big.warn).toMatch(/Truncated/);
  });

  it('an EDO of the repeat 3/1 divides the tritave', () => {
    const r = generateField({ ...defaultGen(), method: 'edo', edoN: 13, rep: '3/1' });
    expect(r.ok && r.field).toHaveLength(13);
    expect(r.ok && r.rep.c).toBeCloseTo(1901.955, 2);
  });
});

describe('genKey and names', () => {
  it('ignores the preset name and keepNew, and the inputs of other methods', () => {
    const a = defaultGen();
    const b = { ...a, preset: 'Something', keepNew: true, cpsF: '9 9 9', custom: 'x' };
    expect(genKey(a)).toBe(genKey(b));
    expect(genKey({ ...a, h: 9 })).not.toBe(genKey(a));
    expect(genKey({ ...a, rep: '3/1' })).not.toBe(genKey(a));
    const mask = a.mask.slice();
    mask[3] = false;
    expect(genKey({ ...a, mask })).not.toBe(genKey(a));
    expect(genKey({ ...a, method: 'sub' })).not.toBe(genKey(a));
  });

  it('a CPS key keeps the prime filter and k (they used to overwrite each other)', () => {
    const a = { ...defaultGen(), method: 'cps' as const };
    const mask = a.mask.slice();
    mask[3] = false;
    expect(genKey({ ...a, mask })).not.toBe(genKey(a));
    expect(genKey({ ...a, cpsK: 3 })).not.toBe(genKey(a));
    expect(genKey({ ...a, cpsF: '1 3 5 7' })).toBe(genKey({ ...a, cpsF: ' 1  3 5 7 ' }));
  });

  it('normalises the repeat and ignores inputs the shape does not use', () => {
    const a = defaultGen();
    expect(genKey({ ...a, rep: '2' })).toBe(genKey({ ...a, rep: '2/1' }));
    expect(genKey({ ...a, rep: '1200c' })).toBe(genKey({ ...a, rep: '2/1' }));
    expect(genKey({ ...a, rep: '3' })).not.toBe(genKey({ ...a, rep: '2' }));
    const box = { ...a, method: 'lattice' as const, shape: 'box' as const };
    // a box ignores the diamond's distance and direction
    expect(genKey({ ...box, dist: 9, bidir: false })).toBe(genKey(box));
    expect(
      genKey({ ...box, axes: box.axes.map((x, i) => (i === 0 ? { ...x, n: 5 } : x)) })
    ).not.toBe(genKey(box));
    // a diamond ignores counts and centres, and axes that are off
    const dia = { ...box, shape: 'diamond' as const };
    const other = {
      ...dia,
      axes: dia.axes.map((x, i) =>
        i === 0 ? { ...x, n: 5, ctr: 2 } : i === 2 ? { ...x, g: '9/8' } : x
      ),
    };
    expect(genKey(other)).toBe(genKey(dia));
    expect(genKey({ ...dia, dist: 4 })).not.toBe(genKey(dia));
    expect(genKey(dia)).not.toBe(genKey(box));
    // the harmonic method ignores everything else
    expect(genKey({ ...a, dist: 9, cpsK: 5, edoN: 3 })).toBe(genKey(a));
  });

  it('names a tab after its preset, or describes the inputs', () => {
    expect(autoName({ ...defaultGen(), preset: 'Harmonics 8–15' })).toBe('Harmonics 8–15');
    expect(autoName({ ...defaultGen(), h: 12 })).toBe('Harmonics from 12');
    expect(autoName({ ...defaultGen(), method: 'sub', h: 12 })).toBe('Subharmonics from 12');
    expect(autoName({ ...defaultGen(), method: 'edo', edoN: 19 })).toBe('19-EDO');
    expect(autoName({ ...defaultGen(), method: 'cps', cpsF: '1 3 5 7', cpsK: 2 })).toBe(
      'CPS 1 3 5 7 choose 2'
    );
    expect(autoName({ ...defaultGen(), method: 'custom' })).toBe('Custom scale');
  });

  it('lists the chain sizes of axis 1 that give a MOS (3/2 over an octave: 5, 7, 12 are there)', () => {
    const g = { ...defaultGen(), method: 'lattice' as const };
    const sizes = mosFor(g).map((m) => m.n);
    expect(sizes).toEqual(expect.arrayContaining([5, 7, 12]));
    expect(mosFor({ ...g, rep: 'bad' })).toEqual([]);
    expect(
      mosFor({ ...g, axes: [{ on: true, g: 'bad', n: 3, ctr: 0 }, ...g.axes.slice(1)] })
    ).toEqual([]);
  });
});

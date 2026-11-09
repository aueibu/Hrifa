import { describe, expect, it } from 'vitest';
import { findForteEntry, forteCatalog } from '../composition-workbench/forteCatalog';
import { catalog, icvOf } from './pitchSets';

/** The artifact's original interval-vector routine, kept as the reference the shared one must match. */
function referenceVector(pcs: number[]) {
  const v = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      let d = Math.abs(pcs[i] - pcs[j]) % 12;
      if (d > 6) {
        d = 12 - d;
      }
      if (d) {
        v[d - 1]++;
      }
    }
  }
  return v;
}

describe('interval vector shared with the Forte catalog', () => {
  it('agrees with the artifact routine on every non-empty subset of the 12 pitch classes', () => {
    for (let mask = 1; mask < 4096; mask++) {
      const pcs: number[] = [];
      for (let b = 0; b < 12; b++) {
        if (mask & (1 << b)) {
          pcs.push(b);
        }
      }
      expect(icvOf(pcs)).toEqual(referenceVector(pcs));
    }
  });
});

describe('Forte numbers on catalog rows', () => {
  it('names the familiar set classes', () => {
    expect(findForteEntry([0, 2, 4, 5, 7, 9, 11])?.forteNumber).toBe('7-35');
    expect(findForteEntry([0, 2, 4, 6, 8, 10])?.forteNumber).toBe('6-35');
    expect(findForteEntry([0, 3, 6, 9])?.forteNumber).toBe('4-28');
    expect(findForteEntry([0, 4, 7])?.forteNumber).toBe('3-11');
    expect(findForteEntry([0, 3, 7])?.forteNumber).toBe('3-11');
  });

  it('gives every row of every size a Forte number that matches its size and vector', () => {
    for (let n = 1; n <= 12; n++) {
      catalog(n, false, 'rahn').forEach((row) => {
        const entry = forteCatalog[row.forteOrder];
        expect(entry).toBeDefined();
        expect(entry.forteNumber).toBe(row.forte);
        expect(entry.cardinality).toBe(n);
        expect(entry.intervalClassVector).toEqual(row.icv);
      });
    }
  });

  it('gives both mirror images of a set the same Forte number', () => {
    const rows = catalog(5, false, 'rahn');
    rows.forEach((row) => {
      const mirror = rows.find((r) => r.key === row.mirrorKey);
      expect(mirror?.forte).toBe(row.forte);
    });
  });

  it('gives the two Rahn and Forte readings of 5-20 one Forte number', () => {
    const rahn = catalog(5, true, 'rahn').find((r) => r.key === '0 1 3 7 8');
    const forte = catalog(5, true, 'forte').find((r) => r.key === '0 1 5 6 8');
    expect(rahn?.forte).toBe('5-20');
    expect(forte?.forte).toBe('5-20');
  });
});

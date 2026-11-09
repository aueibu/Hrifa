import { describe, expect, it } from 'vitest';
import { catalog, icvOf, icvText } from './pitchSets';
import { spectrumChange, spectrumOf } from './spectrum';
import { editResult, emptyEdit, stepButton, strictOk, vectorDistance } from './vectorEdit';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Swap-graph degree of a class: how many other classes sit one +1/−1 swap away from its vector. */
function swapDegree(rows: ReturnType<typeof catalog>, base: number[]) {
  return rows.filter((r) =>
    ([0, 1, 2, 3, 4, 5] as const).some((i) =>
      ([1, -1] as const).some((dir) => strictOk(r, i, dir, base))
    )
  ).length;
}

describe('swap graph', () => {
  it('matches the swap degrees recorded for every three-note class', () => {
    const rows = catalog(3, true, 'rahn');
    const expected: Record<string, number> = {
      '<210000>': 1,
      '<111000>': 3,
      '<101100>': 3,
      '<100110>': 3,
      '<100011>': 1,
      '<020100>': 1,
      '<011010>': 3,
      '<010101>': 1,
      '<010020>': 1,
      '<002001>': 0,
      '<001110>': 3,
      '<000300>': 0,
    };
    rows.forEach((row) => {
      expect(`${icvText(row.icv)}=${swapDegree(rows, row.icv)}`).toBe(
        `${icvText(row.icv)}=${expected[icvText(row.icv)]}`
      );
    });
  });

  it('has the swap-edge counts implied by the recorded node degrees for 3 to 6 notes (mirror images merged)', () => {
    const edges = (n: number) => {
      const rows = catalog(n, true, 'rahn');
      return rows.reduce((sum, r) => sum + swapDegree(rows, r.icv), 0) / 2;
    };
    expect([3, 4, 5, 6].map(edges)).toEqual([10, 63, 76, 144]);
  });

  it('never treats a Z-related partner (same vector) as a swap neighbour', () => {
    const rows = catalog(6, true, 'rahn');
    const row = rows[0];
    expect(strictOk(row, 0, 1, row.icv)).toBe(false);
  });
});

describe('editing the vector', () => {
  const rows = catalog(7, true, 'rahn');
  const base = icvOf(MAJOR);

  it('offers no result until something is edited', () => {
    expect(editResult(rows, base, emptyEdit(), false, 'rahn').any).toBe(false);
  });

  // a class that is exactly one swap from the major scale, found the same way the tab does
  const swapNeighbour =
    rows.find((r) => strictOk(r, 4, -1, base) || strictOk(r, 4, 1, base)) ??
    rows.find((r) =>
      ([0, 1, 2, 3, 4, 5] as const).some((i) =>
        ([1, -1] as const).some((dir) => strictOk(r, i, dir, base))
      )
    )!;
  const move = (() => {
    for (const i of [0, 1, 2, 3, 4, 5] as const) {
      for (const dir of [1, -1] as const) {
        if (strictOk(swapNeighbour, i, dir, base)) {
          return { i, dir };
        }
      }
    }
    throw new Error('no move');
  })();

  it('free-edit finds the classes with the pushed entries, nearest first', () => {
    const deltas = swapNeighbour.icv.map((v, i) => v - base[i]);
    const res = editResult(rows, base, { deltas, move: null }, false, 'rahn');
    expect(res.any).toBe(true);
    expect(res.matches.map((m) => m.key)).toContain(swapNeighbour.key);
    res.matches.forEach((m) => {
      for (const [i, d] of deltas.entries()) {
        expect(m.icv[i]).toBe(d !== 0 ? base[i] + d : m.icv[i]);
      }
    });
    const dists = res.matches.map((m) => m.dist);
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
    expect(res.matches.every((m) => m.dist === vectorDistance(m.icv, base))).toBe(true);
  });

  it('strict swap returns only classes exactly one swap away', () => {
    const res = editResult(rows, base, { deltas: [0, 0, 0, 0, 0, 0], move }, true, 'rahn');
    expect(res.matches.map((m) => m.key)).toContain(swapNeighbour.key);
    res.matches.forEach((m) => {
      expect(m.dist).toBe(2);
      expect(m.icv[move.i]).toBe(base[move.i] + move.dir);
    });
  });

  it('counts classes on each button and lets an edit be undone', () => {
    const up = stepButton(rows, base, emptyEdit(), false, 4, 1);
    expect(up.ghost).toMatch(/^\(\d+\)$/);
    const edited = { deltas: [0, 0, 0, 0, 1, 0], move: null };
    const down = stepButton(rows, base, edited, false, 4, -1);
    expect(down.ghost).toBe('undo');
    expect(down.disabled).toBe(false);
  });

  it('disables a step that would give a negative entry', () => {
    const zeroEntry = catalog(4, true, 'rahn').find((r) => r.icv[0] === 0);
    expect(zeroEntry).toBeDefined();
    expect(
      stepButton(catalog(4, true, 'rahn'), zeroEntry!.icv, emptyEdit(), false, 0, -1).disabled
    ).toBe(true);
  });
});

describe('spectrum', () => {
  it('equals n + 2 * sum IC_d cos(pi k d / 6) for every component', () => {
    let worst = 0;
    for (let mask = 1; mask < 4096; mask++) {
      const pcs: number[] = [];
      for (let b = 0; b < 12; b++) {
        if (mask & (1 << b)) {
          pcs.push(b);
        }
      }
      const v = icvOf(pcs);
      spectrumOf(pcs).forEach((term, i) => {
        const k = i + 1;
        let expected = pcs.length;
        for (let d = 1; d <= 6; d++) {
          expected += 2 * v[d - 1] * Math.cos((Math.PI * k * d) / 6);
        }
        worst = Math.max(worst, Math.abs(term.pow - expected));
      });
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('puts the diatonic set strongest on f5 and the whole-tone set entirely on f6', () => {
    const major = spectrumOf(MAJOR).map((t) => t.pow);
    expect(Math.max(...major)).toBe(major[4]);
    const whole = spectrumOf([0, 2, 4, 6, 8, 10]).map((t) => t.pow);
    expect(whole[5]).toBeCloseTo(36);
  });

  it('describes which components moved, ignoring tiny changes', () => {
    const a = spectrumOf(MAJOR);
    expect(spectrumChange(a, a)).toEqual([]);
    const b = spectrumOf([0, 2, 3, 5, 7, 8, 11]);
    expect(spectrumChange(a, b).length).toBeGreaterThan(0);
  });
});

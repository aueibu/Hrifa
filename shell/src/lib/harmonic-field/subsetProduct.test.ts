import { describe, expect, it } from 'vitest';
import { centsNote, fmtRatio, ratioNote } from './intervals';
import {
  addProductNotes,
  productTooMany,
  subsetProduct,
  type ProductDirection,
} from './subsetProduct';
import type { Note } from './types';

const OCT = ratioNote(2, 1);
const r = (n: number, d: number) => ratioNote(n, d);
const A = [r(1, 1), r(5, 4), r(3, 2)];
const B = [r(1, 1), r(6, 5), r(3, 2)];
const texts = (ns: readonly Note[]) => ns.map(fmtRatio);

function run(
  sources: Note[],
  shape: Note[],
  direction: ProductDirection,
  steps: number,
  field: Note[] = [],
  tol = 0
) {
  return subsetProduct({ sources, shape, direction, steps, rep: OCT, field, tol });
}

describe('subsetProduct (SCENARIOS.M8g P1 to P7)', () => {
  it('P1: the major triad on itself, Up', () => {
    const x = run(A, A, 'up', 1);
    expect(x.total).toBe(9);
    expect(texts(x.distinct)).toEqual(['1/1', '9/8', '5/4', '3/2', '25/16', '15/8']);
    expect(x.fresh).toHaveLength(6);
  });

  it('P2: only 3/2 picked as the source', () => {
    const x = run([r(3, 2)], A, 'up', 1);
    expect(x.total).toBe(3);
    expect(texts(x.distinct)).toEqual(['9/8', '3/2', '15/8']);
  });

  it('P3: major triad on the minor triad shape', () => {
    const x = run(A, B, 'up', 1);
    expect(x.total).toBe(9);
    expect(texts(x.distinct)).toEqual(['1/1', '9/8', '6/5', '5/4', '3/2', '9/5', '15/8']);
  });

  it('P4: Down gives the tonality diamond', () => {
    const x = run(A, A, 'down', 1);
    expect(x.total).toBe(9);
    expect(texts(x.distinct)).toEqual(['1/1', '6/5', '5/4', '4/3', '3/2', '8/5', '5/3']);
  });

  it('P5: Both is P1 and P4 together', () => {
    const x = run(A, A, 'both', 1);
    expect(x.total).toBe(18);
    expect(texts(x.distinct)).toEqual([
      '1/1',
      '9/8',
      '6/5',
      '5/4',
      '4/3',
      '3/2',
      '25/16',
      '8/5',
      '5/3',
      '15/8',
    ]);
  });

  it('P6: Steps 2 is Sources x Shape x Shape', () => {
    const x = run(A, A, 'up', 2);
    expect(x.total).toBe(27);
    expect(texts(x.distinct)).toEqual([
      '1/1',
      '9/8',
      '75/64',
      '5/4',
      '45/32',
      '3/2',
      '25/16',
      '27/16',
      '15/8',
      '125/64',
    ]);
  });

  it('P7: a one-note source copies the shape', () => {
    const x = run([r(1, 1)], A, 'up', 1);
    expect(x.total).toBe(3);
    expect(texts(x.distinct)).toEqual(['1/1', '5/4', '3/2']);
  });
});

describe('subsetProduct counts against the field (Q6)', () => {
  it('P1 on a field holding the triad: 9 products, 6 distinct, 3 already in the field', () => {
    const x = run(A, A, 'up', 1, A);
    expect(x.total).toBe(9);
    expect(x.distinct).toHaveLength(6);
    expect(x.inField).toBe(3);
    expect(texts(x.fresh)).toEqual(['9/8', '25/16', '15/8']);
  });

  it('a field note that a product merged into stands for it in the distinct list', () => {
    const x = run(A, A, 'up', 1, A);
    expect(x.distinct.filter((n) => fmtRatio(n) === '3/2')).toHaveLength(1);
  });
});

describe('subsetProduct merge tolerance (Q5)', () => {
  const comma = r(6561, 4096);
  const field = [r(1, 1), r(8, 5)];
  it('6561/4096 lands about 1.95 c from 8/5: merged at 5 c', () => {
    const x = run([r(1, 1)], [comma], 'up', 1, field, 5);
    expect(texts(x.fresh)).toEqual([]);
    expect(x.inField).toBe(1);
    expect(texts(x.distinct)).toEqual(['8/5']);
  });

  it('stays a second note at 0 c (exact equals only)', () => {
    const x = run([r(1, 1)], [comma], 'up', 1, field, 0);
    expect(texts(x.fresh)).toEqual(['6561/4096']);
    expect(x.inField).toBe(0);
  });

  it('a pitch within the tolerance of an earlier kept pitch is dropped, the earlier one kept', () => {
    const x = run([r(1, 1)], [r(8, 5), comma], 'up', 1, [], 5);
    expect(texts(x.fresh)).toEqual(['8/5']);
    const y = run([r(1, 1)], [comma, r(8, 5)], 'up', 1, [], 5);
    expect(texts(y.fresh)).toEqual(['6561/4096']);
  });

  it('an exact field note wins over a nearer-by-order kept pitch', () => {
    const x = run([r(1, 1)], [comma, r(8, 5)], 'up', 1, [r(8, 5)], 5);
    expect(x.fresh).toHaveLength(0);
    expect(x.inField).toBe(1);
  });
});

describe('subsetProduct kinds (original, new, merged)', () => {
  it('P1 on a field holding the triad: 3 original and 3 new', () => {
    const x = run(A, A, 'up', 1, A);
    expect(texts(x.distinct)).toEqual(['1/1', '9/8', '5/4', '3/2', '25/16', '15/8']);
    expect(x.kinds).toEqual(['original', 'new', 'original', 'original', 'new', 'new']);
  });

  it('6561/4096 against 8/5: merged at 5 c, new at 0 c', () => {
    const comma = r(6561, 4096);
    const field = [r(1, 1), r(8, 5)];
    expect(run([r(1, 1)], [comma], 'up', 1, field, 5).kinds).toEqual(['merged']);
    expect(run([r(1, 1)], [comma], 'up', 1, field, 0).kinds).toEqual(['new']);
  });

  it('a kept pitch that an earlier-order product merged into is merged', () => {
    const x = run([r(1, 1)], [r(8, 5), r(6561, 4096)], 'up', 1, [], 5);
    expect(x.kinds).toEqual(['merged']);
  });

  it('an exact hit plus a tolerance hit on one field note is merged', () => {
    const x = run([r(1, 1)], [r(8, 5), r(6561, 4096)], 'up', 1, [r(8, 5)], 5);
    expect(x.kinds).toEqual(['merged']);
  });
});

describe('subsetProduct cents pitches and limits', () => {
  it('cents-only pitches combine as cents sums, folded', () => {
    const e = [centsNote(0), centsNote(700)];
    const x = run(e, e, 'up', 1);
    expect(x.distinct.map((n) => Math.round(n.c))).toEqual([0, 200, 700]);
    expect(x.distinct.every((n) => n.m === null || Math.abs(n.c) < 1e-9)).toBe(true);
  });

  it('empty sources or shape give nothing', () => {
    expect(run([], A, 'up', 1).distinct).toEqual([]);
    expect(run(A, [], 'up', 1).total).toBe(0);
  });

  it('the product count is sources x shape^steps (doubled for Both)', () => {
    expect(run(A, A, 'both', 3).total).toBe(2 * 3 * 27);
  });
});

describe('addProductNotes (what Add writes into a Relative field)', () => {
  it('adds only the pitches that are not there, as pitch text', () => {
    expect(addProductNotes(['1/1', '5/4'], ['1/1', '9/8', '5/4', '25/16'], OCT)).toEqual([
      '1/1',
      '5/4',
      '9/8',
      '25/16',
    ]);
  });

  it('folds into the repeat and says the limit in plain words', () => {
    expect(addProductNotes(['1/1'], ['3/1'], OCT)).toEqual(['1/1', '3/2']);
    expect(productTooMany(310)).toBe('This would make 310 notes; the limit is 256.');
  });
});

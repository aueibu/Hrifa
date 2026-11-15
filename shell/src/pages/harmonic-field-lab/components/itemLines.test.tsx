import { describe, expect, it } from 'vitest';
import type { CompositeItem } from '../state/composites';
import { itemLines } from './CompositesPanel';

const item = (over: Partial<CompositeItem>): CompositeItem => ({
  id: 'i1',
  kind: 'chord',
  label: 'major triad on 200.0 c',
  pitches: [
    { m: null, c: 200 },
    { m: null, c: 600 },
    { m: null, c: 900 },
  ],
  rep: null,
  source: null,
  detail: { template: '4:5:6', root: '9/8', pattern: null, tail: null, family: 'Major' },
  ...over,
});
const text = (it: CompositeItem) => itemLines(it).map((l) => l.text);

describe('itemLines (M8g)', () => {
  it('a: ratios, family and root on line 1, the template name on line 2', () => {
    expect(text(item({})).slice(0, 3)).toEqual([
      '4:5:6 · Major on 200.0 c',
      'chord · 3 notes · major triad',
      '200.0, 600.0, 900.0 c',
    ]);
  });
  it('b: 3:5:7 triad keeps its own name', () => {
    const it = item({
      label: '3:5:7 triad on 0',
      pitches: [
        { m: null, c: 0 },
        { m: null, c: 435 },
        { m: null, c: 969 },
      ],
      detail: { template: '3:5:7', root: '1/1', pattern: null, tail: null, family: 'Septimal' },
    });
    expect(text(it).slice(0, 2)).toEqual([
      '3:5:7 · Septimal on 0.0 c',
      'chord · 3 notes · 3:5:7 triad',
    ]);
  });
  it('no family: ratios on root; positional keeps its label and has no template name', () => {
    expect(
      text(item({ detail: { template: '4:5:6', root: '9/8', pattern: null, tail: null } }))[0]
    ).toBe('4:5:6 on 200.0 c');
    const pos = item({
      label: '2-2 on 4',
      detail: { template: null, root: '1', pattern: '2-2', tail: null },
    });
    expect(text(pos).slice(0, 2)).toEqual(['2-2 on 4', 'chord · 3 notes']);
  });
});

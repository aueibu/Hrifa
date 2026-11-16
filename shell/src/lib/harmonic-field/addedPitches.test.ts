import { describe, expect, it } from 'vitest';
import { ADDED_MAX, addedPitchError, drawnAdded, parsePitchText, sanitizeAdded } from './index';

const G12 = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];

describe('parsePitchText', () => {
  it('a slash or colon is a ratio, anything else is cents; canonical text', () => {
    expect(parsePitchText('3:2')).toMatchObject({ canon: '3/2' });
    expect(parsePitchText('6/4')).toMatchObject({ canon: '3/2' });
    expect(parsePitchText(' 700c ')).toMatchObject({ c: 700, canon: '700 c' });
    expect(parsePitchText('701.9550001')).toMatchObject({ canon: '701.955 c' });
    expect(parsePitchText('')).toBeNull();
    for (const t of ['abc', '3/', '0/2', '1e3']) {
      expect(parsePitchText(t)).toBe('bad');
    }
  });
});

describe('addedPitchError', () => {
  it('row 11: junk and a note already in the subset are refused with a message', () => {
    const bad = addedPitchError('abc', G12, []);
    expect(bad).toMatchObject({ ok: false, kind: 'bad' });
    expect(bad.ok ? '' : bad.message).toMatch(/ratio or cents/i);
    const sub = addedPitchError('700', G12, []);
    expect(sub).toMatchObject({ ok: false, kind: 'subset' });
    expect(sub.ok ? '' : sub.message).toMatch(/already in the subset/i);
    expect(addedPitchError('1900', G12, [])).toMatchObject({ kind: 'subset' }); // 700 plus a repeat
    expect(addedPitchError('3/2', G12, [])).toEqual({ ok: true, canon: '3/2' }); // 701.955 is 1.955 c off G
  });
  it('a duplicate is flagged for silent ignoring', () => {
    expect(addedPitchError('6/4', G12, ['3/2'])).toMatchObject({
      ok: false,
      kind: 'duplicate',
      message: '',
    });
    expect(addedPitchError('701.955', G12, ['3/2'])).toMatchObject({ kind: 'duplicate' });
  });
  it('at most 4', () => {
    const four = ['10 c', '20 c', '30 c', '40 c'];
    expect(ADDED_MAX).toBe(4);
    const r = addedPitchError('50', G12.slice(1), four);
    expect(r).toMatchObject({ ok: false, kind: 'full' });
    expect(r.ok ? '' : r.message).toMatch(/at most 4/i);
  });
});

describe('sanitizeAdded and drawnAdded', () => {
  it('drops junk, cuts to 4, drops a pitch within 0.01 c of an earlier one', () => {
    expect(sanitizeAdded(['3/2', 'abc', 7, null, '6/4', '5/4', '10 c', '20 c', '30 c'])).toEqual([
      '3/2',
      '5/4',
      '10 c',
      '20 c',
    ]);
    expect(sanitizeAdded('3/2')).toEqual([]);
    expect(sanitizeAdded(undefined)).toEqual([]);
  });
  it('a stored pitch that coincides with a subset note is not drawn', () => {
    const d = drawnAdded(['700 c', '3/2', '2100 c'], G12, 1200);
    expect(d.map((x) => x.index)).toEqual([1]);
    expect(
      drawnAdded(
        ['3/2'],
        G12.filter((c) => c !== 700),
        1200
      )[0].c
    ).toBeCloseTo(701.955, 3);
  });
});

import { describe, expect, it } from 'vitest';
import { fitList } from './fitList';

describe('fitList', () => {
  it('keeps a list that fits, joined with commas', () => {
    expect(fitList(['1', '2', '4'], 8)).toEqual({ text: '1, 2, 4', full: '1, 2, 4', cut: false });
    expect(fitList(['5/4'], 8)).toEqual({ text: '5/4', full: '5/4', cut: false });
  });

  it('shows the most items that fit and +N for the rest', () => {
    expect(fitList(['1', '2', '4', '8'], 8)).toEqual({
      text: '1, 2 +2',
      full: '1, 2, 4, 8',
      cut: true,
    });
    expect(fitList(['1', '2', '4', '8', '16'], 8).text).toBe('1, 2 +3');
  });

  it('always shows at least one item, even when it is wider than the budget', () => {
    expect(fitList(['15/8', '16/9', '5/4'], 8).text).toBe('15/8 +2');
    expect(fitList(['8580', '9240'], 3)).toEqual({
      text: '8580 +1',
      full: '8580, 9240',
      cut: true,
    });
    expect(fitList(['8580:9240:10010'], 3).cut).toBe(false);
  });

  it('an empty list is empty', () => {
    expect(fitList([], 8)).toEqual({ text: '', full: '', cut: false });
  });
});

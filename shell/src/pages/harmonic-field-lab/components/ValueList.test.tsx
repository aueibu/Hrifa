import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ValueList, valueGroups } from './ValueList';

describe('ValueList', () => {
  it('keeps the unit with the last value and the text unchanged', () => {
    const text = '100.0, 200.0, 300.0, 400.0, 500.0 c';
    const { container } = render(<ValueList text={text} />);
    const vals = container.querySelectorAll('[data-value]');
    expect(vals).toHaveLength(5);
    expect(vals[4].textContent).toBe('500.0 c');
    expect(container.textContent).toBe(text);
  });
  it('glues steps to the first value', () => {
    expect(valueGroups('steps 300.0, 400.0 c')).toEqual(['steps 300.0,', ' ', '400.0 c']);
  });
  it('keeps ratios as separate values', () => {
    expect(valueGroups('4:5  6:7')).toEqual(['4:5', '  ', '6:7']);
  });
});

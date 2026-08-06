import { describe, expect, it } from 'vitest';
import { apcaAssessment, apcaContrast, formatApcaContrast } from './contrast';

describe('APCA contrast', () => {
  it('preserves polarity', () => {
    expect(apcaContrast('#141111', '#fbf9f5')).toBeGreaterThan(0);
    expect(apcaContrast('#fbf9f5', '#141111')).toBeLessThan(0);
  });

  it('formats and describes signed Lc values', () => {
    expect(formatApcaContrast(-67.4)).toBe('Lc -67');
    expect(apcaAssessment(64)).toBe('body text');
    expect(apcaAssessment(28)).toBe('low contrast');
  });
});

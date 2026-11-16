import { describe, expect, it } from 'vitest';
import { defaultUi } from './labState';
import { sanitizeSettings } from './persist';

describe('the Pairs Color setting (settings.v1)', () => {
  it('defaults to Off; old stored data without it loads as Off', () => {
    expect(defaultUi().pairsColor).toBe('off');
    expect(sanitizeSettings({ panel: 'keys' }).pairsColor).toBe('off');
    expect(sanitizeSettings(null).pairsColor).toBe('off');
  });

  it('keeps a valid mode and reads anything unknown as Off', () => {
    expect(sanitizeSettings({ pairsColor: 'error' }).pairsColor).toBe('error');
    expect(sanitizeSettings({ pairsColor: 'interval' }).pairsColor).toBe('interval');
    for (const bad of ['Error', 'red', 3, null, {}, true]) {
      expect(sanitizeSettings({ pairsColor: bad }).pairsColor).toBe('off');
    }
  });
});

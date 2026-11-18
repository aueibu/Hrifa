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

describe('relColor settings (M8o, H-37 per view)', () => {
  it('absent or damaged reads as Prime, Fixed, Exact', () => {
    const d = {
      rings: { metric: 'prime', range: 'fixed' },
      near: { metric: 'prime', range: 'fixed' },
      monzo: { metric: 'prime', range: 'fixed', octave: 'exact' },
    };
    expect(defaultUi().relColor).toEqual(d);
    expect(sanitizeSettings(null).relColor).toEqual(d);
    expect(sanitizeSettings({ panel: 'keys' }).relColor).toEqual(d);
    expect(sanitizeSettings({ relColor: 'bad' }).relColor).toEqual(d);
    expect(sanitizeSettings({ relColor: { metric: 'nope', range: 1 } }).relColor).toEqual(d);
  });

  it('keeps valid fields one by one, per view', () => {
    expect(
      sanitizeSettings({
        relColor: { near: { metric: 'tenney', range: 'fit' }, monzo: { octave: 'reduced' } },
      }).relColor
    ).toEqual({
      rings: { metric: 'prime', range: 'fixed' },
      near: { metric: 'tenney', range: 'fit' },
      monzo: { metric: 'prime', range: 'fixed', octave: 'reduced' },
    });
  });

  it('the old flat shape is read into all three views', () => {
    expect(
      sanitizeSettings({ relColor: { metric: 'tenney', range: 'fit', octave: 'reduced' } }).relColor
    ).toEqual({
      rings: { metric: 'tenney', range: 'fit' },
      near: { metric: 'tenney', range: 'fit' },
      monzo: { metric: 'tenney', range: 'fit', octave: 'reduced' },
    });
  });
});

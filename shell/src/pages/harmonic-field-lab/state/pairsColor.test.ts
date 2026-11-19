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

describe('relColor settings (M8o H-37, M9c H-40: Hue, Brightness, Radius per view)', () => {
  it('absent or damaged reads as the Families preset, Fixed, Exact', () => {
    const d = {
      rings: { hue: 'prime', bright: 'off', range: 'fixed', measure: 'step', followAlt: false },
      near: {
        hue: 'prime',
        bright: 'off',
        range: 'fixed',
        radius: 'tenney',
        measure: 'step',
        followAlt: false,
      },
      monzo: {
        hue: 'prime',
        bright: 'off',
        range: 'fixed',
        octave: 'exact',
        measure: 'step',
        followAlt: false,
      },
    };
    expect(defaultUi().relColor).toEqual(d);
    expect(sanitizeSettings(null).relColor).toEqual(d);
    expect(sanitizeSettings({ panel: 'keys' }).relColor).toEqual(d);
    expect(sanitizeSettings({ relColor: 'bad' }).relColor).toEqual(d);
    expect(sanitizeSettings({ relColor: { hue: 'nope', bright: 3, range: 1 } }).relColor).toEqual(
      d
    );
    expect(sanitizeSettings({ relColor: { metric: 'nope', range: 1 } }).relColor).toEqual(d);
  });

  it('keeps valid fields one by one, per view', () => {
    expect(
      sanitizeSettings({
        relColor: {
          near: { hue: 'errorSign', bright: 'errorSize', range: 'fit', radius: 'roughness' },
          monzo: { octave: 'reduced' },
        },
      }).relColor
    ).toEqual({
      rings: { hue: 'prime', bright: 'off', range: 'fixed', measure: 'step', followAlt: false },
      near: {
        hue: 'errorSign',
        bright: 'errorSize',
        range: 'fit',
        radius: 'roughness',
        measure: 'step',
        followAlt: false,
      },
      monzo: {
        hue: 'prime',
        bright: 'off',
        range: 'fixed',
        octave: 'reduced',
        measure: 'step',
        followAlt: false,
      },
    });
  });

  it('H-40: the old { metric } per-view shape migrates (measures -> brightness with hue off, error -> sign + size)', () => {
    expect(
      sanitizeSettings({
        relColor: {
          rings: { metric: 'interval', range: 'fit' },
          near: { metric: 'tenney', range: 'fit' },
          monzo: { metric: 'error', octave: 'reduced' },
        },
      }).relColor
    ).toEqual({
      rings: { hue: 'interval', bright: 'off', range: 'fit', measure: 'step', followAlt: false },
      near: {
        hue: 'off',
        bright: 'tenney',
        range: 'fit',
        radius: 'tenney',
        measure: 'step',
        followAlt: false,
      },
      monzo: {
        hue: 'errorSign',
        bright: 'errorSize',
        range: 'fixed',
        octave: 'reduced',
        measure: 'step',
        followAlt: false,
      },
    });
  });

  it('the older flat shape is read into all three views the same way', () => {
    expect(
      sanitizeSettings({ relColor: { metric: 'tenney', range: 'fit', octave: 'reduced' } }).relColor
    ).toEqual({
      rings: { hue: 'off', bright: 'tenney', range: 'fit', measure: 'step', followAlt: false },
      near: {
        hue: 'off',
        bright: 'tenney',
        range: 'fit',
        radius: 'tenney',
        measure: 'step',
        followAlt: false,
      },
      monzo: {
        hue: 'off',
        bright: 'tenney',
        range: 'fit',
        octave: 'reduced',
        measure: 'step',
        followAlt: false,
      },
    });
  });
});

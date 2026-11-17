import { describe, expect, it } from 'vitest';
import { defaultUi } from './labState';
import { sanitizeSettings } from './persist';

describe('ui.reverb in settings.v1 (A1, H-31)', () => {
  it('defaults to Dry with a mix of 0 (the sound is unchanged)', () => {
    expect(defaultUi().reverb).toEqual({ preset: 'dry', mix: 0 });
  });

  it('settings stored before A1 (no reverb field) load with the default and nothing else changes', () => {
    const old = sanitizeSettings({ tol: 33, wave: 'harmonic', volume: 0.7 });
    expect(old).toMatchObject({ tol: 33, wave: 'harmonic', volume: 0.7 });
    expect(old.reverb).toEqual({ preset: 'dry', mix: 0 });
    expect(sanitizeSettings(null).reverb).toEqual({ preset: 'dry', mix: 0 });
  });

  it('keeps a stored preset and mix, so a reload brings back the same reverb', () => {
    const back = sanitizeSettings(
      JSON.parse(JSON.stringify({ ...defaultUi(), reverb: { preset: 'custom', mix: 0.35 } }))
    );
    expect(back.reverb).toEqual({ preset: 'custom', mix: 0.35 });
    expect(back.wave).toBe('sine');
  });

  it('reads an unknown preset as Dry and a bad mix as 0, per field', () => {
    expect(sanitizeSettings({ reverb: { preset: 'cathedral', mix: 0.5 } }).reverb).toEqual({
      preset: 'dry',
      mix: 0.5,
    });
    expect(sanitizeSettings({ reverb: { preset: 'hall', mix: 'x' } }).reverb).toEqual({
      preset: 'hall',
      mix: 0,
    });
    for (const bad of [null, 5, 'hall', []]) {
      expect(sanitizeSettings({ reverb: bad }).reverb, String(bad)).toEqual({
        preset: 'dry',
        mix: 0,
      });
    }
  });
});

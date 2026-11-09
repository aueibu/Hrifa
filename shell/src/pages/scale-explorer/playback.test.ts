import { describe, expect, it } from 'vitest';
import { chordScript, scaleScript } from './playback';

const SOUNDFONT = 'sf2:Heaven.sf2%231|0:0:53';
const items = [{ modeIndex: 0, root: 0, z: [0, 4, 7] }];

describe('note levels', () => {
  it('keeps the gain levels for synth voices', () => {
    const { plan } = scaleScript(items, 'preview.triangle-soft');
    expect(new Set(plan.events.map((e) => e.velocity))).toEqual(new Set([0.4]));
  });

  it('plays SoundFont voices at a normal MIDI velocity instead of a soft one', () => {
    const { plan } = scaleScript(items, SOUNDFONT);
    expect(new Set(plan.events.map((e) => e.velocity))).toEqual(new Set([0.8]));
  });

  it('keeps the order between arpeggio notes and block chords for SoundFont voices', () => {
    const chord = { modeIndex: 0, chordKey: 'c', root: 0, midis: [48, 52, 55], pcs: [0, 4, 7] };
    const arp = chordScript([chord], 'arp', SOUNDFONT).plan.events[0].velocity;
    const block = chordScript([chord], 'block', SOUNDFONT).plan.events[0].velocity;
    expect(arp).toBeCloseTo(0.7);
    expect(block).toBeCloseTo(0.6);
    expect(arp).toBeGreaterThan(block);
  });
});

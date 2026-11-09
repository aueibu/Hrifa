import { createLayeredDurationPreviewPlan } from './audio/performancePlans';
import {
  defaultSoundSettings,
  formatOffset,
  layerSound,
  sanitizeSoundSettings,
  voiceSound,
  type SoundSet,
} from './sounds';
import { applyTransport, METER_BUS, defaultTransportSettings } from './transport';

const set: SoundSet = {
  baseMidicents: 6000,
  voices: [
    { type: 'tone', offsetCents: 0 },
    { type: 'woodblock', offsetCents: 700 },
    { type: 'drum', offsetCents: -350 },
  ],
};

describe('sound voices', () => {
  it('offsets each voice from the base pitch and cycles past the tertiary', () => {
    expect(voiceSound(set, 0)).toEqual({ type: 'tone', midicents: 6000 });
    expect(voiceSound(set, 1)).toEqual({ type: 'woodblock', midicents: 6700 });
    expect(voiceSound(set, 2)).toEqual({ type: 'drum', midicents: 5650 });
    expect(voiceSound(set, 3)).toEqual(voiceSound(set, 0));
  });

  it('plays percussion in its own register and lets an override replace the voice', () => {
    expect(layerSound(set, 1)).toEqual({ instrumentId: 'sound.woodblock', pitchMidicents: 9100 });
    expect(layerSound(set, 2)).toEqual({ instrumentId: 'sound.drum', pitchMidicents: 3250 });
    expect(layerSound(set, 1, { type: 'tone', midicents: 5500 })).toEqual({
      instrumentId: 'sound.tone',
      pitchMidicents: 5500,
    });
  });

  it('formats offsets in semitones and cents', () => {
    expect(formatOffset(0)).toBe('±0');
    expect(formatOffset(700)).toBe('+7 st');
    expect(formatOffset(-350)).toBe('−3 st 50¢');
  });

  it('repairs stored settings field by field, keeping the primary at the base pitch', () => {
    const repaired = sanitizeSoundSettings({
      rhythm: { baseMidicents: 5500, voices: [{ type: 'drum', offsetCents: 300 }, { type: 'kazoo' }] },
    });
    expect(repaired.rhythm.baseMidicents).toBe(5500);
    expect(repaired.rhythm.voices[0]).toEqual({ type: 'drum', offsetCents: 0 });
    expect(repaired.rhythm.voices[1]).toEqual(defaultSoundSettings.rhythm.voices[1]);
    expect(repaired.metronome).toEqual(defaultSoundSettings.metronome);
  });
});

describe('sound use in previews', () => {
  it('plays A/B layers together on their own sounds', () => {
    const plan = createLayeredDurationPreviewPlan({
      sourceId: 'hh',
      unitSeconds: 0.1,
      layers: [
        { id: 'input', durations: [3, 3, 2], sound: layerSound(set, 0) },
        { id: 'candidate', durations: [2, 3, 3], startOffset: 1, sound: layerSound(set, 1) },
      ],
    });
    expect(plan.events).toHaveLength(6);
    expect(new Set(plan.events.map((event) => event.id)).size).toBe(6);
    expect(
      plan.events
        .filter((event) => event.instrumentId === 'sound.woodblock')
        .map((event) => Math.round(event.atSeconds * 10))
    ).toEqual([1, 3, 6]);
    expect(plan.durationSeconds).toBeCloseTo(0.9);
  });

  it('clicks downbeats on the metronome primary voice and other beats on the secondary', () => {
    const plan = applyTransport(
      createLayeredDurationPreviewPlan({ sourceId: 's', unitSeconds: 0.125, layers: [] }),
      defaultTransportSettings,
      set
    );
    expect(plan.events).toHaveLength(0);
    const clicked = applyTransport(
      { ...createLayeredDurationPreviewPlan({ sourceId: 's', unitSeconds: 0.125, layers: [] }), durationSeconds: 2 },
      defaultTransportSettings,
      set
    );
    const clicks = clicked.events.filter((event) => event.busId === METER_BUS);
    expect(clicks.map((event) => event.instrumentId)).toEqual([
      'sound.tone',
      'sound.woodblock',
      'sound.woodblock',
      'sound.woodblock',
    ]);
  });
});

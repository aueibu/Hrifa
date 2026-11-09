import { instrumentRegistry } from './audio/instrumentRegistry';
import type { SecondsPerformancePlan } from './audio/types';
import { defaultMusicalTimeline, musicalDuration, musicalPositionToSeconds } from './musicalTime';
import { createRhythmPreviewPlan } from './rhythmRealization';
import {
  defaultSoundSettings,
  formatOffset,
  isSoundOverride,
  layerSound,
  sanitizeSoundSettings,
  soundTypeOptions,
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

  it('offers a pluck between click and tone, sounding at the written pitch', () => {
    const labels = soundTypeOptions.map((option) => option.label);
    expect(labels.indexOf('Pluck')).toBeGreaterThan(labels.indexOf('Click'));
    expect(labels.indexOf('Pluck')).toBeLessThan(labels.indexOf('Tone'));

    expect(layerSound(set, 0, { type: 'pluck', midicents: 6000 })).toEqual({
      instrumentId: 'sound.pluck',
      pitchMidicents: 6000,
    });
  });

  it('plays the pluck as a short percussive pitched voice, and keeps it when stored', () => {
    const synth = (id: 'sound.click' | 'sound.pluck') => {
      const definition = instrumentRegistry[id];
      if (definition.kind === 'sampled' || definition.kind === 'soundfont') {
        throw new Error(`${id} is a synthesized voice.`);
      }
      return definition;
    };
    const pluck = synth('sound.pluck');
    expect(pluck.kind).toBeUndefined(); // an ordinary synth voice, not a membrane hit
    // Percussive: no sustain, so a rhythm's attacks stay crisp, and a decay well under a second.
    expect(pluck.envelope.sustain).toBe(0);
    expect(pluck.envelope.decay).toBeGreaterThan(synth('sound.click').envelope.decay);
    expect(pluck.envelope.decay).toBeLessThan(0.5);

    expect(isSoundOverride({ type: 'pluck', midicents: 6000 })).toBe(true);
    const repaired = sanitizeSoundSettings({
      rhythm: { baseMidicents: 6000, voices: [{ type: 'pluck', offsetCents: 0 }] },
    });
    expect(repaired.rhythm.voices[0].type).toBe('pluck');
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
    // 16th-note pulses at 120 BPM: one pulse is 0.125 s.
    const plan = createRhythmPreviewPlan({
      sourceId: 'hh',
      pulseUnit: musicalDuration(1, 4),
      timeline: defaultMusicalTimeline,
      layers: [
        { layerId: 'input', steps: [3, 3, 2].map((duration) => ({ duration })), sound: layerSound(set, 0) },
        { layerId: 'candidate', steps: [2, 3, 3].map((duration) => ({ duration })), origin: 1, sound: layerSound(set, 1) },
      ],
    });
    expect(plan.events).toHaveLength(6);
    expect(new Set(plan.events.map((event) => event.id)).size).toBe(6);
    expect(
      plan.events
        .filter((event) => event.instrumentId === 'sound.woodblock')
        .map((event) => Math.round(musicalPositionToSeconds(event.at, defaultMusicalTimeline.tempoMap) / 0.125))
    ).toEqual([1, 3, 6]);
    expect(musicalPositionToSeconds({ quarterNotes: plan.duration.quarterNotes }, defaultMusicalTimeline.tempoMap)).toBeCloseTo(1.125);
  });

  it('clicks downbeats on the metronome primary voice and other beats on the secondary', () => {
    const empty: SecondsPerformancePlan = {
      id: 's:empty',
      sourceId: 's',
      timebase: { kind: 'seconds' },
      durationSeconds: 0,
      events: [],
      warnings: [],
    };
    const plan = applyTransport(empty, defaultTransportSettings, set);
    expect(plan.events).toHaveLength(0);
    const clicked = applyTransport({ ...empty, durationSeconds: 2 }, defaultTransportSettings, set);
    const clicks = clicked.events.filter((event) => event.busId === METER_BUS);
    expect(clicks.map((event) => event.instrumentId)).toEqual([
      'sound.tone',
      'sound.woodblock',
      'sound.woodblock',
      'sound.woodblock',
    ]);
  });
});

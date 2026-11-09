import type { InstrumentId, StaticInstrumentId } from './types';

/** A voice built from synthesis: an oscillator shaped by an envelope. */
export interface SynthInstrumentDefinition {
  id: InstrumentId;
  /** `membrane`: a pitched hit whose pitch falls quickly (Tone's MembraneSynth). */
  kind?: 'synth' | 'membrane';
  /** Membrane only: how fast and how far (in octaves) the pitch falls after the attack. */
  pitchDecay?: number;
  octaves?: number;
  oscillator: 'sine' | 'triangle' | 'sawtooth' | 'square';
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

/**
 * A voice played from recorded samples (the `smplr` library). `soundfont` is a General MIDI patch name;
 * samples download the first time the voice is used and stay loaded for the page's lifetime.
 */
export interface SampledInstrumentDefinition {
  id: InstrumentId;
  kind: 'sampled';
  label: string;
  /** The General MIDI patch name. */
  soundfont: string;
}

/**
 * A preset of a SoundFont file the user opened (see soundfontLibrary.ts). It is played by a full SoundFont
 * synthesizer that renders a plan's notes ahead of time (soundfontSynth.ts), not note by note.
 */
export interface SoundfontInstrumentDefinition {
  id: InstrumentId;
  kind: 'soundfont';
  label: string;
}

export type InstrumentDefinition =
  | SynthInstrumentDefinition
  | SampledInstrumentDefinition
  | SoundfontInstrumentDefinition;

export const instrumentRegistry: Record<StaticInstrumentId, InstrumentDefinition> = {
  'preview.sine': {
    id: 'preview.sine',
    oscillator: 'sine',
    envelope: { attack: 0.006, decay: 0.01, sustain: 0.9, release: 0.01 },
  },
  'preview.triangle': {
    id: 'preview.triangle',
    oscillator: 'triangle',
    envelope: { attack: 0.008, decay: 0.01, sustain: 0.9, release: 0.01 },
  },
  // A triangle whose attack and release are long enough that consecutive notes join without a click.
  'preview.triangle-soft': {
    id: 'preview.triangle-soft',
    oscillator: 'triangle',
    envelope: { attack: 0.02, decay: 0.05, sustain: 0.7, release: 0.09 },
  },
  // Sustained timbres for held tones (the Scale Explorer drone).
  'preview.sawtooth': {
    id: 'preview.sawtooth',
    oscillator: 'sawtooth',
    envelope: { attack: 0.08, decay: 0.01, sustain: 0.9, release: 0.25 },
  },
  'preview.square': {
    id: 'preview.square',
    oscillator: 'square',
    envelope: { attack: 0.08, decay: 0.01, sustain: 0.9, release: 0.25 },
  },
  'preview.click': {
    id: 'preview.click',
    oscillator: 'square',
    envelope: { attack: 0, decay: 0.018, sustain: 0, release: 0.006 },
  },
  'preview.click-accent': {
    id: 'preview.click-accent',
    oscillator: 'square',
    envelope: { attack: 0, decay: 0.04, sustain: 0, release: 0.008 },
  },
  // The selectable preview sounds (sounds.ts). Percussive ones have no sustain, so a rhythm's
  // attacks stay crisp whatever the note length.
  'sound.click': {
    id: 'sound.click',
    oscillator: 'square',
    envelope: { attack: 0, decay: 0.012, sustain: 0, release: 0.005 },
  },
  'sound.woodblock': {
    id: 'sound.woodblock',
    kind: 'membrane',
    pitchDecay: 0.006,
    octaves: 1.5,
    oscillator: 'sine',
    envelope: { attack: 0, decay: 0.07, sustain: 0, release: 0.02 },
  },
  'sound.drum': {
    id: 'sound.drum',
    kind: 'membrane',
    pitchDecay: 0.04,
    octaves: 5,
    oscillator: 'sine',
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.08 },
  },
  'sound.tone': {
    id: 'sound.tone',
    oscillator: 'sine',
    envelope: { attack: 0.006, decay: 0.01, sustain: 0.9, release: 0.01 },
  },
  'gm.piano': {
    id: 'gm.piano',
    kind: 'sampled',
    label: 'Piano',
    soundfont: 'acoustic_grand_piano',
  },
  'gm.guitar': {
    id: 'gm.guitar',
    kind: 'sampled',
    label: 'Nylon guitar',
    soundfont: 'acoustic_guitar_nylon',
  },
  'gm.harp': { id: 'gm.harp', kind: 'sampled', label: 'Harp', soundfont: 'orchestral_harp' },
  'gm.marimba': { id: 'gm.marimba', kind: 'sampled', label: 'Marimba', soundfont: 'marimba' },
  'gm.vibraphone': {
    id: 'gm.vibraphone',
    kind: 'sampled',
    label: 'Vibraphone',
    soundfont: 'vibraphone',
  },
  'gm.organ': { id: 'gm.organ', kind: 'sampled', label: 'Church organ', soundfont: 'church_organ' },
  'gm.flute': { id: 'gm.flute', kind: 'sampled', label: 'Flute', soundfont: 'flute' },
  'gm.clarinet': { id: 'gm.clarinet', kind: 'sampled', label: 'Clarinet', soundfont: 'clarinet' },
  'gm.violin': { id: 'gm.violin', kind: 'sampled', label: 'Violin', soundfont: 'violin' },
  'gm.cello': { id: 'gm.cello', kind: 'sampled', label: 'Cello', soundfont: 'cello' },
};

/** The sampled voices, in menu order. */
export const sampledInstruments = Object.values(instrumentRegistry).filter(
  (definition): definition is SampledInstrumentDefinition => definition.kind === 'sampled'
);

/** The definition for any instrument id, including voices from opened SoundFont files. */
export function instrumentDefinition(id: InstrumentId): InstrumentDefinition {
  if (id.startsWith('sf2:')) {
    return { id, kind: 'soundfont', label: 'SoundFont' };
  }
  return instrumentRegistry[id as StaticInstrumentId];
}

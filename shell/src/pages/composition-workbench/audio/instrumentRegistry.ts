import type { InstrumentId } from './types';

export interface InstrumentDefinition {
  id: InstrumentId;
  /** `membrane`: a pitched hit whose pitch falls quickly (Tone's MembraneSynth). */
  kind?: 'synth' | 'membrane';
  /** Membrane only: how fast and how far (in octaves) the pitch falls after the attack. */
  pitchDecay?: number;
  octaves?: number;
  oscillator: 'sine' | 'triangle' | 'square';
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

export const instrumentRegistry: Record<InstrumentId, InstrumentDefinition> = {
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
};

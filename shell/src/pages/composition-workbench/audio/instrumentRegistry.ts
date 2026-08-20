import type { InstrumentId } from './types';

export interface InstrumentDefinition {
  id: InstrumentId;
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
};

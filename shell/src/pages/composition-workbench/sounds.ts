import type { InstrumentId } from './audio/types';
import { midiNoteName } from './interference';

/**
 * Preview sounds. Two global voice sets — one for rhythm previews, one for the metronome — each
 * with a primary, secondary, and tertiary voice. Modules play their layers on these voices in
 * order (Interference: generator 1 → primary, 2 → secondary, …; Rhythm Householder: input →
 * primary, candidate → secondary), and any module may override a layer with its own sound and
 * pitch. Stored with the other global settings (compositionSettings.tsx).
 */
export type SoundType = 'click' | 'woodblock' | 'drum' | 'tone';

export const soundTypeOptions: { value: SoundType; label: string }[] = [
  { value: 'click', label: 'Click' },
  { value: 'woodblock', label: 'Woodblock' },
  { value: 'drum', label: 'Drum' },
  { value: 'tone', label: 'Tone' },
];

const soundInstrument: Record<SoundType, InstrumentId> = {
  click: 'sound.click',
  woodblock: 'sound.woodblock',
  drum: 'sound.drum',
  tone: 'sound.tone',
};

/**
 * Percussive sounds play in their own register relative to the written pitch, so one pitch suits
 * every sound type: a click three octaves up, a woodblock two up, a drum two down.
 */
export const soundRegisterSemitones: Record<SoundType, number> = {
  click: 36,
  woodblock: 24,
  drum: -24,
  tone: 0,
};

export interface VoiceSetting {
  type: SoundType;
  /** Offset from the set's base pitch, in cents (the primary voice's is always 0). */
  offsetCents: number;
}

export interface SoundSet {
  /** The primary voice's written pitch, in MIDI cents (6000 = C4). */
  baseMidicents: number;
  voices: [VoiceSetting, VoiceSetting, VoiceSetting];
}

export interface SoundSettings {
  rhythm: SoundSet;
  metronome: SoundSet;
}

export const defaultSoundSettings: SoundSettings = {
  rhythm: {
    baseMidicents: 6000,
    voices: [
      { type: 'woodblock', offsetCents: 0 },
      { type: 'woodblock', offsetCents: 700 },
      { type: 'woodblock', offsetCents: -500 },
    ],
  },
  metronome: {
    baseMidicents: 6000,
    voices: [
      { type: 'click', offsetCents: 0 },
      { type: 'click', offsetCents: -500 },
      { type: 'click', offsetCents: 700 },
    ],
  },
};

export const voiceNames = ['Primary', 'Secondary', 'Tertiary'] as const;

/** A module's own choice for one layer, replacing the global voice. */
export interface SoundOverride {
  type: SoundType;
  /** Written pitch in MIDI cents. */
  midicents: number;
}

/** What actually gets scheduled: an instrument and the pitch it sounds at. */
export interface ResolvedSound {
  instrumentId: InstrumentId;
  pitchMidicents: number;
}

export function resolveSound(type: SoundType, writtenMidicents: number): ResolvedSound {
  return {
    instrumentId: soundInstrument[type],
    pitchMidicents: writtenMidicents + soundRegisterSemitones[type] * 100,
  };
}

/** Voice `index` of a set (cycling past the tertiary), as written type + pitch. */
export function voiceSound(set: SoundSet, index: number): SoundOverride {
  const voice = set.voices[((index % 3) + 3) % 3];
  return { type: voice.type, midicents: set.baseMidicents + voice.offsetCents };
}

/** The sound for one layer: the module's override when it has one, else the set's voice. */
export function layerSound(set: SoundSet, index: number, override?: SoundOverride | null) {
  const written = override ?? voiceSound(set, index);
  return resolveSound(written.type, written.midicents);
}

export function formatMidicents(midicents: number) {
  const note = Math.round(midicents / 100);
  const cents = Math.round(midicents - note * 100);
  return cents ? `${midiNoteName(note)} ${cents > 0 ? '+' : ''}${cents}¢` : midiNoteName(note);
}

export function formatOffset(cents: number) {
  if (!cents) {
    return '±0';
  }
  const semitones = Math.trunc(cents / 100);
  const rest = Math.round(cents - semitones * 100);
  const sign = cents > 0 ? '+' : '−';
  const parts = [semitones ? `${Math.abs(semitones)} st` : '', rest ? `${Math.abs(rest)}¢` : '']
    .filter(Boolean)
    .join(' ');
  return `${sign}${parts}`;
}

export function soundLabel(sound: SoundOverride) {
  const type = soundTypeOptions.find((option) => option.value === sound.type)?.label ?? sound.type;
  return `${type} · ${formatMidicents(sound.midicents)}`;
}

const isSoundType = (value: unknown): value is SoundType =>
  soundTypeOptions.some((option) => option.value === value);

const finiteIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function isSoundOverride(value: unknown): value is SoundOverride {
  const candidate = value as SoundOverride | null;
  return Boolean(
    candidate && isSoundType(candidate.type) && finiteIn(candidate.midicents, 0, 12700)
  );
}

function sanitizeSoundSet(raw: unknown, fallback: SoundSet): SoundSet {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const voices = Array.isArray(candidate.voices) ? candidate.voices : [];
  return {
    baseMidicents: finiteIn(candidate.baseMidicents, 0, 12700)
      ? candidate.baseMidicents
      : fallback.baseMidicents,
    voices: fallback.voices.map((fallbackVoice, index) => {
      const voice = (voices[index] ?? {}) as Record<string, unknown>;
      return {
        type: isSoundType(voice.type) ? voice.type : fallbackVoice.type,
        offsetCents:
          index === 0
            ? 0
            : finiteIn(voice.offsetCents, -4800, 4800)
              ? voice.offsetCents
              : fallbackVoice.offsetCents,
      };
    }) as SoundSet['voices'],
  };
}

export function sanitizeSoundSettings(raw: unknown): SoundSettings {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    rhythm: sanitizeSoundSet(candidate.rhythm, defaultSoundSettings.rhythm),
    metronome: sanitizeSoundSet(candidate.metronome, defaultSoundSettings.metronome),
  };
}

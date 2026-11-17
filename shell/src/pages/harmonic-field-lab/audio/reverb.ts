/**
 * The lab's reverb, as pure data (A1, H-31): the settings stored in `settings.v1`, the generated built-in impulses, the
 * equal-power mix, and the checks on a picked impulse file. No Web Audio, no React, no storage: the engine
 * (`engine.ts`) builds the nodes, `impulseStorage.ts` keeps the loaded file, `impulseStore.ts` shares it with the UI.
 */

export type ReverbPreset = 'dry' | 'room' | 'hall' | 'custom';
export const REVERB_PRESETS: readonly ReverbPreset[] = ['dry', 'room', 'hall', 'custom'];

/** Per-viewer reverb setting (`ui.reverb`). The impulse file itself is never stored here. */
export interface ReverbSettings {
  preset: ReverbPreset;
  /** 0 to 1: how much of the sound is the reverb (equal power, see `mixGains`). Ignored while the preset is Dry. */
  mix: number;
}

export const defaultReverb = (): ReverbSettings => ({ preset: 'dry', mix: 0 });

/** The mix a preset change starts at when the mix was 0 (so choosing Room is audible); the human tunes it by ear. */
export const DEFAULT_WET_MIX = 0.3;

/** Whatever is in storage as valid reverb settings: an unknown preset reads as Dry, a bad mix as 0. */
export function sanitizeReverb(raw: unknown): ReverbSettings {
  const d = defaultReverb();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return d;
  }
  const o = raw as Record<string, unknown>;
  return {
    preset: REVERB_PRESETS.includes(o.preset as ReverbPreset)
      ? (o.preset as ReverbPreset)
      : d.preset,
    mix:
      typeof o.mix === 'number' && Number.isFinite(o.mix) ? Math.min(1, Math.max(0, o.mix)) : d.mix,
  };
}

/**
 * Dry and wet gains for a mix 0 to 1, equal power: `dry^2 + wet^2 = 1`, so the loudness stays about the same as the mix
 * moves. Mix 0 is the dry sound alone (dry 1, wet 0), mix 1 the reverb alone.
 */
export function mixGains(mix: number): { dry: number; wet: number } {
  const m = Number.isFinite(mix) ? Math.min(1, Math.max(0, mix)) : 0;
  return { dry: Math.cos((m * Math.PI) / 2), wet: Math.sin((m * Math.PI) / 2) };
}

/* -------------------------------------------------------------------------------- built-in impulses */

export type BuiltInPreset = 'room' | 'hall';

/** Length of each built-in impulse in seconds (the 60 dB decay time), and how dark it is (one-pole smoothing, 1 = white). */
export const BUILT_IN: Record<BuiltInPreset, { seconds: number; bright: number; seed: number }> = {
  room: { seconds: 0.9, bright: 0.55, seed: 0x9e3779b1 },
  hall: { seconds: 2.8, bright: 0.38, seed: 0x85ebca6b },
};

/** A small seeded generator (mulberry32): the same seed always gives the same noise. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Onset ramp (s) so an impulse does not start with a click. */
const IMPULSE_ONSET = 0.002;

/**
 * A stereo impulse made of decaying noise: white noise (a different sequence per channel, fixed seed) smoothed a little, times an
 * exponential that falls 60 dB over the preset's length. Deterministic, so a test and the human hear the same room every time.
 */
export function makeImpulse(preset: BuiltInPreset, sampleRate: number): Float32Array[] {
  const { seconds, bright, seed } = BUILT_IN[preset];
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const onset = Math.max(1, Math.round(IMPULSE_ONSET * sampleRate));
  const out: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(seed + c * 0x1234567);
    const ch = new Float32Array(n);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += (rand() * 2 - 1 - y) * bright;
      const decay = Math.exp((-6.907755 * i) / n);
      ch[i] = y * decay * Math.min(1, (i + 1) / onset);
    }
    out.push(ch);
  }
  return out;
}

/* -------------------------------------------------------------------------------- the user's own impulse */

/** A decoded impulse the user loaded: what is kept in IndexedDB and handed to the engine. One or two channels of equal length. */
export interface ImpulseData {
  name: string;
  sampleRate: number;
  channels: Float32Array[];
}

export const IMPULSE_MAX_SECONDS = 12;
export const IMPULSE_MAX_BYTES = 8 * 1024 * 1024;
export const IMPULSE_NAME_MAX = 80;

export const REASON_TOO_LONG = 'Longer than 12 s';
export const REASON_TOO_BIG = 'Larger than 8 MB';
export const REASON_NOT_AUDIO = 'Not an audio file';

export const impulseSeconds = (d: Pick<ImpulseData, 'sampleRate' | 'channels'>): number =>
  d.sampleRate > 0 && d.channels[0] ? d.channels[0].length / d.sampleRate : 0;

/** `2.4 s` (one decimal; a very short impulse shows two so it is not `0.0 s`). */
export const formatSeconds = (s: number): string => `${s < 0.1 ? s.toFixed(2) : s.toFixed(1)} s`;

/** `Custom: hall.wav (2.4 s)`: what the preset reads while the loaded impulse is in use. */
export const customLabel = (d: ImpulseData): string =>
  `Custom: ${d.name} (${formatSeconds(impulseSeconds(d))})`;

/** The decoded audio the engine hands back (`VoiceEngine.decodeImpulse`), or null when the browser could not decode the bytes. */
export type ImpulseDecoder = (
  bytes: ArrayBuffer
) => Promise<{ sampleRate: number; channels: Float32Array[] } | null>;

/** The slice of a `File` the checks need (so a test passes a plain object). */
export interface ImpulseFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type ImpulseResult = { ok: true; impulse: ImpulseData } | { ok: false; reason: string };

/**
 * Check and decode a picked file: over 8 MB is refused before it is even read, a file the browser cannot decode is not audio, an
 * impulse over 12 s is refused. The first two channels are kept (a mono file stays mono and is used on both sides by the
 * convolver; more than two channels are cut to two). The previous reverb is untouched on any refusal: the caller only
 * replaces it on `ok`.
 */
export async function loadImpulseFile(
  file: ImpulseFile,
  decode: ImpulseDecoder
): Promise<ImpulseResult> {
  if (file.size > IMPULSE_MAX_BYTES) {
    return { ok: false, reason: REASON_TOO_BIG };
  }
  let decoded: Awaited<ReturnType<ImpulseDecoder>> = null;
  try {
    decoded = await decode(await file.arrayBuffer());
  } catch {
    decoded = null;
  }
  if (!decoded || decoded.channels.length === 0 || !(decoded.sampleRate > 0)) {
    return { ok: false, reason: REASON_NOT_AUDIO };
  }
  const first = decoded.channels[0];
  if (first.length === 0) {
    return { ok: false, reason: REASON_NOT_AUDIO };
  }
  if (first.length / decoded.sampleRate > IMPULSE_MAX_SECONDS) {
    return { ok: false, reason: REASON_TOO_LONG };
  }
  const channels = decoded.channels.slice(0, 2).map((c) => Float32Array.from(c));
  const name = (file.name || 'impulse').slice(0, IMPULSE_NAME_MAX);
  return { ok: true, impulse: { name, sampleRate: decoded.sampleRate, channels } };
}

/** Linear-interpolation resample of one channel (an impulse stored at another rate than this context's). */
export function resampleLinear(data: Float32Array, from: number, to: number): Float32Array {
  if (from === to || data.length === 0 || !(from > 0) || !(to > 0)) {
    return data;
  }
  const n = Math.max(1, Math.round((data.length * to) / from));
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const i0 = Math.min(data.length - 1, Math.floor(x));
    const i1 = Math.min(data.length - 1, i0 + 1);
    const f = x - i0;
    out[i] = data[i0] * (1 - f) + data[i1] * f;
  }
  return out;
}

/** Whatever IndexedDB returned as a valid stored impulse, or null (wrong shape, empty, too long, not finite). */
export function parseStoredImpulse(raw: unknown): ImpulseData | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.sampleRate !== 'number' || !(o.sampleRate > 0)) {
    return null;
  }
  if (!Array.isArray(o.channels) || o.channels.length < 1 || o.channels.length > 2) {
    return null;
  }
  const channels = o.channels as unknown[];
  if (!channels.every((c) => c instanceof Float32Array)) {
    return null;
  }
  const list = channels as Float32Array[];
  const len = list[0].length;
  if (len === 0 || list.some((c) => c.length !== len)) {
    return null;
  }
  if (len / o.sampleRate > IMPULSE_MAX_SECONDS) {
    return null;
  }
  return { name: o.name.slice(0, IMPULSE_NAME_MAX), sampleRate: o.sampleRate, channels: list };
}

/** The one-line note when the stored impulse cannot be read. */
export const NOTE_IMPULSE_LOST = 'The saved impulse could not be read, so the reverb is Hall.';
/** The one-line note when the impulse works but cannot be kept across a reload. */
export const NOTE_IMPULSE_NOT_KEPT = 'Used for this visit only: browser storage is unavailable.';

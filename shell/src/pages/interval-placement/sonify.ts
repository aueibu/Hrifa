/**
 * Minimal Web Audio sonification for a placed voicing. Pitches are edo-step
 * offsets from `baseMidi` (see `getBaseMidi`/`KeyboardView`), so converting
 * to frequency has to rescale by `12 / edoSteps` before applying the
 * standard MIDI-to-Hz formula — a step only equals a semitone when
 * `edoSteps === 12`.
 */

export type Timbre = 'sine' | 'triangle' | 'piano' | 'guitar';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function pitchToFrequency(pitch: number, baseMidi: number, edoSteps: number): number {
  const semitones = baseMidi + (pitch * 12) / edoSteps;
  return 440 * 2 ** ((semitones - 69) / 12);
}

interface ScheduledNote {
  frequency: number;
  startTime: number;
  duration: number;
  gain: number;
}

// Relative amplitude of harmonics 1..6 for the additive "piano" timbre —
// a bright fundamental with a fast-decaying upper partial stack is what
// reads as piano-ish rather than organ-ish (flat) or flute-ish (pure).
const PIANO_HARMONICS = [1, 0.55, 0.3, 0.18, 0.1, 0.06];

function scheduleOscillatorNote(
  ctx: AudioContext,
  dest: AudioNode,
  note: ScheduledNote,
  type: OscillatorType
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = note.frequency;
  const attack = Math.min(0.02, note.duration * 0.3);
  const release = Math.min(0.1, note.duration * 0.4);
  const releaseStart = Math.max(note.startTime + attack, note.startTime + note.duration - release);
  env.gain.setValueAtTime(0, note.startTime);
  env.gain.linearRampToValueAtTime(note.gain, note.startTime + attack);
  env.gain.setValueAtTime(note.gain, releaseStart);
  env.gain.linearRampToValueAtTime(0, note.startTime + note.duration);
  osc.connect(env);
  env.connect(dest);
  osc.start(note.startTime);
  osc.stop(note.startTime + note.duration + 0.02);
}

function schedulePianoNote(ctx: AudioContext, dest: AudioNode, note: ScheduledNote) {
  // Percussive envelope: near-instant attack, quick decay to a low
  // sustain, gentle tail — a plucked-hammer shape rather than the
  // sustained pad shape used for sine/triangle.
  const env = ctx.createGain();
  env.connect(dest);
  const attack = 0.005;
  const decayTo = note.gain * 0.35;
  const decayEnd = note.startTime + Math.min(0.18, note.duration * 0.4);
  env.gain.setValueAtTime(0, note.startTime);
  env.gain.linearRampToValueAtTime(note.gain, note.startTime + attack);
  env.gain.linearRampToValueAtTime(decayTo, decayEnd);
  env.gain.linearRampToValueAtTime(0.0001, note.startTime + note.duration);

  PIANO_HARMONICS.forEach((amp, idx) => {
    const harmonicNumber = idx + 1;
    const osc = ctx.createOscillator();
    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = amp;
    osc.type = 'sine';
    osc.frequency.value = note.frequency * harmonicNumber;
    osc.connect(harmonicGain);
    harmonicGain.connect(env);
    osc.start(note.startTime);
    osc.stop(note.startTime + note.duration + 0.02);
  });
}

function karplusStrongBuffer(ctx: AudioContext, frequency: number, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(sampleRate / frequency));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) {
    ring[i] = Math.random() * 2 - 1;
  }
  let idx = 0;
  const damping = 0.996;
  for (let i = 0; i < length; i++) {
    const next = ring[idx];
    data[i] = next;
    const nextIdx = (idx + 1) % period;
    ring[idx] = damping * 0.5 * (ring[idx] + ring[nextIdx]);
    idx = nextIdx;
  }
  return buffer;
}

function scheduleGuitarNote(ctx: AudioContext, dest: AudioNode, note: ScheduledNote) {
  // Karplus-Strong plucked-string synthesis: a noise burst circulating
  // through a damped delay loop whose length sets the pitch. The buffer
  // already decays on its own, so the envelope here only needs a fast
  // attack and a final fade to avoid a click at the cut point.
  const buffer = karplusStrongBuffer(ctx, note.frequency, note.duration + 0.05);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const env = ctx.createGain();
  const attack = 0.004;
  env.gain.setValueAtTime(0, note.startTime);
  env.gain.linearRampToValueAtTime(note.gain * 1.6, note.startTime + attack);
  env.gain.setTargetAtTime(0, note.startTime + note.duration * 0.6, note.duration * 0.35);
  source.connect(env);
  env.connect(dest);
  source.start(note.startTime);
  source.stop(note.startTime + note.duration + 0.05);
}

function scheduleNote(ctx: AudioContext, dest: AudioNode, note: ScheduledNote, timbre: Timbre) {
  if (timbre === 'piano') {
    schedulePianoNote(ctx, dest, note);
    return;
  }
  if (timbre === 'guitar') {
    scheduleGuitarNote(ctx, dest, note);
    return;
  }
  scheduleOscillatorNote(ctx, dest, note, timbre);
}

function freshMasterGain(ctx: AudioContext): GainNode {
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  return master;
}

/** All pitches together, sustained as a chord. */
export function playChord(
  pitches: number[],
  baseMidi: number,
  edoSteps: number,
  timbre: Timbre = 'sine',
  duration = 1.8
) {
  if (pitches.length === 0) {
    return;
  }
  const ctx = getAudioContext();
  const master = freshMasterGain(ctx);
  const startTime = ctx.currentTime + 0.03;
  const gain = 0.35 / Math.sqrt(pitches.length);
  pitches.forEach((p) => {
    scheduleNote(
      ctx,
      master,
      { frequency: pitchToFrequency(p, baseMidi, edoSteps), startTime, duration, gain },
      timbre
    );
  });
}

/** Every pitch in the voicing, low to high, one at a time. */
export function playArpeggio(
  pitches: number[],
  baseMidi: number,
  edoSteps: number,
  timbre: Timbre = 'sine',
  noteDuration = 0.35,
  gap = 0.28
) {
  if (pitches.length === 0) {
    return;
  }
  const ctx = getAudioContext();
  const master = freshMasterGain(ctx);
  const sorted = [...pitches].sort((a, b) => a - b);
  let t = ctx.currentTime + 0.03;
  sorted.forEach((p) => {
    scheduleNote(
      ctx,
      master,
      { frequency: pitchToFrequency(p, baseMidi, edoSteps), startTime: t, duration: noteDuration, gain: 0.3 },
      timbre
    );
    t += gap;
  });
}

/**
 * The *input* intervals as placed — one low/high endpoint pair per entry
 * in `perm` (see `PlacementRecord.endpoints`), each played as a
 * low-then-high two-note arpeggio with a pause before the next, in input
 * order. This is not every pairwise combination of pitches in the
 * voicing; it's specifically where each requested interval ended up in
 * pitch space.
 */
export function playIntervalPairs(
  endpoints: Array<[number, number]>,
  baseMidi: number,
  edoSteps: number,
  timbre: Timbre = 'sine',
  noteDuration = 0.3,
  noteGap = 0.24,
  pairGap = 0.4
) {
  if (endpoints.length === 0) {
    return;
  }
  const ctx = getAudioContext();
  const master = freshMasterGain(ctx);
  let t = ctx.currentTime + 0.03;
  endpoints.forEach(([low, high]) => {
    scheduleNote(
      ctx,
      master,
      { frequency: pitchToFrequency(low, baseMidi, edoSteps), startTime: t, duration: noteDuration, gain: 0.3 },
      timbre
    );
    t += noteGap;
    scheduleNote(
      ctx,
      master,
      { frequency: pitchToFrequency(high, baseMidi, edoSteps), startTime: t, duration: noteDuration, gain: 0.3 },
      timbre
    );
    t += noteGap + pairGap;
  });
}

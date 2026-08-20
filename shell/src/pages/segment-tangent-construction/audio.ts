import { useRef } from 'react';

export type EnvelopeType = 'sustain' | 'pluck';

/** Single-tone scheduler shared by every play mode, so BPM/envelope changes apply consistently everywhere. */
function scheduleTone(
  ctx: AudioContext,
  freq: number,
  t: number,
  dur: number,
  envType: EnvelopeType,
  peakGain: number
) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  if (envType === 'pluck') {
    const attack = Math.min(0.006, dur * 0.08);
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peakGain, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else {
    const attack = Math.min(0.02, dur * 0.15);
    const release = Math.min(0.06, dur * 0.25);
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(peakGain, t + attack);
    gainNode.gain.setValueAtTime(peakGain, t + dur - release);
    gainNode.gain.linearRampToValueAtTime(0, t + dur);
  }
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Owns the lazily-created AudioContext for one Periodicity tab session. */
export function usePeriodicityAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = (): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  };

  /** ratio 0.00 -> rootHz; each step up is that many octaves higher (2^ratio). */
  const playRatioSequence = (
    ratios: number[],
    rootHz: number,
    noteDur: number,
    gap: number,
    envType: EnvelopeType,
    peakGain = 0.25
  ) => {
    const ctx = getCtx();
    let t = ctx.currentTime;
    ratios.forEach((r) => {
      const freq = rootHz * 2 ** r;
      scheduleTone(ctx, freq, t, noteDur, envType, peakGain);
      t += noteDur + gap;
    });
  };

  /** Slides a window of `size` consecutive ratios, playing each window as a simultaneous chord. */
  const playChordWindows = (
    ratios: number[],
    windowSize: number,
    rootHz: number,
    noteDur: number,
    gap: number,
    envType: EnvelopeType,
    peakGain = 0.18
  ) => {
    const ctx = getCtx();
    let t = ctx.currentTime;
    const L = ratios.length;
    for (let s = 0; s < L; s++) {
      for (let k = 0; k < windowSize; k++) {
        const freq = rootHz * 2 ** ratios[(s + k) % L];
        scheduleTone(ctx, freq, t, noteDur, envType, peakGain);
      }
      t += noteDur + gap;
    }
  };

  return { playChordWindows, playRatioSequence };
}

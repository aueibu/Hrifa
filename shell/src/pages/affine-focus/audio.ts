import type { GamutPitch, TrajectoryStep } from '../../lib/affine-focus';

export type WaveType = 'harmonic' | 'sine';
export type ArpeggioMode = 'simultaneous' | 'ascending' | 'descending';

export interface AudioSettings {
  baseHz: number;
  wave: WaveType;
  arpeggio: ArpeggioMode;
  durationMs: number;
  volume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  baseHz: 261.6256,
  wave: 'harmonic',
  arpeggio: 'simultaneous',
  durationMs: 650,
  volume: 0.7,
};

const HARMONIC_PARTIALS = 7;
const HARMONIC_ROLLOFF = 0.82;

export function pitchToHz(pitch: GamutPitch, baseHz: number, useUnfolded = false): number {
  const c = useUnfolded ? pitch.unfoldedCents : pitch.foldedCents;
  return baseHz * 2 ** (c / 1200);
}

class AffineAudioEngine {
  private ctx: AudioContext | null = null;
  private activeNodes: { stop: () => void }[] = [];
  private timers: number[] = [];
  private onSoundingChange: ((labels: Set<string>) => void) | null = null;
  private onPlayingStepChange: ((stepIndex: number | null) => void) | null = null;

  setSoundingListener(fn: ((labels: Set<string>) => void) | null) {
    this.onSoundingChange = fn;
  }

  setPlayingStepListener(fn: ((stepIndex: number | null) => void) | null) {
    this.onPlayingStepChange = fn;
  }

  private emitSounding(labels: string[]) {
    this.onSoundingChange?.(new Set(labels));
  }

  private emitPlayingStep(stepIndex: number | null) {
    this.onPlayingStepChange?.(stepIndex);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  stopAll() {
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers = [];
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.activeNodes = [];
    this.emitSounding([]);
    this.emitPlayingStep(null);
  }

  private scheduleTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    durSec: number,
    settings: AudioSettings,
    voiceCount: number
  ) {
    if (!Number.isFinite(freq) || freq < 15 || freq > 16000) {
      return;
    }
    const masterGain = ctx.createGain();
    const perVoiceAmp = (0.18 * settings.volume) / Math.max(1, Math.sqrt(voiceCount));
    masterGain.gain.setValueAtTime(0.0001, startTime);
    masterGain.gain.linearRampToValueAtTime(perVoiceAmp, startTime + 0.018);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + durSec);
    masterGain.connect(ctx.destination);

    const partialCount = settings.wave === 'harmonic' ? HARMONIC_PARTIALS : 1;
    for (let k = 1; k <= partialCount; k += 1) {
      const pFreq = freq * k;
      if (pFreq > 15000) {
        break;
      }
      const osc = ctx.createOscillator();
      const pGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pFreq, startTime);
      const amp = HARMONIC_ROLLOFF ** (k - 1) / k;
      pGain.gain.setValueAtTime(amp, startTime);
      osc.connect(pGain);
      pGain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + durSec + 0.02);
      this.activeNodes.push({
        stop: () => {
          osc.stop();
          osc.disconnect();
        },
      });
    }
  }

  playPitches(pitches: readonly GamutPitch[], settings: AudioSettings, useUnfolded = false) {
    this.stopAll();
    if (pitches.length === 0) {
      return;
    }
    const ctx = this.ensureContext();
    const ordered = [...pitches];
    if (settings.arpeggio === 'ascending') {
      ordered.sort((a, b) =>
        useUnfolded ? a.unfoldedCents - b.unfoldedCents : a.foldedCents - b.foldedCents
      );
    } else if (settings.arpeggio === 'descending') {
      ordered.sort((a, b) =>
        useUnfolded ? b.unfoldedCents - a.unfoldedCents : b.foldedCents - a.foldedCents
      );
    }

    const durSec = Math.max(0.15, settings.durationMs / 1000);
    const stepDelay =
      settings.arpeggio === 'simultaneous'
        ? 0
        : Math.min(0.22, durSec / Math.max(2, ordered.length));

    this.emitSounding(ordered.map((p) => p.label));

    if (ctx) {
      const now = ctx.currentTime + 0.01;
      ordered.forEach((p, idx) => {
        const hz = pitchToHz(p, settings.baseHz, useUnfolded);
        this.scheduleTone(ctx, hz, now + idx * stepDelay, durSec, settings, ordered.length);
      });
    }

    const totalMs = (durSec + ordered.length * stepDelay) * 1000 + 80;
    const endTimer = window.setTimeout(() => {
      this.emitSounding([]);
    }, totalMs);
    this.timers.push(endTimer);
  }

  playAlternation(
    sourcePitches: readonly GamutPitch[],
    targetPitches: readonly GamutPitch[],
    settings: AudioSettings,
    useUnfolded = false
  ) {
    this.stopAll();
    const pairs = [sourcePitches, targetPitches, sourcePitches, targetPitches];
    const stepMs = Math.max(280, settings.durationMs);
    const ctx = this.ensureContext();
    const durSec = (stepMs * 0.88) / 1000;

    pairs.forEach((chord, stepIdx) => {
      const tId = window.setTimeout(() => {
        this.emitSounding(chord.map((p) => p.label));
      }, stepIdx * stepMs);
      this.timers.push(tId);

      if (ctx) {
        const start = ctx.currentTime + 0.01 + (stepIdx * stepMs) / 1000;
        for (const p of chord) {
          const hz = pitchToHz(p, settings.baseHz, useUnfolded);
          this.scheduleTone(ctx, hz, start, durSec, settings, chord.length);
        }
      }
    });

    const clearId = window.setTimeout(
      () => {
        this.emitSounding([]);
      },
      pairs.length * stepMs + 80
    );
    this.timers.push(clearId);
  }

  playCentsList(centsList: readonly number[], labels: readonly string[], settings: AudioSettings) {
    this.stopAll();
    if (centsList.length === 0) {
      return;
    }
    const ctx = this.ensureContext();
    const ordered = [...centsList];
    if (settings.arpeggio === 'ascending') {
      ordered.sort((a, b) => a - b);
    } else if (settings.arpeggio === 'descending') {
      ordered.sort((a, b) => b - a);
    }

    const durSec = Math.max(0.15, settings.durationMs / 1000);
    const stepDelay =
      settings.arpeggio === 'simultaneous'
        ? 0
        : Math.min(0.22, durSec / Math.max(2, ordered.length));

    this.emitSounding([...labels]);

    if (ctx) {
      const now = ctx.currentTime + 0.01;
      ordered.forEach((c, idx) => {
        const hz = settings.baseHz * 2 ** (c / 1200);
        this.scheduleTone(ctx, hz, now + idx * stepDelay, durSec, settings, ordered.length);
      });
    }

    const totalMs = (durSec + ordered.length * stepDelay) * 1000 + 80;
    const endTimer = window.setTimeout(() => {
      this.emitSounding([]);
    }, totalMs);
    this.timers.push(endTimer);
  }

  playTrajectory(
    steps: readonly TrajectoryStep[],
    settings: AudioSettings,
    useUnfolded = false,
    tracedStepCents?: readonly (readonly number[])[]
  ) {
    this.stopAll();
    if (steps.length === 0) {
      return;
    }
    const stepMs = Math.max(300, settings.durationMs);
    const durSec = (stepMs * 0.88) / 1000;
    const ctx = this.ensureContext();

    steps.forEach((st, idx) => {
      const tId = window.setTimeout(() => {
        this.emitSounding(st.pitches.map((p) => p.label));
        this.emitPlayingStep(idx);
      }, idx * stepMs);
      this.timers.push(tId);

      if (ctx) {
        const start = ctx.currentTime + 0.01 + (idx * stepMs) / 1000;
        const centsValues =
          tracedStepCents?.[idx] ??
          st.pitches.map((p) => (useUnfolded ? p.unfoldedCents : p.foldedCents));
        for (const c of centsValues) {
          const hz = settings.baseHz * 2 ** (c / 1200);
          this.scheduleTone(ctx, hz, start, durSec, settings, centsValues.length);
        }
      }
    });

    const clearId = window.setTimeout(
      () => {
        this.emitSounding([]);
        this.emitPlayingStep(null);
      },
      steps.length * stepMs + 80
    );
    this.timers.push(clearId);
  }
}

export const affineAudio = new AffineAudioEngine();

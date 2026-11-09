import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioEngine } from '../composition-workbench/audio/AudioEngineProvider';
import type { PlaybackSession } from '../composition-workbench/audio/types';
import {
  activeCues,
  DRONE_BUS,
  DRONE_SOURCE,
  dronePlan,
  droneGain,
  NOTE_BUS,
  SCALE_SOURCE,
  type DroneWave,
  type PlaybackScript,
} from './playback';

/** What is sounding right now, for the ring, keys, mode rows and chord chips to light up. */
export interface NowPlaying {
  pcs: ReadonlySet<number>;
  modeIndex: number;
  chordKey?: string;
  /** Pitch class of the playing mode's root (what a following drone tracks). */
  root: number;
  /** Which ring dot lights (comparison previews only). */
  dot: number | null;
}

/**
 * Plays one script at a time through the shared AudioEngine and follows its clock to report which notes
 * sound. `playingKey` identifies what is playing so the matching button can show Stop.
 */
export function useScalePlayback() {
  const engine = useAudioEngine();
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const token = useRef(0);
  const frame = useRef(0);
  const lastCue = useRef('');

  const stop = useCallback(() => {
    token.current += 1;
    cancelAnimationFrame(frame.current);
    engine.stopSource(SCALE_SOURCE);
    lastCue.current = '';
    setPlayingKey(null);
    setNow(null);
  }, [engine]);

  const start = useCallback(
    async (key: string, script: PlaybackScript, dot: number | null = null) => {
      stop();
      const mine = token.current;
      setPlayingKey(key);
      try {
        await engine.play({
          plan: script.plan,
          busGains: { [NOTE_BUS]: 0.8 },
          onComplete: () => {
            if (token.current === mine) {
              cancelAnimationFrame(frame.current);
              lastCue.current = '';
              setPlayingKey(null);
              setNow(null);
            }
          },
        });
      } catch {
        if (token.current === mine) {
          setPlayingKey(null);
        }
        return;
      }
      if (token.current !== mine) {
        return;
      }
      const startedAt = engine.clock(SCALE_SOURCE)?.startedAtMs ?? performance.now() + 60;
      const tick = () => {
        if (token.current !== mine) {
          return;
        }
        const active = activeCues(script, (performance.now() - startedAt) / 1000);
        const last = active.at(-1);
        const id = last
          ? `${last.modeIndex}|${last.chordKey ?? ''}|${active.flatMap((c) => c.pcs).join(',')}`
          : '';
        if (id !== lastCue.current) {
          lastCue.current = id;
          setNow(
            last
              ? {
                  pcs: new Set(active.flatMap((c) => c.pcs)),
                  modeIndex: last.modeIndex,
                  chordKey: last.chordKey,
                  root: last.root,
                  dot,
                }
              : null
          );
        }
        frame.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [engine, stop]
  );

  useEffect(
    () => () => {
      token.current += 1;
      cancelAnimationFrame(frame.current);
      engine.stopSource(SCALE_SOURCE);
    },
    [engine]
  );

  return { playingKey, now, start, stop };
}

interface DroneOptions {
  on: boolean;
  /** Pitch class the drone sounds (already resolved from follow/fixed). */
  pitchClass: number;
  wave: DroneWave;
  volume: number;
}

/** A sustained tone under everything else. Re-pitching restarts it; volume changes ramp live. */
export function useDrone({ on, pitchClass, wave, volume }: DroneOptions) {
  const engine = useAudioEngine();
  const session = useRef<PlaybackSession | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    if (!on) {
      engine.stopSource(DRONE_SOURCE);
      session.current = null;
      return undefined;
    }
    let cancelled = false;
    engine
      .play({
        plan: dronePlan(pitchClass, wave),
        busGains: { [DRONE_BUS]: droneGain(wave, volumeRef.current) },
      })
      .then((s) => {
        if (cancelled) {
          s.stop();
        } else {
          session.current = s;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [engine, on, pitchClass, wave]);

  useEffect(() => {
    session.current?.setBusGain(DRONE_BUS, droneGain(wave, volume));
  }, [volume, wave]);

  useEffect(() => () => engine.stopSource(DRONE_SOURCE), [engine]);
}

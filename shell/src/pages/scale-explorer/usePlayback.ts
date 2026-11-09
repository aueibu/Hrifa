import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioEngine } from '../composition-workbench/audio/AudioEngineProvider';
import type { PlaybackSession } from '../composition-workbench/audio/types';
import {
  activeCues,
  DRONE_BUS,
  DRONE_SOURCES,
  dronePlan,
  droneGain,
  NOTE_BUS,
  SCALE_SOURCE,
  type DroneWave,
  type PlaybackScript,
} from './playback';

/** What is sounding right now, for the ring, keys, mode rows and chord chips to light up. */
/** Which mode row and chord chip the current performance is in. Unlike `NowPlaying` it holds through the gaps
 * between notes, so row and chip highlights stay steady while a mode plays. */
export interface PlayingContext {
  modeIndex: number;
  chordKey?: string;
}

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
  const [context, setContext] = useState<PlayingContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setContext(null);
    setLoading(false);
  }, [engine]);

  const start = useCallback(
    async (key: string, script: PlaybackScript, dot: number | null = null) => {
      stop();
      const mine = token.current;
      setPlayingKey(key);
      setError(null);
      setLoading(true);
      let session: PlaybackSession;
      try {
        session = await engine.play({
          plan: script.plan,
          busGains: { [NOTE_BUS]: 0.8 },
          onComplete: () => {
            if (token.current === mine) {
              cancelAnimationFrame(frame.current);
              lastCue.current = '';
              setPlayingKey(null);
              setNow(null);
              setContext(null);
            }
          },
        });
      } catch (e) {
        if (token.current === mine) {
          setPlayingKey(null);
          setLoading(false);
          setError(e instanceof Error ? e.message : 'Could not start playback.');
        }
        return;
      }
      if (token.current !== mine) {
        // stopped while samples were still loading: do not let the late session sound
        session.stop();
        return;
      }
      setLoading(false);
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
        if (last) {
          setContext((prev) =>
            prev?.modeIndex === last.modeIndex && prev.chordKey === last.chordKey
              ? prev
              : { modeIndex: last.modeIndex, chordKey: last.chordKey }
          );
        }
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

  return { playingKey, now, context, loading, error, start, stop };
}

interface DroneOptions {
  on: boolean;
  /** Pitch class the drone sounds (already resolved from follow/fixed). */
  pitchClass: number;
  wave: DroneWave;
  volume: number;
}

/** Time a drone takes to fade out when it is replaced or switched off. */
const DRONE_FADE_MS = 140;

function fadeOut(session: PlaybackSession) {
  session.setBusGain(DRONE_BUS, 0);
  setTimeout(() => session.stop(), DRONE_FADE_MS);
}

/**
 * A sustained tone under everything else. Re-pitching starts the new tone on the other drone source and fades
 * the old one out, so there is no click at the change; volume changes ramp live.
 */
export function useDrone({ on, pitchClass, wave, volume }: DroneOptions) {
  const engine = useAudioEngine();
  const session = useRef<PlaybackSession | null>(null);
  const turn = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    if (!on) {
      if (session.current) {
        fadeOut(session.current);
        session.current = null;
      }
      return undefined;
    }
    let cancelled = false;
    const source = DRONE_SOURCES[turn.current++ % DRONE_SOURCES.length];
    engine
      .play({
        plan: dronePlan(pitchClass, wave, source),
        busGains: { [DRONE_BUS]: droneGain(wave, volumeRef.current) },
      })
      .then((s) => {
        if (cancelled) {
          s.stop();
          return;
        }
        const previous = session.current;
        session.current = s;
        if (previous) {
          fadeOut(previous);
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

  useEffect(
    () => () => {
      DRONE_SOURCES.forEach((id) => engine.stopSource(id));
    },
    [engine]
  );
}

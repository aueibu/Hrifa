import { useEffect, useMemo, useRef, useState } from 'react';
import { RagaAudioEngine } from './audio';
import type { Settings } from './settings';
import { SEMI } from './theory';
import type { RagaVariant } from './types';

export interface PlayingNote {
  part: 'aroha' | 'avaroha';
  index: number; // index within that part's token list
}

/** Owns one RagaAudioEngine for the page's lifetime; exposes melody play/stop (driven by the currently selected
 * raga + settings) and an independent tanpura on/off, plus which note is currently sounding for the ring/ladder
 * to highlight. */
export function useRagaAudio(raga: RagaVariant | null, settings: Settings) {
  const engineRef = useRef<RagaAudioEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playingNote, setPlayingNote] = useState<PlayingNote | null>(null);

  const engine = useMemo(() => {
    if (!engineRef.current) {
      engineRef.current = new RagaAudioEngine();
    }
    return engineRef.current;
  }, []);

  useEffect(() => () => engine.dispose(), [engine]);

  const arohaLen = raga ? raga.arohaChain.length : 0;

  const play = () => {
    if (!raga) {
      return;
    }
    const transpose = SEMI[settings.rootSargam] ?? 0;
    const semitones = [...raga.arohaChain, ...raga.avarohaChain].map((s) => s - transpose);
    engine.setMelodyVolume(settings.melodyVolume);
    setPlaying(true);
    engine.playMelody(
      {
        semitones,
        tonicHz: settings.tonicHz,
        instrument: settings.melodyInstrument,
        noteDurationMs: settings.noteDurationMs,
        gapMs: settings.gapMs,
        loop: settings.loop,
      },
      {
        onNoteIndex: (i) => {
          if (i == null) {
            setPlayingNote(null);
            return;
          }
          setPlayingNote(
            i < arohaLen ? { part: 'aroha', index: i } : { part: 'avaroha', index: i - arohaLen }
          );
        },
        onStop: () => setPlaying(false),
      }
    );
  };

  const stop = () => {
    engine.stopMelody();
    setPlaying(false);
    setPlayingNote(null);
  };

  const tanpuraKey = settings.tanpuraSequence.map((n) => `${n.degree}${n.octave}`).join(',');

  const setTanpura = (on: boolean) => {
    if (on) {
      const transpose = SEMI[settings.rootSargam] ?? 0;
      const semitones = settings.tanpuraSequence.map(
        (n) => (SEMI[n.degree] ?? 0) + 12 * n.octave - transpose
      );
      engine.startTanpura(
        semitones,
        settings.tonicHz,
        settings.tanpuraVolume,
        settings.tanpuraIntervalMs
      );
    } else {
      engine.stopTanpura();
    }
  };

  // live-update volumes without restarting playback
  useEffect(() => {
    engine.setMelodyVolume(settings.melodyVolume);
  }, [engine, settings.melodyVolume]);
  // live-update tempo/gap while a loop is already running (not just the next time Play is pressed) --
  // RagaAudioEngine.playMelody reads these off the engine every note, not once at Play time
  useEffect(() => {
    engine.setMelodyTiming(settings.noteDurationMs, settings.gapMs);
  }, [engine, settings.noteDurationMs, settings.gapMs]);
  useEffect(() => {
    engine.setTanpuraVolume(settings.tanpuraVolume);
  }, [engine, settings.tanpuraVolume]);

  // tanpura reacts live to its own settings while it's on (sequence, tempo, tonic, or root sargam changing
  // restarts the drone with the new parameters)
  useEffect(() => {
    if (settings.tanpuraOn) {
      setTanpura(true);
    } else {
      engine.stopTanpura();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.tanpuraOn,
    tanpuraKey,
    settings.tanpuraIntervalMs,
    settings.tonicHz,
    settings.rootSargam,
  ]);

  // changing raga stops any in-flight melody playback (the notes no longer apply)
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raga?.vid]);

  return { playing, playingNote, play, stop };
}

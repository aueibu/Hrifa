import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { useAuditionSettings } from '../auditionPreferences';
import { useCompositionSettings } from '../compositionSettings';
import type { StoredDataBlock } from '../dataBlocks/registry';
import { transportRhythmContext } from '../rhythmRealization';
import { layerSound } from '../sounds';
import { transportTimeline } from '../transport';
import { createSceneEvaluator } from './evaluateScene';

/**
 * The scene's evaluation and ONE play controller (workbench O2b), shared by the Outliner's and the
 * Arranger's Play buttons and the Arranger's playhead. Whether the scene is playing is read from the
 * audio engine (a session whose source id is the SCENE'S block id, because the evaluator stamps the plan
 * with `sourceId: sceneId`), so whichever button started it, every panel sees the same state, and a
 * Stop from either ends the one session.
 */

/** The scene's compiled plan. One evaluator per settings change, never per render. */
export function useSceneEvaluation(blocks: readonly StoredDataBlock[], sceneId: string | null) {
  const { settings } = useCompositionSettings();
  const [auditionSettings] = useAuditionSettings();
  const evaluator = useMemo(
    () =>
      createSceneEvaluator({
        settings: { ...auditionSettings, loop: false },
        context: {
          pulseUnit: transportRhythmContext(settings.transport).pulseUnit,
          rhythmSound: layerSound(settings.sounds.rhythm, 0),
        },
        timeline: transportTimeline(settings.transport),
      }),
    [auditionSettings, settings.transport, settings.sounds.rhythm]
  );
  return useMemo(
    () => (sceneId ? evaluator.evaluate(blocks, sceneId) : null),
    [evaluator, blocks, sceneId]
  );
}

type Evaluation = ReturnType<typeof useSceneEvaluation>;

const SCENE_VOLUME = 30;

/**
 * Scenes whose start is pending (the engine's async start: Tone start, sample loading), by scene id,
 * with the request that is pending. ONE store shared by every panel using the controller, so both Play
 * buttons show Stop during the wait and a second click cancels the start instead of doubling it.
 */
const startingRequests = new Map<string, number>();
const startingListeners = new Set<() => void>();
let requestCounter = 0;
const notifyStarting = () => startingListeners.forEach((listener) => listener());
const subscribeStarting = (listener: () => void) => {
  startingListeners.add(listener);
  return () => {
    startingListeners.delete(listener);
  };
};

export function useScenePlayback(sceneId: string | null, evaluation: Evaluation) {
  const engine = useAudioEngine();
  // Only a note that is not derivable (a refusal, the end of the run) is stored; "Playing the scene."
  // is derived from `playing`, so it can never disagree with the engine.
  const [note, setNote] = useState('');
  const subscribe = useCallback((listener: () => void) => engine.subscribe(listener), [engine]);
  const sessionLive = useSyncExternalStore(
    subscribe,
    () => sceneId !== null && engine.clock?.(sceneId) !== undefined
  );
  const starting = useSyncExternalStore(
    subscribeStarting,
    () => sceneId !== null && startingRequests.has(sceneId)
  );
  const playing = sessionLive || starting;

  // Switching the active scene ends the old scene's play (closing a panel does not: no cleanup here).
  const previousScene = useRef(sceneId);
  useEffect(() => {
    const previous = previousScene.current;
    previousScene.current = sceneId;
    if (previous !== null && previous !== sceneId) {
      if (startingRequests.delete(previous)) {
        notifyStarting();
      }
      engine.stopSource(previous);
    }
  }, [engine, sceneId]);

  const hasSound =
    evaluation !== null &&
    evaluation.plan.events.length > 0 &&
    evaluation.plan.duration.quarterNotes.numerator > 0;
  const refusal =
    sceneId === null
      ? 'Create or choose a scene first.'
      : hasSound
        ? null
        : 'Add an object with data to hear anything.';

  async function toggle() {
    if (sceneId === null) {
      return;
    }
    if (playing) {
      // Stop, also while the start is pending: cancel it so it never sounds.
      if (startingRequests.delete(sceneId)) {
        notifyStarting();
      }
      engine.stopSource(sceneId);
      setNote('');
      return;
    }
    if (!evaluation || !hasSound) {
      return;
    }
    requestCounter += 1;
    const request = requestCounter;
    startingRequests.set(sceneId, request);
    notifyStarting();
    setNote('');
    const settle = () => {
      if (startingRequests.get(sceneId) === request) {
        startingRequests.delete(sceneId);
        notifyStarting();
      }
    };
    try {
      const session = await engine.play({
        plan: evaluation.plan,
        busGains: { preview: volumePercentToGain(SCENE_VOLUME) },
        followTransport: true,
        loop: false,
        onComplete: () => setNote('Preview complete.'),
      });
      if (startingRequests.get(sceneId) !== request) {
        // Cancelled or replaced while starting: it must not keep sounding.
        session.stop();
        return;
      }
      settle();
    } catch (error) {
      settle();
      setNote(error instanceof Error ? error.message : 'The scene could not start.');
    }
  }

  return { playing, starting, refusal, status: playing ? 'Playing the scene.' : note, toggle };
}

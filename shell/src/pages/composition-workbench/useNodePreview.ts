import { useEffect, useRef, useState } from 'react';
import { volumePercentToGain } from './audio';
import { useAudioEngine } from './audio/AudioEngineProvider';
import type { PerformancePlan, PlaybackSession } from './audio/types';
import { useTransportPreview } from './previewRegistry';

/** Why a preview ended: it ran to the end, or something stopped it (this node or the header). */
export type PreviewEnd = 'complete' | 'stopped';

export interface NodePreviewOptions {
  /** The node instance: the plan's sourceId, the playhead clock, and the header-Play key. */
  instanceId: string;
  /** The node's volume (percent) for the `preview` bus; changes apply while playing. */
  volume: number;
  /** Add the transport's metronome and count-in. On for anything timed on the transport pulse. */
  followTransport?: boolean;
  /** Extra buses this node owns (e.g. Interference's grouping click); changes apply live. */
  busGains?: Record<string, number>;
  /** What the header Play button and the space bar start. */
  transportPlay(): void;
  /** Tidies node-owned playback state (a custom playhead, highlighted layers). */
  onEnd?(reason: PreviewEnd): void;
}

/**
 * One node's audio preview: start/stop, live volume, the status line, header-transport
 * registration, and noticing a global Stop (which skips `onComplete`). See ARCHITECTURE.md,
 * "Adding a node with playback".
 */
export function useNodePreview({
  instanceId,
  volume,
  followTransport = false,
  busGains,
  transportPlay,
  onEnd,
}: NodePreviewOptions) {
  const engine = useAudioEngine();
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const session = useRef<PlaybackSession | null>(null);
  const requestVersion = useRef(0);
  const latestOnEnd = useRef(onEnd);
  latestOnEnd.current = onEnd;

  function end(reason: PreviewEnd, message: string) {
    session.current = null;
    setPlaying(false);
    setStatus(message);
    latestOnEnd.current?.(reason);
  }

  /** Stops this node's preview. An empty message clears the status line. */
  function stop(message = 'Preview stopped.') {
    requestVersion.current += 1;
    session.current?.stop();
    end('stopped', message);
  }

  /**
   * Plays a plan, replacing anything this node was playing. Resolves true once sound has
   * started, false if it failed or a newer request superseded it. `loop` repeats a musical plan
   * until stopped (see PlaybackRequest.loop); a looping preview never reports 'complete'.
   */
  async function play(plan: PerformancePlan, message: string, options: { loop?: boolean } = {}) {
    stop('');
    const version = requestVersion.current;
    setStatus(message);
    try {
      // The plan can finish before `play` resolves; the callback then only notes it.
      let finishedEarly = false;
      const latest: { current?: PlaybackSession } = {};
      const started = await engine.play({
        plan,
        busGains: { preview: volumePercentToGain(volume), ...busGains },
        followTransport,
        loop: options.loop,
        onComplete: () => {
          if (latest.current === undefined) {
            finishedEarly = true;
          } else if (session.current === latest.current) {
            end('complete', 'Preview complete.');
          }
        },
      });
      latest.current = started;
      if (version !== requestVersion.current) {
        started.stop();
        return false;
      }
      if (finishedEarly || !started.active) {
        end('complete', 'Preview complete.');
        return false;
      }
      session.current = started;
      setPlaying(true);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Audio preview could not start.');
      return false;
    }
  }

  useTransportPreview(instanceId, transportPlay);

  // A global Stop (header button or space bar) ends sessions without onComplete.
  useEffect(
    () =>
      engine.subscribe(() => {
        if (session.current && !session.current.active) {
          end('stopped', 'Preview stopped.');
        }
      }),
    // `end` only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine]
  );

  useEffect(() => {
    session.current?.setBusGain('preview', volumePercentToGain(volume));
  }, [volume]);

  const busGainKey = JSON.stringify(busGains ?? {});
  useEffect(() => {
    Object.entries(busGains ?? {}).forEach(([busId, gain]) =>
      session.current?.setBusGain(busId, gain)
    );
    // Keyed by content so a fresh object literal each render doesn't re-apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busGainKey]);

  useEffect(
    () => () => {
      requestVersion.current += 1;
      session.current?.stop();
      session.current = null;
    },
    []
  );

  return { play, stop, status, setStatus, playing };
}

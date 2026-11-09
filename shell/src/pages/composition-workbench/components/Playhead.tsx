import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import classes from './Playhead.module.css';

/**
 * A moving line over a duration strip while its module's preview sounds. Place it inside a
 * positioned container (the strips' `durationTimeline` already is). Only this component
 * re-renders per frame, not the module around it.
 */
export function Playhead({
  sourceId,
  unitSeconds,
  length,
  cyclic = true,
  visible = true,
}: {
  /** The module instance whose preview drives it. */
  sourceId: string;
  /** Seconds per strip unit (the transport pulse). */
  unitSeconds: number;
  /** Strip length in units. */
  length: number;
  /** In a loop, material that runs past the end wraps to the start (a late-starting rhythm). */
  cyclic?: boolean;
  /** For modules with several strips: whether this strip is the one sounding. */
  visible?: boolean;
}) {
  const engine = useAudioEngine();
  const clock = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.clock(sourceId)?.startedAtMs
  );
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (clock === undefined || !visible) {
      return undefined;
    }
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [clock, visible]);

  if (clock === undefined || !visible || !(unitSeconds > 0) || !(length > 0)) {
    return null;
  }
  const units = (now - clock) / 1000 / unitSeconds;
  if (units < 0 || (!cyclic && units > length)) {
    return null;
  }
  const position = cyclic ? units % length : units;
  return (
    <span
      className={classes.playhead}
      aria-hidden
      style={{ left: `${(position / length) * 100}%` }}
    />
  );
}

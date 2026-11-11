import type { CycleProgress } from '../mixerRoll';

interface CycleProgressBarProps {
  progress: CycleProgress;
  color: string;
  /** What each segment is called: "cycle" for a free channel, "restart" for one that restarts. */
  unit: string;
  ariaLabel: string;
}

// Past this many segments the tick marks would be a smear, so only the fill is drawn.
const MAX_TICKED_CYCLES = 96;

/**
 * How far a channel is through the whole pass, from one sync point to the next, with a tick at
 * every cycle boundary. Every channel fills at the same rate over the same pass; what differs
 * between channels is where their ticks fall.
 */
export function CycleProgressBar({ progress, color, unit, ariaLabel }: CycleProgressBarProps) {
  const ticked = progress.cycles > 1 && progress.cycles <= MAX_TICKED_CYCLES;
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress.fill * 100)}
      aria-valuetext={`${unit} ${progress.current} of ${progress.cycles}`}
      style={{
        background: 'var(--panel-inset)',
        border: '1px solid var(--border)',
        borderRadius: 2,
        height: 8,
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          background: color,
          height: '100%',
          opacity: 0.85,
          width: `${progress.fill * 100}%`,
        }}
      />
      {ticked && (
        <div
          aria-hidden="true"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--text) 1px, transparent 1px)',
            backgroundSize: `calc(100% / ${progress.cycles}) 100%`,
            inset: 0,
            opacity: 0.45,
            pointerEvents: 'none',
            position: 'absolute',
          }}
        />
      )}
    </div>
  );
}

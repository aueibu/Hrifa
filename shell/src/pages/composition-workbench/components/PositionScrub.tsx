import { Fragment, useEffect, useRef, useState } from 'react';
import {
  formatLength,
  formatPosition,
  parseLength,
  parsePosition,
  stepTime,
  type TimePart,
} from '../meterTime';
import { compareRational, rational, rationalToNumber, type Rational } from '../musicalTime';
import classes from '../../../ui/kit.module.css';

const PARTS: readonly TimePart[] = ['bar', 'beat', 'tick', 'percent'];

/** Pixels of drag per step, the same as `ScrubNumber` (right or up increases). */
const PIXELS_PER_STEP = 6;

/** The text of a time; a value the format cannot show (negative) falls back to quarter notes. */
function timeText(value: Rational, meter: string, kind: 'position' | 'length'): string {
  try {
    return kind === 'position' ? formatPosition(value, meter) : formatLength(value, meter);
  } catch {
    return `${rationalToNumber(value)} quarter notes`;
  }
}

/** The value as an exact fraction of a whole note, for the hover text: 1/3 quarter is `1/12n`. */
const wholeNoteRatio = (value: Rational) => {
  const whole = rational(value.numerator, value.denominator * 4);
  return `${whole.numerator}/${whole.denominator}n`;
};

/**
 * A time (a Start or a Duration) as a scrub box in `BARs.BEATs.TICKs.%`. Same look and gestures as
 * `ScrubNumber` (shared `kit.module.css` classes): the part under the pointer at pointer-down sets the
 * step for that drag; every step is computed from the value the drag began at (no drift) and committed
 * on its own. A click without movement (or Enter) opens text entry, which accepts the same text as
 * `parsePosition` / `parseLength`, ratios included; text equal to what is shown commits nothing, so a
 * field only writes back when it is edited. Double-click resets to `defaultValue`. Arrow keys step the
 * part last used (the bar until a part has been pressed).
 */
export function PositionScrub({
  value,
  meter,
  kind,
  onCommit,
  onError,
  defaultValue,
  disabled = false,
  info,
  className,
  'aria-label': ariaLabel,
}: {
  value: Rational;
  meter: string;
  kind: 'position' | 'length';
  /** Returns the refusal text, or null when the value landed. */
  onCommit: (value: Rational) => string | null;
  /** Typed text that is not a time (its refusal), for the panel's message line. */
  onError?: (message: string) => void;
  defaultValue?: Rational;
  disabled?: boolean;
  /** Hover help; the exact value is appended. A lock reason replaces it (pass it as `info`). */
  info?: string;
  className?: string;
  'aria-label': string;
}) {
  const text = timeText(value, meter, kind);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState(text);
  const [lastPart, setLastPart] = useState<TimePart>('bar');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    start: Rational;
    part: TimePart;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const stepBy = (from: Rational, part: TimePart, count: number): Rational => {
    let next = from;
    for (let index = 0; index < Math.abs(count); index += 1) {
      next = stepTime(next, meter, kind, part, count > 0 ? 1 : -1);
    }
    return next;
  };

  const commitDraft = () => {
    setEditing(false);
    const typed = draft.trim();
    if (typed === text) {
      return; // looking at a value never rewrites it (a triplet stays exact)
    }
    const parsed = kind === 'position' ? parsePosition(typed, meter) : parseLength(typed, meter);
    if (!parsed.ok) {
      onError?.(parsed.error);
      return;
    }
    if (compareRational(parsed.value, value) !== 0) {
      onCommit(parsed.value);
    }
  };

  if (editing && !disabled) {
    return (
      <div className={className} data-info={info}>
        <input
          ref={inputRef}
          type="text"
          aria-label={ariaLabel}
          className={classes.scrubInput}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  const open = () => {
    setDraft(text);
    setEditing(true);
  };
  const pieces = text.split('.');
  return (
    <div
      className={className}
      data-info={disabled ? info : `${info ?? ''}${info ? ' ' : ''}= ${wholeNoteRatio(value)}`}
    >
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuenow={rationalToNumber(value)}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        data-kit="scrub-number"
        data-dragging={dragging ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        className={classes.scrub}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) {
            return;
          }
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const hit = (event.target as HTMLElement).closest?.('[data-part]');
          const part = (hit?.getAttribute('data-part') as TimePart | null) ?? lastPart;
          setLastPart(part);
          dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            start: value,
            part,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (disabled || !drag) {
            return;
          }
          const dx = event.clientX - drag.startX;
          const dy = drag.startY - event.clientY;
          if (!drag.moved && Math.hypot(dx, dy) < 3) {
            return;
          }
          drag.moved = true;
          setDragging(true);
          const count = Math.round(((dx + dy) / PIXELS_PER_STEP) * (event.shiftKey ? 0.1 : 1));
          const next = stepBy(drag.start, drag.part, count);
          if (compareRational(next, value) !== 0) {
            onCommit(next);
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (!disabled && drag && !drag.moved && event.detail < 2) {
            open();
          }
        }}
        onDoubleClick={() => {
          if (!disabled && defaultValue !== undefined) {
            setEditing(false);
            if (compareRational(defaultValue, value) !== 0) {
              onCommit(defaultValue);
            }
          }
        }}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          } else if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) {
            event.preventDefault();
            const up = event.key === 'ArrowUp' || event.key === 'ArrowRight';
            const next = stepTime(value, meter, kind, lastPart, up ? 1 : -1);
            if (compareRational(next, value) !== 0) {
              onCommit(next);
            }
          }
        }}
      >
        <span className={classes.scrubValue}>
          {pieces.length === PARTS.length
            ? pieces.map((piece, index) => (
                <Fragment key={PARTS[index]}>
                  {index > 0 && '.'}
                  <span data-part={PARTS[index]}>{piece}</span>
                </Fragment>
              ))
            : text}
        </span>
      </div>
    </div>
  );
}

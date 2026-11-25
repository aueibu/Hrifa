/**
 * The inspector kit: thin wrappers over Mantine with the sizes fixed (tokens.ts) and theme roles for colour. Pieces:
 * `KitScope` (density), `Panel` and `Strip` (header strip, title left, tools right), `Section` (inset group with a
 * heading), `Row` (name left, value right), `Num`, `Toggle`, the four fields, `Actions`, `Tip`.
 * Where things go (ARCHITECTURE.md "How to add a panel"): view tools in the strip, the panel's commands in `Actions` at
 * the end of the body, long explanations in a `Tip`, never in a label.
 */
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import {
  ActionIcon,
  Button,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
  type ActionIconProps,
  type ButtonProps,
} from '@mantine/core';
import { Data } from '../components/Data/Data';
import { useTipDelay } from './settings';
import { DEFAULT_DENSITY, TIP_WIDTH, tokenStyle, type Density } from './tokens';
import classes from './kit.module.css';

const DensityContext = createContext<Density>(DEFAULT_DENSITY);
export const useDensity = () => useContext(DensityContext);

/** Writes the density's token set (one density, `compact`) as custom properties for everything inside. */
export function KitScope({
  density = DEFAULT_DENSITY,
  children,
  className,
  fill,
}: {
  density?: Density;
  children: ReactNode;
  className?: string;
  /** The scope takes the height its parent gives (a column of panels in a fixed region). */
  fill?: boolean;
}) {
  return (
    <DensityContext.Provider value={density}>
      <div
        className={className ? `${classes.scope} ${className}` : classes.scope}
        data-kit-density={density}
        data-fill={fill ? 'true' : undefined}
        style={tokenStyle(density)}
      >
        {children}
      </div>
    </DensityContext.Provider>
  );
}

/* ---------------------------------------------------------------------------- strip and panel */

/** A thin header strip: title (an `h2`) left, tools right. Tools are `StripTool`s. */
export function Strip({ title, tools, id }: { title: ReactNode; tools?: ReactNode; id?: string }) {
  return (
    <div className={classes.strip} data-kit="strip">
      <h2 className={classes.stripTitle} id={id}>
        {title}
      </h2>
      {tools && <div className={classes.stripTools}>{tools}</div>}
    </div>
  );
}

/**
 * A header-strip tool: a subtle gray `sm` ActionIcon. The label is required (it is the accessible name). Extra props
 * and the ref go to the button, so a tool can be a Mantine `Menu.Target`.
 */
export const StripTool = forwardRef<
  HTMLButtonElement,
  { label: string } & Omit<ActionIconProps, 'size' | 'variant' | 'color'> &
    Omit<ComponentPropsWithoutRef<'button'>, 'color'>
>(function StripTool({ label, children, ...rest }, ref) {
  return (
    <ActionIcon
      {...rest}
      ref={ref}
      size="sm"
      variant="subtle"
      color="gray"
      aria-label={label}
      title={label}
    >
      {children}
    </ActionIcon>
  );
});

/** A panel: strip over a scrolling body of sections, rows and a final `Actions`. */
export function Panel({
  title,
  tools,
  children,
}: {
  title: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={classes.panel} aria-labelledby={id} data-kit="panel">
      <Strip title={title} tools={tools} id={id} />
      <div className={classes.body}>{children}</div>
    </section>
  );
}

/** An inset group with a heading (and optional small controls at the heading's right). */
export function Section({
  heading,
  aside,
  children,
}: {
  heading: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={classes.section} role="group" aria-labelledby={id} data-kit="section">
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle} id={id}>
          {heading}
        </h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------------- row and number */

const RowNameContext = createContext<string | undefined>(undefined);

/**
 * The parameter-list row. Contract: exactly one row height (`--kit-row-height`), name left in muted text, value right
 * aligned, both vertically centred; the name labels the control inside (fields read its id), so a field needs no
 * label of its own. `fill` lets the value take the rest of the row (a segmented control or a wide select).
 */
export function Row({
  name,
  children,
  fill,
}: {
  name: ReactNode;
  children: ReactNode;
  fill?: boolean;
}) {
  const nameId = useId();
  return (
    <div className={classes.row} data-kit="row">
      <span className={classes.rowName} id={nameId} data-kit="row-name">
        {name}
      </span>
      <span className={classes.rowValue} data-kit="row-value" data-fill={fill ? 'true' : undefined}>
        <RowNameContext.Provider value={nameId}>{children}</RowNameContext.Provider>
      </span>
    </div>
  );
}

/** A number or identifier: DM Mono, tabular. */
export function Num({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Data span className={classes.num} c={muted ? 'dimmed' : undefined} data-kit="num">
      {children}
    </Data>
  );
}

/* ------------------------------------------------------------------------------------ toggle */

/**
 * The only on/off control: a pressed button (`aria-pressed`, accent fill while on). A native button, so Enter and
 * Space toggle it and it is a tab stop. The label is one or two words naming what it toggles; longer meaning goes in
 * a `Tip` around it.
 */
export function Toggle({
  pressed,
  onPressedChange,
  children,
  disabled,
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={classes.toggle}
      aria-pressed={pressed}
      disabled={disabled}
      data-kit="toggle"
      onClick={() => onPressedChange(!pressed)}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------------------ fields */

/** Inside a `Row` the row's name labels the field; elsewhere pass `aria-label`. */
function useFieldLabel(ariaLabel?: string) {
  const nameId = useContext(RowNameContext);
  return ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': nameId };
}

export function TextField({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  'aria-label'?: string;
}) {
  return (
    <TextInput
      size="xs"
      className={classes.fieldFill}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...useFieldLabel(ariaLabel)}
    />
  );
}

/** Fixed width: 4 rem for counts, `wide` 4.5 rem for values like milliseconds. No spinner buttons. */
export function NumberField({
  value,
  onChange,
  wide,
  min,
  max,
  'aria-label': ariaLabel,
}: {
  value: number | string;
  onChange: (v: number | string) => void;
  wide?: boolean;
  min?: number;
  max?: number;
  'aria-label'?: string;
}) {
  return (
    <NumberInput
      size="xs"
      hideControls
      className={classes.fieldNumber}
      data-wide={wide ? 'true' : undefined}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      {...useFieldLabel(ariaLabel)}
    />
  );
}

/**
 * Blender `wcol_num`-style scrubbable numeric control:
 * - At rest / hover: raised `--panel-slot` fill with `ew-resize` cursor (drag horizontally to scrub, Shift for 0.1x).
 * - Single-click without drag (or Enter): switches to recessed `--panel-well` text entry with `--focus-ring`.
 * - Double-click: resets to `defaultValue` when provided.
 * - Pass `range={[min, max]}` for a genuinely bounded range (draws the `--accent` fill bar, unipolar or bipolar from 0).
 * - Pass `clamp={[min, max]}` for a safety clamp without a fill bar.
 */
export function ScrubNumber({
  value,
  onChange,
  range,
  clamp: clampBounds,
  step = 1,
  defaultValue,
  prefix = '',
  suffix = '',
  disabled = false,
  label,
  description,
  style,
  className,
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Genuinely bounded `[min, max]` range: clamps values and draws the `--accent` progress fill bar. */
  range?: [number, number];
  /** Safety `[min, max]` clamp: clamps values without drawing a progress fill bar. */
  clamp?: [number, number];
  step?: number;
  defaultValue?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    startX: number;
    startValue: number;
    moved: boolean;
  } | null>(null);
  const ctxLabelProps = useFieldLabel(ariaLabel);
  const labelId = useId();
  const labelProps = label && !ariaLabel ? { 'aria-labelledby': labelId } : ctxLabelProps;

  const bounds = range ?? clampBounds;
  const min = bounds?.[0];
  const max = bounds?.[1];

  const roundToStep = (n: number, fine: boolean) => {
    const unit = step * (fine ? 0.1 : 1);
    const decimals = Math.max(0, (String(unit).split('.')[1] ?? '').length);
    return Number(n.toFixed(Math.min(6, decimals)));
  };

  const clampValue = (n: number) => {
    let out = n;
    if (min !== undefined) {
      out = Math.max(min, out);
    }
    if (max !== undefined) {
      out = Math.min(max, out);
    }
    return out;
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitDraft = () => {
    const parsed = Number(draft.trim());
    if (Number.isFinite(parsed) && draft.trim() !== '') {
      onChange(clampValue(parsed));
    }
    setEditing(false);
  };

  if (editing && !disabled) {
    const inputEl = (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={className ? `${classes.scrubInput} ${className}` : classes.scrubInput}
        style={style}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        {...labelProps}
      />
    );
    return label || description ? (
      <div className={classes.scrubField}>
        {label && (
          <span id={labelId} className={classes.scrubLabel}>
            {label}
          </span>
        )}
        {description && <span className={classes.scrubDescription}>{description}</span>}
        {inputEl}
      </div>
    ) : (
      inputEl
    );
  }

  let fillStyle: { left: string; width: string } | null = null;
  if (range !== undefined && range[1] > range[0]) {
    const [rMin, rMax] = range;
    const span = rMax - rMin;
    const clamped = Math.max(rMin, Math.min(rMax, value));
    if (rMin < 0 && rMax > 0) {
      // Bipolar: grow left or right from zero so 0 reads empty.
      const zeroPct = ((0 - rMin) / span) * 100;
      const valPct = ((clamped - rMin) / span) * 100;
      fillStyle = {
        left: `${Math.min(zeroPct, valPct)}%`,
        width: `${Math.abs(valPct - zeroPct)}%`,
      };
    } else {
      fillStyle = {
        left: '0%',
        width: `${((clamped - rMin) / span) * 100}%`,
      };
    }
  }

  const scrubEl = (
    <div
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-disabled={disabled || undefined}
      data-kit="scrub-number"
      data-dragging={dragging ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      className={className ? `${classes.scrub} ${className}` : classes.scrub}
      style={style}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) {
          return;
        }
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = { startX: e.clientX, startValue: value, moved: false };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (disabled || !d) {
          return;
        }
        const dx = e.clientX - d.startX;
        if (!d.moved && Math.abs(dx) < 3) {
          return;
        }
        d.moved = true;
        setDragging(true);
        const factor = e.shiftKey ? 0.1 : 1;
        // ~6px per step for crisp integer/fine control
        const delta = Math.round((dx / 6) * factor) * step;
        const next = clampValue(roundToStep(d.startValue + delta, e.shiftKey));
        if (next !== value) {
          onChange(next);
        }
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragging(false);
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (!disabled && d && !d.moved && e.detail < 2) {
          setDraft(String(value));
          setEditing(true);
        }
      }}
      onDoubleClick={() => {
        if (!disabled && defaultValue !== undefined) {
          setEditing(false);
          onChange(clampValue(defaultValue));
        }
      }}
      onKeyDown={(e) => {
        if (disabled) {
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDraft(String(value));
          setEditing(true);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(clampValue(roundToStep(value + step * (e.shiftKey ? 0.1 : 1), e.shiftKey)));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange(clampValue(roundToStep(value - step * (e.shiftKey ? 0.1 : 1), e.shiftKey)));
        }
      }}
      {...labelProps}
    >
      {fillStyle !== null && (
        <span className={classes.scrubFill} style={fillStyle} aria-hidden="true" />
      )}
      <span className={classes.scrubValue}>
        {prefix}
        {value}
        {suffix}
      </span>
    </div>
  );

  return label || description ? (
    <div className={classes.scrubField}>
      {label && (
        <span id={labelId} className={classes.scrubLabel}>
          {label}
        </span>
      )}
      {description && <span className={classes.scrubDescription}>{description}</span>}
      {scrubEl}
    </div>
  ) : (
    scrubEl
  );
}

/** A native select: fixed 6.875 rem, or the whole value cell with `fill`. */
export function SelectField({
  value,
  onChange,
  data,
  fill,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  data: readonly string[];
  fill?: boolean;
  'aria-label'?: string;
}) {
  return (
    <NativeSelect
      size="xs"
      className={fill ? classes.fieldFill : classes.fieldSelect}
      value={value}
      data={[...data]}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...useFieldLabel(ariaLabel)}
    />
  );
}

/** A segmented control for a few mutually exclusive options; wants a `fill` row. */
export function SegmentedField({
  value,
  onChange,
  data,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  data: readonly string[];
  'aria-label'?: string;
}) {
  return (
    <SegmentedControl
      size="xs"
      classNames={{ root: classes.segRoot, label: classes.segLabel }}
      fullWidth
      value={value}
      data={[...data]}
      onChange={onChange}
      {...useFieldLabel(ariaLabel)}
    />
  );
}

/* ----------------------------------------------------------------------------- actions, tips */

/** A panel's commands (Apply, Reset): right-aligned, at the end of the body, the primary one last. */
export function Actions({ children }: { children: ReactNode }) {
  return (
    <div className={classes.actions} data-kit="actions">
      {children}
    </div>
  );
}

/** An in-body command: an `xs` default Button. */
export function ActionButton(
  props: Omit<ButtonProps, 'size' | 'variant'> & { onClick?: () => void }
) {
  return <Button size="xs" variant="default" {...props} />;
}

/**
 * A tooltip in the one Stage style: 300 wide, on top, open delay from the Stage developer option (default 330 ms),
 * opens on hover, focus and touch. `as="label"` wraps text in a dotted-underline button; `as="control"` wraps a
 * control as it is.
 */
export function Tip({
  term,
  text,
  children,
  as = 'label',
}: {
  term: string;
  text: string;
  children: ReactNode;
  as?: 'label' | 'control';
}) {
  const delay = useTipDelay();
  return (
    <Tooltip
      multiline
      w={TIP_WIDTH}
      openDelay={delay}
      position="top"
      events={{ hover: true, focus: true, touch: true }}
      label={
        <>
          <Text span fw={600} display="block">
            {term}
          </Text>
          {text}
        </>
      }
    >
      {as === 'label' ? (
        <button type="button" className={classes.tip} data-kit="tip">
          {children}
        </button>
      ) : (
        <span data-kit="tip">{children}</span>
      )}
    </Tooltip>
  );
}

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
  useId,
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
import { Data } from '../../../components/Data/Data';
import { useTipDelay } from './settings';
import { DEFAULT_DENSITY, TIP_WIDTH, tokenStyle, type Density } from './tokens';
import classes from './kit.module.css';

const DensityContext = createContext<Density>(DEFAULT_DENSITY);
export const useDensity = () => useContext(DensityContext);

/** Writes one density's token set as custom properties for everything inside. Nest to show another density. */
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

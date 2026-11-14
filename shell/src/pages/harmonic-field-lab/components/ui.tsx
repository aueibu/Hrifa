/** Small shared pieces of the lab: tooltips from texts.ts, number cells, name/value rows, severity helpers. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  NumberInput,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  type NumberInputProps,
  type TextareaProps,
  type TextInputProps,
} from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { TIPS, type TipKey } from '../texts';
import classes from './lab.module.css';

interface TipProps {
  k: TipKey;
  children: ReactNode;
  /** `label` (default): a dotted-underline button. `control`: wraps a control, no underline. `block` only with control. */
  as?: 'label' | 'control';
  block?: boolean;
  /** Extra sentence appended to the glossary text (e.g. the preset's own description). */
  extra?: string;
}

/** Hover/focus tooltip whose text is the glossary entry `k` (one source of truth). */
export function Tip({ k, children, as = 'label', block, extra }: TipProps) {
  const entry = TIPS[k];
  return (
    <Tooltip
      multiline
      w={300}
      openDelay={250}
      position="top"
      events={{ hover: true, focus: true, touch: true }}
      label={
        <>
          <Text span fw={600} display="block">
            {entry.term}
          </Text>
          {entry.text}
          {extra && (
            <Text span display="block" mt={4}>
              {extra}
            </Text>
          )}
        </>
      }
    >
      {as === 'label' ? (
        <button type="button" className={classes.tip} data-tipk={k}>
          {children}
        </button>
      ) : block ? (
        <div className={classes.tipControl} data-block="true" data-tipk={k}>
          {children}
        </div>
      ) : (
        <span className={classes.tipControl} data-tipk={k}>
          {children}
        </span>
      )}
    </Tooltip>
  );
}

/** A number or identifier: DM Mono, tabular. */
export function Num({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Data span className={classes.num} c={muted ? 'dimmed' : undefined}>
      {children}
    </Data>
  );
}

/** Name (muted) and value (text): the parameter-list grammar. */
export function Row({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className={classes.kv}>
      <span className={classes.kvName}>{name}</span>
      <span className={classes.kvValue}>{children}</span>
    </div>
  );
}

/** A thin panel header strip: title left, tools right. */
export function Strip({
  title,
  children,
  id,
}: {
  title: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  const pinActions = useContext(PinActionsContext);
  return (
    <div className={classes.strip}>
      <h2 className={classes.stripTitle} id={id}>
        {title}
      </h2>
      <div className={classes.stripTools}>
        {children}
        {pinActions}
      </div>
    </div>
  );
}

/** Inside a pinned column, the move and unpin buttons the panel's own header strip shows after its tools. */
export const PinActionsContext = createContext<ReactNode>(null);

/**
 * Click and keyboard handlers for a note in any view: a plain click or Enter/Space toggles it in the subset;
 * Alt+click or Alt+Enter pins it (or unpins it) in the inspector, and does not toggle.
 */
/** Row handlers: like `noteHandlers`, but the keys only act when the row itself has focus (not a button or box inside it). */
export function rowHandlers(
  lab: { clickNote: (i: number) => void; pinNote: (i: number) => void },
  i: number
) {
  const h = noteHandlers(lab, i);
  return {
    onClick: h.onClick,
    onKeyDown: (e: {
      key: string;
      altKey: boolean;
      preventDefault: () => void;
      target: unknown;
      currentTarget: unknown;
    }) => {
      if (e.target === e.currentTarget) {
        h.onKeyDown(e);
      }
    },
  };
}

/**
 * The preview a modifier click asks for: Ctrl (Cmd on a Mac) = listed, Shift = pure, both = both together. Null for a
 * plain click, and for Alt (Alt+click pins).
 */
export function previewKind(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): PreviewKind | null {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.altKey || (!ctrl && !e.shiftKey)) {
    return null;
  }
  return ctrl && e.shiftKey ? 'both' : ctrl ? 'listed' : 'pure';
}

export function noteHandlers(
  lab: { clickNote: (i: number) => void; pinNote: (i: number) => void },
  i: number
) {
  return {
    onClick: (e: { altKey: boolean }) => (e.altKey ? lab.pinNote(i) : lab.clickNote(i)),
    onKeyDown: (e: { key: string; altKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.altKey) {
          lab.pinNote(i);
        } else {
          lab.clickNote(i);
        }
      }
    },
  };
}

/** Signed one-decimal cents with the sign always printed (the second channel next to a sharp/flat colour). */
export const signed = (x: number, dp = 1) => {
  const t = x.toFixed(dp);
  return Number(t) === 0 ? (0).toFixed(dp) : (x > 0 ? '+' : '') + t;
};

/** Error severity by absolute cents: 0 exact, 1 under 5, 2 under 15, 3 under 30, 4 beyond. */
export const severity = (c: number) => (c < 1e-6 ? 0 : c < 5 ? 1 : c < 15 ? 2 : c < 30 ? 3 : 4);
/** Sign of a cents error for display: "+", the minus sign U+2212, or "" when it is exact (under 0.05 c). */
export const signChar = (x: number) => (Math.abs(x) < 0.05 ? '' : x > 0 ? '+' : '−');
/** A signed cents value with its unit and no space, e.g. "+21.5 c" or "−21.5 c"; exact reads "0 c". */
export const signedCents = (x: number, dp = 1) =>
  Math.abs(x) < 0.05 ? '0 c' : `${signChar(x)}${Math.abs(x).toFixed(dp)} c`;

export const SEV_LABEL = ['exact', 'under 5 c', '5 to 15 c', '15 to 30 c', '30 c or more'];

import type { PreviewKind } from '../audio/plan';
export { useLab, useViz } from '../state/context';

/** How long typing pauses before a text-driven field rebuild (the prototype's `regen()` delay). */
export const REGEN_DELAY_MS = 120;

/**
 * A value edited by typing, committed after the typing pauses (so typing "3/2" never rebuilds the field for "3" and drops
 * selected notes). `change(v, false)` shows the text but commits nothing. `flush` commits at once (Enter, blur, unmount).
 */
function useDebouncedField<T>(value: T, commit: (v: T) => void) {
  const [local, setLocal] = useState<T>(value);
  const pending = useRef<{ v: T } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    if (!pending.current) {
      setLocal(value);
    }
  }, [value]);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const p = pending.current;
    pending.current = null;
    if (p) {
      commitRef.current(p.v);
    }
  }, []);
  const change = (v: T, valid = true) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    if (!valid) {
      pending.current = null;
      return;
    }
    pending.current = { v };
    timer.current = window.setTimeout(flush, REGEN_DELAY_MS);
  };
  useEffect(() => flush, [flush]);
  return { local, setLocal, change, flush };
}

/**
 * A number field that lets the user clear and retype: the text is local while editing, a valid number (whole by default;
 * pass `allowDecimal`) is committed once typing pauses (or on blur), and the field snaps back to the stored value on blur.
 * Never commits NaN or an out-of-range number.
 */
export function CommitNumber({
  value,
  onCommit,
  min,
  max,
  ...rest
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
} & Omit<NumberInputProps, 'value' | 'onChange' | 'min' | 'max' | 'onBlur'>) {
  const f = useDebouncedField<string | number>(value, (v) => onCommit(v as number));
  return (
    <NumberInput
      allowDecimal={false}
      {...rest}
      min={min}
      max={max}
      value={f.local}
      clampBehavior="strict"
      onChange={(v) => f.change(v, typeof v === 'number' && Number.isFinite(v))}
      onBlur={() => {
        f.flush();
        f.setLocal(value);
      }}
    />
  );
}

/** A text field whose value is committed once typing pauses, on Enter and on blur. */
export function DebouncedText({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  TextInputProps,
  'value' | 'onChange' | 'onBlur'
>) {
  const f = useDebouncedField(value, onCommit);
  return (
    <TextInput
      {...rest}
      value={f.local}
      onChange={(e) => f.change(e.currentTarget.value)}
      onBlur={f.flush}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          f.flush();
        }
      }}
    />
  );
}

/** A multi-line text field whose value is committed once typing pauses and on blur. */
export function DebouncedTextarea({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  TextareaProps,
  'value' | 'onChange' | 'onBlur'
>) {
  const f = useDebouncedField(value, onCommit);
  return (
    <Textarea
      {...rest}
      value={f.local}
      onChange={(e) => f.change(e.currentTarget.value)}
      onBlur={f.flush}
    />
  );
}

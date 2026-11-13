/** Small shared pieces of the mock: tooltips from texts.ts, number cells, name/value rows, severity helpers. */
import { createContext, useContext, type ReactNode } from 'react';
import { Text, Tooltip } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { TIPS, type TipKey } from './texts';
import classes from './mock.module.css';

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
  return (
    <div className={classes.strip}>
      <h2 className={classes.stripTitle} id={id}>
        {title}
      </h2>
      <div className={classes.stripTools}>{children}</div>
    </div>
  );
}

/** Signed one-decimal cents with the sign always printed (the second channel next to a sharp/flat colour). */
export const signed = (x: number, dp = 1) => {
  const t = x.toFixed(dp);
  return Number(t) === 0 ? (0).toFixed(dp) : (x > 0 ? '+' : '') + t;
};

/** Error severity by absolute cents: 0 exact, 1 under 5, 2 under 15, 3 under 30, 4 beyond. */
export const severity = (c: number) => (c < 1e-6 ? 0 : c < 5 ? 1 : c < 15 ? 2 : c < 30 ? 3 : 4);
export const SEV_LABEL = ['exact', 'under 5 c', '5 to 15 c', '15 to 30 c', '30 c or more'];

/** What the whole workspace shares: the pointed-at note (inspector), the highlighted chord, the selected mode. */
export interface Lab {
  hover: number | null;
  pin: number | null;
  setHover: (i: number | null) => void;
  setPin: (i: number | null) => void;
  chord: ReadonlySet<number>;
  setChord: (s: ReadonlySet<number>) => void;
  mode: number;
  setMode: (m: number) => void;
  /** Saved subset pointed at (preview on the ring) and the one loaded (index into savedSubsets). */
  preview: readonly number[] | null;
  setPreview: (s: readonly number[] | null) => void;
  loaded: number;
  setLoaded: (i: number) => void;
}
export const LabContext = createContext<Lab | null>(null);
export function useLab(): Lab {
  const v = useContext(LabContext);
  if (!v) {
    throw new Error('LabContext missing');
  }
  return v;
}

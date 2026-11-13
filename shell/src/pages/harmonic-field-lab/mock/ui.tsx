/** Small shared pieces of the mock: tooltips from texts.ts, number cells, labelled control clusters. */
import type { ReactNode } from 'react';
import { Text, Title, Tooltip } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { TIPS, type TipKey } from './texts';
import classes from './mock.module.css';

interface TipProps {
  k: TipKey;
  children: ReactNode;
  /** `label` (default): a dotted-underline button. `control`: wraps a control, no underline. `block` only with control. */
  as?: 'label' | 'control';
  block?: boolean;
}

/** Hover/focus tooltip whose text is the glossary entry `k` (one source of truth). */
export function Tip({ k, children, as = 'label', block }: TipProps) {
  const entry = TIPS[k];
  return (
    <Tooltip
      multiline
      w={300}
      openDelay={200}
      position="top"
      events={{ hover: true, focus: true, touch: true }}
      label={
        <>
          <Text span fw={600} display="block">
            {entry.term}
          </Text>
          {entry.text}
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

/** A number or identifier: DM Mono, tabular, right-aligned in tables. */
export function Num({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Data span className={classes.num} c={muted ? 'dimmed' : undefined}>
      {children}
    </Data>
  );
}

/** A named group of controls inside an article: a tier fill and a small title, no extra box line. */
export function Cluster({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className={classes.cluster} aria-label={typeof title === 'string' ? title : undefined}>
      <h4 className={classes.clusterTitle}>{title}</h4>
      <div className={classes.clusterBody}>{children}</div>
    </section>
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

/** Signed one-decimal cents with the sign always printed (the second channel next to a sharp/flat colour). */
export const signed = (x: number, dp = 1) => {
  const t = x.toFixed(dp);
  return Number(t) === 0 ? (0).toFixed(dp) : (x > 0 ? '+' : '') + t;
};

/** Chord error severity, by absolute cents: 0 exact, 1 under 5, 2 under 15, 3 under 30, 4 beyond. */
export const severity = (c: number) => (c < 1e-6 ? 0 : c < 5 ? 1 : c < 15 ? 2 : c < 30 ? 3 : 4);

/** Section heading: title and a one-line description. */
export function SectionHead({ id, title, lede }: { id: string; title: string; lede: string }) {
  return (
    <header className={classes.sectionHead}>
      <Title order={2} size="h3" id={id}>
        {title}
      </Title>
      <Text c="dimmed" size="sm">
        {lede}
      </Text>
    </header>
  );
}

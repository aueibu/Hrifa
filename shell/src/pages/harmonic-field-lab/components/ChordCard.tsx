/**
 * M8h: the ONE chord card shared by ratio chords, CPS chords and positional chords. One card per row, every card the same
 * width and the same height: ring | title (name, subtitle) | pitches (pitches, steps) | right stat, with the stash `+` at the far
 * right. The behaviours (hover, click, hold keys, send) stay with the caller: it passes the handlers and the texts.
 */
import type { ReactNode } from 'react';
import { Tooltip } from '@mantine/core';
import { PlusIcon } from './icons';
import { ChordDrawing } from './ShelfPanel';
import { Num, useNativeTitle, useTooltipProps } from './ui';
import classes from './panels.module.css';

/** Cents with one decimal (the Sketch row's number format). */
export const cents1 = (c: number): string => c.toFixed(1);

/** `a, b c`: a list of cents. */
export const fmtCentsList = (cs: readonly number[]): string => `${cs.map(cents1).join(', ')} c`;

/** `steps a, b c`: the gaps between consecutive pitches (empty for fewer than 2). */
export const fmtSteps = (cs: readonly number[]): string =>
  cs.length > 1 ? `steps ${fmtCentsList(cs.slice(1).map((c, i) => c - cs[i]))}` : '';

export interface ChordCardProps {
  as?: 'span' | 'li';
  testId?: string;
  label: string;
  title: string;
  /** Extra muted text after the title (a positional card's `~ 4:5:6`). */
  titleExtra?: string | null;
  subtitle: string;
  pitches: string;
  steps: string;
  stat: ReactNode;
  ring: { cents: readonly number[]; repC: number };
  found: boolean;
  picked: boolean;
  /** `aria-pressed` is only set for cards that can be picked. */
  pressable?: boolean;
  cps?: string;
  onEnter: (e: { currentTarget: EventTarget }) => void;
  onLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: (e: { shiftKey: boolean }) => void;
  stash?: { label: string; onStash: () => void };
}

export function ChordCard(p: ChordCardProps) {
  const tipProps = useTooltipProps();
  const nativeTitle = useNativeTitle();
  const Wrap = p.as ?? 'span';
  return (
    <Wrap
      className={classes.chipWrap}
      data-stash={p.stash ? true : undefined}
      data-testid={p.testId}
    >
      <Tooltip label={p.label} multiline w={260} {...tipProps}>
        <button
          type="button"
          className={classes.card}
          data-found={p.found}
          data-cps={p.cps}
          data-picked={p.picked}
          aria-pressed={p.pressable === false ? undefined : p.picked}
          aria-label={p.label}
          onMouseEnter={p.onEnter}
          onMouseLeave={p.onLeave}
          onFocus={p.onFocus}
          onBlur={p.onBlur}
          onClick={p.onClick}
        >
          <span className={classes.cardRing}>
            <ChordDrawing cents={p.ring.cents} repC={p.ring.repC} />
          </span>
          <span className={classes.cardCol} data-col="title">
            <span className={classes.cardLine1} data-testid="card-title">
              <Num>{p.title}</Num>
              {p.titleExtra && <Num muted>{` · ${p.titleExtra}`}</Num>}
            </span>
            <span className={classes.cardLine2} data-testid="card-subtitle">
              <Num muted>{p.subtitle}</Num>
            </span>
          </span>
          <span
            className={classes.cardCol}
            data-col="pitches"
            title={nativeTitle(`${p.pitches}
${p.steps}`)}
          >
            <span className={classes.cardLine1} data-testid="card-pitches">
              <Num>{p.pitches}</Num>
            </span>
            <span className={classes.cardLine2} data-testid="card-steps">
              <Num muted>{p.steps}</Num>
            </span>
          </span>
          <span className={classes.cardStat} data-testid="card-stat">
            {p.stat}
          </span>
        </button>
      </Tooltip>
      {p.stash && (
        <button
          type="button"
          className={classes.chipStash}
          aria-label={p.stash.label}
          title={nativeTitle('Stash this chord on the shelf')}
          onClick={p.stash.onStash}
        >
          <PlusIcon />
        </button>
      )}
    </Wrap>
  );
}

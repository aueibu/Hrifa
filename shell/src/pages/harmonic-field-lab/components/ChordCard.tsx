/**
 * M8h: the ONE chord card shared by ratio chords, CPS chords and positional chords. One card per row, every card the same
 * width and the same height: ring | title (name, subtitle) | pitches (pitches, steps) | right stat, with the stash `+` at the far
 * right. The behaviours (hover, click, hold keys, send) stay with the caller: it passes the handlers and the texts.
 */
import type { ReactNode } from 'react';
import { Button } from '@mantine/core';
import { ChevronDownIcon, PlusIcon } from './icons';
import { ChordDrawing } from './ShelfPanel';
import { Hint, LabTooltip, Num, useTooltipProps } from './ui';
import { ValueList } from './ValueList';
import classes from './panels.module.css';

/** Cents with one decimal (the Sketch row's number format). */
export const cents1 = (c: number): string => c.toFixed(1);

/** `a, b c`: a list of cents. */
export const fmtCentsList = (cs: readonly number[]): string => `${cs.map(cents1).join(', ')} c`;

/** `steps a, b c`: the gaps between consecutive pitches (empty for fewer than 2). */
export const fmtSteps = (cs: readonly number[]): string =>
  cs.length > 1 ? `steps ${fmtCentsList(cs.slice(1).map((c, i) => c - cs[i]))}` : '';

/** The two text lines under a card's pitches: `a  b  c` ratios when every note has one, else `a, b c` cents; and the steps (shared by the chips and the shelf cards). */
export function pitchTexts(ups: readonly number[], ratios: readonly string[] | null) {
  return {
    pitches: ratios ? ratios.join('  ') : fmtCentsList(ups),
    steps: fmtSteps(ups),
  };
}

/** `4:5:6 on 3/2`: a card's subtitle for a template on a root (the root as `noteLabel` writes it). A missing template gives `on 3/2`. */
export const templateOn = (template: string | null | undefined, root: string): string =>
  template ? `${template} on ${root}` : `on ${root}`;

/** `3 notes` / `1 note`. */
export const notesText = (n: number): string => `${n} ${n === 1 ? 'note' : 'notes'}`;

export interface ChordCardProps {
  as?: 'span' | 'li';
  testId?: string;
  label: string;
  title: string;
  /** Extra muted text after the title (a positional card's `~ 4:5:6`). */
  titleExtra?: string | null;
  /** A node in place of the title text (the shelf card's renamable name). */
  titleNode?: ReactNode;
  /** Shown before the title (the shelf card's computer-key badge). */
  badge?: ReactNode;
  /** Trailing action buttons: the card is then a static box and only the ring is the play button (shelf cards). */
  actions?: ReactNode;
  /** Static cards: the ring button. */
  ringButton?: {
    label: string;
    pressed: boolean;
    /** The styled tooltip: a bold first line and a sentence. */
    hint?: { label: string; text?: string };
    onClick: () => void;
  };
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
  onEnter?: (e: { currentTarget: EventTarget }) => void;
  onLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: (e: { shiftKey: boolean }) => void;
  stash?: { label: string; onStash: () => void };
  /** M8i: this card stands for `count` roots of one shape; a row at its bottom (`12 roots` + arrow) shows or hides the per-root cards below it. */
  group?: { count: number; expanded: boolean; label: string; onToggle: () => void };
}

export function ChordCard(p: ChordCardProps) {
  const tipProps = useTooltipProps();
  const Wrap = p.as ?? 'span';
  const titleLine = (
    <span className={classes.cardLine1} data-testid="card-title">
      {p.badge}
      {p.titleNode ?? <Num>{p.title}</Num>}
      {p.titleExtra && <Num muted>{` · ${p.titleExtra}`}</Num>}
    </span>
  );
  const pitchCol = (
    <Hint
      position="bottom"
      dynamic={
        <>
          <Num>{p.pitches}</Num>
          <br />
          <Num>{p.steps}</Num>
        </>
      }
    >
      <span className={classes.cardCol} data-col="pitches">
        <span className={classes.cardLine1} data-testid="card-pitches">
          <Num>
            <ValueList text={p.pitches} />
          </Num>
        </span>
        <span className={classes.cardLine2} data-testid="card-steps">
          <Num muted>
            <ValueList text={p.steps} />
          </Num>
        </span>
      </span>
    </Hint>
  );
  const ring = (
    <button
      type="button"
      className={classes.cardRingBtn}
      aria-label={p.ringButton?.label}
      aria-pressed={p.ringButton?.pressed}
      onClick={p.ringButton?.onClick}
    >
      <ChordDrawing cents={p.ring.cents} repC={p.ring.repC} rootCents={p.ring.cents[0]} />
    </button>
  );
  if (p.actions) {
    return (
      <Wrap className={classes.chipWrap} data-testid={p.testId}>
        <div
          className={classes.card}
          data-static
          data-found={p.found}
          data-picked={p.picked}
          data-cps={p.cps}
        >
          <span className={classes.cardRing}>
            {p.ringButton?.hint ? (
              <Hint label={p.ringButton.hint.label} dynamic={p.ringButton.hint.text}>
                {ring}
              </Hint>
            ) : (
              ring
            )}
          </span>
          <span className={classes.cardCol} data-col="title">
            {titleLine}
            <span className={classes.cardLine2} data-testid="card-subtitle">
              <Num muted>{p.subtitle}</Num>
            </span>
          </span>
          {pitchCol}
          <span className={classes.cardStat} data-actions data-testid="card-stat">
            {p.actions}
          </span>
        </div>
      </Wrap>
    );
  }
  return (
    <Wrap
      className={classes.chipWrap}
      data-stash={p.stash ? true : undefined}
      data-grouped={p.group ? true : undefined}
      data-picked={p.group ? p.picked : undefined}
      data-testid={p.testId}
    >
      <LabTooltip label={p.label} multiline w={260} {...tipProps}>
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
            <ChordDrawing cents={p.ring.cents} repC={p.ring.repC} rootCents={p.ring.cents[0]} />
          </span>
          <span className={classes.cardCol} data-col="title">
            {titleLine}
            <span className={classes.cardLine2} data-testid="card-subtitle">
              <Num muted>{p.subtitle}</Num>
            </span>
          </span>
          {pitchCol}
          <span className={classes.cardStat} data-testid="card-stat">
            {p.stat}
          </span>
        </button>
      </LabTooltip>
      {p.group && (
        <span className={classes.groupRow}>
          <Button
            size="compact-xs"
            variant="default"
            aria-expanded={p.group.expanded}
            aria-label={p.group.label}
            rightSection={<ChevronDownIcon />}
            onClick={p.group.onToggle}
          >
            {p.group.count} roots
          </Button>
        </span>
      )}
      {p.stash && (
        <Hint label="Stash this chord on the shelf">
          <button
            type="button"
            className={classes.chipStash}
            aria-label={p.stash.label}
            onClick={p.stash.onStash}
          >
            <PlusIcon />
          </button>
        </Hint>
      )}
    </Wrap>
  );
}

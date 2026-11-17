/**
 * M8h: the ONE chord card shared by ratio chords, CPS chords and positional chords. One card per row, every card the same
 * width and the same height: ring | title (name, subtitle) | pitches (pitches, steps) | right stat, with the stash `+` at the far
 * right. The behaviors (hover, click, hold keys, send) stay with the caller: it passes the handlers and the texts.
 */
import type { ReactElement, ReactNode } from 'react';
import { Button } from '@mantine/core';
import { glueUnits } from '../markup';
import {
  EXACT_NOTE_C,
  NOTE_ERROR_WORD,
  fmtErrors,
  signedC1,
  type NoteErrorLine,
} from '../state/chordSort';
import { ChevronDownIcon, PlusIcon } from './icons';
import { ChordDrawing } from './ShelfPanel';
import { Hint, Num, RING_TIP_MAX_WIDTH, severity } from './ui';
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

/** The steps text without its leading word (`steps 1, 2 c` gives `1, 2 c`): the tooltip's label already says Steps. */
export const stepsValue = (steps: string): string => steps.replace(/^steps\s+/, '');

/** The error band (0 to 4, as the card stat's `severity`) of each note's signed error. */
export const errorSevs = (errors: readonly number[] | null | undefined): number[] | null =>
  errors ? errors.map((e) => severity(Math.abs(e))) : null;

/**
 * The chip's ONE hover tooltip body (every region of the card except the ring): Pitches, Steps, then one sentence per non-root
 * note in the finder's template order (`13/11 is −26.4 c from 6/5`, or `3/2 is exact`), then `Appears at tolerance N c.` (an
 * exact chord: `Appears at any tolerance.`). The sentence lines and the last line exist only when the card has them
 * (`noteLines`, `appearsAt`); the Developer option `cardNoteErrors` does not change it. Each pitch, and each note's member and
 * error value, is tinted by its own band.
 */
export function CardHintLines({
  pitches,
  steps,
  errors,
  noteLines,
  appearsAt,
}: {
  pitches: string;
  steps: string;
  errors?: readonly number[] | null;
  noteLines?: readonly NoteErrorLine[] | null;
  /** The tolerance rung (whole cents) the chord appears at; 0 = any tolerance (exact). Absent: no line. */
  appearsAt?: number;
}) {
  const sevs = errorSevs(errors);
  const lineSevs = errorSevs(noteLines?.map((l) => l.error));
  return (
    <>
      <span className={classes.hintLine}>
        <span>Pitches:</span>
        <Num>
          <ValueList text={pitches} sevs={sevs} />
        </Num>
      </span>
      <span className={classes.hintLine}>
        <span>Steps:</span>
        <Num>
          <ValueList text={stepsValue(steps)} />
        </Num>
      </span>
      {noteLines?.map((l, i) => {
        const sev = lineSevs?.[i];
        const exact = Math.abs(l.error) < EXACT_NOTE_C;
        return (
          <span key={i} className={classes.hintNote} data-testid="hint-note">
            <Num>
              <ValueList
                inline
                text={glueUnits(l.member)}
                sevs={sev === undefined ? null : [sev]}
              />
            </Num>
            {exact ? (
              ' is exact'
            ) : (
              <>
                {' is '}
                <Num>
                  <ValueList
                    inline
                    text={glueUnits(`${signedC1(l.error)} c`)}
                    sevs={sev === undefined ? null : [sev]}
                  />
                </Num>
                {` ${NOTE_ERROR_WORD} `}
                <Num>{l.ideal}</Num>
              </>
            )}
          </span>
        );
      })}
      {appearsAt !== undefined && (
        <span className={classes.hintNote} data-testid="hint-appears">
          {appearsAt === 0
            ? 'Appears at any tolerance.'
            : glueUnits(`Appears at tolerance ${appearsAt} c.`)}
        </span>
      )}
    </>
  );
}

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
  /** M5b (shelf card): the stored description, for the tooltip's second line; absent or empty = none. */
  description?: string;
  /** M5b (shelf card): the description line, the card's second line under the name; absent = no extra row. */
  descriptionNode?: ReactNode;
  /** M5b: the description line is being edited (its own tooltip is off while the text box is open). */
  descriptionEditing?: boolean;
  pitches: string;
  steps: string;
  /** M4: each note's signed error in cents, in the order of `pitches` (root `0`); null or absent for CPS, dashed, positional and shelf cards. */
  errors?: readonly number[] | null;
  /** M4: the Developer option `cardNoteErrors`: also show the Error line on the card (the tooltip's sentence lines show regardless). */
  showErrors?: boolean;
  /** The tooltip's per-note sentences, in the finder's template order (`state/chordSort.noteErrorLines`); null or absent: no sentence lines. */
  noteLines?: readonly NoteErrorLine[] | null;
  /** The tolerance (whole cents) the chord appears at, 0 for an exact chord; absent: no `Appears at` line. */
  appearsAt?: number;
  /**
   * The ring's tooltip (glossary entry `chordChip`): this dynamic line sits first under the term. A card with per-note errors
   * shows the error tooltip on every other region; any other card (dashed, CPS, Positional) shows this one there too.
   */
  ringTip?: string;
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
  const Wrap = p.as ?? 'span';
  const titleLine = (
    <span className={classes.cardLine1} data-testid="card-title">
      {p.badge}
      {p.titleNode ?? <Num>{p.title}</Num>}
      {p.titleExtra && <Num muted>{` · ${p.titleExtra}`}</Num>}
    </span>
  );
  // `.cardCol` is `display: contents` (no box of its own), so the tooltip hangs on the two real line boxes inside it
  const errors = p.errors && p.errors.length ? p.errors : null;
  const sevs = errorSevs(errors);
  // ONE tooltip for every region of a chip except the ring: the error tooltip when the card has per-note errors, else the ring's
  // own (so every region of every card has exactly one tooltip). A static card (shelf) keeps its Pitches and Steps tooltip.
  const bodyDynamic = (
    <CardHintLines
      pitches={p.pitches}
      steps={p.steps}
      errors={errors}
      noteLines={p.noteLines}
      appearsAt={p.appearsAt}
    />
  );
  // the ring's tooltip: the SAME lines as the chip's body tooltip first (decision H-16: the dynamic text sits first under the
  // term), then the glossary's help, keys and example; a card without per-note errors adds its own sentence under the lines
  const ringDynamic = (
    <>
      {bodyDynamic}
      {!errors && p.ringTip && (
        <span className={classes.hintSentence} data-testid="ring-sentence">
          {p.ringTip}
        </span>
      )}
    </>
  );
  // the shelf card's tooltip (M5b), always in this order: Title (bold, the chord name), the description (only when set; the one
  // line that may wrap, at the bubble's max width), `template on root · N notes`, then Pitches: and Steps: (one line each)
  const shelfDynamic = (
    <>
      {p.description && (
        <span className={classes.hintDesc} data-testid="hint-description">
          {p.description}
        </span>
      )}
      <span className={classes.hintNote} data-testid="hint-subtitle">
        <Num>{p.subtitle}</Num>
      </span>
      {bodyDynamic}
    </>
  );
  const regionTip = (el: ReactElement, off?: boolean): ReactElement =>
    p.actions ? (
      <Hint
        position="bottom"
        label={p.title}
        dynamic={shelfDynamic}
        fit={RING_TIP_MAX_WIDTH}
        disabled={off}
      >
        {el}
      </Hint>
    ) : errors ? (
      // a chip's body tooltip is rows of one line each: its bubble fits the longest one
      <Hint position="bottom" dynamic={bodyDynamic} fit>
        {el}
      </Hint>
    ) : (
      <Hint position="bottom" k="chordChip" dynamic={ringDynamic} fit={RING_TIP_MAX_WIDTH}>
        {el}
      </Hint>
    );
  const pitchCol = (
    <span className={classes.cardCol} data-col="pitches">
      {regionTip(
        <span className={classes.cardLine1} data-testid="card-pitches">
          <Num>
            <ValueList text={p.pitches} sevs={sevs} />
          </Num>
        </span>
      )}
      {regionTip(
        <span className={classes.cardLine2} data-testid="card-steps">
          <Num muted>
            <ValueList text={p.steps} />
          </Num>
        </span>
      )}
      {p.showErrors &&
        errors &&
        regionTip(
          <span className={classes.cardLine3} data-testid="card-errors">
            <Num>
              <ValueList text={fmtErrors(errors)} sevs={sevs} />
            </Num>
          </span>
        )}
    </span>
  );
  const errorsOnCard = p.showErrors && errors ? true : undefined;
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
          data-errors={errorsOnCard}
          data-found={p.found}
          data-picked={p.picked}
          data-cps={p.cps}
          data-desc={p.descriptionNode ? true : undefined}
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
            {p.descriptionNode &&
              regionTip(
                <span className={classes.cardDesc} data-testid="card-description">
                  {p.descriptionNode}
                </span>,
                p.descriptionEditing
              )}
            {regionTip(
              <span className={classes.cardLine2} data-testid="card-subtitle">
                <Num muted>{p.subtitle}</Num>
              </span>
            )}
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
      <button
        type="button"
        className={classes.card}
        data-errors={errorsOnCard}
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
        <Hint position="bottom" k="chordChip" dynamic={ringDynamic} fit={RING_TIP_MAX_WIDTH}>
          <span className={classes.cardRing}>
            <ChordDrawing cents={p.ring.cents} repC={p.ring.repC} rootCents={p.ring.cents[0]} />
          </span>
        </Hint>
        <span className={classes.cardCol} data-col="title">
          {regionTip(titleLine)}
          {regionTip(
            <span className={classes.cardLine2} data-testid="card-subtitle">
              <Num muted>{p.subtitle}</Num>
            </span>
          )}
        </span>
        {pitchCol}
        {regionTip(
          <span className={classes.cardStat} data-testid="card-stat">
            {p.stat}
          </span>
        )}
      </button>
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

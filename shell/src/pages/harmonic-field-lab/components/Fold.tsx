/**
 * Foldable sections of the Chords panel (M8f). `foldId` names a section, `useFold(id)` reads and flips its folded state in
 * `settings.v1` `ui.folds` (remembered per viewer; absent = open; nothing is written until the viewer folds something), and
 * `FoldHead` is the header: a chevron button with `aria-expanded` (Enter and Space work, it is a real button), the title,
 * and the count beside it (kept while folded).
 */
import type { ReactNode } from 'react';
import { addFold, foldId } from '../state/foldIds';
import type { TipKey } from '../texts';
import { ChevronDownIcon } from './icons';
import { Num, Tip, useLab, useNativeTitle } from './ui';
import classes from './panels.module.css';

export { foldId };

/** Folded state of one section and the toggle. */
export function useFold(id: string): { folded: boolean; toggle: () => void } {
  const { state, dispatch } = useLab();
  const folds = state.ui.folds;
  const folded = folds[id] === true;
  const toggle = () => {
    if (folded) {
      const next = { ...folds };
      delete next[id];
      dispatch({ type: 'ui', patch: { folds: next } });
    } else {
      const next = addFold(folds, id);
      if (next) {
        dispatch({ type: 'ui', patch: { folds: next } });
      }
    }
  };
  return { folded, toggle };
}

interface FoldHeadProps {
  id: string;
  /** Glossary entry shown as the tooltip of the title. */
  tip: TipKey;
  title: ReactNode;
  count: ReactNode;
  /** Extra text for the accessible name, e.g. the section it belongs to. */
  label?: string;
}

export function FoldHead({ id, tip, title, count, label }: FoldHeadProps) {
  const { folded, toggle } = useFold(id);
  return (
    <span className={classes.foldHead} data-fold={id}>
      <Tip k={tip} as="control">
        <button
          type="button"
          className={classes.foldBtn}
          aria-expanded={!folded}
          aria-label={label}
          onClick={toggle}
        >
          <span className={classes.foldChevron} data-folded={folded} aria-hidden="true">
            <ChevronDownIcon />
          </span>
          <span>{title}</span>
        </button>
      </Tip>
      <Num muted>{count}</Num>
    </span>
  );
}

/** M8i: expanded state of one shape group, stored in the same `ui.folds` record but reversed: a stored `grp:` id = EXPANDED. */
export function useGroupExpanded(id: string): { expanded: boolean; toggle: () => void } {
  const { state, dispatch } = useLab();
  const folds = state.ui.folds;
  const expanded = folds[id] === true;
  const toggle = () => {
    if (expanded) {
      const next = { ...folds };
      delete next[id];
      dispatch({ type: 'ui', patch: { folds: next } });
    } else {
      const next = addFold(folds, id);
      if (next) {
        dispatch({ type: 'ui', patch: { folds: next } });
      }
    }
  };
  return { expanded, toggle };
}

/**
 * M8i: a header count. Grouping off: the bare number n of individual chords. Grouping on: `n (m)`, m = the unique shapes once grouped
 * (groups of one included, even when m equals n); the full sentence is its title and accessible label. The slot has one fixed width in
 * both states (`.foldCount`, fits `nnn (mm)`), right-aligned, so toggling the switch never shifts the header row.
 */
export function GroupedCount({ n, m }: { n: number; m: number | null }) {
  const { state } = useLab();
  const nativeTitle = useNativeTitle();
  if (!state.ui.groupShapes || m === null) {
    return <span className={classes.foldCount}>{n}</span>;
  }
  const sentence = `${n} total chords here (${m} unique chords once shapes are grouped)`;
  return (
    <span
      className={classes.foldCount}
      role="note"
      aria-label={sentence}
      title={nativeTitle(sentence)}
    >
      {n} ({m})
    </span>
  );
}

/**
 * M8i: the clickable tree guide of a nested block. A transparent strip inside the block's left padding (over the 1px line, no layout
 * change) folds or unfolds the folder just above the indent with the SAME state as its header button, so it is remembered and
 * Collapse all | Expand all treat it alike. The header button stays the accessible control: this is aria-hidden and not focusable.
 */
export function NestGuide({
  name,
  open,
  toggle,
}: {
  name: string;
  open: boolean;
  toggle: () => void;
}) {
  const nativeTitle = useNativeTitle();
  return (
    <span
      className={classes.nestGuide}
      data-testid="nest-guide"
      aria-hidden="true"
      tabIndex={-1}
      title={nativeTitle(`${open ? 'Collapse' : 'Expand'} ${name}`)}
      onClick={toggle}
    />
  );
}

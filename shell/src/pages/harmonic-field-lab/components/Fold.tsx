/**
 * Foldable sections of the Chords panel (M8f). `foldId` names a section, `useFold(id)` reads and flips its folded state in
 * `settings.v1` `ui.folds` (remembered per viewer; absent = open; nothing is written until the viewer folds something), and
 * `FoldHead` is the header: a chevron button with `aria-expanded` (Enter and Space work, it is a real button), the title,
 * and the count beside it (kept while folded).
 */
import type { ReactNode } from 'react';
import { MAX_FOLDS, MAX_FOLD_ID } from '../state/persist';
import type { TipKey } from '../texts';
import { ChevronDownIcon } from './icons';
import { Num, Tip, useLab } from './ui';
import classes from './panels.module.css';

/** The storage id of a section: parts joined with `:`, cut to the stored length cap. */
export const foldId = (...parts: string[]): string => parts.join(':').slice(0, MAX_FOLD_ID);

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
    } else if (Object.keys(folds).length < MAX_FOLDS) {
      dispatch({ type: 'ui', patch: { folds: { ...folds, [id]: true } } });
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
  /** `row` is the small label of a family row; `section` (default) is a section header. */
  level?: 'section' | 'row';
  /** Extra text for the accessible name, e.g. the section it belongs to. */
  label?: string;
}

export function FoldHead({ id, tip, title, count, level = 'section', label }: FoldHeadProps) {
  const { folded, toggle } = useFold(id);
  return (
    <span className={classes.foldHead} data-level={level} data-fold={id}>
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

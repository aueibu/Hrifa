/**
 * The chord library dialog (M7b, M7c-b): Scala's named chords grouped by shape, with search and filters, Check (what a chord
 * would find in the subset, nothing added), Add (into the templates), and a ring panel at the bottom that draws the chord you
 * last pointed at or checked. Holds 1, 4 and 5 on a row, a shape heading or a root row play the chord (M7e: 1 the finder's voicing on the ring's root; 4 rounded to the nearest notes and 5 exact, from the Sketch stepper's root unless a root row is chosen). The dialog's search, filters, checks, open
 * shapes and the Field | Subset choice live in the lab state (`ui.lib*`, stored), so closing the dialog or reloading keeps
 * them. The list is ONE table (sticky header; each shape is its own tbody with a spanning heading row; a Check line or
 * folding note is a spanning row under its entry). Rows are drawn only for opened shapes, so the 313 collapsed headings stay cheap.
 */
import {
  Fragment,
  type CSSProperties,
  type ReactNode,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { VisuallyHidden } from '@mantine/core';
import { Splitter } from '../../../components/Stage/Splitter';
import {
  CHORD_LIBRARY_CREDIT,
  FOLD_REASON,
  checkedShapes,
  checkedSummary,
  filterLibrary,
  knownCheckedKeys,
  libraryEntries,
  librarySummary,
  librarySummaryText,
  libraryShapes,
  parseTemplate,
  templateKey,
  type FilteredShape,
  type LibraryEntry,
  type LibraryFilter,
} from '../../../lib/harmonic-field';
import { Button, NativeSelect, NumberInput, Switch, TextInput, ActionIcon } from '../../../ui';
import type { PreviewTarget } from '../audio/plan';
import type { SoundingSnap } from '../state/context';
import { MAX_CHORDS, noteLabel } from '../state/derive';
import { ghostsOf } from '../state/ghosts';
import { checkEntry, checkSentence, type CheckResult } from '../state/libraryCheck';
import {
  dotSounds,
  libraryPreview,
  soundsSignature,
  stepperRootIdx,
} from '../state/libraryPreview';
import { chosenRoot, keepRoot, rootsTitle, shownRoots, togglePin } from '../state/libraryRoots';
import {
  columnOf,
  nextSort,
  sortShapes,
  type LibSort,
  type LibSortColumn,
} from '../state/librarySort';
import { MAX_LIB_CHECKED, type LibCmp, type LibFilters } from '../state/libraryState';
import type { TipKey } from '../texts';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
} from './icons';
import { LibraryRingPanel, type LibraryRootsProps } from './LibraryRing';
import { Hint, Num, Tip, useLab } from './ui';
import classes from './chordLibrary.module.css';
import labClasses from './lab.module.css';

/** The most rows kept checked; a Check beyond it replaces the oldest. */
export const MAX_CHECKED = MAX_LIB_CHECKED;

const RANGE_HINT = `Chords are found for a subset of 2 to ${MAX_CHORDS} notes. Select a few more notes.`;

/** The roots table's place, when the finder does not find the shown chord on the subset at this tolerance. */
export const ROOTS_NONE_TEXT = 'Not found in this subset at this tolerance.';

/** A ratio text (`4:5:6:7`) that can break only after a colon: a long one wraps between its numbers, never inside one. */
function RatioText({ text }: { text: string }) {
  const parts = text.split(':');
  return (
    <Num>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ':'}
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </Num>
  );
}

/** A column header that sorts the table when clicked (the arrow shows the direction; Ratio has a second order, `simplest`). */
function SortHead({
  column,
  label,
  sort,
  onSort,
  className,
}: {
  column: LibSortColumn;
  label: string;
  sort: LibSort | null;
  onSort: (c: LibSortColumn) => void;
  className?: string;
}) {
  const active = sort !== null && columnOf(sort.key) === column ? sort : null;
  return (
    <th
      scope="col"
      className={className}
      data-col={column === 'notes' || column === 'odd' || column === 'prime' ? column : undefined}
      aria-sort={active ? (active.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={classes.sortBtn} onClick={() => onSort(column)}>
        {label}
        {active?.key === 'simplest' && <span className={classes.sortNote}> simplest</span>}
        {active && (
          <span className={classes.sortArrow} aria-hidden="true">
            {active.dir === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </span>
        )}
      </button>
    </th>
  );
}

const NO_SNAP: SoundingSnap = { idx: new Set(), ghosts: [] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The widest ratio text the Ratio column makes room for, in characters; the 15 of 392 entries that are longer wrap over two lines, so the name keeps its room. */
export const RATIO_CH_CAP = 18;

/** The Ratio column's width in characters: the longest ratio text in `entries`, capped at `RATIO_CH_CAP`. */
export function ratioColumnChars(entries: readonly LibraryEntry[]): number {
  let n = 0;
  for (const e of entries) {
    n = Math.max(n, e.text.length);
  }
  return Math.min(n, RATIO_CH_CAP);
}

interface LibButtonProps {
  tip: TipKey;
  label: string;
  aria: string;
  icon: ReactNode;
  /** Why the button does nothing (shown in a Hint); absent = active. */
  off?: string;
  /** The state it stands for is on (a checked row): the icon stays visible and takes the accent, as the shelf's description notepad does. */
  on?: boolean;
  /** A small muted count beside the icon (`Add all`). */
  count?: number;
  onClick: () => void;
}

/**
 * A compact icon button (the shelf's `ActionIcon` look) with its glossary tip. It is invisible until its row is hovered or
 * has focus inside it (CSS, `.rv`); when it cannot act it stays focusable (aria-disabled) and a Hint says why.
 */
function LibButton({ tip, label, aria, icon, off, on, count, onClick }: LibButtonProps) {
  const button = (
    <ActionIcon
      variant="subtle"
      color="gray"
      size={20}
      className={count === undefined ? classes.rv : `${classes.rv} ${classes.countBtn}`}
      data-keep={on ? true : undefined}
      data-has={on ? true : undefined}
      aria-label={aria}
      aria-disabled={off ? true : undefined}
      data-disabled={off ? true : undefined}
      onClick={() => {
        if (!off) {
          onClick();
        }
      }}
    >
      {icon}
      {count !== undefined && <span className={classes.count}>×{count}</span>}
    </ActionIcon>
  );
  return off ? (
    <Hint label={label} dynamic={off}>
      {button}
    </Hint>
  ) : (
    <Tip k={tip} as="control">
      {button}
    </Tip>
  );
}

/** "Already in your templates": a quiet check mark (the words are for a screen reader and the tooltip), so the actions column stays narrow. */
function HaveMark() {
  return (
    <Hint label="In your templates">
      <span className={classes.have}>
        <CheckIcon />
        <VisuallyHidden>in your templates</VisuallyHidden>
      </span>
    </Hint>
  );
}

interface Ctx {
  inRange: boolean;
  /** The entry is already one of your templates (same notes in this repeat; a folding entry too). */
  has: (e: LibraryEntry) => boolean;
  results: ReadonlyMap<string, CheckResult | null>;
  check: (entries: readonly LibraryEntry[]) => void;
  add: (entries: readonly LibraryEntry[]) => void;
  /** The key of the selected chord (set by a click on its row or heading, or by a Check): its row, or its heading while the shape is closed, is marked selected, and the left panel returns to it when the pointer leaves the rows. */
  selected: string | null;
  /** A click on a row or heading selects its chord. */
  select: (e: LibraryEntry) => void;
  /** The pointer or focus reached / left a row: the ring panel shows it and hold 1 plays it. */
  enter: (e: LibraryEntry) => void;
  leave: (e: LibraryEntry) => void;
}

/** The library table's column count: Ratio, Chord, Notes, Odd, Prime, actions. A heading or a note row spans all of them. */
const COLS = 6;

function EntryRow({ e, match, ctx }: { e: LibraryEntry; match: boolean; ctx: Ctx }) {
  const has = ctx.has(e);
  const checked = ctx.results.has(e.key);
  const result = ctx.results.get(e.key);
  // a folding row cannot be checked (the finder skips it here) but it can be added, and it still draws and sounds
  const checkOff = e.folds ? FOLD_REASON : ctx.inRange ? undefined : RANGE_HINT;
  return (
    <>
      <tr
        className={classes.row}
        data-folds={e.folds}
        data-match={match}
        data-selected={ctx.selected === e.key}
        onClick={() => ctx.select(e)}
        onMouseEnter={() => ctx.enter(e)}
        onMouseLeave={() => ctx.leave(e)}
        onFocus={() => ctx.enter(e)}
        onBlur={() => ctx.leave(e)}
      >
        <td className={classes.ratio}>
          <Hint k="libraryRow">
            <span>
              <RatioText text={e.text} />
            </span>
          </Hint>
        </td>
        <td className={classes.chord}>
          <span className={classes.names} data-match={match}>
            {e.names.join(' / ')}
          </span>
          {/* a narrow window hides the three number columns and shows them here (CSS only) */}
          <span className={classes.metaNarrow}>
            · <Num>{e.notes}</Num> notes · odd <Num>{e.oddLimit}</Num> · prime{' '}
            <Num>{e.primeLimit}</Num>
          </span>
        </td>
        <td className={classes.actionsCell}>
          <div className={classes.actions}>
            {has ? (
              <HaveMark />
            ) : (
              <LibButton
                tip="libraryAdd"
                label="Add"
                aria={`Add ${e.text}`}
                icon={<PlusIcon />}
                onClick={() => ctx.add([e])}
              />
            )}
            <LibButton
              tip="libraryCheck"
              label="Check"
              aria={`Check ${e.text}`}
              icon={<SearchIcon />}
              off={checkOff}
              on={checked}
              onClick={() => ctx.check([e])}
            />
          </div>
        </td>
        <td className={classes.numCell} data-col="notes">
          <Num>{e.notes}</Num>
        </td>
        <td className={classes.numCell} data-col="odd">
          <Num>{e.oddLimit}</Num>
        </td>
        <td className={classes.numCell} data-col="prime">
          <Num>{e.primeLimit}</Num>
        </td>
      </tr>
      {!e.folds && checked && (
        <tr className={classes.underRow}>
          <td colSpan={COLS}>
            <span className={classes.under} data-testid="check-line">
              {result ? checkSentence(result) : RANGE_HINT}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

/** A shape as the list draws it: `checked` is set only in the Checked only view (its rows are the checked ones). */
type ShownShape = FilteredShape & {
  checked?: number;
  /** The root position entry, which the heading shows (the entries may be sorted into another order). */
  root?: FilteredShape['entries'][number];
};

interface ShapeProps {
  shape: ShownShape;
  open: boolean;
  onToggle: (id: string, open?: boolean) => void;
  filtersOn: boolean;
  ctx: Ctx;
}

/** What a shape block shows that can change without the shape itself changing: which entries are in the list, which are checked, and each result. */
function shapeSignature({ shape, ctx }: Pick<ShapeProps, 'shape' | 'ctx'>): string {
  return shape.entries
    .map((e) => {
      const r = ctx.results.get(e.key);
      return `${ctx.has(e) ? 1 : 0}${ctx.selected === e.key ? 'S' : ''}${ctx.results.has(e.key) ? (r ? checkSentence(r) : '-') : ''}`;
    })
    .join('|');
}

/** Memoized: a Check or an Add re-draws only the shapes it touches, not all 313 headings. */
const ShapeBlock = memo(
  function ShapeBlock({ shape, open, onToggle, filtersOn, ctx }: ShapeProps) {
    const checkedView = shape.checked !== undefined;
    // the Checked only view lists every shape opened: its heading has nothing to fold
    const toggle = () => {
      if (!checkedView) {
        onToggle(shape.id);
      }
    };
    const root = shape.root ?? shape.entries[0];
    const n = shape.entries.length;
    const matches = shape.entries.filter((e) => e.match).length;
    const usable = shape.entries.filter((e) => !e.folds);
    const allHave = n > 0 && shape.entries.every((e) => ctx.has(e));
    const checkOff = usable.length === 0 ? FOLD_REASON : ctx.inRange ? undefined : RANGE_HINT;
    // a shape with one entry has nothing to open: its entry is listed at the base level, with no heading above it
    if (n === 1) {
      return (
        <tbody>
          <EntryRow e={root} match={root.match} ctx={ctx} />
        </tbody>
      );
    }
    return (
      <tbody aria-label={open ? `Entries of ${root.text}` : undefined}>
        <tr
          className={classes.headRow}
          data-selected={!open && shape.entries.some((e) => e.key === ctx.selected)}
          onClick={() => {
            toggle();
            ctx.select(root);
          }}
          onMouseEnter={() => ctx.enter(root)}
          onMouseLeave={() => ctx.leave(root)}
          onFocus={() => ctx.enter(root)}
          onBlur={() => ctx.leave(root)}
        >
          <td colSpan={COLS} className={classes.headCell}>
            <div className={classes.head}>
              <button
                type="button"
                className={classes.headBtn}
                aria-expanded={open}
                aria-label={`${root.text} ${root.names[0]}`}
              >
                <span className={classes.chevron} data-open={open} aria-hidden="true">
                  <ChevronDownIcon />
                </span>
                <span className={classes.headRatio}>
                  <RatioText text={root.text} />
                </span>
              </button>
              <span className={classes.headNameCell}>
                <span className={classes.headName}>{root.names[0]}</span>{' '}
                <span className={classes.headCount}>
                  {checkedView
                    ? `· ${shape.checked} checked`
                    : `· ${plural(n, 'entry', 'entries')}${
                        filtersOn
                          ? ` · ${matches} ${matches === 1 ? 'entry matches' : 'entries match'}`
                          : ''
                      }`}
                </span>
              </span>
              <span className={classes.headActions} onClick={(e) => e.stopPropagation()}>
                {n > 1 &&
                  (allHave ? (
                    <HaveMark />
                  ) : (
                    <LibButton
                      tip="libraryAdd"
                      label={`Add all ${n}`}
                      aria={`Add all ${n} of ${root.text}`}
                      icon={<PlusIcon />}
                      count={n}
                      onClick={() => ctx.add(shape.entries)}
                    />
                  ))}
                <LibButton
                  tip="libraryCheck"
                  label="Check"
                  aria={`Check all ${n} of ${root.text}`}
                  icon={<SearchIcon />}
                  off={checkOff}
                  on={usable.length > 0 && usable.every((e) => ctx.results.has(e.key))}
                  onClick={() => {
                    ctx.check(usable);
                    if (!open) {
                      onToggle(shape.id, true);
                    }
                  }}
                />
              </span>
            </div>
          </td>
        </tr>
        {open && shape.entries.map((e) => <EntryRow key={e.key} e={e} match={e.match} ctx={ctx} />)}
      </tbody>
    );
  },
  (a, b) =>
    a.shape === b.shape &&
    a.open === b.open &&
    a.filtersOn === b.filtersOn &&
    a.onToggle === b.onToggle &&
    a.ctx.inRange === b.ctx.inRange &&
    a.ctx.check === b.ctx.check &&
    a.ctx.add === b.ctx.add &&
    a.ctx.enter === b.ctx.enter &&
    a.ctx.select === b.ctx.select &&
    a.ctx.leave === b.ctx.leave &&
    shapeSignature(a) === shapeSignature(b)
);

const toNum = (v: string | number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function NumBox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
}) {
  return (
    <NumberInput
      size="xs"
      className={classes.numBox}
      aria-label={label}
      placeholder={placeholder}
      hideControls
      allowDecimal={false}
      allowNegative={false}
      min={1}
      value={value ?? ''}
      onChange={(v) => onChange(toNum(v))}
    />
  );
}

/** The key a folding entry's template has in the user's list (the same `templateKey` the reducer's duplicate rule uses). */
function templateKeyOf(text: string, repC: number): string {
  const pt = parseTemplate(text);
  return pt.ok ? templateKey(pt, repC) : '';
}

/** The ring panel's width limits and keyboard step, in rem (the splitter between the ring and the list). */
export const SPLIT_MIN_REM = 20;
export const SPLIT_MAX_REM = 64;
const SPLIT_STEP_REM = 2;
const clampSplit = (rem: number) => Math.min(SPLIT_MAX_REM, Math.max(SPLIT_MIN_REM, rem));

/** The body of the "Chord library" modal. */
export function ChordLibrary() {
  const lab = useLab();
  const { state, dispatch, base, audio } = lab;
  // While this dialog is open its sounding lights stay in the dialog: the lab-wide report (which every view behind the dialog listens
  // to) is held back, and the ring reads the audio hook's own channel. A sweep with a key held starts a sound per note, and a
  // lab-wide redraw per note made the sweep skip dots.
  const audioRef = useRef(audio);
  audioRef.current = audio;
  useEffect(() => {
    audioRef.current.setLightSuppressed?.(true);
    return () => audioRef.current.setLightSuppressed?.(false);
  }, []);
  const subscribeLight = useCallback(
    (cb: () => void) => audio.subscribeSounding?.(cb) ?? (() => {}),
    [audio]
  );
  const snapLight = useCallback(() => audio.soundingSnapshot?.() ?? NO_SNAP, [audio]);
  const liveLight = useSyncExternalStore(subscribeLight, snapLight);
  const ownLight = audio.soundingSnapshot !== undefined;
  const litSet = ownLight ? liveLight.idx : lab.sounding;
  const litGhosts = useMemo(
    () => ghostsOf(base.field, base.repC, ownLight ? liveLight.ghosts : lab.soundingGhosts),
    [base.field, base.repC, ownLight, liveLight.ghosts, lab.soundingGhosts]
  );
  // the ring panel's width (rem): dragged here, kept in the lab's settings a moment after the pointer stops
  const [split, setSplit] = useState(() => clampSplit(state.ui.libSplit));
  const splitRef = useRef(split);
  splitRef.current = split;
  useEffect(() => {
    if (Math.abs(split - state.ui.libSplit) < 0.01) {
      return;
    }
    const t = setTimeout(() => dispatch({ type: 'ui', patch: { libSplit: split } }), 300);
    return () => clearTimeout(t);
  }, [split, state.ui.libSplit, dispatch]);
  const repC = base.repC;
  const entries = useMemo(() => libraryEntries(repC), [repC]);
  const shapes = useMemo(() => libraryShapes(entries, repC), [entries, repC]);
  const summary = useMemo(() => librarySummary(shapes), [shapes]);
  const byKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries]);
  const ratioCh = useMemo(() => ratioColumnChars(entries), [entries]);
  /** Families by how many entries they hold (the largest first), `Library` last. */
  const families = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) {
      count.set(e.family, (count.get(e.family) ?? 0) + 1);
    }
    return [...count.entries()].sort(
      (a, b) => Number(a[0] === 'Library') - Number(b[0] === 'Library') || b[1] - a[1]
    );
  }, [entries]);

  // the dialog's state is the lab's (stored): closing the dialog unmounts this component and loses nothing
  const f = state.ui.libFilters;
  const cmp = state.ui.libCmp;
  const patch = useCallback(
    (p: Partial<LibFilters>) => dispatch({ type: 'lib/filters', patch: p }),
    [dispatch]
  );
  const filters = useDeferredValue(f);
  const filter = useMemo<LibraryFilter>(
    () => ({
      search: filters.search,
      notesMin: filters.notesMin,
      notesMax: filters.notesMax,
      oddMax: filters.oddMax,
      primeMax: filters.primeMax,
      family: filters.family,
    }),
    [filters]
  );
  const filtersOn =
    filter.search?.trim() !== '' ||
    [filter.notesMin, filter.notesMax, filter.oddMax, filter.primeMax].some((x) => x != null) ||
    !!filter.family;
  // checks recompute from the subset as it is now; a key the library no longer has is dropped here
  const checkedKeys = useMemo(
    () => knownCheckedKeys(entries, state.ui.libChecked),
    [entries, state.ui.libChecked]
  );
  const checkedOnly = filters.checkedOnly;
  const shown = useMemo<ShownShape[]>(
    () =>
      sortShapes(
        checkedOnly ? checkedShapes(shapes, checkedKeys, filter) : filterLibrary(shapes, filter),
        state.ui.libSort
      ),
    [shapes, filter, checkedOnly, checkedKeys, state.ui.libSort]
  );
  const openSet = useMemo(() => new Set(state.ui.libOpen), [state.ui.libOpen]);

  // templates already in the user's list (same notes in this repeat)
  const have = useMemo(() => {
    const keys = new Set<string>();
    for (const t of state.templates) {
      const k = templateKeyOf(t.text, repC);
      if (k) {
        keys.add(k);
      }
    }
    return keys;
  }, [state.templates, repC]);
  const hasEntry = useCallback(
    (e: LibraryEntry) => have.has(e.folds ? templateKeyOf(e.text, repC) : e.key),
    [have, repC]
  );

  const inRange = base.rel.length >= 2 && base.rel.length <= MAX_CHORDS;
  const tol = state.ui.tol;
  // every checked row is recomputed from the current subset, mode and tolerance: never stale text
  const results = useMemo(() => {
    const m = new Map<string, CheckResult | null>();
    for (const k of checkedKeys) {
      const e = byKey.get(k);
      if (e) {
        m.set(k, checkEntry(base, e, tol));
      }
    }
    return m;
  }, [checkedKeys, byKey, base, tol]);

  /** The chord the ring panel shows: the last row pointed at or checked (runtime only; leaving a row keeps it). */
  const [shownKey, setShownKey] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  // M7d: the root row pinned (click) or previewed (pointer on it) in "found on N roots"; field indices, runtime only
  const [pinned, setPinned] = useState<number | null>(null);
  const [hoverRoot, setHoverRoot] = useState<number | null>(null);
  const hoverRootRef = useRef<number | null>(null);
  // the field dot of the ring panel the pointer is on (a field index, runtime only): hold 1, 4 or 5 there plays that note, or the shown chord rooted on it
  // the ring dot the pointer is on: a ref, not state, so pointing at a dot does not re-render this whole dialog (the effect below reads it when something else changes)
  const hoverDotRef = useRef<number | null>(null);
  const pinRef = useRef<number | null>(null);
  /** Shows a chord (a hover, a focus, a click or a Check); a new chord resets the previewed root. The pin belongs to the SELECTED chord only (see `select`). */
  const show = useCallback((key: string) => {
    if (shownRef.current !== key) {
      shownRef.current = key;
      setShownKey(key);
      setHoverRoot(null);
    }
  }, []);
  // the selected chord: a click on its row or heading (or a Check) keeps it in the left panel; hovering other rows shows them for as long as the pointer is on them, then the panel returns to it
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Selects a chord and shows it; selecting another chord (or any Check) resets the root pin. */
  const select = useCallback(
    (key: string, resetPin = false) => {
      if (selectedRef.current !== key || resetPin) {
        setPinned(null);
      }
      selectedRef.current = key;
      setSelectedKey(key);
      show(key);
    },
    [show]
  );
  const selectEntry = useCallback((e: LibraryEntry) => select(e.key), [select]);

  // stable callbacks, so a memoized shape block is not redrawn just because the parent was
  const check = useCallback(
    (list: readonly LibraryEntry[]) => {
      const usable = list.filter((e) => !e.folds);
      dispatch({ type: 'lib/check', keys: usable.map((e) => e.key) });
      const last = usable[usable.length - 1];
      if (last) {
        // a Check selects the chord and resets the pin, even on the chord already selected
        select(last.key, true);
      }
    },
    [dispatch, select]
  );
  const add = useCallback(
    (list: readonly LibraryEntry[]) => dispatch({ type: 'templates/addLibrary', entries: list }),
    [dispatch]
  );
  const toggle = useCallback(
    (id: string, open?: boolean) => dispatch({ type: 'lib/open', id, open }),
    [dispatch]
  );
  // Expand all opens every listed shape (and keeps the ones already open); Collapse all closes every shape
  const expandAll = () =>
    dispatch({
      type: 'lib/openSet',
      // only shapes with several entries open and close; a single entry is always listed
      ids: [...state.ui.libOpen, ...shown.filter((s) => s.entries.length > 1).map((s) => s.id)],
    });
  const collapseAll = () => dispatch({ type: 'lib/openSet', ids: [] });
  // a click on a column header: the next sort in that column's cycle (see `nextSort`)
  const sortBy = (c: LibSortColumn) =>
    dispatch({ type: 'ui', patch: { libSort: nextSort(state.ui.libSort, c) } });

  // holds 1, 4 and 5 on a row: its three sounds from the ring's root, through the same hover target as a shelf slot
  const stepper = stepperRootIdx(base, state.shelf.sketch.rootDeg);
  // M7d: the shown chord's roots (the finder runs for it without Check: the row is NOT checked) and the root chosen on them
  const shownEntry = shownKey ? byKey.get(shownKey) : undefined;
  const rootsView = useMemo(
    () => (shownEntry ? shownRoots(base, shownEntry, tol) : null),
    [base, shownEntry, tol]
  );
  // the pin applies only while the selected chord is the one shown (hovering another row shows that one on its own root)
  const onSelected = shownKey !== null && shownKey === selectedKey;
  const pinnedRoot = keepRoot(onSelected ? pinned : null, rootsView);
  const override = chosenRoot(hoverRoot, onSelected ? pinned : null, rootsView);
  useEffect(() => {
    pinRef.current = pinnedRoot;
    // the subset or the tolerance no longer finds the pinned root: the pin is dropped for good
    if (onSelected && pinned !== null && pinnedRoot === null) {
      setPinned(null);
    }
  }, [pinned, pinnedRoot, onSelected]);
  const targetOf = useCallback(
    (e: LibraryEntry, root?: number | null): PreviewTarget | null => {
      // M7e: holds 1, 4 and 5 play the row's own, rounded and exact sets: 1 from the root the ring shows, 4 and 5 from the Sketch
      // stepper's root (`stepper`, in this callback's deps) unless `root` (a hovered or pinned root row) is chosen; the rounding
      // uses the ring's Field | Subset switch. The key carries what the sets are, so a held key follows a change under a resting pointer.
      const p = libraryPreview(base, e, stepper, tol, cmp, root);
      return p
        ? {
            kind: 'pitches',
            key: `${p.targetKey}:${soundsSignature(p.sounds)}`,
            cents: p.sounds.exact,
            variants: p.sounds,
          }
        : null;
    },
    [base, stepper, tol, cmp]
  );
  // a pointer on a field dot of the ring panel: hold 1 plays that note, holds 4 and 5 the SHOWN chord rooted on it (a dot is an
  // explicit root choice: the Sketch stepper is not read), rounded to the ring's Field | Subset set or exact. No chord shown: only hold 1.
  const dotTarget = useCallback(
    (idx: number): PreviewTarget | null => {
      const s = dotSounds(base, shownEntry, idx, cmp);
      return s
        ? {
            kind: 'pitches',
            key: `lib:dot:${shownEntry?.key ?? 'none'}:${idx}:${soundsSignature(s)}`,
            cents: s.own,
            variants: s,
          }
        : null;
    },
    [base, shownEntry, cmp]
  );
  const targetRef = useRef(targetOf);
  // the latest dot target and entry lookup, for the handlers that must set the target the moment the pointer arrives
  const dotTargetRef = useRef(dotTarget);
  const byKeyRef = useRef(byKey);
  const hovered = useRef<string | null>(null);
  const lastTarget = useRef<PreviewTarget | null>(null);
  useEffect(() => {
    targetRef.current = targetOf;
    dotTargetRef.current = dotTarget;
    byKeyRef.current = byKey;
    // the root, the subset, the tolerance or the chosen root changed under a resting pointer: hold 1 must play the new chord.
    // A pointer on a ring dot plays that note and the shown chord on it; on a root row, the shown chord on that root; on a library row, that row's chord (on the pin when it is the shown one)
    let t: PreviewTarget | null = null;
    if (hoverDotRef.current !== null) {
      t = dotTarget(hoverDotRef.current);
    } else if (hoverRoot !== null && shownEntry) {
      t = targetOf(shownEntry, hoverRoot);
    } else {
      const e = hovered.current ? byKey.get(hovered.current) : undefined;
      t = e ? targetOf(e, e.key === shownKey ? pinnedRoot : null) : null;
    }
    if (t) {
      lastTarget.current = t;
      audio.setPreviewTarget(t);
    }
  }, [targetOf, dotTarget, byKey, audio, hoverRoot, shownEntry, shownKey, pinnedRoot]);
  const enter = useCallback(
    (e: LibraryEntry) => {
      hovered.current = e.key;
      if (revertTimer.current) {
        clearTimeout(revertTimer.current);
        revertTimer.current = null;
      }
      // the pin only holds for the selected chord it was made on
      const pin = selectedRef.current === e.key ? pinRef.current : null;
      show(e.key);
      const t = targetRef.current(e, pin);
      if (t) {
        lastTarget.current = t;
        audio.setPreviewTarget(t);
      }
    },
    [audio, show]
  );
  // a root row: the target is set NOW (as a list row does), so a key pressed right after the pointer arrives is not missed; the effect keeps it current afterwards
  const rootEnter = useCallback(
    (idx: number) => {
      hoverRootRef.current = idx;
      setHoverRoot(idx);
      const e = shownRef.current ? byKeyRef.current.get(shownRef.current) : undefined;
      const t = e ? targetRef.current(e, idx) : null;
      if (t) {
        lastTarget.current = t;
        audio.setPreviewTarget(t);
      }
    },
    [audio]
  );
  const rootLeave = useCallback(
    (idx: number) => {
      if (hoverRootRef.current === idx) {
        hoverRootRef.current = null;
      }
      setHoverRoot((h) => (h === idx ? null : h));
      if (lastTarget.current) {
        audio.clearPreviewTarget(lastTarget.current);
      }
    },
    [audio]
  );
  // a ring dot: the same, the target is set the moment the pointer arrives
  const dotEnter = useCallback(
    (idx: number) => {
      hoverDotRef.current = idx;
      const t = dotTargetRef.current(idx);
      if (t) {
        lastTarget.current = t;
        audio.setPreviewTarget(t);
      }
    },
    [audio]
  );
  const dotLeave = useCallback(
    (idx: number) => {
      if (hoverDotRef.current === idx) {
        hoverDotRef.current = null;
      }
      if (lastTarget.current) {
        audio.clearPreviewTarget(lastTarget.current);
      }
    },
    [audio]
  );
  const rootToggle = useCallback((idx: number) => {
    if (selectedRef.current !== shownRef.current) {
      // pinning a root selects the chord the panel is showing
      selectedRef.current = shownRef.current;
      setSelectedKey(shownRef.current);
      setPinned(idx);
    } else {
      setPinned((p) => togglePin(p, idx));
    }
  }, []);
  const leave = useCallback(
    (e: LibraryEntry) => {
      if (hovered.current === e.key) {
        hovered.current = null;
      }
      if (lastTarget.current) {
        audio.clearPreviewTarget(lastTarget.current);
      }
      // off the rows, the left panel goes back to the selected chord (a tick later, so moving from one row to the next does not flash it)
      if (selectedRef.current && shownRef.current !== selectedRef.current) {
        if (revertTimer.current) {
          clearTimeout(revertTimer.current);
        }
        revertTimer.current = setTimeout(() => {
          revertTimer.current = null;
          if (selectedRef.current && hovered.current === null) {
            show(selectedRef.current);
          }
        }, 0);
      }
    },
    [audio, show]
  );
  // closing the dialog with the pointer on a row must not leave its chord armed for hold 1
  useEffect(
    () => () => {
      if (revertTimer.current) {
        clearTimeout(revertTimer.current);
      }
      if (
        (hovered.current || hoverRootRef.current !== null || hoverDotRef.current !== null) &&
        lastTarget.current
      ) {
        audio.clearPreviewTarget(lastTarget.current);
      }
    },
    [audio]
  );

  const ctx: Ctx = {
    inRange,
    has: hasEntry,
    results,
    check,
    add,
    enter,
    leave,
    selected: selectedKey,
    select: selectEntry,
  };

  const preview = useMemo(
    () => (shownEntry ? libraryPreview(base, shownEntry, stepper, tol, cmp, override) : null),
    [base, shownEntry, stepper, tol, cmp, override]
  );
  const roots: LibraryRootsProps | null =
    shownEntry && rootsView && rootsView.kind !== 'fold'
      ? {
          title: rootsView.kind === 'found' ? rootsTitle(rootsView.hits.length) : '',
          rows:
            rootsView.kind === 'found'
              ? rootsView.hits.map((h) => ({
                  idx: h.rootIdx,
                  root: h.root,
                  worst: h.worst,
                  avg: h.avg,
                }))
              : [],
          message:
            rootsView.kind === 'found'
              ? null
              : rootsView.kind === 'none'
                ? ROOTS_NONE_TEXT
                : RANGE_HINT,
          pinned: pinnedRoot,
          onEnter: rootEnter,
          onLeave: rootLeave,
          onToggle: rootToggle,
        }
      : null;

  const note = state.templateNote;
  const summaryText = checkedOnly
    ? checkedSummary(shown.map((s) => ({ ...s, checked: s.checked ?? 0 })))
    : librarySummaryText(summary);

  return (
    <div className={classes.lib} style={{ '--lib-left': `${split}rem` } as CSSProperties}>
      <LibraryRingPanel
        ring={preview?.ring ?? null}
        title={shownEntry ? shownEntry.names[0] : null}
        ratio={shownEntry ? shownEntry.text : null}
        onTitleEnter={shownEntry ? () => enter(shownEntry) : undefined}
        onTitleLeave={shownEntry ? () => leave(shownEntry) : undefined}
        rootText={preview ? noteLabel(preview.root.root) : null}
        cmp={cmp}
        onCmp={(c: LibCmp) => dispatch({ type: 'lib/cmp', cmp: c })}
        roots={roots}
        onDotEnter={dotEnter}
        onDotLeave={dotLeave}
        sounding={litSet}
        ghosts={litGhosts}
      />
      <Splitter
        orientation="vertical"
        label="Resize the ring panel"
        valueNow={Math.round(split)}
        valueMin={SPLIT_MIN_REM}
        valueMax={SPLIT_MAX_REM}
        valueText={`${Math.round(split)} rem wide`}
        keys={['ArrowLeft', 'ArrowRight', 'Home', 'End']}
        onKey={(key) =>
          setSplit((w) =>
            clampSplit(
              key === 'Home'
                ? SPLIT_MIN_REM
                : key === 'End'
                  ? SPLIT_MAX_REM
                  : w + (key === 'ArrowRight' ? SPLIT_STEP_REM : -SPLIT_STEP_REM)
            )
          )
        }
        onDragStart={() => {
          const start = splitRef.current;
          const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
          return (dx) => setSplit(clampSplit(start + dx / remPx));
        }}
      />
      <div className={classes.main}>
        <div className={classes.credit}>{CHORD_LIBRARY_CREDIT}</div>
        <div className={classes.summary}>{summaryText}</div>
        <div className={classes.msg} aria-live="polite">
          {note && (
            <span
              className={labClasses.fieldMsg}
              data-kind={note.refused ? 'err' : 'note'}
              role={note.refused ? 'alert' : 'status'}
            >
              {note.text}
            </span>
          )}
        </div>
        <div className={classes.controls} role="group" aria-label="Chord library filters">
          <span className={classes.group}>
            <Tip k="libraryFilters">Filters</Tip>
          </span>
          <span className={classes.group}>
            <span className={classes.groupLabel}>Search:</span>
            <TextInput
              size="xs"
              className={classes.search}
              aria-label="Search chords"
              placeholder="name or ratio"
              value={f.search}
              onChange={(e) => patch({ search: e.currentTarget.value })}
            />
          </span>
          <span className={classes.group}>
            <span className={classes.groupLabel}>Cardinality:</span>
            <NumBox
              label="Cardinality min"
              placeholder="min"
              value={f.notesMin}
              onChange={(n) => patch({ notesMin: n })}
            />
            <NumBox
              label="Cardinality max"
              placeholder="max"
              value={f.notesMax}
              onChange={(n) => patch({ notesMax: n })}
            />
          </span>
          <span className={classes.group}>
            <span className={classes.groupLabel}>Odd limit up to:</span>
            <NumBox
              label="Odd limit up to"
              value={f.oddMax}
              onChange={(n) => patch({ oddMax: n })}
            />
          </span>
          <span className={classes.group}>
            <span className={classes.groupLabel}>Prime limit up to:</span>
            <NumBox
              label="Prime limit up to"
              value={f.primeMax}
              onChange={(n) => patch({ primeMax: n })}
            />
          </span>
          <span className={classes.group}>
            <span className={classes.groupLabel}>Family:</span>
            <NativeSelect
              size="xs"
              className={classes.family}
              aria-label="Family"
              value={f.family}
              onChange={(e) => patch({ family: e.currentTarget.value })}
              data={[
                { value: '', label: `All (${entries.length})` },
                ...families.map(([name, n]) => ({ value: name, label: `${name} (${n})` })),
              ]}
            />
          </span>
          <Tip k="libraryFilters" as="control">
            <Switch
              size="xs"
              label="Checked only"
              checked={f.checkedOnly}
              onChange={(e) => patch({ checkedOnly: e.currentTarget.checked })}
            />
          </Tip>
          {!checkedOnly && (
            <>
              <Tip k="libraryExpandAll" as="control">
                <Button
                  size="compact-xs"
                  variant="default"
                  aria-label="Expand all shapes"
                  onClick={expandAll}
                >
                  Expand all
                </Button>
              </Tip>
              <Tip k="libraryCollapseAll" as="control">
                <Button
                  size="compact-xs"
                  variant="default"
                  aria-label="Collapse all shapes"
                  onClick={collapseAll}
                >
                  Collapse all
                </Button>
              </Tip>
            </>
          )}
          {checkedKeys.length > 0 && (
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => dispatch({ type: 'lib/clearChecks' })}
              aria-label={`Clear checks (${checkedKeys.length})`}
            >
              Clear checks ({checkedKeys.length})
            </Button>
          )}
        </div>
        {filtersOn && (
          <span className={classes.shown} role="status">
            {plural(shown.length, 'shape', 'shapes')} match
          </span>
        )}
        {!inRange && (
          <span className={labClasses.fieldMsg} role="status">
            {RANGE_HINT}
          </span>
        )}
        <div className={classes.list}>
          <table
            className={classes.table}
            aria-label="Chord library shapes"
            style={{ '--lib-ratio-ch': ratioCh } as CSSProperties}
          >
            <colgroup>
              <col className={classes.colRatio} />
              <col />
              <col className={classes.colActions} />
              <col className={classes.colNum} data-col="notes" />
              <col className={classes.colNum} data-col="odd" />
              <col className={classes.colNum} data-col="prime" />
            </colgroup>
            <thead>
              <tr>
                <SortHead column="ratio" label="Ratio" sort={state.ui.libSort} onSort={sortBy} />
                <SortHead column="name" label="Chord" sort={state.ui.libSort} onSort={sortBy} />
                <th scope="col">
                  <VisuallyHidden>Actions</VisuallyHidden>
                </th>
                <SortHead
                  column="notes"
                  label="Notes"
                  sort={state.ui.libSort}
                  onSort={sortBy}
                  className={classes.numHead}
                />
                <SortHead
                  column="odd"
                  label="Odd"
                  sort={state.ui.libSort}
                  onSort={sortBy}
                  className={classes.numHead}
                />
                <SortHead
                  column="prime"
                  label="Prime"
                  sort={state.ui.libSort}
                  onSort={sortBy}
                  className={classes.numHead}
                />
              </tr>
            </thead>
            {shown.map((s) => (
              <ShapeBlock
                key={s.id}
                shape={s}
                open={checkedOnly || openSet.has(s.id)}
                onToggle={toggle}
                filtersOn={filtersOn && !checkedOnly}
                ctx={ctx}
              />
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * The chord library dialog (M7b): Scala's named chords grouped by shape, with search and filters, Check (what a chord would
 * find in the current notes, nothing added) and Add (into the templates). Fold and checked state live here, not in storage.
 * Rows are drawn only for opened shapes, so the 313 collapsed headings stay cheap.
 */
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Button, NativeSelect, NumberInput, TextInput } from '@mantine/core';
import {
  CHORD_LIBRARY_CREDIT,
  FOLD_REASON,
  filterLibrary,
  libraryEntries,
  librarySummary,
  libraryShapes,
  parseTemplate,
  templateKey,
  type FilteredShape,
  type LibraryEntry,
  type LibraryFilter,
} from '../../../lib/harmonic-field';
import { MAX_CHORDS } from '../state/derive';
import { checkEntry, checkSentence, type CheckResult } from '../state/libraryCheck';
import type { TipKey } from '../texts';
import { ChevronDownIcon } from './icons';
import { Hint, Num, Tip, useLab } from './ui';
import classes from './chordLibrary.module.css';
import labClasses from './lab.module.css';

/** The most rows kept checked; a Check beyond it replaces the oldest. */
export const MAX_CHECKED = 40;

const RANGE_HINT = `Chords are found for a subset of 2 to ${MAX_CHORDS} notes. Select a few more notes.`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface LibButtonProps {
  tip: TipKey;
  label: string;
  aria: string;
  /** Why the button does nothing (shown in a Hint); absent = active. */
  off?: string;
  onClick: () => void;
}

/** A compact button with its glossary tip; when it cannot act it stays focusable (aria-disabled) and a Hint says why. */
function LibButton({ tip, label, aria, off, onClick }: LibButtonProps) {
  const button = (
    <Button
      size="compact-xs"
      variant="default"
      aria-label={aria}
      aria-disabled={off ? true : undefined}
      data-disabled={off ? true : undefined}
      onClick={() => {
        if (!off) {
          onClick();
        }
      }}
    >
      {label}
    </Button>
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

interface Ctx {
  inRange: boolean;
  have: ReadonlySet<string>;
  results: ReadonlyMap<string, CheckResult | null>;
  check: (entries: readonly LibraryEntry[]) => void;
  add: (entries: readonly LibraryEntry[]) => void;
}

function EntryRow({ e, match, ctx }: { e: LibraryEntry; match: boolean; ctx: Ctx }) {
  const has = !e.folds && ctx.have.has(e.key);
  const checked = ctx.results.has(e.key);
  const result = ctx.results.get(e.key);
  const checkOff = e.folds ? FOLD_REASON : ctx.inRange ? undefined : RANGE_HINT;
  return (
    <li className={classes.row} data-folds={e.folds} data-match={match}>
      <span className={classes.ratio}>
        <Num>{e.text}</Num>
      </span>{' '}
      <span>
        <span className={classes.names} data-match={match}>
          {e.names.join(' / ')}
        </span>{' '}
        <span className={classes.meta}>
          · <Num>{e.notes}</Num> notes · odd <Num>{e.oddLimit}</Num> · prime{' '}
          <Num>{e.primeLimit}</Num>
        </span>
      </span>
      <span className={classes.actions}>
        <LibButton
          tip="libraryCheck"
          label="Check"
          aria={`Check ${e.text}`}
          off={checkOff}
          onClick={() => ctx.check([e])}
        />
        {has ? (
          <span className={classes.have}>in your templates</span>
        ) : (
          <LibButton
            tip="libraryAdd"
            label="Add"
            aria={`Add ${e.text}`}
            off={e.folds ? FOLD_REASON : undefined}
            onClick={() => ctx.add([e])}
          />
        )}
      </span>
      {e.folds && <span className={classes.under}>{FOLD_REASON}</span>}
      {checked && !e.folds && (
        <span className={classes.under} data-testid="check-line">
          {result ? checkSentence(result) : RANGE_HINT}
        </span>
      )}
    </li>
  );
}

interface ShapeProps {
  shape: FilteredShape;
  open: boolean;
  onToggle: (id: string) => void;
  filtersOn: boolean;
  ctx: Ctx;
}

/** What a shape block shows that can change without the shape itself changing: which entries are in the list, which are checked, and each result. */
function shapeSignature({ shape, ctx }: Pick<ShapeProps, 'shape' | 'ctx'>): string {
  return shape.entries
    .map((e) => {
      const r = ctx.results.get(e.key);
      return `${ctx.have.has(e.key) ? 1 : 0}${ctx.results.has(e.key) ? (r ? checkSentence(r) : '-') : ''}`;
    })
    .join('|');
}

/** Memoized: a Check or an Add re-draws only the shapes it touches, not all 313 headings. */
const ShapeBlock = memo(
  function ShapeBlock({ shape, open, onToggle, filtersOn, ctx }: ShapeProps) {
    const toggle = () => onToggle(shape.id);
    const root = shape.entries[0];
    const n = shape.entries.length;
    const matches = shape.entries.filter((e) => e.match).length;
    const usable = shape.entries.filter((e) => !e.folds);
    const allHave =
      usable.length > 0 && usable.length === n && shape.entries.every((e) => ctx.have.has(e.key));
    const checkOff = usable.length === 0 ? FOLD_REASON : ctx.inRange ? undefined : RANGE_HINT;
    return (
      <li className={classes.shape}>
        <div className={classes.head}>
          <button type="button" className={classes.headBtn} aria-expanded={open} onClick={toggle}>
            <span className={classes.chevron} data-open={open} aria-hidden="true">
              <ChevronDownIcon />
            </span>
            <span className={classes.headRatio}>
              <Num>{root.text}</Num>
            </span>{' '}
            <span className={classes.headName}>{root.names[0]}</span>{' '}
            <span className={classes.headCount}>
              · {plural(n, 'entry', 'entries')}
              {filtersOn && ` · ${matches} ${matches === 1 ? 'entry matches' : 'entries match'}`}
            </span>
          </button>
          <LibButton
            tip="libraryCheck"
            label="Check"
            aria={`Check all ${n} of ${root.text}`}
            off={checkOff}
            onClick={() => {
              ctx.check(usable);
              if (!open) {
                toggle();
              }
            }}
          />
          {n > 1 &&
            (allHave ? (
              <span className={classes.have}>in your templates</span>
            ) : (
              <LibButton
                tip="libraryAdd"
                label={`Add all ${n}`}
                aria={`Add all ${n} of ${root.text}`}
                onClick={() => ctx.add(shape.entries)}
              />
            ))}
        </div>
        {open && (
          <ul className={classes.rows} aria-label={`Entries of ${root.text}`}>
            {shape.entries.map((e) => (
              <EntryRow key={e.key} e={e} match={e.match} ctx={ctx} />
            ))}
          </ul>
        )}
      </li>
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

/** The body of the "Chord library" modal. */
export function ChordLibrary() {
  const { state, dispatch, base } = useLab();
  const repC = base.repC;
  const entries = useMemo(() => libraryEntries(repC), [repC]);
  const shapes = useMemo(() => libraryShapes(entries, repC), [entries, repC]);
  const summary = useMemo(() => librarySummary(shapes), [shapes]);
  const byKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries]);
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

  const [search, setSearch] = useState('');
  const [notesMin, setNotesMin] = useState<number | null>(null);
  const [notesMax, setNotesMax] = useState<number | null>(null);
  const [oddMax, setOddMax] = useState<number | null>(null);
  const [primeMax, setPrimeMax] = useState<number | null>(null);
  const [family, setFamily] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [checked, setChecked] = useState<readonly string[]>([]);

  const filter = useDeferredValue<LibraryFilter>({
    search,
    notesMin,
    notesMax,
    oddMax,
    primeMax,
    family,
  });
  const filtersOn =
    filter.search?.trim() !== '' ||
    [filter.notesMin, filter.notesMax, filter.oddMax, filter.primeMax].some((x) => x != null) ||
    !!filter.family;
  const shown = useMemo(() => filterLibrary(shapes, filter), [shapes, filter]);

  // templates already in the user's list (same notes in this repeat)
  const have = useMemo(() => {
    const keys = new Set<string>();
    for (const t of state.templates) {
      const pt = parseTemplate(t.text);
      if (pt.ok) {
        keys.add(templateKey(pt, repC));
      }
    }
    return keys;
  }, [state.templates, repC]);

  const inRange = base.rel.length >= 2 && base.rel.length <= MAX_CHORDS;
  const tol = state.ui.tol;
  // every checked row is recomputed from the current notes, mode and tolerance: never stale text
  const results = useMemo(() => {
    const m = new Map<string, CheckResult | null>();
    for (const k of checked) {
      const e = byKey.get(k);
      if (e && !e.folds) {
        m.set(k, checkEntry(base, e, tol));
      }
    }
    return m;
  }, [checked, byKey, base, tol]);

  // stable callbacks, so a memoized shape block is not redrawn just because the parent was
  const check = useCallback(
    (list: readonly LibraryEntry[]) =>
      setChecked((prev) => {
        const keys = list.filter((e) => !e.folds).map((e) => e.key);
        const next = [...prev.filter((k) => !keys.includes(k)), ...keys];
        return next.slice(Math.max(0, next.length - MAX_CHECKED));
      }),
    []
  );
  const add = useCallback(
    (list: readonly LibraryEntry[]) => dispatch({ type: 'templates/addLibrary', entries: list }),
    [dispatch]
  );
  const ctx: Ctx = { inRange, have, results, check, add };

  const toggle = useCallback(
    (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) {
          next.add(id);
        }
        return next;
      }),
    []
  );

  const note = state.templateNote;
  const summaryText =
    `${plural(summary.entries, 'chord', 'chords')} in ${plural(summary.rooted, 'shape', 'shapes')} ` +
    `(${plural(summary.lines, 'name', 'names')} in Scala's list)` +
    (summary.folding > 0 ? `; ${summary.folding} cannot be found in this repeat` : '');

  return (
    <div className={classes.lib}>
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
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </span>
        <span className={classes.group}>
          <span className={classes.groupLabel}>Cardinality:</span>
          <NumBox
            label="Cardinality min"
            placeholder="min"
            value={notesMin}
            onChange={setNotesMin}
          />
          <NumBox
            label="Cardinality max"
            placeholder="max"
            value={notesMax}
            onChange={setNotesMax}
          />
        </span>
        <span className={classes.group}>
          <span className={classes.groupLabel}>Odd limit up to:</span>
          <NumBox label="Odd limit up to" value={oddMax} onChange={setOddMax} />
        </span>
        <span className={classes.group}>
          <span className={classes.groupLabel}>Prime limit up to:</span>
          <NumBox label="Prime limit up to" value={primeMax} onChange={setPrimeMax} />
        </span>
        <span className={classes.group}>
          <span className={classes.groupLabel}>Family:</span>
          <NativeSelect
            size="xs"
            className={classes.family}
            aria-label="Family"
            value={family}
            onChange={(e) => setFamily(e.currentTarget.value)}
            data={[
              { value: '', label: `All (${entries.length})` },
              ...families.map(([name, n]) => ({ value: name, label: `${name} (${n})` })),
            ]}
          />
        </span>
        {checked.length > 0 && (
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => setChecked([])}
            aria-label="Clear checks"
          >
            Clear checks
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
      <ul className={classes.list} aria-label="Chord library shapes">
        {shown.map((s) => (
          <ShapeBlock
            key={s.id}
            shape={s}
            open={open.has(s.id)}
            onToggle={toggle}
            filtersOn={filtersOn}
            ctx={ctx}
          />
        ))}
      </ul>
    </div>
  );
}

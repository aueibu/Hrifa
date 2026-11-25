/**
 * Positional chords (M9, H-9; M8f), the UI: the "Positional" section of the Chords panel (every pattern a foldable group, each
 * ranked among itself, one position per full-width row) and the "Positional patterns" editor inside the template editor. The
 * chords come from the lib (`positionalChords`, `rankPositional`, `positionalNaming`); a row behaves like a chord chip.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mulNotes,
  parsePattern,
  positionalChords,
  positionalList,
  groupByShape,
  positionalNaming,
  type Note,
  type PositionalOrder,
  type PositionalRow as RankedRow,
} from '../../../lib/harmonic-field';
import { Button, SegmentedControl, TextInput, ActionIcon } from '../../../ui';
import type { PreviewTarget } from '../audio/plan';
import { groupFoldId, positionalShapeKey, representative } from '../state/chordGroups';
import { autoName } from '../state/generate';
import { MAX_PATTERNS, canonicalPattern } from '../state/patterns';
import { ChordCard, fmtCentsList, fmtSteps } from './ChordCard';
import { FoldHead, GroupedCount, NestGuide, foldId, useFold, useGroupExpanded } from './Fold';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from './icons';
import { useSendHover } from './Send';
import { Num, Tip, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

/** At most this many rows are drawn (a huge subset has as many chords as notes); the smoothest come first. */
export const MAX_POSITIONAL_ROWS = 120;

/** A chord's shape for the Sketch row: its intervals above its own root, root first. */
export const shapeOf = (pitches: readonly Note[]): Note[] =>
  pitches.map((p) => mulNotes(p, pitches[0], -1));

const plain = (p: Note): Note => ({ m: p.m ? { ...p.m } : null, c: p.c });

type Naming = ReturnType<typeof positionalNaming>;
interface NamedRow {
  c: RankedRow;
  naming: Naming;
}

/** M8i: a grouped row stands for `members` (the same shape on different roots); `chord` is the representative it plays for. */
interface RowGroup {
  members: NamedRow[];
  expanded: boolean;
  onToggle: () => void;
}

interface RowProps {
  chord: RankedRow;
  pattern: string;
  naming: Naming;
  /** The row (pattern + degree) that was clicked, or null: a row is picked when it is that one and its notes are still the highlight. */
  clicked: string | null;
  setClicked: (id: string | null) => void;
  group?: RowGroup;
}

function PositionalRow({ chord, pattern, naming, clicked, setClicked, group }: RowProps) {
  const rank = chord.rank;
  const lab = useLab();
  const { state, dispatch, audio, base } = lab;
  const abs = useMemo(() => chord.pitches.map((p) => p.c), [chord]);
  const parallel = state.ui.modePlayback !== 'relative';
  // Parallel puts the chord's own root on 1/1, Relative keeps the real pitches (as chips and the shelf do)
  const cents = useMemo(() => abs.map((c) => (parallel ? c - abs[0] : c)), [abs, parallel]);
  const lit = useMemo(() => new Set(chord.members), [chord]);
  // picked = this very row (twins with the same notes in a small subset are separate rows) and the highlight is still its notes
  const isPicked = (c: RankedRow) =>
    clicked === `${pattern}:${c.degree}` &&
    lab.chordPicked !== null &&
    lab.chordPicked.size === new Set(c.members).size &&
    c.members.every((i) => lab.chordPicked?.has(i));
  // a group is picked when ANY of its rows is
  const picked = group ? group.members.some((m) => isPicked(m.c)) : isPicked(chord);
  const n = group?.members.length ?? 1;
  const first = group?.members[0] ?? { c: chord, naming };
  // identical shapes tie: the group shows the best rank of its rows (and that row's score)
  const best = group ? group.members.reduce((a, m) => (m.c.rank < a.c.rank ? m : a)) : first;
  const shapeCents = first.c.pitches.map((p) => p.c - first.c.pitches[0].c);
  const target: PreviewTarget = {
    kind: 'pitches',
    key: `pos:${pattern}:${chord.degree}:${cents.join(',')}`,
    cents,
    light: abs,
    positional: { pattern, rootDeg: chord.degree, shape: shapeOf(chord.pitches) },
  };
  const send = useSendHover(`pos:${group ? 'g:' : ''}${pattern}:${chord.degree}`, () => ({
    kind: 'chord',
    label: naming.label,
    pitches: chord.pitches.map(plain),
    rep: base.rep,
    fixed: true,
    detail: {
      pattern,
      tail: naming.tail,
      root: `degree ${chord.degree + 1}`,
    },
    // the right-click menu's Stash on shelf (the same as the + button, tail included)
    stash: {
      pitches: chord.pitches.map(plain),
      template: naming.label,
      pattern,
      tail: naming.tail,
      rootDeg: chord.degree,
    },
  }));
  const hovered = useRef(false);
  const enter = (e?: { currentTarget: EventTarget }) => {
    hovered.current = true;
    send.enter(e);
    lab.setChord(lit, abs);
    audio.setPreviewTarget(target);
  };
  const leave = () => {
    hovered.current = false;
    send.leave();
    lab.setChord(null);
    audio.clearPreviewTarget(target);
  };
  // the playback mode (key 0) changed under a resting pointer: hold 1 must play the new pitches
  useEffect(() => {
    if (hovered.current) {
      audio.setPreviewTarget(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key]);
  const text = [naming.label, naming.tail, naming.ratio].filter(Boolean).join(', ');
  const label = group
    ? `${pattern}, the same shape on ${n} roots. Click: hear it on the root of the Sketch row's stepper, keep it highlighted and arm it in the Sketch row. Point and hold 1, 4 or 5 to hear it on that root. Press the arrow to show the ${n} roots one by one. Roughness score ${best.c.score.toFixed(2)} (best rank ${best.c.rank}).`
    : `${text}. Click: hear it, keep it highlighted and arm it in the Sketch row. Point and hold 1 to hear it for as long as you hold the key; with the pointer on this row, hold 4 or 5 plays it on the root of the Sketch row's stepper (both play its field notes: a positional chord has no separate exact form). Holding 1, 4 or 5 on it also arms its pattern in the Sketch row (hold 4 and 5 leave the Sketch root alone). Roughness score ${chord.score.toFixed(2)} (smoothest first, rank ${rank}).`;
  const ringTip = group
    ? `${pattern}, the same shape on ${n} roots. Roughness score ${best.c.score.toFixed(2)} (best rank ${best.c.rank}).`
    : `${text}. Roughness score ${chord.score.toFixed(2)} (smoothest first, rank ${rank}).`;
  return (
    <ChordCard
      as="li"
      testId="positional-row"
      label={label}
      ringTip={ringTip}
      title={group ? pattern : naming.label}
      titleExtra={first.naming.ratio}
      subtitle={group ? pattern : ''}
      pitches={fmtCentsList(group ? shapeCents : cents)}
      steps={fmtSteps(group ? shapeCents : cents)}
      group={
        group
          ? {
              count: n,
              expanded: group.expanded,
              label: `${group.expanded ? 'Hide' : 'Show'} the ${n} roots of ${pattern}`,
              onToggle: group.onToggle,
            }
          : undefined
      }
      stat={
        <span data-testid="positional-score">
          <Num muted>{`#${best.c.rank} · ${best.c.score.toFixed(2)}`}</Num>
        </span>
      }
      ring={{ cents: abs.map((c) => c - abs[0]), repC: base.repC }}
      found
      picked={picked}
      onEnter={enter}
      onLeave={leave}
      onFocus={enter}
      onBlur={leave}
      onClick={() => {
        if (picked) {
          lab.pickChord(null);
          setClicked(null);
          return;
        }
        lab.pickChord(lit);
        setClicked(`${pattern}:${chord.degree}`);
        audio.playCents(cents, abs);
        dispatch({
          type: 'sketch/armPositional',
          pattern,
          rootDeg: chord.degree,
          shape: shapeOf(chord.pitches),
        });
      }}
      stash={{
        label: `Stash ${naming.label} on the shelf`,
        onStash: () =>
          dispatch({
            type: 'shelf/stash',
            stash: {
              pitches: chord.pitches.map(plain),
              template: naming.label,
              pattern,
              tail: naming.tail,
              rootDeg: chord.degree,
              date: new Date().toISOString(),
            },
          }),
      }}
    />
  );
}

/** The one-line hint for a pattern the subset is too small for (shared with the Sketch row), or null when it fits. */
export function tooFewHint(n: number, pattern: string): string | null {
  const steps = parsePattern(pattern);
  if (n < 2) {
    return `Select at least 2 notes: ${pattern} stacks notes of the subset.`;
  }
  return steps && steps.some((s) => s % n === 0)
    ? `The subset has ${n} notes, too few for ${pattern} (a step of ${n} or more notes comes back to the same note). Select more notes or pick another pattern.`
    : null;
}

/** Whether `pattern` fits a subset of `n` notes (a step that is a whole number of turns would return to the same note). */
export const fitsSubset = (n: number, pattern: string): boolean => {
  const steps = parsePattern(pattern);
  return n >= 2 && steps !== null && !steps.some((s) => s % n === 0);
};

/** M8i: one grouped card (playing for the root of the Sketch stepper) and, when expanded, its per-root rows one tree level deeper. */
function PositionalGroupRows({
  id,
  pattern,
  members,
  clicked,
  setClicked,
}: {
  id: string;
  pattern: string;
  members: NamedRow[];
  clicked: string | null;
  setClicked: (id: string | null) => void;
}) {
  const { base, state } = useLab();
  const { expanded, toggle } = useGroupExpanded(id);
  const n = base.idx.length;
  const rep = representative(members, (m) => m.c.degree, n ? state.shelf.sketch.rootDeg % n : 0);
  return (
    <>
      <PositionalRow
        chord={rep.c}
        pattern={pattern}
        naming={rep.naming}
        clicked={clicked}
        setClicked={setClicked}
        group={{ members, expanded, onToggle: toggle }}
      />
      {expanded && (
        <li className={classes.nest}>
          <NestGuide name={`the roots of ${pattern}`} open toggle={toggle} />
          <ul className={classes.posList} aria-label={`The ${members.length} roots of ${pattern}`}>
            {members.map((m) => (
              <PositionalRow
                key={m.c.degree}
                chord={m.c}
                pattern={pattern}
                naming={m.naming}
                clicked={clicked}
                setClicked={setClicked}
              />
            ))}
          </ul>
        </li>
      )}
    </>
  );
}

/** The rows of ONE open pattern group: ranked among themselves only, computed when the group is open (a folded one never is). */
function PositionalRows({
  pattern,
  order,
  clicked,
  setClicked,
}: {
  pattern: string;
  order: PositionalOrder;
  clicked: string | null;
  setClicked: (id: string | null) => void;
}) {
  const { state, base, tab } = useLab();
  const n = base.idx.length;
  const genName = tab.gen.preset || autoName(tab.gen);
  const steps = useMemo(() => parsePattern(pattern), [pattern]);
  // Smoothest = best score first; Scale order = degree 1..N, each row with its score and its rank (rank 1 = smoothest of the group)
  const ranked = useMemo(
    () =>
      steps
        ? positionalList(
            positionalChords(base.field, base.idx, steps, base.mode, base.rep),
            order,
            state.ui.baseHz
          )
        : [],
    [steps, order, base.field, base.idx, base.mode, base.rep, state.ui.baseHz]
  );
  // the names (a ratio-name search per row) are made once per chord set, not on every hover
  const rows = useMemo(
    () =>
      ranked
        .slice(0, MAX_POSITIONAL_ROWS)
        .map((c) => ({ c, naming: positionalNaming(c, n, genName, state.templates) })),
    [ranked, n, genName, state.templates]
  );
  const groups = useMemo(
    () =>
      state.ui.groupShapes
        ? groupByShape(rows, (r) => positionalShapeKey(pattern, r.c.pitches))
        : rows.map((r) => ({ key: null, members: [r] })),
    [state.ui.groupShapes, rows, pattern]
  );
  return (
    <>
      <ul className={classes.posList} aria-label={`Positional chords ${pattern}`}>
        {groups.map((g) =>
          g.members.length > 1 && g.key !== null ? (
            <PositionalGroupRows
              key={g.key}
              id={groupFoldId(g.key)}
              pattern={pattern}
              members={g.members}
              clicked={clicked}
              setClicked={setClicked}
            />
          ) : (
            <PositionalRow
              key={`${pattern}:${g.members[0].c.degree}`}
              chord={g.members[0].c}
              pattern={pattern}
              naming={g.members[0].naming}
              clicked={clicked}
              setClicked={setClicked}
            />
          )
        )}
      </ul>
      {ranked.length > rows.length && (
        <span className={classes.hint}>
          Showing the {rows.length} {order === 'scale' ? 'first' : 'smoothest'} of {ranked.length}.
        </span>
      )}
    </>
  );
}

/** The number of shapes the rows of `pattern` make once grouped (0 when the pattern does not fit the subset). */
function positionalShapeCount(
  base: { field: Note[]; idx: number[]; mode: number; rep: Note },
  pattern: string
): number {
  const steps = parsePattern(pattern);
  if (!steps || !fitsSubset(base.idx.length, pattern)) {
    return 0;
  }
  const chords = positionalChords(base.field, base.idx, steps, base.mode, base.rep);
  return groupByShape(chords, (c) => positionalShapeKey(pattern, c.pitches)).length;
}

/** M8i: the ids of every shape group of 2 or more rows across all patterns that fit the subset (what Expand all expands). */
export function positionalGroupIds(
  base: { field: Note[]; idx: number[]; mode: number; rep: Note },
  patterns: readonly string[],
  order: PositionalOrder,
  baseHz: number
): string[] {
  const ids: string[] = [];
  for (const pattern of patterns) {
    const steps = parsePattern(pattern);
    if (!steps || !fitsSubset(base.idx.length, pattern)) {
      continue;
    }
    const rows = positionalList(
      positionalChords(base.field, base.idx, steps, base.mode, base.rep),
      order,
      baseHz
    ).slice(0, MAX_POSITIONAL_ROWS);
    for (const g of groupByShape(rows, (r) => positionalShapeKey(pattern, r.pitches))) {
      if (g.members.length > 1 && g.key !== null) {
        ids.push(groupFoldId(g.key));
      }
    }
  }
  return ids;
}

/** One pattern group: a foldable header (the pattern and its row count), its rows when open. */
function PositionalGroup({
  pattern,
  order,
  clicked,
  setClicked,
  shapes,
}: {
  pattern: string;
  order: PositionalOrder;
  clicked: string | null;
  setClicked: (id: string | null) => void;
  /** The number of shapes the pattern's rows make (null when the switch is off). */
  shapes: number | null;
}) {
  const { base } = useLab();
  const n = base.idx.length;
  const id = foldId('pos', pattern);
  const { folded, toggle } = useFold(id);
  const fits = fitsSubset(n, pattern);
  return (
    <div
      className={`${classes.posGroup} ${classes.nest}`}
      role="group"
      aria-label={`Pattern ${pattern}`}
    >
      <NestGuide name={`pattern ${pattern}`} open={!folded} toggle={toggle} />
      <h4 className={classes.treeHead} data-level="2">
        <FoldHead
          id={id}
          tip="positionalPick"
          title={pattern}
          count={fits ? <GroupedCount n={n} m={shapes} /> : 0}
          label={`Pattern ${pattern}`}
        />
      </h4>
      {!folded &&
        (fits ? (
          <PositionalRows
            pattern={pattern}
            order={order}
            clicked={clicked}
            setClicked={setClicked}
          />
        ) : (
          <span className={classes.hint}>{tooFewHint(n, pattern)}</span>
        ))}
    </div>
  );
}

/** The Positional section of the Chords panel: every pattern is its own foldable group, ranked among itself only. */
export function PositionalSection() {
  const { state, dispatch, base } = useLab();
  const list = state.patterns.list;
  const n = base.idx.length;
  const order: PositionalOrder = state.ui.positionalOrder;
  const setOrder = (o: PositionalOrder) => dispatch({ type: 'ui', patch: { positionalOrder: o } });
  const { folded } = useFold('positional');
  // a position is a row of its group: the section counts the rows of every pattern that fits the subset (no ranking needed)
  const total = list.reduce((a, p) => a + (fitsSubset(n, p) ? n : 0), 0);
  // shapes per pattern (only while grouping): the same grouping function, over the stacked chords (no ranking needed)
  const shapes = useMemo(() => {
    const out = new Map<string, number>();
    if (state.ui.groupShapes) {
      for (const p of list) {
        out.set(p, positionalShapeCount(base, p));
      }
    }
    return out;
  }, [state.ui.groupShapes, list, base]);
  const totalShapes = state.ui.groupShapes
    ? list.reduce((a, p) => a + (fitsSubset(n, p) ? (shapes.get(p) ?? n) : 0), 0)
    : null;
  // the row that was clicked (pattern + degree): twins with the same notes are separate rows
  const [clicked, setClicked] = useState<string | null>(null);
  return (
    <section className={classes.family} aria-label="Positional chords">
      <h3 className={classes.treeHead} data-level="1">
        <FoldHead
          id="positional"
          tip="positionalChords"
          title="Positional"
          count={<GroupedCount n={total} m={totalShapes} />}
        />
      </h3>
      {!folded &&
        (list.length === 0 ? (
          <span className={classes.hint} role="status">
            No patterns. Add one under Edit templates, Positional patterns, or press Restore
            defaults.
          </span>
        ) : (
          <>
            <div className={classes.posPick}>
              <Tip k="positionalOrder" as="control">
                <SegmentedControl
                  size="xs"
                  aria-label="Positional order"
                  data={['Smoothest', 'Scale order']}
                  value={order === 'scale' ? 'Scale order' : 'Smoothest'}
                  onChange={(v) => setOrder(v === 'Scale order' ? 'scale' : 'smoothest')}
                  className={labClasses.tinySeg}
                />
              </Tip>
            </div>
            {list.map((p) => (
              <PositionalGroup
                key={p}
                pattern={p}
                order={order}
                clicked={clicked}
                setClicked={setClicked}
                shapes={state.ui.groupShapes ? (shapes.get(p) ?? null) : null}
              />
            ))}
          </>
        ))}
    </section>
  );
}

/** A text box that commits on Enter or leaving and gives the old text back on Escape. */
function PatternField({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <TextInput
      size="xs"
      aria-label={label}
      value={local}
      onChange={(e) => setLocal(e.currentTarget.value)}
      onBlur={() => {
        if (local !== value) {
          onCommit(local);
          // a refused edit leaves the stored text in place: the box shows it again (an accepted one remounts with the new text)
          setLocal(value);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onCommit(local);
        } else if (e.key === 'Escape') {
          setLocal(value);
        }
      }}
    />
  );
}

/** The editable pattern list (inside the template editor): add, edit in place, delete, reorder, Restore defaults. */
export function PatternsEditor() {
  const { state, dispatch } = useLab();
  const { list, refusal } = state.patterns;
  const [draft, setDraft] = useState('');
  const add = () => {
    dispatch({ type: 'patterns/add', text: draft });
    // a valid, new pattern is taken; anything else stays in the box with the reason shown below
    const t = canonicalPattern(draft);
    if (t && !list.includes(t) && list.length < MAX_PATTERNS) {
      setDraft('');
    }
  };
  return (
    <div className={classes.editor} role="group" aria-label="Positional patterns">
      <div className={classes.patHead}>
        <Tip k="positionalPatterns">Positional patterns</Tip>
        <Num muted>{list.length}</Num>
      </div>
      {list.map((p, i) => (
        <div key={`${i}:${p}`} className={classes.patRow}>
          <PatternField
            value={p}
            label={`Pattern ${i + 1}`}
            onCommit={(v) => dispatch({ type: 'patterns/edit', at: i, text: v })}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Move pattern ${p} up`}
            disabled={i === 0}
            onClick={() => dispatch({ type: 'patterns/move', from: i, to: i - 1 })}
          >
            <ArrowUpIcon />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Move pattern ${p} down`}
            disabled={i === list.length - 1}
            onClick={() => dispatch({ type: 'patterns/move', from: i, to: i + 1 })}
          >
            <ArrowDownIcon />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            className={labClasses.dangerHover}
            aria-label={`Delete pattern ${p}`}
            onClick={() => dispatch({ type: 'patterns/delete', at: i })}
          >
            <TrashIcon />
          </ActionIcon>
        </div>
      ))}
      <div className={classes.patRow}>
        <TextInput
          size="xs"
          aria-label="New pattern"
          placeholder="2-3-2"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              add();
            }
          }}
        />
        <Button size="compact-xs" variant="default" leftSection={<PlusIcon />} onClick={add}>
          Add pattern
        </Button>
      </div>
      {refusal && (
        <span className={classes.patError} role="alert">
          {refusal.reason}
        </span>
      )}
      <div className={classes.editorFoot}>
        <Tip k="positionalRestore" as="control">
          <Button
            size="xs"
            variant="default"
            onClick={() => dispatch({ type: 'patterns/restore' })}
          >
            Restore defaults
          </Button>
        </Tip>
      </div>
    </div>
  );
}

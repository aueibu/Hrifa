/**
 * Positional chords (M9, H-9), the UI: the "Positional" section of the Chords panel (a pattern picker and the ranked chords of
 * ALL degrees of the active subset for that pattern) and the "Positional patterns" editor inside the template editor. The
 * chords come from the lib (`positionalChords`, `rankPositional`, `positionalNaming`); a row behaves like a chord chip.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  NativeSelect,
  SegmentedControl,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  mulNotes,
  parsePattern,
  positionalChords,
  positionalList,
  positionalNaming,
  type Note,
  type PositionalOrder,
  type PositionalRow as RankedRow,
} from '../../../lib/harmonic-field';
import type { PreviewTarget } from '../audio/plan';
import { autoName } from '../state/generate';
import { MAX_PATTERNS, canonicalPattern, chosenPattern } from '../state/patterns';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from './icons';
import { useSendHover } from './Send';
import { ChordDrawing } from './ShelfPanel';
import { Num, Tip, useLab, useNativeTitle, useTooltipProps } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

/** At most this many rows are drawn (a huge subset has as many chords as notes); the smoothest come first. */
export const MAX_POSITIONAL_ROWS = 120;

/** A chord's shape for the Sketch row: its intervals above its own root, root first. */
export const shapeOf = (pitches: readonly Note[]): Note[] =>
  pitches.map((p) => mulNotes(p, pitches[0], -1));

const plain = (p: Note): Note => ({ m: p.m ? { ...p.m } : null, c: p.c });

interface RowProps {
  chord: RankedRow;
  /** Scale order: the row also shows its smoothness score next to its rank (Smoothest order shows the rank only, as before). */
  showScore: boolean;
  pattern: string;
  naming: ReturnType<typeof positionalNaming>;
  /** True when THIS row (pattern + degree) is the one that was clicked and its notes are still the picked highlight. */
  rowPicked: boolean;
  onPick: (picked: boolean) => void;
}

function PositionalRow({ chord, showScore, pattern, naming, rowPicked, onPick }: RowProps) {
  const rank = chord.rank;
  const lab = useLab();
  const { state, dispatch, audio, base } = lab;
  const tipProps = useTooltipProps();
  const nativeTitle = useNativeTitle();
  const abs = useMemo(() => chord.pitches.map((p) => p.c), [chord]);
  const parallel = state.ui.modePlayback !== 'relative';
  // Parallel puts the chord's own root on 1/1, Relative keeps the real pitches (as chips and the shelf do)
  const cents = useMemo(() => abs.map((c) => (parallel ? c - abs[0] : c)), [abs, parallel]);
  const lit = useMemo(() => new Set(chord.members), [chord]);
  // picked = this very row (twins with the same notes in a small subset are separate rows) and the highlight is still its notes
  const picked =
    rowPicked &&
    lab.chordPicked !== null &&
    lab.chordPicked.size === lit.size &&
    [...lit].every((i) => lab.chordPicked?.has(i));
  const target: PreviewTarget = {
    kind: 'pitches',
    key: `pos:${pattern}:${chord.degree}:${cents.join(',')}`,
    cents,
    light: abs,
    positional: { pattern, rootDeg: chord.degree, shape: shapeOf(chord.pitches) },
  };
  const send = useSendHover(`pos:${pattern}:${chord.degree}`, () => ({
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
    lab.setChord(lit);
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
  const label = `${text}. Click: hear it, keep it highlighted and arm it in the Sketch row. Point and hold 1 to hear it for as long as you hold the key; hold 4 or 5 puts the same chord on the note you point at. Roughness score ${chord.score.toFixed(2)} (smoothest first, rank ${rank}).`;
  return (
    <li className={classes.chipWrap} data-stash="true" data-testid="positional-row">
      <Tooltip label={label} multiline w={260} {...tipProps}>
        <button
          type="button"
          className={classes.chip}
          data-found="true"
          data-picked={picked}
          aria-pressed={picked}
          aria-label={label}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocus={enter}
          onBlur={leave}
          onClick={() => {
            if (picked) {
              lab.pickChord(null);
              onPick(false);
              return;
            }
            lab.pickChord(lit);
            onPick(true);
            audio.playCents(cents, abs);
            dispatch({
              type: 'sketch/armPositional',
              pattern,
              rootDeg: chord.degree,
              shape: shapeOf(chord.pitches),
            });
          }}
        >
          <span className={classes.posRow}>
            <ChordDrawing cents={abs.map((c) => c - abs[0])} repC={base.repC} />
            <span className={classes.posText}>
              <span className={classes.chipTop}>
                <Num>{naming.label}</Num>
                <Num muted>#{rank}</Num>
                {showScore && (
                  <span data-testid="positional-score">
                    <Num muted>score {chord.score.toFixed(2)}</Num>
                  </span>
                )}
              </span>
              <span className={classes.chipBottom}>
                <Num muted>{naming.tail}</Num>
                {naming.ratio && <Num>{naming.ratio}</Num>}
              </span>
            </span>
          </span>
        </button>
      </Tooltip>
      <button
        type="button"
        className={classes.chipStash}
        aria-label={`Stash ${naming.label} on the shelf`}
        title={nativeTitle('Stash this chord on the shelf')}
        onClick={() =>
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
          })
        }
      >
        <PlusIcon />
      </button>
    </li>
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

/** The Positional section of the Chords panel. */
export function PositionalSection() {
  const { state, dispatch, base, tab } = useLab();
  const list = state.patterns.list;
  const chosen = chosenPattern(list, state.ui.positionalPattern);
  const steps = useMemo(() => (chosen ? parsePattern(chosen) : null), [chosen]);
  const n = base.idx.length;
  const genName = tab.gen.preset || autoName(tab.gen);
  // a step that is a whole number of turns of the subset would come back to the same note
  const tooFew = n < 2 || (steps !== null && steps.some((s) => s % n === 0));
  // Smoothest = best score first; Scale order = degree 1..N, each row with its score and its rank (rank 1 = smoothest)
  const [order, setOrder] = useState<PositionalOrder>('smoothest');
  const ranked = useMemo(() => {
    if (!steps || tooFew) {
      return [];
    }
    return positionalList(
      positionalChords(base.field, base.idx, steps, base.mode, base.rep),
      order,
      state.ui.baseHz
    );
  }, [steps, tooFew, order, base.field, base.idx, base.mode, base.rep, state.ui.baseHz]);
  // the names (a ratio-name search per row) are made once per chord set, not on every hover
  const named = useMemo(
    () =>
      ranked
        .slice(0, MAX_POSITIONAL_ROWS)
        .map((c) => ({ c, naming: positionalNaming(c, n, genName, state.templates) })),
    [ranked, n, genName, state.templates]
  );
  // the row that was clicked (pattern + degree): twins with the same notes are separate rows
  const [clicked, setClicked] = useState<string | null>(null);
  const rows = named;
  return (
    <section className={classes.family} aria-label="Positional chords">
      <h3 className={classes.familyHead}>
        <Tip k="positionalChords">Positional</Tip>
        <Num muted>{ranked.length}</Num>
      </h3>
      {list.length === 0 ? (
        <span className={classes.hint} role="status">
          No patterns. Add one under Edit templates, Positional patterns, or press Restore defaults.
        </span>
      ) : (
        <div className={classes.posPick}>
          <Tip k="positionalPick">Pattern</Tip>
          <NativeSelect
            size="xs"
            aria-label="Positional pattern"
            data={list}
            value={chosen ?? ''}
            onChange={(e) =>
              dispatch({ type: 'ui', patch: { positionalPattern: e.currentTarget.value } })
            }
          />
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
      )}
      {chosen && tooFew && (
        <span className={classes.hint} role="status">
          {tooFewHint(n, chosen)}
        </span>
      )}
      {chosen && !tooFew && (
        <ul className={classes.posList} aria-label="Positional chords">
          {rows.map(({ c, naming }) => (
            <PositionalRow
              key={`${chosen}:${c.degree}`}
              chord={c}
              showScore={order === 'scale'}
              pattern={chosen}
              naming={naming}
              rowPicked={clicked === `${chosen}:${c.degree}`}
              onPick={(p) => setClicked(p ? `${chosen}:${c.degree}` : null)}
            />
          ))}
        </ul>
      )}
      {ranked.length > rows.length && (
        <span className={classes.hint}>
          Showing the {rows.length} {order === 'scale' ? 'first' : 'smoothest'} of {ranked.length}.
        </span>
      )}
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

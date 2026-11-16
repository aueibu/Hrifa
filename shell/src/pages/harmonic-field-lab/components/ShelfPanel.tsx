/**
 * Shelf panel (M8a): the stashed chords as slots (name, note count, a small chord drawing), with rename, reorder, delete,
 * additive multi-select, Play selected, click-to-play, hover + hold 1 (a selected slot layers every selected one) and Reload
 * (the chord's source as a new tab). Everything reads and writes the shelf through `useLab()`; nothing is stored here.
 */
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { ActionIcon, Button, Checkbox, TextInput } from '@mantine/core';
import { mulNotes } from '../../../lib/harmonic-field';
import { CHORD_KEYS, CHORD_PAGE, playsChords } from '../audio/keymap';
import type { PreviewTarget } from '../audio/plan';
import { SHORTCUTS } from '../audio/shortcuts';
import { chordPitchesFor, type ShelfChord } from '../state/chordShelf';
import { noteLabel } from '../state/derive';
import { litIndex } from '../state/retuner';
import { ChordCard, notesText, pitchTexts, templateOn } from './ChordCard';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, PlayIcon, TrashIcon } from './icons';
import { ModeChevron } from './ModeRoot';
import { SendMany, shelfChordItem, useSendHover } from './Send';
import { Hint, Strip, Tip, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

/**
 * Root chevron on the small ring, in viewBox units (ring radius 0.8, dot edge 0.93; 1 unit is 24 px at the 3rem ring,
 * 16 px at 2rem). Tune here: tip radius, arm length (the chevron path is 6 long, so the scale is length / 6) and stroke.
 */
const ROOT_TIP = 0.97;
const ROOT_ARM = 0.17;
const ROOT_STROKE = 0.055;
const ROOT_SCALE = ROOT_ARM / 6;

/** The chord's notes on a small ring (the repeat is one turn, 1/1 at the top), as the pitch ring draws a chord. */
export function ChordDrawing({
  cents,
  repC,
  rootCents,
}: {
  cents: readonly number[];
  repC: number;
  /** The chord's root (cents): marked with the mode-root chevron just outside its dot; none when omitted. */
  rootCents?: number;
}) {
  const R = repC > 0 ? repC : 1200;
  const pts = cents.map((c) => {
    const a = (2 * Math.PI * (((c % R) + R) % R)) / R;
    return { x: Math.sin(a) * 0.8, y: -Math.cos(a) * 0.8 };
  });
  const rootAngle =
    rootCents === undefined || !cents.length
      ? null
      : (2 * Math.PI * (((rootCents % R) + R) % R)) / R;
  const uniq = pts.filter((p, i) => pts.findIndex((q) => q.x === p.x && q.y === p.y) === i);
  return (
    <svg className={classes.drawing} viewBox="-1 -1 2 2" aria-hidden="true">
      <circle className={classes.drawingRing} r={0.8} />
      {uniq.length > 1 && (
        <polygon
          className={classes.drawingShape}
          points={uniq.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}
        />
      )}
      {uniq.map((p, i) => (
        <circle key={i} className={classes.drawingDot} cx={p.x} cy={p.y} r={0.13} />
      ))}
      {rootAngle !== null && (
        <ModeChevron
          x={Math.sin(rootAngle) * ROOT_TIP}
          y={-Math.cos(rootAngle) * ROOT_TIP}
          deg={(rootAngle * 180) / Math.PI - 90 + 180}
          scale={ROOT_SCALE}
          strokeWidth={ROOT_STROKE}
          testId="chord-root"
        />
      )}
    </svg>
  );
}

/** The slot name: click it to rename in place (Enter or leaving keeps it, Escape cancels); a "Chord N" name is automatic (muted italic). */
function SlotName({ chord }: { chord: ShelfChord }) {
  const { dispatch } = useLab();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chord.name);
  const done = (keep: boolean) => {
    if (keep && name.trim() && name.trim() !== chord.name) {
      dispatch({ type: 'shelf/rename', id: chord.id, name });
    }
    setEditing(false);
  };
  if (editing) {
    return (
      <TextInput
        size="xs"
        aria-label="New name"
        value={name}
        data-autofocus
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            done(true);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            done(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={classes.slotName}
      aria-label={`Rename ${chord.name}`}
      onClick={() => {
        setName(chord.name);
        setEditing(true);
      }}
    >
      <span className={labClasses.autoName} data-auto={/^Chord \d+$/.test(chord.name) || undefined}>
        {chord.name}
      </span>
    </button>
  );
}

function Slot({
  chord,
  index,
  count,
  centsOf,
  lightOf,
  litOf,
  targetFor,
}: {
  chord: ShelfChord;
  index: number;
  count: number;
  centsOf: (c: ShelfChord) => number[];
  lightOf: (c: ShelfChord) => number[];
  litOf: (cents: readonly number[]) => Set<number>;
  targetFor: (c: ShelfChord) => PreviewTarget;
}) {
  const lab = useLab();
  const { state, dispatch, audio, base } = lab;
  const { shelf } = state;
  const [confirming, setConfirming] = useState(false);
  // Chords and Split: the first ten chords of the current page are on the keys Q to P
  const lastPage = Math.max(0, Math.ceil(shelf.chords.length / CHORD_PAGE) - 1);
  const pageStart = Math.min(state.keys.page, lastPage) * CHORD_PAGE;
  const keyBadge =
    playsChords(state.ui.keyboardMode) && index >= pageStart && index < pageStart + CHORD_PAGE
      ? CHORD_KEYS[index - pageStart].toUpperCase()
      : null;
  const cents = useMemo(() => centsOf(chord), [centsOf, chord]);
  const lights = useMemo(() => lightOf(chord), [lightOf, chord]);
  const lit = useMemo(() => litOf(lights), [litOf, lights]);
  const picked =
    lab.chordPicked !== null &&
    lit.size > 0 &&
    lab.chordPicked.size === lit.size &&
    [...lit].every((i) => lab.chordPicked?.has(i));
  const selected = shelf.selected.includes(chord.id);
  const parentGone = chord.parent !== null && !shelf.chords.some((c) => c.id === chord.parent);
  const parent = chord.parent ? shelf.chords.find((c) => c.id === chord.parent) : undefined;
  const reload = shelf.lastReload?.id === chord.id ? shelf.lastReload : null;
  // the target is read when the pointer arrives; leaving clears whichever target this slot made
  const hovered = useRef(false);
  const target = targetFor(chord);
  const send = useSendHover(`slot:${chord.id}`, () => shelfChordItem(chord));
  const enter = (e?: SyntheticEvent) => {
    hovered.current = true;
    send.enter(e);
    lab.setChord(lit, lights);
    audio.setPreviewTarget(target);
  };
  const leave = () => {
    hovered.current = false;
    send.leave();
    lab.setChord(null);
    audio.clearPreviewTarget(target);
  };
  // the playback mode (key 0) or the selection changed under a resting pointer: hold 1 must play the new thing
  const targetKey = target.kind === 'pitches' ? target.key : '';
  useEffect(() => {
    if (hovered.current) {
      audio.setPreviewTarget(targetFor(chord));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);
  const play = () => {
    if (picked) {
      lab.pickChord(null);
    } else {
      lab.pickChord(lit);
      audio.playCents(cents, lights, [chord.id]);
      if ((chord.template || chord.pattern) && chord.pitches.length) {
        // playing a slot arms its template (or its positional pattern) and its stored realization in the Sketch row
        const p0 = chord.pitches[0];
        // root position, like a chip's shape: a note below the first is lifted by the repeat
        const shape = chord.pitches.map((p) => {
          let n = mulNotes(p, p0, -1);
          while (base.rep.c > 1e-9 && n.c < -1e-9) {
            n = mulNotes(n, base.rep, 1);
          }
          return n;
        });
        dispatch(
          chord.pattern
            ? {
                type: 'sketch/armPositional',
                pattern: chord.pattern,
                rootDeg: chord.rootDeg ?? undefined,
                shape,
              }
            : { type: 'sketch/arm', template: chord.template as string, shape }
        );
      }
    }
  };
  // the card texts come from the same helpers as the chord chips: root as `noteLabel`, pitches as ratios (else cents), steps
  const root = chord.pitches[0];
  const count1 = notesText(chord.pitches.length);
  const subtitle = [
    chord.pattern
      ? chord.template
      : root
        ? templateOn(chord.template, noteLabel(root))
        : chord.template,
    count1,
  ]
    .filter(Boolean)
    .join(' · ');
  const ups = chord.pitches.map((p) => p.c - (root?.c ?? 0));
  const texts = pitchTexts(
    ups,
    chord.pitches.length > 0 && chord.pitches.every((p) => p.m)
      ? chord.pitches.map(noteLabel)
      : null
  );
  return (
    <li
      className={classes.slot}
      data-selected={selected}
      data-picked={picked}
      data-playing={lab.soundingChords.has(chord.id)}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      <ChordCard
        testId="slot-card"
        label={`Play ${chord.name}`}
        title={chord.name}
        titleNode={<SlotName chord={chord} />}
        badge={
          keyBadge ? (
            <span className={classes.slotKey} data-testid="slot-key" title="Computer key">
              {keyBadge}
            </span>
          ) : null
        }
        subtitle={subtitle}
        pitches={texts.pitches}
        steps={texts.steps}
        stat={null}
        ring={{ cents, repC: base.repC }}
        found
        picked={picked}
        ringButton={{
          label: `Play ${chord.name}`,
          pressed: picked,
          hint: {
            label: 'Play this chord',
            text: `Click: hear it and keep it highlighted. Point and hold ${SHORTCUTS.holdOwn} to hear it for as long as you hold the key.`,
          },
          onClick: play,
        }}
        actions={
          <>
            <span className={classes.cardCheck} data-checked={selected || undefined}>
              <Checkbox
                size="xs"
                aria-label={`Select ${chord.name}`}
                checked={selected}
                onChange={() => dispatch({ type: 'shelf/select', id: chord.id, additive: true })}
              />
            </span>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Move ${chord.name} up`}
              disabled={index === 0}
              onClick={() => dispatch({ type: 'shelf/move', id: chord.id, to: index - 1 })}
            >
              <ArrowUpIcon />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Move ${chord.name} down`}
              disabled={index === count - 1}
              onClick={() => dispatch({ type: 'shelf/move', id: chord.id, to: index + 1 })}
            >
              <ArrowDownIcon />
            </ActionIcon>
            <Hint
              label="Reload as a new tab"
              dynamic={
                chord.source
                  ? 'Open this chord’s source (generator and subset) as a new tab.'
                  : 'This chord has no stored source, so it cannot be reloaded.'
              }
            >
              <span className={classes.hintHost}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Reload ${chord.name} as a new tab`}
                  disabled={!chord.source}
                  onClick={() => dispatch({ type: 'shelf/reload', id: chord.id })}
                >
                  <CopyIcon />
                </ActionIcon>
              </span>
            </Hint>
            {confirming ? (
              <Button
                size="compact-xs"
                variant="default"
                color="red"
                aria-label={`Confirm delete ${chord.name}`}
                onClick={() => {
                  setConfirming(false);
                  dispatch({ type: 'shelf/delete', id: chord.id });
                }}
                onBlur={() => setConfirming(false)}
                data-autofocus
                autoFocus
              >
                Delete?
              </Button>
            ) : (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Delete ${chord.name}`}
                onClick={() => setConfirming(true)}
              >
                <TrashIcon />
              </ActionIcon>
            )}
          </>
        }
      />
      {(parentGone || parent || reload) && (
        <div className={classes.slotNote} role="status">
          {parentGone && <span>parent removed</span>}
          {parent && <span>from {parent.name}</span>}
          {reload && (
            <span>
              Reloaded as a new tab:{' '}
              {reload.missing > 0
                ? `${reload.missing} of ${reload.found + reload.missing} source pitches are missing from the rebuilt field`
                : `all ${reload.found} source pitches found`}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/** Delete all: two clicks (the second reads "Delete all N?"); leaving, blurring or Escape cancels. */
function DeleteAll({ count }: { count: number }) {
  const { dispatch } = useLab();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (count === 0) {
      setConfirming(false);
    }
  }, [count]);
  return (
    <Button
      size="compact-xs"
      variant="default"
      color={confirming ? 'red' : undefined}
      // aria-disabled, not `disabled`: a disabled button drops keyboard focus after the confirm
      data-disabled={count === 0 ? true : undefined}
      aria-disabled={count === 0}
      aria-label={confirming ? `Confirm delete all ${count} chords` : 'Delete all chords'}
      onClick={() => {
        if (count === 0) {
          return;
        }
        if (confirming) {
          setConfirming(false);
          dispatch({ type: 'shelf/clear' });
        } else {
          setConfirming(true);
        }
      }}
      onBlur={() => setConfirming(false)}
      onMouseLeave={() => setConfirming(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setConfirming(false);
        }
      }}
    >
      {confirming ? `Delete all ${count}?` : 'Delete all'}
    </Button>
  );
}

export function ShelfPanel() {
  const lab = useLab();
  const { state, dispatch, audio, base } = lab;
  const { shelf } = state;
  const frame = state.ui.modePlayback;
  const noteCents = useMemo(() => base.field.map((n) => n.c), [base.field]);
  const centsOf = useMemo(
    () => (c: ShelfChord) => chordPitchesFor(c, frame).map((p) => p.c),
    [frame]
  );
  const lightOf = useMemo(() => (c: ShelfChord) => c.pitches.map((p) => p.c), []);
  const litOf = useMemo(
    () => (cents: readonly number[]) =>
      new Set(cents.map((c) => litIndex(noteCents, base.repC, c)).filter((i) => i >= 0)),
    [noteCents, base.repC]
  );
  const selectedChords = shelf.selected
    .map((id) => shelf.chords.find((c) => c.id === id))
    .filter((c): c is ShelfChord => c !== undefined);
  /** What hold 1 plays on a slot: that chord, or every selected chord layered when the slot is one of several selected. */
  const targetFor = useMemo(
    () =>
      (chord: ShelfChord): PreviewTarget =>
        shelf.selected.length > 1 && shelf.selected.includes(chord.id)
          ? {
              kind: 'pitches',
              key: `sel:${shelf.selected.join('+')}:${frame}`,
              cents: selectedChords.flatMap(centsOf),
              light: selectedChords.flatMap(lightOf),
              chords: selectedChords.map((c) => c.id),
            }
          : {
              kind: 'pitches',
              key: `slot:${chord.id}:${frame}`,
              cents: centsOf(chord),
              light: lightOf(chord),
              chords: [chord.id],
            },
    [shelf.selected, selectedChords, centsOf, lightOf, frame]
  );
  const playSelected = () => {
    const cents = selectedChords.flatMap(centsOf);
    if (cents.length) {
      const lights = selectedChords.flatMap(lightOf);
      lab.pickChord(litOf(lights));
      audio.playCents(cents, lights, shelf.selected);
    }
  };
  return (
    <>
      <Strip title={<Tip k="shelfPanel">Shelf</Tip>}>
        <Tip k="shelfPlaySelected" as="control">
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<PlayIcon />}
            disabled={selectedChords.length === 0}
            onClick={playSelected}
          >
            Play selected
          </Button>
        </Tip>
        <SendMany
          disabled={selectedChords.length === 0}
          items={selectedChords.map(shelfChordItem)}
        />
        <Button
          size="compact-xs"
          variant="default"
          disabled={shelf.selected.length === 0}
          onClick={() => dispatch({ type: 'shelf/selectNone' })}
        >
          Clear selection
        </Button>
        <DeleteAll count={shelf.chords.length} />
      </Strip>
      <div className={classes.panelBody}>
        {shelf.refusal && (
          <span className={classes.shelfRefusal} role="alert">
            {shelf.refusal.reason}
          </span>
        )}
        {shelf.chords.length === 0 ? (
          <span className={classes.hint} role="status">
            The shelf is empty. In the Chords panel pick a template in the Sketch row and press
            Stash, or press the + on a found chord chip.
          </span>
        ) : (
          <ul className={classes.shelfList} aria-label="Chord shelf">
            {shelf.chords.map((c, i) => (
              <Slot
                key={c.id}
                chord={c}
                index={i}
                count={shelf.chords.length}
                centsOf={centsOf}
                lightOf={lightOf}
                litOf={litOf}
                targetFor={targetFor}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Composites panel (M8c step 2): one row per composite (number, name, merged note count, a small ring of the merged notes, an
 * item list you can open, Open as tab, Delete). Reads and writes the composites through `useLab()`; nothing is stored here.
 * Items are hover sources for the `-` popup and the right-click menu, like chips and slots.
 */
import { useMemo, useState } from 'react';
import { ActionIcon, Button, TextInput } from '@mantine/core';
import { mergeComposite } from '../../../lib/harmonic-field';
import { centsList, type Composite, type CompositeItem } from '../state/composites';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { autoName } from '../state/generate';
import { CompositeRing, centsOfNotes } from './CompositeRing';
import { ChevronDownIcon, CloseIcon, PlusIcon } from './icons';
import { compositeItemItem, useSendHover } from './Send';
import { Num, Strip, Tip, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

/** The name: click it to rename in place (Enter or leaving keeps it, Escape cancels); "Composite N" is automatic (muted italic). */
function CompName({ c }: { c: Composite }) {
  const { dispatch } = useLab();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const done = (keep: boolean) => {
    if (keep && name.trim() && name.trim() !== c.name) {
      dispatch({ type: 'composite/rename', id: c.id, name, date: new Date().toISOString() });
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
      aria-label={`Rename ${c.name}`}
      onClick={() => {
        setName(c.name);
        setEditing(true);
      }}
    >
      <span className={labClasses.autoName} data-auto={/^Composite \d+$/.test(c.name) || undefined}>
        {c.name}
      </span>
    </button>
  );
}

/** The kind name of a chord label: "major triad on 1/1" gives "major triad" (a label without " on " is used whole). */
const nameOfLabel = (label: string): string => label.split(' on ')[0].trim() || label;

const oneDecimal = (c: number) => c.toFixed(1);

/**
 * The four lines of an item (M8e):
 *  1. `<template> <kind> on <root> c` (`4:5:6 major triad on 200.0 c`); a positional chord shows its label (`2-2 on 4`); a
 *     subset or note shows its label;
 *  2. `chord · n notes`, `subset · n notes`, `selection · n notes`, or `note`;
 *  3. the cents (chords and selections only), plus the positional tail on the same line;
 *  4. `Source: <generator or source name>`.
 * The cents come from `centsList(pitches)`; nothing here is stored.
 */
export function itemLines(it: CompositeItem): { key: string; text: string }[] {
  const d = it.detail;
  const n = it.pitches.length;
  const lines: { key: string; text: string }[] = [];
  const chordLike = it.kind === 'chord' || it.kind === 'selection';
  let what = it.label;
  if (chordLike && !d?.pattern && n > 0) {
    const root = oneDecimal(centsList(it.pitches)[0]);
    what = `${[d?.template, nameOfLabel(it.label)].filter(Boolean).join(' ')} on ${root} c`;
  }
  lines.push({ key: 'what', text: what });
  lines.push({
    key: 'kind',
    text: it.kind === 'note' ? 'note' : `${it.kind} · ${n} ${n === 1 ? 'note' : 'notes'}`,
  });
  if (chordLike) {
    const cents = `${centsList(it.pitches).map(oneDecimal).join(', ')} c`;
    lines.push({ key: 'cents', text: d?.pattern && d.tail ? `${cents} · ${d.tail}` : cents });
  }
  if (it.source) {
    lines.push({
      key: 'source',
      text: `Source: ${it.source.gen.preset || autoName(it.source.gen)}`,
    });
  }
  return lines;
}

function ItemRow({
  c,
  it,
  onLight,
}: {
  c: Composite;
  it: CompositeItem;
  onLight: (id: string | null) => void;
}) {
  const { dispatch } = useLab();
  const hover = useSendHover(`ci:${c.id}:${it.id}`, () => compositeItemItem(it));
  const lines = itemLines(it);
  return (
    <li
      className={classes.compItem}
      data-item={it.id}
      onMouseEnter={(e) => {
        hover.enter(e);
        onLight(it.id);
      }}
      onMouseLeave={() => {
        hover.leave();
        onLight(null);
      }}
    >
      <span className={classes.compItemText}>
        {lines.map((l) => (
          <span
            key={l.key}
            className={l.key === 'what' ? classes.compItemLabel : classes.compDetail}
            data-detail={l.key}
          >
            {l.text}
          </span>
        ))}
      </span>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={`Remove ${it.label} from ${c.name}`}
        onClick={() => {
          onLight(null);
          dispatch({
            type: 'composite/removeItem',
            id: c.id,
            item: it.id,
            date: new Date().toISOString(),
          });
        }}
      >
        <CloseIcon />
      </ActionIcon>
    </li>
  );
}

function Row({ c }: { c: Composite }) {
  const lab = useLab();
  const { dispatch, base } = lab;
  const [dev] = useLabDeveloperOptions();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** The item under the pointer: the notes it gives the composite light in the ring. */
  const [lightItem, setLightItem] = useState<string | null>(null);
  const merged = useMemo(
    () => mergeComposite(c.items, base.rep, { tol: dev.mergeTolerance, keep: dev.mergeKeeps }),
    [c.items, base.rep, dev.mergeTolerance, dev.mergeKeeps]
  );
  const notes = merged.notes.length;
  const lit = lightItem
    ? merged.notes.filter((x) => x.origins.includes(lightItem)).map((x) => x.note.c)
    : [];
  return (
    <li className={classes.compRow} data-composite={c.id}>
      <div className={classes.compHead}>
        <span className={classes.compNum} aria-hidden="true">
          {c.id}
        </span>
        <CompositeRing
          repC={merged.rep.c}
          notes={centsOfNotes(merged.notes.map((x) => x.note))}
          lit={lit}
          label={`${c.name}: ${notes} merged ${notes === 1 ? 'note' : 'notes'}`}
        />
        <span className={classes.compText}>
          <CompName c={c} />
          <span className={classes.slotCount}>
            <Num muted>
              {notes} {notes === 1 ? 'note' : 'notes'}
              {' · '}
              {c.items.length} {c.items.length === 1 ? 'item' : 'items'}
            </Num>
          </span>
        </span>
      </div>
      <div className={classes.compActions}>
        <Button
          size="compact-xs"
          variant="default"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} the items of ${c.name}`}
          rightSection={<ChevronDownIcon />}
          onClick={() => setOpen((o) => !o)}
        >
          Items
        </Button>
        <Tip k="compositeOpen" as="control">
          <Button
            size="compact-xs"
            variant="default"
            aria-label={`Open ${c.name} as a tab`}
            disabled={c.items.length === 0}
            onClick={() =>
              dispatch({
                type: 'composite/openTab',
                id: c.id,
                merge: { tol: dev.mergeTolerance, keep: dev.mergeKeeps },
              })
            }
          >
            Open as tab
          </Button>
        </Tip>
        <Button
          size="compact-xs"
          variant="default"
          color={confirming ? 'red' : undefined}
          aria-label={confirming ? `Confirm delete ${c.name}` : `Delete ${c.name}`}
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              dispatch({ type: 'composite/delete', id: c.id });
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
          {confirming ? 'Delete?' : 'Delete'}
        </Button>
      </div>
      {open && (
        <ul className={classes.compItems} aria-label={`Items of ${c.name}`}>
          {c.items.length === 0 ? (
            <li className={classes.compNote}>
              Empty. Point at a chord, subset or note and press - to send it here.
            </li>
          ) : (
            c.items.map((it) => <ItemRow key={it.id} c={c} it={it} onLight={setLightItem} />)
          )}
        </ul>
      )}
    </li>
  );
}

export function CompositesPanel() {
  const { state, dispatch } = useLab();
  const { list, lastAdded, refusal } = state.composites;
  const added = lastAdded
    ? list.find((c) => c.id === lastAdded.composite)?.items.find((it) => it.id === lastAdded.item)
    : undefined;
  const addedTo = lastAdded ? list.find((c) => c.id === lastAdded.composite) : undefined;
  return (
    <>
      <Strip title={<Tip k="compositesPanel">Composites</Tip>}>
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<PlusIcon />}
          onClick={() => dispatch({ type: 'composite/new', date: new Date().toISOString() })}
        >
          New composite
        </Button>
      </Strip>
      <div className={classes.panelBody}>
        {refusal && (
          <span className={classes.shelfRefusal} role="alert">
            {refusal.reason}
          </span>
        )}
        {!refusal && added && addedTo && (
          <span className={classes.hint} role="status" data-testid="composite-added">
            Added {added.label} to {addedTo.name}.
          </span>
        )}
        {list.length === 0 ? (
          <span className={classes.hint} role="status">
            No composites yet. Point at a chord chip, a shelf chord, a saved subset, a key ring or a
            note and press - (or right-click) to send it to a composite; or press New composite.
          </span>
        ) : (
          <ul className={classes.compList} aria-label="Composites">
            {list.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

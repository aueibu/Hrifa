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

/** The extra lines of a chord or selection item (M8d): template and root, positional pattern and tail, the cents list (derived from the pitches), and the source. */
export function itemDetailLines(it: CompositeItem): { key: string; text: string }[] {
  if (it.kind !== 'chord' && it.kind !== 'selection') {
    return [];
  }
  const d = it.detail;
  const lines: { key: string; text: string }[] = [];
  const what = [d?.template, d?.root ? `on ${d.root}` : null].filter(Boolean).join(' ');
  if (what) {
    lines.push({ key: 'what', text: what });
  }
  const pos = [d?.pattern ? `pattern ${d.pattern}` : null, d?.tail].filter(Boolean).join(' · ');
  if (pos) {
    lines.push({ key: 'pos', text: pos });
  }
  lines.push({ key: 'cents', text: `${centsList(it.pitches).join(', ')} c` });
  if (it.source) {
    const gen = it.source.gen.preset || autoName(it.source.gen);
    lines.push({ key: 'source', text: `Source: ${gen}, tab ${it.source.tab || 'unnamed'}` });
  }
  return lines;
}

function ItemRow({ c, it }: { c: Composite; it: CompositeItem }) {
  const { dispatch } = useLab();
  const hover = useSendHover(`ci:${c.id}:${it.id}`, () => compositeItemItem(it));
  const n = it.pitches.length;
  const lines = itemDetailLines(it);
  return (
    <li className={classes.compItem} onMouseEnter={hover.enter} onMouseLeave={hover.leave}>
      <span className={classes.compItemText}>
        <span className={classes.compItemLabel}>{it.label}</span>
        <span className={classes.compOrigin}>
          {it.kind}, {n} {n === 1 ? 'note' : 'notes'}
          {it.source ? ` · from ${it.source.tab || 'a tab'}` : ''}
        </span>
        {lines.map((l) => (
          <span key={l.key} className={classes.compDetail} data-detail={l.key}>
            {l.text}
          </span>
        ))}
      </span>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={`Remove ${it.label} from ${c.name}`}
        onClick={() =>
          dispatch({
            type: 'composite/removeItem',
            id: c.id,
            item: it.id,
            date: new Date().toISOString(),
          })
        }
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
  const merged = useMemo(
    () => mergeComposite(c.items, base.rep, { tol: dev.mergeTolerance, keep: dev.mergeKeeps }),
    [c.items, base.rep, dev.mergeTolerance, dev.mergeKeeps]
  );
  const notes = merged.notes.length;
  return (
    <li className={classes.compRow} data-composite={c.id}>
      <div className={classes.compHead}>
        <span className={classes.compNum} aria-hidden="true">
          {c.id}
        </span>
        <CompositeRing
          repC={merged.rep.c}
          notes={centsOfNotes(merged.notes.map((x) => x.note))}
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
            c.items.map((it) => <ItemRow key={it.id} c={c} it={it} />)
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

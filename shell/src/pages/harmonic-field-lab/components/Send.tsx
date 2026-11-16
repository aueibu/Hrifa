/**
 * Sending things to composites (M8c step 2): the hover registry hook the sources use, the `-` popup (digits 1 to 9 pick a
 * composite, 0 a new one, Esc cancels), the right-click menu ("Send to composite" with the three most recently used
 * composites, a divider, New composite, All composites), and the brief confirmation line. The data layer is
 * `state/composites.ts`; this file only builds items and dispatches `composite/addItem`.
 *
 * Key rules: `-` is plain (no Ctrl/Alt/Meta/Shift), never while typing, ignores key repeat, and does nothing without a hovered
 * source. While the popup is open it takes the digits first (`sendHasKey` in `useLabAudio.ts` makes the hold previews, Parallel |
 * Relative on 0 and Alt+digit tabs stand aside) and everything else keeps working. The popup closes on send, Esc, `-` again, window
 * blur, tab switch and an outside click; the pointer leaving the target does NOT close it (the item is captured at open).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Menu, SegmentedControl } from '@mantine/core';
import { samePitches, type Note } from '../../../lib/harmonic-field';
import { isTyping } from '../audio/keymap';
import { SHORTCUTS } from '../audio/shortcuts';
import type { ShelfChord } from '../state/chordShelf';
import {
  freeCompositeId,
  type Composite,
  type CompositeItem,
  type ItemInput,
} from '../state/composites';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { generateField, type GenSpec } from '../state/generate';
import { ownerGen, ownerLabel, type LibSubset } from '../state/generatorLibrary';
import { tabName } from '../state/labState';
import {
  effectiveSendMode,
  otherSendMode,
  pitchRows,
  previewSend,
  sendModeOf,
  sendModeReason,
  sendPitches,
  type SendMode,
} from '../state/sendMode';
import {
  closeSendMenu,
  closeSendPopup,
  enterSend,
  hoveredSend,
  hoveredSendAt,
  setPendingSendNote,
  showSendNote,
  takePendingSendNote,
  isSendOpen,
  leaveSend,
  markSendKey,
  noteIsMouse,
  setPopupMode,
  setSendInput,
  openSendMenu,
  openSendPopup,
  resetSend,
  sendView,
  useSendView,
  type SendGetter,
  type SendItem,
} from '../state/sendStore';
import { CompositeRing, centsOfNotes } from './CompositeRing';
import { Num, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What kind of thing it is and how big, e.g. "chord, 3 notes" or "single note". */
export const kindText = (item: SendItem): string =>
  item.kind === 'note' ? 'single note' : `${item.kind}, ${plural(item.pitches.length, 'note')}`;

/** Hover registration for a source: call `enter` on mouse enter and `leave` on mouse leave (the item is built when needed). */
export function useSendHover(id: string, make: SendGetter) {
  const ref = useRef(make);
  ref.current = make;
  useEffect(() => () => leaveSend(id), [id]);
  return useMemo(
    () => ({
      enter: (e?: { currentTarget: EventTarget }) =>
        enterSend(
          id,
          () => ref.current(),
          e?.currentTarget instanceof Element ? e.currentTarget : undefined
        ),
      leave: () => leaveSend(id),
    }),
    [id]
  );
}

const plainNote = (p: Note): Note => ({ m: p.m ? { ...p.m } : null, c: p.c });

/** The repeat a generator builds with (null when it does not build). */
export function repOfGen(g: GenSpec): Note | null {
  const r = generateField(g);
  return r.ok ? plainNote(r.rep) : null;
}

/**
 * A shelf chord as an item: its stored exact pitches, and the generator and tab it was stashed from (not the active tab's). It is
 * FIXED (M8d): it always sends exactly the pitches it stored, so the Field | Exact mode does not apply to it.
 */
export function shelfChordItem(c: ShelfChord): SendItem {
  return {
    kind: 'chord',
    label: c.name,
    pitches: c.pitches.map(plainNote),
    fixed: true,
    fixedReason: 'A stashed shelf chord always sends exactly the pitches it was stashed with.',
    detail: {
      template: c.pattern ? null : c.template,
      root: c.rootDeg === null ? null : `degree ${c.rootDeg + 1}`,
      pattern: c.pattern,
      tail: c.tail,
    },
    rep: c.source ? repOfGen(c.source.gen) : null,
    source: c.source ? { gen: c.source.gen, tab: c.source.tab, date: c.date } : null,
  };
}

/** A saved subset as an item: its OWNER generator (rows of other generators show under "All"), not the active tab's. */
export function subsetItem(s: LibSubset, lib: Parameters<typeof ownerGen>[0]): SendItem {
  const gen = ownerGen(lib, s.owner);
  return {
    kind: 'subset',
    label: s.name,
    pitches: s.pitches.map(plainNote),
    rep: gen ? repOfGen(gen) : null,
    source: gen ? { gen, tab: ownerLabel(lib, s.owner), date: new Date().toISOString() } : null,
    root: s.root ? plainNote(s.root) : null,
  };
}

/** A composite item as an item again: it keeps its original source and repeat. */
export function compositeItemItem(it: CompositeItem): SendItem {
  return {
    kind: it.kind,
    label: it.label,
    pitches: it.pitches.map(plainNote),
    rep: it.rep,
    source: it.source,
    detail: it.detail,
    root: it.root ?? null,
  };
}

/** The single note under the pointer in any ring, strip, lattice or table (`lab.hover`), as an item. */
function noteItem(lab: ReturnType<typeof useLab>): SendItem | null {
  const i = lab.hover;
  const n = i === null ? undefined : lab.base.field[i];
  if (i === null || !n) {
    return null;
  }
  return {
    kind: 'note',
    label: `${lab.base.ratios[i]} (${n.c.toFixed(1)} c)`,
    pitches: [{ m: n.m ? { ...n.m } : null, c: n.c }],
    rep: lab.base.rep,
  };
}

/**
 * Send item(s) to a composite (a number, or 'new'). Provenance and repeat come from the ITEM (`source`, `rep`) when it says
 * where it came from; the active tab is used only when the item leaves them undefined (chips, key rings, notes). Several items
 * at once: duplicates (already in the target, or repeated in the list) are skipped and summarised, never silently lost.
 */
export function useSendTo() {
  const lab = useLab();
  return useCallback(
    (items: SendItem | readonly SendItem[], to: number | 'new', mode?: SendMode) => {
      const m = mode ?? sendModeOf(lab.state.shelf.sketch);
      const many = Array.isArray(items);
      let list = many ? (items as readonly SendItem[]) : [items as SendItem];
      const date = new Date().toISOString();
      const active = { gen: lab.tab.gen, tab: tabName(lab.tab), date };
      const make = (it: SendItem): ItemInput => ({
        kind: it.kind,
        label: it.label,
        pitches: sendPitches(it, m),
        rep: it.rep ?? lab.base.rep,
        source: it.source === undefined ? active : it.source,
        detail: it.detail,
        root: it.root,
      });
      let target = to;
      if (many && list.length > 1) {
        const target0 =
          typeof to === 'number' ? lab.state.composites.list.find((c) => c.id === to) : undefined;
        const kept: SendItem[] = [];
        for (const it of list) {
          const dup =
            kept.some((k) => samePitches(sendPitches(k, m), sendPitches(it, m))) ||
            (target0?.items.some((x) => samePitches(x.pitches, sendPitches(it, m))) ?? false);
          if (!dup) {
            kept.push(it);
          }
        }
        const skipped = list.length - kept.length;
        if (kept.length === 0) {
          showSendNote(
            `Nothing added: ${skipped === 1 ? 'it is' : `all ${skipped} are`} already in ${target0?.name ?? 'the composite'}.`,
            true
          );
          return;
        }
        list = kept;
        if (skipped > 0) {
          setPendingSendNote(`${kept.length} added, ${skipped} already there.`);
        }
      }
      if (to === 'new' && list.length > 1) {
        // one new composite for all of them
        const id = freeCompositeId(lab.state.composites.list);
        if (id === null) {
          lab.dispatch({ type: 'composite/addItem', to: 'new', item: make(list[0]), date });
          return;
        }
        lab.dispatch({ type: 'composite/new', date });
        target = id;
      }
      for (const it of list) {
        lab.dispatch({ type: 'composite/addItem', to: target, item: make(it), date });
      }
    },
    [lab]
  );
}

/** The popup's preview of one composite: what adding `item` does to it. */
function previewFor(
  c: Composite,
  item: SendItem,
  baseRep: Note,
  tol: number,
  keep: 'first' | 'recent',
  mode: SendMode
) {
  return previewSend(c.items, item, mode, c.items.length ? baseRep : (item.rep ?? baseRep), {
    tol,
    keep,
  });
}

function PopupRow({
  digit,
  c,
  item,
  mode,
}: {
  digit: number;
  c: Composite;
  item: SendItem;
  /** The popup's own Field | Exact choice. */
  mode: SendMode;
}) {
  const lab = useLab();
  const [dev] = useLabDeveloperOptions();
  const send = useSendTo();
  const p = useMemo(
    () => previewFor(c, item, lab.base.rep, dev.mergeTolerance, dev.mergeKeeps, mode),
    [c, item, lab.base.rep, dev.mergeTolerance, dev.mergeKeeps, mode]
  );
  const effect = p.already
    ? `already in composite ${c.id}`
    : `${p.added.length} new, ${p.common.length} common${p.dropped.length ? `, ${p.dropped.length} dropped` : ''}`;
  return (
    <li>
      <button
        type="button"
        className={classes.sendRow}
        data-already={p.already || undefined}
        aria-disabled={p.already || undefined}
        aria-label={`${digit}: ${c.name}, ${plural(p.before.length, 'note')}, ${effect}`}
        onClick={() => {
          if (!p.already) {
            send(item, c.id, mode);
            closeSendPopup();
          }
        }}
      >
        <kbd className={classes.sendKey}>{digit}</kbd>
        <CompositeRing
          big
          repC={p.rep.c}
          notes={centsOfNotes(p.before.map((n) => n.note))}
          added={centsOfNotes(p.added)}
          common={centsOfNotes(p.common.map((x) => x.into))}
          dropped={centsOfNotes(p.dropped)}
          label={`${c.name} with the item: ${effect}`}
        />
        <span className={classes.sendText}>
          <span className={classes.sendName}>{c.name}</span>
          <span className={classes.sendEffect}>{effect}</span>
          <span className={classes.sendEffect} data-testid="merged-count">
            {plural(p.before.length, 'merged note')} now
            {p.already ? '' : `, ${plural(p.before.length + p.added.length, 'merged note')} after`}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The popup's own Field | Exact slider: starts on the shelf's choice, disabled (with the reason) when the mode does not apply. */
function ModeSwitch({ item, mode }: { item: SendItem; mode: SendMode }) {
  const reason = sendModeReason(item);
  const eff = effectiveSendMode(item, mode);
  return (
    <div className={classes.sendMode}>
      <SegmentedControl
        size="xs"
        aria-label="Send mode"
        disabled={reason !== null}
        data={['Field', 'Exact']}
        value={eff === 'exact' ? 'Exact' : 'Field'}
        onChange={(v) => setPopupMode(v === 'Exact' ? 'exact' : 'field')}
        className={labClasses.tinySeg}
      />
      <span className={classes.sendEffect} data-testid="send-mode-note">
        {reason ?? 'Press E to flip it.'}
      </span>
    </div>
  );
}

/** The stats panel: the pitches the item sends in the chosen mode as text (cents; ratio and monzo when exact), and the counts. */
function PitchStats({ item, mode }: { item: SendItem; mode: SendMode }) {
  const eff = effectiveSendMode(item, mode);
  const rows = pitchRows(sendPitches(item, mode), eff === 'exact');
  return (
    <div className={classes.sendStats} role="group" aria-label="Pitch values">
      <span className={classes.sendEffect}>
        {plural(rows.length, 'note')}, {eff === 'exact' ? 'exact ratios' : 'field notes'}
      </span>
      <ol className={classes.sendPitches}>
        {rows.map((r, i) => (
          <li key={i} className={classes.sendPitch}>
            <Num>{r.cents}</Num>
            {r.ratio && <Num muted>{r.ratio}</Num>}
            {r.monzo && <Num muted>[{r.monzo}]</Num>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SendPopup({
  item,
  at,
  mode,
}: {
  item: SendItem;
  at: { x: number; y: number };
  mode: SendMode;
}) {
  const lab = useLab();
  const send = useSendTo();
  const list = lab.state.composites.list;
  const left = Math.max(8, Math.min(at.x + 14, window.innerWidth - 420));
  const top = Math.max(8, Math.min(at.y + 14, window.innerHeight - 560));
  return (
    <div
      className={classes.sendPopup}
      role="dialog"
      aria-label="Send to composite"
      style={{ left, top }}
    >
      <div className={classes.sendHead}>
        Add <strong>{item.label}</strong>{' '}
        <span className={classes.sendKind}>({kindText(item)})</span>
      </div>
      <ModeSwitch item={item} mode={mode} />
      <PitchStats item={item} mode={mode} />
      <ul className={classes.sendList}>
        {list.map((c) => (
          <PopupRow key={c.id} digit={c.id} c={c} item={item} mode={mode} />
        ))}
        <li>
          <button
            type="button"
            className={classes.sendRow}
            aria-label="0: New composite"
            onClick={() => {
              send(item, 'new', mode);
              closeSendPopup();
            }}
          >
            <kbd className={classes.sendKey}>0</kbd>
            <span className={classes.sendText}>
              <span className={classes.sendName}>New composite</span>
              <span className={classes.sendEffect}>starts with this item</span>
            </span>
          </button>
        </li>
      </ul>
      <div className={classes.sendFoot}>
        1 to 9 send, 0 starts a new composite, E flips Field | Exact, Esc cancels. Notes: the small
        dots are already in it, a plus is new, filled merges into a note, struck through is dropped.
      </div>
    </div>
  );
}

/** The composite rows of a menu: number and name, "already" ones disabled. */
function CompositeItems({
  ids,
  item,
  mode,
  onPick,
}: {
  ids: readonly number[];
  item?: SendItem;
  /** The mode the item will be sent in (the menu's chosen mode): the already-in-it check compares those pitches. */
  mode?: SendMode;
  onPick: (id: number, shift: boolean) => void;
}) {
  const { state } = useLab();
  return (
    <>
      {ids.map((id) => {
        const c = state.composites.list.find((x) => x.id === id);
        if (!c) {
          return null;
        }
        const m = mode ?? sendModeOf(state.shelf.sketch);
        const inIt = (md: SendMode) =>
          item ? c.items.some((it) => samePitches(it.pitches, sendPitches(item, md))) : false;
        const has = inIt(m);
        // Shift+click sends in the OTHER mode: the entry is only disabled when both modes are already in it; a plain click on
        // an entry that is in it in the menu's mode is refused visibly by the add itself
        const flips = item !== undefined && sendModeReason(item) === null;
        const both = has && (!flips || inIt(otherSendMode(m)));
        return (
          <Menu.Item key={id} disabled={both} onClick={(e) => onPick(id, e.shiftKey)}>
            {c.id} {c.name}
            {both
              ? ' (already in it)'
              : has
                ? ' (already in it; Shift+click sends the other mode)'
                : ''}
          </Menu.Item>
        );
      })}
    </>
  );
}

/** "Stash on shelf": the chord chips' second menu entry (the same as their + button). */
function StashEntry({ item }: { item: SendItem }) {
  const { dispatch } = useLab();
  return (
    <Menu.Item
      onClick={() => {
        if (item.stash) {
          dispatch({
            type: 'shelf/stash',
            stash: { ...item.stash, date: new Date().toISOString() },
          });
        }
        closeSendMenu();
      }}
    >
      Stash on shelf
    </Menu.Item>
  );
}

/** "Send to composite" with the three most recent at the top, a divider, New composite and All composites. */
function SendMenuBody({ item }: { item: SendItem }) {
  const { state } = useLab();
  const send = useSendTo();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const have = new Set(state.composites.list.map((c) => c.id));
  const recent = state.composites.recent.filter((id) => have.has(id)).slice(0, 3);
  // the menu's chosen mode is the shelf's switch; Shift+click sends in the OTHER mode (it only differs for items with an exact form)
  const mode = sendModeOf(state.shelf.sketch);
  const pick = (to: number | 'new', shift = false) => {
    send(item, to, shift ? otherSendMode(mode) : mode);
    closeSendMenu();
  };
  const canFlip = sendModeReason(item) === null;
  return (
    <Menu.Sub opened={open} onChange={setOpen} position="right-start">
      <Menu.Sub.Target>
        <Menu.Sub.Item rightSection="›" onClick={() => setOpen((o) => !o)}>
          Send to composite
        </Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown>
        {canFlip && (
          <Menu.Label>
            {mode === 'exact' ? 'Exact' : 'Field'}. Shift+click sends as{' '}
            {otherSendMode(mode) === 'exact' ? 'Exact' : 'Field'}.
          </Menu.Label>
        )}
        <CompositeItems ids={recent} item={item} mode={mode} onPick={pick} />
        <Menu.Divider />
        <Menu.Item onClick={(e) => pick('new', e.shiftKey)}>New composite</Menu.Item>
        <Menu.Sub opened={all} onChange={setAll} position="right-start">
          <Menu.Sub.Target>
            <Menu.Sub.Item
              rightSection="›"
              disabled={state.composites.list.length === 0}
              onClick={() => setAll((o) => !o)}
            >
              All composites
            </Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            <CompositeItems
              ids={state.composites.list.map((c) => c.id)}
              item={item}
              mode={mode}
              onPick={pick}
            />
          </Menu.Sub.Dropdown>
        </Menu.Sub>
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
}

/** The menu button of the shelf strip: send the ticked chords (each its own item) to a composite or a new one. */
export function SendMany({ items, disabled }: { items: SendItem[]; disabled: boolean }) {
  const { state } = useLab();
  const send = useSendTo();
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Button
          size="compact-xs"
          variant="default"
          disabled={disabled}
          aria-label="Add selected to composite"
        >
          Add selected to composite ›
        </Button>
      </Menu.Target>
      <Menu.Dropdown aria-label="Add selected to composite menu">
        <CompositeItems
          ids={state.composites.list.map((c) => c.id)}
          onPick={(id) => send(items, id)}
        />
        {state.composites.list.length > 0 && <Menu.Divider />}
        <Menu.Item onClick={() => send(items, 'new')}>New composite</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** Mounted once inside the provider: the `-` key, the right-click menu, the popup and the brief confirmation. */
export function SendLayer() {
  const lab = useLab();
  const view = useSendView();
  const send = useSendTo();
  const latest = useRef({ lab, send });
  latest.current = { lab, send };
  const pointer = useRef({ x: 200, y: 200 });
  const [note, setNote] = useState<{ text: string; alert: boolean } | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isSendOpen()) {
        if (e.ctrlKey || e.metaKey) {
          return;
        }
        if (e.key === 'Escape' || e.key === SHORTCUTS.composite) {
          markSendKey(e);
          e.preventDefault();
          closeSendPopup();
          return;
        }
        if (
          e.key.toLowerCase() === SHORTCUTS.sendFlip.toLowerCase() &&
          !e.altKey &&
          !e.shiftKey &&
          !isTyping(e.target)
        ) {
          // E flips Field | Exact, only while the popup is open (no global key): the keyboard notes stand aside too
          markSendKey(e);
          e.preventDefault();
          const v = sendView();
          if (v.popup && !e.repeat && sendModeReason(v.popup) === null) {
            setPopupMode(otherSendMode(v.popupMode));
          }
          return;
        }
        if (/^[0-9]$/.test(e.key)) {
          // the popup owns the digits: the hold previews, 0 (Parallel | Relative) and Alt+digit tabs stand aside
          markSendKey(e);
          e.preventDefault();
          const { popup: item, popupMode: mode } = sendView();
          if (!item || e.altKey || e.repeat) {
            return;
          }
          const n = Number(e.key);
          const { lab: l, send: s } = latest.current;
          if (n === 0) {
            s(item, 'new', mode);
            closeSendPopup();
          } else if (l.state.composites.list.some((c) => c.id === n)) {
            s(item, n, mode);
            closeSendPopup();
          }
        }
        return;
      }
      if (
        e.key !== SHORTCUTS.composite ||
        e.repeat ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.shiftKey ||
        isTyping(e.target)
      ) {
        return;
      }
      const item = hoveredSend() ?? noteItem(latest.current.lab);
      if (item) {
        e.preventDefault();
        openSendPopup(
          item,
          { ...pointer.current },
          sendModeOf(latest.current.lab.state.shelf.sketch)
        );
      }
    };
    const menu = (e: MouseEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) {
        return;
      }
      // the mouse wins: only a source the pointer is inside, or a note the MOUSE put under it; a merely focused one never
      // takes over the browser's menu
      const item = hoveredSendAt(e.target) ?? (noteIsMouse() ? noteItem(latest.current.lab) : null);
      if (item) {
        e.preventDefault();
        closeSendPopup();
        openSendMenu(item, e.clientX, e.clientY);
      }
    };
    const move = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const mouse = () => {
      setSendInput('mouse');
    };
    const focus = () => {
      setSendInput('focus');
    };
    const away = () => {
      closeSendPopup();
      closeSendMenu();
    };
    const outside = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (isSendOpen() && !t?.closest?.('[role="dialog"][aria-label="Send to composite"]')) {
        closeSendPopup();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('contextmenu', menu);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseover', mouse, true);
    window.addEventListener('focusin', focus, true);
    window.addEventListener('mousedown', outside);
    window.addEventListener('blur', away);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('contextmenu', menu);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', mouse, true);
      window.removeEventListener('focusin', focus, true);
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('blur', away);
      resetSend();
    };
  }, []);

  // switching tab ends the popup (its preview was of the old tab's repeat)
  useEffect(() => {
    closeSendPopup();
  }, [lab.state.active, lab.tab.id]);

  // the brief confirmation (or the refusal) of the last action
  const { lastAdded, refusal, list } = lab.state.composites;
  useEffect(() => {
    if (!lastAdded) {
      return;
    }
    const c = list.find((x) => x.id === lastAdded.composite);
    const it = c?.items.find((x) => x.id === lastAdded.item);
    const summary = takePendingSendNote();
    setNote({
      text: summary ?? `Added ${it?.label ?? 'the item'} to ${c?.name ?? 'the composite'}.`,
      alert: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAdded]);
  useEffect(() => {
    if (view.note) {
      setNote({ text: view.note.text, alert: view.note.alert });
    }
  }, [view.note]);
  useEffect(() => {
    if (refusal) {
      setNote({ text: refusal.reason, alert: true });
    }
  }, [refusal]);
  useEffect(() => {
    if (!note) {
      return;
    }
    const t = window.setTimeout(() => setNote(null), 3500);
    return () => window.clearTimeout(t);
  }, [note]);

  return (
    <>
      {view.popup && <SendPopup item={view.popup} at={view.popupAt} mode={view.popupMode} />}
      {view.menu && (
        <Menu
          opened
          onChange={(o) => {
            if (!o) {
              closeSendMenu();
            }
          }}
          position="bottom-start"
          withinPortal
        >
          <Menu.Target>
            <span
              aria-hidden="true"
              style={{
                position: 'fixed',
                left: view.menu.x,
                top: view.menu.y,
                width: 1,
                height: 1,
              }}
            />
          </Menu.Target>
          <Menu.Dropdown aria-label="Send menu">
            {view.menu.item.stash && <StashEntry item={view.menu.item} />}
            <SendMenuBody item={view.menu.item} />
          </Menu.Dropdown>
        </Menu>
      )}
      {note && (
        <div className={classes.sendNote} data-alert={note.alert || undefined} role="status">
          {note.text}
        </div>
      )}
    </>
  );
}

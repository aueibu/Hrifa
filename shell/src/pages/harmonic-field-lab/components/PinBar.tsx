/**
 * M8f: the Relative picker's interval pin bar. A grid of saved intervals anchored at the bottom right of the window. The column count
 * is measured: as many 5.25rem columns (1 to `PIN_COLS`) as fit in the free space to the right of the picker (ring and footer), so a
 * narrow window gets 2 and an ultrawide up to 8. The block grows upward; once it reaches the free height (window minus the modal
 * header) it scrolls. The collapse button folds it into a small "Pins N" tab; hovering the tab peeks the bar open over the picker
 * (it closes when the pointer leaves the bar), a click on the tab or on the expand button opens it for good. Collapsed is runtime
 * only. One list per kind: ring pins show ratios (`81/80`), monzo pins show their bra-ket (`[-4 4 -1>`). A click adds the interval
 * (the modal decides how; Alt = below), hovering previews it, x removes, Delete all (header) uses the two-click confirm.
 *
 * Drag (the shared `components/Sortable` layer, H-36; starts after 4 px, so a plain click still adds; Escape cancels; Space and the arrow
 * keys reorder from the keyboard): the other cards slide into the new order while a copy of the card follows the pointer, and the order
 * on screen is what the drop produces (`movePin`: `to` is the final index). Resting on a card for `SWAP_DWELL_MS` (0.8 s) turns it into a swap
 * target (outlined; the others snap back, the trade is shown; `swapPins`); moving on resumes the live order.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionIcon, Button } from '@mantine/core';
import { Sortable, SortableItem, type Move } from '../../../components/Sortable';
import { PIN_COLS, braKet, movePin, removePin, swapPins, type PinKind } from '../state/pins';
import { ChevronDownIcon, CloseIcon } from './icons';
import { Hint } from './ui';
import labClasses from './lab.module.css';
import classes from './pinBar.module.css';

const FLASH_MS = 700;
const ICON_BOX = 20;
/** A text longer than this does not fit one 5.25rem slot (tabular figures at the small lab size): its card spans 2 slots. */
const LONG_TEXT = 8;
// the bar's box in rem, kept in step with pinBar.module.css (.bar padding and border, .grid gap, .slot width)
const SLOT_REM = 5.25;
const GAP_REM = 0.25;
const CHROME_REM = 0.75;
const BORDER_PX = 2;
const MARGIN_REM = 0.75;
/** Space kept between the picker and the bar. */
const CLEAR_PX = 8;

export interface PinBarProps {
  kind: PinKind;
  list: readonly string[];
  max: number;
  onList: (next: string[]) => void;
  /** The pointer (or focus) is on a card: preview it. `alt` is read from the event. */
  onEnter: (text: string, alt: boolean) => void;
  onLeave: () => void;
  /** A card was clicked (Alt = below). */
  onAdd: (text: string, alt: boolean) => void;
  /** The card to flash (an interval pinned again); `n` counts the requests. */
  flash: { text: string; n: number } | null;
  /** The short line shown when a pin is refused. */
  message: string | null;
  /** The picker body: the bar measures the free space to the right of it (and of its footer, its siblings) and below the modal header. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** A drag is in progress (the modal must not close on the Escape that cancels it). */
  onDragActive?: (active: boolean) => void;
}

interface Space {
  cols: number;
  maxH: number | null;
}

const cardText = (kind: PinKind, text: string): string =>
  kind === 'monzo' ? (braKet(text) ?? text) : text;

/** The columns that fit in `free` px of width (1 to `PIN_COLS`). */
export function fitColumns(free: number, rem: number): number {
  const chrome = 2 * CHROME_REM * rem + BORDER_PX;
  const col = SLOT_REM * rem;
  const gap = GAP_REM * rem;
  const n = Math.floor((free - chrome + gap) / (col + gap));
  return Math.max(1, Math.min(PIN_COLS, n));
}

export function PinBar({
  kind,
  list,
  max,
  onList,
  onEnter,
  onLeave,
  onAdd,
  flash,
  message,
  anchorRef,
  onDragActive,
}: PinBarProps) {
  const noun = kind === 'monzo' ? 'monzo' : 'ring';
  const [confirmAll, setConfirmAll] = useState(false);
  const [flashText, setFlashText] = useState<string | null>(null);
  // runtime only: not part of settings.v1
  const [collapsed, setCollapsed] = useState(false);
  const [peek, setPeek] = useState(false);
  const [space, setSpace] = useState<Space>({ cols: PIN_COLS, maxH: null });
  const barRef = useRef<HTMLDivElement>(null);
  const listRef = useRef(list);
  listRef.current = list;
  const onListRef = useRef(onList);
  onListRef.current = onList;
  const dragging = useRef(false);

  // the free width to the right of the picker and the free height under the modal header, measured, not guessed
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return undefined;
    }
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const parent = anchor.parentElement;
      let right = anchor.getBoundingClientRect().right;
      let top = anchor.getBoundingClientRect().top;
      for (const el of Array.from(parent?.children ?? [])) {
        if (el === barRef.current || el.contains(barRef.current)) {
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width > 0 && getComputedStyle(el).position !== 'fixed') {
          right = Math.max(right, r.right);
          top = Math.min(top, r.top);
        }
      }
      const free = window.innerWidth - right - MARGIN_REM * rem - CLEAR_PX;
      const maxH = window.innerHeight - MARGIN_REM * rem - Math.max(0, top);
      setSpace((s) => {
        const cols = fitColumns(free, rem);
        const h = maxH > 80 ? Math.floor(maxH) : null;
        return s.cols === cols && s.maxH === h ? s : { cols, maxH: h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(anchor);
    if (anchor.parentElement) {
      ro.observe(anchor.parentElement);
    }
    // the picker re-centers when the window resizes
    ro.observe(document.documentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [anchorRef]);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }
    setFlashText(flash.text);
    const t = window.setTimeout(() => setFlashText(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);
  // a list that shrinks under an armed confirm (a card removed) cancels it
  useEffect(() => {
    if (list.length === 0) {
      setConfirmAll(false);
    }
  }, [list.length]);
  // the other kind's bar is a different list
  useEffect(() => {
    setConfirmAll(false);
  }, [kind]);

  // a drag started or ended (the modal must not close on the Escape that cancels it)
  const onActiveChange = (active: boolean) => {
    dragging.current = active;
    onDragActive?.(active);
    // a peek stays open only while the pointer is on the bar
    if (!active && barRef.current && !barRef.current.matches(':hover')) {
      setPeek(false);
    }
  };
  const onMove = ({ from, to, kind }: Move) => {
    onListRef.current(
      kind === 'insert' ? movePin(listRef.current, from, to) : swapPins(listRef.current, from, to)
    );
  };

  const showFull = !collapsed || peek;
  if (!showFull) {
    return (
      <Hint label={`Show the pinned ${noun} intervals`}>
        <button
          type="button"
          className={classes.tab}
          data-testid="pin-tab"
          aria-label={`Show pins (${list.length})`}
          onMouseEnter={() => setPeek(true)}
          onClick={() => {
            setCollapsed(false);
            setPeek(false);
          }}
        >
          <span>Pins {list.length}</span>
          <ChevronDownIcon />
        </button>
      </Hint>
    );
  }

  const cols = Math.min(space.cols, PIN_COLS);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the mouse leave only closes a peek, a pointer nicety
    <div
      ref={barRef}
      className={classes.bar}
      data-testid="pin-bar"
      data-kind={kind}
      data-peek={collapsed ? true : undefined}
      role="group"
      aria-label={`Pinned ${noun} intervals`}
      style={{ maxHeight: space.maxH ?? undefined }}
      onMouseLeave={() => {
        if (collapsed && !dragging.current) {
          setPeek(false);
        }
      }}
    >
      <div
        className={classes.head}
        style={{ width: `${cols * SLOT_REM + (cols - 1) * GAP_REM}rem` }}
      >
        <Hint k="pinBar">
          <span className={classes.caption} role="status" data-warn={message ? true : undefined}>
            {message ?? `Pins ${list.length}/${max}`}
          </span>
        </Hint>
        <span className={classes.headBtns}>
          <Hint label={`Delete all ${noun} pins. Click twice to confirm.`}>
            <Button
              size="compact-xs"
              variant="default"
              color={confirmAll ? 'red' : undefined}
              className={labClasses.dangerHover}
              // aria-disabled, not `disabled`: a disabled button drops keyboard focus after the confirm
              data-disabled={list.length === 0 ? true : undefined}
              aria-disabled={list.length === 0}
              aria-label={
                confirmAll
                  ? `Confirm delete all ${list.length} ${noun} pins`
                  : `Delete all ${noun} pins`
              }
              data-testid="pin-delete-all"
              onClick={() => {
                if (list.length === 0) {
                  return;
                }
                if (confirmAll) {
                  setConfirmAll(false);
                  onList([]);
                } else {
                  setConfirmAll(true);
                }
              }}
              onBlur={() => setConfirmAll(false)}
              onMouseLeave={() => setConfirmAll(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setConfirmAll(false);
                }
              }}
            >
              {confirmAll ? `Delete all ${list.length}?` : 'Delete all'}
            </Button>
          </Hint>
          <Hint label={collapsed ? 'Keep the pin bar open' : 'Collapse the pin bar to a small tab'}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={ICON_BOX}
              aria-label={collapsed ? 'Expand the pin bar' : 'Collapse the pin bar'}
              aria-expanded={!collapsed}
              data-testid="pin-collapse"
              onClick={() => {
                setCollapsed(!collapsed);
                setPeek(false);
              }}
            >
              <span className={classes.chev} data-collapsed={collapsed ? true : undefined}>
                <ChevronDownIcon />
              </span>
            </ActionIcon>
          </Hint>
        </span>
      </div>
      <Sortable
        id={`pins-${kind}`}
        items={list}
        layout="grid"
        onMove={onMove}
        onActiveChange={onActiveChange}
        className={classes.grid}
        data-testid="pin-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, ${SLOT_REM}rem)` }}
      >
        {list.map((text) => {
          const shown = cardText(kind, text);
          return (
            <SortableItem
              key={text}
              id={text}
              className={classes.slot}
              style={cols >= 2 && shown.length > LONG_TEXT ? { gridColumn: 'span 2' } : undefined}
              data-flash={flashText === text ? true : undefined}
              onMouseEnter={(e) => onEnter(text, e.altKey)}
              onMouseLeave={onLeave}
            >
              {(handle) => (
                <>
                  <Hint
                    label={`${shown}: click to add it above the source note, Alt+click below. Drag to reorder.`}
                    fit
                  >
                    <button
                      {...handle}
                      type="button"
                      className={classes.card}
                      data-testid="pin-card"
                      aria-label={`Add ${shown} (hold Alt for below)`}
                      onFocus={() => onEnter(text, false)}
                      onBlur={onLeave}
                      onClick={(e) => {
                        // a click here is the card's own: nothing behind it (the page's Alt+click pin) sees it
                        e.stopPropagation();
                        onAdd(text, e.altKey);
                      }}
                    >
                      {shown}
                    </button>
                  </Hint>
                  <Hint label={`Remove ${shown} from the pins`}>
                    <button
                      type="button"
                      className={classes.x}
                      data-no-drag=""
                      aria-label={`Remove ${shown}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLeave();
                        onList(removePin(list, list.indexOf(text)));
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </Hint>
                </>
              )}
            </SortableItem>
          );
        })}
      </Sortable>
    </div>
  );
}

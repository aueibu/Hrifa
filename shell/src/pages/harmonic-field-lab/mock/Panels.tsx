/** Panel renderer and the pinned column wrapper (its buttons live in each panel's own header strip). */
import {
  Fragment,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { ActionIcon } from '@mantine/core';
import { ChordsPanel } from './ChordsPanel';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CloseIcon,
  StackIcon,
  UnstackIcon,
} from './icons';
import { KeysModesPanel } from './KeysModesPanel';
import { LatticePanel } from './LatticePanel';
import {
  SPLIT_DEFAULT,
  canMove,
  canStack,
  clampSplit,
  locate,
  nudgeSplit,
  splitLimits,
  splitOf,
  type Layout,
  type PanelId,
} from './layout';
import { panelLabel } from './Rail';
import { RetunerPanel } from './RetunerPanel';
import { SpectrumPanel } from './SpectrumPanel';
import { PinActionsContext, Tip } from './ui';
import classes from './mock.module.css';

export function renderPanel(id: PanelId, tol: number, setTol: (t: number) => void) {
  switch (id) {
    case 'chords':
      return <ChordsPanel tol={tol} setTol={setTol} />;
    case 'spectrum':
      return <SpectrumPanel />;
    case 'keys':
      return <KeysModesPanel />;
    case 'lattice':
      return <LatticePanel />;
    case 'retuner':
      return <RetunerPanel />;
  }
}

export interface PinHandlers {
  onMove: (id: PanelId, dir: 'left' | 'right') => void;
  onUnpin: (id: PanelId) => void;
  onStack: (id: PanelId) => void;
  onUnstack: (id: PanelId) => void;
  onSwap: (id: PanelId) => void;
  /** Store the top panel's share of the stacked column it tops. */
  onSplit: (topId: PanelId, share: number) => void;
}

interface ColumnProps extends PinHandlers {
  /** One panel, or two stacked (top first). */
  ids: PanelId[];
  layout: Layout;
  render: (id: PanelId) => ReactNode;
}

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
/** Grid rows of a stack: each half keeps at least 6 rem or 20% (the CSS floor), the rest is shared by the split. */
const stackRows = (top: number) =>
  `minmax(max(6rem, 20%), ${top}fr) 0.5rem minmax(max(6rem, 20%), ${1 - top}fr)`;

interface SplitterProps {
  topId: PanelId;
  split: number;
  column: RefObject<HTMLDivElement | null>;
  onSplit: (topId: PanelId, share: number) => void;
}

/**
 * The draggable bar between two stacked panels. Pointer capture drives the grid rows directly while dragging (no
 * re-render per move); the share is committed on release. Keyboard: Up and Down nudge 5%, Home and End jump to the
 * limits; double-click resets to 50/50.
 */
function Splitter({ topId, split, column, onSplit }: SplitterProps) {
  const drag = useRef<{ share: number } | null>(null);
  const heightRem = () => {
    const h = column.current ? column.current.clientHeight / remPx() : 0;
    return h > 0 ? h : 40;
  };
  const { min, max } = splitLimits(heightRem());
  const now = clampSplit(split, heightRem());
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = column.current;
    if (!drag.current || !el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const share = clampSplit((e.clientY - r.top) / r.height, heightRem());
    drag.current.share = share;
    el.style.gridTemplateRows = stackRows(share);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // the pointer may already be released (cancelled, or synthetic events)
    }
    e.currentTarget.removeAttribute('data-drag');
    onSplit(topId, drag.current.share);
    drag.current = null;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      onSplit(topId, nudgeSplit(now, e.key, heightRem()));
    }
  };
  return (
    <Tip k="splitter" as="control" block>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the stacked panels"
        aria-valuenow={Math.round(now * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-valuetext={`Top panel ${Math.round(now * 100)} percent`}
        tabIndex={0}
        className={classes.splitter}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // synthetic pointers cannot be captured; dragging still works while over the bar
          }
          e.currentTarget.setAttribute('data-drag', 'true');
          drag.current = { share: now };
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => onSplit(topId, SPLIT_DEFAULT)}
        onKeyDown={key}
      >
        <span className={classes.splitGrip} aria-hidden="true" />
      </div>
    </Tip>
  );
}

/**
 * One pinned column: a panel, or two stacked panels sharing the height evenly. Each has its own header strip (with its
 * buttons) and scrolls inside itself. The side comes from the layout, so a stack on the left or right needs no prop.
 */
export function PinnedColumn({ ids, layout, render, ...h }: ColumnProps) {
  const column = useRef<HTMLDivElement>(null);
  const stackedColumn = ids.length === 2;
  return (
    <div
      ref={column}
      className={classes.pinStack}
      data-stack={stackedColumn ? 'true' : undefined}
      style={stackedColumn ? { gridTemplateRows: stackRows(splitOf(layout, ids[0])) } : undefined}
    >
      {ids.map((id, i) => {
        const where = locate(layout, id);
        const label = panelLabel(id);
        const stacked = ids.length === 2;
        const actions = (
          <>
            <Tip k="movePin" as="control">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Move ${label} left`}
                disabled={!canMove(layout, id, 'left')}
                onClick={() => h.onMove(id, 'left')}
              >
                <ArrowLeftIcon />
              </ActionIcon>
            </Tip>
            <Tip k="movePin" as="control">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Move ${label} right`}
                disabled={!canMove(layout, id, 'right')}
                onClick={() => h.onMove(id, 'right')}
              >
                <ArrowRightIcon />
              </ActionIcon>
            </Tip>
            {stacked && (
              <Tip k="swapStack" as="control">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={i === 0 ? `Swap ${label} down` : `Swap ${label} up`}
                  onClick={() => h.onSwap(id)}
                >
                  {i === 0 ? <ArrowDownIcon /> : <ArrowUpIcon />}
                </ActionIcon>
              </Tip>
            )}
            {stacked ? (
              <Tip k="unstackPin" as="control">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Unstack ${label}`}
                  onClick={() => h.onUnstack(id)}
                >
                  <UnstackIcon />
                </ActionIcon>
              </Tip>
            ) : (
              canStack(layout, id) && (
                <Tip k="stackPin" as="control">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Stack ${label} with the next column`}
                    onClick={() => h.onStack(id)}
                  >
                    <StackIcon />
                  </ActionIcon>
                </Tip>
              )
            )}
            <Tip k="unpinColumn" as="control">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Unpin ${label}`}
                onClick={() => h.onUnpin(id)}
              >
                <CloseIcon />
              </ActionIcon>
            </Tip>
          </>
        );
        const section = (
          <section
            key={id}
            className={classes.pinned}
            data-side={where?.side}
            aria-label={`${label}, pinned column`}
          >
            <PinActionsContext.Provider value={actions}>{render(id)}</PinActionsContext.Provider>
          </section>
        );
        return i === 1 ? (
          <Fragment key={id}>
            <Splitter
              topId={ids[0]}
              split={splitOf(layout, ids[0])}
              column={column}
              onSplit={h.onSplit}
            />
            {section}
          </Fragment>
        ) : (
          section
        );
      })}
    </div>
  );
}

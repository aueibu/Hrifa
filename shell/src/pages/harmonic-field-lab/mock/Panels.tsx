/** Panel renderer and the pinned column wrapper (its buttons live in each panel's own header strip). */
import {
  Fragment,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { ActionIcon, Menu } from '@mantine/core';
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
import {
  MAX_STACK,
  canMove,
  clampShares,
  dragSplitter,
  evenShares,
  locate,
  nudgeSplitter,
  splitterAt,
  splitterRange,
  stackTargets,
  splitOf,
  type Layout,
  type PanelId,
} from './layout';
import { panelLabel } from './Rail';
import { RetunerPanel } from './RetunerPanel';
import { SpectrumPanel } from './SpectrumPanel';
import { PinActionsContext, Tip } from './ui';
import { VisualizerPanel } from './Visualizer';
import { useViz } from './vizState';
import classes from './mock.module.css';

export function renderPanel(id: PanelId, tol: number, setTol: (t: number) => void) {
  switch (id) {
    case 'chords':
      return <ChordsPanel tol={tol} setTol={setTol} />;
    case 'spectrum':
      return <SpectrumPanel />;
    case 'keys':
      return <KeysModesPanel />;
    case 'viz1':
    case 'viz2':
    case 'viz3':
      return <VisualizerPanel id={id} />;
    case 'retuner':
      return <RetunerPanel />;
  }
}

export interface PinHandlers {
  onMove: (id: PanelId, dir: 'left' | 'right') => void;
  onUnpin: (id: PanelId) => void;
  /** Move a panel to the bottom of another pinned panel's column (a column holds up to three). */
  onStackWith: (id: PanelId, targetId: PanelId) => void;
  onUnstack: (id: PanelId) => void;
  /** Move a panel one slot up or down inside its stack. */
  onMoveInStack: (id: PanelId, dir: 'up' | 'down') => void;
  /** Store the shares of the stacked column the panel tops. */
  onSplit: (topId: PanelId, shares: number[]) => void;
}

interface ColumnProps extends PinHandlers {
  /** One panel, or two or three stacked (top first). */
  ids: PanelId[];
  layout: Layout;
  render: (id: PanelId) => ReactNode;
}

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
/** Grid rows of a stack: panels and 0.5 rem splitter tracks; each panel keeps at least 6 rem or 20% (the CSS floor). */
const stackRows = (shares: readonly number[]) =>
  shares.map((v) => `minmax(max(6rem, 20%), ${v}fr)`).join(' 0.5rem ');

interface SplitterProps {
  topId: PanelId;
  /** Which splitter of the column: 0 is between the first and second panel. */
  index: number;
  shares: number[];
  column: RefObject<HTMLDivElement | null>;
  onSplit: (topId: PanelId, shares: number[]) => void;
}

/**
 * The draggable bar between two stacked panels (a three-panel stack has two). Pointer capture drives the grid rows
 * directly while dragging (no re-render per move); the shares are committed on release. Dragging only trades space
 * between the two panels beside the bar. Keyboard: Up and Down nudge 5%, Home and End jump to the limits; double-click
 * resets the whole column to even shares.
 */
function Splitter({ topId, index, shares, column, onSplit }: SplitterProps) {
  const drag = useRef<{ shares: number[] } | null>(null);
  const heightRem = () => {
    const h = column.current ? column.current.clientHeight / remPx() : 0;
    return h > 0 ? h : 40;
  };
  const now = clampShares(shares, heightRem());
  const { min, max } = splitterRange(now, index, heightRem());
  const at = splitterAt(now, index);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = column.current;
    if (!drag.current || !el) {
      return;
    }
    const r = el.getBoundingClientRect();
    drag.current.shares = dragSplitter(now, index, (e.clientY - r.top) / r.height, heightRem());
    el.style.gridTemplateRows = stackRows(drag.current.shares);
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
    onSplit(topId, drag.current.shares);
    drag.current = null;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      onSplit(topId, nudgeSplitter(now, index, e.key, heightRem()));
    }
  };
  return (
    <Tip k="splitter" as="control" block>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the stacked panels"
        aria-valuenow={Math.round(at * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-valuetext={`${Math.round(at * 100)} percent of the column above this bar`}
        tabIndex={0}
        className={classes.splitter}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // synthetic pointers cannot be captured; dragging still works while over the bar
          }
          e.currentTarget.setAttribute('data-drag', 'true');
          drag.current = { shares: now };
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => onSplit(topId, evenShares(now.length))}
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
  const stackedColumn = ids.length >= 2;
  const viz = useViz();
  return (
    <div
      ref={column}
      className={classes.pinStack}
      data-stack={stackedColumn ? 'true' : undefined}
      style={stackedColumn ? { gridTemplateRows: stackRows(splitOf(layout, ids[0])) } : undefined}
    >
      {ids.map((id, i) => {
        const where = locate(layout, id);
        const label = panelLabel(id, viz.view);
        const stacked = ids.length >= 2;
        const targets = stackTargets(layout, id);
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
            {stacked && i > 0 && (
              <Tip k="swapStack" as="control">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Move ${label} up in the stack`}
                  onClick={() => h.onMoveInStack(id, 'up')}
                >
                  <ArrowUpIcon />
                </ActionIcon>
              </Tip>
            )}
            {stacked && i < ids.length - 1 && (
              <Tip k="swapStack" as="control">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Move ${label} down in the stack`}
                  onClick={() => h.onMoveInStack(id, 'down')}
                >
                  <ArrowDownIcon />
                </ActionIcon>
              </Tip>
            )}
            {stacked && (
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
            )}
            <Tip k="stackPin" as="control">
              <span>
                <Menu
                  position="bottom-end"
                  withinPortal
                  shadow="none"
                  disabled={targets.length === 0}
                >
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={`Stack ${label} with another panel`}
                      disabled={targets.length === 0}
                    >
                      <StackIcon />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {targets.map((t) => (
                      <Menu.Item key={t.id} onClick={() => h.onStackWith(id, t.id)}>
                        {`${panelLabel(t.id, viz.view)} (${t.side}, ${t.count} of ${MAX_STACK})`}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              </span>
            </Tip>
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
        return i > 0 ? (
          <Fragment key={id}>
            <Splitter
              topId={ids[0]}
              index={i - 1}
              shares={splitOf(layout, ids[0])}
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

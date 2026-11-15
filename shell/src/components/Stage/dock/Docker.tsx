/**
 * One docker: a labelled region. Open, it has a strip (the docker NAME, a tablist with one tab per panel, then the tab
 * menu and the docker menu as ordinary buttons) over a body that holds the hosts of all its tabs. Collapsed, empty or
 * narrow-hidden, it is a thin labelled strip. The component owns no layout data: every change goes out through
 * `actions` (DockStage turns them into screenset edits).
 *
 * Keyboard (design 4.4): the tablist has one Tab stop (the active tab); arrows, Home and End move focus between tabs
 * without activating; Enter or Space activates (a button click); Delete closes; Alt+Left and Alt+Right reorder; Escape
 * anywhere on the strip returns focus to the active panel. The menu buttons are NOT in the tablist.
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Menu, TextInput } from '@mantine/core';
import { pxToRem, type DockerId, type Edge, type PanelId } from '../../../lib/stage';
import { StripTool } from '../../InspectorKit';
import { CloseIcon, DownIcon } from '../icons';
import type { DockerPlacement } from './dockLayout';
import type { FocusReq } from './focusRequest';
import { isRoveKey, roveFocus } from './tabKeys';
import classes from './dock.module.css';

export interface DockerActions {
  select(docker: DockerId): void;
  activate(docker: DockerId, panel: PanelId): void;
  /** Rename; false when the name is not allowed (empty or taken). */
  rename(docker: DockerId, name: string): boolean;
  /** Ask for a name, then add an empty docker beside `beside` (DockStage shows the prompt). */
  newDockerPrompt(beside: DockerId, edge: Edge): void;
  remove(docker: DockerId): void;
  setCollapsed(docker: DockerId, collapsed: boolean): void;
  /** Close a tab; focus goes to the docker's next active tab. */
  closeTab(panel: PanelId): void;
  sendToDocker(panel: PanelId, docker: DockerId): void;
  /** Ask for a name, then send the panel into a new docker beside `beside`. */
  sendToNewPrompt(panel: PanelId, beside: DockerId, edge: Edge): void;
  /** Reorder: one place left (-1) or right (1) within its docker. Focus stays on the tab. */
  moveTab(panel: PanelId, delta: -1 | 1): void;
  /** Flexible to fixed or back, keeping the docker's present size. */
  toggleSizing(docker: DockerId): void;
  /** Put keyboard focus somewhere once the next render has made the element. */
  focus(req: FocusReq): void;
  /** A primary-button press on a tab: DockStage decides whether it becomes a drag (after a movement threshold). */
  tabPointerDown(event: ReactPointerEvent<HTMLElement>, panel: PanelId): void;
}

export interface DockerProps {
  placement: DockerPlacement;
  /** Every docker (id and name), for the Send-to lists. */
  dockers: readonly { id: DockerId; name: string }[];
  titleOf(panel: PanelId): string;
  uid: string;
  selected: boolean;
  canRemove: boolean;
  /** The kind of slot the docker sits in (`null`: the root docker, which has none). */
  sizing: 'fixed' | 'flexible' | null;
  /** The viewer setting: show a small close button on each tab. */
  showTabClose: boolean;
  onToggleTabClose(): void;
  actions: DockerActions;
  /** The measured body size (rem) for these tabs. */
  onMeasure(docker: DockerId, tabs: readonly PanelId[], widthRem: number, heightRem: number): void;
  registerBody(docker: DockerId, el: HTMLElement | null): void;
  /** The active panel's size class as `<width>-<height>` (published as data-slot-size on the body). */
  sizeAttr?: string;
  /** Spike only: overlay the size class. */
  showSize?: boolean;
  /** The panel whose tab is being dragged (its tab shows a grabbing cursor). */
  draggingPanel?: PanelId | null;
}

export const EDGES: readonly { edge: Edge; label: string }[] = [
  { edge: 'left', label: 'Left' },
  { edge: 'right', label: 'Right' },
  { edge: 'top', label: 'Above' },
  { edge: 'bottom', label: 'Below' },
];

export const tabId = (uid: string, panel: PanelId) => `${uid}-tab-${panel}`;
export const panelHostId = (uid: string, panel: PanelId) => `${uid}-panel-${panel}`;

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

export function Docker(props: DockerProps) {
  const { placement, actions, selected } = props;
  const { docker, state } = placement;
  const [renaming, setRenaming] = useState(false);
  // the tab context menu: anchored at the pointer (or at the tab for the keyboard); a plain role=tab stays a plain tab
  const [ctx, setCtx] = useState<{ panel: PanelId; x: number; y: number } | null>(null);
  const ctxActed = useRef(false);
  const closeCtx = () => {
    const was = ctx;
    setCtx(null);
    if (was && !ctxActed.current) {
      actions.focus({ kind: 'tab', panel: was.panel });
    }
    ctxActed.current = false;
  };
  const focusMenu = () => actions.focus({ kind: 'dockerMenu', docker: docker.id });

  const nameControl = (cls: string) =>
    renaming ? (
      <RenameInput
        initial={docker.name}
        className={classes.renameInput}
        label={`Rename docker ${docker.name}`}
        onCommit={(name, byKey) => {
          const ok = name === docker.name || actions.rename(docker.id, name);
          if (ok) {
            setRenaming(false);
            if (byKey) {
              actions.focus({ kind: 'dockerName', docker: docker.id });
            }
          }
          return ok;
        }}
        onCancel={(byKey) => {
          setRenaming(false);
          if (byKey) {
            actions.focus({ kind: 'dockerName', docker: docker.id });
          }
        }}
      />
    ) : (
      <button
        type="button"
        className={cls}
        aria-label={`Docker ${docker.name}`}
        data-docker-name={docker.id}
        title={
          state === 'collapsed'
            ? `Expand ${docker.name}`
            : state === 'narrow'
              ? `Show ${docker.name}`
              : `Rename ${docker.name}`
        }
        onClick={() => {
          if (state === 'collapsed') {
            actions.setCollapsed(docker.id, false);
          } else if (state === 'narrow') {
            actions.select(docker.id);
          } else {
            setRenaming(true);
          }
        }}
      >
        {docker.name}
      </button>
    );

  // returnFocus is off: every item that is not Rename puts focus back on this docker's menu button itself (the button
  // may be a different element after Collapse or Expand, so DockStage resolves it after the render); Rename moves focus
  // to its input.
  const menu = (
    <Menu position="bottom-end" withinPortal returnFocus={false}>
      <Menu.Target>
        <StripTool label={`Docker menu for ${docker.name}`} data-docker-menu={docker.id}>
          <DownIcon />
        </StripTool>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => setRenaming(true)}>Rename docker...</Menu.Item>
        <Menu.Label>New docker...</Menu.Label>
        {EDGES.map(({ edge, label }) => (
          <Menu.Item key={edge} onClick={() => actions.newDockerPrompt(docker.id, edge)}>
            {`New docker: ${label}`}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          disabled={props.sizing === null || state !== 'open'}
          onClick={() => {
            actions.toggleSizing(docker.id);
            focusMenu();
          }}
        >
          {props.sizing === 'fixed' ? 'Make flexible' : 'Make fixed size'}
        </Menu.Item>
        {state === 'collapsed' ? (
          <Menu.Item
            onClick={() => {
              actions.setCollapsed(docker.id, false);
              focusMenu();
            }}
          >
            Expand
          </Menu.Item>
        ) : (
          <Menu.Item
            disabled={docker.tabs.length === 0}
            onClick={() => {
              actions.setCollapsed(docker.id, true);
              focusMenu();
            }}
          >
            Collapse
          </Menu.Item>
        )}
        <Menu.Item
          data-checked={props.showTabClose}
          leftSection={props.showTabClose ? <span aria-hidden="true">{'\u2713'}</span> : undefined}
          onClick={() => {
            props.onToggleTabClose();
            focusMenu();
          }}
        >
          {/* Mantine fixes the item role to menuitem, so the state is in the name, not aria-checked */}
          {props.showTabClose ? 'Show close button on tabs (on)' : 'Show close button on tabs'}
        </Menu.Item>
        <Menu.Item
          color="red"
          disabled={docker.tabs.length > 0 || !props.canRemove}
          onClick={() => actions.remove(docker.id)}
        >
          Remove docker
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  if (state !== 'open') {
    return (
      <section
        aria-label={docker.name}
        className={classes.strip}
        data-docker-id={docker.id}
        data-state={state}
        data-axis={placement.parentDir ?? 'column'}
        data-selected={selected}
        onPointerDownCapture={() => actions.select(docker.id)}
      >
        {menu}
        {nameControl(classes.stripName)}
      </section>
    );
  }

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const panel = el.getAttribute('role') === 'tab' ? el.dataset.tabId : undefined;
    if (panel === undefined) {
      return;
    }
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setCtx({ panel, x: r.left, y: r.bottom });
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        actions.moveTab(panel, e.key === 'ArrowLeft' ? -1 : 1);
      }
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }
    if (isRoveKey(e.key)) {
      e.preventDefault();
      roveFocus(e.currentTarget, el, e.key);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      actions.closeTab(panel);
    }
  };
  // Escape anywhere on the strip (tabs, name, menu buttons) returns focus to the active panel. A menu's own Escape
  // bubbles here through the React tree (it renders in a portal) but its target is outside the strip: ignored. So is an
  // Escape the rename input already handled.
  const onHeaderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (
      e.key === 'Escape' &&
      !e.defaultPrevented &&
      e.currentTarget.contains(el) &&
      el.tagName !== 'INPUT' &&
      el.getAttribute('aria-expanded') !== 'true' && // an open menu's button: its Escape closes the menu
      document.querySelector('[role="menu"]') === null // (without a portal the menu is inside the strip)
    ) {
      e.preventDefault();
      actions.focus({ kind: 'body', docker: docker.id });
    }
  };

  return (
    <section
      aria-label={docker.name}
      className={classes.docker}
      data-docker-id={docker.id}
      data-state="open"
      data-selected={selected}
      onPointerDownCapture={() => actions.select(docker.id)}
      onFocusCapture={() => actions.select(docker.id)}
    >
      {/* the strip handles Escape for everything on it (keys bubble up from real buttons) */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={classes.header} data-dock-header onKeyDown={onHeaderKeyDown}>
        {/* the menu buttons sit at the LEFT end (docker menu, then the active tab's menu); they are NOT in the tablist */}
        <div className={classes.tools}>
          {menu}
          {docker.active !== null && (
            <TabMenu
              panel={docker.active}
              title={props.titleOf(docker.active)}
              docker={docker.id}
              index={docker.tabs.indexOf(docker.active)}
              count={docker.tabs.length}
              dockers={props.dockers}
              actions={actions}
            />
          )}
        </div>
        {nameControl(classes.name)}
        {/* roving tabindex lives on the tabs, not the list */}
        {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus */}
        <div
          role="tablist"
          aria-label={`${docker.name} tabs`}
          className={classes.tabs}
          onKeyDown={onTabKeyDown}
        >
          {docker.tabs.map((panel) => {
            const active = docker.active === panel;
            return (
              <div key={panel} role="presentation" className={classes.tabWrap} data-active={active}>
                <button
                  type="button"
                  role="tab"
                  id={tabId(props.uid, panel)}
                  className={classes.tab}
                  aria-selected={active}
                  aria-controls={panelHostId(props.uid, panel)}
                  tabIndex={active ? 0 : -1}
                  data-tab-id={panel}
                  data-dragging={props.draggingPanel === panel}
                  onPointerDown={(e) => actions.tabPointerDown(e, panel)}
                  onClick={() => actions.activate(docker.id, panel)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtx({ panel, x: e.clientX, y: e.clientY });
                  }}
                >
                  {props.titleOf(panel)}
                </button>
                {props.showTabClose && (
                  <button
                    type="button"
                    className={classes.tabClose}
                    aria-label={`Close ${props.titleOf(panel)}`}
                    title={`Close ${props.titleOf(panel)}`}
                    tabIndex={-1}
                    onClick={() => actions.closeTab(panel)}
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {ctx && docker.tabs.includes(ctx.panel) && (
          <Menu
            opened
            onChange={(o) => {
              if (!o) {
                closeCtx();
              }
            }}
            position="bottom-start"
            withinPortal
            returnFocus={false}
          >
            <Menu.Target>
              <span
                aria-hidden="true"
                data-tab-context-anchor
                style={{ position: 'fixed', left: ctx.x, top: ctx.y, width: 0, height: 0 }}
              />
            </Menu.Target>
            <Menu.Dropdown aria-label={`Menu for ${props.titleOf(ctx.panel)}`}>
              {tabMenuItems({
                panel: ctx.panel,
                title: props.titleOf(ctx.panel),
                docker: docker.id,
                index: docker.tabs.indexOf(ctx.panel),
                count: docker.tabs.length,
                dockers: props.dockers,
                actions: {
                  ...actions,
                  sendToDocker: (p, d) => {
                    ctxActed.current = true;
                    actions.sendToDocker(p, d);
                  },
                  sendToNewPrompt: (p, b, e) => {
                    ctxActed.current = true;
                    actions.sendToNewPrompt(p, b, e);
                  },
                  moveTab: (p, d) => {
                    ctxActed.current = true;
                    actions.moveTab(p, d);
                  },
                  closeTab: (p) => {
                    ctxActed.current = true;
                    actions.closeTab(p);
                  },
                },
              })}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>
      <Body {...props} />
    </section>
  );
}

/**
 * The menu of the ACTIVE tab (one button after the strip, not one per tab, so the tablist holds only tabs). Focus is
 * put back by the action: a moved panel's tab, the docker's next tab after a close.
 */
function TabMenu({
  panel,
  title,
  docker,
  index,
  count,
  dockers,
  actions,
}: {
  panel: PanelId;
  title: string;
  docker: DockerId;
  index: number;
  count: number;
  dockers: DockerProps['dockers'];
  actions: DockerActions;
}) {
  return (
    <Menu position="bottom-end" withinPortal returnFocus={false}>
      <Menu.Target>
        <StripTool label={`Menu for ${title}`} data-tab-menu={docker}>
          <DownIcon />
        </StripTool>
      </Menu.Target>
      <Menu.Dropdown>
        {tabMenuItems({ panel, title, docker, index, count, dockers, actions })}
      </Menu.Dropdown>
    </Menu>
  );
}

/** The entries of a tab's menu: shared by the button menu (active tab) and the context menu (any tab). */
function tabMenuItems({
  panel,
  title,
  docker,
  index,
  count,
  dockers,
  actions,
}: {
  panel: PanelId;
  title: string;
  docker: DockerId;
  index: number;
  count: number;
  dockers: DockerProps['dockers'];
  actions: DockerActions;
}) {
  const others = dockers.filter((d) => d.id !== docker);
  return (
    <>
      {others.length === 0 ? (
        <Menu.Item disabled>Send to (no other docker)</Menu.Item>
      ) : (
        <>
          <Menu.Label>Send to</Menu.Label>
          {others.map((d) => (
            <Menu.Item key={d.id} onClick={() => actions.sendToDocker(panel, d.id)}>
              {d.name}
            </Menu.Item>
          ))}
        </>
      )}
      <Menu.Label>New docker...</Menu.Label>
      {EDGES.map(({ edge, label }) => (
        <Menu.Item key={edge} onClick={() => actions.sendToNewPrompt(panel, docker, edge)}>
          {`Send to new docker: ${label}`}
        </Menu.Item>
      ))}
      <Menu.Divider />
      <Menu.Item disabled={index <= 0} onClick={() => actions.moveTab(panel, -1)}>
        Move tab left
      </Menu.Item>
      <Menu.Item disabled={index >= count - 1} onClick={() => actions.moveTab(panel, 1)}>
        Move tab right
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<CloseIcon />} onClick={() => actions.closeTab(panel)}>
        {`Close ${title}`}
      </Menu.Item>
    </>
  );
}

/** The measured element of an open docker. Its hosts are adopted by DockStage; it only reports its size. */
function Body({ placement, onMeasure, registerBody, sizeAttr, showSize }: DockerProps) {
  const { docker } = placement;
  const el = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(docker.tabs);
  tabsRef.current = docker.tabs;
  const tabsKey = docker.tabs.join('\u0000');
  const read = useRef(() => {});
  read.current = () => {
    const node = el.current;
    if (!node) {
      return;
    }
    const r = node.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return; // not laid out (parked, or the stage is hidden): keep the last size
    }
    const px = rootPx();
    onMeasure(docker.id, tabsRef.current, pxToRem(r.width, px), pxToRem(r.height, px));
  };

  // a stable ref: DockStage moves the hosts out of a body BEFORE React removes it, which a changing ref would trigger
  // on every render
  const dockerId = docker.id;
  const setEl = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      registerBody(dockerId, node);
    },
    [dockerId, registerBody]
  );

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) {
      return undefined;
    }
    read.current();
    const observer = new ResizeObserver(() => read.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // a panel that joined this docker takes the body's size even though the body itself did not resize
  useLayoutEffect(() => {
    read.current();
  }, [tabsKey]);

  return (
    <div ref={setEl} className={classes.body} data-dock-body={docker.id} data-slot-size={sizeAttr}>
      {showSize && sizeAttr && (
        <span className={classes.sizeBadge} aria-hidden="true">
          {sizeAttr}
        </span>
      )}
    </div>
  );
}

function RenameInput({
  initial,
  label,
  className,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  className?: string;
  /** Return false to keep editing (the name was refused). `byKey`: Enter (not a blur). */
  onCommit(name: string, byKey: boolean): boolean;
  /** `byKey`: Escape (not a refused blur). */
  onCancel(byKey: boolean): void;
}) {
  const [value, setValue] = useState(initial);
  const [bad, setBad] = useState(false);
  return (
    <TextInput
      size="xs"
      className={className}
      aria-label={label}
      value={value}
      error={bad}
      data-autofocus
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setValue(e.currentTarget.value);
        setBad(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setBad(!onCommit(value, true));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel(true);
        }
      }}
      onBlur={() => {
        if (!onCommit(value, false)) {
          onCancel(false);
        }
      }}
    />
  );
}

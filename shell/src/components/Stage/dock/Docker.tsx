/**
 * One docker: a labelled region. Open, it has a strip (the docker NAME, a tablist with one tab per panel, a docker
 * menu) over a body that holds the hosts of all its tabs. Collapsed, empty or narrow-hidden, it is a thin labelled
 * strip. The component owns no layout data: every change goes out through `actions` (DockStage turns them into
 * screenset edits).
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Menu, TextInput } from '@mantine/core';
import { pxToRem, type DockerId, type Edge, type PanelId } from '../../../lib/stage';
import { StripTool } from '../../InspectorKit';
import { CloseIcon, DownIcon } from '../icons';
import type { DockerPlacement } from './dockLayout';
import classes from './dock.module.css';

export interface DockerActions {
  select(docker: DockerId): void;
  activate(docker: DockerId, panel: PanelId): void;
  /** Rename; false when the name is not allowed (empty or taken). */
  rename(docker: DockerId, name: string): boolean;
  newDocker(beside: DockerId, edge: Edge): void;
  remove(docker: DockerId): void;
  setCollapsed(docker: DockerId, collapsed: boolean): void;
  closeTab(panel: PanelId): void;
  sendToDocker(panel: PanelId, docker: DockerId): void;
  sendToNew(panel: PanelId, beside: DockerId, edge: Edge): void;
}

export interface DockerProps {
  placement: DockerPlacement;
  /** Every docker (id and name), for the Send-to lists. */
  dockers: readonly { id: DockerId; name: string }[];
  titleOf(panel: PanelId): string;
  uid: string;
  selected: boolean;
  canRemove: boolean;
  actions: DockerActions;
  /** The measured body size (rem) for these tabs. */
  onMeasure(docker: DockerId, tabs: readonly PanelId[], widthRem: number, heightRem: number): void;
  registerBody(docker: DockerId, el: HTMLElement | null): void;
  /** The active panel's size class as `<width>-<height>` (published as data-slot-size on the body). */
  sizeAttr?: string;
  /** Spike only: overlay the size class. */
  showSize?: boolean;
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

  const nameControl = (cls: string) =>
    renaming ? (
      <RenameInput
        initial={docker.name}
        className={classes.renameInput}
        label={`Rename docker ${docker.name}`}
        onCommit={(name) => {
          const ok = name === docker.name || actions.rename(docker.id, name);
          if (ok) {
            setRenaming(false);
          }
          return ok;
        }}
        onCancel={() => setRenaming(false)}
      />
    ) : (
      <button
        type="button"
        className={cls}
        aria-label={`Docker ${docker.name}`}
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

  const menu = (
    <Menu position="bottom-end" withinPortal returnFocus={false}>
      <Menu.Target>
        <StripTool label={`Docker menu for ${docker.name}`}>
          <DownIcon />
        </StripTool>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => setRenaming(true)}>Rename docker...</Menu.Item>
        <Menu.Label>New docker...</Menu.Label>
        {EDGES.map(({ edge, label }) => (
          <Menu.Item key={edge} onClick={() => actions.newDocker(docker.id, edge)}>
            {`New docker: ${label}`}
          </Menu.Item>
        ))}
        <Menu.Divider />
        {state === 'collapsed' ? (
          <Menu.Item onClick={() => actions.setCollapsed(docker.id, false)}>Expand</Menu.Item>
        ) : (
          <Menu.Item
            disabled={docker.tabs.length === 0}
            onClick={() => actions.setCollapsed(docker.id, true)}
          >
            Collapse
          </Menu.Item>
        )}
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
        {nameControl(classes.stripName)}
        {menu}
      </section>
    );
  }

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
      <div className={classes.header}>
        {nameControl(classes.name)}
        <div role="tablist" aria-label={`${docker.name} tabs`} className={classes.tabs}>
          {docker.tabs.map((panel) => {
            const active = docker.active === panel;
            const title = props.titleOf(panel);
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
                  onClick={() => actions.activate(docker.id, panel)}
                >
                  {title}
                </button>
                <TabMenu
                  panel={panel}
                  title={title}
                  docker={docker.id}
                  dockers={props.dockers}
                  actions={actions}
                />
              </div>
            );
          })}
        </div>
        <div className={classes.tools}>{menu}</div>
      </div>
      <Body {...props} />
    </section>
  );
}

function TabMenu({
  panel,
  title,
  docker,
  dockers,
  actions,
}: {
  panel: PanelId;
  title: string;
  docker: DockerId;
  dockers: DockerProps['dockers'];
  actions: DockerActions;
}) {
  const others = dockers.filter((d) => d.id !== docker);
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <StripTool label={`Menu for ${title}`}>
          <DownIcon />
        </StripTool>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Send to</Menu.Label>
        {others.map((d) => (
          <Menu.Item key={d.id} onClick={() => actions.sendToDocker(panel, d.id)}>
            {d.name}
          </Menu.Item>
        ))}
        <Menu.Label>New docker...</Menu.Label>
        {EDGES.map(({ edge, label }) => (
          <Menu.Item key={edge} onClick={() => actions.sendToNew(panel, docker, edge)}>
            {`Send to new docker: ${label}`}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item leftSection={<CloseIcon />} onClick={() => actions.closeTab(panel)}>
          {`Close ${title}`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
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
  /** Return false to keep editing (the name was refused). */
  onCommit(name: string): boolean;
  onCancel(): void;
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
          setBad(!onCommit(value));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        if (!onCommit(value)) {
          onCancel();
        }
      }}
    />
  );
}

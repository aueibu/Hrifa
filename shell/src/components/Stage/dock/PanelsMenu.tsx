/**
 * The Panels menu: a Mantine menu button the page places (the spike's header). It lists every registered panel except
 * the reserved internal ids (`__...`): an open panel shows a check and `Show` (calls `show`, which activates it and
 * focuses its tab) and `Close`; a closed one `Open` (calls `open`: its remembered place, then its home docker). A kind
 * with `multiple` gets a "New <kind> instance" entry (the host creates the instance; see instances.ts). "Go to docker"
 * is a submenu of the dockers by name; the keys are shown from the one key map (keyMap.ts).
 *
 * The page gets `api` from `DockStage`'s `onApi` prop and passes the same `screenset` it gives the Stage.
 */
import { Fragment, useRef } from 'react';
import { Button, Menu } from '@mantine/core';
import { openPanels, treeDockers, type ModuleRegistry, type Screenset } from '../../../lib/stage';
import { isReservedPanelId } from './instances';
import { dockerCommandFor, keyLabel } from './keyMap';
import type { StageApi } from './stageApi';

export interface PanelsMenuProps {
  registry: ModuleRegistry;
  screenset: Screenset;
  /** From `onApi`; null before the Stage has mounted (the menu then opens with its entries disabled). */
  api: StageApi | null;
  /** The `multiple` kinds that get a "New instance" entry. */
  kinds?: readonly { id: string; title: string }[];
  onNewInstance?(kind: string): void;
  label?: string;
}

const Check = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    data-check
  >
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export function PanelsMenu({
  registry,
  screenset,
  api,
  kinds = [],
  onNewInstance,
  label = 'Panels',
}: PanelsMenuProps) {
  const button = useRef<HTMLButtonElement>(null);
  const open = new Set(openPanels(screenset.tree));
  const panels = [...registry.values()].filter((m) => !isReservedPanelId(m.id));
  const dockers = treeDockers(screenset.tree);
  const off = api === null;
  return (
    // returnFocus is off: Show moves focus to the panel's tab; Open and the rest put it back on the button themselves
    <Menu position="bottom-end" withinPortal returnFocus={false}>
      <Menu.Target>
        <Button ref={button} size="compact-xs" variant="default">
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {panels.map((m) =>
          open.has(m.id) ? (
            <Fragment key={m.id}>
              <Menu.Item
                disabled={off}
                leftSection={<Check />}
                onClick={() => api?.show(m.id, { focus: true })}
              >
                {`Show ${m.title}`}
              </Menu.Item>
              <Menu.Item
                disabled={off}
                onClick={() => {
                  api?.close(m.id);
                  button.current?.focus();
                }}
              >
                {`Close ${m.title}`}
              </Menu.Item>
            </Fragment>
          ) : (
            <Menu.Item
              key={m.id}
              disabled={off}
              onClick={() => {
                api?.open(m.id);
                button.current?.focus();
              }}
            >
              {`Open ${m.title}`}
            </Menu.Item>
          )
        )}
        {kinds.length > 0 && onNewInstance && <Menu.Divider />}
        {onNewInstance &&
          kinds.map((k) => (
            <Menu.Item
              key={k.id}
              onClick={() => {
                onNewInstance(k.id);
                button.current?.focus();
              }}
            >
              {`New ${k.title} instance`}
            </Menu.Item>
          ))}
        <Menu.Divider />
        <Menu.Sub>
          <Menu.Sub.Target>
            <Menu.Sub.Item disabled={off || dockers.length === 0}>Go to docker</Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            {dockers.map((d, i) => {
              const cmd = dockerCommandFor(i + 1);
              return (
                <Menu.Item
                  key={d.id}
                  rightSection={cmd ? keyLabel(cmd) : undefined}
                  onClick={() => api?.selectDocker(d.id)}
                >
                  {d.name}
                </Menu.Item>
              );
            })}
          </Menu.Sub.Dropdown>
        </Menu.Sub>
        <Menu.Item
          disabled={off}
          rightSection={keyLabel('goToDocker')}
          onClick={() => api?.goToDocker()}
        >
          Go to docker list...
        </Menu.Item>
        <Menu.Item
          disabled={off}
          rightSection={keyLabel('nextDocker')}
          onClick={() => api?.cycleDocker(1)}
        >
          Next docker
        </Menu.Item>
        <Menu.Item
          disabled={off}
          rightSection={keyLabel('prevDocker')}
          onClick={() => api?.cycleDocker(-1)}
        >
          Previous docker
        </Menu.Item>
        <Menu.Item
          disabled={off}
          rightSection={keyLabel('nextSplitter')}
          onClick={() => api?.cycleSplitter(1)}
        >
          Next splitter
        </Menu.Item>
        <Menu.Item
          disabled={off}
          rightSection={keyLabel('prevSplitter')}
          onClick={() => api?.cycleSplitter(-1)}
        >
          Previous splitter
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

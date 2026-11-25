/**
 * The dock Stage spike page (arc workbench, one-Stage M3a and M3c): a top bar (Home link, title, the Panels menu, "Show
 * sizes", "Saved JSON", Reset arrangement, colour scheme) over the DockStage, with the workspace meta-tab strip under it.
 * The three target arrangements are three workspaces of one store, saved under `hrifa.stage.dockspike.v1` (an older
 * single-workspace value still loads, as a store of one); switching workspace is a store change (the keepMounted canvas
 * stays alive). `note` panels are instances of a `multiple` kind: the instance list is persisted beside the store, read
 * BEFORE the store is parsed so stored `note:<key>` tabs are known, and the registry is rebuilt as instances are added.
 * Spike only: the panels and the page chrome are throwaway. The page owns the workspace store, DockStage owns none.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, AppShell, Group, Text } from '@mantine/core';
import { ColorSchemeToggle } from '../../components/ColorSchemeToggle/ColorSchemeToggle';
import {
  addWorkspace,
  deleteWorkspace,
  DockStage,
  duplicateWorkspace,
  instanceId,
  knownPanelIds,
  PanelsMenu,
  renameWorkspace,
  WorkspaceTabs,
  setActiveWorkspace,
  useStageRegistry,
  type PanelInstance,
  type StageApi,
} from '../../components/Stage/dock';
import { browserStorage, type StageStorage } from '../../components/Stage/persistence';
import {
  parseWorkspaceStore,
  serializeWorkspaceStore,
  stageStorageKey,
  type Workspace,
  type WorkspaceStore,
} from '../../lib/stage';
import { Button, Checkbox } from '../../ui';
import {
  DEFAULT_ARRANGEMENTS,
  defaultDockStore,
  DOCK_KINDS,
  NEW_INSTANCE_KINDS,
} from './dockSpike/panels';
import classes from './dockSpike/dockSpike.module.css';

export const DOCK_SPIKE_KEY = 'hrifa.stage.dockspike.v1';
export const DOCK_SPIKE_INSTANCES_KEY = 'hrifa.stage.dockspike.instances.v1';

export interface DockSpikeAppProps {
  /** Where the workspaces are stored (tests pass a fake); defaults to localStorage. */
  storage?: StageStorage;
}

function read(storage: StageStorage | undefined, key: string): string | null {
  try {
    return storage?.getItem(stageStorageKey(key)) ?? null;
  } catch {
    return null;
  }
}

/** The persisted `note` instance keys (a JSON array of strings); anything else reads as none. */
function loadInstances(storage: StageStorage | undefined): PanelInstance[] {
  try {
    const raw: unknown = JSON.parse(read(storage, DOCK_SPIKE_INSTANCES_KEY) ?? '[]');
    return Array.isArray(raw)
      ? [...new Set(raw.filter((k): k is string => typeof k === 'string' && k !== ''))].map(
          (key) => ({ kind: 'note', key })
        )
      : [];
  } catch {
    return [];
  }
}

export function DockSpikeApp({ storage }: DockSpikeAppProps) {
  const store = useMemo(() => storage ?? browserStorage(), [storage]);
  // the instance list is read first: the ids it makes must exist before the stored workspaces are parsed
  const [initial] = useState(() => {
    const instances = loadInstances(store);
    return {
      instances,
      saved: parseWorkspaceStore(
        read(store, DOCK_SPIKE_KEY),
        knownPanelIds(DOCK_KINDS, instances),
        { fallback: defaultDockStore() }
      ),
    };
  });
  const [saved, setSaved] = useState<WorkspaceStore>(initial.saved);
  const [instances, setInstances] = useState<PanelInstance[]>(initial.instances);
  const registry = useStageRegistry(DOCK_KINDS, instances);
  const [api, setApi] = useState<StageApi | null>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [showSizes, setShowSizes] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const json = useMemo(() => serializeWorkspaceStore(saved), [saved]);
  useEffect(() => {
    try {
      store?.setItem(stageStorageKey(DOCK_SPIKE_KEY), json);
    } catch {
      // storage can be missing or full; the spike keeps working
    }
  }, [store, json]);
  useEffect(() => {
    try {
      store?.setItem(
        stageStorageKey(DOCK_SPIKE_INSTANCES_KEY),
        JSON.stringify(instances.map((i) => i.key))
      );
    } catch {
      // as above
    }
  }, [store, instances]);

  const workspace: Workspace = saved.workspaces[saved.active];
  const update = useCallback((fn: (s: Workspace) => Workspace) => {
    setSaved((st) => {
      const cur = st.workspaces[st.active];
      const next = fn(cur);
      return next === cur ? st : { ...st, workspaces: { ...st.workspaces, [st.active]: next } };
    });
  }, []);

  // a new instance: the list changes, the registry is rebuilt, then the panel opens in its home or default docker
  const addInstance = (kind: string) => {
    let n = instances.length + 1;
    while (instances.some((i) => i.key === String(n))) {
      n++;
    }
    setInstances([...instances, { kind, key: String(n) }]);
    setPendingOpen(instanceId(kind, String(n)));
  };
  useEffect(() => {
    if (pendingOpen !== null && api && registry.meta.has(pendingOpen)) {
      api.show(pendingOpen, { focus: true });
      setPendingOpen(null);
    }
  }, [pendingOpen, api, registry]);

  return (
    <AppShell header={{ height: 40 }} padding={0}>
      <AppShell.Header>
        <Group h="100%" px="sm" gap="md" wrap="nowrap" justify="space-between">
          <Group gap="md" wrap="nowrap">
            <Anchor component={Link} to="/" size="sm" aria-label="Home">
              Home
            </Anchor>
            <Text component="h1" size="sm" fw={600} m={0}>
              Dock Stage (spike)
            </Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <PanelsMenu
              registry={registry.meta}
              workspace={workspace}
              api={api}
              kinds={NEW_INSTANCE_KINDS}
              onNewInstance={addInstance}
            />
            <Checkbox
              size="xs"
              label="Show sizes"
              checked={showSizes}
              onChange={(e) => setShowSizes(e.currentTarget.checked)}
            />
            <Checkbox
              size="xs"
              label="Saved JSON"
              checked={showJson}
              onChange={(e) => setShowJson(e.currentTarget.checked)}
            />
            <Button
              size="compact-xs"
              variant="default"
              onClick={() =>
                update(() => DEFAULT_ARRANGEMENTS.find((a) => a.id === saved.active) ?? workspace)
              }
            >
              Reset arrangement
            </Button>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <div className={classes.workArea}>
          <div className={classes.stageBox}>
            <DockStage
              registry={registry}
              workspace={workspace}
              update={update}
              showSizes={showSizes}
              onApi={setApi}
            />
          </div>
          <WorkspaceTabs
            store={saved}
            onActivate={(id) => setSaved((st) => setActiveWorkspace(st, id))}
            onAdd={() => setSaved((st) => addWorkspace(st))}
            onRename={(id, name) => setSaved((st) => renameWorkspace(st, id, name))}
            onDuplicate={(id) => setSaved((st) => duplicateWorkspace(st, id))}
            onDelete={(id) => setSaved((st) => deleteWorkspace(st, id))}
          />
          {showJson && (
            <pre className={classes.json} data-testid="dock-json">
              {JSON.stringify(JSON.parse(json), null, 1)}
            </pre>
          )}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

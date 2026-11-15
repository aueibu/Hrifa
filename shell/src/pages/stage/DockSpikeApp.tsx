/**
 * The dock Stage spike page (arc workbench, one-Stage M3a): a top bar (Home link, title, an arrangement switcher, a
 * Panels menu stub, "Show sizes", "Saved JSON", Reset arrangement, colour scheme) over the DockStage. The three target
 * arrangements are three screensets of one store, saved under `hrifa.stage.dockspike.v1`; switching arrangement is a
 * screenset change (the keepMounted canvas stays alive). Spike only: the panels and the page chrome are throwaway; the
 * real Panels menu and the meta-tab strip are M3c. The page owns the screenset state, DockStage owns none.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  AppShell,
  Button,
  Checkbox,
  Group,
  Menu,
  SegmentedControl,
  Text,
} from '@mantine/core';
import { ColorSchemeToggle } from '../../components/ColorSchemeToggle/ColorSchemeToggle';
import { DockStage } from '../../components/Stage/dock';
import { browserStorage, type StageStorage } from '../../components/Stage/persistence';
import {
  openPanels,
  parseScreensetStore,
  serializeScreensetStore,
  stageStorageKey,
  type Screenset,
  type ScreensetStore,
} from '../../lib/stage';
import {
  bridge,
  DEFAULT_ARRANGEMENTS,
  defaultDockStore,
  DOCK_REGISTRY,
  MENU_PANELS,
} from './dockSpike/panels';
import classes from './dockSpike/dockSpike.module.css';

export const DOCK_SPIKE_KEY = 'hrifa.stage.dockspike.v1';

export interface DockSpikeAppProps {
  /** Where the screensets are stored (tests pass a fake); defaults to localStorage. */
  storage?: StageStorage;
}

function load(storage: StageStorage | undefined): ScreensetStore {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(stageStorageKey(DOCK_SPIKE_KEY)) ?? null;
  } catch {
    raw = null;
  }
  return parseScreensetStore(raw, DOCK_REGISTRY.meta, { fallback: defaultDockStore() });
}

export function DockSpikeApp({ storage }: DockSpikeAppProps) {
  const store = useMemo(() => storage ?? browserStorage(), [storage]);
  const [saved, setSaved] = useState<ScreensetStore>(() => load(store));
  const [showSizes, setShowSizes] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const json = useMemo(() => serializeScreensetStore(saved), [saved]);
  useEffect(() => {
    try {
      store?.setItem(stageStorageKey(DOCK_SPIKE_KEY), json);
    } catch {
      // storage can be missing or full; the spike keeps working
    }
  }, [store, json]);

  const screenset: Screenset = saved.screensets[saved.active];
  const update = useCallback((fn: (s: Screenset) => Screenset) => {
    setSaved((st) => {
      const cur = st.screensets[st.active];
      const next = fn(cur);
      return next === cur ? st : { ...st, screensets: { ...st.screensets, [st.active]: next } };
    });
  }, []);

  const open = new Set(openPanels(screenset.tree));
  const api = () => bridge.api;

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
            <SegmentedControl
              size="xs"
              aria-label="Arrangement"
              value={saved.active}
              onChange={(id) => setSaved((st) => ({ ...st, active: id }))}
              data={saved.order.map((id) => ({
                value: id,
                label: saved.screensets[id].name,
              }))}
            />
            <Menu position="bottom-end" withinPortal returnFocus={false}>
              <Menu.Target>
                <Button size="compact-xs" variant="default">
                  Panels
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {MENU_PANELS.map((m) => (
                  <Fragment key={m.id}>
                    <Menu.Item onClick={() => api()?.show(m.id, { focus: true })}>
                      {`Show ${m.title}`}
                    </Menu.Item>
                    {open.has(m.id) ? (
                      <Menu.Item onClick={() => api()?.close(m.id)}>{`Close ${m.title}`}</Menu.Item>
                    ) : (
                      <Menu.Item onClick={() => api()?.open(m.id)}>
                        {`Open ${m.title} (remembered place)`}
                      </Menu.Item>
                    )}
                  </Fragment>
                ))}
              </Menu.Dropdown>
            </Menu>
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
                update(() => DEFAULT_ARRANGEMENTS.find((a) => a.id === saved.active) ?? screenset)
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
              registry={DOCK_REGISTRY}
              screenset={screenset}
              update={update}
              showSizes={showSizes}
            />
          </div>
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

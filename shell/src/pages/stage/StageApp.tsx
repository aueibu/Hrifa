/**
 * The Stage spike page: a top bar (Home link, title, Modules menu, hidden-columns switcher, "Show sizes", Reset layout,
 * colour scheme) over the Stage. The layout is state here, loaded from and saved to `hrifa.stage.layout.v1`.
 * Spike only: the stand-in modules, "Show sizes" and the page chrome are throwaway (ARCHITECTURE.md section 10).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  AppShell,
  Button,
  Checkbox,
  Group,
  Menu,
  NumberInput,
  Popover,
  Text,
} from '@mantine/core';
import { ColorSchemeToggle } from '../../components/ColorSchemeToggle/ColorSchemeToggle';
import { moduleIds, type Layout } from '../../lib/stage';
import { loadTipDelay, MAX_TIP_DELAY, parseTipDelay, saveTipDelay, TipDelayContext } from './kit';
import { browserStorage, loadLayout, saveLayout, type StageStorage } from './persistence';
import type { StageRegistry } from './registry';
import { Stage } from './Stage';
import { addWithMin, moveToFront, shownColumnCount } from './stageOps';
import { DEFAULT_STAGE_LAYOUT, STANDIN_REGISTRY } from './standins';
import { useWidthRem } from './useWidthRem';

export interface StageAppProps {
  registry?: StageRegistry;
  defaultLayout?: Layout;
  /** Where the layout is stored (tests pass a fake); defaults to localStorage. */
  storage?: StageStorage;
}

export function StageApp({
  registry = STANDIN_REGISTRY,
  defaultLayout = DEFAULT_STAGE_LAYOUT,
  storage,
}: StageAppProps) {
  const store = useMemo(() => storage ?? browserStorage(), [storage]);
  const [layout, setLayout] = useState<Layout>(() =>
    loadLayout(store, registry.meta, defaultLayout)
  );
  const [showSizes, setShowSizes] = useState(false);
  const [tipDelay, setTipDelay] = useState(() => loadTipDelay(store));
  const [tipDelayText, setTipDelayText] = useState(() => String(tipDelay));
  const widthRem = useWidthRem();

  useEffect(() => {
    saveLayout(store, layout);
  }, [store, layout]);

  useEffect(() => {
    saveTipDelay(store, tipDelay);
  }, [store, tipDelay]);

  const update = useCallback((fn: (l: Layout) => Layout) => setLayout(fn), []);

  const inLayout = new Set(moduleIds(layout));
  const available = [...registry.meta.values()].filter((m) => !inLayout.has(m.id));
  const shown = shownColumnCount(layout, widthRem);
  const hidden = layout.columns.slice(shown).flatMap((c) => c.slots);

  return (
    <AppShell header={{ height: 40 }} padding={0}>
      <AppShell.Header>
        <Group h="100%" px="sm" gap="md" wrap="nowrap" justify="space-between">
          <Group gap="md" wrap="nowrap">
            <Anchor component={Link} to="/" size="sm" aria-label="Home">
              Home
            </Anchor>
            <Text component="h1" size="sm" fw={600} m={0}>
              Stage (spike)
            </Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button size="compact-xs" variant="default">
                  Modules
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {available.length === 0 && <Menu.Label>Every module is on the Stage</Menu.Label>}
                {available.map((m) => (
                  <Menu.Item
                    key={m.id}
                    onClick={() => update((l) => addWithMin(l, registry.meta, m.id))}
                  >
                    {`Add ${m.title}`}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            {hidden.length > 0 && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button size="compact-xs" variant="default">
                    {`Hidden columns (${layout.columns.length - shown})`}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {hidden.map((id) => (
                    <Menu.Item key={id} onClick={() => update((l) => moveToFront(l, id))}>
                      {`Show ${registry.meta.get(id)?.title ?? id}`}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
            <Popover position="bottom-end" withinPortal trapFocus returnFocus>
              <Popover.Target>
                <Button size="compact-xs" variant="default">
                  Developer
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <NumberInput
                  size="xs"
                  label="Tooltip delay (ms)"
                  description="Per viewer, default 330"
                  hideControls
                  min={0}
                  max={MAX_TIP_DELAY}
                  allowDecimal={false}
                  data-autofocus
                  value={tipDelayText}
                  onChange={(v) => setTipDelayText(String(v))}
                  onBlur={() => {
                    const next = parseTipDelay(tipDelayText);
                    setTipDelay(next);
                    setTipDelayText(String(next));
                  }}
                />
              </Popover.Dropdown>
            </Popover>
            <Checkbox
              size="xs"
              label="Show sizes"
              checked={showSizes}
              onChange={(e) => setShowSizes(e.currentTarget.checked)}
            />
            <Button size="compact-xs" variant="default" onClick={() => setLayout(defaultLayout)}>
              Reset layout
            </Button>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <TipDelayContext.Provider value={tipDelay}>
          <Stage
            registry={registry}
            layout={layout}
            update={update}
            widthRem={widthRem}
            showSizes={showSizes}
          />
        </TipDelayContext.Provider>
      </AppShell.Main>
    </AppShell>
  );
}

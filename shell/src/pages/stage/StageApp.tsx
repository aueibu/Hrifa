/**
 * The Stage spike page: a top bar (Home link, title, preset switcher, Modules menu, hidden-columns switcher, "Show
 * sizes", Reset layout, colour scheme) over an inspector region (left) and the Stage. The layout is state here, loaded
 * from and saved to `hrifa.stage.layout.v1`; the presets (`presets.ts`) are saved layouts under
 * `hrifa.stage.presets.v1`, switched with Alt+1, Alt+2 or the control. Spike only: the modules, the inspector, "Show
 * sizes" and the page chrome are throwaway (ARCHITECTURE.md sections 10 to 12).
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
  SegmentedControl,
  Text,
} from '@mantine/core';
import { ColorSchemeToggle } from '../../components/ColorSchemeToggle/ColorSchemeToggle';
import {
  loadTipDelay,
  MAX_TIP_DELAY,
  parseTipDelay,
  saveTipDelay,
  TipDelayContext,
} from '../../components/InspectorKit';
import { Stage } from '../../components/Stage';
import {
  browserStorage,
  loadLayout,
  saveLayout,
  type StageStorage,
} from '../../components/Stage/persistence';
import type { StageRegistry } from '../../components/Stage/registry';
import { addWithMin, moveToFront, shownColumnCount } from '../../components/Stage/stageOps';
import { useWidthRem } from '../../components/Stage/useWidthRem';
import { moduleIds, type Layout } from '../../lib/stage';
import {
  initialStore,
  layoutOf,
  loadPresets,
  presetForKey,
  savePresets,
  switchPreset,
  type PresetDef,
  type PresetStore,
} from './presets';
import { SPIKE_PRESETS, SPIKE_REGISTRY } from './spike';
import { INSPECTOR_REM, SpikeInspector } from './spike/Inspector';
import { SpikeProvider } from './spike/state';
import classes from './spike/spike.module.css';

export interface StageAppProps {
  registry?: StageRegistry;
  /** The layout when there are no presets (with presets, each preset carries its own default). */
  defaultLayout?: Layout;
  /** Saved layouts to switch between; none hides the control. */
  /** Keep this array stable between renders (a module constant): the save effect and key listener depend on it. */
  presets?: readonly PresetDef[];
  /** Show the inspector region (and the demo state its panels read). */
  inspector?: boolean;
  /** Where the layout is stored (tests pass a fake); defaults to localStorage. */
  storage?: StageStorage;
}

export function StageApp({
  registry = SPIKE_REGISTRY,
  defaultLayout = SPIKE_PRESETS[0].layout,
  presets = SPIKE_PRESETS,
  inspector = true,
  storage,
}: StageAppProps) {
  const store = useMemo(() => storage ?? browserStorage(), [storage]);
  const [presetStore, setPresetStore] = useState<PresetStore>(() =>
    presets.length > 0 ? loadPresets(store, presets, registry.meta) : initialStore(presets)
  );
  const [layout, setLayout] = useState<Layout>(() =>
    loadLayout(
      store,
      registry.meta,
      presets.length > 0 ? layoutOf(presetStore, presets, presetStore.active) : defaultLayout
    )
  );
  const [showSizes, setShowSizes] = useState(false);
  const [tipDelay, setTipDelay] = useState(() => loadTipDelay(store));
  const [tipDelayText, setTipDelayText] = useState(() => String(tipDelay));
  const widthRem = useWidthRem();

  useEffect(() => {
    saveLayout(store, layout);
  }, [store, layout]);

  // the active preset always holds the layout it is showing, so a reload or a switch loses nothing
  useEffect(() => {
    if (presets.length > 0) {
      savePresets(store, {
        ...presetStore,
        layouts: { ...presetStore.layouts, [presetStore.active]: layout },
      });
    }
  }, [store, presets, presetStore, layout]);

  const choosePreset = useCallback(
    (id: string) => {
      if (id === presetStore.active) {
        return;
      }
      const next = switchPreset(presetStore, presets, id, layout);
      setPresetStore(next);
      setLayout(layoutOf(next, presets, id));
    },
    [presetStore, presets, layout]
  );

  useEffect(() => {
    if (presets.length === 0) {
      return undefined;
    }
    const on = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        e.isComposing ||
        e.repeat ||
        e.defaultPrevented ||
        (t instanceof HTMLElement &&
          (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
      ) {
        return;
      }
      const id = presetForKey(e, presets);
      if (id) {
        e.preventDefault();
        choosePreset(id);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [presets, choosePreset]);

  useEffect(() => {
    saveTipDelay(store, tipDelay);
  }, [store, tipDelay]);

  const update = useCallback((fn: (l: Layout) => Layout) => setLayout(fn), []);

  const inLayout = new Set(moduleIds(layout));
  const available = [...registry.meta.values()].filter((m) => !inLayout.has(m.id));
  const stageRem = widthRem - (inspector ? INSPECTOR_REM : 0);
  const shown = shownColumnCount(layout, stageRem);
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
            {presets.length > 0 && (
              <SegmentedControl
                size="xs"
                aria-label="Layout preset"
                value={presetStore.active}
                onChange={choosePreset}
                data={presets.map((p, i) => ({ value: p.id, label: `${p.label} (Alt+${i + 1})` }))}
              />
            )}
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
            <Button
              size="compact-xs"
              variant="default"
              onClick={() =>
                setLayout(
                  presets.length > 0
                    ? (presets.find((p) => p.id === presetStore.active)?.layout ?? defaultLayout)
                    : defaultLayout
                )
              }
            >
              Reset layout
            </Button>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <SpikeProvider>
          <div className={classes.workArea}>
            {inspector && <SpikeInspector />}
            <div className={classes.stageBox}>
              <TipDelayContext.Provider value={tipDelay}>
                <Stage
                  registry={registry}
                  layout={layout}
                  update={update}
                  widthRem={stageRem}
                  showSizes={showSizes}
                />
              </TipDelayContext.Provider>
            </div>
          </div>
        </SpikeProvider>
      </AppShell.Main>
    </AppShell>
  );
}

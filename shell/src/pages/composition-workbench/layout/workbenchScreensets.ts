/**
 * The workbench's screensets (one-Stage M5): the panel ids, the three default screensets (Canvas, Desk, Edit; design
 * 8.1), the seeding of a project that has no screenset store from its old layout keys (design 2.3 and 8.5), and the
 * small pure helpers the page needs around the store. No React. The page stores the result under
 * `compositionStateKeys.screensets` (a project key, never an undo step).
 *
 * Seeding reads, once and only when the project has no `ui.screensets.v1`: `ui.canvas-split.v1` (the top weight),
 * `ui.detail-collapsed.v1` (`Detail` collapsed), `ui.workspace-view.v1` (the active screenset), the open clip target (which
 * Detail tab is in front), the per-viewer editor arrangement `hrifa.stage.layout.workbench-editor.v1` and the per-viewer
 * `chordHost` and `chordDockWidth` of `hrifa.note-editor.v1` (where the Chords place points and how wide `Tools` is).
 * The old keys stay in storage and are not read again once the store exists, except by the one-time upgrade
 * (`upgradeChordsPlaces`): a stored screenset with no `chords` place gets one from `chordHost` (M6a, decision 2a).
 */
import {
  dockerHolding,
  foldEditorLayout,
  makeDocker,
  makeScreenset,
  makeStore,
  parseLayout,
  parseScreensetStore,
  setActive,
  treeDockers,
  type LayoutV1,
  type Place,
  type Screenset,
  type ScreensetStore,
} from '../../../lib/stage';
import { migratedPickerRem } from '../editorStage';
import { compositionStateKeys } from '../usePersistentState';

export const CANVAS_PANEL = 'canvas';
export const DESK_PANEL = 'desk';
export const MODULE_DETAIL_PANEL = 'module-detail';
export const CLIP_EDITOR_PANEL = 'clip-editor';
/** The chord picker panel (M6a); its home is the `Tools` docker. */
export const CHORDS_PANEL = 'chords';

/** The panels the workbench page registers. */
export const WORKBENCH_PANEL_IDS = [
  CANVAS_PANEL,
  DESK_PANEL,
  MODULE_DETAIL_PANEL,
  CLIP_EDITOR_PANEL,
  CHORDS_PANEL,
] as const;

/** Ids a stored screenset may name (a place or a tab for an id outside this set is dropped on every parse). */
export const WORKBENCH_KNOWN_IDS: ReadonlySet<string> = new Set(WORKBENCH_PANEL_IDS);

export const EDITOR_LAYOUT_KEY = 'hrifa.stage.layout.workbench-editor.v1';
export const NOTE_EDITOR_KEY = 'hrifa.note-editor.v1';

/** The old split's range (it lived in the retired `SplitStage`). */
export const MIN_SPLIT = 0.2;
export const MAX_SPLIT = 0.8;
export const clampSplit = (value: number): number =>
  Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));

/** Default top weights when the project has no `ui.canvas-split.v1`. */
export const DEFAULT_TOP_WEIGHT = 0.6;
export const EDIT_TOP_WEIGHT = 0.3;
/** The `Tools` strip's width in rem before any `chordDockWidth` carries over. */
export const DEFAULT_TOOLS_REM = 30;

export const DOCKER_TOP = 'd1';
export const DOCKER_DETAIL = 'd2';
export const DOCKER_TOOLS = 'd3';
export const DETAIL_NAME = 'Detail';
export const TOOLS_NAME = 'Tools';

/** What the old per-project and per-viewer layout keys held; `null` is "not stored". */
export interface LegacyLayoutInputs {
  canvasSplit: number | null;
  detailCollapsed: boolean | null;
  workspaceView: 'canvas' | 'desk' | null;
  /** A clip was the open target, so the clip editor tab starts in front. */
  clipOpen: boolean;
  /** The editor Stage's stored arrangement (version 1), or null when none is stored. */
  editorLayout: LayoutV1 | null;
  chordHost: 'dock' | 'takeover';
  /** `chordDockWidth` in pixels, or null. */
  chordDockWidthPx: number | null;
}

export const NO_LEGACY_INPUTS: LegacyLayoutInputs = {
  canvasSplit: null,
  detailCollapsed: null,
  workspaceView: null,
  clipOpen: false,
  editorLayout: null,
  chordHost: 'dock',
  chordDockWidthPx: null,
};

type Top = { id: string; name: string; panel: string; topWeight: number };

/** One default screenset: `top` over (`Detail` beside an empty `Tools`). */
function baseScreenset(top: Top, collapsed: boolean, detailActive: string): Screenset {
  return makeScreenset({
    id: top.id,
    name: top.name,
    defaultDocker: DOCKER_DETAIL,
    collapsed: collapsed ? [DOCKER_DETAIL] : [],
    lastDocker: {
      [top.panel]: { docker: DOCKER_TOP, name: top.name, index: 0 },
      [MODULE_DETAIL_PANEL]: { docker: DOCKER_DETAIL, name: DETAIL_NAME, index: 0 },
      [CLIP_EDITOR_PANEL]: { docker: DOCKER_DETAIL, name: DETAIL_NAME, index: 1 },
      [CHORDS_PANEL]: { docker: DOCKER_TOOLS, name: TOOLS_NAME, index: 0 },
    },
    tree: {
      kind: 'split',
      dir: 'column',
      children: [
        {
          weight: top.topWeight,
          node: makeDocker(DOCKER_TOP, top.name, [top.panel], top.panel),
        },
        {
          weight: 1 - top.topWeight,
          node: {
            kind: 'split',
            dir: 'row',
            children: [
              {
                weight: 1,
                node: makeDocker(
                  DOCKER_DETAIL,
                  DETAIL_NAME,
                  [MODULE_DETAIL_PANEL, CLIP_EDITOR_PANEL],
                  detailActive
                ),
              },
              { rem: DEFAULT_TOOLS_REM, node: makeDocker(DOCKER_TOOLS, TOOLS_NAME) },
            ],
          },
        },
      ],
    },
  });
}

const EMPTY_EDITOR_LAYOUT: LayoutV1 = { version: 1, columns: [] };

/**
 * The three default screensets, shaped by the old keys. With no inputs: Canvas and Desk at 0.6 over 0.4, Edit at 0.3 over
 * 0.7, `Detail` open on the module panel, `Tools` empty at 30rem, the picker remembered at `Tools`. A stored split becomes the
 * top weight of all three (design 8.1: the old key knew one split); `Detail` collapsed carries to all three.
 */
export function seedWorkbenchScreensets(
  inputs: LegacyLayoutInputs = NO_LEGACY_INPUTS
): ScreensetStore {
  const split = inputs.canvasSplit === null ? null : clampSplit(inputs.canvasSplit);
  const collapsed = inputs.detailCollapsed === true;
  const detailActive = inputs.clipOpen ? CLIP_EDITOR_PANEL : MODULE_DETAIL_PANEL;
  const pickerRem =
    inputs.chordDockWidthPx === null ? undefined : migratedPickerRem(inputs.chordDockWidthPx);
  // `name` is the top docker's name; the screenset's own name is `screensetName` (Edit's top docker is the Canvas one).
  const tops: (Top & { screensetName: string })[] = [
    {
      id: 'canvas',
      name: 'Canvas',
      screensetName: 'Canvas',
      panel: CANVAS_PANEL,
      topWeight: split ?? DEFAULT_TOP_WEIGHT,
    },
    {
      id: 'desk',
      name: 'Desk',
      screensetName: 'Desk',
      panel: DESK_PANEL,
      topWeight: split ?? DEFAULT_TOP_WEIGHT,
    },
    {
      id: 'edit',
      name: 'Canvas',
      screensetName: 'Edit',
      panel: CANVAS_PANEL,
      topWeight: split ?? EDIT_TOP_WEIGHT,
    },
  ];
  const sets = tops.map((top) => {
    const folded = foldEditorLayout(
      inputs.editorLayout ?? EMPTY_EDITOR_LAYOUT,
      baseScreenset(top, collapsed, detailActive),
      {
        known: WORKBENCH_KNOWN_IDS,
        // The takeover's own "Chords" docker would halve the canvas; the takeover becomes a place instead (below).
        chordHost: 'dock',
        pickerRem,
        detail: DETAIL_NAME,
        tools: TOOLS_NAME,
        canvas: top.name,
      }
    );
    // Decision 2a: a project that used the takeover opens the picker as a tab of the screenset's top docker.
    const takeoverPlace =
      inputs.chordHost === 'takeover' ? chordsPlaceFor(folded, 'takeover') : null;
    const lastDocker = takeoverPlace
      ? { ...folded.lastDocker, [CHORDS_PANEL]: takeoverPlace }
      : folded.lastDocker;
    return { ...folded, lastDocker, name: top.screensetName };
  });
  return makeStore(sets, inputs.workspaceView === 'desk' ? 'desk' : 'canvas');
}

/**
 * Where the `chords` panel opens in `screenset` for a viewer whose `chordHost` preference is `host` (M6a, decision
 * 2a, refined S4). `takeover`: the docker holding the Canvas panel (else the screenset's top docker), as a last tab, so the picker opens in
 * front of the canvas like the old takeover did; in the Desk screenset it is the Tools docker (the takeover never covered the desk). `dock`: the docker named `Tools`, or null
 * when the screenset has none (the panel's home, `Tools`, then resolves to the screenset's default docker).
 */
export function chordsPlaceFor(screenset: Screenset, host: 'dock' | 'takeover'): Place | null {
  const dockers = treeDockers(screenset.tree);
  // S4: the takeover never covered the Desk screenset, so its seed there is the Tools docker like every other project.
  if (host === 'takeover' && screenset.id !== 'desk') {
    // The docker that holds the Canvas panel (the one the takeover covered), else the screenset's top docker.
    const top = dockerHolding(screenset.tree, CANVAS_PANEL) ?? dockers[0];
    return top ? { docker: top.id, name: top.name, index: top.tabs.length } : null;
  }
  const tools = dockers.find((d) => d.name.toLowerCase() === TOOLS_NAME.toLowerCase());
  return tools ? { docker: tools.id, name: tools.name, index: 0 } : null;
}

/**
 * The one-time upgrade (M6a): a stored screenset with no `chords` place (a store from before the picker was a panel), or
 * with M5's placeholder place (docker `''`, written for a takeover project), gets the place `chordsPlaceFor` gives.
 * A screenset that already has a place is returned as it is, so this is idempotent and never moves a place the person made.
 */
export function upgradeChordsPlaces(
  store: ScreensetStore,
  host: 'dock' | 'takeover'
): ScreensetStore {
  let changed = false;
  const screensets: Record<string, Screenset> = {};
  for (const [id, s] of Object.entries(store.screensets)) {
    const place = s.lastDocker[CHORDS_PANEL];
    const needs = !place || place.docker === '';
    const next = needs ? chordsPlaceFor(s, host) : null;
    if (next) {
      changed = true;
      screensets[id] = { ...s, lastDocker: { ...s.lastDocker, [CHORDS_PANEL]: next } };
    } else {
      screensets[id] = s;
    }
  }
  return changed ? { ...store, screensets } : store;
}

/** Read the old keys (a missing, unreadable or invalid value is "not stored"). Never throws. */
export function readLegacyLayoutInputs(
  storage: Pick<Storage, 'getItem'> | undefined,
  keys: {
    canvasSplit: string;
    detailCollapsed: string;
    workspaceView: string;
    editorClipTarget: string;
  }
): LegacyLayoutInputs {
  const get = (key: string): unknown => {
    try {
      const raw = storage?.getItem(key) ?? null;
      return raw === null ? undefined : (JSON.parse(raw) as unknown);
    } catch {
      return undefined;
    }
  };
  const getRaw = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const split = get(keys.canvasSplit);
  const collapsed = get(keys.detailCollapsed);
  const view = get(keys.workspaceView);
  const clip = get(keys.editorClipTarget);
  const prefs = get(NOTE_EDITOR_KEY) as
    | { chordHost?: unknown; chordDockWidth?: unknown }
    | undefined;
  const width = prefs?.chordDockWidth;
  const editorRaw = getRaw(EDITOR_LAYOUT_KEY);
  const parsed = editorRaw === null ? null : parseLayout(editorRaw, undefined, EMPTY_EDITOR_LAYOUT);
  return {
    canvasSplit: typeof split === 'number' && Number.isFinite(split) ? split : null,
    detailCollapsed: typeof collapsed === 'boolean' ? collapsed : null,
    workspaceView: view === 'canvas' || view === 'desk' ? view : null,
    clipOpen: typeof clip === 'string',
    editorLayout: parsed && parsed.columns.length > 0 ? parsed : null,
    chordHost: prefs?.chordHost === 'takeover' ? 'takeover' : 'dock',
    chordDockWidthPx:
      typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : null,
  };
}

/** A cheap shape check for a stored store (the parse that runs first has already sanitized it). */
export function acceptsScreensetStore(value: unknown): value is ScreensetStore {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Partial<ScreensetStore>;
  return (
    v.version === 1 &&
    typeof v.active === 'string' &&
    Array.isArray(v.order) &&
    !!v.screensets &&
    typeof v.screensets === 'object' &&
    !!v.screensets[v.active]
  );
}

/**
 * Is `panel` showing to the person: open, the front tab of its docker, and that docker not collapsed. (The Stage's own
 * `isShown` also counts the narrow rule; the page uses this one so it can read the screenset it is rendering.)
 */
export function isPanelShown(screenset: Screenset, panel: string): boolean {
  const docker = dockerHolding(screenset.tree, panel);
  return !!docker && docker.active === panel && !(screenset.collapsed ?? []).includes(docker.id);
}

/** The store a project with none gets: the defaults shaped by whatever old keys and viewer preferences are in storage. */
export function seedStoreFromStorage(): ScreensetStore {
  try {
    return seedWorkbenchScreensets(readLegacyLayoutInputs(localStorage, compositionStateKeys));
  } catch {
    return seedWorkbenchScreensets();
  }
}

/** The viewer's `chordHost` preference (`dock` unless it says `takeover`); never throws. */
function storedChordHost(): 'dock' | 'takeover' {
  try {
    return readLegacyLayoutInputs(localStorage, compositionStateKeys).chordHost;
  } catch {
    return 'dock';
  }
}

/** `usePersistentState`'s migrate step: sanitize a stored value; anything unusable becomes the seeded store. */
export const parseStoredScreensets = (raw: unknown): ScreensetStore => {
  // The seed (which reads the old keys) is built only when the stored value is unusable.
  const unusable = {} as ScreensetStore;
  const parsed = parseScreensetStore(raw, WORKBENCH_KNOWN_IDS, { fallback: unusable });
  return parsed === unusable
    ? seedStoreFromStorage()
    : upgradeChordsPlaces(parsed, storedChordHost());
};

/**
 * Where "Make source" goes: the screenset that shows the canvas. The active one when it has the canvas open, else the
 * `canvas` screenset, else the first with the canvas open; null when no screenset opens the canvas.
 */
export function screensetForCanvas(store: ScreensetStore): string | null {
  const opens = (id: string) => !!dockerHolding(store.screensets[id].tree, CANVAS_PANEL);
  if (opens(store.active)) {
    return store.active;
  }
  return (
    [...store.order].sort((a, b) => Number(b === 'canvas') - Number(a === 'canvas')).find(opens) ??
    null
  );
}

/**
 * `panel` comes to the front of its docker in EVERY screenset that has it open (nothing is expanded or opened). The
 * Detail tab follows the exclusive target (a clip or a module), so it must hold in the screensets that are not showing too.
 */
export function bringPanelForward(store: ScreensetStore, panel: string): ScreensetStore {
  let changed = false;
  const screensets: Record<string, Screenset> = {};
  for (const [id, s] of Object.entries(store.screensets)) {
    const docker = dockerHolding(s.tree, panel);
    const next = docker && docker.active !== panel ? setActive(s, docker.id, panel) : s;
    changed = changed || next !== s;
    screensets[id] = next;
  }
  return changed ? { ...store, screensets } : store;
}

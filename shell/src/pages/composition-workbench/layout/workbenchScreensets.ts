/**
 * The workbench's screensets: the panel ids, the three default screensets (Canvas, Desk, Edit), and the small pure
 * helpers the page needs around the store. No React. The page stores the result under `compositionStateKeys.screensets`
 * (a project key, never an undo step); a project with no stored store, or an unusable one, gets the defaults.
 */
import {
  dockerHolding,
  makeDocker,
  makeScreenset,
  makeStore,
  parseScreensetStore,
  setActive,
  type Screenset,
  type ScreensetStore,
} from '../../../lib/stage';

export const CANVAS_PANEL = 'canvas';
export const DESK_PANEL = 'desk';
export const MODULE_DETAIL_PANEL = 'module-detail';
export const CLIP_EDITOR_PANEL = 'clip-editor';
/** The chord picker panel; its home is the `Tools` docker. */
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

/** Default top weights of the default screensets. */
export const DEFAULT_TOP_WEIGHT = 0.6;
export const EDIT_TOP_WEIGHT = 0.3;
/** The `Tools` strip's width in rem. */
export const DEFAULT_TOOLS_REM = 30;

export const DOCKER_TOP = 'd1';
export const DOCKER_DETAIL = 'd2';
export const DOCKER_TOOLS = 'd3';
export const DETAIL_NAME = 'Detail';
export const TOOLS_NAME = 'Tools';

type Top = { id: string; name: string; panel: string; topWeight: number };

/** One default screenset: `top` over (`Detail` beside an empty `Tools`). */
function baseScreenset(top: Top): Screenset {
  return makeScreenset({
    id: top.id,
    name: top.name,
    defaultDocker: DOCKER_DETAIL,
    collapsed: [],
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
                  MODULE_DETAIL_PANEL
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

/**
 * The three default screensets: Canvas and Desk at 0.6 over 0.4, Edit at 0.3 over 0.7, `Detail` open on the module panel,
 * `Tools` empty at 30rem, the chord picker remembered at `Tools`. Canvas is active.
 */
export function defaultWorkbenchScreensets(): ScreensetStore {
  // `name` is the top docker's name; the screenset's own name is `screensetName` (Edit's top docker is the Canvas one).
  const tops: (Top & { screensetName: string })[] = [
    {
      id: 'canvas',
      name: 'Canvas',
      screensetName: 'Canvas',
      panel: CANVAS_PANEL,
      topWeight: DEFAULT_TOP_WEIGHT,
    },
    {
      id: 'desk',
      name: 'Desk',
      screensetName: 'Desk',
      panel: DESK_PANEL,
      topWeight: DEFAULT_TOP_WEIGHT,
    },
    {
      id: 'edit',
      name: 'Canvas',
      screensetName: 'Edit',
      panel: CANVAS_PANEL,
      topWeight: EDIT_TOP_WEIGHT,
    },
  ];
  return makeStore(
    tops.map((top) => ({ ...baseScreenset(top), name: top.screensetName })),
    'canvas'
  );
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

/** `usePersistentState`'s migrate step: sanitize a stored value; anything unusable becomes the default store. */
export const parseStoredScreensets = (raw: unknown): ScreensetStore => {
  const unusable = {} as ScreensetStore;
  const parsed = parseScreensetStore(raw, WORKBENCH_KNOWN_IDS, { fallback: unusable });
  return parsed === unusable ? defaultWorkbenchScreensets() : parsed;
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

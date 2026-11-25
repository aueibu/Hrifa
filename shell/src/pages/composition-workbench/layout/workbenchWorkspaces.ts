/**
 * The workbench's workspaces: the panel ids, the three default workspaces (Canvas, Desk, Edit), and the small pure
 * helpers the page needs around the store. No React. The page stores the result under `compositionStateKeys.workspaces`
 * (a project key, never an undo step); a project with no stored store, or an unusable one, gets the defaults.
 */
import {
  dockerHolding,
  makeDocker,
  makeWorkspace,
  makeStore,
  parseWorkspaceStore,
  setActive,
  type Workspace,
  type WorkspaceStore,
} from '../../../lib/stage';

export const CANVAS_PANEL = 'canvas';
export const DESK_PANEL = 'desk';
export const NODE_DETAIL_PANEL = 'node-detail';
export const DATA_BLOCK_EDITOR_PANEL = 'data-block-editor';
/** The chord picker panel; its home is the `Tools` docker. */
export const CHORDS_PANEL = 'chords';
/** The scene Outliner and Properties panels (O2a). Reachable from the Panels menu; not in a default workspace. */
export const OUTLINER_PANEL = 'outliner';
export const PROPERTIES_PANEL = 'properties';
/** The scene Arranger (O2b): one row per Outliner row, objects as blocks on a time ruler. Panels menu only. */
export const ARRANGER_PANEL = 'arranger';
/** The Inspector (canvas and cables, the active node's setup controls): a dock panel since U3, open in `Tools` by default. */
export const INSPECTOR_PANEL = 'inspector';

/** The panels the workbench page registers. */
export const WORKBENCH_PANEL_IDS = [
  INSPECTOR_PANEL,
  CANVAS_PANEL,
  DESK_PANEL,
  NODE_DETAIL_PANEL,
  DATA_BLOCK_EDITOR_PANEL,
  CHORDS_PANEL,
  OUTLINER_PANEL,
  PROPERTIES_PANEL,
  ARRANGER_PANEL,
] as const;

/** Ids a stored workspace may name (a place or a tab for an id outside this set is dropped on every parse). */
export const WORKBENCH_KNOWN_IDS: ReadonlySet<string> = new Set(WORKBENCH_PANEL_IDS);

/** Default top weights of the default workspaces. */
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

/** One default workspace: `top` over (`Detail` beside an empty `Tools`). */
function baseWorkspace(top: Top): Workspace {
  return makeWorkspace({
    id: top.id,
    name: top.name,
    defaultDocker: DOCKER_DETAIL,
    collapsed: [],
    lastDocker: {
      [top.panel]: { docker: DOCKER_TOP, name: top.name, index: 0 },
      [NODE_DETAIL_PANEL]: { docker: DOCKER_DETAIL, name: DETAIL_NAME, index: 0 },
      [DATA_BLOCK_EDITOR_PANEL]: { docker: DOCKER_DETAIL, name: DETAIL_NAME, index: 1 },
      [CHORDS_PANEL]: { docker: DOCKER_TOOLS, name: TOOLS_NAME, index: 1 },
      [INSPECTOR_PANEL]: { docker: DOCKER_TOOLS, name: TOOLS_NAME, index: 0 },
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
                  [NODE_DETAIL_PANEL, DATA_BLOCK_EDITOR_PANEL],
                  NODE_DETAIL_PANEL
                ),
              },
              {
                rem: DEFAULT_TOOLS_REM,
                node: makeDocker(DOCKER_TOOLS, TOOLS_NAME, [INSPECTOR_PANEL], INSPECTOR_PANEL),
              },
            ],
          },
        },
      ],
    },
  });
}

/**
 * The three default workspaces: Canvas and Desk at 0.6 over 0.4, Edit at 0.3 over 0.7, `Detail` open on the node panel,
 * `Tools` empty at 30rem, the chord picker remembered at `Tools`. Canvas is active.
 */
export function defaultWorkbenchWorkspaces(): WorkspaceStore {
  // `name` is the top docker's name; the workspace's own name is `workspaceName` (Edit's top docker is the Canvas one).
  const tops: (Top & { workspaceName: string })[] = [
    {
      id: 'canvas',
      name: 'Canvas',
      workspaceName: 'Canvas',
      panel: CANVAS_PANEL,
      topWeight: DEFAULT_TOP_WEIGHT,
    },
    {
      id: 'desk',
      name: 'Desk',
      workspaceName: 'Desk',
      panel: DESK_PANEL,
      topWeight: DEFAULT_TOP_WEIGHT,
    },
    {
      id: 'edit',
      name: 'Canvas',
      workspaceName: 'Edit',
      panel: CANVAS_PANEL,
      topWeight: EDIT_TOP_WEIGHT,
    },
  ];
  return makeStore(
    tops.map((top) => ({ ...baseWorkspace(top), name: top.workspaceName })),
    'canvas'
  );
}

/** A cheap shape check for a stored store (the parse that runs first has already sanitized it). */
export function acceptsWorkspaceStore(value: unknown): value is WorkspaceStore {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Partial<WorkspaceStore>;
  return (
    v.version === 1 &&
    typeof v.active === 'string' &&
    Array.isArray(v.order) &&
    !!v.workspaces &&
    typeof v.workspaces === 'object' &&
    !!v.workspaces[v.active]
  );
}

/**
 * Is `panel` showing to the person: open, the front tab of its docker, and that docker not collapsed. (The Stage's own
 * `isShown` also counts the narrow rule; the page uses this one so it can read the workspace it is rendering.)
 */
export function isPanelShown(workspace: Workspace, panel: string): boolean {
  const docker = dockerHolding(workspace.tree, panel);
  return !!docker && docker.active === panel && !(workspace.collapsed ?? []).includes(docker.id);
}

/** `usePersistentState`'s migrate step: sanitize a stored value; anything unusable becomes the default store. */
export const parseStoredWorkspaces = (raw: unknown): WorkspaceStore => {
  const unusable = {} as WorkspaceStore;
  const parsed = parseWorkspaceStore(raw, WORKBENCH_KNOWN_IDS, { fallback: unusable });
  return parsed === unusable ? defaultWorkbenchWorkspaces() : parsed;
};

/**
 * Where "Make source" goes: the workspace that shows the canvas. The active one when it has the canvas open, else the
 * `canvas` workspace, else the first with the canvas open; null when no workspace opens the canvas.
 */
export function workspaceForCanvas(store: WorkspaceStore): string | null {
  const opens = (id: string) => !!dockerHolding(store.workspaces[id].tree, CANVAS_PANEL);
  if (opens(store.active)) {
    return store.active;
  }
  return (
    [...store.order].sort((a, b) => Number(b === 'canvas') - Number(a === 'canvas')).find(opens) ??
    null
  );
}

/**
 * `panel` comes to the front of its docker in EVERY workspace that has it open (nothing is expanded or opened). The
 * Detail tab follows the exclusive target (a data-block or a node), so it must hold in the workspaces that are not showing too.
 */
export function bringPanelForward(store: WorkspaceStore, panel: string): WorkspaceStore {
  let changed = false;
  const workspaces: Record<string, Workspace> = {};
  for (const [id, s] of Object.entries(store.workspaces)) {
    const docker = dockerHolding(s.tree, panel);
    const next = docker && docker.active !== panel ? setActive(s, docker.id, panel) : s;
    changed = changed || next !== s;
    workspaces[id] = next;
  }
  return changed ? { ...store, workspaces: workspaces } : store;
}

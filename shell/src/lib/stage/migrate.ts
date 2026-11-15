/**
 * Migration from version 1 (columns of stacks) to the version 2 tree, and the fold of the note clip editor's stored
 * arrangement into a screenset. Pure; the page owns reading storage.
 *
 * `layoutV1ToScreenset`: a column becomes a child of a root row split. A column with no `width` means the default
 * (36 rem), clamped to 12 to 96 (`columnWidth`). Its width becomes `rem`, except the last column, which is
 * `weight: 1` with `min` = its width (version 1: the last column fills and its width is its minimum). A single column
 * is a lone docker or one column split, not a row. A stack becomes a column split of dockers, `shares` become weights.
 * Each slot becomes a docker named from its panel's title, with one tab. Every open panel gets a remembered place.
 */
import { columnWidth, type Layout } from './layout';
import { closePanel, sendTo } from './ops';
import { recordPlace } from './places';
import type { ModuleRegistry } from './registry';
import { clampColumnWidth } from './splitters';
import {
  dockerByName,
  dockerHolding,
  findDocker,
  makeDocker,
  makeScreenset,
  nextDockerId,
  normalizeTree,
  removeDockerNode,
  splitTree,
  treeDockers,
  uniqueName,
  usedDockerIds,
  type Docker,
  type Edge,
  type Place,
  type Screenset,
  type SplitChild,
  type TreeNode,
} from './tree';

/** The version-1 layout type (`Layout`); not renamed until the old Stage is retired. */
export type LayoutV1 = Layout;

export interface LayoutV1ToScreensetOpts {
  id?: string;
  name?: string;
  /** Titles for docker names (a panel without a registered title is named by its id). */
  registry?: ModuleRegistry;
  /** Panel id renames applied first (for example `{ roll: 'clip-editor' }`), places included. */
  rename?: Readonly<Record<string, string>>;
  /** The docker name for a layout with no columns. */
  emptyName?: string;
}

/** Column slot ids after renaming, with repeats and empty columns dropped. */
function renamedColumns(layout: LayoutV1, rename: Readonly<Record<string, string>> = {}) {
  const taken = new Set<string>();
  const out: {
    slots: string[];
    width?: number;
    shares?: number[];
    source: LayoutV1['columns'][number];
  }[] = [];
  for (const col of layout.columns) {
    const slots: string[] = [];
    for (const raw of col.slots) {
      const id = Object.hasOwn(rename, raw) ? rename[raw] : raw;
      if (!taken.has(id)) {
        taken.add(id);
        slots.push(id);
      }
    }
    if (slots.length > 0) {
      out.push({
        slots,
        width: col.width,
        shares: col.shares && col.shares.length === col.slots.length ? col.shares : undefined,
        source: col,
      });
    }
  }
  return out;
}

export function layoutV1ToScreenset(
  layout: LayoutV1,
  opts: LayoutV1ToScreensetOpts = {}
): Screenset {
  const cols = renamedColumns(layout, opts.rename);
  const names: string[] = [];
  let counter = 0;
  const docker = (panel: string): Docker => {
    counter += 1;
    const name = uniqueName(names, opts.registry?.get(panel)?.title ?? panel);
    names.push(name);
    return makeDocker(`d${counter}`, name, [panel], panel);
  };
  const column = (slots: string[], shares?: number[]): TreeNode =>
    slots.length === 1
      ? docker(slots[0])
      : {
          kind: 'split',
          dir: 'column',
          children: slots.map((p, i) => ({ node: docker(p), weight: shares?.[i] ?? 1 })),
        };
  let tree: TreeNode;
  if (cols.length === 0) {
    counter += 1;
    tree = makeDocker(`d${counter}`, opts.emptyName ?? 'Main');
  } else if (cols.length === 1) {
    tree = column(cols[0].slots, cols[0].shares);
  } else {
    const last = cols.length - 1;
    tree = {
      kind: 'split',
      dir: 'row',
      children: cols.map((c, i): SplitChild => {
        const width = columnWidth({ slots: [], width: c.width });
        const node = column(c.slots, c.shares);
        return i === last ? { node, weight: 1, min: width } : { node, rem: width };
      }),
    };
  }
  const lastDocker: Record<string, Place> = {};
  for (const d of treeDockers(tree)) {
    d.tabs.forEach((p, i) => {
      lastDocker[p] = { docker: d.id, name: d.name, index: i };
    });
  }
  return makeScreenset({
    id: opts.id ?? 'main',
    name: opts.name ?? opts.id ?? 'Main',
    tree: normalizeTree(tree),
    lastDocker,
  });
}

/* ------------------------------------------------------------------------------------------------ editor fold */
export interface EditorFoldOpts {
  /** Panel ids the editor key may contain; unknown ids are dropped. Absent: all known. */
  known?: ReadonlySet<string> | ModuleRegistry;
  /** Id renames applied FIRST, to the layout and so to places. Default `{ roll: 'clip-editor' }`. */
  rename?: Readonly<Record<string, string>>;
  clipEditorId?: string;
  chordsId?: string;
  /** Docker names in the base screenset. Defaults: Detail, Tools, Canvas. */
  detail?: string;
  tools?: string;
  canvas?: string;
  /** `takeover` (the viewer's `chordHost`) wins: the chords place becomes an own docker beside the Canvas docker. */
  chordHost?: 'takeover' | 'dock';
  /** The picker width in rem from `chordDockWidth` (`migratedPickerRem`); used when the editor key has no picker column. */
  pickerRem?: number;
  /** Name of the new docker the takeover creates. Default `Chords`. */
  takeoverName?: string;
}

const DEFAULT_PICKER_REM = 30;

/**
 * Fold the note clip editor's stored version-1 arrangement (`hrifa.stage.layout.workbench-editor.v1`) into a base
 * screenset (a default screenset with `Detail`, `Tools` and `Canvas` dockers). Order of effects:
 *  1. ids are renamed (`roll` becomes `clip-editor`) and unknown ids dropped, so places carry the new id;
 *  2. the editor key holds the two panels either side by side (either order) or stacked in one column (either order);
 *     `Tools` is placed on that side of `Detail` (left, right, above or below) with the picker column's width as its
 *     `rem` (a column with no width means 36, clamped by `clampColumnWidth`) or, stacked, the two shares as weights;
 *  3. `clip-editor` becomes a tab of `Detail`; `chords` is NOT left as a visible column: it is closed and its place is
 *     remembered as `Tools` (a version-1 key has no `lastDocker`, so the place is derived here);
 *  4. `chordHost === 'takeover'` wins over all of that: the `Canvas` docker is wrapped in a row split with a new empty
 *     docker (`Chords`, `min` = the picker width, weights 1 and 1) and the chords place points at it.
 * With no `chords` entry in the key the arrangement of the base is kept (only the width carries over, as in step 2).
 */
export function foldEditorLayout(
  editor: LayoutV1,
  base: Screenset,
  opts: EditorFoldOpts = {}
): Screenset {
  const clipId = opts.clipEditorId ?? 'clip-editor';
  const chordsId = opts.chordsId ?? 'chords';
  const detailName = opts.detail ?? 'Detail';
  const toolsName = opts.tools ?? 'Tools';
  const canvasName = opts.canvas ?? 'Canvas';
  const pickerRem = opts.pickerRem !== undefined ? clampColumnWidth(opts.pickerRem) : undefined;
  const known = opts.known;
  const cols = renamedColumns(editor, opts.rename ?? { roll: 'clip-editor' }).map((c) => ({
    ...c,
    slots: c.slots.filter((id) => (known ? known.has(id) : true)),
  }));
  const colOf = (id: string) => cols.findIndex((c) => c.slots.includes(id));
  const clipCol = colOf(clipId);
  const chordsCol = colOf(chordsId);

  let ss = base;
  const detail =
    dockerByName(ss.tree, detailName) ??
    dockerHolding(ss.tree, clipId) ??
    treeDockers(ss.tree)[0] ??
    null;
  if (!detail) {
    return base;
  }
  if (clipCol >= 0 && dockerHolding(ss.tree, clipId)?.id !== detail.id) {
    ss = sendTo(ss, clipId, { kind: 'docker', docker: detail.id });
  }

  // Where the picker's docker (`Tools`) sits, from the stored arrangement.
  let toolsDocker: Docker | null = dockerByName(ss.tree, toolsName);
  if (chordsCol >= 0) {
    let edge: Edge = 'right';
    let sizing: { newRem?: number; newWeight?: number; besideWeight?: number } = {
      newRem: columnWidth({ slots: [], width: cols[chordsCol].width }),
    };
    if (clipCol >= 0 && clipCol === chordsCol) {
      const col = cols[chordsCol];
      const chordsAt = col.slots.indexOf(chordsId);
      const clipAt = col.slots.indexOf(clipId);
      edge = chordsAt < clipAt ? 'top' : 'bottom';
      sizing = {
        newWeight: col.shares?.[chordsAt] ?? 1,
        besideWeight: col.shares?.[clipAt] ?? 1,
      };
    } else if (clipCol >= 0) {
      edge = chordsCol < clipCol ? 'left' : 'right';
    }
    const current = findDocker(ss.tree, detail.id) ?? detail;
    const tools =
      toolsDocker && toolsDocker.id !== current.id
        ? toolsDocker
        : makeDocker(
            nextDockerId(usedDockerIds(ss)),
            uniqueName(
              treeDockers(ss.tree).map((d) => d.name),
              toolsName
            )
          );
    if (tools.id !== current.id) {
      const rest = removeDockerNode(ss.tree, tools.id);
      if (rest) {
        const placed = splitTree(normalizeTree(rest), current.id, edge, tools, {
          ...sizing,
          wrap: true,
        });
        ss = { ...ss, tree: normalizeTree(placed) };
        toolsDocker = tools;
      }
    }
  } else if (pickerRem !== undefined && toolsDocker) {
    // No picker column in the key: keep the base arrangement, carry the width only.
    const id = toolsDocker.id;
    const visit = (n: TreeNode): TreeNode =>
      n.kind === 'docker'
        ? n
        : {
            ...n,
            children: n.children.map((c) =>
              c.node.kind === 'docker' && c.node.id === id && c.rem !== undefined
                ? { ...c, rem: pickerRem }
                : { ...c, node: visit(c.node) }
            ),
          };
    ss = { ...ss, tree: visit(ss.tree) };
  }

  // The picker is closed and remembered at `Tools` (its home), whatever the key says.
  if (ss.lastDocker[chordsId] || chordsCol >= 0 || dockerHolding(ss.tree, chordsId)) {
    ss = closePanel(ss, chordsId);
  }
  const tools = toolsDocker ? (findDocker(ss.tree, toolsDocker.id) ?? toolsDocker) : null;
  if (tools && (chordsCol >= 0 || !ss.lastDocker[chordsId])) {
    ss = recordPlace(ss, chordsId, tools, 0);
  }

  if (opts.chordHost === 'takeover') {
    const canvas =
      dockerByName(ss.tree, canvasName) ??
      dockerHolding(ss.tree, 'canvas') ??
      treeDockers(ss.tree)[0];
    if (canvas) {
      const id = nextDockerId(usedDockerIds(ss));
      const name = uniqueName(
        treeDockers(ss.tree).map((d) => d.name),
        opts.takeoverName ?? 'Chords'
      );
      const fresh = makeDocker(id, name);
      const tree = splitTree(ss.tree, canvas.id, 'right', fresh, {
        wrap: true,
        newMin: pickerRem ?? DEFAULT_PICKER_REM,
      });
      ss = recordPlace({ ...ss, tree: normalizeTree(tree) }, chordsId, fresh, 0);
    }
  }
  return ss;
}

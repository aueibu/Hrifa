/**
 * Fixed or flexible: what a docker's slot is now, and the value that makes it the other kind without moving anything.
 * Pure; reads the screenset tree and the geometry the Stage already computed.
 */
import {
  isDocker,
  treeDockers,
  weightOf,
  type DockerId,
  type Screenset,
  type SplitChild,
  type TreeNode,
} from '../../../lib/stage';
import type { TreeGeometry } from './dockLayout';

interface Slot {
  dir: 'row' | 'column';
  index: number;
  children: readonly SplitChild[];
}

function slotOf(node: TreeNode, id: DockerId): Slot | null {
  if (isDocker(node)) {
    return null;
  }
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (isDocker(c.node) && c.node.id === id) {
      return { dir: node.dir, index: i, children: node.children };
    }
    const inner = slotOf(c.node, id);
    if (inner) {
      return inner;
    }
  }
  return null;
}

/** `fixed` (a rem), `flexible` (a weight) or null for the root docker (it has no slot). */
export function dockerSizing(tree: TreeNode, id: DockerId): 'fixed' | 'flexible' | null {
  const slot = slotOf(tree, id);
  return slot ? (slot.children[slot.index].rem !== undefined ? 'fixed' : 'flexible') : null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * The sizing that makes the docker's slot the other kind while it keeps its present size: its measured length as a
 * `rem`, or a `weight` that gives it the same share against its flexible siblings. Null for the root.
 */
export function toggledSizing(
  s: Screenset,
  geometry: TreeGeometry,
  id: DockerId
): { rem: number } | { weight: number } | null {
  const slot = slotOf(s.tree, id);
  const own = geometry.dockers.find((p) => p.docker.id === id);
  if (!slot || !own) {
    return null;
  }
  const along = (p: { width: number; height: number }) => (slot.dir === 'row' ? p.width : p.height);
  if (slot.children[slot.index].rem === undefined) {
    return { rem: Math.max(0.5, round2(along(own))) };
  }
  let weights = 0;
  let room = 0;
  slot.children.forEach((c, i) => {
    if (i === slot.index || c.rem !== undefined) {
      return;
    }
    weights += weightOf(c);
    const ids = new Set(treeDockers(c.node).map((d) => d.id));
    let a = Infinity;
    let b = -Infinity;
    for (const p of geometry.dockers) {
      if (ids.has(p.docker.id)) {
        const start = slot.dir === 'row' ? p.x : p.y;
        a = Math.min(a, start);
        b = Math.max(b, start + along(p));
      }
    }
    room += Math.max(0, b - a);
  });
  const want = along(own);
  return { weight: weights > 0 && room > 0 && want > 0 ? round6((weights * want) / room) : 1 };
}

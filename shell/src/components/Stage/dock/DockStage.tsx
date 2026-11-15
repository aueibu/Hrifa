/**
 * The dock Stage: renders a screenset (a split tree of named dockers holding tabbed panels) through the registry. It
 * lives beside the old column Stage (`../Stage.tsx`), which it does not touch. The caller owns the screenset state and
 * passes `screenset` and `update`; this component owns no layout data.
 *
 * Mounted once, parked not detached (supersedes the old Stage's hidden-detached rule for this component):
 * - every panel that is open, and every `keepMounted` panel (open or not, in this screenset or not), is rendered
 *   exactly once at the root through `createPortal` into a stable host element (parking.ts);
 * - the host is moved into its docker's body (the active tab visible, the other tabs parked in place in the same grid
 *   cell), or into a park box for a collapsed or narrow-hidden docker (at the last measured size, else the solver's) or
 *   for a `keepMounted` panel that is in no docker. Parked means opacity 0, pointer-events none, visibility hidden and
 *   inert; never `display: none`, never detached. The root clips (`position: relative; overflow: hidden`);
 * - a panel is handed its size class only, measured on its docker's body and kept (with hysteresis) while parked.
 *
 * Dockers are positioned absolutely from the pure geometry (dockLayout.ts), so their DOM never remounts when the tree
 * changes shape. Edits go through `update`; sends, moves and resizes are guarded (guardedTree, given the selected
 * docker), opening and showing never are (W-30).
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  SIZE_MIN_HEIGHT_REM,
  SIZE_MIN_WIDTH_REM,
  canRenameDocker,
  closePanel,
  dockerHolding,
  nearestSupportedSize,
  openPanel,
  openPanels,
  pxToRem,
  removeDocker,
  renameDocker,
  resizeSplit,
  sendTo as sendToOp,
  setActive,
  setCollapsed,
  slotSizeAttr,
  solveTree,
  splitDocker,
  treeDockers,
  type DockerId,
  type PanelId,
  type Screenset,
  type Target,
} from '../../../lib/stage';
import { DEFAULT_DENSITY, tokenStyle } from '../../InspectorKit';
import type { StageRegistry } from '../registry';
import { INITIAL_SIZE, withMeasure, type SlotSizes } from '../sizeState';
import { Splitter } from '../Splitter';
import { dockerMinOf, guardedTree } from '../stageOps';
import { Docker, panelHostId, tabId, type DockerActions } from './Docker';
import { layoutTree, type DockRect } from './dockLayout';
import { adopt, createHost, hold, setParked } from './parking';
import { StageApiContext, type StageApi } from './stageApi';
import classes from './dock.module.css';

export interface DockStageProps {
  registry: StageRegistry;
  screenset: Screenset;
  /** Apply a change to the latest screenset (a React state updater). */
  update(fn: (s: Screenset) => Screenset): void;
  /**
   * The size in rem. When absent the Stage measures its own root (ResizeObserver); until the first measurement the
   * size counts as 0.
   */
  widthRem?: number;
  heightRem?: number;
  /** Spike only: overlay each docker body's size class. */
  showSizes?: boolean;
}

/** The docker an edit created: the id present after and not before. */
const createdDocker = (before: Screenset, after: Screenset): DockerId | undefined => {
  const had = new Set(treeDockers(before.tree).map((d) => d.id));
  return treeDockers(after.tree).find((d) => !had.has(d.id))?.id;
};

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const NUDGE_REM = 1;
const STAGE_MIN = { w: SIZE_MIN_WIDTH_REM, h: SIZE_MIN_HEIGHT_REM };

const rectStyle = (r: DockRect): CSSProperties => ({
  left: `${r.x}rem`,
  top: `${r.y}rem`,
  width: `${r.width}rem`,
  height: `${r.height}rem`,
});

interface ParkBox {
  key: string;
  w: number;
  h: number;
}

export function DockStage({
  registry,
  screenset,
  update,
  widthRem: widthProp,
  heightRem: heightProp,
  showSizes,
}: DockStageProps) {
  const uid = useId();
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const hostFor = (id: string) => {
    let host = hosts.current.get(id);
    if (!host) {
      host = createHost(id, classes.host);
      hosts.current.set(id, host);
    }
    return host;
  };
  const containers = useRef(new Map<string, HTMLElement>());
  const parkLayer = useRef<HTMLDivElement | null>(null);
  /**
   * A container (docker body, park box) registers itself, and when React is about to remove it (its ref is detached
   * BEFORE the removal) its hosts are moved to the park layer first, so a host is never detached, not even for a
   * moment. The placer below then adopts them into their next container in the same commit.
   */
  const registerContainer = useCallback((key: string, el: HTMLElement | null) => {
    if (el) {
      containers.current.set(key, el);
      return;
    }
    const old = containers.current.get(key);
    containers.current.delete(key);
    if (old && parkLayer.current) {
      for (const host of [...old.children]) {
        if (host instanceof HTMLElement && host.dataset.panelHost !== undefined) {
          hold(parkLayer.current, host);
        }
      }
    }
  }, []);
  const refCache = useRef(new Map<string, (el: HTMLElement | null) => void>());
  /** A ref callback per container key with a stable identity (a changing one would detach and re-attach every render). */
  const containerRef = (key: string) => {
    let fn = refCache.current.get(key);
    if (!fn) {
      fn = (el) => registerContainer(key, el);
      refCache.current.set(key, fn);
    }
    return fn;
  };
  const registerBody = useCallback(
    (id: DockerId, el: HTMLElement | null) => registerContainer(`body:${id}`, el),
    [registerContainer]
  );

  /* ------------------------------------------------------------------ measuring */
  const [sizes, setSizes] = useState<SlotSizes>({});
  const lastRem = useRef(new Map<string, { w: number; h: number }>());
  const measure = useCallback(
    (docker: DockerId, tabs: readonly PanelId[], w: number, h: number) => {
      lastRem.current.set(`d:${docker}`, { w, h });
      for (const t of tabs) {
        lastRem.current.set(`p:${t}`, { w, h });
      }
      setSizes((s) => tabs.reduce((acc, t) => withMeasure(acc, t, w, h), s));
    },
    []
  );

  const root = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState({ w: 0, h: 0 });
  const widthRem = widthProp ?? own.w;
  const heightRem = heightProp ?? own.h;
  const selfMeasure = widthProp === undefined || heightProp === undefined;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !selfMeasure) {
      return undefined;
    }
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const px = rootPx();
        const w = pxToRem(r.width, px);
        const h = pxToRem(r.height, px);
        setOwn((o) => (o.w === w && o.h === h ? o : { w, h }));
      }
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [selfMeasure]);

  /* ------------------------------------------------------------------ geometry */
  const [selected, setSelected] = useState<DockerId | undefined>(undefined);
  const minOf = useMemo(() => dockerMinOf(registry.meta), [registry]);
  const geometry = useMemo(
    () => layoutTree(screenset, widthRem, heightRem, { minOf, selected }),
    [screenset, widthRem, heightRem, minOf, selected]
  );
  const latest = useRef({ screenset, geometry, widthRem, heightRem, selected });
  latest.current = { screenset, geometry, widthRem, heightRem, selected };

  /* ------------------------------------------------------------------ edits */
  // ONE permanent role=status element; only its text changes. Every refusal is a new request: the text is cleared and
  // set again on the next tick (so an identical message is announced again) and the hide timer restarts.
  const [noticeReq, setNoticeReq] = useState<{ text: string; seq: number } | null>(null);
  const [noticeText, setNoticeText] = useState('');
  const setNotice = useCallback(
    (text: string) => setNoticeReq((r) => ({ text, seq: (r?.seq ?? 0) + 1 })),
    []
  );
  useEffect(() => {
    if (noticeReq === null) {
      return undefined;
    }
    setNoticeText('');
    const show = window.setTimeout(() => setNoticeText(noticeReq.text), 0);
    const hide = window.setTimeout(() => setNoticeText(''), 4000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [noticeReq]);

  const guard = useCallback(
    (s: Screenset, next: Screenset, select?: DockerId) => {
      const { widthRem: w, heightRem: h, selected: sel } = latest.current;
      return guardedTree(s, next, registry.meta, w, h, select ?? sel);
    },
    [registry]
  );
  /**
   * A layout edit that must respect minimums (sends, new dockers, resizes). `what` names it in the refusal notice;
   * `select` is the docker the narrow rule must keep open while judging it and that becomes the selected docker once
   * the edit is accepted: a send's destination, or (a function of the screenset before and after) the docker the edit
   * created. A refused edit selects nothing.
   */
  const applyGuarded = useCallback(
    (
      fn: (s: Screenset) => Screenset,
      what?: string,
      select?: DockerId | ((before: Screenset, after: Screenset) => DockerId | undefined)
    ) => {
      const cur = latest.current.screenset;
      const want = fn(cur);
      const sel = typeof select === 'function' ? select(cur, want) : select;
      const refused = want !== cur && guard(cur, want, sel) === cur;
      if (what && refused) {
        setNotice(`Not enough room to ${what}.`);
      }
      if (want !== cur && !refused && sel !== undefined) {
        setSelected(sel);
      }
      update((s) => guard(s, fn(s), sel));
    },
    [guard, update, setNotice]
  );

  const titleOf = useCallback((id: PanelId) => registry.meta.get(id)?.title ?? id, [registry]);

  const focusRequest = useRef<PanelId | null>(null);

  const api = useMemo<StageApi>(() => {
    const homeOf = (id: PanelId) => registry.meta.get(id)?.home;
    const runShow = (s: Screenset, id: PanelId) => {
      let next = openPanel(s, id, { home: homeOf(id) });
      const d = dockerHolding(next.tree, id);
      if (d) {
        next = setCollapsed(next, d.id, false);
        next = setActive(next, d.id, id);
      }
      return { next, docker: d };
    };
    const placement = (id: PanelId) => geometry.dockers.find((p) => p.docker.tabs.includes(id));
    return {
      open(id, opts) {
        if (!registry.meta.has(id)) {
          return;
        }
        update((s) => openPanel(s, id, { home: opts?.home ?? homeOf(id) }));
      },
      show(id, opts) {
        if (!registry.meta.has(id)) {
          return;
        }
        update((s) => runShow(s, id).next);
        const d = runShow(latest.current.screenset, id).docker;
        if (d) {
          setSelected(d.id);
          if (opts?.focus) {
            focusRequest.current = id;
          }
        }
      },
      close(id) {
        update((s) => closePanel(s, id));
      },
      sendTo(id, target: Target) {
        if (!registry.meta.has(id)) {
          return;
        }
        applyGuarded(
          (s) => sendToOp(s, id, target),
          `send ${titleOf(id)} there`,
          target.kind === 'docker' ? target.docker : createdDocker
        );
      },
      isOpen: (id) => dockerHolding(screenset.tree, id) !== null,
      isShown(id) {
        const p = placement(id);
        return !!p && p.docker.active === id && p.state === 'open';
      },
    };
  }, [registry, screenset, geometry, update, applyGuarded, titleOf]);

  const actions = useMemo<DockerActions>(
    () => ({
      select: setSelected,
      activate: (docker, panel) => {
        setSelected(docker);
        update((s) => setActive(s, docker, panel));
      },
      rename: (docker, name) => {
        if (!canRenameDocker(latest.current.screenset, docker, name)) {
          return false;
        }
        update((s) => renameDocker(s, docker, name));
        return true;
      },
      newDocker: (beside, edge) =>
        applyGuarded(
          (s) => splitDocker(s, beside, edge)?.screenset ?? s,
          'add a docker there',
          createdDocker
        ),
      remove: (docker) => update((s) => removeDocker(s, docker)),
      setCollapsed: (docker, collapsed) => update((s) => setCollapsed(s, docker, collapsed)),
      closeTab: (panel) => update((s) => closePanel(s, panel)),
      sendToDocker: (panel, docker) => {
        applyGuarded(
          (s) => sendToOp(s, panel, { kind: 'docker', docker }),
          `send ${titleOf(panel)} there`,
          docker
        );
      },
      sendToNew: (panel, beside, edge) =>
        applyGuarded(
          (s) => sendToOp(s, panel, { kind: 'split', beside, edge }),
          `send ${titleOf(panel)} to a new docker`,
          createdDocker
        ),
    }),
    [update, applyGuarded, titleOf]
  );

  /* ------------------------------------------------------------------ what is rendered, and where it is held */
  const keepMounted = [...registry.meta.values()].filter((m) => m.keepMounted).map((m) => m.id);
  const renderIds = [...new Set([...openPanels(screenset.tree), ...keepMounted])].filter((id) =>
    registry.modules.has(id)
  );

  const holder = new Map<PanelId, (typeof geometry.dockers)[number]>();
  for (const p of geometry.dockers) {
    for (const t of p.docker.tabs) {
      holder.set(t, p);
    }
  }

  const plan = new Map<PanelId, { key: string; parked: boolean; docker?: DockerId }>();
  const parkBoxes = new Map<string, ParkBox>();
  let expanded: ReturnType<typeof solveTree> | null = null;
  const parkSize = (id: PanelId, placementOf?: (typeof geometry.dockers)[number]) => {
    if (placementOf) {
      const known = lastRem.current.get(`d:${placementOf.docker.id}`);
      if (known) {
        return known;
      }
      if (placementOf.state === 'collapsed') {
        expanded ??= solveTree(screenset.tree, widthRem, heightRem, {
          minOf,
          collapsed: [],
          selected,
        });
        const box = expanded.get(placementOf.docker.id);
        if (box && box.state === 'open' && box.width > 0 && box.height > 0) {
          return { w: box.width, h: box.height };
        }
      }
      const m = minOf(placementOf.docker);
      return { w: m.width, h: m.height };
    }
    const own = lastRem.current.get(`p:${id}`);
    if (own) {
      return own;
    }
    const place = screenset.lastDocker[id];
    return (place && lastRem.current.get(`d:${place.docker}`)) || STAGE_MIN;
  };
  for (const id of renderIds) {
    const p = holder.get(id);
    if (p && p.state === 'open') {
      plan.set(id, {
        key: `body:${p.docker.id}`,
        parked: p.docker.active !== id,
        docker: p.docker.id,
      });
    } else if (p) {
      const key = `park:docker:${p.docker.id}`;
      plan.set(id, { key, parked: true, docker: p.docker.id });
      if (!parkBoxes.has(key)) {
        const s = parkSize(id, p);
        parkBoxes.set(key, { key, w: s.w, h: s.h });
      }
    } else {
      const key = `park:panel:${id}`;
      plan.set(id, { key, parked: true });
      const s = parkSize(id);
      parkBoxes.set(key, { key, w: s.w, h: s.h });
    }
  }

  // a panel that left the render set (closed and not keepMounted, or unregistered) is dropped with its host
  useEffect(() => {
    const live = new Set(renderIds);
    for (const [id, host] of hosts.current) {
      if (!live.has(id)) {
        host.remove();
        hosts.current.delete(id);
      }
    }
  });

  // show(id, { focus: true }): focus the tab once it exists
  useLayoutEffect(() => {
    const id = focusRequest.current;
    if (id === null) {
      return;
    }
    const tab = [...(root.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])].find(
      (el) => el.dataset.tabId === id
    );
    if (tab) {
      focusRequest.current = null;
      tab.focus({ preventScroll: true });
    }
  });

  /* ------------------------------------------------------------------ splitters */
  const splitterOpts = () => ({ minOf, selected: latest.current.selected });
  const dockerList = geometry.dockers.map((p) => ({ id: p.docker.id, name: p.docker.name }));

  return (
    <StageApiContext.Provider value={api}>
      <div className={classes.root} ref={root} data-dock-root style={tokenStyle(DEFAULT_DENSITY)}>
        {geometry.dockers.map((p) => {
          const active = p.docker.active;
          return (
            <div key={p.docker.id} className={classes.dockerPos} style={rectStyle(p)}>
              <Docker
                placement={p}
                dockers={dockerList}
                titleOf={titleOf}
                uid={uid}
                selected={selected === p.docker.id}
                canRemove={geometry.dockers.length > 1}
                actions={actions}
                onMeasure={measure}
                registerBody={registerBody}
                sizeAttr={active ? slotSizeAttr(sizes[active] ?? INITIAL_SIZE) : undefined}
                showSize={showSizes}
              />
            </div>
          );
        })}
        {geometry.splitters.map((sp) => {
          const row = sp.dir === 'row';
          return (
            <div key={sp.key} className={classes.splitterPos} style={rectStyle(sp)}>
              <Splitter
                orientation={row ? 'vertical' : 'horizontal'}
                label={`Resize ${sp.before} and ${sp.after}`}
                valueNow={Math.round(sp.now)}
                valueMin={Math.round(sp.min)}
                valueMax={Math.round(sp.max)}
                valueText={`${Math.round(sp.now)} rem`}
                keys={
                  row
                    ? ['ArrowLeft', 'ArrowRight', 'Home', 'End']
                    : ['ArrowUp', 'ArrowDown', 'Home', 'End']
                }
                onKey={(key) => {
                  const to =
                    key === 'Home'
                      ? sp.min
                      : key === 'End'
                        ? sp.max
                        : key === 'ArrowLeft' || key === 'ArrowUp'
                          ? sp.now - NUDGE_REM
                          : sp.now + NUDGE_REM;
                  applyGuarded((s) =>
                    resizeSplit(s, sp.path, sp.index, to, sp.length, splitterOpts())
                  );
                }}
                onDragStart={() => {
                  const fresh = latest.current.geometry.splitters.find((x) => x.key === sp.key);
                  const start = (fresh ?? sp).now;
                  const px = rootPx();
                  return (dx, dy) =>
                    applyGuarded((s) =>
                      resizeSplit(
                        s,
                        sp.path,
                        sp.index,
                        start + (row ? dx : dy) / px,
                        sp.length,
                        splitterOpts()
                      )
                    );
                }}
              />
            </div>
          );
        })}
        <div className={classes.parkLayer} aria-hidden="true" ref={parkLayer}>
          {[...parkBoxes.values()].map((b) => (
            <div
              key={b.key}
              ref={containerRef(b.key)}
              className={classes.parkBox}
              style={{
                width: `${b.w}rem`,
                height: `${b.h}rem`,
                // the same box a docker body has (measured border-box, padded): a parked panel keeps its shown size
                boxSizing: 'border-box',
                padding: 'var(--body-padding)',
              }}
              data-park={b.key}
              inert
            />
          ))}
        </div>
        <HostPlacer plan={plan} hosts={hosts.current} containers={containers.current} uid={uid} />
        {renderIds.map((id) => {
          const module = registry.modules.get(id);
          if (!module) {
            return null;
          }
          const size = nearestSupportedSize(sizes[id] ?? INITIAL_SIZE, module.sizes);
          return createPortal(module.render(size), hostFor(id), id);
        })}
        <p role="status" className={classes.notice}>
          {noticeText}
        </p>
      </div>
    </StageApiContext.Provider>
  );
}

interface Plan {
  key: string;
  parked: boolean;
}

/**
 * Puts every host where the plan says: adopt into its container (scroll restored), parked or shown, labelled as a
 * tabpanel. It is rendered AFTER the dockers and the park layer and BEFORE the portals, so its layout effect runs when
 * the containers exist and before a newly mounted panel's own layout effects: a panel reading its box in
 * `useLayoutEffect` on mount already sits in its docker body.
 */
function HostPlacer({
  plan,
  hosts,
  containers,
  uid,
}: {
  plan: ReadonlyMap<PanelId, Plan>;
  hosts: ReadonlyMap<string, HTMLElement>;
  containers: ReadonlyMap<string, HTMLElement>;
  uid: string;
}) {
  useLayoutEffect(() => {
    for (const [id, where] of plan) {
      const host = hosts.get(id);
      if (!host) {
        continue;
      }
      const container = containers.get(where.key);
      if (container) {
        adopt(container, host);
      }
      setParked(host, where.parked);
      if (where.key.startsWith('body:') || where.key.startsWith('park:docker:')) {
        host.id = panelHostId(uid, id);
        host.setAttribute('role', 'tabpanel');
        host.setAttribute('aria-labelledby', tabId(uid, id));
      } else {
        host.removeAttribute('id');
        host.removeAttribute('role');
        host.removeAttribute('aria-labelledby');
      }
    }
  });
  return null;
}

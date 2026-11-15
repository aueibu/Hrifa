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
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  SIZE_MIN_HEIGHT_REM,
  SIZE_MIN_WIDTH_REM,
  canRenameDocker,
  closePanel,
  defaultDockerName,
  dockerHolding,
  findDocker,
  nearestSupportedSize,
  openPanel,
  openPanels,
  pxToRem,
  removeDocker,
  renameDocker,
  reorderTab,
  resizeSplit,
  sendTo as sendToOp,
  setActive,
  setCollapsed,
  setDockerSizing,
  slotSizeAttr,
  solveTree,
  splitDocker,
  treeDockers,
  type DockerId,
  type Edge,
  type PanelId,
  type Screenset,
} from '../../../lib/stage';
import { DEFAULT_DENSITY, tokenStyle } from '../../InspectorKit';
import { browserStorage, type StageStorage } from '../persistence';
import type { StageRegistry } from '../registry';
import { INITIAL_SIZE, withMeasure, type SlotSizes } from '../sizeState';
import { Splitter } from '../Splitter';
import { dockerMinOf, guardedTree } from '../stageOps';
import { Docker, panelHostId, tabId, type DockerActions } from './Docker';
import {
  dropTarget,
  layoutTree,
  sendToRoot,
  type DockRect,
  type DropResult,
  type DropTarget,
  type TabStripGeometry,
} from './dockLayout';
import { dockerSizing, toggledSizing } from './dockSizing';
import { resolveFocus, type FocusReq } from './focusRequest';
import { GoToDocker } from './GoToDocker';
import {
  dockerNumber,
  isTypingTarget,
  matchCommand,
  overlayOpen,
  type DockCommand,
} from './keyMap';
import { NamePrompt } from './NamePrompt';
import { adopt, createHost, hold, setParked } from './parking';
import { StageApiContext, type StageApi } from './stageApi';
import { readShowTabClose, writeShowTabClose } from './tabCloseSetting';
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
  /**
   * Hands the Stage API to code OUTSIDE the Stage (a Panels menu in the page header). Called with the API after mount
   * (the object is stable: it reads the latest registry and screenset when called, so a registry rebuild does not
   * change it) and with `null` on unmount. Inside the Stage use `useStageApi()`.
   */
  onApi?: (api: StageApi | null) => void;
  /**
   * The viewer setting "Show close button on tabs". Controlled when `showTabClose` is given (with `onShowTabClose`);
   * otherwise the Stage keeps it itself, persisted under `hrifa.stage.showTabClose.v1`, default off.
   */
  showTabClose?: boolean;
  onShowTabClose?: (next: boolean) => void;
  /** Where the setting is stored (tests pass a fake); defaults to localStorage. */
  storage?: StageStorage;
}

/** The docker an edit created: the id present after and not before. */
const createdDocker = (before: Screenset, after: Screenset): DockerId | undefined => {
  const had = new Set(treeDockers(before.tree).map((d) => d.id));
  return treeDockers(after.tree).find((d) => !had.has(d.id))?.id;
};

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const NUDGE_REM = 1;
/** A press must move this far (px) before it is a drag, so a plain click still selects the tab. */
const DRAG_THRESHOLD_PX = 4;
/** The click that ends a drag is eaten for at most this long (ms). */
const CLICK_EAT_MS = 250;
const STAGE_MIN = { w: SIZE_MIN_WIDTH_REM, h: SIZE_MIN_HEIGHT_REM };

const rectStyle = (r: DockRect): CSSProperties => ({
  left: `${r.x}rem`,
  top: `${r.y}rem`,
  width: `${r.width}rem`,
  height: `${r.height}rem`,
});

/** What the drag layer shows: the pointer (px from the root corner), the panel name and the zone under it. */
interface DragView {
  title: string;
  x: number;
  y: number;
  result: DropResult | null;
}

interface ParkBox {
  key: string;
  w: number;
  h: number;
}

export function DockStage({
  registry,
  screenset,
  update: updateProp,
  widthRem: widthProp,
  heightRem: heightProp,
  showSizes,
  onApi,
  showTabClose: showTabCloseProp,
  onShowTabClose,
  storage,
}: DockStageProps) {
  const uid = useId();
  const [ownTabClose, setOwnTabClose] = useState(() =>
    readShowTabClose(storage ?? browserStorage())
  );
  const showTabClose = showTabCloseProp ?? ownTabClose;
  const toggleTabClose = () => {
    const next = !showTabClose;
    if (showTabCloseProp === undefined) {
      setOwnTabClose(next);
      writeShowTabClose(storage ?? browserStorage(), next);
    }
    onShowTabClose?.(next);
  };
  // `update` is read through a ref so an inline function from the host cannot change the API (and loop through `onApi`)
  const updateRef = useRef(updateProp);
  updateRef.current = updateProp;
  const update = useCallback((fn: (s: Screenset) => Screenset) => updateRef.current(fn), []);
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

  // the API and the actions read the registry through a ref, so they stay stable when the host rebuilds the registry
  // (instances come and go) and always judge against the latest one
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const guard = useCallback((s: Screenset, next: Screenset, select?: DockerId) => {
    const { widthRem: w, heightRem: h, selected: sel } = latest.current;
    return guardedTree(s, next, registryRef.current.meta, w, h, select ?? sel);
  }, []);
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
    ): boolean => {
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
      return want !== cur && !refused;
    },
    [guard, update, setNotice]
  );

  const titleOf = useCallback((id: PanelId) => registryRef.current.meta.get(id)?.title ?? id, []);

  /**
   * THE send action: the Send-to menu, the API and a drop all come through here. Guarded (W-30) with the destination (or
   * the newly created docker) counted as selected; a refused edit leaves the screenset unchanged and shows the status
   * line; the selection moves only after an accepted edit. Returns whether the edit was accepted (a no-op, such as a
   * same-docker drop that changes no index, is not).
   */
  const sendToTarget = useCallback(
    (panel: PanelId, target: DropTarget): boolean => {
      if (!registryRef.current.meta.has(panel)) {
        return false;
      }
      if (
        target.kind === 'root' &&
        sendToRoot(latest.current.screenset, panel, target.edge) === latest.current.screenset
      ) {
        setNotice('No room for another split at the Stage edge.');
        return false;
      }
      return applyGuarded(
        (s) =>
          target.kind === 'root' ? sendToRoot(s, panel, target.edge) : sendToOp(s, panel, target),
        target.kind === 'docker'
          ? `send ${titleOf(panel)} there`
          : `send ${titleOf(panel)} to a new docker`,
        target.kind === 'docker' ? target.docker : createdDocker
      );
    },
    [applyGuarded, titleOf, setNotice]
  );

  /* ------------------------------------------------------------------ focus, selection and shortcuts */
  // A focus request is made by an action and resolved in a layout effect once the element exists (focusRequest.ts).
  const focusReq = useRef<{ req: FocusReq; tries: number } | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const requestFocus = useCallback((req: FocusReq) => {
    focusReq.current = { req, tries: 0 };
    bump();
  }, []);

  /** Select a docker (ring it, expand it if collapsed) and, by default, move focus to its active tab. */
  const selectDockerNow = useCallback(
    (id: DockerId, focus: boolean) => {
      if (!findDocker(latest.current.screenset.tree, id)) {
        return;
      }
      if ((latest.current.screenset.collapsed ?? []).includes(id)) {
        update((s) => setCollapsed(s, id, false));
      }
      setSelected(id);
      if (focus) {
        requestFocus({ kind: 'docker', docker: id });
      }
    },
    [update, requestFocus]
  );
  /** The docker that holds focus, else the selected one. */
  const currentDocker = useCallback((): DockerId | undefined => {
    const at = document.activeElement;
    const sec =
      at && root.current?.contains(at) ? at.closest<HTMLElement>('section[data-docker-id]') : null;
    return sec?.dataset.dockerId ?? latest.current.selected;
  }, []);
  const cycleDocker = useCallback(
    (delta: 1 | -1) => {
      const order = treeDockers(latest.current.screenset.tree);
      if (order.length === 0) {
        return;
      }
      const at = order.findIndex((d) => d.id === currentDocker());
      const to =
        at < 0 ? (delta > 0 ? 0 : order.length - 1) : (at + delta + order.length) % order.length;
      selectDockerNow(order[to].id, true);
    },
    [selectDockerNow, currentDocker]
  );
  const cycleSplitter = useCallback((delta: 1 | -1) => {
    const bars = [...(root.current?.querySelectorAll<HTMLElement>('[role="separator"]') ?? [])];
    if (bars.length === 0) {
      return;
    }
    const at = bars.indexOf(document.activeElement as HTMLElement);
    const to =
      at < 0 ? (delta > 0 ? 0 : bars.length - 1) : (at + delta + bars.length) % bars.length;
    bars[to].focus({ preventScroll: true });
  }, []);
  const [goTo, setGoTo] = useState(false);
  const goToReturn = useRef<HTMLElement | null>(null);
  const openGoTo = useCallback(() => {
    goToReturn.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGoTo(true);
  }, []);

  const runCommand = useCallback(
    (cmd: DockCommand): boolean => {
      const n = dockerNumber(cmd);
      if (n !== null) {
        const d = treeDockers(latest.current.screenset.tree)[n - 1];
        if (!d) {
          return false;
        }
        selectDockerNow(d.id, true);
        return true;
      }
      switch (cmd) {
        case 'nextDocker':
          cycleDocker(1);
          return true;
        case 'prevDocker':
          cycleDocker(-1);
          return true;
        case 'nextSplitter':
          cycleSplitter(1);
          return true;
        case 'prevSplitter':
          cycleSplitter(-1);
          return true;
        case 'goToDocker':
          openGoTo();
          return true;
        default:
          return false;
      }
    },
    [selectDockerNow, cycleDocker, cycleSplitter, openGoTo]
  );
  const runRef = useRef(runCommand);
  runRef.current = runCommand;
  // ONE window listener (cleaned up on unmount). It acts only when the Stage contains focus or nothing has focus (the
  // target is the body), never while typing in an input, textarea, select or contenteditable, never while a Mantine menu
  // or a dialog is open, and never for a key a panel already handled (defaultPrevented). Strips are outside every panel's
  // key scope, so panel key handling never sees these keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.defaultPrevented ? null : matchCommand(e);
      const rootEl = root.current;
      if (cmd === null || !rootEl) {
        return;
      }
      const at = document.activeElement;
      const inside = !!at && rootEl.contains(at);
      const bodyTarget = e.target === document.body && (at === null || at === document.body);
      if (
        (!inside && !bodyTarget) ||
        isTypingTarget(e.target as Element | null) ||
        isTypingTarget(at) ||
        overlayOpen()
      ) {
        return;
      }
      if (runRef.current(cmd)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const api = useMemo<StageApi>(() => {
    const homeOf = (id: PanelId) => registryRef.current.meta.get(id)?.home;
    const runShow = (s: Screenset, id: PanelId) => {
      let next = openPanel(s, id, { home: homeOf(id) });
      const d = dockerHolding(next.tree, id);
      if (d) {
        next = setCollapsed(next, d.id, false);
        next = setActive(next, d.id, id);
      }
      return { next, docker: d };
    };
    const placement = (id: PanelId) =>
      latest.current.geometry.dockers.find((p) => p.docker.tabs.includes(id));
    return {
      open(id, opts) {
        if (!registryRef.current.meta.has(id)) {
          return;
        }
        update((s) => openPanel(s, id, { home: opts?.home ?? homeOf(id) }));
      },
      show(id, opts) {
        if (!registryRef.current.meta.has(id)) {
          return;
        }
        update((s) => runShow(s, id).next);
        const d = runShow(latest.current.screenset, id).docker;
        if (d) {
          setSelected(d.id);
          if (opts?.focus) {
            requestFocus({ kind: 'tab', panel: id });
          }
        }
      },
      close(id) {
        update((s) => closePanel(s, id));
      },
      sendTo(id, target) {
        sendToTarget(id, target);
      },
      isOpen: (id) => dockerHolding(latest.current.screenset.tree, id) !== null,
      isShown(id) {
        const p = placement(id);
        return !!p && p.docker.active === id && p.state === 'open';
      },
      selectDocker: (id, opts) => selectDockerNow(id, opts?.focus !== false),
      cycleDocker,
      cycleSplitter,
      goToDocker: openGoTo,
    };
  }, [update, sendToTarget, requestFocus, selectDockerNow, cycleDocker, cycleSplitter, openGoTo]);

  const onApiRef = useRef(onApi);
  onApiRef.current = onApi;
  useEffect(() => {
    onApiRef.current?.(api);
  }, [api]);
  useEffect(() => () => onApiRef.current?.(null), []);

  /* ------------------------------------------------------------------ drag-to-dock */
  // A pointer enhancement over the Send-to menu (the keyboard route). State machine: idle -> pending (primary press on a
  // tab) -> dragging (pointer moved DRAG_THRESHOLD_PX) -> idle (drop applies sendToTarget; Escape, pointercancel or a
  // lost capture cancels). Below the threshold nothing happens, so a plain click still selects the tab. Per-move state
  // lives in DragLayer (never re-renders the panels); this component only learns which tab is being dragged.
  const [draggingPanel, setDraggingPanel] = useState<PanelId | null>(null);
  const dragView = useRef<((v: DragView | null) => void) | null>(null);
  const dragStop = useRef<(() => void) | null>(null);
  const clickEater = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      dragStop.current?.();
      clickEater.current?.();
    },
    []
  );

  const beginPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, panel: PanelId) => {
      if (event.button !== 0 || event.isPrimary === false) {
        return;
      }
      dragStop.current?.();
      clickEater.current?.();
      clickEater.current = null;
      const el = event.currentTarget;
      const { clientX: x0, clientY: y0, pointerId } = event;
      const title = titleOf(panel);
      const px = rootPx();
      let dragging = false;
      let strips = new Map<string, TabStripGeometry>();

      const rel = (r: DOMRect, o: DOMRect): DockRect => ({
        x: pxToRem(r.left - o.left, px),
        y: pxToRem(r.top - o.top, px),
        width: pxToRem(r.width, px),
        height: pxToRem(r.height, px),
      });
      const measureStrips = (rootEl: HTMLElement, o: DOMRect) => {
        const out = new Map<string, TabStripGeometry>();
        for (const sec of rootEl.querySelectorAll<HTMLElement>('section[data-docker-id]')) {
          const header = sec.querySelector<HTMLElement>('[data-dock-header]');
          const hr = header?.getBoundingClientRect();
          if (!header || !hr || hr.width === 0 || hr.height === 0) {
            continue;
          }
          const tabs = [...header.querySelectorAll<HTMLElement>('[data-tab-id]')].map((b) =>
            rel((b.parentElement ?? b).getBoundingClientRect(), o)
          );
          out.set(sec.dataset.dockerId ?? '', { strip: rel(hr, o), tabs });
        }
        return out;
      };
      const read = (ev: { clientX: number; clientY: number }) => {
        const o = root.current?.getBoundingClientRect();
        if (!o) {
          return { x: 0, y: 0, result: null };
        }
        const x = ev.clientX - o.left;
        const y = ev.clientY - o.top;
        const { geometry: g, widthRem: w, heightRem: h } = latest.current;
        const result = dropTarget({
          dockers: g.dockers,
          stage: { width: w, height: h },
          strips,
          panel,
          point: { x: pxToRem(x, px), y: pxToRem(y, px) },
          minWidth: STAGE_MIN.w,
          minHeight: STAGE_MIN.h,
        });
        return { x, y, result };
      };
      /**
       * The click that ends a drag must not also activate the tab: it is eaten once, right after the drop, and the eater
       * never outlives 250 ms or the next pointerdown, so it can never eat a later legitimate click.
       */
      const clearEater = () => {
        clickEater.current?.();
        clickEater.current = null;
      };
      const eatClick = () => {
        const rootEl = root.current;
        if (!rootEl) {
          return;
        }
        clearEater();
        const eat = (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          clearEater();
        };
        const down = () => clearEater();
        const timer = window.setTimeout(clearEater, CLICK_EAT_MS);
        rootEl.addEventListener('click', eat, true);
        document.addEventListener('pointerdown', down, true);
        clickEater.current = () => {
          rootEl.removeEventListener('click', eat, true);
          document.removeEventListener('pointerdown', down, true);
          window.clearTimeout(timer);
        };
      };
      /** After an Escape the button is still down: the click that follows its release is eaten (if it is released here). */
      const eatClickAfterRelease = () => {
        clearEater();
        const up = (e: PointerEvent) => {
          if (e.pointerId === pointerId) {
            clearEater();
            eatClick();
          }
        };
        const down = () => clearEater();
        document.addEventListener('pointerup', up, true);
        document.addEventListener('pointerdown', down, true);
        clickEater.current = () => {
          document.removeEventListener('pointerup', up, true);
          document.removeEventListener('pointerdown', down, true);
        };
      };

      const stop = () => {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onCancel, true);
        document.removeEventListener('keydown', onKey, true);
        el.removeEventListener('lostpointercapture', onCancel);
        if (dragging) {
          try {
            el.releasePointerCapture?.(pointerId);
          } catch {
            // already released
          }
          dragView.current?.(null);
          setDraggingPanel(null);
        }
        dragStop.current = null;
      };
      function onMove(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) {
          return;
        }
        if ((ev.buttons & 1) === 0) {
          // released outside the window before or during the drag: nothing is left to drop
          cancel(false);
          return;
        }
        if (!dragging) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD_PX) {
            return;
          }
          dragging = true;
          const o = root.current?.getBoundingClientRect();
          if (root.current && o) {
            strips = measureStrips(root.current, o);
          }
          try {
            el.setPointerCapture?.(pointerId);
          } catch {
            // a synthetic pointer: the document listeners still receive its events
          }
          setDraggingPanel(panel);
        }
        ev.preventDefault();
        dragView.current?.({ title, ...read(ev) });
      }
      function onUp(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) {
          return;
        }
        if (!dragging) {
          stop();
          return;
        }
        const { result } = read(ev);
        stop();
        eatClick();
        if (result && !result.noop && sendToTarget(panel, result.target)) {
          const t = result.target;
          const tree = latest.current.screenset.tree;
          const dest = t.kind === 'docker' ? findDocker(tree, t.docker) : null;
          const before = dockerHolding(tree, panel);
          setNotice(
            t.kind !== 'docker' || !dest
              ? `Moved ${title} to a new docker`
              : before?.id === dest.id
                ? `Moved ${title} within ${dest.name}`
                : `Moved ${title} to ${dest.name}`
          );
        }
      }
      /** A cancel (pointercancel, lost capture) is followed by no click; an Escape is, when the button is released. */
      function cancel(afterEscape: boolean) {
        const was = dragging;
        stop();
        if (was && afterEscape) {
          eatClickAfterRelease();
        }
      }
      function onCancel(ev: Event) {
        if ('pointerId' in ev && (ev as PointerEvent).pointerId !== pointerId) {
          return;
        }
        cancel(false);
      }
      function onKey(ev: KeyboardEvent) {
        if (ev.key === 'Escape' && dragging) {
          ev.preventDefault();
          ev.stopPropagation();
          cancel(true);
        }
      }
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onCancel, true);
      document.addEventListener('keydown', onKey, true);
      el.addEventListener('lostpointercapture', onCancel);
      dragStop.current = stop;
    },
    [titleOf, sendToTarget, setNotice]
  );

  // "New docker..." asks for a name first (a drop does not: it takes the default name).
  const [prompt, setPrompt] = useState<{ beside: DockerId; edge: Edge; panel?: PanelId } | null>(
    null
  );
  const promptDone = (name: string | null) => {
    const p = prompt;
    setPrompt(null);
    if (!p) {
      return;
    }
    if (name !== null) {
      if (p.panel !== undefined) {
        sendToTarget(p.panel, { kind: 'split', beside: p.beside, edge: p.edge, name });
      } else {
        applyGuarded(
          (s) => splitDocker(s, p.beside, p.edge, { name })?.screenset ?? s,
          'add a docker there',
          createdDocker
        );
      }
    }
    requestFocus(
      p.panel !== undefined
        ? { kind: 'tab', panel: p.panel }
        : { kind: 'dockerMenu', docker: p.beside }
    );
  };

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
      newDockerPrompt: (beside, edge) => setPrompt({ beside, edge }),
      remove: (docker) => {
        const order = treeDockers(latest.current.screenset.tree);
        const at = order.findIndex((d) => d.id === docker);
        const rest = order.filter((d) => d.id !== docker);
        update((s) => removeDocker(s, docker));
        const next = rest[Math.min(Math.max(at, 0), rest.length - 1)];
        if (next && rest.length < order.length) {
          setSelected(next.id);
          requestFocus({ kind: 'docker', docker: next.id });
        }
      },
      setCollapsed: (docker, collapsed) => update((s) => setCollapsed(s, docker, collapsed)),
      closeTab: (panel) => {
        const d = dockerHolding(latest.current.screenset.tree, panel);
        update((s) => closePanel(s, panel));
        if (d) {
          requestFocus({ kind: 'docker', docker: d.id });
        }
      },
      sendToDocker: (panel, docker) => {
        sendToTarget(panel, { kind: 'docker', docker });
        requestFocus({ kind: 'tab', panel });
      },
      sendToNewPrompt: (panel, beside, edge) => setPrompt({ beside, edge, panel }),
      moveTab: (panel, delta) => {
        // reorderTab also activates the moved tab; reordering is not activating (manual activation), so the
        // previous active tab is put back
        update((s) => {
          const d = dockerHolding(s.tree, panel);
          const to = d ? d.tabs.indexOf(panel) + delta : -1;
          if (!d || to < 0 || to >= d.tabs.length) {
            return s;
          }
          const moved = reorderTab(s, panel, to);
          return d.active && d.active !== panel ? setActive(moved, d.id, d.active) : moved;
        });
        requestFocus({ kind: 'tab', panel });
      },
      toggleSizing: (docker) => {
        const { screenset: cur, geometry: geo } = latest.current;
        const to = toggledSizing(cur, geo, docker);
        if (to) {
          applyGuarded((s) => setDockerSizing(s, docker, to), 'change its size');
        }
      },
      focus: requestFocus,
      tabPointerDown: (event, panel) => beginPress(event, panel),
    }),
    [update, applyGuarded, sendToTarget, beginPress, requestFocus]
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

  // a panel that left the render set (closed and not keepMounted, or unregistered) is dropped with its host; one that
  // left the REGISTRY (an instance deleted, the registry rebuilt) also loses its measurements and park-box refs
  useEffect(() => {
    const live = new Set(renderIds);
    for (const [id, host] of hosts.current) {
      if (!live.has(id)) {
        host.remove();
        hosts.current.delete(id);
      }
    }
    for (const key of [...lastRem.current.keys()]) {
      if (key.startsWith('p:') && !registry.meta.has(key.slice(2))) {
        lastRem.current.delete(key);
      }
    }
    for (const key of [...refCache.current.keys()]) {
      if (key.startsWith('park:panel:') && !live.has(key.slice('park:panel:'.length))) {
        refCache.current.delete(key);
      }
    }
    setSizes((cur) => {
      const gone = Object.keys(cur).filter((id) => !registry.meta.has(id));
      if (gone.length === 0) {
        return cur;
      }
      const next = { ...cur };
      for (const id of gone) {
        delete next[id];
      }
      return next;
    });
  });

  // resolve a focus request (show({ focus }), a shortcut, a menu action) once its element exists
  useLayoutEffect(() => {
    const pending = focusReq.current;
    if (pending === null || !root.current) {
      return;
    }
    // a request lives for ONE commit (the one its own bump or batched edit causes): resolved now or dropped, so a later
    // unrelated render can never steal focus
    focusReq.current = null;
    resolveFocus(root.current, pending.req)?.focus({ preventScroll: true });
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
                sizing={dockerSizing(screenset.tree, p.docker.id)}
                showTabClose={showTabClose}
                onToggleTabClose={toggleTabClose}
                actions={actions}
                onMeasure={measure}
                registerBody={registerBody}
                sizeAttr={active ? slotSizeAttr(sizes[active] ?? INITIAL_SIZE) : undefined}
                showSize={showSizes}
                draggingPanel={draggingPanel}
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
        <DragLayer viewRef={dragView} />
        {goTo && (
          <GoToDocker
            dockers={dockerList}
            selected={selected}
            onPick={(id) => {
              setGoTo(false);
              selectDockerNow(id, true);
            }}
            onClose={(restore) => {
              setGoTo(false);
              if (restore) {
                goToReturn.current?.focus();
              }
            }}
          />
        )}
        <p role="status" className={classes.notice}>
          {noticeText}
        </p>
        {prompt && (
          <NamePrompt
            opened
            title={
              prompt.panel !== undefined
                ? `Send ${titleOf(prompt.panel)} to a new docker`
                : 'New docker'
            }
            label="Docker name"
            initial={defaultDockerName(dockerList.map((d) => d.name))}
            taken={dockerList.map((d) => d.name)}
            confirmLabel="Create"
            onConfirm={(name) => promptDone(name)}
            onCancel={() => promptDone(null)}
          />
        )}
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
        host.tabIndex = -1; // focusable by script only: Escape on a strip focuses the active panel
        host.setAttribute('role', 'tabpanel');
        host.setAttribute('aria-labelledby', tabId(uid, id));
      } else {
        host.removeAttribute('id');
        host.removeAttribute('tabindex');
        host.removeAttribute('role');
        host.removeAttribute('aria-labelledby');
      }
    }
  });
  return null;
}

/**
 * The drag feedback, in its own component so a pointer move re-renders only this (never the panels): a transparent
 * shield over the whole Stage (canvases, iframes and panel content cannot swallow the pointer), the translucent preview
 * of the zone under the pointer, and the floating panel name. All aria-hidden: the Send-to menu is the keyboard route.
 */
function DragLayer({
  viewRef,
}: {
  viewRef: MutableRefObject<((v: DragView | null) => void) | null>;
}) {
  const [view, setView] = useState<DragView | null>(null);
  useLayoutEffect(() => {
    viewRef.current = setView;
    return () => {
      viewRef.current = null;
    };
  }, [viewRef]);
  if (!view) {
    return null;
  }
  const r = view.result;
  return (
    <>
      <div className={classes.shield} data-dock-shield aria-hidden="true" />
      {r && !r.noop && (
        <div
          className={classes.dropPreview}
          data-dock-preview
          data-zone={r.zone}
          aria-hidden="true"
          style={rectStyle(r.preview)}
        />
      )}
      <div
        className={classes.dragLabel}
        data-dock-drag-label
        aria-hidden="true"
        style={{ left: view.x + 12, top: view.y + 12 }}
      >
        {view.title}
      </div>
    </>
  );
}

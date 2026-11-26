import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Menu, Text } from '@mantine/core';
import { Button } from '../../../ui';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { useCompositionSettings } from '../compositionSettings';
import { EnsureDataBlockOps } from '../dataBlockOps';
import { newDataBlockId } from '../desk';
import { compareRational, rationalToNumber, subtractRational, type Rational } from '../musicalTime';
import { applyDrop, dropLanding, laneAtY } from '../scene/arrangerDrop';
import {
  DRAG_THRESHOLD_PX,
  PIXELS_PER_QUARTER,
  beatStep,
  dragCancel,
  dragLive,
  dragMove,
  dragOutcome,
  dragRelease,
  dragStart,
  dragStep,
  playheadQuarters,
  quartersToPx,
  rulerMarks,
  sceneLengthQuarters,
  sharedEdgeOutcome,
  type DragKind,
  type DragState,
} from '../scene/arrangerGeometry';
import { arrangerEntries, touchingPairs } from '../scene/arrangerLanes';
import {
  PREVIEW_HEIGHT,
  groupEventsByObject,
  previewRects,
  rectsToPath,
  toPreviewNotes,
} from '../scene/arrangerPreview';
import {
  childTicks,
  connectorPath,
  laneBoxes,
  linkedIds,
  relationLinks,
  selectedLinks,
  subLaneBottom,
  subLaneTop,
} from '../scene/arrangerRelations';
import {
  duplicateObject,
  duplicateObjectLinked,
  resizeSharedEdge,
  setMute,
  setTimeSpan,
  type SceneOpResult,
} from '../scene/sceneOps';
import { ROW_HEIGHT_MAX_REM, ROW_HEIGHT_MIN_REM, rowHeightRem } from '../scene/sceneSession';
import {
  chainPlacement,
  objectChain,
  objectDataOf,
  type ObjectData,
  type ObjectMapping,
} from '../scene/sceneTypes';
import { sharedDataOf } from '../scene/sharedData';
import {
  useSceneEvaluation,
  useScenePlayback,
  useScenePreviewEvaluation,
} from '../scene/useScenePlayback';
import { useSceneEditor } from './ScenePanels';
import classes from './ArrangerPanel.module.css';

/**
 * The Arranger (workbench O2b, Tracks in TK2, W-82). A thin band per Collection (name, fold, mute) with
 * its Tracks indented below; ONE lane per Track (empty ones too); the objects on a Track are the blocks on
 * its lane, and objects that overlap in time (a parent and its children, or anything the human drops on
 * another) draw on automatic sub-lanes that appear only when needed. It follows Bitwig's Arranger Timeline for dragging and snapping (drag a block to move it
 * freely, drag an edge to resize, snap to the beat grid, Shift turns snapping off). It reads and writes
 * through the same editor as the Outliner and Properties (`useSceneEditor`): a drag shows from local
 * state and is ONE commit on release.
 */

/** The name column's width in rem (the CSS uses the same). */
const NAME_REM = 8;

/** The gap above and below a block inside its sub-lane, in rem (the same value the CSS had). */
const BLOCK_GAP_REM = 0.15;

/** The height of a Collection band in rem (the same as the ruler header). */
const BAND_REM = 1.5;

/** One object's placement: world start and duration, plus the objects from itself up its parents. */
interface PlacedRowObject {
  key: string;
  world: Rational;
  relative: Rational;
  duration: Rational;
  offset: Rational;
  mapping: ObjectMapping;
  chain: { id: string; data: ObjectData }[];
}

/** A block's pixel box. */
interface Geometry {
  left: number;
  width: number;
}

/** A body drag's vertical part: where it began, where the pointer is, and the lane under it. */
interface MoveExtra {
  startY: number;
  y: number;
  over: string | null;
}

/** A drag of the edge two touching blocks share. */
interface SharedDrag {
  leftId: string;
  rightId: string;
  edge: Rational;
  leftStart: Rational;
  rightEnd: Rational;
  startX: number;
  deltaPx: number;
  shift: boolean;
  moved: boolean;
}

function newEnv() {
  return { newId: newDataBlockId, now: new Date().toISOString() };
}

export function ArrangerPanel() {
  return (
    <EnsureDataBlockOps>
      <ArrangerBody />
    </EnsureDataBlockOps>
  );
}

function ArrangerBody() {
  const editor = useSceneEditor();
  const { blocks, scene, rows, writable, session, updateSession } = editor;
  const { settings } = useCompositionSettings();
  const meter = settings.transport.meter;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [moveExtra, setMoveExtra] = useState<MoveExtra | null>(null);
  const [shared, setShared] = useState<SharedDrag | null>(null);
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // A lane-height drag in progress (local until release, then kept in the viewer's session).
  const [rowDrag, setRowDrag] = useState<{
    id: string;
    startY: number;
    startRem: number;
    rem: number;
    count: number;
  } | null>(null);
  const laneEls = useRef(new Map<string, HTMLElement>());

  const evaluation = useSceneEvaluation(blocks, scene?.id ?? null);
  const previewEvaluation = useScenePreviewEvaluation(blocks, scene?.id ?? null);
  const playback = useScenePlayback(scene?.id ?? null, evaluation);
  const planQuarters = evaluation ? rationalToNumber(evaluation.plan.duration.quarterNotes) : 0;

  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const step = beatStep(meter);

  /** The bands and lanes, from the COMMITTED placement only (a live drag never changes a lane's size). */
  const entries = useMemo(() => (scene ? arrangerEntries(blocks, scene.id) : []), [blocks, scene]);
  const lanes = useMemo(
    () => entries.flatMap((entry) => (entry.kind === 'track' ? [entry.lane] : [])),
    [entries]
  );
  const collapsed = useMemo(() => new Set(session.collapsedBands), [session.collapsedBands]);
  /** What is drawn: everything except what sits under a folded band. */
  const shownEntries = useMemo(
    () => entries.filter((entry) => !entry.ancestors.some((id) => collapsed.has(id))),
    [entries, collapsed]
  );
  const laneOf = useMemo(() => {
    const out = new Map<string, string>();
    lanes.forEach((lane) => lane.objects.forEach((object) => out.set(object.id, lane.id)));
    return out;
  }, [lanes]);

  /** Each object's placement. */
  const placed = useMemo(() => {
    const out = new Map<string, PlacedRowObject>();
    for (const lane of lanes) {
      for (const object of lane.objects) {
        const data = objectDataOf(byId.get(object.id));
        const chain = data ? objectChain(byId, object.id) : null;
        if (!data || chain === null || chain.length === 0) {
          continue;
        }
        out.set(object.id, {
          key: object.id,
          world: chainPlacement(chain).start,
          relative: data.timeSpan.start,
          duration: data.timeSpan.duration,
          offset: data.contentOffset,
          mapping: data.mapping,
          chain,
        });
      }
    }
    return out;
  }, [lanes, byId]);

  /**
   * Each object's note preview as one SVG path, from the committed placement. It reads the evaluation
   * that includes muted objects (they are drawn ghosted, not left empty), and depends on that and the
   * placement only (a live drag is local state), so dragging never recomputes it.
   */
  const previews = useMemo(() => {
    const out = new Map<string, string>();
    if (!previewEvaluation) {
      return out;
    }
    const groups = groupEventsByObject(previewEvaluation.plan.events);
    for (const item of placed.values()) {
      const events = groups.get(item.key);
      if (!events || events.length === 0) {
        continue;
      }
      const notes = toPreviewNotes(events, rationalToNumber(item.world));
      const path = rectsToPath(
        previewRects(notes, rationalToNumber(item.duration), PIXELS_PER_QUARTER)
      );
      if (path !== '') {
        out.set(item.key, path);
      }
    }
    return out;
  }, [previewEvaluation, placed]);

  /** Parent display: every parent to child link between blocks, and the ones the selection touches. */
  const links = useMemo(() => {
    const parentOf = new Map<string, string>();
    for (const item of placed.values()) {
      const parentId = item.chain[0].data.parentRef?.id;
      if (parentId !== undefined) {
        parentOf.set(item.key, parentId);
      }
    }
    return relationLinks(lanes, parentOf);
  }, [lanes, placed]);
  const shownLinks = useMemo(
    () => selectedLinks(links, session.selectedId),
    [links, session.selectedId]
  );
  const tinted = useMemo(() => linkedIds(shownLinks), [shownLinks]);
  /** Shared data (W-79): computed from the primary data refs only, nothing stored. */
  const sharing = useMemo(
    () =>
      sharedDataOf(
        blocks,
        lanes.flatMap((lane) => lane.objects.map((object) => object.id))
      ),
    [blocks, lanes]
  );
  const sharersOfSelected = useMemo(
    () =>
      new Set(session.selectedId === null ? [] : (sharing.get(session.selectedId)?.others ?? [])),
    [sharing, session.selectedId]
  );
  /** The name of each object's primary data-block, for the title bar. */
  const dataNameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const lane of lanes) {
      for (const object of lane.objects) {
        const dataId = objectDataOf(byId.get(object.id))?.primaryDataRef?.id;
        const name = dataId === undefined ? undefined : byId.get(dataId)?.name;
        if (name !== undefined) {
          names.set(object.id, name);
        }
      }
    }
    return names;
  }, [lanes, byId]);
  const parentNameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const link of links) {
      const parent = byId.get(link.parentId);
      if (parent) {
        names.set(link.childId, parent.name);
      }
    }
    return names;
  }, [links, byId]);

  // The live result of the drag in progress (local state only: nothing is written until release).
  const live = drag ? dragLive(drag, meter) : null;
  const movedAny =
    drag !== null &&
    drag.kind === 'move' &&
    (drag.moved ||
      (moveExtra !== null && Math.abs(moveExtra.y - moveExtra.startY) >= DRAG_THRESHOLD_PX));
  const freeShiftPx =
    drag && movedAny ? Math.max(drag.deltaPx, -quartersToPx(drag.base.worldStart)) : 0;
  const sharedEdge = shared
    ? sharedEdgeOutcome(
        shared.edge,
        shared.leftStart,
        shared.rightEnd,
        shared.moved ? shared.deltaPx : 0,
        dragStep(meter, shared.shift),
        step
      )
    : null;

  /**
   * An object's block: its world start and full width. While a resize is live, the chain is re-placed
   * with the dragged object's live span, so a moved parent carries its children, from local state only. A body drag is FREE:
   * the dragged block and the blocks under it follow the pointer by its exact distance.
   */
  function geometryOf(item: PlacedRowObject): Geometry {
    const base = (() => {
      if (drag && drag.kind === 'move' && movedAny && item.chain.some((l) => l.id === drag.id)) {
        let start = 0;
        for (let index = item.chain.length - 1; index >= 0; index -= 1) {
          const link = item.chain[index];
          start += quartersToPx(link.data.timeSpan.start) + (link.id === drag.id ? freeShiftPx : 0);
        }
        const width = quartersToPx(item.chain[0].data.timeSpan.duration);
        return { left: start, width };
      }
      const chain =
        drag && live && drag.kind !== 'move' && item.chain.some((link) => link.id === drag.id)
          ? item.chain.map((link) =>
              link.id === drag.id
                ? {
                    ...link,
                    data: {
                      ...link.data,
                      timeSpan: { start: live.start, duration: live.duration },
                    },
                  }
                : link
            )
          : item.chain;
      const { start } = chainPlacement(chain);
      const { duration } = chain[0].data.timeSpan;
      return { left: quartersToPx(start), width: quartersToPx(duration) };
    })();
    if (shared && sharedEdge) {
      if (item.key === shared.leftId) {
        const width = quartersToPx(subtractRational(sharedEdge, item.world));
        return { ...base, width };
      }
      if (item.key === shared.rightId) {
        const left = quartersToPx(sharedEdge);
        const width = quartersToPx(subtractRational(shared.rightEnd, sharedEdge));
        return { left, width };
      }
    }
    return base;
  }

  let liveEnd = 0;
  for (const item of placed.values()) {
    const g = geometryOf(item);
    liveEnd = Math.max(liveEnd, g.left + g.width);
  }
  const lengthQuarters = sceneLengthQuarters(planQuarters, meter);
  const lanePx = Math.max(lengthQuarters * PIXELS_PER_QUARTER, liveEnd + 4 * quartersToPx(step));
  const marks = useMemo(() => rulerMarks(meter, lanePx / PIXELS_PER_QUARTER), [meter, lanePx]);

  function report(result: SceneOpResult) {
    setMessage(result.ok ? '' : result.error);
    return result;
  }

  /**
   * The Track lane under a pointer height (null: off the lanes). A press that has not moved up or down
   * yet stays on its own lane (no layout lookup).
   */
  function overLane(y: number, extra: MoveExtra, from: string | undefined): string | null {
    if (Math.abs(y - extra.startY) < DRAG_THRESHOLD_PX && from !== undefined) {
      return from;
    }
    const rects = [...laneEls.current].map(([id, element]) => {
      const rect = element.getBoundingClientRect();
      return { id, top: rect.top, bottom: rect.bottom };
    });
    return laneAtY(y, rects);
  }

  function begin(
    event: PointerEvent<HTMLElement>,
    rowId: string,
    item: PlacedRowObject,
    kind: DragKind
  ) {
    if (event.button !== 0) {
      return;
    }
    updateSession({ selectedId: rowId });
    setMessage('');
    if (!writable) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag(
      dragStart(
        item.key,
        kind,
        {
          worldStart: item.world,
          relativeStart: item.relative,
          duration: item.duration,
          contentOffset: item.offset,
          mapping: item.mapping,
        },
        event.clientX,
        event.shiftKey,
        null
      )
    );
    setMoveExtra(
      kind === 'move'
        ? {
            startY: event.clientY,
            y: event.clientY,
            over: laneOf.get(item.key) ?? null,
          }
        : null
    );
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (drag) {
      setDrag(dragMove(drag, event.clientX, event.shiftKey));
      if (moveExtra) {
        const under = overLane(event.clientY, moveExtra, laneOf.get(drag.id));
        setMoveExtra({ ...moveExtra, y: event.clientY, over: under });
      }
    }
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (!drag) {
      return;
    }
    const current = drag;
    const extra = moveExtra;
    setDrag(dragCancel());
    setMoveExtra(null);
    const { id, kind } = current;
    if (!placed.has(id)) {
      return;
    }
    if (kind === 'move') {
      const final = dragMove(current, event.clientX, event.shiftKey);
      const from = laneOf.get(id);
      if (!extra || from === undefined) {
        return;
      }
      const under = overLane(event.clientY, extra, from);
      const target = under;
      const travelled = final.moved || Math.abs(event.clientY - extra.startY) >= DRAG_THRESHOLD_PX;
      if (!travelled || target === null) {
        // A click, or released off the lanes: nothing is written and the block snaps back.
        return;
      }
      const outcome = dragOutcome(
        'move',
        final.base,
        final.deltaPx,
        dragStep(meter, event.shiftKey),
        step
      );
      if (target === from && compareRational(outcome.start, final.base.relativeStart) === 0) {
        return;
      }
      // Lands where it was dropped (blocks may overlap on a Track); another Track's row moves it onto that
      // Track first, its time unchanged. ONE commit, one undo step.
      report(editor.commit((list) => applyDrop(list, id, from, target, outcome.start)));
      return;
    }
    const commit = dragRelease(current, event.clientX, event.shiftKey, meter);
    if (commit === null) {
      return;
    }
    if (kind === 'resize-left') {
      report(
        editor.commit((list) =>
          setTimeSpan(list, id, {
            start: commit.start,
            duration: commit.duration,
            contentOffset: commit.contentOffset,
          })
        )
      );
    } else {
      report(editor.commit((list) => setTimeSpan(list, id, { duration: commit.duration })));
    }
  }

  function cancel() {
    setDrag(dragCancel());
    setMoveExtra(null);
  }

  function beginShared(
    event: PointerEvent<HTMLElement>,
    leftId: string,
    rightId: string,
    leftStart: Rational,
    rightEnd: Rational,
    edge: Rational
  ) {
    event.stopPropagation();
    if (event.button !== 0 || !writable) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setMessage('');
    setShared({
      leftId,
      rightId,
      edge,
      leftStart,
      rightEnd,
      startX: event.clientX,
      deltaPx: 0,
      shift: event.shiftKey,
      moved: false,
    });
  }

  function moveShared(event: PointerEvent<HTMLElement>) {
    if (shared) {
      const deltaPx = event.clientX - shared.startX;
      setShared({
        ...shared,
        deltaPx,
        shift: event.shiftKey,
        moved: shared.moved || Math.abs(deltaPx) >= DRAG_THRESHOLD_PX,
      });
    }
  }

  function endShared(event: PointerEvent<HTMLElement>) {
    if (!shared) {
      return;
    }
    const current = shared;
    setShared(null);
    const deltaPx = event.clientX - current.startX;
    if (!current.moved && Math.abs(deltaPx) < DRAG_THRESHOLD_PX) {
      return;
    }
    const landed = sharedEdgeOutcome(
      current.edge,
      current.leftStart,
      current.rightEnd,
      deltaPx,
      dragStep(meter, event.shiftKey),
      step
    );
    if (compareRational(landed, current.edge) === 0) {
      return;
    }
    report(
      editor.commit((list) => resizeSharedEdge(list, current.leftId, current.rightId, landed, step))
    );
  }

  const remPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  function beginRow(event: PointerEvent<HTMLElement>, laneId: string, count: number) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startRem = rowHeightRem(session, laneId);
    setRowDrag({ id: laneId, startY: event.clientY, startRem, rem: startRem, count });
  }

  function moveRow(event: PointerEvent<HTMLElement>) {
    if (rowDrag) {
      // The lane's bottom edge follows the pointer: the change is shared by its sub-lanes.
      const rem = rowDrag.startRem + (event.clientY - rowDrag.startY) / remPx() / rowDrag.count;
      setRowDrag({
        ...rowDrag,
        rem: Math.min(ROW_HEIGHT_MAX_REM, Math.max(ROW_HEIGHT_MIN_REM, rem)),
      });
    }
  }

  function endRow() {
    if (rowDrag && rowDrag.rem !== rowDrag.startRem) {
      updateSession({ rowHeights: { ...session.rowHeights, [rowDrag.id]: rowDrag.rem } });
    }
    setRowDrag(null);
  }

  function toggleFold(id: string) {
    updateSession({
      collapsedBands: collapsed.has(id)
        ? session.collapsedBands.filter((entry) => entry !== id)
        : [...session.collapsedBands, id],
    });
  }

  function toggleMute(id: string, mute: boolean) {
    report(editor.commit((list) => setMute(list, id, mute)));
  }

  function openMenu(event: MouseEvent<HTMLElement>, id: string) {
    event.preventDefault();
    updateSession({ selectedId: id });
    setMenu({ id, x: event.clientX, y: event.clientY });
  }

  function duplicate(id: string, linked: boolean) {
    const result = report(
      editor.commit((list) =>
        linked ? duplicateObjectLinked(list, newEnv(), id) : duplicateObject(list, newEnv(), id)
      )
    );
    if (result.ok && result.created[0]) {
      updateSession({ selectedId: result.created[0] });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Delete removes the selected object through the Outliner's path (children keep their place).
    if (
      event.key === 'Delete' &&
      writable &&
      session.selectedId !== null &&
      placed.has(session.selectedId)
    ) {
      event.preventDefault();
      report(editor.remove(session.selectedId));
    }
  }

  /** A block's live left edge in pixels (it follows a drag), for the ticks and the connectors. */
  const startPx = (id: string) => {
    const item = placed.get(id);
    return item === undefined ? undefined : geometryOf(item).left;
  };
  // The dashed connectors of the selection, in pixels from the lanes' top left (drawn over the lanes).
  const rem = remPx();
  const boxes = laneBoxes(
    shownEntries.map((entry) =>
      entry.kind === 'band'
        ? { id: entry.band.id, subLanes: 0, fixedRem: BAND_REM }
        : { id: entry.lane.id, subLanes: entry.lane.subLanes }
    ),
    (laneId) => (rowDrag && rowDrag.id === laneId ? rowDrag.rem : rowHeightRem(session, laneId))
  );
  const connectors = shownLinks.flatMap((link) => {
    const parentBox = boxes.get(link.parentLane);
    const childBox = boxes.get(link.childLane);
    const x = startPx(link.childId);
    if (!parentBox || !childBox || x === undefined) {
      return [];
    }
    // From the tick at the child's start on the parent's bottom edge to the child's start corner (its top
    // edge when it is below the parent, its bottom edge when above).
    const fromY = subLaneBottom(parentBox, link.parentSubLane);
    const toTop = subLaneTop(childBox, link.childSubLane);
    const toY = toTop >= fromY ? toTop : subLaneBottom(childBox, link.childSubLane);
    return [
      {
        key: `${link.parentId}|${link.childId}`,
        // +0.5: a 1 px stroke is centered on its x, so this puts it on the child's first pixel column.
        d: connectorPath({ x: x + 0.5, y: fromY * rem }, { x: x + 0.5, y: toY * rem }),
      },
    ];
  });

  // The faint outline of where a body drag will land on ANOTHER Track, and the lane it is over.
  let landing: { laneId: string; left: number; width: number } | null = null;
  if (drag && drag.kind === 'move' && movedAny && moveExtra?.over) {
    const from = laneOf.get(drag.id);
    if (from !== undefined && moveExtra.over !== from) {
      const outcome = dragOutcome(
        'move',
        drag.base,
        drag.deltaPx,
        dragStep(meter, drag.shift),
        step
      );
      const world = dropLanding(blocks, drag.id, from, moveExtra.over, outcome.start);
      if (world) {
        landing = {
          laneId: moveExtra.over,
          left: quartersToPx(world),
          width: quartersToPx(drag.base.duration),
        };
      }
    }
  }
  const targetLane = movedAny ? (moveExtra?.over ?? null) : null;
  const menuObject = menu ? rows.find((row) => row.id === menu.id) : undefined;

  return (
    <section className={classes.panel} aria-label="Arranger">
      <div className={classes.bar}>
        <Button
          className={classes.play}
          variant="default"
          disabled={!playback.playing && playback.refusal !== null}
          data-info={
            playback.playing
              ? 'Stop the scene'
              : (playback.refusal ?? 'Play the scene once through on the transport')
          }
          onClick={playback.toggle}
        >
          {playback.playing ? '■ Stop' : '▶ Play'}
        </Button>
        <span className={classes.status} role="status" title={message}>
          {message}
        </span>
      </div>
      <div
        className={classes.scroller}
        role="grid"
        aria-label="Scene timeline"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {scene === null ? (
          <Text className={classes.empty}>Choose a scene in the Outliner.</Text>
        ) : entries.length === 0 ? (
          <Text className={classes.empty}>Nothing in this scene yet.</Text>
        ) : (
          <div className={classes.content} style={{ width: `calc(${NAME_REM}rem + ${lanePx}px)` }}>
            <div className={classes.header}>
              <div className={classes.corner} />
              <div className={classes.ruler} style={{ width: lanePx }} aria-hidden>
                {marks.map((mark) => (
                  <span
                    key={mark.quarters}
                    className={`${classes.mark} ${mark.isBar ? classes.markBar : classes.markBeat}`}
                    style={{ left: mark.quarters * PIXELS_PER_QUARTER }}
                  >
                    {mark.isBar && <span className={classes.markLabel}>{mark.bar}</span>}
                  </span>
                ))}
              </div>
            </div>
            {shownEntries.map((entry) => {
              if (entry.kind === 'band') {
                const { band } = entry;
                const folded = collapsed.has(band.id);
                return (
                  <div
                    key={band.id}
                    className={`${classes.row} ${classes.band} ${band.muted ? classes.rowMuted : ''}`}
                    role="row"
                    aria-level={band.depth + 1}
                    aria-selected={band.id === session.selectedId}
                    aria-expanded={!folded}
                    data-band={band.id}
                    style={{ height: `${BAND_REM}rem` }}
                  >
                    <div
                      className={classes.name}
                      role="rowheader"
                      style={{ paddingLeft: `${0.25 + band.depth * 1}rem` }}
                      onClick={() => updateSession({ selectedId: band.id })}
                    >
                      <button
                        type="button"
                        className={classes.nameButton}
                        aria-label={`${folded ? 'Unfold' : 'Fold'} ${band.name}`}
                        data-info={folded ? 'Show its tracks' : 'Hide its tracks'}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFold(band.id);
                        }}
                      >
                        {folded ? '▸' : '▾'}
                      </button>
                      <span className={classes.nameText}>{band.name}</span>
                      <button
                        type="button"
                        className={classes.muteButton}
                        aria-label={`${band.mute ? 'Unmute' : 'Mute'} ${band.name}`}
                        aria-pressed={band.mute}
                        data-info={band.mute ? 'Unmute this collection' : 'Mute this collection'}
                        disabled={!writable}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleMute(band.id, !band.mute);
                        }}
                      >
                        M
                      </button>
                    </div>
                    <div className={classes.lane} style={{ width: lanePx }} role="gridcell" />
                  </div>
                );
              }
              const { lane } = entry;
              const laneSelected = lane.id === session.selectedId;
              const subRem =
                rowDrag && rowDrag.id === lane.id ? rowDrag.rem : rowHeightRem(session, lane.id);
              const subTop = (sub: number) => `${sub * subRem + BLOCK_GAP_REM}rem`;
              const subHeight = `${subRem - 2 * BLOCK_GAP_REM}rem`;
              const touching = touchingPairs(lane);
              const rightTouched = new Set(touching.map((pair) => pair.leftId));
              const leftTouched = new Set(touching.map((pair) => pair.rightId));
              return (
                <div
                  key={lane.id}
                  ref={(element) => {
                    if (element) {
                      laneEls.current.set(lane.id, element);
                    } else {
                      laneEls.current.delete(lane.id);
                    }
                  }}
                  className={`${classes.row} ${lane.muted ? classes.rowMuted : ''}`}
                  role="row"
                  aria-level={lane.depth + 1}
                  aria-selected={laneSelected}
                  data-lane={lane.id}
                  data-sublanes={lane.subLanes}
                  style={{ height: `${subRem * lane.subLanes}rem` }}
                >
                  <div
                    className={classes.name}
                    role="rowheader"
                    style={{ paddingLeft: `${0.25 + lane.depth * 1}rem` }}
                    onClick={() => updateSession({ selectedId: lane.id })}
                  >
                    <span className={classes.nameText}>{lane.name}</span>
                    <button
                      type="button"
                      className={classes.muteButton}
                      aria-label={`${lane.mute ? 'Unmute' : 'Mute'} ${lane.name}`}
                      aria-pressed={lane.mute}
                      data-info={lane.mute ? 'Unmute this track' : 'Mute this track'}
                      disabled={!writable}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMute(lane.id, !lane.mute);
                      }}
                    >
                      M
                    </button>
                  </div>
                  <div className={classes.lane} style={{ width: lanePx }} role="gridcell">
                    {lane.objects.map((object) => {
                      const item = placed.get(object.id);
                      if (item === undefined) {
                        return null;
                      }
                      const geometry = geometryOf(item);
                      const looping = item.mapping === 'loop';
                      const edgeInfo = looping
                        ? 'Drag to extend the loop. Hold Shift to turn snapping off.'
                        : 'Drag to change the length. Hold Shift to turn snapping off.';
                      const path = previews.get(item.key);
                      const selected = object.id === session.selectedId;
                      const dragged =
                        drag !== null && drag.kind === 'move' && drag.id === object.id;
                      const lifted = dragged && movedAny;
                      const followed = parentNameOf.get(object.id);
                      const share = sharing.get(object.id);
                      const dataName = dataNameOf.get(object.id);
                      const shareText =
                        share === undefined
                          ? ''
                          : `Shares ${byId.get(share.dataId)?.name ?? 'its data'} with ${share.others.length} other ${
                              share.others.length === 1 ? 'object' : 'objects'
                            }`;
                      return (
                        <div
                          key={item.key}
                          className={`${classes.block} ${selected ? classes.blockSelected : ''} ${
                            object.muted ? classes.blockMuted : ''
                          } ${lifted ? classes.blockLifted : ''} ${
                            tinted.has(object.id) || sharersOfSelected.has(object.id)
                              ? classes.blockRelated
                              : ''
                          }`}
                          role="button"
                          aria-label={`Block ${object.name}`}
                          aria-pressed={selected}
                          data-muted={object.muted}
                          data-info="Drag to move, also to another track. Drag an edge to change the length. Hold Shift to turn snapping off."
                          style={{
                            left: geometry.left,
                            width: geometry.width,
                            top: subTop(object.subLane),
                            height: subHeight,
                            transform:
                              lifted && moveExtra
                                ? `translateY(${moveExtra.y - moveExtra.startY}px)`
                                : undefined,
                          }}
                          onPointerDown={(event) => begin(event, object.id, item, 'move')}
                          onPointerMove={move}
                          onPointerUp={end}
                          onPointerCancel={cancel}
                          onContextMenu={(event) => openMenu(event, object.id)}
                        >
                          <div className={classes.titleBar} data-testid="arranger-title-bar">
                            <span className={classes.titleText}>
                              {followed !== undefined && (
                                <span
                                  className={classes.follows}
                                  data-testid="arranger-follows"
                                  data-info={`Follows ${followed}`}
                                  title={`Follows ${followed}`}
                                >
                                  ↳
                                </span>
                              )}
                              <span className={classes.blockName} data-testid="arranger-block-name">
                                {object.name}
                              </span>
                              {dataName !== undefined && (
                                <span className={classes.dataName} data-testid="arranger-data-name">
                                  {dataName}
                                </span>
                              )}
                            </span>
                            {share !== undefined && (
                              <span
                                className={classes.shares}
                                data-testid="arranger-shares"
                                data-info={shareText}
                                title={shareText}
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  aria-hidden
                                >
                                  <path d="M6.5 9.5 9.5 6.5M7 4.5 8 3.5a3 3 0 0 1 4.2 4.2L11 8.8M9 11.5 8 12.5a3 3 0 0 1-4.2-4.2L5 7.2" />
                                </svg>
                                <span>{share.count}</span>
                              </span>
                            )}
                          </div>
                          {path !== undefined && (
                            <svg
                              className={`${classes.preview} ${object.muted ? classes.previewMuted : ''}`}
                              data-testid="arranger-preview"
                              aria-hidden
                              width={quartersToPx(item.duration)}
                              height="100%"
                              style={
                                drag && drag.id === item.key && drag.kind === 'resize-left' && live
                                  ? {
                                      left: quartersToPx(item.relative) - quartersToPx(live.start),
                                    }
                                  : undefined
                              }
                              viewBox={`0 0 ${quartersToPx(item.duration)} ${PREVIEW_HEIGHT}`}
                              preserveAspectRatio="none"
                            >
                              <path d={path} />
                            </svg>
                          )}
                          {sharersOfSelected.has(object.id) && (
                            <span
                              className={classes.sharedMarker}
                              data-testid="arranger-shared-marker"
                              aria-hidden
                            />
                          )}
                          {childTicks(links, object.id, startPx, geometry.width).map((tick) => (
                            <span
                              key={tick.childId}
                              className={classes.childTick}
                              data-testid="arranger-child-tick"
                              data-info={`Child starts here: ${tick.childName}`}
                              title={`Child starts here: ${tick.childName}`}
                              // The block's 1 px border puts its absolute children 1 px right of the
                              // block's outer left edge: pull the tick back so its line sits on the
                              // child's first pixel column, where the dashed line also lands.
                              style={{ left: tick.x - 1 }}
                            />
                          ))}
                          {!leftTouched.has(object.id) && (
                            <span
                              className={`${classes.edge} ${classes.edgeLeft} ${
                                looping ? classes.edgeFull : ''
                              }`}
                              data-edge="left"
                              data-info={edgeInfo}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                begin(event, object.id, item, 'resize-left');
                              }}
                            />
                          )}
                          {!rightTouched.has(object.id) && (
                            <span
                              className={`${classes.edge} ${classes.edgeRight} ${
                                looping ? classes.edgeFull : ''
                              }`}
                              data-edge="right"
                              data-info={edgeInfo}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                begin(event, object.id, item, 'resize');
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                    {touching.map((pair) => {
                      const left = lane.objects.find((object) => object.id === pair.leftId);
                      const right = lane.objects.find((object) => object.id === pair.rightId);
                      const rightItem = placed.get(pair.rightId);
                      if (!left || !right || !rightItem) {
                        return null;
                      }
                      const at = geometryOf(rightItem).left;
                      return (
                        <span
                          key={`${pair.leftId}|${pair.rightId}`}
                          className={classes.sharedEdge}
                          data-shared-edge={`${pair.leftId}|${pair.rightId}`}
                          data-info="Drag to move the edge between these two blocks. Hold Shift to turn snapping off."
                          style={{
                            left: `calc(${at}px - 0.325rem)`,
                            top: subTop(left.subLane),
                            height: subHeight,
                          }}
                          onPointerDown={(event) =>
                            beginShared(
                              event,
                              pair.leftId,
                              pair.rightId,
                              left.start,
                              right.end,
                              left.end
                            )
                          }
                          onPointerMove={moveShared}
                          onPointerUp={endShared}
                          onPointerCancel={() => setShared(null)}
                        />
                      );
                    })}
                    {targetLane === lane.id && drag && targetLane !== laneOf.get(drag.id) && (
                      <span
                        className={classes.laneTarget}
                        data-testid="arranger-target-lane"
                        aria-hidden
                      />
                    )}
                    {landing && landing.laneId === lane.id && (
                      <span
                        className={classes.landing}
                        data-testid="arranger-landing"
                        aria-hidden
                        style={{
                          left: landing.left,
                          width: landing.width,
                          top: subTop(0),
                          height: subHeight,
                        }}
                      />
                    )}
                  </div>
                  <span
                    className={classes.rowGrip}
                    data-testid="arranger-row-grip"
                    data-info="Drag to change the height of this track."
                    onPointerDown={(event) => beginRow(event, lane.id, lane.subLanes)}
                    onPointerMove={moveRow}
                    onPointerUp={endRow}
                    onPointerCancel={() => setRowDrag(null)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              );
            })}
            {connectors.length > 0 && (
              <svg
                className={classes.relations}
                data-testid="arranger-relations"
                aria-hidden
                style={{ left: `${NAME_REM}rem`, width: lanePx }}
              >
                {connectors.map((connector) => (
                  <path key={connector.key} d={connector.d} data-connector={connector.key} />
                ))}
              </svg>
            )}
            <ArrangerPlayhead sceneId={scene.id} tempo={settings.transport.tempo} />
          </div>
        )}
      </div>
      <Menu
        opened={menu !== null && menuObject !== undefined}
        onClose={() => setMenu(null)}
        position="bottom-start"
        withinPortal
        transitionProps={{ duration: 0 }}
      >
        <Menu.Target>
          <span
            className={classes.menuAnchor}
            aria-hidden
            style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item disabled={!writable} onClick={() => menu && duplicate(menu.id, false)}>
            Duplicate Object
          </Menu.Item>
          <Menu.Item disabled={!writable} onClick={() => menu && duplicate(menu.id, true)}>
            Duplicate Linked
          </Menu.Item>
          <Menu.Item
            disabled={!writable}
            onClick={() => {
              if (menu) {
                const { id } = menu;
                const mute = menuObject?.mute ?? false;
                report(editor.commit((list) => setMute(list, id, !mute)));
              }
            }}
          >
            {menuObject?.mute ? 'Unmute' : 'Mute'}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            disabled={!writable}
            onClick={() => menu && report(editor.remove(menu.id))}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </section>
  );
}

/**
 * A line over the rows at the scene's play position, driven by the audio clock of the scene's play
 * session (source id = the scene's block id, started from either Play button). It moves by `transform` from a frame loop that touches only this element,
 * so it costs no layout and re-renders nothing.
 */
function ArrangerPlayhead({ sceneId, tempo }: { sceneId: string; tempo: number }) {
  const engine = useAudioEngine();
  const subscribe = useCallback((listener: () => void) => engine.subscribe(listener), [engine]);
  const startedAt = useSyncExternalStore(subscribe, () => engine.clock?.(sceneId)?.startedAtMs);
  const ref = useRef<HTMLSpanElement>(null);
  // The tempo the scheduled audio was started with: read once when playback starts, so a tempo change
  // mid-play cannot move the line away from the audio.
  const tempoRef = useRef(tempo);
  useEffect(() => {
    tempoRef.current = tempo;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element || startedAt === undefined) {
      return undefined;
    }
    const fixedTempo = tempoRef.current;
    let frame = requestAnimationFrame(function tick(time) {
      const quarters = playheadQuarters(time, startedAt, fixedTempo);
      if (quarters === null) {
        element.style.visibility = 'hidden';
      } else {
        element.style.visibility = 'visible';
        element.style.transform = `translateX(${quarters * PIXELS_PER_QUARTER}px)`;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      element.style.visibility = 'hidden';
    };
  }, [startedAt]);
  return (
    <span ref={ref} data-testid="arranger-playhead" className={classes.playhead} aria-hidden />
  );
}

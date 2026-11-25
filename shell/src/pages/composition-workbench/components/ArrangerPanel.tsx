import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { Button, Text } from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { useCompositionSettings } from '../compositionSettings';
import { EnsureDataBlockOps } from '../dataBlockOps';
import { rationalToNumber, type Rational } from '../musicalTime';
import {
  PIXELS_PER_QUARTER,
  beatStep,
  cutExtent,
  dragCancel,
  dragLive,
  dragMove,
  dragRelease,
  dragStart,
  playheadQuarters,
  quartersToPx,
  rulerMarks,
  sceneLengthQuarters,
  type DragKind,
  type DragState,
} from '../scene/arrangerGeometry';
import {
  PREVIEW_HEIGHT,
  groupEventsByStrip,
  previewRects,
  rectsToPath,
  toPreviewNotes,
} from '../scene/arrangerPreview';
import { setTimeSpan } from '../scene/sceneOps';
import { ROW_HEIGHT_MAX_REM, ROW_HEIGHT_MIN_REM, rowHeightRem } from '../scene/sceneSession';
import {
  chainPlacement,
  objectDataOf,
  stripChain,
  stripKey,
  type ObjectMapping,
  type PlacedStrip,
} from '../scene/sceneTypes';
import { useSceneEvaluation, useScenePlayback } from '../scene/useScenePlayback';
import { useSceneEditor } from './ScenePanels';
import classes from './ArrangerPanel.module.css';

/**
 * The Arranger (workbench O2b, a thin slice): one row per Outliner row, in the Outliner's order, with
 * an object drawn as a block from its WORLD start for its duration. It follows Bitwig's Arranger
 * Timeline for dragging and snapping (drag to move, drag the right edge to resize, snap to the beat
 * grid, Shift turns snapping off). It reads and writes through the same editor as the Outliner and
 * Properties (`useSceneEditor`): a drag shows from local state and is ONE `setTimeSpan` commit on release.
 */

/** The name column's width in rem (the CSS uses the same). */
const NAME_REM = 8;

/** One strip's placement: world start and duration, plus the strips from itself up its parents. */
interface PlacedRowStrip {
  key: string;
  objectId: string;
  stripId: string;
  world: Rational;
  relative: Rational;
  duration: Rational;
  offset: Rational;
  mapping: ObjectMapping;
  chain: PlacedStrip[];
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
  // A row-height drag in progress (local until release, then kept in the viewer's session).
  const [rowDrag, setRowDrag] = useState<{
    id: string;
    startY: number;
    startRem: number;
    rem: number;
  } | null>(null);

  const evaluation = useSceneEvaluation(blocks, scene?.id ?? null);
  const playback = useScenePlayback(scene?.id ?? null, evaluation);
  const planQuarters = evaluation ? rationalToNumber(evaluation.plan.duration.quarterNotes) : 0;

  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const step = beatStep(meter);

  /** Each object row's strips, in the object's order. */
  const placed = useMemo(() => {
    const out = new Map<string, PlacedRowStrip[]>();
    for (const row of rows) {
      const data = row.kind === 'object' ? objectDataOf(byId.get(row.id)) : null;
      if (!data) {
        continue;
      }
      const list: PlacedRowStrip[] = [];
      for (const strip of data.strips) {
        const chain = stripChain(byId, row.id, strip.id);
        if (chain === null || chain.length === 0) {
          continue;
        }
        list.push({
          key: stripKey(row.id, strip.id),
          objectId: row.id,
          stripId: strip.id,
          world: chainPlacement(chain).start,
          relative: strip.start,
          duration: strip.duration,
          offset: strip.contentOffset,
          mapping: strip.mapping,
          chain,
        });
      }
      out.set(row.id, list);
    }
    return out;
  }, [rows, byId]);

  /**
   * Each strip's note preview as one SVG path, from the committed placement. It depends on the
   * evaluation and the placement only (a live drag is local state), so dragging never recomputes it.
   */
  const previews = useMemo(() => {
    const out = new Map<string, string>();
    if (!evaluation) {
      return out;
    }
    const groups = groupEventsByStrip(evaluation.plan.events);
    for (const list of placed.values()) {
      for (const item of list) {
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
    }
    return out;
  }, [evaluation, placed]);

  // The live result of the drag in progress (local state only: nothing is written until release).
  const live = drag ? dragLive(drag, meter) : null;

  /**
   * A strip's block: its world start, full width and the part the evaluator plays. While a drag is live,
   * the chain is re-placed with the dragged strip's live span, so a moved parent carries its children
   * and the cut at the parent's end follows both, from local state only.
   */
  function geometryOf(item: PlacedRowStrip) {
    const chain =
      drag && live && item.chain.some((link) => stripKey(link.objectId, link.strip.id) === drag.id)
        ? item.chain.map((link) =>
            stripKey(link.objectId, link.strip.id) === drag.id
              ? { ...link, strip: { ...link.strip, start: live.start, duration: live.duration } }
              : link
          )
        : item.chain;
    const { start, bound } = chainPlacement(chain);
    const { duration } = chain[0].strip;
    const { visible } = cutExtent(start, duration, bound);
    return {
      left: quartersToPx(start),
      width: quartersToPx(duration),
      visible: quartersToPx(visible),
    };
  }

  let liveEnd = 0;
  for (const list of placed.values()) {
    for (const item of list) {
      const g = geometryOf(item);
      liveEnd = Math.max(liveEnd, g.left + g.width);
    }
  }
  const lengthQuarters = sceneLengthQuarters(planQuarters, meter);
  const lanePx = Math.max(lengthQuarters * PIXELS_PER_QUARTER, liveEnd + 4 * quartersToPx(step));
  const marks = useMemo(() => rulerMarks(meter, lanePx / PIXELS_PER_QUARTER), [meter, lanePx]);

  function begin(
    event: PointerEvent<HTMLElement>,
    rowId: string,
    item: PlacedRowStrip,
    kind: DragKind
  ) {
    if (event.button !== 0) {
      return;
    }
    updateSession({ selectedId: rowId });
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
        event.shiftKey
      )
    );
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (drag) {
      setDrag(dragMove(drag, event.clientX, event.shiftKey));
    }
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (!drag) {
      return;
    }
    const commit = dragRelease(drag, event.clientX, event.shiftKey, meter);
    const { id, kind } = drag;
    setDrag(dragCancel());
    const target = [...placed.values()].flat().find((item) => item.key === id);
    if (commit === null || !target) {
      return;
    }
    const { objectId, stripId } = target;
    if (kind === 'move') {
      editor.commit((list) => setTimeSpan(list, objectId, stripId, { start: commit.start }));
    } else if (kind === 'resize-left') {
      editor.commit((list) =>
        setTimeSpan(list, objectId, stripId, {
          start: commit.start,
          duration: commit.duration,
          contentOffset: commit.contentOffset,
        })
      );
    } else {
      editor.commit((list) => setTimeSpan(list, objectId, stripId, { duration: commit.duration }));
    }
  }

  const remPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  function beginRow(event: PointerEvent<HTMLElement>, rowId: string) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startRem = rowHeightRem(session, rowId);
    setRowDrag({ id: rowId, startY: event.clientY, startRem, rem: startRem });
  }

  function moveRow(event: PointerEvent<HTMLElement>) {
    if (rowDrag) {
      const rem = rowDrag.startRem + (event.clientY - rowDrag.startY) / remPx();
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

  return (
    <section className={classes.panel} aria-label="Arranger">
      <div className={classes.bar}>
        <Button
          className={classes.play}
          size="compact-xs"
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
      </div>
      <div className={classes.scroller} role="grid" aria-label="Scene timeline">
        {scene === null ? (
          <Text className={classes.empty}>Choose a scene in the Outliner.</Text>
        ) : rows.length === 0 ? (
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
            {rows.map((row) => {
              const items = placed.get(row.id) ?? [];
              const selected = row.id === session.selectedId;
              const heightRem =
                rowDrag && rowDrag.id === row.id ? rowDrag.rem : rowHeightRem(session, row.id);
              return (
                <div
                  key={row.id}
                  className={`${classes.row} ${row.muted ? classes.rowMuted : ''} ${
                    row.kind === 'collection' ? classes.rowCollection : ''
                  }`}
                  role="row"
                  aria-level={row.depth + 1}
                  aria-selected={selected}
                  style={{ height: `${heightRem}rem` }}
                  onClick={() => updateSession({ selectedId: row.id })}
                >
                  <div
                    className={classes.name}
                    role="rowheader"
                    style={{ paddingLeft: `${0.25 + row.depth * 1}rem` }}
                  >
                    {row.name}
                  </div>
                  <div className={classes.lane} style={{ width: lanePx }} role="gridcell">
                    {items.map((item, index) => {
                      const geometry = geometryOf(item);
                      const looping = item.mapping === 'loop';
                      const edgeInfo = looping
                        ? 'Drag to extend the loop. Hold Shift to turn snapping off.'
                        : 'Drag to change the length. Hold Shift to turn snapping off.';
                      const path = previews.get(item.key);
                      return (
                        <div
                          key={item.key}
                          className={`${classes.block} ${selected ? classes.blockSelected : ''} ${
                            row.muted ? classes.blockMuted : ''
                          }`}
                          role="button"
                          aria-label={
                            items.length === 1
                              ? `Block ${row.name}`
                              : `Block ${row.name} (strip ${index + 1})`
                          }
                          aria-pressed={selected}
                          data-muted={row.muted}
                          data-info="Drag to move. Drag an edge to change the length. Hold Shift to turn snapping off."
                          style={{ left: geometry.left, width: geometry.width }}
                          onPointerDown={(event) => begin(event, row.id, item, 'move')}
                          onPointerMove={move}
                          onPointerUp={end}
                          onPointerCancel={() => setDrag(dragCancel())}
                        >
                          {path !== undefined && (
                            <svg
                              className={classes.preview}
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
                          <span
                            className={classes.blockLabel}
                            style={{ maxWidth: Math.max(0, geometry.visible - 12) }}
                          >
                            {row.name}
                          </span>
                          <span
                            className={classes.cut}
                            data-cut={geometry.visible < geometry.width}
                            data-info="Cut at the end of its parent"
                            title="Cut at the end of its parent"
                            style={{ left: geometry.visible }}
                          />
                          <span
                            className={`${classes.edge} ${classes.edgeLeft} ${
                              looping ? classes.edgeFull : ''
                            }`}
                            data-edge="left"
                            data-info={edgeInfo}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              begin(event, row.id, item, 'resize-left');
                            }}
                          />
                          <span
                            className={`${classes.edge} ${classes.edgeRight} ${
                              looping ? classes.edgeFull : ''
                            }`}
                            data-edge="right"
                            data-info={edgeInfo}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              begin(event, row.id, item, 'resize');
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <span
                    className={classes.rowGrip}
                    data-testid="arranger-row-grip"
                    data-info="Drag to change the height of this row."
                    onPointerDown={(event) => beginRow(event, row.id)}
                    onPointerMove={moveRow}
                    onPointerUp={endRow}
                    onPointerCancel={() => setRowDrag(null)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              );
            })}
            <ArrangerPlayhead sceneId={scene.id} tempo={settings.transport.tempo} />
          </div>
        )}
      </div>
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

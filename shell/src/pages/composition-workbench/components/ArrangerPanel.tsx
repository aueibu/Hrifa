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
import { setTimeSpan } from '../scene/sceneOps';
import { chainPlacement, objectChain, type ObjectData } from '../scene/sceneTypes';
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

  const evaluation = useSceneEvaluation(blocks, scene?.id ?? null);
  const playback = useScenePlayback(scene?.id ?? null, evaluation);
  const planQuarters = evaluation ? rationalToNumber(evaluation.plan.duration.quarterNotes) : 0;

  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const step = beatStep(meter);

  /** Each object row's placement: world start and duration, plus the ids from itself up its parents. */
  const placed = useMemo(() => {
    const out = new Map<
      string,
      {
        world: Rational;
        relative: Rational;
        duration: Rational;
        chain: { id: string; data: ObjectData }[];
      }
    >();
    for (const row of rows) {
      if (row.kind !== 'object') {
        continue;
      }
      const chain = objectChain(byId, row.id);
      if (chain === null || chain.length === 0) {
        continue;
      }
      out.set(row.id, {
        world: chainPlacement(chain).start,
        relative: chain[0].data.timeSpan.start,
        duration: chain[0].data.timeSpan.duration,
        chain,
      });
    }
    return out;
  }, [rows, byId]);

  // The live result of the drag in progress (local state only: nothing is written until release).
  const live = drag ? dragLive(drag, meter) : null;

  /**
   * A row's block: its world start, full width and the part the evaluator plays. While a drag is live,
   * the chain is re-placed with the dragged object's live span, so a moved parent carries its children
   * and the cut at the parent's end follows both, from local state only.
   */
  function geometryOf(rowId: string) {
    const item = placed.get(rowId);
    if (!item) {
      return null;
    }
    const chain =
      drag && live && item.chain.some((link) => link.id === drag.id)
        ? item.chain.map((link) =>
            link.id === drag.id
              ? {
                  ...link,
                  data: { ...link.data, timeSpan: { start: live.start, duration: live.duration } },
                }
              : link
          )
        : item.chain;
    const { start, bound } = chainPlacement(chain);
    const { duration } = chain[0].data.timeSpan;
    const { visible } = cutExtent(start, duration, bound);
    return {
      left: quartersToPx(start),
      width: quartersToPx(duration),
      visible: quartersToPx(visible),
    };
  }

  let liveEnd = 0;
  for (const row of rows) {
    const g = geometryOf(row.id);
    if (g) {
      liveEnd = Math.max(liveEnd, g.left + g.width);
    }
  }
  const lengthQuarters = sceneLengthQuarters(planQuarters, meter);
  const lanePx = Math.max(lengthQuarters * PIXELS_PER_QUARTER, liveEnd + 4 * quartersToPx(step));
  const marks = useMemo(() => rulerMarks(meter, lanePx / PIXELS_PER_QUARTER), [meter, lanePx]);

  function begin(event: PointerEvent<HTMLElement>, rowId: string, kind: DragKind) {
    if (event.button !== 0) {
      return;
    }
    updateSession({ selectedId: rowId });
    const item = placed.get(rowId);
    if (!item || !writable) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag(
      dragStart(
        rowId,
        kind,
        { worldStart: item.world, relativeStart: item.relative, duration: item.duration },
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
    if (commit === null) {
      return;
    }
    if (kind === 'move') {
      editor.commit((list) => setTimeSpan(list, id, { start: commit.start }));
    } else {
      editor.commit((list) => setTimeSpan(list, id, { duration: commit.duration }));
    }
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
              const geometry = geometryOf(row.id);
              const selected = row.id === session.selectedId;
              return (
                <div
                  key={row.id}
                  className={`${classes.row} ${row.muted ? classes.rowMuted : ''} ${
                    row.kind === 'collection' ? classes.rowCollection : ''
                  }`}
                  role="row"
                  aria-level={row.depth + 1}
                  aria-selected={selected}
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
                    {geometry && (
                      <div
                        className={`${classes.block} ${selected ? classes.blockSelected : ''} ${
                          row.muted ? classes.blockMuted : ''
                        }`}
                        role="button"
                        aria-label={`Block ${row.name}`}
                        aria-pressed={selected}
                        data-muted={row.muted}
                        data-info="Drag to move. Drag the right edge to change the length. Hold Shift to turn snapping off."
                        style={{ left: geometry.left, width: geometry.width }}
                        onPointerDown={(event) => begin(event, row.id, 'move')}
                        onPointerMove={move}
                        onPointerUp={end}
                        onPointerCancel={() => setDrag(dragCancel())}
                      >
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
                          className={classes.handle}
                          data-info="Drag to change the length. Hold Shift to turn snapping off."
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            begin(event, row.id, 'resize');
                          }}
                        />
                      </div>
                    )}
                  </div>
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

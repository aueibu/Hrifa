import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Button, Group, Switch, Text } from "@mantine/core";
import type { PianoRollGridLine, PianoRollNote, PianoRollViewState } from "./model";
import classes from "./PianoRoll.module.css";

const KEYBOARD_WIDTH = 4.5 * 16;
const RULER_HEIGHT = 2 * 16;
const MIN_TIME_ZOOM = 16;
const MAX_TIME_ZOOM = 192;
const MIN_PITCH_ZOOM = 12;
const MAX_PITCH_ZOOM = 36;

export interface PianoRollProps {
  notes: PianoRollNote[];
  duration: number;
  gridLines: PianoRollGridLine[];
  view: PianoRollViewState;
  onViewChange(view: PianoRollViewState): void;
  playhead?: number;
  isPlaying?: boolean;
  height?: number;
  ariaLabel?: string;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function midiPitchLabel(midi: number) {
  const pitchClasses = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${pitchClasses[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function adaptiveSubdivision(pixelsPerQuarter: number) {
  if (pixelsPerQuarter >= 112) {
    return 0.25;
  }
  if (pixelsPerQuarter >= 56) {
    return 0.5;
  }
  return 1;
}

export function PianoRoll({
  notes,
  duration,
  gridLines,
  view,
  onViewChange,
  playhead,
  isPlaying = false,
  height = 440,
  ariaLabel = "Piano roll",
}: PianoRollProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height });
  const safeDuration = Math.max(1, duration);
  const timelineWidth = Math.max(1, safeDuration * view.pixelsPerQuarter);
  const pitchHeight = 128 * view.pixelsPerSemitone;
  const playheadX = playhead === undefined ? undefined : playhead * view.pixelsPerQuarter;
  const grid = useMemo(() => {
    const explicit = new Map(
      gridLines.map((line) => [Math.round(line.at * 1_000_000), line] as const),
    );
    const subdivision = adaptiveSubdivision(view.pixelsPerQuarter);
    const result: Array<PianoRollGridLine & { subdivision: boolean }> = [];
    for (let at = 0; at <= safeDuration + subdivision / 2; at += subdivision) {
      const exact = explicit.get(Math.round(at * 1_000_000));
      result.push(
        exact ? { ...exact, subdivision: false } : { at, kind: "beat", subdivision: true },
      );
    }
    gridLines.forEach((line) => {
      if (!result.some((candidate) => Math.abs(candidate.at - line.at) < 0.000001)) {
        result.push({ ...line, subdivision: false });
      }
    });
    return result.sort((left, right) => left.at - right.at);
  }, [gridLines, safeDuration, view.pixelsPerQuarter]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    if (Math.abs(element.scrollLeft - view.scrollLeft) > 1) {
      element.scrollLeft = view.scrollLeft;
    }
    if (Math.abs(element.scrollTop - view.scrollTop) > 1) {
      element.scrollTop = view.scrollTop;
    }
  }, [view.scrollLeft, view.scrollTop, view.pixelsPerQuarter, view.pixelsPerSemitone]);

  function changeView(patch: Partial<PianoRollViewState>) {
    onViewChange({ ...view, ...patch });
  }

  function fitNotes() {
    if (!notes.length || !viewport.width || !viewport.height) {
      return;
    }
    const pitches = notes.map((note) => note.pitchMidicents / 100);
    const lowest = Math.min(...pitches);
    const highest = Math.max(...pitches);
    const pitchSpan = Math.max(5, highest - lowest + 3);
    const pixelsPerSemitone = clamp(
      (viewport.height - RULER_HEIGHT - 16) / pitchSpan,
      MIN_PITCH_ZOOM,
      MAX_PITCH_ZOOM,
    );
    const pixelsPerQuarter = clamp(
      (viewport.width - KEYBOARD_WIDTH - 24) / safeDuration,
      MIN_TIME_ZOOM,
      MAX_TIME_ZOOM,
    );
    const scrollTop = clamp(
      (127 - highest - 1.5) * pixelsPerSemitone,
      0,
      128 * pixelsPerSemitone - viewport.height + RULER_HEIGHT,
    );
    changeView({
      pixelsPerQuarter,
      pixelsPerSemitone,
      scrollLeft: 0,
      scrollTop,
      framed: true,
    });
  }

  useEffect(() => {
    if (!view.framed && notes.length && viewport.width) {
      fitNotes();
    }
  });

  function centerPlayhead() {
    if (playheadX === undefined) {
      return;
    }
    changeView({
      scrollLeft: clamp(
        playheadX - (viewport.width - KEYBOARD_WIDTH) / 2,
        0,
        timelineWidth - viewport.width + KEYBOARD_WIDTH,
      ),
    });
  }

  useEffect(() => {
    const element = scroller.current;
    if (!element || !view.followPlayback || playheadX === undefined) {
      return;
    }
    const visibleStart = element.scrollLeft;
    const visibleEnd = visibleStart + element.clientWidth - KEYBOARD_WIDTH;
    if (playheadX < visibleStart || playheadX > visibleEnd - 24) {
      changeView({ scrollLeft: clamp(playheadX, 0, timelineWidth) });
    }
  }, [playheadX, timelineWidth, view.followPlayback]);

  function zoomTime(factor: number) {
    const element = scroller.current;
    const visibleCenter =
      (element?.scrollLeft ?? view.scrollLeft) +
      Math.max(0, (element?.clientWidth ?? viewport.width) - KEYBOARD_WIDTH) / 2;
    const musicalCenter = visibleCenter / view.pixelsPerQuarter;
    const pixelsPerQuarter = clamp(view.pixelsPerQuarter * factor, MIN_TIME_ZOOM, MAX_TIME_ZOOM);
    changeView({
      pixelsPerQuarter,
      scrollLeft: Math.max(
        0,
        musicalCenter * pixelsPerQuarter -
          Math.max(0, (element?.clientWidth ?? viewport.width) - KEYBOARD_WIDTH) / 2,
      ),
      framed: true,
    });
  }

  function zoomPitch(factor: number) {
    const element = scroller.current;
    const visibleCenter =
      (element?.scrollTop ?? view.scrollTop) +
      Math.max(0, (element?.clientHeight ?? viewport.height) - RULER_HEIGHT) / 2;
    const pitchAtCenter = 127 - visibleCenter / view.pixelsPerSemitone;
    const pixelsPerSemitone = clamp(
      view.pixelsPerSemitone * factor,
      MIN_PITCH_ZOOM,
      MAX_PITCH_ZOOM,
    );
    changeView({
      pixelsPerSemitone,
      scrollTop: Math.max(
        0,
        (127 - pitchAtCenter) * pixelsPerSemitone -
          Math.max(0, (element?.clientHeight ?? viewport.height) - RULER_HEIGHT) / 2,
      ),
      framed: true,
    });
  }

  return (
    <div className={classes.root} aria-label={ariaLabel}>
      <Group justify="space-between" gap="xs" className={classes.toolbar}>
        <Group gap={4} wrap="nowrap">
          <Button size="compact-xs" variant="default" onClick={fitNotes}>
            Fit notes
          </Button>
          <ActionIcon
            size="sm"
            variant="default"
            aria-label="Zoom out in time"
            onClick={() => zoomTime(0.8)}
          >
            −
          </ActionIcon>
          <Text size="xs" ff="monospace" className={classes.zoomReadout}>
            Time
          </Text>
          <ActionIcon
            size="sm"
            variant="default"
            aria-label="Zoom in in time"
            onClick={() => zoomTime(1.25)}
          >
            +
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="default"
            aria-label="Zoom out in pitch"
            onClick={() => zoomPitch(0.8)}
          >
            −
          </ActionIcon>
          <Text size="xs" ff="monospace" className={classes.zoomReadout}>
            Pitch
          </Text>
          <ActionIcon
            size="sm"
            variant="default"
            aria-label="Zoom in in pitch"
            onClick={() => zoomPitch(1.25)}
          >
            +
          </ActionIcon>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="compact-xs"
            variant="subtle"
            disabled={playhead === undefined}
            onClick={centerPlayhead}
          >
            Center playhead
          </Button>
          <Switch
            size="xs"
            label="Follow playback"
            checked={view.followPlayback}
            onChange={(event) => changeView({ followPlayback: event.currentTarget.checked })}
          />
        </Group>
      </Group>

      <div
        ref={scroller}
        className={classes.scroller}
        style={{ height }}
        onScroll={(event) => {
          const { scrollLeft, scrollTop } = event.currentTarget;
          if (
            Math.abs(scrollLeft - view.scrollLeft) > 1 ||
            Math.abs(scrollTop - view.scrollTop) > 1
          ) {
            changeView({ scrollLeft, scrollTop, framed: true });
          }
        }}
      >
        <div
          className={classes.content}
          style={{
            gridTemplateColumns: `${KEYBOARD_WIDTH}px ${timelineWidth}px`,
            gridTemplateRows: `${RULER_HEIGHT}px ${pitchHeight}px`,
          }}
        >
          <div className={classes.corner} aria-hidden="true" />
          <div className={classes.ruler} aria-hidden="true">
            {grid
              .filter((line) => line.kind === "bar")
              .map((line) => (
                <span key={`ruler:${line.at}`} style={{ left: line.at * view.pixelsPerQuarter }}>
                  {line.label}
                </span>
              ))}
          </div>
          <div className={classes.keyboard} aria-hidden="true">
            {Array.from({ length: 128 }, (_, index) => 127 - index).map((midi) => {
              const pitchClass = midi % 12;
              const black = [1, 3, 6, 8, 10].includes(pitchClass);
              return (
                <div
                  key={`key:${midi}`}
                  className={classes.key}
                  data-black={black || undefined}
                  data-c={pitchClass === 0 || undefined}
                  style={{
                    height: view.pixelsPerSemitone,
                    top: (127 - midi) * view.pixelsPerSemitone,
                  }}
                >
                  {pitchClass === 0 ? midiPitchLabel(midi) : ""}
                </div>
              );
            })}
          </div>
          <div
            className={classes.roll}
            role="img"
            aria-label={`${ariaLabel}; ${notes.length} notes`}
          >
            {Array.from({ length: 129 }, (_, index) => (
              <span
                key={`pitch-line:${index}`}
                className={classes.pitchLine}
                data-c={index < 128 && (127 - index) % 12 === 0 ? true : undefined}
                style={{ top: index * view.pixelsPerSemitone }}
              />
            ))}
            {grid.map((line) => (
              <span
                key={`grid:${line.at}:${line.kind}`}
                className={classes.timeLine}
                data-kind={line.kind}
                data-subdivision={line.subdivision || undefined}
                style={{ left: line.at * view.pixelsPerQuarter }}
              />
            ))}
            {notes.map((note) => {
              const pitch = note.pitchMidicents / 100;
              const noteHeight = Math.max(5, view.pixelsPerSemitone * 0.72);
              const noteWidth = Math.max(3, note.duration * view.pixelsPerQuarter);
              const active =
                isPlaying &&
                playhead !== undefined &&
                playhead >= note.start &&
                playhead < note.start + note.duration;
              return (
                <span
                  key={note.id}
                  className={classes.note}
                  data-active={active || undefined}
                  title={`${note.label} · ${note.start.toFixed(3)} qn · ${note.duration.toFixed(3)} qn`}
                  style={{
                    height: noteHeight,
                    left: note.start * view.pixelsPerQuarter,
                    opacity: 0.62 + Math.min(1, Math.max(0, note.velocity ?? 1)) * 0.38,
                    top:
                      (127 - pitch) * view.pixelsPerSemitone +
                      (view.pixelsPerSemitone - noteHeight) / 2,
                    width: noteWidth,
                  }}
                >
                  {noteWidth > 34 ? note.label : ""}
                </span>
              );
            })}
            {playheadX !== undefined && (
              <span className={classes.playhead} style={{ left: playheadX }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

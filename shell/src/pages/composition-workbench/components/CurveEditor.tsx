import { useRef } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { clampCurve, curveShape, curveShapes, smoothCurve, type CurveShape } from '../mist';
import classes from './SwirlingMists.module.css';

const viewWidth = 640;
const viewHeight = 240;
const padX = 24;
const padY = 16;
const innerWidth = viewWidth - 2 * padX;
const innerHeight = viewHeight - 2 * padY;

const xOf = (index: number, count: number) => padX + (index / count) * innerWidth;
const yOf = (value: number) => padY + ((1 - value) / 2) * innerHeight;

interface CurveEditorProps {
  /** One loop of values in [-1, 1]; the last leads back into the first. */
  points: number[];
  onChange(points: number[]): void;
}

/**
 * Draws a waveform by dragging across it. Each column holds one value, and a fast drag fills the
 * columns it skips with a straight line so strokes stay continuous. The dashed segment on the right
 * is the seam: the last point leading back into the first when the loop repeats.
 */
export function CurveEditor({ points, onChange }: CurveEditorProps) {
  const count = points.length;
  const latest = useRef(points);
  latest.current = points;
  const last = useRef<{ index: number; value: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function locate(event: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) {
      return undefined;
    }
    const box = svg.getBoundingClientRect();
    const viewX = ((event.clientX - box.left) / box.width) * viewWidth;
    const viewY = ((event.clientY - box.top) / box.height) * viewHeight;
    const index = Math.min(count - 1, Math.max(0, Math.floor(((viewX - padX) / innerWidth) * count)));
    const value = clampCurve(1 - 2 * ((viewY - padY) / innerHeight));
    return { index, value };
  }

  function paint(event: React.PointerEvent) {
    const spot = locate(event);
    if (!spot) {
      return;
    }
    const next = [...latest.current];
    const from = last.current ?? spot;
    const step = spot.index >= from.index ? 1 : -1;
    for (let i = from.index; i !== spot.index + step; i += step) {
      const along = spot.index === from.index ? 1 : (i - from.index) / (spot.index - from.index);
      next[i] = from.value + (spot.value - from.value) * along;
    }
    last.current = spot;
    latest.current = next;
    onChange(next);
  }

  const polyline = points.map((value, i) => `${xOf(i, count)},${yOf(value)}`).join(' ');

  return (
    <div>
      <div className={classes.curveBox}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label="Drag across this plot to draw one loop of the waveform"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            last.current = null;
            paint(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) {
              paint(event);
            }
          }}
          onPointerUp={() => {
            last.current = null;
          }}
        >
          {[1, 0.5, -0.5, -1].map((level) => (
            <line
              key={level}
              x1={padX}
              x2={padX + innerWidth}
              y1={yOf(level)}
              y2={yOf(level)}
              className={classes.curveGrid}
            />
          ))}
          <line x1={padX} x2={padX + innerWidth} y1={yOf(0)} y2={yOf(0)} className={classes.curveZero} />
          <polyline points={polyline} className={classes.curveLine} />
          <line
            x1={xOf(count - 1, count)}
            y1={yOf(points[count - 1])}
            x2={xOf(count, count)}
            y2={yOf(points[0])}
            className={classes.curveSeam}
          />
          {count <= 96 &&
            points.map((value, i) => (
              <circle key={i} cx={xOf(i, count)} cy={yOf(value)} r={2.5} className={classes.curveDot} />
            ))}
        </svg>
      </div>
      <Group gap="xs" mt="xs">
        <Text size="xs" c="dimmed">
          Start from
        </Text>
        {curveShapes.map((shape) => (
          <Button
            key={shape.id}
            size="compact-xs"
            variant="default"
            onClick={() => onChange(curveShape(shape.id as CurveShape, count))}
          >
            {shape.label}
          </Button>
        ))}
      </Group>
      <Group gap="xs" mt="xs">
        <Text size="xs" c="dimmed">
          Reshape
        </Text>
        <Button size="compact-xs" variant="default" onClick={() => onChange(smoothCurve(points))}>
          Smooth
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          onClick={() => onChange(points.map((value) => -value))}
        >
          Invert
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          onClick={() => onChange([...points].reverse())}
        >
          Reverse
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          onClick={() => onChange([...points.slice(count / 4), ...points.slice(0, count / 4)])}
        >
          Shift ¼
        </Button>
      </Group>
    </div>
  );
}

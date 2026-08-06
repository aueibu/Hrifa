export type DiagramMarkRole = 'line' | 'arc' | 'circle' | 'point';

export interface DiagramStyle {
  marks: Record<DiagramMarkRole, string>;
    guide: {
    crosshairSize: number;
    dash: number[];
    lineWidth: number;
    markerRadius: number;
    opacity: number;
  };
  annotation: {
    background: string;
    font: string;
  };
  sourcePoint: {
    radius: number;
  };
  grid: {
    lineWidth: number;
    opacity: number;
  };
  hoverPoint: {
    radius: number;
    lineWidth: number;
  };
}

/** Shared canvas treatment. Geometry apps supply roles and coordinates, never visual values. */
export function resolveDiagramStyle(root: Element = document.documentElement): DiagramStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();

  return {
    marks: {
      line: value('--mantine-color-blue-6'),
      arc: value('--mantine-color-grape-6'),
      circle: value('--mantine-color-orange-6'),
      point: value('--mantine-color-green-6'),
    },
    guide: { crosshairSize: 5, dash: [3, 3], lineWidth: 1, markerRadius: 2, opacity: 0.35 },
    annotation: { background: value('--mantine-color-default'), font: '600 9px var(--mantine-font-family-monospace)' },
    sourcePoint: { radius: 3.2 },
    grid: { lineWidth: 0.5, opacity: 0.3 },
    hoverPoint: { radius: 7, lineWidth: 1.5 },
  };
}

function dot(point, axis) {
  return point.x * axis.x + point.y * axis.y;
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function polygonBounds(polygon) {
  return polygon.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y)
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
}

function uniqueSorted(values, epsilon = 0.001) {
  const sorted = values.slice().sort((a, b) => a - b);
  const result = [];
  sorted.forEach((value) => {
    if (!result.length || Math.abs(value - result[result.length - 1]) > epsilon) result.push(value);
  });
  return result;
}

function hatchLineSegments(polygon, axis, normal, offset) {
  const intersections = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const av = dot(a, normal) - offset;
    const bv = dot(b, normal) - offset;

    if (Math.abs(av) < 0.0001 && Math.abs(bv) < 0.0001) {
      intersections.push(dot(a, axis), dot(b, axis));
      continue;
    }
    if ((av <= 0 && bv > 0) || (av > 0 && bv <= 0)) {
      const t = av / (av - bv);
      intersections.push(dot(lerpPoint(a, b, t), axis));
    }
  }

  const coords = uniqueSorted(intersections);
  const segments = [];
  for (let i = 0; i < coords.length - 1; i += 2) {
    const a = coords[i];
    const b = coords[i + 1];
    if (Math.abs(b - a) < 0.5) continue;
    segments.push({
      start: { x: axis.x * a + normal.x * offset, y: axis.y * a + normal.y * offset },
      end: { x: axis.x * b + normal.x * offset, y: axis.y * b + normal.y * offset }
    });
  }
  return segments;
}

export function generateHatchSegments(polygon, options) {
  if (!polygon || polygon.length < 3) return [];
  const angle = (Number(options.angle) || 0) * Math.PI / 180;
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const bounds = polygonBounds(polygon);
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];
  const minOffset = Math.min(...corners.map((point) => dot(point, normal)));
  const maxOffset = Math.max(...corners.map((point) => dot(point, normal)));
  const span = maxOffset - minOffset;
  if (span <= 0.001) return [];

  const segments = [];
  if (options.lineMode === "per100") {
    const density = Math.max(0.01, Number(options.count) || 1);
    const spacing = 100 / density;
    for (let offset = minOffset + spacing * 0.5; offset < maxOffset; offset += spacing) {
      segments.push(...hatchLineSegments(polygon, axis, normal, offset));
    }
  } else {
    const count = Math.max(1, Math.round(options.count || 1));
    for (let i = 0; i < count; i += 1) {
      const offset = minOffset + span * ((i + 0.5) / count);
      segments.push(...hatchLineSegments(polygon, axis, normal, offset));
    }
  }
  return segments;
}

export function makeHatchRegion(points, options) {
  return {
    type: "hatchRegion",
    polygon: points.map((point) => ({ x: point.x, y: point.y })),
    hatch: {
      count: Math.max(1, Math.round(options.count || 1)),
      lineMode: options.lineMode === "per100" ? "per100" : "fixed",
      angle: Number(options.angle) || 0,
      width: Math.max(1, Number(options.width) || 1)
    },
    seed: Number(options.seed) || 1
  };
}

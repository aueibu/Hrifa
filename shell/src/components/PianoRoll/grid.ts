import type { PianoRollGridLine } from './model';

/** The grid subdivision (quarter notes) used when the owner sets none: finer as the zoom grows. */
export function adaptiveSubdivision(pixelsPerQuarter: number) {
  if (pixelsPerQuarter >= 112) {
    return 0.25;
  }
  if (pixelsPerQuarter >= 56) {
    return 0.5;
  }
  return 1;
}

export type PianoRollDrawnGridLine = PianoRollGridLine & { subdivision: boolean };

/**
 * Every vertical line the roll draws: the owner's bar and beat lines plus the subdivision (the
 * owner's `gridUnit` while its lines are far enough apart to read, otherwise the zoom's own),
 * out to `visibleQuarters`. The velocity lane draws the same lines from the same function.
 */
export function rollGridLines(
  gridLines: PianoRollGridLine[],
  gridUnit: number | undefined,
  visibleQuarters: number,
  pixelsPerQuarter: number
): PianoRollDrawnGridLine[] {
  const explicit = new Map(
    gridLines.map((line) => [Math.round(line.at * 1_000_000), line] as const)
  );
  const subdivision =
    gridUnit !== undefined && gridUnit * pixelsPerQuarter >= 6
      ? gridUnit
      : adaptiveSubdivision(pixelsPerQuarter);
  const result: PianoRollDrawnGridLine[] = [];
  for (let step = 0; step * subdivision <= visibleQuarters + subdivision / 2; step += 1) {
    const at = step * subdivision;
    const exact = explicit.get(Math.round(at * 1_000_000));
    result.push(exact ? { ...exact, subdivision: false } : { at, kind: 'beat', subdivision: true });
  }
  gridLines.forEach((line) => {
    if (!result.some((candidate) => Math.abs(candidate.at - line.at) < 0.000001)) {
      result.push({ ...line, subdivision: false });
    }
  });
  return result.sort((left, right) => left.at - right.at);
}

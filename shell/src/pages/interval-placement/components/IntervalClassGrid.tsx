import { Box, Stack, Text } from '@mantine/core';
import type { PlacementRecord } from '../engine';
import { intervalColor } from '../visuals';

interface IntervalClassGridProps {
  record: PlacementRecord;
  L: number;
  edoSteps: number;
  hoverCounts: Map<number, number>;
  isDark: boolean;
}

interface ChipProps {
  d: number;
  total: number;
  edoSteps: number;
  isDark: boolean;
  hoverCounts: Map<number, number>;
  center?: boolean;
}

/**
 * One interval-class cell. `full` (every occurrence of this interval touches
 * the hovered pitch) and `partial` (only some do) are distinguished the same
 * way the source app's `highlightCounts` did, via bold+solid vs dimmed —
 * and, matching that source, the hover color applies even when the hovered
 * pitch forms an interval class the current voicing doesn't otherwise
 * contain (`total === 0`): hovering an inactive keyboard key still shows
 * what it would form with the voicing.
 */
function Chip({ d, total, edoSteps, isDark, hoverCounts, center }: ChipProps) {
  const isActive = total > 0;
  const local = hoverCounts.get(d) || 0;
  const isHover = local > 0;
  const isPartial = isHover && local < total;
  const color = intervalColor(d, edoSteps, isDark);

  return (
    <Text
      size="xs"
      ff="monospace"
      ta={center ? 'center' : undefined}
      style={{
        border: `1px solid ${isActive || isHover ? color : 'var(--mantine-color-default-border)'}`,
        borderRadius: 4,
        padding: '2px 6px',
        opacity: isHover ? (isPartial ? 0.7 : 1) : isActive ? 1 : 0.35,
        color: isHover ? color : undefined,
        fontWeight: isHover && !isPartial ? 700 : undefined,
        background: isHover ? 'var(--mantine-color-default-hover)' : undefined,
        // Block, not inline — an inline span sized to its own text and then
        // centered can end up wider than its grid column once the text is
        // long enough (e.g. "141(1)"), and since it's free-floating rather
        // than clamped to the column, it overflows equally left and right
        // of center. For column 1 that means overflowing straight off the
        // card's own left edge instead of into a neighboring column. A
        // block filling the column's actual width can't do that — it wraps
        // instead.
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {d}
      {isActive ? `(${total})` : ''}
    </Text>
  );
}

/**
 * React port of `renderIntervals`: every interval class in the current
 * window, active/inactive by whether the voicing contains it, grouped into
 * columns of complementary classes (ic1/ic(N-1), ic2/ic(N-2), ...) headed by
 * the octave-reduced interval-vector count — matching the source app's
 * layout regardless of EDO. Each column is one self-contained vertical
 * stack (header glued to its own d-values), and the container wraps whole
 * columns via `auto-fill` rather than forcing all of them into one row: as
 * EDO grows and there are more interval classes, columns wrap onto
 * additional lines instead of shrinking indefinitely or needing a separate
 * flat-list fallback past some EDO cutoff — headers can't separate from
 * their data, since wrapping happens per-column, not per-cell.
 */
export function IntervalClassGrid({ record, L, edoSteps, hoverCounts, isDark }: IntervalClassGridProps) {
  if (!Number.isFinite(L) || L <= 0 || !Number.isFinite(edoSteps) || edoSteps <= 0) {
    return null;
  }
  const totals = new Map<number, number>(record.inducedCounts);

  const modulus = Math.max(1, Math.round(edoSteps));
  const maxBase = Math.floor(modulus / 2);
  const columns: number[][] = [];
  for (let base = 1; base <= maxBase; base++) {
    const comp = (modulus - base) % modulus;
    const column: number[] = [];
    for (let d = 1; d <= L; d++) {
      const mod = ((d % modulus) + modulus) % modulus;
      if (mod === base || (comp !== base && mod === comp)) {
        column.push(d);
      }
    }
    columns.push(column);
  }

  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(3.25rem, 1fr))',
        gap: 4,
      }}
    >
      {columns.map((column, base0) => {
        const base = base0 + 1;
        return (
          <Stack key={base} gap={2} align="center">
            <Text
              size="xs"
              c="dimmed"
              ta="center"
              style={{
                borderBottom: `2px solid ${intervalColor(base, edoSteps, isDark)}`,
                paddingBottom: 2,
                width: '100%',
              }}
            >
              ic{base} ({record.iv[base - 1] ?? 0})
            </Text>
            {column.map((d) => (
              <Chip
                key={d}
                d={d}
                total={totals.get(d) || 0}
                edoSteps={edoSteps}
                isDark={isDark}
                hoverCounts={hoverCounts}
                center
              />
            ))}
          </Stack>
        );
      })}
    </Box>
  );
}
